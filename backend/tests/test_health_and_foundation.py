from fastapi.testclient import TestClient

from app.main import app


def test_root_endpoint():
    with TestClient(app) as client:
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["app"] == "ClipMagic"


def test_health_endpoint():
    with TestClient(app) as client:
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["database"]["available"] is True
        assert "ffmpeg" in data
        assert "ffprobe" in data
        assert "gpu" in data
        assert "ollama" in data


def test_dashboard_endpoint():
    with TestClient(app) as client:
        resp = client.get("/api/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_projects" in data
        assert "recent_projects" in data
        assert "active_jobs" in data


def test_settings_roundtrip():
    with TestClient(app) as client:
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        payload = resp.json()
        payload["default_clip_min_seconds"] = 25
        put_resp = client.put("/api/settings", json=payload)
        assert put_resp.status_code == 200
        assert put_resp.json()["default_clip_min_seconds"] == 25
