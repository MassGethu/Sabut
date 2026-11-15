# Sabūt

**See which rice claims need a field visit.** Sabūt helps a Haryana agriculture officer review direct-seeded rice (DSR) claims with dated Sentinel-1 observations, a visit queue, recorded actions, and a farmer review request. INNOVEX 2026 · PS 02 · Smart Agriculture.

## Run locally

Use macOS or Linux with Python 3.12–3.14, Node.js 22 or newer, npm, and Make. From the repository root, install dependencies and build the frontend with internet access.

```sh
make install PYTHON=python3.14
```

Change `PYTHON` to your installed interpreter if needed. After installation, start the production build and API without internet access.

```sh
make run
```

Open `http://127.0.0.1:8000/`. The server uses local UI assets, cached artifacts and the SQLite workspace at `.sabut/workspace.sqlite3`. Set `SABUT_PORT` if the default port is occupied. To reset the demo, stop the server and run:

```sh
make reset-demo
```

The command moves the default database into `.sabut/backups/`. The next start opens an empty workspace. A custom `SABUT_DB_PATH` is outside this reset command.

For API work without the frontend, run `make install-api PYTHON=python3.14` and then `.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1`. The API description is in [CONTRACT.md](CONTRACT.md), with [example payloads](examples/api).

## Judge walkthrough

1. Upload `demo/claims.geojson` or use the demo load control. Compare A and B on the plot map. Both fictional claims say DSR. A's simulated score supports desk review. For B, the visit should establish whether the farmer sowed seed directly or transplanted seedlings. Open C and read which criterion failed and what the officer should request.
2. Change the visit budget from **0** to **1**. B enters the allocation. Its rank uses score ambiguity and claimed acres. Record Meena's desk review on A and field visit request on B, each with a reason. Record a different action on B with an override reason.
3. Open B's farmer card. Switch between Hindi and Punjabi, submit a simulated correction, and match the receipt to the officer's history. Restart and confirm the actions and request are still there.
4. Open the real radar evidence and inspect VV/VH, coverage, acquisition dates, scene IDs and preprocessing. Open the retrospective claim, where the applicant-reported harvest date is later than the archived observations. The archive can establish that radar was acquired over the plot before the reported harvest. Explain what records or officer review can resolve.
5. Open the Ricemapper benchmark and the queue replay. The benchmark reruns sowing classification on released features. The replay measures counts under a fixed visit budget with simulated inspection outcomes.

The workflow uses fictional claims, simulation scores and simulated farmer receipts. The provenance on each card identifies observed radar and model output. Meena owns the action. Approvals, rejections and payments are outside the application.

## Evidence and policy

The default quality gates require five distinct usable dates with VV and VH, at least 70% valid plot coverage per usable acquisition, and gaps of at most 24 days including both window edges. The API verifies model compatibility after checking the boundary and observations. Configure the prototype gates through `SABUT_MIN_USABLE_DATES`, `SABUT_MIN_VALID_FRACTION`, and `SABUT_MAX_GAP_DAYS`.

The visit priority multiplies score ambiguity by the stated acreage and the historical demo multiplier of 4,000 (`SABUT_ACREAGE_MULTIPLIER`). It is a queue priority index. Scored visits without acreage follow the weighted cases, and documented manual visits follow both. An officer can override the recommendation with a reason. Each saved event records the reason, actor, UTC timestamp and the recommendation at the time of recording.

The classification foundation is Microsoft's Ricemapper. See [the paper](https://arxiv.org/html/2507.08605v2) and [released code and features](https://github.com/microsoft/rice-irrigation-mapping-s1s2).

## Responsible AI

Regional and preprocessing differences limit what the benchmark says about new Haryana plots. Officers can inspect evidence, request records and override a recommendation. The Hindi and Punjabi cards give farmers a way to raise a correction. Acreage weighting can place larger claims earlier. In a pilot, measure visits saved at a comparable incorrect-decision rate, and track which plots receive additional review by size and geography.
