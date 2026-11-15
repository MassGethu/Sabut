# INNOVEX 2026 · Sabūt judge notes

## Unstop fields

### Project title

Sabūt · Satellite evidence for rice incentive inspections

### Problem statement

PS 02 · Smart Agriculture, crop monitoring

### Description

Sabūt helps Haryana agriculture officers decide where a field visit could resolve a direct-seeded rice incentive claim. Officers upload GeoJSON claims, inspect plot-level Sentinel-1 VV/VH measurements with source scene IDs and coverage, and see which claims need desk review, a field visit, or records or a boundary correction. A budgeted queue makes the reason for each visit visible. Officers record or override a recommendation with a reason. A local Hindi or Punjabi farmer card lets the applicant request a correction and see a receipt.

In Kharif 2024, Haryana's physical verification confirmed direct-seeded rice on 156,891.37 of 506,814.73 registered acres, about 31%. Officials reported that 42,036.78 acres could not be checked after harvest. The retrospective demonstration shows how earlier radar can still be inspected and when dated sowing records are needed. [The Tribune, 28 November 2024](https://www.tribuneindia.com/news/haryana/69-of-claims-of-haryana-farmers-for-dsr-incentive-found-fake)

### Technologies

Python, FastAPI, SQLite, React, TypeScript, Vite, Leaflet, GeoJSON, Sentinel-1, and LightGBM on the public Ricemapper features.

### GitHub repository

[MassGethu/Sabut](https://github.com/MassGethu/Sabut)

### Live demo

Run the local production build using the repository README.

## Walkthrough

| Beat | Show the judges |
|---|---|
| Compare neighboring claims | Upload the demo GeoJSON. Compare A and B on the map. Both claim DSR. A's score supports desk review. B's ambiguous signal calls for confirming how rice was established. Open C to explain the observation or boundary problem. |
| Allocate one field visit | Change the budget from 0 to 1 and show B's allocated rank, ambiguity, claimed acreage and priority index. Save Meena's desk review on A and visit request on B. Save an override on B with a reason and inspect the recommendation snapshot. |
| Give the farmer recourse | Open B's farmer card in Hindi and Punjabi. Submit a simulated correction in either language. Match its receipt to the officer history. |
| Inspect the retrospective archive | Open the separate claim with an applicant-reported harvest date. Open real Sentinel-1 acquisitions dated earlier. Point out the coverage and scene IDs. These scenes establish what radar was captured before the reported harvest. Request dated sowing records when model compatibility or evidence support is insufficient. |
| Explain the evaluation | Open the public-feature benchmark and its radar-rule baseline, and disclose the split and regional limits. Open the replay and read the counts and denominators for all three methods at the same budget. The inspection outcomes in the replay are simulated. |

## Responsible AI

Meena owns all recorded actions, including overrides. Sabūt makes no automatic claim decisions or payments. Farmers can request a correction in Hindi or Punjabi. The benchmark uses public Ricemapper data from Punjab. Plot coordinates needed to verify geographic separation are unavailable, and the demonstration has no independently labeled Haryana accuracy evaluation. Claimed acreage can move large plots up the queue. Measure who gets extra review by plot size and geography in a pilot, and compare visits saved at a similar incorrect-decision rate. [Ricemapper paper](https://arxiv.org/html/2507.08605v2)
