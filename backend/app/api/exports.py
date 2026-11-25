import subprocess
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.models import ClipSuggestion, Export
from app.schemas.schemas import ClipExportPayload, ExportJobResponse, ExportOut, JobOut
from app.services.job_runner import enqueue_export_job

router = APIRouter(tags=["exports"])


@router.post("/clips/{clip_id}/export", response_model=ExportJobResponse, status_code=status.HTTP_202_ACCEPTED)
def export_clip(
    clip_id: int,
    payload: ClipExportPayload,
    db: Session = Depends(get_db),
) -> ExportJobResponse:
    clip = db.get(ClipSuggestion, clip_id)
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

    export_row, job = enqueue_export_job(
        project_id=clip.project_id,
        clip_id=clip.id,
        aspect_ratio=payload.aspect_ratio,
        subtitle_style=payload.subtitle_style,
        font_size=payload.font_size,
        caption_color=payload.caption_color,
        caption_position=payload.caption_position,
        enable_subtitles=payload.enable_subtitles,
        preview=payload.preview,
    )
    return ExportJobResponse(
        export=ExportOut.model_validate(export_row),
        job=JobOut.model_validate(job),
    )


@router.get("/exports", response_model=list[ExportOut])
def list_exports(db: Session = Depends(get_db)) -> list[ExportOut]:
    exports = list(db.scalars(select(Export).order_by(Export.created_at.desc())).all())
    return [ExportOut.model_validate(e) for e in exports]


@router.get("/exports/{export_id}/video")
def get_export_video(export_id: int, db: Session = Depends(get_db)) -> FileResponse:
    exp = db.get(Export, export_id)
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")
    target = Path(exp.output_path).resolve()
    if not target.is_relative_to(settings.EXPORTS_DIR.resolve()) or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exported file not found")
    return FileResponse(target, media_type="video/mp4", filename=target.name)


@router.post("/exports/{export_id}/open-folder")
def open_export_folder(export_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    exp = db.get(Export, export_id)
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")
    target = Path(exp.output_path).resolve()
    if target.is_file():
        subprocess.Popen(["explorer.exe", f"/select,{target}"])
    else:
        subprocess.Popen(["explorer.exe", str(settings.EXPORTS_DIR.resolve())])
    return {"status": "opened"}


@router.delete("/exports/{export_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_export(export_id: int, db: Session = Depends(get_db)) -> None:
    exp = db.get(Export, export_id)
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")
    target = Path(exp.output_path).resolve()
    if target.is_relative_to(settings.EXPORTS_DIR.resolve()) and target.is_file():
        target.unlink(missing_ok=True)
    db.delete(exp)
    db.commit()
