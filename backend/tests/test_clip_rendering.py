import subprocess
from pathlib import Path

from app.core.config import find_binary
from app.services.media import probe_video
from app.services.renderer import render_clip_mp4
from app.services.subtitles import generate_ass_subtitles


def _create_sample_mp4(dest: Path) -> Path:
    ffmpeg = find_binary("ffmpeg")
    assert ffmpeg is not None, "ffmpeg must be installed for Phase 4 tests"
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=4:size=1280x720:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=4",
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
    assert proc.returncode == 0, proc.stderr
    return dest


def test_generate_ass_and_render_vertical_mp4(tmp_path: Path):
    source_mp4 = _create_sample_mp4(tmp_path / "source.mp4")
    ass_path = tmp_path / "captions.ass"
    output_mp4 = tmp_path / "vertical_out.mp4"

    segments = [
        {
            "id": 0,
            "start": 0.5,
            "end": 2.5,
            "text": "Hello ClipMagic!",
            "words": [
                {"word": "Hello", "start": 0.5, "end": 1.2},
                {"word": " ClipMagic!", "start": 1.2, "end": 2.5},
            ],
        }
    ]
    generate_ass_subtitles(
        segments=segments,
        clip_start=0.0,
        clip_end=3.0,
        output_path=ass_path,
        style_name="karaoke",
    )
    assert ass_path.is_file()
    assert "\\k" in ass_path.read_text(encoding="utf-8")

    render_clip_mp4(
        source_video=source_mp4,
        output_path=output_mp4,
        start_time=0.0,
        end_time=3.0,
        aspect_ratio="9:16",
        ass_path=ass_path,
        preview=False,
        prefer_hw_encoding=False,
    )
    assert output_mp4.is_file() and output_mp4.stat().st_size > 5000

    meta = probe_video(output_mp4)
    assert meta.width == 1080
    assert meta.height == 1920
    assert 2.5 <= meta.duration <= 3.5


def test_render_custom_ratio_zoom_pan_blur(tmp_path: Path):
    source_mp4 = _create_sample_mp4(tmp_path / "source.mp4")
    output_mp4 = tmp_path / "custom_4_5_blur.mp4"

    render_clip_mp4(
        source_video=source_mp4,
        output_path=output_mp4,
        start_time=0.0,
        end_time=2.0,
        aspect_ratio="4:5",
        ratio_w=4,
        ratio_h=5,
        zoom=1.5,
        pan_x=-10.0,
        pan_y=5.0,
        bg_mode="blur",
        preview=True,
        prefer_hw_encoding=False,
    )
    assert output_mp4.is_file() and output_mp4.stat().st_size > 2000
    meta = probe_video(output_mp4)
    assert meta.width == 540
    assert meta.height == 674

