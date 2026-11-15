"""Rebuild Sabūt's cached demo evidence.

Writes, under demo/:
  claims.geojson            ~260 fictional claims on irregular plots over real Karnal (Haryana) cropland:
                            featured A/B/C/ARCHIVE, review cases D-H and KNL-### background claims
                            (layout in scripts/demo_layout.py).
  evidence.json             Real Sentinel-1 RTC plot series for every claim (source_kind sentinel1_real).
  workflow-simulation.json  Labeled simulated decision evidence for the batch (source_kind simulated).
  replay-claims.geojson     Fictional replay batch with stated acreage.
  replay-evidence.json      Simulated replay evidence (scores, ties, missing scores).
  replay-outcomes.json      Simulated inspection outcomes keyed by claim ID, kept apart from queue inputs.

Real extraction uses Microsoft Planetary Computer `sentinel-1-rtc` with anonymous SAS
signing. Signed asset URLs are used in memory only and never written to disk.

Usage:
  python scripts/rebuild_demo_evidence.py            # layout + real extraction + simulation + replay
  python scripts/rebuild_demo_evidence.py --offline  # simulation + replay only, keep cached claims and evidence
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Support execution from the repository root as a script.
if not __package__:
    sys.path.insert(0, str(ROOT))
from backend.identity import geometry_hash
from demo_layout import build_batch

DEMO = ROOT / "demo"
REPORTS = ROOT / "reports"

SCHEMA_VERSION = 1
SEASON = "Kharif 2024"
WINDOW_START = date(2024, 6, 1)
WINDOW_END = date(2024, 9, 5)  # inclusive
PROCESSING_VERSION = "sabut-s1rtc-plotmean-v1"
PROVIDER = "Microsoft Planetary Computer"
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-1-rtc"
ORBIT_STATE = "ascending"

# Demo quality gates (CONTRACT.md "Demo evidence thresholds").
MIN_USABLE_DATES = 5
MIN_VALID_FRACTION = 0.70
MAX_GAP_DAYS = 24
NOMINAL_REPEAT_DAYS = 12
# A plot needs at least this many 10 m pixel centres inside its boundary for a plot mean.
MIN_PLOT_PIXELS = 20

UTM_EPSG = 32643  # WGS 84 / UTM 43N, the native CRS of the RTC tiles over Karnal.
SIM_SEED = 20240601
REPLAY_SEED = 7

def utm_rect_to_geometry(x0, y0, x1, y1) -> dict:
    """Rectangle in UTM 43N metres as a WGS84 polygon; used for the simulated replay plots."""
    from pyproj import Transformer

    to_wgs = Transformer.from_crs(UTM_EPSG, 4326, always_xy=True)
    ring = []
    for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]:
        lon, lat = to_wgs.transform(x, y)
        ring.append([round(lon, 6), round(lat, 6)])
    return {"type": "Polygon", "coordinates": [ring]}


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def iso_day(d: date) -> str:
    return d.isoformat()


def compute_gaps(usable_days: list[date]) -> list[dict]:
    """Intervals longer than the nominal repeat cycle, plus window-edge coverage, from usable dates."""
    edges = [WINDOW_START, *sorted(set(usable_days)), WINDOW_END]
    gaps = []
    for i, (a, b) in enumerate(zip(edges, edges[1:])):
        days = (b - a).days
        is_edge = i == 0 or i == len(edges) - 2
        if days <= NOMINAL_REPEAT_DAYS and not is_edge:
            continue
        if not usable_days:
            reason = f"No usable acquisition in the {days}-day window."
        elif i == 0:
            reason = f"{days} days from the window start to the first usable acquisition."
        elif i == len(edges) - 2:
            reason = f"{days} days from the last usable acquisition to the window end."
        else:
            reason = f"{days} days between usable acquisitions (nominal repeat is {NOMINAL_REPEAT_DAYS} days)."
        if days > MAX_GAP_DAYS:
            reason += f" Exceeds the {MAX_GAP_DAYS}-day limit."
        gaps.append({"start": iso_day(a), "end": iso_day(b), "days": days, "reason": reason})
    return gaps


def gate_summary(usable_days: list[date], boundary_ok: bool) -> dict:
    gaps = compute_gaps(usable_days)
    longest = max((g["days"] for g in gaps), default=0)
    failed = None
    if not boundary_ok:
        failed = "boundary_quality"
    elif len(set(usable_days)) < MIN_USABLE_DATES:
        failed = "insufficient_usable_dates"
    elif longest > MAX_GAP_DAYS:
        failed = "observation_gap_too_long"
    return {"min_usable_dates": MIN_USABLE_DATES, "min_valid_fraction": MIN_VALID_FRACTION,
            "max_gap_days": MAX_GAP_DAYS, "min_plot_pixels": MIN_PLOT_PIXELS,
            "longest_gap_days": longest, "passes": failed is None, "failed_criterion": failed}


def load_manifest() -> dict | None:
    path = REPORTS / "model-manifest.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_claims() -> list[dict]:
    path = DEMO / "claims.geojson"
    if not path.exists():
        raise SystemExit("demo/claims.geojson is missing; run without --offline to lay out the batch.")
    return json.loads(path.read_text(encoding="utf-8"))["features"]


# --- real extraction --------------------------------------------------------------------

def search_catalog(bbox):
    import planetary_computer
    import pystac_client

    catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    items = list(catalog.search(
        collections=[COLLECTION], bbox=bbox,
        datetime=f"{WINDOW_START.isoformat()}T00:00:00Z/{WINDOW_END.isoformat()}T23:59:59Z",
    ).items())
    return sorted(items, key=lambda it: it.datetime)


def read_scene(item, bounds_utm) -> dict:
    """Read the VV and VH window covering every plot once per scene."""
    import rasterio
    from rasterio.windows import from_bounds

    pad = 40
    x0, y0, x1, y1 = bounds_utm
    scene = {}
    for band in ("vv", "vh"):
        with rasterio.open(item.assets[band].href) as ds:
            if ds.crs.to_epsg() != UTM_EPSG:
                raise RuntimeError(f"{item.id} {band}: unexpected CRS {ds.crs}")
            win = from_bounds(x0 - pad, y0 - pad, x1 + pad, y1 + pad, ds.transform).round_offsets().round_lengths()
            scene[band] = ds.read(1, window=win, boundless=True, fill_value=ds.nodata).astype("float64")
            scene["transform"] = ds.window_transform(win)
            scene["nodata"] = ds.nodata
    return scene


def plot_reduce(scene: dict, geom_utm: dict) -> dict:
    """Per-plot stats from a scene window; linear-power mean over pixels valid in both bands."""
    import numpy as np
    from rasterio.features import geometry_mask
    from rasterio.windows import from_bounds

    xs = [p[0] for p in geom_utm["coordinates"][0]]
    ys = [p[1] for p in geom_utm["coordinates"][0]]
    win = from_bounds(min(xs) - 20, min(ys) - 20, max(xs) + 20, max(ys) + 20, scene["transform"])
    win = win.round_offsets().round_lengths()
    rows = slice(max(int(win.row_off), 0), int(win.row_off + win.height))
    cols = slice(max(int(win.col_off), 0), int(win.col_off + win.width))
    transform = scene["transform"] * scene["transform"].translation(cols.start, rows.start)
    arrays = {}
    for band in ("vv", "vh"):
        data = scene[band][rows, cols]
        inside = ~geometry_mask([geom_utm], out_shape=data.shape, transform=transform, all_touched=False)
        valid = inside & np.isfinite(data) & (data > 0)
        if scene["nodata"] is not None:
            valid &= data != scene["nodata"]
        arrays[band] = (data, inside, valid)
    inside = arrays["vv"][1]
    n_pixels = int(inside.sum())
    both_valid = arrays["vv"][2] & arrays["vh"][2]
    n_valid = int(both_valid.sum())
    out = {"n_pixels": n_pixels, "n_valid": n_valid,
           "valid_fraction": round(n_valid / n_pixels, 4) if n_pixels else None}
    for band in ("vv", "vh"):
        if n_valid:
            mean_lin = float(arrays[band][0][both_valid].mean())
            out[f"{band}_linear"] = mean_lin
            out[band] = round(10 * math.log10(mean_lin), 3)
        else:
            out[f"{band}_linear"] = None
            out[band] = None
    return out


def real_model_block(manifest: dict | None) -> dict:
    version = manifest.get("model_version") if manifest else None
    schema = manifest.get("feature_schema") if manifest else []
    return {
        "source_kind": "sentinel1_real",
        "model_version": version,
        "feature_schema": schema,
        "compatible": False,
        "compatibility_reason": (
            "Feature parity with the Ricemapper training data is unverified. The model was trained on "
            "SNAP gamma0 with multi-temporal Refined Lee speckle filtering and exactextract plot means "
            "resampled to a 4-day grid and spline-smoothed; this export is Planetary Computer RTC gamma0 "
            "without speckle filtering, 7 single-orbit dates, and no handcrafted spline features were computed"
        ),
        "dsr_score": None,
    }


def extract_real(claims: list[dict], manifest: dict | None) -> dict:
    from pyproj import Transformer

    to_utm = Transformer.from_crs(4326, UTM_EPSG, always_xy=True)
    lons = [p[0] for f in claims for p in f["geometry"]["coordinates"][0]]
    lats = [p[1] for f in claims for p in f["geometry"]["coordinates"][0]]
    bbox = [min(lons), min(lats), max(lons), max(lats)]
    items = search_catalog(bbox)

    def item_meta(it):
        p = it.properties
        return {"stac_item_id": it.id, "scene_id": it.id.removesuffix("_rtc"),
                "acquired_at": it.datetime.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "orbit_state": p.get("sat:orbit_state"), "relative_orbit": p.get("sat:relative_orbit"),
                "platform": p.get("platform"), "polarizations": p.get("sar:polarizations")}

    catalog_rows = [item_meta(it) for it in items]
    by_orbit: dict[str, int] = {}
    for r in catalog_rows:
        key = f"{r['orbit_state']}/{r['relative_orbit']}/{r['platform']}"
        by_orbit[key] = by_orbit.get(key, 0) + 1
    asc = [it for it in items if it.properties.get("sat:orbit_state") == ORBIT_STATE
           and set(it.properties.get("sar:polarizations", [])) >= {"VV", "VH"}]
    orbits = sorted({it.properties["sat:relative_orbit"] for it in asc})
    if not asc:
        raise RuntimeError("No ascending VV/VH scenes found for the plot batch.")
    # Most frequently acquired ascending relative orbit, so every plot uses one geometry.
    orbit = max(orbits, key=lambda o: sum(it.properties["sat:relative_orbit"] == o for it in asc))
    series = [it for it in asc if it.properties["sat:relative_orbit"] == orbit]
    excluded = [dict(item_meta(it), reason=(
        "Descending pass excluded; ascending only." if it.properties.get("sat:orbit_state") != ORBIT_STATE
        else f"Relative orbit {it.properties.get('sat:relative_orbit')} excluded; series uses orbit {orbit}."))
        for it in items if it not in series]
    expected = []
    d = series[0].datetime.date()
    while d - timedelta(days=NOMINAL_REPEAT_DAYS) >= WINDOW_START:
        d -= timedelta(days=NOMINAL_REPEAT_DAYS)
    while d <= WINDOW_END:
        expected.append(d)
        d += timedelta(days=NOMINAL_REPEAT_DAYS)
    present = {it.datetime.date() for it in series}
    missing_expected = [iso_day(x) for x in expected if x not in present]

    utm_geoms = {}
    for feat in claims:
        ring = feat["geometry"]["coordinates"][0]
        utm_geoms[feat["properties"]["claim_id"]] = {
            "type": "Polygon", "coordinates": [[list(to_utm.transform(lon, lat)) for lon, lat in ring]]}
    xs = [p[0] for g in utm_geoms.values() for p in g["coordinates"][0]]
    ys = [p[1] for g in utm_geoms.values() for p in g["coordinates"][0]]
    scenes = []
    for it in series:
        print(f"reading {it.id}", flush=True)
        scenes.append((it, read_scene(it, (min(xs), min(ys), max(xs), max(ys)))))

    records = []
    for feat in claims:
        props = feat["properties"]
        geom_utm = utm_geoms[props["claim_id"]]
        observations = []
        n_pixels = None
        for it, scene in scenes:
            meta = item_meta(it)
            stats = plot_reduce(scene, geom_utm)
            n_pixels = stats["n_pixels"]
            vf = stats["valid_fraction"]
            reason = None
            if stats["vv"] is None or stats["vh"] is None:
                reason = "No valid VV/VH pixels inside the plot."
            elif vf is None or vf < MIN_VALID_FRACTION:
                reason = f"Valid plot coverage {vf:.0%} is below {MIN_VALID_FRACTION:.0%}."
            observations.append({
                "acquired_at": meta["acquired_at"], "scene_id": meta["scene_id"],
                "stac_item_id": meta["stac_item_id"], "relative_orbit": orbit, "orbit_state": ORBIT_STATE,
                "vv": stats["vv"], "vh": stats["vh"],
                "vv_linear": stats["vv_linear"], "vh_linear": stats["vh_linear"],
                "valid_fraction": vf, "valid_pixels": stats["n_valid"], "plot_pixels": stats["n_pixels"],
                "usable": reason is None, "reason": reason,
            })
        boundary_ok = (n_pixels or 0) >= MIN_PLOT_PIXELS
        quality_flags = []
        if not boundary_ok:
            quality_flags.append({"code": "plot_too_small", "detail": (
                f"Only {n_pixels} 10 m pixel centres fall inside the boundary; at least {MIN_PLOT_PIXELS} "
                "are needed for a reliable plot mean. Supply a corrected or merged plot boundary.")})
        if missing_expected:
            quality_flags.append({"code": "catalog_missing_repeat_dates", "detail": (
                f"Expected relative-orbit {orbit} acquisitions not in the catalog: {', '.join(missing_expected)}.")})
        usable_days = [datetime.fromisoformat(o["acquired_at"].replace("Z", "+00:00")).date()
                       for o in observations if o["usable"]]
        harvest = props.get("reported_harvest_date")
        record = {
            "claim_id": props["claim_id"], "season": SEASON, "geometry_hash": geometry_hash(feat["geometry"]),
            "source_kind": "sentinel1_real",
            "window": {"start": iso_day(WINDOW_START), "end": iso_day(WINDOW_END)},
            "processing_version": PROCESSING_VERSION,
            "units": "dB",
            "feature_processing": "plot_series_only",
            "acquisition_settings": {
                "provider": PROVIDER, "collection": COLLECTION, "product": "Sentinel-1 IW GRD, radiometrically terrain corrected",
                "coefficient": "gamma0_rtc", "polarizations": ["VV", "VH"], "orbit_state": ORBIT_STATE,
                "relative_orbit": orbit, "platform": "SENTINEL-1A", "pixel_spacing_m": 10, "crs": f"EPSG:{UTM_EPSG}",
                "plot_reducer": "arithmetic mean of linear-power gamma0 over pixels whose centres fall inside the plot and are valid in both VV and VH; then 10*log10",
                "valid_pixel_rule": "finite, > 0 and not nodata (-32768) in both VV and VH",
                "speckle_filter": "none", "temporal_resampling": "none (actual acquisition dates only)",
                "min_plot_pixels": MIN_PLOT_PIXELS, "signing": "anonymous SAS, not stored",
            },
            "observations": observations,
            "usable_count": len(set(usable_days)),
            "gaps": compute_gaps(usable_days),
            "quality_flags": quality_flags,
            "boundary_usable": boundary_ok,
            "plot_pixels": n_pixels,
            "quality_gate": gate_summary(usable_days, boundary_ok),
            "model": real_model_block(manifest),
        }
        if harvest:
            hd = date.fromisoformat(harvest)
            before_harvest = [x for x in usable_days if x < hd]
            record["retrospective"] = {
                "reported_harvest_date": harvest, "reported_harvest_date_source": "applicant_reported_fictional",
                "observations_before_reported_harvest": len(set(before_harvest)),
                "last_observation_before_harvest": iso_day(max(before_harvest)) if before_harvest else None,
                "note": "The harvest date is fictional and applicant-reported. Acquisition dates and scene IDs are real.",
            }
        records.append(record)
    return {
        "schema_version": SCHEMA_VERSION,
        "source_kind": "sentinel1_real",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generator": "scripts/rebuild_demo_evidence.py",
        "processing_version": PROCESSING_VERSION,
        "provenance": ("Real Sentinel-1A RTC observations for fictional claims on georeferenced Karnal, Haryana "
                       "plots. Claims, farmer names, acreage and harvest date are fictional."),
        "catalog": {
            "provider": PROVIDER, "stac_api": STAC_URL, "collection": COLLECTION, "query_bbox": bbox,
            "window": {"start": iso_day(WINDOW_START), "end": iso_day(WINDOW_END)},
            "total_items": len(items), "items_by_orbit": by_orbit,
            "series_relative_orbit": orbit, "series_items": len(series),
            "expected_repeat_dates": [iso_day(x) for x in expected],
            "missing_expected_dates": missing_expected,
            "excluded_items": excluded,
        },
        "gate_settings": {"min_usable_dates": MIN_USABLE_DATES, "min_valid_fraction": MIN_VALID_FRACTION,
                          "max_gap_days": MAX_GAP_DAYS, "min_plot_pixels": MIN_PLOT_PIXELS},
        "records": records,
    }


# --- labeled simulation -----------------------------------------------------------------

SIM_DATES = [date(2024, 6, 4) + timedelta(days=NOMINAL_REPEAT_DAYS * i) for i in range(8)]


def sim_series(kind: str, rng: random.Random) -> list[tuple[float, float]]:
    """Illustrative dB curves. PTR shows an early flooding dip; DSR rises from dry soil."""
    out = []
    for i, _ in enumerate(SIM_DATES):
        if kind == "dsr":
            vv, vh = -12.5 + 0.55 * i, -19.5 + 0.6 * i
        elif kind == "ptr":
            dip = 4.5 if i in (1, 2) else 0
            vv, vh = -11.0 - dip + 0.5 * max(i - 2, 0), -18.0 - dip + 0.6 * max(i - 2, 0)
        else:  # mixed
            dip = 2.0 if i in (1, 2) else 0
            vv, vh = -11.8 - dip + 0.5 * i, -18.8 - dip + 0.55 * i
        out.append((round(vv + rng.gauss(0, 0.3), 2), round(vh + rng.gauss(0, 0.3), 2)))
    return out


def sim_record(claim_id, geom_hash, kind, score, rng, *, valid=0.95, drop=(), flags=None,
               field_question=None, manual=None, model_reason=None, compatible=True,
               drop_valid=0.3, drop_reason="Simulated low plot coverage."):
    obs = []
    usable_days = []
    for i, (d, (vv, vh)) in enumerate(zip(SIM_DATES, sim_series(kind, rng))):
        usable = i not in drop
        obs.append({"acquired_at": f"{d.isoformat()}T12:56:00Z", "scene_id": f"SIM-{claim_id}-{i + 1}",
                    "vv": vv if usable else None, "vh": vh if usable else None,
                    "valid_fraction": valid if usable else drop_valid, "usable": usable,
                    "reason": None if usable else drop_reason})
        if usable:
            usable_days.append(d)
    model = None
    if score is not None or model_reason:
        model = {"source_kind": "simulated", "model_version": "simulation-v1", "feature_schema": [],
                 "compatible": compatible and score is not None,
                 "compatibility_reason": model_reason or "Fictional score for the workflow demonstration.",
                 "dsr_score": score if compatible else None}
    rec = {"claim_id": claim_id, "season": SEASON, "geometry_hash": geom_hash, "source_kind": "simulated",
           "window": {"start": iso_day(WINDOW_START), "end": iso_day(WINDOW_END)},
           "processing_version": "simulation-v1", "units": "dB",
           "acquisition_settings": {"provider": "workflow simulation", "note": "Simulated values; not satellite data."},
           "observations": obs, "usable_count": len(usable_days), "gaps": compute_gaps(usable_days),
           "quality_flags": flags or [], "model": model}
    if field_question:
        rec["field_question"] = field_question
    if manual:
        rec["manual_visit_reason"] = manual
        rec["field_question"] = field_question or "Confirm the sowing method on the ground."
    return rec


REVIEW_QUESTIONS = {
    "B": ("Was B sown by direct seeding into dry or moist soil, or were nursery seedlings transplanted "
          "into a puddled field? Look for nursery-bed remnants, puddling marks and regular transplant rows."),
    "D": ("The score looks like transplanting, but D claims DSR. Check for puddling marks, a nursery bed on "
          "the holding and evenly spaced transplant hills rather than drilled seed lines."),
    "E": ("E's signal sits between both methods. Ask when and how the field was sown, and look for drilled "
          "seed rows or seed-drill wheel marks along the headland."),
    "F": ("F claims transplanting but the signal is mixed. Confirm a nursery was raised and look for "
          "transplant hills and bund repairs from puddling."),
}


def build_simulation(claims: list[dict], real_pixels: dict | None = None) -> dict:
    """Simulated decision evidence for every claim in the batch, keyed by claim and geometry hash."""
    rng = random.Random(SIM_SEED)
    h = {f["properties"]["claim_id"]: geometry_hash(f["geometry"]) for f in claims}
    c_pixels = (real_pixels or {}).get("C")
    c_size = f"about {c_pixels}" if c_pixels else f"fewer than {MIN_PLOT_PIXELS}"
    records = [
        sim_record("A", h["A"], "dsr", 0.91, rng),
        sim_record("B", h["B"], "mixed", 0.55, rng, field_question=REVIEW_QUESTIONS["B"]),
        sim_record("C", h["C"], "dsr", None, rng, flags=[{"code": "plot_too_small", "detail": (
            f"The 0.4-acre boundary covers {c_size} Sentinel-1 pixel centres, below the {MIN_PLOT_PIXELS}-pixel "
            "minimum. Supply a corrected or merged plot boundary.")}]),
        sim_record("D", h["D"], "ptr", 0.12, rng, field_question=REVIEW_QUESTIONS["D"]),
        sim_record("E", h["E"], "mixed", 0.40, rng, field_question=REVIEW_QUESTIONS["E"]),
        sim_record("F", h["F"], "mixed", 0.63, rng, field_question=REVIEW_QUESTIONS["F"]),
        sim_record("G", h["G"], "dsr", 0.86, rng, drop=(2, 3, 4), drop_valid=0.0,
                   drop_reason="Simulated: no acquisition reached this plot on this date."),
        sim_record("H", h["H"], "dsr", 0.83, rng, drop=(1, 2, 3, 4, 5), drop_valid=0.55,
                   drop_reason="Simulated valid plot coverage 55%, below 70%."),
    ]
    covered = {r["claim_id"] for r in records} | {"ARCHIVE"}
    background = 0
    for f in claims:
        cid, method = f["properties"]["claim_id"], f["properties"]["claimed_method"]
        if cid in covered:
            continue
        crng = random.Random(f"{SIM_SEED}-{cid}")
        score = round(crng.uniform(0.78, 0.97) if method == "DSR" else crng.uniform(0.03, 0.22), 2)
        records.append(sim_record(cid, h[cid], "dsr" if method == "DSR" else "ptr", score, crng))
        background += 1
    return {
        "schema_version": SCHEMA_VERSION, "source_kind": "simulated",
        "provenance": ("SIMULATED workflow evidence for the whole demo batch. Observation values, scene IDs (SIM-*) "
                       "and model scores are fictional. Geometry hashes match demo/claims.geojson so the real "
                       "extraction in demo/evidence.json can be shown alongside. ARCHIVE has no simulated record "
                       "and uses its real, unscored extraction only."),
        "expected_outcomes": {
            "A": "ready_for_desk_review (simulated score 0.91 supports claimed DSR)",
            "B": "field_check_recommended, visit rank 1 (score 0.55, 2.5 ac, priority 9000)",
            "C": "insufficient_evidence with request_boundary_correction (plot too small for 10 m radar)",
            "D": "field_check_recommended (score 0.12 supports PTR; claim says DSR)",
            "E": "field_check_recommended (score 0.40 is ambiguous)",
            "F": "field_check_recommended (score 0.63 is ambiguous; claim says PTR)",
            "G": "insufficient_evidence with request_records (36-day gap between usable dates)",
            "H": "insufficient_evidence with request_records (only 3 dates reach 70% plot coverage)",
            "ARCHIVE": "insufficient_evidence with request_records (real export is unscored; retrospective case)",
            "KNL-*": f"ready_for_desk_review ({background} background claims whose simulated score supports the claim)",
        },
        "records": records,
    }


# --- replay set -------------------------------------------------------------------------

OUTCOME_DEFINITIONS = {
    "resolved": ("The visit established the sowing method for a case the desk evidence could not settle "
                 "(score in the review band or unscored), and it matched the claim."),
    "corrected": "The visit found that the claimed sowing method was wrong, so the decision changed.",
    "unresolved": ("The visit could not establish the method (field already harvested or prepared, no access, "
                   "boundary mismatch) or only re-confirmed what the desk evidence already supported."),
}


def build_replay() -> tuple[dict, dict, dict]:
    rng = random.Random(REPLAY_SEED)
    acres_choices = [0.8, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.5]
    # (score, acres) pairs. Priority ties: R07/R08 (u=0.8, 2 ac) and R06/R11/R12 (u=0.9, 2 ac).
    spec = [
        (0.52, 3.0), (0.48, 1.0), (0.60, 5.0), (0.35, 2.5), (0.70, 6.5), (0.45, 2.0), (0.40, 2.0),
        (0.60, 2.0), (0.30, 4.0), (0.65, 1.5), (0.55, 2.0), (0.45, 2.0), (0.92, 3.0), (0.88, 2.5),
        (0.12, 1.0), (0.08, 4.0), (0.95, 5.0), (0.20, 2.0), (0.80, 1.5), (0.50, 0.8),
    ]
    feats, records, outcomes, details = [], [], {}, {}
    x0, y0 = 690000, 3270000
    for i, (score, acres) in enumerate(spec, start=1):
        cid = f"R{i:02d}"
        method = "DSR" if i % 4 else "PTR"
        col, row = (i - 1) % 5, (i - 1) // 5
        x, y = x0 + col * 300, y0 + row * 300
        geom = utm_rect_to_geometry(x, y, x + 100, y + 100)
        feats.append({"type": "Feature", "geometry": geom, "properties": {
            "claim_id": cid, "season": SEASON, "claimed_method": method, "claimed_acres": acres,
            "farmer_name": f"Replay farmer {i} (fictional)"}})
        records.append(sim_record(cid, geometry_hash(geom), "mixed", score, rng))
    # Missing scores: two unscored cases with a documented manual visit reason, two plain unscored, one weak.
    extras = [("R21", 3.5, "manual"), ("R22", 1.2, "manual"), ("R23", 2.0, "none"), ("R24", 6.0, "none"), ("R25", 1.0, "weak")]
    for j, (cid, acres, kind) in enumerate(extras):
        x, y = x0 + j * 300, y0 + 5 * 300
        geom = utm_rect_to_geometry(x, y, x + 100, y + 100)
        feats.append({"type": "Feature", "geometry": geom, "properties": {
            "claim_id": cid, "season": SEASON, "claimed_method": "DSR", "claimed_acres": acres,
            "farmer_name": f"Replay farmer {cid} (fictional)"}})
        gh = geometry_hash(geom)
        if kind == "manual":
            records.append(sim_record(cid, gh, "mixed", None, rng, compatible=False,
                                      model_reason="Simulated: no compatible score for this export.",
                                      manual="Neighbour complaint recorded by the block office (simulated).",
                                      field_question="Was this plot direct-seeded or transplanted?"))
        elif kind == "none":
            records.append(sim_record(cid, gh, "mixed", None, rng, compatible=False,
                                      model_reason="Simulated: feature export incompatible with the model."))
        else:
            records.append(sim_record(cid, gh, "dsr", None, rng, drop=(1, 2, 3, 4, 5)))
    # Simulated outcomes. Assumption, stated in the file: the score is treated as P(true DSR) when drawing a
    # latent truth. That assumption is NOT demonstrated calibration; it makes ambiguous cases more likely to
    # be resolved by a visit, so the replay tests policy mechanics rather than field effectiveness.
    for rec, feat in zip(records, feats):
        cid = rec["claim_id"]
        claimed = feat["properties"]["claimed_method"]
        score = rec["model"]["dsr_score"] if rec["model"] else None
        p_dsr = score if score is not None else 0.5
        harvested = rng.random() < 0.15
        true_method = "DSR" if rng.random() < p_dsr else "PTR"
        in_band = score is None or 0.25 < score < 0.75
        if harvested:
            label, why = "unresolved", "Field already harvested or prepared at the visit (simulated)."
        elif true_method != claimed:
            label, why = "corrected", f"Simulated ground truth {true_method} differs from claimed {claimed}."
        elif in_band:
            label, why = "resolved", f"Simulated ground truth {true_method} confirmed an ambiguous or unscored case."
        else:
            label, why = "unresolved", "Visit re-confirmed what the desk evidence already supported."
        outcomes[cid] = label
        details[cid] = {"simulated_true_method": true_method, "harvested_before_visit": harvested, "explanation": why}
    claims_fc = {"type": "FeatureCollection", "features": feats}
    evidence = {"schema_version": SCHEMA_VERSION, "source_kind": "simulated",
                "provenance": "SIMULATED replay evidence. Scores, observations and claims are fictional.",
                "records": records}
    outcomes_doc = {
        "schema_version": SCHEMA_VERSION, "source_kind": "simulated", "seed": REPLAY_SEED,
        "provenance": ("SIMULATED inspection outcomes keyed by claim ID. Kept in this separate file so queue "
                       "ranking never sees them."),
        "definitions": OUTCOME_DEFINITIONS,
        "resolving_or_correcting": "A visit counts toward the replay metric when its outcome is resolved or corrected.",
        "generation_assumption": (
            "Latent true method drawn with P(DSR) = simulated score (0.5 when unscored); 15% of visits arrive after "
            "harvest and are unresolved regardless of score. Treating the score as a probability is an assumption, "
            "not demonstrated calibration, and it favours ambiguity-ordered policies by construction."),
        "outcomes": outcomes,
        "outcome_details": details,
    }
    return claims_fc, evidence, outcomes_doc


RECORD_FIELDS = ("claim_id", "season", "geometry_hash", "source_kind", "window", "processing_version", "units",
                 "acquisition_settings", "observations", "usable_count", "gaps", "quality_flags")
OBS_FIELDS = ("acquired_at", "scene_id", "vv", "vh", "valid_fraction", "usable", "reason")
MODEL_FIELDS = ("source_kind", "model_version", "feature_schema", "compatible", "compatibility_reason", "dsr_score")


def validate_artifact(doc: dict, claims_fc: dict, source_kind: str, name: str) -> list[str]:
    """Check an evidence artifact against the CONTRACT.md evidence handoff shape."""
    errs = []
    if doc.get("schema_version") != SCHEMA_VERSION:
        errs.append(f"{name}: schema_version must be {SCHEMA_VERSION}")
    hashes = {(f["properties"]["claim_id"], f["properties"]["season"]): geometry_hash(f["geometry"])
              for f in claims_fc["features"]}
    for f in claims_fc["features"]:
        p = f["properties"]
        if p.get("claimed_method") not in ("DSR", "PTR"):
            errs.append(f"{name}: {p.get('claim_id')} claimed_method invalid")
        acres = p.get("claimed_acres")
        if not isinstance(acres, (int, float)) or not math.isfinite(acres) or acres <= 0:
            errs.append(f"{name}: {p.get('claim_id')} needs finite positive claimed_acres")
    for r in doc.get("records", []):
        cid = r.get("claim_id")
        errs += [f"{name}:{cid} missing {k}" for k in RECORD_FIELDS if k not in r]
        if r.get("source_kind") != source_kind:
            errs.append(f"{name}:{cid} source_kind {r.get('source_kind')} != {source_kind}")
        if hashes.get((cid, r.get("season"))) != r.get("geometry_hash"):
            errs.append(f"{name}:{cid} geometry_hash does not match the claims file")
        usable = set()
        for o in r.get("observations", []):
            errs += [f"{name}:{cid} observation missing {k}" for k in OBS_FIELDS if k not in o]
            if not str(o.get("acquired_at", "")).endswith("Z"):
                errs.append(f"{name}:{cid} acquired_at must be ISO 8601 UTC")
            vf = o.get("valid_fraction")
            if vf is not None and not 0 <= vf <= 1:
                errs.append(f"{name}:{cid} valid_fraction out of range")
            if o.get("usable"):
                usable.add(o["acquired_at"][:10])
        if r.get("usable_count") != len(usable):
            errs.append(f"{name}:{cid} usable_count {r.get('usable_count')} != {len(usable)} distinct usable dates")
        m = r.get("model")
        if m is not None:
            errs += [f"{name}:{cid} model missing {k}" for k in MODEL_FIELDS if k not in m]
            if m.get("compatible") is not True and m.get("dsr_score") is not None:
                errs.append(f"{name}:{cid} emits a score without verified compatibility")
    return errs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--offline", action="store_true",
                        help="Skip the network extraction; rebuild simulation and replay, keep demo/evidence.json.")
    args = parser.parse_args()

    manifest = load_manifest()
    if not args.offline:
        claims, layout = build_batch(SEASON)
        evidence = extract_real(claims, manifest)
        evidence["layout"] = layout
        write_json(DEMO / "claims.geojson", {"type": "FeatureCollection", "features": claims})
        write_json(DEMO / "evidence.json", evidence)
        for r in evidence["records"]:
            if not r["claim_id"].startswith("KNL-"):
                print(f"{r['claim_id']}: {r['usable_count']} usable of {len(r['observations'])} scenes, "
                      f"pixels={r['plot_pixels']}, gate={r['quality_gate']['failed_criterion'] or 'pass'}")
        print(f"{len(evidence['records'])} real records; catalog: {evidence['catalog']['items_by_orbit']} "
              f"missing={evidence['catalog']['missing_expected_dates']}")
    elif not (DEMO / "evidence.json").exists():
        print("demo/evidence.json is missing; run without --offline to extract it.", file=sys.stderr)
        return 1
    else:
        claims = load_claims()
    real = json.loads((DEMO / "evidence.json").read_text(encoding="utf-8"))
    simulation = build_simulation(claims, {r["claim_id"]: r.get("plot_pixels") for r in real["records"]})
    write_json(DEMO / "workflow-simulation.json", simulation)
    rc, re_, ro = build_replay()
    write_json(DEMO / "replay-claims.geojson", rc)
    write_json(DEMO / "replay-evidence.json", re_)
    write_json(DEMO / "replay-outcomes.json", ro)
    counts = {k: list(ro["outcomes"].values()).count(k) for k in OUTCOME_DEFINITIONS}
    print(f"wrote demo/ artifacts; replay outcomes {counts}")

    batch_fc = {"type": "FeatureCollection", "features": claims}
    errors = (validate_artifact(real, batch_fc, "sentinel1_real", "evidence.json")
              + validate_artifact(simulation, batch_fc, "simulated", "workflow-simulation.json")
              + validate_artifact(re_, rc, "simulated", "replay-evidence.json"))
    missing = {r["claim_id"] for r in re_["records"]} - set(ro["outcomes"])
    if missing:
        errors.append(f"replay-outcomes.json: missing outcomes for {sorted(missing)}")
    if manifest and any(r["model"]["model_version"] != manifest["model_version"] for r in real["records"]):
        errors.append("evidence.json: model_version is stale; rerun without --offline after the benchmark")
    for e in errors:
        print(f"CONTRACT CHECK FAILED: {e}", file=sys.stderr)
    print("contract check: " + ("FAILED" if errors else "passed"))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
