# Changelog

All notable changes to **ClipMagic** are documented in this file.

## [1.0.0] — Windows Desktop Release
### Added
- **Tauri 2 Windows Desktop App (`ClipMagic.exe`):** Native desktop shell with automatic local FastAPI sidecar lifecycle management, health-check gating, and graceful shutdown.
- **PyInstaller Backend Sidecar (`build_sidecar.py` / `run_server.py`):** Packages FastAPI, Uvicorn, Faster-Whisper, FFmpeg, and FFprobe for standalone Windows distribution, storing user data in `%APPDATA%\ClipMagic` / `%LOCALAPPDATA%`.
- **Interactive Clip Editor:** Dual-thumb visual trim bar, `Set In` / `Set Out` playhead capture, `-0.5s` / `+0.5s` nudges, bounded `Loop Clip` preview, custom aspect ratios (`9:16`, `16:9`, `1:1`, `4:5`, `Custom`), drag-to-pan, zoom (`50%–300%`), `Black` / `Blur` background fill, and draggable ASS caption positioning (`X%` / `Y%`).
- **Export Controls:** Selectable output resolution (`480p`, `720p`, `1080p`, `1440p`), frame rate (`Source`, `24`, `30`, `60` fps), sequential **Batch Export**, direct browser download, and Windows Explorer folder selection.

## [0.1.0] — Local Web Studio MVP
### Added
- FastAPI + SQLite (`SQLAlchemy`) backend with background job runner and SSE progress updates.
- React + TypeScript + Vite + Tailwind CSS Studio Monochrome frontend.
- Local video upload (`.mp4`, `.mov`, `.mkv`, `.webm`), FFprobe metadata extraction, thumbnail generation, and 16 kHz mono WAV audio extraction.
- Faster-Whisper transcription with automatic CPU fallback and Ollama AI highlight detection with manual clip creation fallback.
- FFmpeg MP4 rendering with `.ass` subtitle burn-in (`clean`, `bold_keywords`, `karaoke`, `minimal`).
