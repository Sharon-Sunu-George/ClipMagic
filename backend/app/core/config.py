import os
import shutil
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_binary(name: str) -> str | None:
    """Locate ffmpeg/ffprobe/nvidia-smi on PATH or common Windows WinGet install locations."""
    found = shutil.which(name)
    if found:
        return found
    local_app_data = os.environ.get("LOCALAPPDATA")
    candidates: list[Path] = []
    if local_app_data:
        winget_dir = Path(local_app_data) / "Microsoft" / "WinGet"
        candidates.append(winget_dir / "Links" / f"{name}.exe")
        packages_dir = winget_dir / "Packages"
        if packages_dir.is_dir():
            candidates.extend(packages_dir.glob(f"Gyan.FFmpeg*/**/bin/{name}.exe"))
    candidates.append(Path("C:/ffmpeg/bin") / f"{name}.exe")
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


class Settings(BaseSettings):
    """Application configuration for ClipMagic backend."""

    model_config = SettingsConfigDict(env_prefix="CLIPMAGIC_", env_file=".env", extra="ignore")

    APP_NAME: str = "ClipMagic"
    APP_VERSION: str = "0.1.0"
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    BASE_DIR: Path = Path(__file__).resolve().parents[3]
    STORAGE_DIR: Path = BASE_DIR / "storage"
    UPLOADS_DIR: Path = STORAGE_DIR / "uploads"
    THUMBNAILS_DIR: Path = STORAGE_DIR / "thumbnails"
    AUDIO_DIR: Path = STORAGE_DIR / "audio"
    EXPORTS_DIR: Path = STORAGE_DIR / "exports"
    TEMP_DIR: Path = STORAGE_DIR / "temp"
    DB_PATH: Path = BASE_DIR / "clipmagic.db"

    CORS_ORIGINS: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]

    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    DEFAULT_OLLAMA_MODEL: str = "qwen3.5:4b"
    DEFAULT_WHISPER_MODEL: str = "base"
    DEFAULT_WHISPER_DEVICE: str = "auto"

    MAX_UPLOAD_SIZE_BYTES: int = 4 * 1024 * 1024 * 1024  # 4 GB
    ALLOWED_VIDEO_EXTENSIONS: tuple[str, ...] = (".mp4", ".mov", ".mkv", ".webm")

    def ensure_directories(self) -> None:
        """Create required application-managed storage directories."""
        for directory in (
            self.STORAGE_DIR,
            self.UPLOADS_DIR,
            self.THUMBNAILS_DIR,
            self.AUDIO_DIR,
            self.EXPORTS_DIR,
            self.TEMP_DIR,
        ):
            directory.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
