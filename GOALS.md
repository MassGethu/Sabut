# Sabūt · Six-hour build plan and coding goals

Upload these four Markdown files to the repo root. Give every session access to [HACKATHON.md](HACKATHON.md), [PRODUCT.md](PRODUCT.md), and [CONTRACT.md](CONTRACT.md). Start the three sessions together in separate checkouts. Use `build/core`, `build/ui`, and `build/evidence` from the same starting commit. You run Codex and your Claude Code. Your teammate runs their own Claude Code and handles the provider setup. You own the merge and judge run.

Copy the relevant `/goal` line into each session, then send its implementation brief. If the installed client lacks `/goal`, paste both together as a normal prompt. [Codex Goals](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex) · [Claude Code commands](https://code.claude.com/docs/en/commands)

## Schedule

| Elapsed | You · Codex and Claude Code | Teammate · Claude Code |
|---|---|---|
| 0:00–0:20 | Publish the contract and branches. Start the backend and UI against the sample payload. | Verify an Earth Engine project and run one polygon query. Pin Ricemapper and locate the released feature archive. |
| 0:20–1:15 | Upload GeoJSON in the browser, open one evidence card, save an officer action to SQLite. | Run a first benchmark and send the first real export with dates, coordinates, and scene IDs. |
| 1:15–2:30 | Implement the three statuses, budget, ranks, override, history, both farmer languages, and correction request. | Finish cached evidence, the labeled simulation, benchmark comparison, and threshold and model manifest. |
| 2:30–3:30 | Merge into the integration branch. Wire the compatibility gate and real extraction, benchmark, and replay panel. | Validate the merged data path. Check provenance, processing assumptions and what the model consumed. |
| 3:30–4:40 | Run the actual queue replay, acceptance checks, persistence test, and submission prep. | Rerun the scripts, review the numbers, and document the pilot measurement plan and limitations. |
| 4:40–6:00 | Freeze features. Start from a clean checkout, rehearse with networking off, and prepare the Unstop fields. | Verify the evidence and metrics in the presenting build. Rehearse the data explanation. |

If the first clean extraction uses different preprocessing from Ricemapper, show the still-usable real radar history and its compatibility reason immediately. Keep the three demonstration cases executable with labeled simulated evidence. Continue the benchmark and compatibility checks in parallel.

## Goal 1 · Your Codex

```text
/goal Deliver the integrated, offline-running Sabūt prototype in CONTRACT.md, verified from a clean checkout by a smoke test and the full judge demo.
```

```text
Read HACKATHON.md, PRODUCT.md and CONTRACT.md. Own backend/, contract
changes, integration checks, root startup and reset, and the README.
Use build/core. Publish any additional sample payloads in the first
20 minutes so the UI and evidence lanes can proceed independently.

Build FastAPI + SQLite. Reuse the same importer for uploads and the
featured batch. Validate claims and return feature-level errors. Key
cached evidence to claim ID, season and geometry hash. Keep evidence,
inference, officer events and simulated correction requests independent.

Evaluate boundary and observation sufficiency before model compatibility
and score support. Use documented thresholds from the evidence lane.
Display a concrete next step on every case, including unscored cases.
Rank visit-resolvable cases deterministically. Preserve reasons and
recommendation snapshots when Meena records actions and overrides.

Build the replay using the actual queue policy against seeded random and
score-only orderings. Use the same candidate pool and budget for all three,
declare the score-only ordering and missing-score handling, and keep
inspection outcomes out of the ranking inputs. Write reports/replay.json
with resolved-or-corrected counts and denominators. Label simulated
outcomes and report the measured result even if Sabūt ties or loses.

Merge both lanes. Verify upload, dry run with budget zero, change to one,
A desk review, B visit request, weak C, override, uncached plot,
incompatible export, both farmer languages, correction receipt and
persistence after restart. Confirm the app presents the real extraction
and generated benchmark and replay reports. Document local run, reset,
and tested acceptance results. Finish with an offline judge run.
```

## Goal 2 · Your Claude Code

```text
/goal Build the Sabūt React UI in frontend/ and verify the complete Meena officer and farmer workflow against the FastAPI contract.
```

```text
Read HACKATHON.md, PRODUCT.md and CONTRACT.md. Work only in frontend/
on build/ui. Start from the contract payload so you can build before
the API or evidence is ready. Connect to the real API before handoff.

Build an officer workspace with GeoJSON upload, demo load, a ranked claim
queue, a visit budget control, and selected-claim evidence. Show adjacent
A/B boundaries on an offline plot map. Chart date-aligned VV/VH with units,
usable counts and visible gaps. Add an acquisition table for scene IDs,
quality flags and preprocessing version. Put provenance next to each
observed chart and simulated or real model score.

Make all three statuses, rank reasons and next actions easy to scan.
Show which recommendations fit the budget. Let Meena request a visit,
record an action with a reason, and override with a reason. Display the
recorded history. Build a local farmer card in Hindi and Punjabi that
explains the recorded status and next action in plain language. Include
the simulated correction form, receipt and officer-side record.

Add a panel for the real extraction, benchmark and replay results.
Keep assets local. Run the production build and verify upload, plot
selection, budget change, officer action, override, language switching
and the farmer request in a browser. Commit the UI and send the demo
click sequence, any failed checks, and the branch to the integrator.
```

## Goal 3 · Teammate's Claude Code

```text
/goal Deliver a reproducible Ricemapper benchmark, a real georeferenced Sentinel-1 extraction and cached Sabūt evidence that validates against CONTRACT.md.
```

```text
Read HACKATHON.md, PRODUCT.md and CONTRACT.md. Use build/evidence. Own
scripts/benchmark.py, scripts/rebuild_demo_evidence.py, demo/ and the
benchmark and model artifacts under reports/. Verify Earth Engine access
first. If the team already has a working Copernicus setup and Earth Engine
access stalls, switch early and keep one provider for the final export.

Extract VV/VH for a small Haryana batch including adjacent plots and a
small plot. Record scene IDs, dates, orbit and polarization, coverage,
units, window, provider and processing version. Cache the output. Send
the first real export to Codex before finishing the benchmark.

Pin the Ricemapper commit and paper version. Inspect the release columns,
labels and task settings. Reproduce a named released DSR/PTR LightGBM
configuration and run a handcrafted-only LightGBM track. Report the exact
features, holdout method, seed, class counts, weighted F1, DSR precision
and recall, and confusion matrix. Fit a simple radar-rule baseline on
training rows and compare on the same holdout. Note missing paper inputs
and whether geographic separation can be verified. Cite the paper's
roughly 0.80 weighted F1 as a published result for specific configurations.

Fit review thresholds using a separate validation split and evaluate on
untouched test data. Export model version and ordered feature schema.
Check the real export for coefficient, units, reducers, smoothing, window,
cadence, feature definitions and missingness. Report null model scores
with a reason where parity is unverified. Ship real observations even
when they cannot be scored. Report regional accuracy only with independent
plot-level labels.

Deliver cached observed records and clearly labeled A/B/C simulation
records plus a replay dataset with inspection outcomes separate from
queue inputs. Provide exact rerun commands and actual results. Hand off
the manifest and artifacts by 2:30 and help verify them in the merged app.
```

## Judge run

1. Import the featured GeoJSON. Select neighboring A and B, both claiming DSR. Show why A is ready for desk review and what a field team should confirm on B. Show C's boundary or records request.
2. Change visit budget from zero to one. Show B enter the allocation and explain its rank. Record Meena's actions on A and B.
3. Preview B's Hindi or Punjabi farmer card. Send a simulated correction request and show the saved record in the officer view.
4. Inspect the real radar acquisitions, the actual benchmark numbers, and the same-budget replay. Describe the prospective pilot measure of field visits saved at a comparable incorrect-decision rate and track additional-review burden by plot size and geography.

Confirm the real submission cutoff in signed-in Unstop. Use the fields in [HACKATHON.md](HACKATHON.md) to prepare the entry.
