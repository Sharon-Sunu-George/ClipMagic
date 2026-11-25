import ctypes.util
import gc
import wave
from pathlib import Path
from typing import Any
import numpy as np


class TranscriptionError(RuntimeError):
    """Raised when Faster-Whisper transcription fails."""


def _has_cuda_12_cublas() -> bool:
    return ctypes.util.find_library("cublas64_12") is not None


def _load_wav_as_float32(audio_path: Path) -> np.ndarray:
    """Read a 16kHz mono 16-bit PCM WAV file into a float32 numpy array."""
    with wave.open(str(audio_path), "rb") as wf:
        frames = wf.readframes(wf.getnframes())
    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    return audio


def _load_model(model_size: str, device: str):
    from faster_whisper import WhisperModel

    if device == "cuda":
        return WhisperModel(model_size, device="cuda", compute_type="int8")
    if device == "cpu":
        return WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=4)

    # Auto mode: only attempt CUDA if cublas64_12.dll is actually present
    if _has_cuda_12_cublas():
        try:
            return WhisperModel(model_size, device="cuda", compute_type="int8")
        except Exception:
            pass
    return WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=4)


def transcribe_audio(
    audio_path: Path,
    model_size: str = "base",
    device: str = "auto",
) -> dict[str, Any]:
    """Transcribe a 16kHz WAV file using Faster-Whisper and return language + timestamped segments."""
    if not audio_path.is_file():
        raise TranscriptionError(f"Audio file not found: {audio_path}")

    model = None
    try:
        audio_array = _load_wav_as_float32(audio_path)
        try:
            model = _load_model(model_size=model_size, device=device)
            segments_iter, info = model.transcribe(
                audio_array,
                beam_size=5,
                word_timestamps=True,
                vad_filter=True,
            )
            segments_list = list(segments_iter)
        except Exception:
            if device != "auto":
                raise
            if model is not None:
                del model
                gc.collect()
            model = _load_model(model_size=model_size, device="cpu")
            segments_iter, info = model.transcribe(
                audio_array,
                beam_size=5,
                word_timestamps=True,
                vad_filter=True,
            )
            segments_list = list(segments_iter)

        segments: list[dict[str, Any]] = []
        for idx, seg in enumerate(segments_list):
            words = []
            if seg.words:
                for w in seg.words:
                    words.append(
                        {
                            "word": w.word,
                            "start": round(float(w.start), 3),
                            "end": round(float(w.end), 3),
                        }
                    )
            segments.append(
                {
                    "id": idx,
                    "start": round(float(seg.start), 3),
                    "end": round(float(seg.end), 3),
                    "text": seg.text.strip(),
                    "words": words,
                }
            )

        return {
            "language": getattr(info, "language", "en") or "en",
            "language_probability": round(float(getattr(info, "language_probability", 0.0)), 3),
            "segments": segments,
        }
    except Exception as exc:
        raise TranscriptionError(f"Transcription failed: {exc}") from exc
    finally:
        # Release model memory (important for 4GB VRAM)
        if model is not None:
            del model
        gc.collect()
