"""Vercel entry point: the whole Sabūt API as one Python function.

Set DATABASE_URL (Supabase Postgres, transaction pooler) in the Vercel project; the
built frontend is served by Vercel from frontend/dist and /api/* is rewritten here.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if not os.environ.get("DATABASE_URL"):
    # Without Postgres the function falls back to a throwaway SQLite file; state will not persist.
    os.environ.setdefault("SABUT_DB_PATH", "/tmp/sabut.sqlite3")

from backend.main import app  # noqa: E402  (path set above)

__all__ = ["app"]
