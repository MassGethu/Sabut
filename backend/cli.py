"""Start the local demo or archive its default workspace before a reset."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import os
from pathlib import Path

import uvicorn

from .main import ROOT, create_app


DEFAULT_DATABASE = ROOT / ".sabut" / "workspace.sqlite3"


@contextmanager
def workspace_lock(database):
    database.parent.mkdir(parents=True, exist_ok=True)
    lock = database.with_suffix(database.suffix + ".lock")
    with lock.open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise SystemExit("The workspace is in use. Stop the running Sabūt server first.") from exc
        yield


def serve(port):
    dist = ROOT / "frontend" / "dist"
    if not (dist / "index.html").is_file():
        raise SystemExit("The presenting build is missing. Run make install first.")
    database = Path(os.environ.get("SABUT_DB_PATH", DEFAULT_DATABASE)).resolve()
    with workspace_lock(database):
        uvicorn.run(create_app(database=database, frontend_dist=dist), host="127.0.0.1", port=port)


def reset_demo():
    if "SABUT_DB_PATH" in os.environ:
        raise SystemExit("Reset is scoped to the default demo workspace. Run it without SABUT_DB_PATH.")
    backup_dir = DEFAULT_DATABASE.parent / "backups"
    if DEFAULT_DATABASE.parent.is_symlink() or DEFAULT_DATABASE.is_symlink() or backup_dir.is_symlink():
        raise SystemExit("Reset requires the standard local demo directory and database.")
    with workspace_lock(DEFAULT_DATABASE):
        if not DEFAULT_DATABASE.exists():
            print("The demo workspace is already empty.")
            return
        if not DEFAULT_DATABASE.is_file():
            raise SystemExit("The demo workspace is not a regular database file.")
        suffixes = ("-journal", "-wal", "-shm")
        if any(Path(str(DEFAULT_DATABASE) + suffix).exists() for suffix in suffixes):
            raise SystemExit("SQLite recovery files are present. Start and stop Sabūt cleanly before resetting.")
        backup_dir.mkdir(exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = backup_dir / f"workspace-{timestamp}.sqlite3"
        DEFAULT_DATABASE.replace(backup)
        print(f"Demo workspace reset. Previous database: {backup}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    server = commands.add_parser("serve")
    server.add_argument("--port", type=int, default=os.environ.get("SABUT_PORT", "8000"))
    commands.add_parser("reset-demo")
    args = parser.parse_args()
    if args.command == "serve":
        if not 1 <= args.port <= 65535:
            parser.error("Port must be between 1 and 65535.")
        serve(args.port)
    else:
        reset_demo()


if __name__ == "__main__":
    main()
