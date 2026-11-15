# Sabūt demo evidence

Every file here states its `source_kind`. Fictional means invented for the demo. Simulated means generated values. Real means read from Sentinel-1 scenes.

| File | Provenance | What it holds |
|---|---|---|
| `claims.geojson` | Fictional claims on real coordinates | A and B are adjacent 100 m × 100 m plots (2.5 claimed acres each) on farmland west of Karnal, Haryana. C is a 40 m × 40 m plot (0.4 acres). Farmer names, acreage, claimed methods and A's `reported_harvest_date` (2024-10-08, applicant-reported) are fictional. Boundaries were placed on a Sentinel-2 L2A chip and are not surveyed parcels. |
| `evidence.json` | **Real** Sentinel-1A RTC | One `sentinel1_real` record per claim, keyed by `claim_id + season + geometry_hash`. Each record carries the actual acquisition dates, source scene IDs, plot means, valid coverage, gaps and quality gate. `model.dsr_score` is `null` because feature parity is unverified, and `compatibility_reason` says why. |
| `workflow-simulation.json` | **Simulated** | Labelled A/B/C decision evidence (`SIM-*` scene IDs, fictional scores 0.91 / 0.55 / none). It uses the same geometry hashes, so the app can show the real extraction alongside. |
| `replay-claims.geojson`, `replay-evidence.json` | **Simulated** | 25 fictional replay claims. They have varied acreage (0.8–6.5 ac), simulated scores including exact priority ties (R07/R08 at 6400, R06/R11/R12 at 7200), disagreements with the claim (R15, R18 claim DSR with scores below 0.25), unscored cases with a manual visit reason (R21, R22), unscored incompatible cases (R23, R24) and one weak-coverage case (R25). |
| `replay-outcomes.json` | **Simulated** | Inspection outcomes keyed by claim ID, kept apart from the queue inputs. It includes outcome definitions and the generation assumption. |

## Real extraction (demo/evidence.json)

- **Provider.** Microsoft Planetary Computer `sentinel-1-rtc`, read through anonymous SAS signing. Signed URLs are held in memory only and never written.
- **Coefficient and units.** Terrain-corrected γ⁰ (RTC). Plot values are `10*log10(mean linear power)` in dB, averaged over 10 m pixels whose centres fall inside the plot and are valid in both VV and VH. Linear means are kept as `vv_linear` and `vh_linear`.
- **Window.** 2024-06-01 to 2024-09-05 inclusive. Only ascending VV+VH scenes on one relative orbit (27) are used.
- **Catalog.** The search returned 9 items: 7 ascending on orbit 27 and 2 descending on orbit 136, which were excluded and listed in `catalog.excluded_items`. The expected 12-day repeat on 2024-06-28 is not in the catalog.
- **Usable dates.** 7: 06-04, 06-16, 07-10, 07-22, 08-03, 08-15 and 08-27. Valid coverage is 100% on every date.
- **Gaps.** 3 days at the window start, 24 days from 06-16 to 07-10, and 9 days at the window end. The longest gap equals the 24-day limit, so the default gate passes with **no margin**. A stricter gap limit would fail every plot on this track.
- **Gate.** The gate requires ≥5 usable dates, ≥70% valid coverage per acquisition, gaps ≤24 days including the window edges, and ≥20 pixel centres inside the plot.
  - A and B pass the gate.
  - C fails `boundary_quality` (16 pixels, flag `plot_too_small`), so the next action is a boundary correction.
- **Retrospective.** A has 7 real acquisitions before its fictional reported harvest date of 2024-10-08 (last on 2024-08-27). See `records[A].retrospective`.

## Rebuild

```bash
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r scripts/requirements-evidence.txt
.venv/bin/python scripts/benchmark.py --trials 30      # writes reports/benchmark.json, model-manifest.json, models/
.venv/bin/python scripts/rebuild_demo_evidence.py      # network: Planetary Computer STAC + COG reads (~1 min)
.venv/bin/python scripts/rebuild_demo_evidence.py --offline   # simulation + replay only
```

Run the benchmark first, so that the real records carry the manifest's `model_version` and ordered `feature_schema`. No credentials are needed. The Planetary Computer issues anonymous SAS tokens.
