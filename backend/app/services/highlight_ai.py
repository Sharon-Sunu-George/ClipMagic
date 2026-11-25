import json
from typing import Any
import httpx

from app.core.config import settings


class HighlightAIError(RuntimeError):
    """Raised when Ollama highlight detection fails."""


def _format_transcript_for_prompt(segments: list[dict[str, Any]], max_chars: int = 18000) -> str:
    lines: list[str] = []
    total = 0
    for seg in segments:
        line = f"[{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['text']}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line) + 1
    return "\n".join(lines)


def parse_and_validate_highlights(
    raw_content: str,
    video_duration: float,
    min_seconds: int,
    max_seconds: int,
    default_category: str,
) -> list[dict[str, Any]]:
    """Parse Ollama JSON output and validate/clamp all clip timestamps against video_duration."""
    text = raw_content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:]).strip()

    data = json.loads(text)
    items = data.get("clips", data) if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise HighlightAIError("AI response did not contain a list of clips.")

    validated: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            start = float(item.get("start_time", 0.0))
            end = float(item.get("end_time", 0.0))
        except (TypeError, ValueError):
            continue

        start = max(0.0, min(start, video_duration))
        end = max(0.0, min(end, video_duration))
        if end <= start + 3.0:
            continue

        # Clamp overly long clips if needed, keeping within video_duration
        if end - start > max_seconds * 1.5:
            end = min(video_duration, start + max_seconds)

        score_raw = item.get("score", 70)
        try:
            score = max(0.0, min(100.0, float(score_raw)))
        except (TypeError, ValueError):
            score = 70.0

        validated.append(
            {
                "title": str(item.get("title") or "Untitled Clip")[:255],
                "hook": str(item.get("hook") or "")[:512] or None,
                "start_time": round(start, 2),
                "end_time": round(end, 2),
                "reason": str(item.get("reason") or "Interesting moment identified by AI."),
                "category": str(item.get("category") or default_category)[:64],
                "score": round(score, 1),
                "caption": str(item.get("caption") or "") or None,
            }
        )

    return validated


def detect_highlights_with_ollama(
    segments: list[dict[str, Any]],
    video_duration: float,
    category: str,
    model: str,
    min_seconds: int = 20,
    max_seconds: int = 60,
) -> list[dict[str, Any]]:
    """Call local Ollama to identify standalone highlight clips from a timestamped transcript."""
    if not segments:
        raise HighlightAIError("Transcript has no speech segments to analyse.")

    transcript_text = _format_transcript_for_prompt(segments)
    system_prompt = (
        "You are an expert short-form video editor for YouTube Shorts, Instagram Reels, and TikTok. "
        "Analyse the timestamped transcript and return ONLY valid JSON."
    )
    user_prompt = (
        f"Content category: {category}\n"
        f"Total video duration: {video_duration:.1f} seconds\n"
        f"Target clip duration: {min_seconds} to {max_seconds} seconds\n\n"
        "Identify 3 to 6 standalone, engaging clips (strong opinions, surprising facts, "
        "funny/emotional moments, storytelling, or clear educational takeaways). "
        "Avoid cutting mid-sentence.\n\n"
        'Return JSON in this exact format:\n'
        '{"clips": [{"title": "...", "hook": "...", "start_time": 12.5, "end_time": 45.0, '
        '"reason": "...", "category": "' + category + '", "score": 85, "caption": "..."}]}\n\n'
        f"Transcript:\n{transcript_text}"
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.3},
    }

    try:
        with httpx.Client(timeout=300.0) as client:
            resp = client.post(f"{settings.OLLAMA_BASE_URL}/api/chat", json=payload)
            resp.raise_for_status()
            content = resp.json().get("message", {}).get("content", "")
    except Exception as exc:
        raise HighlightAIError(f"Ollama request failed: {exc}") from exc

    return parse_and_validate_highlights(
        raw_content=content,
        video_duration=video_duration,
        min_seconds=min_seconds,
        max_seconds=max_seconds,
        default_category=category,
    )
