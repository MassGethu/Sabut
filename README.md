# Sabūt · Satellite evidence for rice incentive inspections

**See which rice claims need a field visit.**

INNOVEX 2026 · PS 02 · Smart Agriculture

**[Open the live Sabūt website](https://sabut.vercel.app/)**

An agriculture officer in Haryana has time for one field visit. Two neighboring farms both report direct-seeded rice (DSR). Which visit would help establish whether the farmer sowed seed directly or transplanted seedlings?

Sabūt turns claimed plot boundaries and dated Sentinel-1 radar observations into a review queue the officer can inspect and act on. It shows why a claim is ready for desk review, needs a field visit, or calls for records or a corrected boundary. The officer records the next step, and the farmer can request a correction in their language.

## What the prototype shows

| Demo proof point | What you can verify |
| --- | --- |
| **259 fictional claims near Karnal** | 251 go to desk review, four are candidates for a field visit, three need records, and one needs a boundary correction. These counts describe the demo batch. |
| **One visit slot** | Change the budget from zero to one and plot B enters the allocation. Its rank reflects score ambiguity and claimed acreage. The field sheet gives the team a location and a question to ask. |
| **An auditable override** | Meena records a visit request, then asks for dated sowing records. The history preserves the original recommendation, both actions, and their reasons. |
| **A farmer correction with a receipt** | Submit a simulated request from the Hindi or Punjabi farmer preview and find the same receipt in the officer history. |
| **Seven real pre-harvest radar acquisitions** | Open **ARCHIVE** to trace observations from 4 June to 27 August 2024, before the fictional applicant's reported harvest on 8 October. |

[Demo data and provenance](demo/README.md) · [Judge walkthrough](JUDGE.md)

## Run the demo locally

Use macOS or Linux with Python 3.12–3.14, Node.js 22 or later, npm, and Make. From the repository root, install dependencies and build the frontend with internet access. Set `PYTHON` to your installed interpreter.

```sh
make install PYTHON=python3.14
make run
```

Open [the officer workspace](http://127.0.0.1:8000/). The built demo runs offline using bundled assets, cached evidence, and a local SQLite workspace. Set `SABUT_PORT` if port 8000 is occupied.

1. Click **Load demo batch**, or upload [`demo/claims.geojson`](demo/claims.geojson). Click **Compare neighbours** to see why A goes to desk review and B is recommended for a visit. Open **C** to see the boundary flag.
2. Set **Field visits today** to **1**. Select **B** and inspect the rank explanation and field sheet. Record **Request field visit**, then save a **Request records** override with a reason.
3. Open **Preview farmer card for B**, switch languages, send a simulated correction, and follow the receipt back to Meena's history.
4. Select **ARCHIVE** and expand **Evidence details** to see source scene IDs, VV/VH measurements, and coverage. Open **Evidence & Results** to see the benchmark and visit replay.

To start over, stop the server and run `make reset-demo`. It archives the default database under `.sabut/backups/`. To rehearse in a separate workspace, start the server with `SABUT_DB_PATH` pointing to a fresh SQLite file.

## How it works

1. **Match the claim to its evidence.** FastAPI validates the GeoJSON and links each claim to a cached export by claim ID, season, and boundary hash. The officer can inspect VV/VH, coverage, dates, and the preprocessing used for each scene.
2. **Check whether a score can be used.** By default, the policy requires at least five usable dates with VV and VH, at least 70% valid plot coverage per usable acquisition, and gaps of at most 24 days including the window edges. Real scores require a verified match to the model's inputs. For **ARCHIVE**, the radar is available and the score is withheld because feature compatibility is unverified.
3. **Allocate the visit budget.** A compatible score that supports the claimed method can route the case to desk review. Ambiguity or disagreement can trigger a visit recommendation. The queue orders scored cases with acreage by `score ambiguity × claimed acres × 4,000`.
4. **Record and communicate the action.** The database stores the officer, reason, timestamp, and recommendation at the time of the action. The farmer preview shows the recorded next step and issues a receipt for a correction request. Claim approvals and payments stay with the existing programme.

| Layer | Technologies |
| --- | --- |
| Web and map | React, TypeScript, Vite, Leaflet, GeoJSON |
| API and storage | Python, FastAPI, Shapely, SQLite locally, Postgres via Supabase for hosted deployments |
| Radar extraction | Sentinel-1 RTC from Microsoft Planetary Computer, Rasterio, PyProj |
| Benchmark | LightGBM on Microsoft's released Ricemapper features |

[API contract and configuration](CONTRACT.md) · [Example API payloads](examples/api/) · [Ricemapper paper](https://arxiv.org/html/2507.08605v2) · [Ricemapper code and data](https://github.com/microsoft/rice-irrigation-mapping-s1s2)

## Evaluation

### Sowing classification benchmark

The three tracks used the same stratified holdout of 129 Punjab plots from Microsoft's public Ricemapper features.

| Track | Test weighted F1 |
| --- | ---: |
| Handcrafted + Presto features with LightGBM | **0.7464** |
| Handcrafted features with LightGBM | 0.6790 |
| Radar-rule baseline | 0.5504 |

On the handcrafted track, 111 of 129 test cases fell in the review band, and four of six DSR desk calls were correct, below the 90% validation target. The released coordinates are unavailable, so geographic separation could not be verified. Accuracy on Haryana claims requires an independently labeled local evaluation. [Benchmark methodology](reports/README.md) · [Model manifest](reports/model-manifest.json)

### Visit allocation replay

Each method received five visits from the same 17 eligible claims. The inspection outcomes are simulated.

| Method | Cases resolved or corrected |
| --- | ---: |
| Sabūt's acreage-weighted priority | 3/5 |
| Seeded random | 3/5 |
| Score ambiguity alone | 4/5 |

The replay tests how the allocation rule behaves under a fixed budget. A field pilot would measure visits saved at comparable decision quality and track how acreage weighting affects review by plot size and location. [Replay data and assumptions](reports/replay.json)

## Development and deployment

- After a frontend change, run `make build` and restart the local server. For API-only development, run `make install-api PYTHON=python3.14`, then `.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1`.
- Run `make evidence` to rebuild the cached demo artifacts offline. Run `.venv/bin/python -m backend.replay` to regenerate the replay. See the [evidence build notes](demo/README.md#rebuild) for dependencies and commands.
- For a hosted demo, import the repository into Vercel with the **Other** framework preset. The checked-in [Vercel config](vercel.json) serves the Vite build and routes API requests to one Python function in Sydney (`syd1`). Use a Supabase project near the function and set `DATABASE_URL` in Vercel to its transaction pooler connection string (port 6543). The API creates its tables on first use. Without `DATABASE_URL`, the function uses temporary SQLite and persistent storage is unavailable.

## Demo video

[Watch the Sabūt walkthrough on YouTube](https://www.youtube.com/watch?v=jPY-thYjvsE)
