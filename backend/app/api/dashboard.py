from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import ClipSuggestion, Export, Job, Project
from app.schemas.schemas import DashboardStatsResponse, ExportOut, JobOut, ProjectOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)) -> DashboardStatsResponse:
    total_projects = db.scalar(select(func.count(Project.id))) or 0
    total_videos_processed = (
        db.scalar(select(func.count(Project.id)).where(Project.duration.is_not(None))) or 0
    )
    total_clips_generated = db.scalar(select(func.count(ClipSuggestion.id))) or 0
    total_exports = (
        db.scalar(select(func.count(Export.id)).where(Export.status == "completed")) or 0
    )

    recent_projects = list(
        db.scalars(select(Project).order_by(Project.updated_at.desc()).limit(6)).all()
    )
    recent_exports = list(
        db.scalars(select(Export).order_by(Export.created_at.desc()).limit(6)).all()
    )
    active_jobs = list(
        db.scalars(select(Job).order_by(Job.created_at.desc()).limit(8)).all()
    )

    return DashboardStatsResponse(
        total_projects=total_projects,
        total_videos_processed=total_videos_processed,
        total_clips_generated=total_clips_generated,
        total_exports=total_exports,
        recent_projects=[ProjectOut.model_validate(p) for p in recent_projects],
        recent_exports=[ExportOut.model_validate(e) for e in recent_exports],
        active_jobs=[JobOut.model_validate(j) for j in active_jobs],
    )
