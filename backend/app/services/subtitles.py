from pathlib import Path
from typing import Any


def _format_ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        secs += 1
        cs = 0
    return f"{hrs}:{mins:02d}:{secs:02d}.{cs:02d}"


def _hex_to_ass_color(hex_color: str) -> str:
    """Convert #RRGGBB to ASS &H00BBGGRR&."""
    clean = hex_color.strip().lstrip("#")
    if len(clean) != 6:
        return "&H00FFFFFF"
    r, g, b = clean[0:2], clean[2:4], clean[4:6]
    return f"&H00{b.upper()}{g.upper()}{r.upper()}"


def generate_ass_subtitles(
    segments: list[dict[str, Any]],
    clip_start: float,
    clip_end: float,
    output_path: Path,
    *,
    play_res_x: int = 1080,
    play_res_y: int = 1920,
    style_name: str = "clean",
    font_size: int = 58,
    primary_hex: str = "#FFFFFF",
    position: str = "bottom",
    caption_x: float = 50.0,
    caption_y: float = 82.0,
) -> Path:
    """Generate an ASS subtitle file for a trimmed clip."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    primary_color = _hex_to_ass_color(primary_hex)
    highlight_color = "&H0000D4FF"  # Amber/gold highlight in BGR
    outline = 3 if style_name != "minimal" else 1
    shadow = 1 if style_name != "minimal" else 0
    bold = -1 if style_name in {"bold_keywords", "karaoke"} else 0

    # Scale font_size proportionally to PlayResY (reference height = 1920)
    scaled_font_size = max(14, int(round(font_size * (play_res_y / 1920.0))))

    alignment = {"bottom": 2, "middle": 5, "top": 8}.get(position, 2)
    margin_v = int(play_res_y * 0.12) if position != "middle" else 20

    pos_x = int(round(play_res_x * max(5.0, min(95.0, caption_x)) / 100.0))
    pos_y = int(round(play_res_y * max(5.0, min(95.0, caption_y)) / 100.0))
    pos_tag = f"{{\\an5\\pos({pos_x},{pos_y})}}"

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,{scaled_font_size},{primary_color},{highlight_color},&H00000000,&H64000000,{bold},0,0,0,100,100,0,0,1,{outline},{shadow},{alignment},60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events: list[str] = []
    for seg in segments:
        seg_start = float(seg.get("start", 0.0))
        seg_end = float(seg.get("end", 0.0))
        if seg_end <= clip_start or seg_start >= clip_end:
            continue

        rel_start = max(0.0, seg_start - clip_start)
        rel_end = min(clip_end - clip_start, seg_end - clip_start)
        if rel_end <= rel_start:
            continue

        text = str(seg.get("text", "")).strip()
        if not text:
            continue

        words = seg.get("words") or []
        if style_name == "karaoke" and words:
            parts: list[str] = []
            for w in words:
                w_start = max(clip_start, float(w.get("start", seg_start)))
                w_end = min(clip_end, float(w.get("end", seg_end)))
                if w_end <= w_start:
                    continue
                dur_cs = max(1, int(round((w_end - w_start) * 100)))
                parts.append(f"{{\\k{dur_cs}}}{w.get('word', '')}")
            line_text = "".join(parts).strip() or text
        else:
            line_text = text

        events.append(
            f"Dialogue: 0,{_format_ass_time(rel_start)},{_format_ass_time(rel_end)},Default,,0,0,0,,{pos_tag}{line_text}"
        )

    output_path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return output_path
