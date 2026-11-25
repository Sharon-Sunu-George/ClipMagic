import subprocess
from pathlib import Path

from app.core.config import find_binary


class RenderError(RuntimeError):
    """Raised when FFmpeg clip rendering fails."""


ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
}


def get_target_dimensions(aspect_ratio: str, preview: bool = False) -> tuple[int, int]:
    w, h = ASPECT_DIMENSIONS.get(aspect_ratio, (1080, 1920))
    if preview:
        return w // 2, h // 2
    return w, h


def _escape_ass_path_for_ffmpeg(path: Path) -> str:
    """Escape a Windows/POSIX path for FFmpeg's libass filter argument."""
    posix = path.resolve().as_posix()
    return posix.replace(":", "\\:")


def render_clip_mp4(
    source_video: Path,
    output_path: Path,
    *,
    start_time: float,
    end_time: float,
    aspect_ratio: str = "9:16",
    ass_path: Path | None = None,
    preview: bool = False,
    prefer_hw_encoding: bool = False,
) -> Path:
    """Trim, centre-crop/scale to target aspect ratio, burn ASS subtitles, and export MP4."""
    ffmpeg = find_binary("ffmpeg")
    if not ffmpeg:
        raise RenderError("ffmpeg is not installed or not found in PATH.")

    duration = max(0.5, end_time - start_time)
    target_w, target_h = get_target_dimensions(aspect_ratio, preview=preview)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Reliable centre crop to target aspect ratio, then scale to exact target dimensions
    vf_parts = [
        f"crop='min(iw,ih*{target_w}/{target_h})':'min(ih,iw*{target_h}/{target_w})'",
        f"scale={target_w}:{target_h}:flags=lanczos",
        "setsar=1",
    ]
    if ass_path is not None and ass_path.is_file():
        vf_parts.append(f"ass='{_escape_ass_path_for_ffmpeg(ass_path)}'")

    vf_filter = ",".join(vf_parts)

    def _run_encode(vcodec: str) -> subprocess.CompletedProcess[str]:
        cmd = [
            ffmpeg,
            "-y",
            "-ss",
            f"{max(0.0, start_time):.3f}",
            "-i",
            str(source_video),
            "-t",
            f"{duration:.3f}",
            "-vf",
            vf_filter,
            "-c:v",
            vcodec,
        ]
        if vcodec == "libx264":
            cmd.extend(["-preset", "fast" if preview else "medium", "-crf", "23" if preview else "20"])
        else:
            cmd.extend(["-preset", "p4", "-cq", "23"])

        cmd.extend(
            [
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
        return subprocess.run(cmd, capture_output=True, text=True, timeout=600, check=False)

    if prefer_hw_encoding:
        proc = _run_encode("h264_nvenc")
        if proc.returncode == 0 and output_path.is_file():
            return output_path

    proc = _run_encode("libx264")
    if proc.returncode != 0 or not output_path.is_file():
        raise RenderError(f"FFmpeg render failed: {proc.stderr.strip() or 'Unknown error'}")

    return output_path
