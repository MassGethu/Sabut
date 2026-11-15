# Sabūt demo evidence

Every file here states its `source_kind`. Fictional means invented for the demo. Simulated means generated values. Real means read from Sentinel-1 scenes.

| File | Provenance | What it holds |
|---|---|---|
| `claims.geojson` | Fictional claims on real cropland | 259 claims scattered over a 4.5 km × 4.5 km area west of Karnal, Haryana. Every plot is an irregular, lightly smoothed shape (quadrilateral, trapezoid, chamfered pentagon, strip or blob) placed where ESA WorldCover 2021 marks at least 95% of it as cropland. **Featured:** A and B (2.5 ac each) share one wavy border. C is 0.4 ac. ARCHIVE is the retrospective case, with an applicant-reported harvest on 2024-10-08. **Review cases:** D–H are scattered across the area, and each needs a different kind of review. **Background:** 250 `KNL-###` claims whose simulated evidence supports the claim. Farmer names, acreage, claimed methods and the harvest date are fictional. The boundaries are illustrative, not surveyed parcels. Layout: `scripts/demo_layout.py`. |
| `evidence.json` | **Real** Sentinel-1A RTC | One `sentinel1_real` record per claim, keyed by `claim_id + season + geometry_hash`. Each record carries the actual acquisition dates, source scene IDs, plot means, valid coverage, gaps and quality gate. `model.dsr_score` is `null` because feature parity is unverified, and `compatibility_reason` says why. |
| `workflow-simulation.json` | **Simulated** | Labelled decision evidence for every claim except ARCHIVE (`SIM-*` scene IDs, fictional scores). It uses the same geometry hashes, so the app can show the real extraction alongside. `expected_outcomes` lists the intended route for each case. |
| `replay-claims.geojson`, `replay-evidence.json` | **Simulated** | 25 fictional replay claims. They have varied acreage (0.8–6.5 ac), simulated scores including exact priority ties (R07/R08 at 6400, R06/R11/R12 at 7200), disagreements with the claim (R15, R18 claim DSR with scores below 0.25), unscored cases with a manual visit reason (R21, R22), unscored incompatible cases (R23, R24) and one weak-coverage case (R25). |
| `replay-outcomes.json` | **Simulated** | Inspection outcomes keyed by claim ID, kept apart from the queue inputs. It includes outcome definitions and the generation assumption. |

## What the batch shows

Out of 259 claims, 8 need the officer's attention, and each needs a different action. The other 251 go to desk review.

| Claim | Simulated evidence | Route |
|---|---|---|
| B | Score 0.55, 2.5 ac | Field visit, rank 1 (priority 9,000) |
| E | Score 0.40, 1.8 ac | Field visit, rank 2 (5,760) |
| F | Score 0.63 on a PTR claim, 1.5 ac | Field visit, rank 3 (4,440) |
| D | Score 0.12 on a DSR claim, 3.2 ac | Field visit, rank 4 (3,072): the score disagrees with the claim |
| C | 16 pixel centres in a 0.4 ac plot | Boundary correction |
| G | 36-day gap between usable dates | Records request |
| H | Only 3 dates reach 70% plot coverage | Records request |
| ARCHIVE | Real export only, unscored | Records request (retrospective case) |

The map labels only these cases and draws the desk-review plots muted.

## Real extraction (demo/evidence.json)

- **Provider.** Microsoft Planetary Computer `sentinel-1-rtc`, read through anonymous SAS signing. Signed URLs are held in memory only and never written.
- **Coefficient and units.** Terrain-corrected γ⁰ (RTC). Plot values are `10*log10(mean linear power)` in dB, averaged over 10 m pixels whose centres fall inside the plot and are valid in both VV and VH. Linear means are kept as `vv_linear` and `vh_linear`.
- **Window.** 2024-06-01 to 2024-09-05 inclusive. Only ascending VV+VH scenes on one relative orbit (27) are used.
- **Catalog.** The search returned 9 items: 7 ascending on orbit 27 and 2 descending on orbit 136, which were excluded and listed in `catalog.excluded_items`. The expected 12-day repeat on 2024-06-28 is not in the catalog.
- **Usable dates.** 7: 06-04, 06-16, 07-10, 07-22, 08-03, 08-15 and 08-27. Valid coverage is 100% on every date.
- **Gaps.** 3 days at the window start, 24 days from 06-16 to 07-10, and 9 days at the window end. The longest gap equals the 24-day limit, so the default gate passes with **no margin**. A stricter gap limit would fail every plot on this track.
- **All plots.** Each of the 259 plots is read from the same 7 scenes, with one window read per scene. A–H and ARCHIVE cover 60–130 pixel centres each, except C.
- **Gate.** The gate requires ≥5 usable dates, ≥70% valid coverage per acquisition, gaps ≤24 days including the window edges, and ≥20 pixel centres inside the plot.
  - Every plot except C passes the gate.
  - C fails `boundary_quality` (16 pixels, flag `plot_too_small`), so the next action is a boundary correction.
- **Retrospective.** ARCHIVE has 7 real acquisitions before its fictional reported harvest date of 2024-10-08 (last on 2024-08-27). Its record includes a `retrospective` summary.

## Rebuild

```bash
uv venv --python 3.12 .sabut/evidence-venv
uv pip install --python .sabut/evidence-venv/bin/python -r scripts/requirements-evidence.txt
.sabut/evidence-venv/bin/python scripts/benchmark.py --trials 30 --cache .sabut/ricemapper
.sabut/evidence-venv/bin/python scripts/rebuild_demo_evidence.py
.sabut/evidence-venv/bin/python scripts/rebuild_demo_evidence.py --offline
```

Run the benchmark first, so that the real records carry the manifest's `model_version` and ordered `feature_schema`. No credentials are needed. The Planetary Computer issues anonymous SAS tokens.
