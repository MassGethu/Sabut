"""Read cached evidence and recompute the observation gates from actual scenes."""

from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import logging
import math
from pathlib import Path

from .geometry import finite_number
from .storage import parse_date


LOGGER = logging.getLogger(__name__)


def read_artifact(path: Path):
    def reject_constant(value):
        raise ValueError(f"Unexpected nonfinite JSON constant: {value}")

    def parse_float(value):
        number = float(value)
        if not math.isfinite(number):
            reject_constant(value)
        return number

    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle, parse_constant=reject_constant, parse_float=parse_float)
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        LOGGER.exception("Could not read cached artifact %s", path.name)
        return None


def cache_key(record):
    return tuple(record.get(field) for field in ("claim_id", "season", "geometry_hash"))


def index_records(artifact, source_kind):
    index = {}
    duplicates = set()
    if not isinstance(artifact, dict) or artifact.get("schema_version") != 1:
        return index
    records = artifact.get("records")
    if not isinstance(records, list):
        return index
    for record in records:
        if not isinstance(record, dict) or record.get("source_kind") != source_kind:
            continue
        key = cache_key(record)
        if all(isinstance(value, str) and value for value in key):
            if key in index:
                duplicates.add(key)
            index[key] = record
    for key in duplicates:
        del index[key]
    return index


@dataclass(frozen=True)
class EvidenceCatalog:
    real: dict
    simulated: dict
    model_manifest: dict | None = None

    @classmethod
    def from_files(cls, demo_dir, reports_dir, fixture_dir):
        real = read_artifact(demo_dir / "evidence.json")
        simulation = read_artifact(demo_dir / "workflow-simulation.json")
        if simulation is None:
            simulation = read_artifact(fixture_dir / "workflow-simulation.json")
        return cls(
            index_records(real, "sentinel1_real"),
            index_records(simulation, "simulated"),
            read_artifact(reports_dir / "model-manifest.json"),
        )

    def for_claim(self, claim):
        key = cache_key(claim)
        return self.real.get(key), self.simulated.get(key)


@dataclass(frozen=True)
class QualitySettings:
    min_usable_dates: int = 5
    min_valid_fraction: float = 0.70
    max_gap_days: int = 24


def _acquisition_date(value):
    try:
        acquired = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if acquired.utcoffset() != timedelta(0):
        return None
    return acquired.date()


def _observation_reason(row, start, end, settings):
    acquired = _acquisition_date(row.get("acquired_at"))
    if acquired is None or not start <= acquired <= end:
        return acquired, "Missing UTC acquisition timestamp or date outside the evidence window."
    if not isinstance(row.get("scene_id"), str) or not row["scene_id"].strip():
        return acquired, "Missing source scene ID."
    if not all(finite_number(row.get(band)) for band in ("vv", "vh")):
        return acquired, "Missing valid VV or VH measurements."
    coverage = row.get("valid_fraction")
    if not finite_number(coverage) or not settings.min_valid_fraction <= coverage <= 1:
        return acquired, f"Valid plot coverage is below {settings.min_valid_fraction:.0%} or unavailable."
    if row.get("usable") is not True:
        reason = row.get("reason")
        return acquired, reason if isinstance(reason, str) and reason else "The source marked this acquisition unusable."
    return acquired, None


def _failed(code, reason, next_action="request_records"):
    return {"criterion": code, "reason": reason, "next_action": next_action}


def assess_observations(record, settings):
    result = {**record, "usable_count": 0, "observations": [], "gaps": []}
    producer_gate = record.get("quality_gate")
    producer_gate = producer_gate if isinstance(producer_gate, dict) else {}
    gate = {
        **producer_gate,
        "min_usable_dates": settings.min_usable_dates,
        "min_valid_fraction": settings.min_valid_fraction,
        "max_gap_days": settings.max_gap_days,
        "longest_gap_days": None,
        "failed_criterion": None,
    }
    result["quality_gate"] = gate
    flags = record.get("quality_flags")
    flags = flags if isinstance(flags, list) else []
    boundary_codes = {"invalid_boundary", "boundary_unusable", "plot_too_small", "boundary_too_small"}
    boundary_flags = []
    for flag in flags:
        code = flag.get("code") if isinstance(flag, dict) else flag
        if isinstance(code, str) and code in boundary_codes:
            boundary_flags.append(flag)
    failure = None
    if record.get("boundary_usable") is False or boundary_flags:
        detail = next(
            (flag["detail"] for flag in boundary_flags if isinstance(flag, dict) and isinstance(flag.get("detail"), str) and flag["detail"].strip()),
            None,
        )
        failure = _failed(
            "boundary_quality",
            detail or "The cached extraction flags this plot boundary as unsuitable. Supply a corrected plot boundary.",
            "request_boundary_correction",
        )
    rows = record.get("observations")
    rows = rows if isinstance(rows, list) else []
    try:
        window = record["window"]
        start, end = parse_date(window["start"]), parse_date(window["end"])
        if start >= end:
            raise ValueError("Invalid evidence window")
    except (KeyError, TypeError, ValueError):
        failure = failure or _failed("invalid_observation_window", "The cached evidence has no valid sowing window. Request dated sowing records or a corrected extraction.")
        result["observations"] = [
            dict(row, usable=False, reason="No valid evidence window for this acquisition.")
            for row in rows if isinstance(row, dict)
        ]
        gate.update(failed_criterion=failure["criterion"], passes=False)
        return result, failure

    usable_dates = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        acquired, reason = _observation_reason(row, start, end, settings)
        if reason is None:
            usable_dates.add(acquired)
        result["observations"].append(
            {**row, "usable": reason is None, "reason": reason}
        )
    result["usable_count"] = len(usable_dates)
    edges = [start, *sorted(usable_dates), end]
    producer_gaps = {
        (gap["start"], gap["end"]): gap for gap in record.get("gaps") or []
        if isinstance(gap, dict) and isinstance(gap.get("start"), str) and isinstance(gap.get("end"), str)
    }
    longest_gap = 0
    over_limit = []
    for previous, following in zip(edges, edges[1:]):
        days = (following - previous).days
        longest_gap = max(longest_gap, days)
        interval = (previous.isoformat(), following.isoformat())
        if days > settings.max_gap_days:
            gap = {
                "start": interval[0], "end": interval[1], "days": days,
                "reason": f"{days} days without a usable acquisition between these dates.",
            }
            over_limit.append(gap)
            result["gaps"].append(gap)
        elif interval in producer_gaps:
            result["gaps"].append(producer_gaps[interval])
    gate["longest_gap_days"] = longest_gap
    if not failure and len(usable_dates) < settings.min_usable_dates:
        failure = _failed(
            "insufficient_usable_dates",
            f"Only {len(usable_dates)} distinct acquisition dates meet the {settings.min_valid_fraction:.0%} coverage and VV/VH criteria. "
            f"At least {settings.min_usable_dates} are required. Request dated sowing records.",
        )
    if not failure and over_limit:
        gap = over_limit[0]
        failure = _failed(
            "observation_gap_too_long",
            f"The evidence gap from {gap['start']} to {gap['end']} exceeds {settings.max_gap_days} days. Request dated sowing records.",
        )
    gate.update(failed_criterion=failure["criterion"] if failure else None, passes=failure is None)
    return result, failure
