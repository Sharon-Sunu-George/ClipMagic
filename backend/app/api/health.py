import subprocess
import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import find_binary, settings
from app.db.database import get_db
from app.schemas.schemas import HealthComponent, HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


def _check_binary(name: str) -> HealthComponent:
    path = find_binary(name)
    if not path:
        return HealthComponent(available=False, detail=f"{name} not found in PATH")
    try:
        proc = subprocess.run(
            [path, "-version"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        first_line = (proc.stdout or proc.stderr or "").splitlines()[0] if (proc.stdout or proc.stderr) else path
        return HealthComponent(available=proc.returncode == 0, detail=first_line)
    except Exception as exc:
        return HealthComponent(available=False, detail=str(exc))


def _check_gpu() -> HealthComponent:
    nvidia_smi = find_binary("nvidia-smi")
    if not nvidia_smi:
        return HealthComponent(available=False, detail="nvidia-smi not found (CPU mode)")
    try:
        proc = subprocess.run(
            [nvidia_smi, "--query-gpu=name,memory.free,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return HealthComponent(available=True, detail=proc.stdout.strip().splitlines()[0])
        return HealthComponent(available=False, detail="GPU query failed")
    except Exception as exc:
        return HealthComponent(available=False, detail=str(exc))


def _check_ollama() -> HealthComponent:
    try:
        with httpx.Client(timeout=2.5) as client:
            resp = client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                models = [m.get("name", "") for m in resp.json().get("models", [])]
                local_count = len([m for m in models if ":cloud" not in m])
                return HealthComponent(
                    available=True,
                    detail=f"Connected ({local_count} local model(s), {len(models)} total)",
                )
            return HealthComponent(available=False, detail=f"HTTP {resp.status_code}")
    except Exception as exc:
        return HealthComponent(available=False, detail=f"Unavailable ({exc})")


@router.get("", response_model=HealthResponse)
def get_health(db: Session = Depends(get_db)) -> HealthResponse:
    db_ok = False
    db_detail = None
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
        db_detail = "SQLite connected"
    except Exception as exc:
        db_detail = str(exc)

    ffmpeg_status = _check_binary("ffmpeg")
    ffprobe_status = _check_binary("ffprobe")
    gpu_status = _check_gpu()
    ollama_status = _check_ollama()

    overall = "ok" if (db_ok and ffmpeg_status.available and ffprobe_status.available) else "degraded"

    return HealthResponse(
        status=overall,
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        database=HealthComponent(available=db_ok, detail=db_detail),
        ffmpeg=ffmpeg_status,
        ffprobe=ffprobe_status,
        gpu=gpu_status,
        ollama=ollama_status,
    )
