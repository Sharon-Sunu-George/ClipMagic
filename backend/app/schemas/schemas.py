from datetime import datetime
from pydantic import BaseModel, ConfigDict


class HealthComponent(BaseModel):
    available: bool
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    database: HealthComponent
    ffmpeg: HealthComponent
    ffprobe: HealthComponent
    gpu: HealthComponent
    ollama: HealthComponent


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    thumbnail_path: str | None = None
    duration: float | None = None
    resolution: str | None = None
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    file_size: int | None = None
    created_at: datetime
    updated_at: datetime


class ExportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    clip_id: int | None = None
    output_path: str
    aspect_ratio: str
    preset: str
    subtitle_style: str
    file_size: int | None = None
    duration: float | None = None
    status: str
    created_at: datetime


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int | None = None
    job_type: str
    status: str
    progress: float
    message: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class DashboardStatsResponse(BaseModel):
    total_projects: int
    total_videos_processed: int
    total_clips_generated: int
    total_exports: int
    recent_projects: list[ProjectOut]
    recent_exports: list[ExportOut]
    active_jobs: list[JobOut]


class AppSettingsPayload(BaseModel):
    whisper_model: str = "base"
    whisper_device: str = "auto"
    ollama_model: str = "qwen3.5:4b"
    default_clip_min_seconds: int = 20
    default_clip_max_seconds: int = 60
    default_aspect_ratio: str = "9:16"
    default_subtitle_style: str = "clean"
    prefer_hw_encoding: bool = False


class UploadResponse(BaseModel):
    project: ProjectOut
    job: JobOut


class TranscriptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    language: str
    model_size: str
    transcript_data: str
    created_at: datetime


class ClipSuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    hook: str | None = None
    start_time: float
    end_time: float
    reason: str
    category: str
    score: float
    caption: str | None = None
    status: str


class ClipCreatePayload(BaseModel):
    title: str
    start_time: float
    end_time: float
    hook: str | None = None
    reason: str = "Manually added clip"
    category: str = "General videos"
    caption: str | None = None


class ClipUpdatePayload(BaseModel):
    title: str | None = None
    start_time: float | None = None
    end_time: float | None = None
    status: str | None = None
    caption: str | None = None


class DetectHighlightsPayload(BaseModel):
    min_seconds: int = 20
    max_seconds: int = 60
    model: str | None = None


class ClipExportPayload(BaseModel):
    aspect_ratio: str = "9:16"
    subtitle_style: str = "clean"
    font_size: int = 58
    caption_color: str = "#FFFFFF"
    caption_position: str = "bottom"
    enable_subtitles: bool = True
    preview: bool = False


class ExportJobResponse(BaseModel):
    export: ExportOut
    job: JobOut



