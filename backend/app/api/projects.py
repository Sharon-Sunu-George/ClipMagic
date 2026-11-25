import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.models import Project
from app.schemas.schemas import JobOut, ProjectOut, UploadResponse
from app.services.job_runner import enqueue_ingest_job

router = APIRouter(prefix="/projects", tags=["projects"])

CHUNK_SIZE = 1024 * 1024  # 1 MB


def _safe_unlink(file_path: str | None) -> None:
    if not file_path:
        return
    try:
        target = Path(file_path).resolve()
        storage_root = settings.STORAGE_DIR.resolve()
        if target.is_relative_to(storage_root) and target.is_file():
            target.unlink(missing_ok=True)
    except Exception:
        pass


def _resolve_safe_storage_file(file_path: str | None) -> Path:
    if not file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    target = Path(file_path).resolve()
    storage_root = settings.STORAGE_DIR.resolve()
    if not target.is_relative_to(storage_root) or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return target


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)) -> list[ProjectOut]:
    projects = list(db.scalars(select(Project).order_by(Project.updated_at.desc())).all())
    return [ProjectOut.model_validate(p) for p in projects]


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    file: UploadFile = File(...),
    name: str | None = Form(None),
    category: str = Form("General videos"),
    db: Session = Depends(get_db),
) -> UploadResponse:
    original_filename = file.filename or "video.mp4"
    ext = Path(original_filename).suffix.lower()
    if ext not in settings.ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported video format '{ext}'. Allowed: {', '.join(settings.ALLOWED_VIDEO_EXTENSIONS)}",
        )

    safe_filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = (settings.UPLOADS_DIR / safe_filename).resolve()
    if not dest_path.is_relative_to(settings.UPLOADS_DIR.resolve()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")

    total_bytes = 0
    try:
        with dest_path.open("wb") as out_file:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Uploaded file exceeds maximum allowed size.",
                    )
                out_file.write(chunk)
    except HTTPException:
        dest_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded video: {exc}",
        ) from exc
    finally:
        await file.close()

    if total_bytes == 0:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    project_name = (name or Path(original_filename).stem or "Untitled Project").strip()[:255]
    project = Project(
        name=project_name,
        category=category.strip()[:64] or "General videos",
        original_video_path=str(dest_path),
        file_size=total_bytes,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    job = enqueue_ingest_job(project.id)

    return UploadResponse(
        project=ProjectOut.model_validate(project),
        job=JobOut.model_validate(job),
    )


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)) -> ProjectOut:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return ProjectOut.model_validate(project)


@router.get("/{project_id}/thumbnail")
def get_project_thumbnail(project_id: int, db: Session = Depends(get_db)) -> FileResponse:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    target = _resolve_safe_storage_file(project.thumbnail_path)
    return FileResponse(target, media_type="image/jpeg")


@router.get("/{project_id}/video")
def get_project_video(project_id: int, db: Session = Depends(get_db)) -> FileResponse:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    target = _resolve_safe_storage_file(project.original_video_path)
    media_types = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
    }
    media_type = media_types.get(target.suffix.lower(), "application/octet-stream")
    return FileResponse(target, media_type=media_type)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> None:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    _safe_unlink(project.original_video_path)
    _safe_unlink(project.thumbnail_path)
    _safe_unlink(str(settings.AUDIO_DIR / f"project_{project.id}.wav"))
    for exp in project.exports:
        _safe_unlink(exp.output_path)

    db.delete(project)
    db.commit()
