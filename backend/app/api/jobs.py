import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, get_db
from app.models.models import Job
from app.schemas.schemas import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


@router.get("", response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db)) -> list[JobOut]:
    jobs = list(db.scalars(select(Job).order_by(Job.created_at.desc()).limit(50)).all())
    return [JobOut.model_validate(j) for j in jobs]


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)) -> JobOut:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobOut.model_validate(job)


@router.post("/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: int, db: Session = Depends(get_db)) -> JobOut:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.status in {"queued", "processing"}:
        job.status = "cancelled"
        job.message = "Cancelled by user"
        db.commit()
        db.refresh(job)
    return JobOut.model_validate(job)


@router.get("/{job_id}/events")
async def stream_job_events(job_id: int) -> StreamingResponse:
    """Stream Server-Sent Events for job progress until terminal state."""

    async def event_generator():
        while True:
            db = SessionLocal()
            try:
                job = db.get(Job, job_id)
                if not job:
                    yield f"event: error\ndata: {{\"detail\": \"Job not found\"}}\n\n"
                    break
                payload = JobOut.model_validate(job).model_dump_json()
                yield f"data: {payload}\n\n"
                if job.status in TERMINAL_STATUSES:
                    break
            finally:
                db.close()
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
