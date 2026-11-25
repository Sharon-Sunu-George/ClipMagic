import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.core.config import find_binary


@dataclass
class VideoMetadata:
    duration: float
    width: int
    height: int
    resolution: str
    fps: float
    has_audio: bool


class MediaProcessingError(RuntimeError):
    """Raised when FFmpeg or FFprobe fails."""


def _require_binary(name: str) -> str:
    path = find_binary(name)
    if not path:
        raise MediaProcessingError(f"{name} is not installed or not found in PATH.")
    return path


def _parse_fps(rate_str: str | None) -> float:
    if not rate_str or rate_str == "0/0":
        return 0.0
    if "/" in rate_str:
        num_s, den_s = rate_str.split("/", 1)
        try:
            num = float(num_s)
            den = float(den_s)
            return round(num / den, 3) if den > 0 else 0.0
        except ValueError:
            return 0.0
    try:
        return round(float(rate_str), 3)
    except ValueError:
        return 0.0


def probe_video(video_path: Path) -> VideoMetadata:
    """Extract duration, resolution, fps, and stream info using FFprobe."""
    ffprobe = _require_binary("ffprobe")
    cmd = [
        ffprobe,
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(video_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
    if proc.returncode != 0:
        raise MediaProcessingError(f"FFprobe failed: {proc.stderr.strip() or 'Unknown error'}")

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise MediaProcessingError(f"Failed to parse FFprobe output: {exc}") from exc

    streams = data.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not video_stream:
        raise MediaProcessingError("No valid video stream found in file.")

    has_audio = any(s.get("codec_type") == "audio" for s in streams)

    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    if width <= 0 or height <= 0:
        raise MediaProcessingError("Invalid video dimensions detected.")

    duration_raw = video_stream.get("duration") or data.get("format", {}).get("duration")
    try:
        duration = round(float(duration_raw), 3) if duration_raw is not None else 0.0
    except (TypeError, ValueError):
        duration = 0.0

    if duration <= 0:
        raise MediaProcessingError("Video duration could not be determined or is zero.")

    fps = _parse_fps(video_stream.get("avg_frame_rate")) or _parse_fps(
        video_stream.get("r_frame_rate")
    )

    return VideoMetadata(
        duration=duration,
        width=width,
        height=height,
        resolution=f"{width}x{height}",
        fps=fps,
        has_audio=has_audio,
    )


def generate_thumbnail(video_path: Path, output_path: Path, seek_seconds: float = 1.0) -> Path:
    """Generate a JPEG thumbnail from the video."""
    ffmpeg = _require_binary("ffmpeg")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-ss",
        f"{max(0.0, seek_seconds):.2f}",
        "-i",
        str(video_path),
        "-vframes",
        "1",
        "-q:v",
        "3",
        "-vf",
        "scale='min(640,iw)':-2",
        str(output_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
    if proc.returncode != 0 or not output_path.is_file():
        raise MediaProcessingError(f"Thumbnail generation failed: {proc.stderr.strip()}")
    return output_path


def extract_audio(video_path: Path, output_path: Path) -> Path:
    """Extract 16kHz mono PCM WAV audio suitable for Faster-Whisper."""
    ffmpeg = _require_binary("ffmpeg")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        str(output_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300, check=False)
    if proc.returncode != 0 or not output_path.is_file():
        raise MediaProcessingError(f"Audio extraction failed: {proc.stderr.strip()}")
    return output_path
