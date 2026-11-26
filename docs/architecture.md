# ClipMagic Architecture

ClipMagic is structured as a local-first three-layer desktop and web application:

1. **Desktop Shell (`frontend/src-tauri/`)**
   - Tauri 2 (`Rust`) manages the native Windows window and spawns the packaged FastAPI backend (`clipmagic-backend`) on a free `127.0.0.1:<port>`.
   - Polls `/api/health` before unlocking the UI and terminates the backend child process gracefully on exit.

2. **Frontend (`frontend/src/`)**
   - React 19, TypeScript, Vite, Tailwind CSS, React Router, and `lucide-react`.
   - `frontend/src/lib/api.ts` automatically routes requests through Vite's `/api` proxy in web dev mode or `http://127.0.0.1:<port>/api` in Tauri desktop mode.

3. **Backend & Media Pipeline (`backend/app/`)**
   - **API Routers (`app/api/`):** `health`, `dashboard`, `projects`, `clips`, `exports`, `jobs` (SSE), `settings`.
   - **Background Jobs (`app/services/job_runner.py`):** Separate `ingest_executor` (FFmpeg/FFprobe metadata, thumbnails, audio extraction, MP4 export) and `ai_executor` (Faster-Whisper transcription, Ollama highlight detection) so heavy AI inference never blocks video uploads or exports.
   - **Storage:** SQLite (`clipmagic.db`) + local `storage/` (`uploads/`, `thumbnails/`, `audio/`, `exports/`, `temp/`), routed to `%APPDATA%\ClipMagic` in packaged desktop builds.
