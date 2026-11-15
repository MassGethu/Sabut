"""FastAPI entry point for the offline Sabūt workspace."""

from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, StringConstraints

from . import storage
from .evidence import EvidenceCatalog, QualitySettings, read_artifact
from .policy import PolicySettings, build_queue


ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "backend" / "fixtures"
Budget = Annotated[int, Query(ge=0)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class OfficerAction(BaseModel):
    action: Literal["desk_review", "request_field_visit", "request_boundary_correction", "request_records"]
    reason: Text
    actor: Text


class ReviewRequest(BaseModel):
    reason: Text
    language: Literal["hi", "pa", "en"]


def settings_from_environment():
    min_dates = int(os.environ.get("SABUT_MIN_USABLE_DATES", "5"))
    min_coverage = float(os.environ.get("SABUT_MIN_VALID_FRACTION", "0.70"))
    max_gap = int(os.environ.get("SABUT_MAX_GAP_DAYS", "24"))
    multiplier = float(os.environ.get("SABUT_ACREAGE_MULTIPLIER", "4000"))
    if min_dates < 1 or not 0 <= min_coverage <= 1 or max_gap < 1 or not 0 < multiplier < float("inf"):
        raise ValueError("Invalid Sabūt evidence gates or acreage multiplier.")
    return PolicySettings(QualitySettings(min_dates, min_coverage, max_gap), multiplier)


def create_app(*, database=None, demo_dir=None, reports_dir=None, frontend_dist=None, settings=None):
    # DATABASE_URL (Postgres, e.g. Supabase) wins for hosted deploys; otherwise a local SQLite file.
    database = database or os.environ.get("DATABASE_URL") or Path(os.environ.get("SABUT_DB_PATH", ROOT / ".sabut" / "workspace.sqlite3"))
    demo_dir = Path(demo_dir or ROOT / "demo")
    reports_dir = Path(reports_dir or ROOT / "reports")
    frontend_dist = Path(frontend_dist or ROOT / "frontend" / "dist")
    settings = settings or settings_from_environment()

    @asynccontextmanager
    async def lifespan(_app):
        storage.initialize(database)
        yield

    app = FastAPI(title="Sabūt", version="1", lifespan=lifespan)
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    def queue(db, budget):
        catalog = EvidenceCatalog.from_files(demo_dir, reports_dir, FIXTURES)
        return build_queue(storage.claims(db), budget, catalog, settings)

    def get_claim(db, claim_id):
        claim = db.execute("SELECT * FROM claims WHERE claim_id = ?", (claim_id,)).fetchone()
        if claim is None:
            raise HTTPException(status_code=404, detail="Claim not found.")
        return dict(claim)

    def selected_decision(db, claim_id, budget):
        return next(decision for decision in queue(db, budget) if decision.item["claim_id"] == claim_id)

    def import_data(data):
        try:
            with storage.connect(database, write=True) as db:
                return storage.import_claims(db, data)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    def demo_batch():
        integrated = demo_dir / "claims.geojson"
        return integrated if integrated.is_file() else FIXTURES / "claims.geojson"

    @app.get("/api/health")
    def health():
        with storage.connect(database) as db:
            db.execute("SELECT 1 FROM claims LIMIT 1")
        return {"status": "ok"}

    @app.post("/api/claims/import")
    def import_claims(data: Annotated[Any, Body()]):
        return import_data(data)

    @app.post("/api/demo/load")
    def load_demo():
        artifact = read_artifact(demo_batch())
        if artifact is None:
            raise HTTPException(status_code=503, detail="The local demo claim batch is unavailable.")
        return import_data(artifact)

    @app.get("/api/queue")
    def get_queue(budget: Budget = 1):
        with storage.connect(database) as db:
            return {"budget": budget, "items": [decision.item for decision in queue(db, budget)]}

    def detail(db, claim, decision, actions=None, requests=None):
        claim_id = claim["claim_id"]
        return {
            **decision.item, "geometry": json.loads(claim["geometry"]),
            "farmer_name": claim["farmer_name"],
            "reported_harvest_date": claim["reported_harvest_date"],
            "evidence": decision.evidence, "real_evidence": decision.real_evidence, "model": decision.model,
            "actions": storage.action_history(db, claim_id) if actions is None else actions.get(claim_id, []),
            "review_requests": storage.review_requests(db, claim_id) if requests is None else requests.get(claim_id, []),
        }

    @app.get("/api/claims")
    def claim_details(budget: Budget = 1):
        """Every claim's detail in queue order, built from one queue pass."""
        with storage.connect(database) as db:
            db.execute("BEGIN")
            rows = {row["claim_id"]: dict(row) for row in db.execute("SELECT * FROM claims")}
            actions, requests = storage.all_action_history(db), storage.all_review_requests(db)
            items = [detail(db, rows[d.item["claim_id"]], d, actions, requests) for d in queue(db, budget)]
            return {"budget": budget, "items": items}

    @app.get("/api/claims/{claim_id}")
    def claim_detail(claim_id: str, budget: Budget = 1):
        with storage.connect(database) as db:
            db.execute("BEGIN")
            claim = get_claim(db, claim_id)
            return detail(db, claim, selected_decision(db, claim_id, budget))

    @app.post("/api/claims/{claim_id}/actions", status_code=201)
    def record_action(claim_id: str, data: OfficerAction, budget: Budget = 1):
        with storage.connect(database, write=True) as db:
            get_claim(db, claim_id)
            decision = selected_decision(db, claim_id, budget)
            snapshot = {
                **decision.item,
                "evidence_source_kind": decision.evidence["source_kind"] if decision.evidence else None,
                "model_version": decision.model.get("model_version") if decision.model else None,
                "dsr_score": decision.score,
            }
            return storage.save_action(db, claim_id, data.action, data.reason, data.actor, snapshot)

    @app.post("/api/claims/{claim_id}/review-requests", status_code=201)
    def record_review_request(claim_id: str, data: ReviewRequest):
        with storage.connect(database, write=True) as db:
            get_claim(db, claim_id)
            return storage.save_review_request(db, claim_id, data.reason, data.language)

    @app.get("/api/benchmark")
    def get_benchmark():
        benchmark = read_artifact(reports_dir / "benchmark.json")
        replay = read_artifact(reports_dir / "replay.json")
        available = [isinstance(artifact, dict) for artifact in (benchmark, replay)]
        status = "ready" if all(available) else "partial" if any(available) else "pending"
        return {
            "status": status, "benchmark": benchmark if available[0] else None,
            "replay": replay if available[1] else None,
            "message": {
                "ready": None,
                "partial": "One cached report is available. The other report is pending.",
                "pending": "Benchmark and replay reports are pending.",
            }[status],
        }

    @app.get("/demo/claims.geojson", include_in_schema=False)
    def download_demo():
        return FileResponse(demo_batch(), media_type="application/geo+json", filename="claims.geojson")

    @app.get("/", include_in_schema=False)
    def presenting_build():
        entry = frontend_dist / "index.html"
        if entry.is_file():
            return FileResponse(entry)
        raise HTTPException(status_code=503, detail="Build the frontend to open the presenting UI. The local API is available.")

    if frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=frontend_dist), name="frontend")
    return app


app = create_app()
