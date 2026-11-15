# Sabūt frontend

React 18 + TypeScript + Vite. Leaflet draws the claimed plot boundaries with no tile layer, so the map works offline. Fonts (Noto Sans, Devanagari and Gurmukhi) are bundled from npm, so the production build makes no external requests.

The UI calls a relative `/api` path. It shows the backend's status, rank, allocation and priority index as returned and never computes them.

## Commands

```sh
npm ci                # once, with network
npm run dev           # http://localhost:5173, proxies /api and /demo to http://127.0.0.1:8000
npm run build         # type-checks, then writes dist/ (served by FastAPI at / via `make run`)
```

Set `SABUT_API_URL` to proxy to another API origin. Add `?fixtures` to the URL to run against the captured contract payloads in `src/fixtures/` with no backend. Fixture mode includes an uncached plot, an incompatible export (X) and a retrospective case (R). In fixture mode, the reason `fail` simulates an API error on save.

## Judge click sequence

1. **Officer workspace → Upload GeoJSON** and choose `demo/claims.geojson`. The **Download demo GeoJSON** link gives the same file, and **Load demo batch** works too. The queue shows B, A, C. The budget is **0**, so this is a dry run.
2. Click **Compare A · B**, or Shift-click A and B on the map. Both claim DSR. Each column shows the simulated decision series, the real Sentinel-1 series, the status, the next action and the model score. B shows the field-team question.
3. Click **C** in the queue or on the map. It shows **Insufficient evidence** with a failed boundary gate, the `plot_too_small` flag and **Request boundary correction**.
4. Press **+** to set the budget to 1. B turns orange and shows **In visit budget** and **Visit #1 → Claim B**. The rank reason gives the ambiguity × 2.5 ac × 4000 priority index.
5. Select **A**, enter a reason and click **Save: Desk review**. Select **B**, enter a reason and click **Save: Request field visit**. To show an override, choose **Request records** on B, enter a reason and click **Save override**. The history shows the **Override** tag and the recommendation snapshot.
6. Click **Preview farmer card for B →**. Switch between **हिन्दी** and **ਪੰਜਾਬੀ**, pick a preset reason and click **Send request**. Then click **See it in Meena's workspace →**. The request appears highlighted in B's history.
7. Select **A** and scroll to **Review after harvest**. It shows the applicant-reported harvest date of 8 Oct 2024, 7 real acquisitions before that date, and the scene IDs in the acquisition table.
8. Open **Evidence & results** to see the real extraction for each claim, the benchmark (or its pending state), the same-budget replay table and the Responsible AI notes.
