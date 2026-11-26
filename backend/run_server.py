import argparse
import os
import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="ClipMagic Local Backend Server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Bind port (default: 8000)")
    parser.add_argument("--data-dir", default=None, help="Override mutable data directory")
    args = parser.parse_args()

    if args.data_dir:
        os.environ["CLIPMAGIC_DATA_DIR"] = args.data_dir

    from app.main import app

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        log_level="info",
        reload=False,
    )


if __name__ == "__main__":
    main()
