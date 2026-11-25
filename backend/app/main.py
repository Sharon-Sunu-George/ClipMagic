from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import clips, dashboard, exports, health, jobs, projects, settings as settings_api
from app.core.config import settings
from app.db.database import init_db
from app.services.job_runner import mark_stale_jobs_failed


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.ensure_directories()
    init_db()
    mark_stale_jobs_failed()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(clips.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"app": settings.APP_NAME, "version": settings.APP_VERSION, "docs": "/docs"}
