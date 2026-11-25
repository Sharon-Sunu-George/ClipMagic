import json
import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.models import AppSetting
from app.schemas.schemas import AppSettingsPayload

router = APIRouter(prefix="/settings", tags=["settings"])

SETTINGS_KEY = "app_preferences"


def _load_settings(db: Session) -> AppSettingsPayload:
    row = db.get(AppSetting, SETTINGS_KEY)
    if not row:
        return AppSettingsPayload(
            whisper_model=settings.DEFAULT_WHISPER_MODEL,
            whisper_device=settings.DEFAULT_WHISPER_DEVICE,
            ollama_model=settings.DEFAULT_OLLAMA_MODEL,
        )
    try:
        data = json.loads(row.value)
        return AppSettingsPayload(**data)
    except Exception:
        return AppSettingsPayload()


@router.get("", response_model=AppSettingsPayload)
def get_settings(db: Session = Depends(get_db)) -> AppSettingsPayload:
    return _load_settings(db)


@router.put("", response_model=AppSettingsPayload)
def update_settings(payload: AppSettingsPayload, db: Session = Depends(get_db)) -> AppSettingsPayload:
    serialized = payload.model_dump_json()
    row = db.get(AppSetting, SETTINGS_KEY)
    if row:
        row.value = serialized
    else:
        row = AppSetting(key=SETTINGS_KEY, value=serialized)
        db.add(row)
    db.commit()
    return payload


@router.get("/ollama-models")
def list_ollama_models() -> dict:
    """Return available local Ollama models for selection."""
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            raw_models = resp.json().get("models", [])
            models = [
                {
                    "name": m.get("name"),
                    "size": m.get("size"),
                    "is_cloud": ":cloud" in (m.get("name") or ""),
                }
                for m in raw_models
                if m.get("name")
            ]
            return {"available": True, "models": models}
    except Exception as exc:
        return {"available": False, "models": [], "error": str(exc)}
