import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.settings import _load_settings
from app.core.config import settings
from app.db.database import SessionLocal
from app.models.models import ClipSuggestion, Export, Job, Project, Transcript
from app.services.highlight_ai import HighlightAIError, detect_highlights_with_ollama
from app.services.media import MediaProcessingError, extract_audio, generate_thumbnail, probe_video
from app.services.renderer import RenderError, get_target_dimensions, render_clip_mp4
from app.services.subtitles import generate_ass_subtitles
from app.services.transcription import TranscriptionError, transcribe_audio

ingest_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="clipmagic-ingest")
ai_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="clipmagic-ai")


def mark_stale_jobs_failed() -> None:
    """Mark any leftover queued/processing jobs from a previous server process as failed."""
    db = SessionLocal()
    try:
        stale = (
            db.query(Job)
            .filter(Job.status.in_(["queued", "processing"]))
            .all()
        )
        for job in stale:
            job.status = "failed"
            job.message = "Interrupted by server restart"
            job.error_message = "Job was interrupted when the backend restarted. Please retry."
        if stale:
            db.commit()
    finally:
        db.close()


def _update_job(
    db: Session,
    job_id: int,
    *,
    status: str | None = None,
    progress: float | None = None,
    message: str | None = None,
    error_message: str | None = None,
) -> Job | None:
    job = db.get(Job, job_id)
    if not job:
        return None
    if status is not None:
        job.status = status
    if progress is not None:
        job.progress = progress
    if message is not None:
        job.message = message
    if error_message is not None:
        job.error_message = error_message
    db.commit()
    db.refresh(job)
    return job


def _is_cancelled(db: Session, job_id: int) -> bool:
    db.expire_all()
    job = db.get(Job, job_id)
    return job is not None and job.status == "cancelled"


def run_ingest_job(job_id: int, project_id: int) -> None:
    """Background job: probe metadata, generate thumbnail, and extract audio."""
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        if not project:
            _update_job(db, job_id, status="failed", error_message="Project not found")
            return

        if _is_cancelled(db, job_id):
            return

        _update_job(db, job_id, status="processing", progress=10.0, message="Inspecting video metadata...")
        video_path = Path(project.original_video_path)
        meta = probe_video(video_path)

        project.duration = meta.duration
        project.width = meta.width
        project.height = meta.height
        project.resolution = meta.resolution
        project.fps = meta.fps
        db.commit()

        if _is_cancelled(db, job_id):
            return

        _update_job(db, job_id, progress=45.0, message="Generating video thumbnail...")
        thumb_path = settings.THUMBNAILS_DIR / f"project_{project.id}.jpg"
        seek_sec = min(1.0, max(0.0, meta.duration * 0.1))
        generate_thumbnail(video_path, thumb_path, seek_seconds=seek_sec)
        project.thumbnail_path = str(thumb_path)
        db.commit()

        if _is_cancelled(db, job_id):
            return

        if meta.has_audio:
            _update_job(db, job_id, progress=70.0, message="Extracting audio track for transcription...")
            audio_path = settings.AUDIO_DIR / f"project_{project.id}.wav"
            extract_audio(video_path, audio_path)
        else:
            _update_job(db, job_id, progress=85.0, message="No audio track detected; skipping audio extraction.")

        if _is_cancelled(db, job_id):
            return

        _update_job(db, job_id, status="completed", progress=100.0, message="Video ready for transcription")
    except MediaProcessingError as exc:
        _update_job(db, job_id, status="failed", message="Video processing failed", error_message=str(exc))
    except Exception as exc:
        _update_job(db, job_id, status="failed", message="Unexpected error", error_message=str(exc))
    finally:
        db.close()


def enqueue_ingest_job(project_id: int) -> Job:
    """Create a queued ingest Job and submit it to the background executor."""
    db = SessionLocal()
    try:
        job = Job(
            project_id=project_id,
            job_type="ingest",
            status="queued",
            progress=0.0,
            message="Queued for video processing",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        ingest_executor.submit(run_ingest_job, job.id, project_id)
        return job
    finally:
        db.close()


def run_transcribe_job(job_id: int, project_id: int) -> None:
    """Background job: transcribe project audio with Faster-Whisper."""
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        if not project:
            _update_job(db, job_id, status="failed", error_message="Project not found")
            return

        if _is_cancelled(db, job_id):
            return

        app_prefs = _load_settings(db)
        audio_path = settings.AUDIO_DIR / f"project_{project.id}.wav"
        if not audio_path.is_file():
            _update_job(db, job_id, status="processing", progress=15.0, message="Extracting audio track...")
            extract_audio(Path(project.original_video_path), audio_path)

        if _is_cancelled(db, job_id):
            return

        _update_job(
            db,
            job_id,
            status="processing",
            progress=40.0,
            message=f"Transcribing with Faster-Whisper ({app_prefs.whisper_model})...",
        )
        result = transcribe_audio(
            audio_path=audio_path,
            model_size=app_prefs.whisper_model,
            device=app_prefs.whisper_device,
        )

        if _is_cancelled(db, job_id):
            return

        # Replace existing transcript if re-run
        existing = list(db.scalars(select(Transcript).where(Transcript.project_id == project.id)).all())
        for row in existing:
            db.delete(row)

        transcript = Transcript(
            project_id=project.id,
            language=result["language"],
            model_size=app_prefs.whisper_model,
            transcript_data=json.dumps(result["segments"]),
        )
        db.add(transcript)
        db.commit()

        _update_job(db, job_id, status="completed", progress=100.0, message="Transcription complete")
    except (TranscriptionError, MediaProcessingError) as exc:
        _update_job(db, job_id, status="failed", message="Transcription failed", error_message=str(exc))
    except Exception as exc:
        _update_job(db, job_id, status="failed", message="Unexpected error", error_message=str(exc))
    finally:
        db.close()


def enqueue_transcribe_job(project_id: int) -> Job:
    """Create a queued transcription Job and submit it to the background executor."""
    db = SessionLocal()
    try:
        job = Job(
            project_id=project_id,
            job_type="transcribe",
            status="queued",
            progress=0.0,
            message="Queued for transcription",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        ai_executor.submit(run_transcribe_job, job.id, project_id)
        return job
    finally:
        db.close()


def run_detect_highlights_job(
    job_id: int,
    project_id: int,
    min_seconds: int,
    max_seconds: int,
    model_override: str | None = None,
) -> None:
    """Background job: detect highlight clips using local Ollama."""
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        if not project:
            _update_job(db, job_id, status="failed", error_message="Project not found")
            return

        transcript = db.scalar(
            select(Transcript).where(Transcript.project_id == project.id).order_by(Transcript.created_at.desc())
        )
        if not transcript:
            _update_job(
                db,
                job_id,
                status="failed",
                error_message="No transcript found. Please transcribe the video first.",
            )
            return

        if _is_cancelled(db, job_id):
            return

        app_prefs = _load_settings(db)
        selected_model = (model_override or "").strip() or app_prefs.ollama_model
        _update_job(
            db,
            job_id,
            status="processing",
            progress=35.0,
            message=f"Analysing transcript with Ollama ({selected_model})...",
        )
        segments = json.loads(transcript.transcript_data)
        suggestions = detect_highlights_with_ollama(
            segments=segments,
            video_duration=project.duration or 0.0,
            category=project.category,
            model=selected_model,
            min_seconds=min_seconds,
            max_seconds=max_seconds,
        )

        if _is_cancelled(db, job_id):
            return

        for item in suggestions:
            clip = ClipSuggestion(
                project_id=project.id,
                title=item["title"],
                hook=item["hook"],
                start_time=item["start_time"],
                end_time=item["end_time"],
                reason=item["reason"],
                category=item["category"],
                score=item["score"],
                caption=item["caption"],
                status="pending",
            )
            db.add(clip)
        db.commit()

        _update_job(
            db,
            job_id,
            status="completed",
            progress=100.0,
            message=f"Generated {len(suggestions)} clip suggestion(s)",
        )
    except HighlightAIError as exc:
        _update_job(db, job_id, status="failed", message="Highlight detection failed", error_message=str(exc))
    except Exception as exc:
        _update_job(db, job_id, status="failed", message="Unexpected error", error_message=str(exc))
    finally:
        db.close()


def enqueue_detect_highlights_job(
    project_id: int,
    min_seconds: int,
    max_seconds: int,
    model_override: str | None = None,
) -> Job:
    """Create a queued highlight-detection Job and submit it to the background executor."""
    db = SessionLocal()
    try:
        job = Job(
            project_id=project_id,
            job_type="detect_highlights",
            status="queued",
            progress=0.0,
            message="Queued for AI highlight detection",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        ai_executor.submit(run_detect_highlights_job, job.id, project_id, min_seconds, max_seconds, model_override)
        return job
    finally:
        db.close()


def run_export_job(
    job_id: int,
    export_id: int,
    *,
    font_size: int,
    caption_color: str,
    caption_position: str,
    enable_subtitles: bool,
    preview: bool,
) -> None:
    """Background job: generate ASS subtitles and render MP4 clip with FFmpeg."""
    db = SessionLocal()
    ass_path: Path | None = None
    try:
        export_row = db.get(Export, export_id)
        if not export_row:
            _update_job(db, job_id, status="failed", error_message="Export record not found")
            return

        project = db.get(Project, export_row.project_id)
        clip = db.get(ClipSuggestion, export_row.clip_id) if export_row.clip_id else None
        if not project or not clip:
            export_row.status = "failed"
            db.commit()
            _update_job(db, job_id, status="failed", error_message="Project or clip not found")
            return

        if _is_cancelled(db, job_id):
            export_row.status = "cancelled"
            db.commit()
            return

        export_row.status = "processing"
        db.commit()
        _update_job(db, job_id, status="processing", progress=15.0, message="Preparing export...")

        target_w, target_h = get_target_dimensions(export_row.aspect_ratio, preview=preview)
        if enable_subtitles:
            transcript = db.scalar(
                select(Transcript)
                .where(Transcript.project_id == project.id)
                .order_by(Transcript.created_at.desc())
            )
            if transcript:
                _update_job(db, job_id, progress=30.0, message="Generating ASS subtitles...")
                segments = json.loads(transcript.transcript_data)
                ass_path = settings.TEMP_DIR / f"export_{export_row.id}.ass"
                generate_ass_subtitles(
                    segments=segments,
                    clip_start=clip.start_time,
                    clip_end=clip.end_time,
                    output_path=ass_path,
                    play_res_x=target_w,
                    play_res_y=target_h,
                    style_name=export_row.subtitle_style,
                    font_size=font_size,
                    primary_hex=caption_color,
                    position=caption_position,
                )

        if _is_cancelled(db, job_id):
            export_row.status = "cancelled"
            db.commit()
            return

        app_prefs = _load_settings(db)
        _update_job(db, job_id, progress=55.0, message="Rendering MP4 with FFmpeg...")
        output_path = Path(export_row.output_path)
        render_clip_mp4(
            source_video=Path(project.original_video_path),
            output_path=output_path,
            start_time=clip.start_time,
            end_time=clip.end_time,
            aspect_ratio=export_row.aspect_ratio,
            ass_path=ass_path,
            preview=preview,
            prefer_hw_encoding=app_prefs.prefer_hw_encoding,
        )

        export_row.file_size = output_path.stat().st_size if output_path.is_file() else None
        export_row.duration = round(max(0.0, clip.end_time - clip.start_time), 2)
        export_row.status = "completed"
        db.commit()

        _update_job(db, job_id, status="completed", progress=100.0, message="Export completed")
    except RenderError as exc:
        export_row = db.get(Export, export_id)
        if export_row:
            export_row.status = "failed"
            db.commit()
        _update_job(db, job_id, status="failed", message="Render failed", error_message=str(exc))
    except Exception as exc:
        export_row = db.get(Export, export_id)
        if export_row:
            export_row.status = "failed"
            db.commit()
        _update_job(db, job_id, status="failed", message="Unexpected error", error_message=str(exc))
    finally:
        if ass_path is not None:
            ass_path.unlink(missing_ok=True)
        db.close()


def enqueue_export_job(
    *,
    project_id: int,
    clip_id: int,
    aspect_ratio: str,
    subtitle_style: str,
    font_size: int,
    caption_color: str,
    caption_position: str,
    enable_subtitles: bool,
    preview: bool,
) -> tuple[Export, Job]:
    """Create Export + Job rows and submit the render job."""
    db = SessionLocal()
    try:
        target_w, target_h = get_target_dimensions(aspect_ratio, preview=preview)
        preset = f"{target_w}x{target_h}"
        filename = f"clip_{clip_id}_{preset}_{subtitle_style}.mp4"
        output_path = (settings.EXPORTS_DIR / filename).resolve()

        export_row = Export(
            project_id=project_id,
            clip_id=clip_id,
            output_path=str(output_path),
            aspect_ratio=aspect_ratio,
            preset=preset,
            subtitle_style=subtitle_style if enable_subtitles else "none",
            status="queued",
        )
        db.add(export_row)
        db.commit()
        db.refresh(export_row)

        job = Job(
            project_id=project_id,
            job_type="export",
            status="queued",
            progress=0.0,
            message="Queued for MP4 export",
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        ingest_executor.submit(
            run_export_job,
            job.id,
            export_row.id,
            font_size=font_size,
            caption_color=caption_color,
            caption_position=caption_position,
            enable_subtitles=enable_subtitles,
            preview=preview,
        )
        return export_row, job
    finally:
        db.close()
