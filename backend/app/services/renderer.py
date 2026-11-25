import subprocess
from pathlib import Path

from app.core.config import find_binary


class RenderError(RuntimeError):
    """Raised when FFmpeg clip rendering fails."""


ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
    "4:5": (1080, 1350),
}


def compute_target_dimensions(
    ratio_w: int = 9,
    ratio_h: int = 16,
    preview: bool = False,
    short_edge_px: int = 1080,
) -> tuple[int, int]:
    """Compute even output dimensions with short_edge_px (or 540 in preview) on the short edge."""
    rw = max(1, int(ratio_w))
    rh = max(1, int(ratio_h))
    safe_short = max(360, min(2160, int(short_edge_px)))
    short_edge = min(540, safe_short) if preview else safe_short

    if rw <= rh:
        out_w = short_edge
        out_h = int(round(short_edge * (rh / rw)))
    else:
        out_h = short_edge
        out_w = int(round(short_edge * (rw / rh)))

    # Ensure even dimensions required by yuv420p / H.264
    out_w = max(2, (out_w // 2) * 2)
    out_h = max(2, (out_h // 2) * 2)
    return out_w, out_h


def get_target_dimensions(
    aspect_ratio: str,
    preview: bool = False,
    ratio_w: int | None = None,
    ratio_h: int | None = None,
    short_edge_px: int = 1080,
) -> tuple[int, int]:
    if ratio_w is not None and ratio_h is not None:
        return compute_target_dimensions(ratio_w, ratio_h, preview=preview, short_edge_px=short_edge_px)
    w, h = ASPECT_DIMENSIONS.get(aspect_ratio, (1080, 1920))
    if preview:
        return (w // 2 // 2) * 2, (h // 2 // 2) * 2
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
    ratio_w: int = 9,
    ratio_h: int = 16,
    zoom: float = 1.0,
    pan_x: float = 0.0,
    pan_y: float = 0.0,
    bg_mode: str = "black",
    resolution_p: int = 1080,
    target_fps: int | None = None,
    ass_path: Path | None = None,
    preview: bool = False,
    prefer_hw_encoding: bool = False,
) -> Path:
    """Trim, apply zoom/pan/bg_mode reframing, burn ASS subtitles, and export MP4."""
    ffmpeg = find_binary("ffmpeg")
    if not ffmpeg:
        raise RenderError("ffmpeg is not installed or not found in PATH.")

    duration = max(0.5, end_time - start_time)
    out_w, out_h = compute_target_dimensions(
        ratio_w, ratio_h, preview=preview, short_edge_px=resolution_p
    )
    safe_zoom = max(0.5, min(3.0, float(zoom)))
    safe_pan_x = max(-100.0, min(100.0, float(pan_x)))
    safe_pan_y = max(-100.0, min(100.0, float(pan_y)))
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if bg_mode == "blur":
        bg_filter = (
            f"[0:v]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
            f"crop={out_w}:{out_h},boxblur=25:5,setsar=1[bg]"
        )
    else:
        bg_filter = f"color=c=black:s={out_w}x{out_h}:d={duration:.3f},setsar=1[bg]"

    fg_filter = (
        f"[0:v]scale=w='max(2,trunc(iw*min({out_w}/iw,{out_h}/ih)*{safe_zoom:.4f}/2)*2)':"
        f"h='max(2,trunc(ih*min({out_w}/iw,{out_h}/ih)*{safe_zoom:.4f}/2)*2)',setsar=1[fg]"
    )

    overlay_expr = (
        f"[bg][fg]overlay=x=(W-w)/2+(W*{safe_pan_x:.4f}/100):"
        f"y=(H-h)/2+(H*{safe_pan_y:.4f}/100):shortest=1"
    )
    if ass_path is not None and ass_path.is_file():
        overlay_expr += f",ass='{_escape_ass_path_for_ffmpeg(ass_path)}'"
    overlay_expr += "[vout]"

    filter_complex = f"{bg_filter};{fg_filter};{overlay_expr}"

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
            "-filter_complex",
            filter_complex,
            "-map",
            "[vout]",
            "-map",
            "0:a?",
            "-c:v",
            vcodec,
        ]
        if vcodec == "libx264":
            cmd.extend(["-preset", "fast" if preview else "medium", "-crf", "23" if preview else "20"])
        else:
            cmd.extend(["-preset", "p4", "-cq", "23"])

        if target_fps is not None and target_fps > 0:
            cmd.extend(["-r", str(int(target_fps))])

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
