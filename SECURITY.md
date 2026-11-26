# Security Policy

## Local-First Architecture

ClipMagic is designed to run locally on the user's machine:
- **Loopback Binding:** The FastAPI backend binds exclusively to `127.0.0.1` and is not exposed to external network interfaces.
- **Strict CORS:** Only local development (`127.0.0.1:5173`, `localhost:5173`) and Tauri desktop origins (`tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`) are permitted.
- **Path Safety:** Uploaded files use generated UUID filenames, and file-serving/deletion endpoints validate paths against managed storage directories (`is_relative_to`) to prevent path traversal.
- **Subprocess Safety:** FFmpeg and FFprobe commands execute using explicit argument lists without shell interpolation.
- **Minimal Tauri Capabilities:** Desktop permissions are scoped to `core:default` and `dialog:default` in `frontend/src-tauri/capabilities/default.json`.

## Reporting a Vulnerability

If you discover a security issue, please open a private security advisory on GitHub (`https://github.com/Sharon-Sunu-George/ClipMagic/security/advisories`) rather than posting exploit details in a public issue.
