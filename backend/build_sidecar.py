import subprocess
import sys
from pathlib import Path

from app.core.config import find_binary


def main() -> None:
    backend_dir = Path(__file__).resolve().parent
    binaries_dir = backend_dir.parent / "frontend" / "src-tauri" / "binaries"
    binaries_dir.mkdir(parents=True, exist_ok=True)

    ffmpeg = find_binary("ffmpeg")
    ffprobe = find_binary("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("ffmpeg and ffprobe must be installed to bundle the backend sidecar.")

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "clipmagic-backend-x86_64-pc-windows-msvc",
        "--distpath",
        str(binaries_dir),
        "--add-binary",
        f"{ffmpeg};ffmpeg",
        "--add-binary",
        f"{ffprobe};ffmpeg",
        "--hidden-import",
        "app.main",
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.loops.auto",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.lifespan.on",
        "--collect-all",
        "faster_whisper",
        "--collect-all",
        "ctranslate2",
        str(backend_dir / "run_server.py"),
    ]
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, cwd=str(backend_dir), check=True)
    print("Built sidecar:", binaries_dir / "clipmagic-backend-x86_64-pc-windows-msvc.exe")


if __name__ == "__main__":
    main()
