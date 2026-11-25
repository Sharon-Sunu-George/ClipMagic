from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import ClipSuggestion, Job, Project, Transcript
from app.schemas.schemas import (
    ClipCreatePayload,
    ClipSuggestionOut,
    ClipUpdatePayload,
    DetectHighlightsPayload,
    JobOut,
    TranscriptOut,
)
from app.services.job_runner import enqueue_detect_highlights_job, enqueue_transcribe_job

router = APIRouter(tags=["clips"])


@router.get("/projects/{project_id}/transcript", response_model=TranscriptOut | None)
def get_project_transcript(project_id: int, db: Session = Depends(get_db)) -> TranscriptOut | None:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    transcript = db.scalar(
        select(Transcript).where(Transcript.project_id == project_id).order_by(Transcript.created_at.desc())
    )
    return TranscriptOut.model_validate(transcript) if transcript else None


@router.post("/projects/{project_id}/transcribe", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def start_transcription(project_id: int, db: Session = Depends(get_db)) -> JobOut:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    active = db.scalar(
        select(Job).where(
            Job.project_id == project_id,
            Job.job_type == "transcribe",
            Job.status.in_(["queued", "processing"]),
        )
    )
    if active:
        return JobOut.model_validate(active)
    job = enqueue_transcribe_job(project_id)
    return JobOut.model_validate(job)


@router.get("/projects/{project_id}/clips", response_model=list[ClipSuggestionOut])
def list_project_clips(project_id: int, db: Session = Depends(get_db)) -> list[ClipSuggestionOut]:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    clips = list(
        db.scalars(
            select(ClipSuggestion)
            .where(ClipSuggestion.project_id == project_id)
            .order_by(ClipSuggestion.start_time.asc())
        ).all()
    )
    return [ClipSuggestionOut.model_validate(c) for c in clips]


@router.post("/projects/{project_id}/clips/detect", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def detect_project_clips(
    project_id: int,
    payload: DetectHighlightsPayload,
    db: Session = Depends(get_db),
) -> JobOut:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    job = enqueue_detect_highlights_job(
        project_id=project_id,
        min_seconds=payload.min_seconds,
        max_seconds=payload.max_seconds,
        model_override=payload.model,
    )
    return JobOut.model_validate(job)


@router.post("/projects/{project_id}/clips", response_model=ClipSuggestionOut, status_code=status.HTTP_201_CREATED)
def create_manual_clip(
    project_id: int,
    payload: ClipCreatePayload,
    db: Session = Depends(get_db),
) -> ClipSuggestionOut:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    duration = project.duration or 0.0
    start = max(0.0, payload.start_time)
    end = min(duration, payload.end_time) if duration > 0 else payload.end_time
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Clip end_time must be greater than start_time and within video duration.",
        )
    clip = ClipSuggestion(
        project_id=project_id,
        title=payload.title.strip()[:255] or "Manual Clip",
        hook=payload.hook,
        start_time=round(start, 2),
        end_time=round(end, 2),
        reason=payload.reason,
        category=payload.category,
        score=75.0,
        caption=payload.caption,
        status="approved",
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)
    return ClipSuggestionOut.model_validate(clip)


@router.patch("/clips/{clip_id}", response_model=ClipSuggestionOut)
def update_clip(clip_id: int, payload: ClipUpdatePayload, db: Session = Depends(get_db)) -> ClipSuggestionOut:
    clip = db.get(ClipSuggestion, clip_id)
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    if payload.title is not None:
        clip.title = payload.title.strip()[:255] or clip.title
    if payload.start_time is not None:
        clip.start_time = max(0.0, round(payload.start_time, 2))
    if payload.end_time is not None:
        clip.end_time = max(clip.start_time + 1.0, round(payload.end_time, 2))
    if payload.status is not None and payload.status in {"pending", "approved", "rejected"}:
        clip.status = payload.status
    if payload.caption is not None:
        clip.caption = payload.caption
    db.commit()
    db.refresh(clip)
    return ClipSuggestionOut.model_validate(clip)


@router.delete("/clips/{clip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clip(clip_id: int, db: Session = Depends(get_db)) -> None:
    clip = db.get(ClipSuggestion, clip_id)
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    db.delete(clip)
    db.commit()
