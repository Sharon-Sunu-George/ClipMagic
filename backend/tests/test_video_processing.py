import subprocess
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import find_binary, settings
from app.main import app


def _create_sample_mp4(dest: Path) -> Path:
    ffmpeg = find_binary("ffmpeg")
    assert ffmpeg is not None, "ffmpeg must be installed for Phase 2 tests"
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=3:size=640x360:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        str(dest),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    assert proc.returncode == 0, f"Failed to generate sample mp4: {proc.stderr}"
    return dest


def test_reject_invalid_extension():
    with TestClient(app) as client:
        resp = client.post(
            "/api/projects/upload",
            files={"file": ("notes.txt", b"hello", "text/plain")},
            data={"name": "Bad File"},
        )
        assert resp.status_code == 400


def test_reject_empty_upload():
    with TestClient(app) as client:
        resp = client.post(
            "/api/projects/upload",
            files={"file": ("empty.mp4", b"", "video/mp4")},
            data={"name": "Empty File"},
        )
        assert resp.status_code == 400


def test_video_upload_metadata_thumbnail_and_audio(tmp_path: Path):
    sample_mp4 = _create_sample_mp4(tmp_path / "sample.mp4")

    with TestClient(app) as client:
        with sample_mp4.open("rb") as fh:
            upload_resp = client.post(
                "/api/projects/upload",
                files={"file": ("sample.mp4", fh, "video/mp4")},
                data={"name": "Sample Test Clip", "category": "Tutorials"},
            )
        assert upload_resp.status_code == 201
        payload = upload_resp.json()
        project_id = payload["project"]["id"]
        job_id = payload["job"]["id"]

        # Wait for background ingest job to finish
        deadline = time.time() + 20
        job_data = payload["job"]
        while time.time() < deadline:
            job_resp = client.get(f"/api/jobs/{job_id}")
            assert job_resp.status_code == 200
            job_data = job_resp.json()
            if job_data["status"] in {"completed", "failed", "cancelled"}:
                break
            time.sleep(0.25)

        assert job_data["status"] == "completed", f"Job failed: {job_data}"
        assert job_data["progress"] == 100.0

        proj_resp = client.get(f"/api/projects/{project_id}")
        assert proj_resp.status_code == 200
        proj = proj_resp.json()
        assert proj["resolution"] == "640x360"
        assert proj["width"] == 640
        assert proj["height"] == 360
        assert 2.5 <= proj["duration"] <= 3.5
        assert proj["fps"] >= 29.0

        thumb_resp = client.get(f"/api/projects/{project_id}/thumbnail")
        assert thumb_resp.status_code == 200
        assert thumb_resp.headers["content-type"].startswith("image/jpeg")

        video_resp = client.get(f"/api/projects/{project_id}/video")
        assert video_resp.status_code == 200
        assert video_resp.headers["content-type"].startswith("video/mp4")

        audio_path = settings.AUDIO_DIR / f"project_{project_id}.wav"
        assert audio_path.is_file() and audio_path.stat().st_size > 1000

        # Cleanup
        del_resp = client.delete(f"/api/projects/{project_id}")
        assert del_resp.status_code == 204
        assert not audio_path.exists()
