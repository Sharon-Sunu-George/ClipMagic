# ClipMagic

A local-first AI video clipping studio that converts long-form videos into short-form clips for **YouTube Shorts**, **Instagram Reels**, and **TikTok** — running locally without mandatory paid APIs or cloud subscriptions.

---

## Features

- **Video Import & Metadata:** Drag-and-drop or file-picker upload (`.mp4`, `.mov`, `.mkv`, `.webm`) with FFprobe metadata extraction, thumbnail generation, and 16 kHz mono WAV audio extraction.
- **Local Transcription:** Powered by **Faster-Whisper** (`tiny`, `base`, `small`) with automatic language detection, word-level timestamps, and automatic CPU fallback.
- **AI Highlight Detection:** Powered by **Ollama** (selectable local or cloud models) to identify standalone clips with titles, hooks, explanations, and scores, plus manual clip creation.
- **Clip Editor & ASS Subtitles:** Trim start/end timestamps, switch aspect ratios (`9:16`, `1:1`, `16:9`), and customize burned-in `.ass` subtitles (`clean`, `bold_keywords`, `karaoke`, `minimal`), font size, colour, and position.
- **MP4 Rendering & Export Management:** Background FFmpeg rendering (`H.264` + `AAC`, optional `h264_nvenc` with `libx264` fallback), live SSE job progress, in-app preview, and export history.

---

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router, Lucide Icons
- **Backend:** Python 3.12, FastAPI, Uvicorn, Pydantic, SQLAlchemy (SQLite)
- **Media & AI:** FFmpeg, FFprobe, Faster-Whisper, Ollama

---

## Prerequisites

- **Windows 11** (or Windows 10)
- **Python 3.12** (`py -3.12`)
- **Node.js 24+** & npm
- **FFmpeg & FFprobe** (e.g., `winget install --id Gyan.FFmpeg -e`)
- **Ollama** running locally at `http://127.0.0.1:11434` with at least one model pulled (e.g., `ollama pull qwen2.5-coder:3b`)

---

## Installation

### 1. Backend Setup
```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 2. Frontend Setup
```powershell
cd frontend
npm install
```

---

## Running Locally

### Start the Backend (`127.0.0.1:8000`)
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Start the Frontend (`127.0.0.1:5173`)
```powershell
cd frontend
npm run dev
```

Open **`http://127.0.0.1:5173`** in your browser.

---

## Running Tests

### Backend (`pytest`)
```powershell
cd backend
.\.venv\Scripts\pytest.exe -v
```

### Frontend Build Check
```powershell
cd frontend
npm run build
```

---

## Project Structure

```text
ClipMagic/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routers (health, dashboard, projects, clips, exports, jobs, settings)
│   │   ├── core/         # Configuration and binary lookup
│   │   ├── db/           # SQLite engine and session setup
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   └── services/     # FFmpeg media, Faster-Whisper, Ollama AI, ASS subtitles, renderer, job runner
│   ├── tests/            # Pytest test suite
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # Studio layout and navigation
│   │   ├── lib/          # API client
│   │   ├── pages/        # Dashboard, Projects, Create Clips, Exports, Settings
│   │   └── types/        # TypeScript API types
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

---

## Troubleshooting

- **`ffprobe` / `ffmpeg` not found:** Ensure `Gyan.FFmpeg` is installed via WinGet or `ffmpeg.exe`/`ffprobe.exe` are in your system `PATH`.
- **Ollama request timeout:** Select a lighter local model (such as `qwen2.5-coder:3b`) in **Create Clips** or **Settings**.
