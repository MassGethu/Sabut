# Sabūt — Satellite evidence for rice incentive inspections

**Submit under PS 02 · Smart Agriculture.**  
**Tagline** — *See which rice claims need a field visit.*

## Idea and user

Sabūt helps an agriculture officer review claims for direct-seeded rice incentives. The officer imports claimed plot boundaries. Sabūt assembles each plot's satellite radar history, checks whether enough usable evidence exists, and recommends which claims would benefit most from a field visit. The officer can inspect the evidence, request a visit, and record a decision. The farmer receives a plain-language status and a way to request a review.

Haryana operates a direct-seeded rice incentive scheme. Sabūt focuses on the officer who has more claims than visits available and needs to decide where a field check adds the most value. Too few radar observations, an unreliable boundary, and a signal consistent with multiple sowing methods call for different next actions. [Haryana agriculture scheme portal](https://fasal.haryana.gov.in/) · [Haryana agriculture scheme overview](https://hipaco.in/public/hipa/pdf/prochures/gujarat/InitativesofAgricultureDepartmentHaryana.pdf)

Meena, a fictional Agriculture Development Officer, can send a field team to one of three claimed plots today. **Two neighboring plots claim the same sowing method. Sabūt shows why one is ready for desk review and the other needs a visit. Meena records the action on both.** Farmers and incentive claims in the demo are fictional.

## Prototype workflow

| Step | What the judge sees |
|---|---|
| Import | Upload GeoJSON containing a claim ID, plot boundary, season, and claimed sowing method. Load a small batch with three featured cases. |
| Inspect the evidence | See each plot on a map and chart its Sentinel-1 VV/VH observations across the sowing window. Inspect dates, usable counts, gaps, scene IDs, and processing version. |
| Choose the next action | See **Ready for desk review**, **Field check recommended**, or **Insufficient evidence**. A field check gives the team a question to confirm. A gap can trigger boundary correction or a request for records. |
| Allocate visits | Set the visit budget. See a reason for each rank and which cases fit the budget. Override the recommendation with a reason. |
| Record and communicate | Save the officer's action, reason, and timestamp. Open a Hindi or Punjabi evidence card with plain-language status and next action. Submit a simulated correction request through the local preview and see it in the officer view. |

Every case has an evidence trail and an officer-owned next action. Any approval, rejection, or payment remains outside the app's automated workflow.

## AI and architecture

Use Microsoft's **Ricemapper** as the disclosed foundation. Reproduce a named public-feature experiment for **direct-seeded rice (DSR) versus puddled transplanted rice (PTR)** using LightGBM and run the handcrafted-only track for practical extraction. The paper reports roughly **0.80 weighted sowing F1** for a specific feature combination in Punjab. Record the actual configuration and result for each rerun. The release omits original plot coordinates, so the public feature table supports a rerun but cannot reconstruct those plots or establish geographic separation by itself. [Ricemapper paper](https://arxiv.org/html/2507.08605v2) · [Microsoft code and public features](https://github.com/microsoft/rice-irrigation-mapping-s1s2)

```text
Claim boundary + season
       ↓
Sentinel-1 observations → versioned feature export
       ↓
Evidence checks → sowing classifier when features are compatible
       ↓
Evidence card → ranked officer queue → recorded action or field check
```

- **Data pipeline** — Use Python and one Sentinel-1 source during the sprint. Filter for consistent acquisition settings. Save scene IDs, dates, processing configuration, and per-plot coverage. Cache the demo exports for offline review. Verify coefficient, units, window, reducers, feature definitions, and missing-value handling before running inference. [Earth Engine Sentinel-1 guide](https://developers.google.com/earth-engine/guides/sentinel1) · [Copernicus Sentinel-1 GRD documentation](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S1GRD.html)
- **Review policy** — Check data sufficiency first. Fit review thresholds on held-out validation examples. A weak-evidence case gets its own reason and next action. Say **model score** unless calibration is demonstrated. Add prediction sets only if held-out calibration data support a coverage report.
- **App** — FastAPI, SQLite, React, and an offline-capable plot map. Keep the feature export and inference independent of the officer's action log. Publish one benchmark script and one evidence rebuild script. Telegram, route optimization, payments, and live retraining are outside the MVP.

Sabūt's original contribution is the claim-review workflow around Ricemapper's classification foundation. It gives the officer traceable plot evidence, a reasoned queue constrained by a visit budget, and a recorded action that a farmer can query or challenge.

## Measurement and proof

| Question | Test |
|---|---|
| Does the public benchmark reproduce? | Report the named configuration, holdout method, weighted F1, DSR precision and recall, confusion matrix, seed, and class counts. Compare with a simple radar rule on the same split. Disclose unavailable geographic grouping and any differences from the published protocol. |
| Does the queue help allocate scarce visits? | Replay the actual policy against random selection and score-only ordering under the same candidate pool and budget. Count visits reaching cases the inspection resolves or corrects. Label simulated inspection outcomes and report absolute counts and denominators. |
| Can the app act on weak evidence? | Demo a small or poorly observed plot, an incompatible feature export, and an officer override. Check that every unresolved case keeps a reason and next action. |
| Does extraction work on new plots? | Show real georeferenced radar extraction and its provenance. Report Haryana accuracy only with independent plot-level labels. |

**Sprint proof** — A reproduced public-feature benchmark, a real Sentinel-1 extraction, and a working officer-to-farmer review loop.

**Pilot proof** — Field visits saved at a comparable incorrect-decision rate, measured with an agriculture department or extension partner. Track which claims receive additional review by plot size and geography.

Keep the public benchmark, observed radar, and simulation identifiable in the app and submission. Where a real extraction is incompatible with the model, show the real observations and explain why the score is unavailable. Use the labeled simulation for the decision scenario.
