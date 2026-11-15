# Sabūt integration contract

Read [PRODUCT.md](PRODUCT.md) for scope and [HACKATHON.md](HACKATHON.md) for contest requirements. This contract gives the backend, frontend, and evidence branches the same interface from kickoff. Codex owns contract changes and posts them to both lanes before changing an agreed interface.

## Runtime and ownership

- `backend/` and root startup, reset, and integration commands — Codex.
- `frontend/` — your Claude Code.
- `scripts/benchmark.py`, `scripts/rebuild_demo_evidence.py`, `demo/`, and `reports/` — teammate's Claude Code. Codex owns the replay runner and writes its generated report to `reports/replay.json`.
- The demo starts locally after dependency installation. Use a relative `/api` URL and a Vite proxy in development. The presenting build uses cached evidence, local UI assets, and local plot geometry. Keep provider credentials and the SQLite database outside tracked files.
- Commit the contract and any shared example payloads to the starting branch. During integration use one reviewable merge branch and one person to merge.

## Claims and imports

Accept a WGS84 GeoJSON `FeatureCollection` containing `Polygon` or `MultiPolygon` features. Required properties are `claim_id`, `season`, and `claimed_method` (`DSR` or `PTR`). Optional `farmer_name` is fictional in demo data. Optional `claimed_acres` is a finite positive number. Seed and replay claims must supply it. Claims imported without acreage remain reviewable and may still enter the suggested queue using unweighted uncertainty. Never infer their stated acreage from the polygon. Accept optional `reported_harvest_date` (ISO date) for the retrospective demo and mark it as applicant-reported. Use `Kharif 2024` in the seed batch. Treat `claim_id` as a stable unique identifier across the local workspace. Validate coordinate ranges and geometry integrity.

Send parsed GeoJSON as the request body. Return accepted IDs and feature-indexed errors. A malformed envelope fails the request. If the same claim is imported with identical inputs, keep its history and existing evidence. If an existing claim ID is uploaded with a changed boundary or season, return a conflict for that feature and instruct the uploader to use a new claim ID for the revision. Never resolve cache evidence by ID alone.

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {
      "claim_id": "A",
      "season": "Kharif 2024",
      "claimed_method": "DSR",
      "claimed_acres": 2.5
    },
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[76.9, 29.7], [76.901, 29.7], [76.901, 29.701], [76.9, 29.701], [76.9, 29.7]]]
    }
  }]
}
```

Example import response for the payload above.

```json
{"imported_ids":["A"],"errors":[]}
```

## Evidence handoff

| File | Contents |
|---|---|
| `demo/claims.geojson` | Three featured fictional claims with adjacent A/B boundaries and a small or poorly covered C, plus a separate retrospective case. The batch may also hold scattered review cases and background claims that route to desk review. |
| `demo/evidence.json` | Real georeferenced records with `schema_version: 1` and a `records` array. |
| `demo/workflow-simulation.json` | Same version and record shape, labeled simulated. Supplies A/B/C if verified compatible outputs are unavailable. Use separate replay inputs and inspection outcomes within this file or in documented companion files. |
| `reports/benchmark.json` | Paper citation, upstream commit, dataset and feature configurations, split and seed, metrics, baseline results, and limitations. |
| `reports/model-manifest.json` | Model version, format, artifact path, ordered feature schema, processing assumptions, validation thresholds and metrics, and known compatibility limits. |

Cache identity is `claim_id + season + geometry_hash`. Hash the GeoJSON geometry object using SHA-256 over UTF-8 JSON with sorted keys and compact separators. The producer and importer share [backend/identity.py](backend/identity.py). Preserve coordinate order and normalize integral floats to integers before serialization. A changed coordinate or ring order can result in a cache miss. Validate the imported geometry before lookup.

Each record carries `source_kind` (`sentinel1_real` or `simulated`), `window` (`start`, `end`, inclusive dates), `processing_version`, `units`, `acquisition_settings`, `observations`, `usable_count`, `gaps` and `quality_flags`. A gap has `start`, `end`, and a `reason`. Each observation carries `acquired_at` (ISO 8601 UTC), `scene_id`, nullable `vv` and `vh`, `valid_fraction` (0–1 or null), `usable`, and nullable `reason`. Record gap intervals from usable observations, including missing coverage at the start or end of the window. Preserve actual acquisition dates and keep interpolated dates out of the observed acquisitions table.

Model output can be null. When provided, include `source_kind`, `model_version`, `feature_schema`, `compatible`, `compatibility_reason`, and nullable `dsr_score` (0–1). No score is emitted when compatibility is unverified. A real record's score must come from its compatible features. Show any simulated score as part of the labeled simulation. The featured scenario and the real extraction can share a plot map while keeping their cards and labels distinct.

An unscored real export can set `model.compatible: false` and include its compatibility reason. To expose a real score, the API checks the producer's compatibility flag and matches `model_version` and the ordered `feature_schema` against the manifest. The manifest must also supply `validation_thresholds` with `ptr_max_score` and `dsr_min_score`, and a verified `compatible_exports` entry matching the record's `processing_version`, `window`, `units`, `feature_processing`, and required `acquisition_settings`. The processing profile should cover coefficient, reducers, resampling, smoothing, feature definitions, and missing data handling. Simulated scores use demo-only review bounds of 0.25 and 0.75.
## HTTP endpoints

| Endpoint | Request and response |
|---|---|
| `GET /api/health` | Return service readiness. |
| `POST /api/claims/import` | GeoJSON body. Return `imported_ids` and `errors`, each error carrying `index`, nullable `claim_id`, and `message`. |
| `POST /api/demo/load` | Import the featured batch through the same import service. Return the import response. Load idempotently. |
| `GET /api/queue?budget=1` | Return `budget` and `items`. Each item contains `claim_id`, `season`, `claimed_method`, `status`, `reason_code`, `reason`, `next_action`, nullable `rank`, `rank_reason`, `claimed_acres`, and `visit_priority`, and `in_visit_budget`. Reject negative budgets. |
| `GET /api/claims?budget=1` | Return `budget` and `items`: every claim's `GET /api/claims/{id}` body, in queue order, from one queue pass. Reject negative budgets. |
| `GET /api/claims/{id}` | Return the queue item fields, GeoJSON `geometry`, nullable decision `evidence`, nullable `real_evidence` when shown alongside a simulation, nullable `model`, nullable `reported_harvest_date`, `actions`, and `review_requests`. |
| `POST /api/claims/{id}/actions` | Accept `action`, `reason`, and `actor`. Record a server UTC timestamp and the recommendation snapshot. Return the saved event including ID, action, reason, actor, timestamp, and whether it overrides the recommendation. |
| `POST /api/claims/{id}/review-requests` | Accept `reason` and `language` (`hi`, `pa`, or `en`). Return a persisted receipt with ID, timestamp, and `simulated: true`. |
| `GET /api/benchmark` | Return the benchmark and the replay report when present. Surface a clear pending state while artifacts are missing. |

Working examples are in [examples/api](examples/api). A visit recommendation includes `field_question`. Claim detail and action recording accept an optional nonnegative `budget` query parameter (default 1) for the displayed rank and recommendation snapshot. A saved officer event uses `overrides_recommendation` and `recommendation`. Farmer receipts include the submitted `reason` and `language` so they can appear in officer history. The `actions` and `review_requests` arrays are both oldest first. The benchmark response is `{status, benchmark, replay, message}`. Status is `pending` with neither report, `partial` with one, or `ready` with both. Each unavailable report is null. Recommendation evidence includes `quality_gate` with the configured gates and a nullable `failed_criterion`.

The benchmark report exposes the paper's reference under `paper.published_weighted_f1` and `paper.published_configuration`. The app reads held-out rerun metrics from `comparison_on_test.hc_p_lgb`, `comparison_on_test.hc_lgb`, and `comparison_on_test.radar_rule`. Each has `weighted_f1`, `dsr_precision`, and `dsr_recall`. `tracks` carries the full metrics and confusion matrices.

## Recommendations and visit budget

| Status code | UI label | Typical next action |
|---|---|---|
| `ready_for_desk_review` | Ready for desk review | `desk_review` |
| `field_check_recommended` | Field check recommended | `request_field_visit` |
| `insufficient_evidence` | Insufficient evidence | `request_boundary_correction` or `request_records` |

Action values are the four next-action values above. Require a reason for every recorded officer action, including overrides. Record the underlying recommendation even when the officer chooses a different action. Keep the current recorded action and recommendation visible in the UI. Store events independently of radar and model artifacts.

Evaluate boundary and data quality, then feature compatibility, then score support. For the Kharif 2024 demo, start with the configurable criteria below. These are prototype quality gates. Use validation data for the separate model-score decision thresholds. Include a specific field question when a visit could resolve ambiguity or disagreement with the claim. Assign visit ranks only to cases where a field check could resolve a decision. Use the visit priority defined below and a stable claim ID tie-break. A change to the visit budget changes the allocation cutoff while keeping rank explainable. An override is an officer action and remains available outside the suggested budget. A novel uncached claim receives `insufficient_evidence` with a specific request, and an incompatible export displays the compatibility reason.

### Demo evidence thresholds

Use the 1 June to 5 September 2024 inclusive sowing window for the named benchmark track. Filter real input to ascending scenes with VV and VH and use a consistent relative orbit for the plot time series. The single-platform repeat cycle was about 12 days in that window, so expect roughly eight dates from a consistently acquired track and confirm with the catalog. The benchmark's four-day grid comes from temporal resampling. Count distinct, usable acquisition dates only. [Sentinel-1 mission history](https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel1.html) · [Ricemapper methods](https://arxiv.org/html/2507.08605v2#S3)

Start with at least **5 distinct usable dates**, **70% valid plot coverage per usable acquisition**, and no gap over **24 days** between usable dates or between the usable observations and the window edges. Also require a usable boundary and valid VV/VH on those dates. Document settings, expose the failed criterion on the evidence card, and record any fixture-specific change. A retrospective case uses the same gate and shows the harvest date as reported. For the judge example, show the pre-harvest archive even if it is unscored.

### Visit priority

For visit-eligible cases with a compatible DSR model score `s`, use the score-ambiguity index `u = 1 - 2 * abs(s - 0.5)`. Rank cases with acreage by descending `u * claimed_acres * 4000`, then by ascending claim ID. The ₹4,000/ac multiplier is a historical Kharif 2024 demo parameter, configurable and constant across the batch. It does not change relative order, and the result is a priority index rather than a payment, expected loss, or calibrated probability. Label model scores and simulation provenance. [2024 Haryana reporting](https://www.tribuneindia.com/news/haryana/69-of-claims-of-haryana-farmers-for-dsr-incentive-found-fake)

Keep eligible cases with a score and missing acreage after the weighted cases, ordered by descending `u`, then claim ID. If a separately documented manual reason makes an unscored case visit-eligible, append it by claim ID with its manual reason. Cases needing a boundary correction or a records request remain outside the suggested visit allocation. Overrides remain available to the officer. The backend owns ranks and sends `rank_reason`, plus nullable `claimed_acres` and nullable `visit_priority` for display. The UI displays these fields without recalculating the order.

An observation-quality-approved export can carry a manual visit recommendation via both `manual_visit_reason` and `field_question`. The reason and question must describe what the visit can resolve.

Example queue response. The text is a simulated scenario with a DSR score of 0.55 and 2.5 claimed acres.

```json
{
  "budget": 1,
  "items": [{
    "claim_id": "B",
    "season": "Kharif 2024",
    "claimed_method": "DSR",
    "status": "field_check_recommended",
    "reason_code": "ambiguous_sowing_signal",
    "reason": "The observations support more than one sowing method.",
    "next_action": "request_field_visit",
    "rank": 1,
    "rank_reason": "A field check could resolve the ambiguous signal. The priority uses the score ambiguity and 2.5 claimed acres.",
    "claimed_acres": 2.5,
    "visit_priority": 9000,
    "in_visit_budget": true
  }]
}
```

### Queue replay

The default companion files are `demo/replay-claims.geojson`, `demo/replay-evidence.json` (versioned simulated evidence records), and `demo/replay-outcomes.json` (`{"source_kind":"simulated","outcomes":{"claim_id":"resolved"}}`). Outcomes can be `resolved`, `corrected`, or `unresolved`. The runner freezes all three selections before loading outcomes. The score-only baseline sorts descending by score ambiguity and puts unscored visits last, with claim ID ties throughout. Seeded random samples without replacement from the same visit-eligible claim IDs. The report exposes `candidate_pool_count`, `budget`, `seed`, `outcome_source`, and `methods`. Each method contains selected IDs, counts, and the denominator.

## Integration acceptance

- Upload the featured GeoJSON and compare neighboring A/B in the map and evidence view. Show C's weak-evidence reason and next action.
- Change budget 0 → 1 and see B enter the visit allocation. Record A's desk-review action and B's visit request. Demonstrate an override and see all events after a restart.
- Switch the farmer preview between Hindi, Punjabi, and English. Submit a simulated correction and see its receipt and the officer-side event.
- Import a fresh plot and inspect a deliberately incompatible export. Each has an actionable reason and no unsupported model score.
- Open the real extraction, benchmark, and same-budget replay in the app. Identify the provenance and limits of each. Show a retrospective scenario using real pre-harvest acquisition dates and explain the next action.
- Start from a clean checkout following the README. After dependency installation, run the whole judge workflow offline from cached data.
