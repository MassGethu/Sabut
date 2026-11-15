"""Workspace and event storage, independent of evidence files."""

from contextlib import contextmanager
from datetime import date, datetime, timezone
import json
from pathlib import Path
import sqlite3

from .geometry import finite_number, geometry_hash, validate_geometry


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def initialize(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS claims (
                claim_id TEXT PRIMARY KEY,
                season TEXT NOT NULL,
                claimed_method TEXT NOT NULL,
                farmer_name TEXT,
                claimed_acres REAL,
                reported_harvest_date TEXT,
                geometry TEXT NOT NULL,
                geometry_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS actions (
                id INTEGER PRIMARY KEY,
                claim_id TEXT NOT NULL REFERENCES claims (claim_id),
                action TEXT NOT NULL,
                reason TEXT NOT NULL,
                actor TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                overrides_recommendation INTEGER NOT NULL,
                recommendation TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS actions_by_claim ON actions (claim_id, id);
            CREATE TABLE IF NOT EXISTS review_requests (
                id INTEGER PRIMARY KEY,
                claim_id TEXT NOT NULL REFERENCES claims (claim_id),
                reason TEXT NOT NULL,
                language TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS requests_by_claim ON review_requests (claim_id, id);
        """)


@contextmanager
def connect(path: Path, *, write=False):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        with db:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
    finally:
        db.close()


def required_text(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string.")
    return value.strip()


def parse_date(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError("Expected a date in YYYY-MM-DD format.")
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Expected a date in YYYY-MM-DD format.")
    return parsed


def _parse_feature(feature):
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        raise ValueError("Each entry must be a GeoJSON Feature.")
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        raise ValueError("Feature properties must be an object.")
    claim_id = required_text(properties.get("claim_id"), "claim_id")
    if "/" in claim_id or claim_id in (".", ".."):
        raise ValueError("claim_id must work as a single URL path segment.")
    season = required_text(properties.get("season"), "season")
    method = properties.get("claimed_method")
    if method not in ("DSR", "PTR"):
        raise ValueError("claimed_method must be DSR or PTR.")
    name = properties.get("farmer_name")
    if name is not None:
        name = required_text(name, "farmer_name")
    acres = properties.get("claimed_acres")
    if acres is not None and (not finite_number(acres) or acres <= 0):
        raise ValueError("claimed_acres must be a finite positive number.")
    harvest = properties.get("reported_harvest_date")
    if harvest is not None:
        try:
            parse_date(harvest)
        except ValueError as exc:
            raise ValueError("reported_harvest_date must be an ISO date (YYYY-MM-DD).") from exc
    geometry = feature.get("geometry")
    validate_geometry(geometry)
    return claim_id, season, method, name, None if acres is None else float(acres), harvest, geometry, geometry_hash(geometry)


def import_claims(db, data):
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError("Expected a GeoJSON FeatureCollection with a features array.")
    if "crs" in data and data["crs"] is not None:
        raise ValueError("Use WGS84 GeoJSON longitude and latitude, without a custom CRS.")
    accepted = {}
    errors = []
    for index, feature in enumerate(data["features"]):
        properties = feature.get("properties") if isinstance(feature, dict) else None
        claim_id = properties.get("claim_id") if isinstance(properties, dict) else None
        try:
            claim_id, season, method, name, acres, harvest, geometry, digest = _parse_feature(feature)
            existing = db.execute(
                "SELECT season, geometry_hash FROM claims WHERE claim_id = ?", (claim_id,)
            ).fetchone()
            if existing and (existing["geometry_hash"] != digest or existing["season"] != season):
                raise ValueError("This claim ID already has a different boundary or season. Use a new claim ID for the revision.")
            db.execute("""
                INSERT INTO claims VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(claim_id) DO UPDATE SET claimed_method = excluded.claimed_method,
                    farmer_name = excluded.farmer_name, claimed_acres = excluded.claimed_acres,
                    reported_harvest_date = excluded.reported_harvest_date
            """, (claim_id, season, method, name, acres, harvest, json.dumps(geometry), digest))
            accepted[claim_id] = None
        except (ValueError, OverflowError) as exc:
            errors.append({"index": index, "claim_id": claim_id if isinstance(claim_id, str) else None, "message": str(exc)})
    return {"imported_ids": list(accepted), "errors": errors}


def claims(db):
    return [dict(row) for row in db.execute("SELECT * FROM claims ORDER BY claim_id")]


def action_history(db, claim_id):
    rows = db.execute(
        "SELECT id, action, reason, actor, timestamp, overrides_recommendation, recommendation "
        "FROM actions WHERE claim_id = ? ORDER BY id DESC", (claim_id,)
    )
    return [
        {
            **dict(row),
            "overrides_recommendation": bool(row["overrides_recommendation"]),
            "recommendation": json.loads(row["recommendation"]),
        }
        for row in rows
    ]


def save_action(db, claim_id, action, reason, actor, recommendation):
    timestamp = utc_timestamp()
    overrides = action != recommendation["next_action"]
    cursor = db.execute(
        "INSERT INTO actions (claim_id, action, reason, actor, timestamp, overrides_recommendation, recommendation) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (claim_id, action, reason, actor, timestamp, overrides, json.dumps(recommendation)),
    )
    return {
        "id": cursor.lastrowid, "action": action, "reason": reason, "actor": actor,
        "timestamp": timestamp, "overrides_recommendation": overrides, "recommendation": recommendation,
    }


def review_requests(db, claim_id):
    return [
        {**dict(row), "simulated": True}
        for row in db.execute(
            "SELECT id, reason, language, timestamp FROM review_requests WHERE claim_id = ? ORDER BY id DESC", (claim_id,)
        )
    ]


def save_review_request(db, claim_id, reason, language):
    timestamp = utc_timestamp()
    cursor = db.execute(
        "INSERT INTO review_requests (claim_id, reason, language, timestamp) VALUES (?, ?, ?, ?)",
        (claim_id, reason, language, timestamp),
    )
    return {"id": cursor.lastrowid, "reason": reason, "language": language, "timestamp": timestamp, "simulated": True}
