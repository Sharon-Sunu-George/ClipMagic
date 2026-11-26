<div align="center">
  <img src="frontend/public/favicon.svg" alt="ClipMagic Logo" width="64" height="64" />
  <h1>ClipMagic</h1>
  <p><strong>A local-first AI video clipping studio for converting long-form videos into short-form clips.</strong></p>
  <p>
    <a href="https://github.com/Sharon-Sunu-George/ClipMagic/releases/latest"><strong>Download Latest Windows Release</strong></a>
    &nbsp;·&nbsp;
    <a href="docs/architecture.md">Architecture</a>
    &nbsp;·&nbsp;
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</div>

---

## Overview

**ClipMagic** turns long-form videos (podcasts, interviews, gaming, tutorials, commentary) into vertical, square, or landscape clips for **YouTube Shorts**, **Instagram Reels**, and **TikTok** — running locally on Windows without mandatory cloud subscriptions or paid APIs.

---

## Download (Windows Desktop)

A packaged Windows x64 installer (`ClipMagic_0.1.0_x64-setup.exe`) is available on the Releases page:

- **Latest Installer:** https://github.com/Sharon-Sunu-George/ClipMagic/releases/latest

The desktop build bundles the React frontend, FastAPI backend, Faster-Whisper runtime, and FFmpeg/FFprobe binaries. User projects, SQLite metadata, and exported clips are stored in your local Windows application data directory (`%APPDATA%\ClipMagic` / `%LOCALAPPDATA%`).

---

## Features

- **Local Video Import:** Drag-and-drop or browse `.mp4`, `.mov`, `.mkv`, and `.webm` files with FFprobe metadata extraction (duration, resolution, FPS), thumbnail generation, and 16 kHz mono WAV audio extraction.
- **Local Transcription:** Powered by **Faster-Whisper** (`tiny`, `base`, `small`) with automatic language detection, word-level timestamps, and automatic CPU fallback when CUDA runtime DLLs are unavailable.
- **AI Highlight Detection (Optional Ollama):** Analyses timestamped transcripts via local **Ollama** models to suggest standalone clips with titles, hooks, explanations, captions, and heuristic scores. Includes manual clip creation when Ollama is offline.
- **Interactive Clip Editor:**
  - Dual-thumb visual trim bar, `Set In` / `Set Out` playhead capture, `-0.5s` / `+0.5s` nudges, and bounded `Loop Clip` preview.
  - Preset aspect ratios (`9:16`, `16:9`, `1:1`, `4:5`) plus custom `W:H` ratios.
  - Drag-to-pan reframing, scroll/slider zoom (`50%–300%`), and `Solid Black` or `Blurred Video` background fill.
- **Customizable ASS Subtitles:** Burned-in `.ass` captions (`Clean`, `Bold Keywords`, `Karaoke`, `Minimal`) with draggable `X%` / `Y%` positioning, font size, and colour controls.
- **Export & Batch Rendering:** Render MP4 (`H.264` + `AAC`) at `480p`, `720p`, `1080p`, or `1440p` and `Source`, `24`, `30`, or `60` fps, with sequential **Batch Export** for approved clips, in-app preview, direct download, and Explorer folder access.

---

## How ClipMagic Works

1. **Import:** Upload a video locally; FFprobe extracts stream metadata and FFmpeg generates a thumbnail and 16 kHz mono audio track in the background.
2. **Transcribe:** Faster-Whisper generates a timestamped transcript stored in SQLite so it is not regenerated on reopen.
3. **Discover Clips:** Ollama identifies standalone highlight segments within your configured min/max duration (or create clips manually).
4. **Edit & Export:** Reframe, trim, position captions, and render MP4s via FFmpeg with real-time Server-Sent Events (SSE) progress.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Desktop Shell** | Tauri 2, Rust |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, React Router, Lucide Icons |
| **Backend** | Python 3.12, FastAPI, Uvicorn, Pydantic, SQLAlchemy (SQLite) |
| **Media & AI** | FFmpeg, FFprobe, Faster-Whisper (`ctranslate2`), Ollama (optional) |

---

## System Requirements

### Windows Desktop App
- Windows 10 / Windows 11 (64-bit)
- Microsoft Edge WebView2 Runtime (pre-installed on Windows 11)
- Optional: **Ollama** installed locally for AI highlight detection
- Optional: NVIDIA GPU (4 GB+ VRAM) for hardware-accelerated inference/encoding (CPU fallback is built in)

### From-Source Development
- Python **3.12** (`py -3.12`)
- Node.js **24+** and `npm`
- **FFmpeg & FFprobe** on `PATH` (or installed via WinGet `Gyan.FFmpeg`)
- **Rust** + **Visual Studio 2022 Build Tools** (for Tauri desktop builds)

---

## Development Setup

### 1. Clone the Repository
```powershell
git clone https://github.com/Sharon-Sunu-George/ClipMagic.git
cd ClipMagic
```

### 2. Backend Setup
```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Start the FastAPI server (`127.0.0.1:8000`):
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Setup
In a second PowerShell terminal:
```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

### 4. Tauri Desktop Development & Packaging
Run ClipMagic in a native Tauri window during development:
```powershell
cd frontend
npm run tauri dev
```

To build the production Windows installer (`ClipMagic_0.1.0_x64-setup.exe`):
```powershell
# 1. Package FastAPI + FFmpeg sidecar (requires PyInstaller in backend\.venv)
cd backend
.\.venv\Scripts\python.exe build_sidecar.py

# 2. Build Tauri desktop executable and NSIS installer
cd ..\frontend
npm run tauri build
```

---

## AI Models & FFmpeg

- **Faster-Whisper:** Model weights (`tiny`, `base`, `small`) are downloaded on first transcription into your local Hugging Face cache and are not bundled inside the installer.
- **Ollama (Optional):** Install from [ollama.com](https://ollama.com), ensure it is running on `http://127.0.0.1:11434`, and pull a local model such as:
  ```powershell
  ollama pull qwen2.5-coder:3b
  ```
- **FFmpeg:** In development, install via WinGet (`winget install --id Gyan.FFmpeg -e`). In the packaged desktop build, `ffmpeg.exe` and `ffprobe.exe` are bundled inside the backend sidecar.

---

## Project Structure

```text
ClipMagic/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI routers (health, dashboard, projects, clips, exports, jobs, settings)
│   │   ├── core/             # Configuration, data-dir resolution, and binary lookup
│   │   ├── db/               # SQLite engine and session management
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   └── services/         # Media probing, Faster-Whisper, Ollama AI, ASS subtitles, FFmpeg renderer, job runner
│   ├── tests/                # Pytest test suite
│   ├── build_sidecar.py      # PyInstaller sidecar packager
│   ├── run_server.py         # Packaged backend entrypoint
│   └── requirements.txt
├── frontend/
│   ├── public/               # App logo and favicon
│   ├── src/
│   │   ├── components/       # Studio layout and sidebar navigation
│   │   ├── lib/              # API client & Tauri URL resolver
│   │   ├── pages/            # Dashboard, Projects, Create Clips, Exports, Settings
│   │   └── types/            # TypeScript API definitions
│   └── src-tauri/            # Tauri 2 Rust host, capabilities, icons, and config
├── docs/
│   └── architecture.md
├── .env.example
├── .gitignore
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── SECURITY.md
└── README.md
```

---

## Privacy & Local Processing

- Uploaded videos, generated thumbnails, audio tracks, SQLite metadata, and exported MP4s remain on your local machine.
- The backend binds exclusively to `127.0.0.1`.
- No video files are sent to external servers unless you explicitly select a remote `:cloud` model in Ollama.

---

## Troubleshooting

- **`ffprobe` / `ffmpeg` not found in development:** Install `Gyan.FFmpeg` via WinGet and open a fresh PowerShell terminal.
- **Ollama request timed out:** Switch to a smaller local model (e.g., `qwen2.5-coder:3b`) in **Create Clips** or **Settings**, or add clips manually.
- **CUDA DLL missing for Whisper:** Leave **Whisper Compute Device** set to `Auto`; ClipMagic automatically falls back to CPU `int8`.

---

## Roadmap

- Speaker-aware smart reframing for multi-person podcasts
- Transcript word-level text editing before subtitle burn-in
- Custom font family selection for ASS subtitles

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

ClipMagic is licensed under the [MIT License](LICENSE).
