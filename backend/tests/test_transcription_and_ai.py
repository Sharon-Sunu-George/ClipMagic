import json
from fastapi.testclient import TestClient

from app.main import app
from app.services.highlight_ai import parse_and_validate_highlights


def test_parse_and_validate_highlights_clamps_timestamps():
    raw = json.dumps(
        {
            "clips": [
                {
                    "title": "Strong Hook",
                    "hook": "Here is the secret",
                    "start_time": -5.0,
                    "end_time": 25.0,
                    "reason": "Clear insight",
                    "category": "Educational videos",
                    "score": 88,
                    "caption": "Watch this",
                },
                {
                    "title": "Too Short",
                    "start_time": 10.0,
                    "end_time": 11.5,
                    "reason": "Too short",
                    "score": 40,
                },
                {
                    "title": "Exceeds Duration",
                    "start_time": 90.0,
                    "end_time": 150.0,
                    "reason": "Clamped to 120s",
                    "score": 120,
                },
            ]
        }
    )

    clips = parse_and_validate_highlights(
        raw_content=raw,
        video_duration=120.0,
        min_seconds=20,
        max_seconds=60,
        default_category="General videos",
    )

    assert len(clips) == 2
    assert clips[0]["start_time"] == 0.0
    assert clips[0]["end_time"] == 25.0
    assert clips[1]["start_time"] == 90.0
    assert clips[1]["end_time"] == 120.0
    assert clips[1]["score"] == 100.0


def test_transcript_and_clips_endpoints_missing_project():
    with TestClient(app) as client:
        assert client.get("/api/projects/999999/transcript").status_code == 404
        assert client.get("/api/projects/999999/clips").status_code == 404
        assert client.post("/api/projects/999999/transcribe").status_code == 404
