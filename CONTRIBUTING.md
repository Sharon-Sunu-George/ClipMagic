# Contributing to ClipMagic

Thank you for your interest in contributing to **ClipMagic**.

## Development Setup

### Prerequisites
- **Windows 10/11**
- **Python 3.12** (`py -3.12`)
- **Node.js 24+** and `npm`
- **FFmpeg & FFprobe** (e.g., `winget install --id Gyan.FFmpeg -e`)
- **Rust & MSVC Build Tools** (only required when building or running the Tauri 2 desktop app)
- **Ollama** (optional, for AI highlight detection)

### Running Locally

1. **Backend (`127.0.0.1:8000`)**
   ```powershell
   cd backend
   py -3.12 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

2. **Frontend (`127.0.0.1:5173`)**
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

3. **Tauri Desktop Dev Mode**
   ```powershell
   cd frontend
   npm run tauri dev
   ```

## Verification Before Opening a Pull Request

Run both backend tests and frontend typecheck/build:

```powershell
# Backend tests
cd backend
.\.venv\Scripts\pytest.exe -v

# Frontend build
cd ..\frontend
npm run build
```

## Guidelines
- Keep API changes backwards-compatible with existing endpoints.
- Never commit `.env`, SQLite databases (`*.db`), uploaded videos, exported clips, or `node_modules`/`.venv` artifacts.
- Keep subprocess calls argument-list based (never `shell=True`).
