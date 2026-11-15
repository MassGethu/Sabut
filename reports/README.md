# Benchmark and model artifacts

The benchmark uses the public Ricemapper Punjab Kharif 2024 release (`microsoft/rice-irrigation-mapping-s1s2@62ba379`, paper arXiv 2507.08605v2). No Haryana labels were used, so no Haryana accuracy is reported.

| File | Contents |
|---|---|
| `benchmark.json` | Upstream commit, file hashes, task, split, seed, all three tracks, review thresholds, protocol differences and limitations. |
| `model-manifest.json` | `sabut-dsr-hc-lgb-v1`: artifact path and hash, the ordered 61-feature schema, processing assumptions, validation thresholds, `compatible_exports: []` and the compatibility check for the real export. |
| `models/sabut-dsr-hc-lgb.txt` | Native LightGBM text model (handcrafted features only). |
| `models/sabut-dsr-hc-features.json` | Ordered feature schema. |
| `replay.json` | Same-budget queue replay using simulated outcomes. Regenerate with `make replay`. |

## Results

The task is upstream `TASK=DSR` (DSR = 1; PTR and AWD-transplanted = 0). The split is stratified with `random_state=42`: train 1025, validation 129, test 129. Each split is about one-third DSR, with 42 DSR rows in test. Every track uses the same test split.

| Track | Test weighted F1 | DSR precision | DSR recall | Confusion matrix (rows: true non-DSR, DSR) |
|---|---|---|---|---|
| HC+P LightGBM (named released config) | 0.746 | 0.600 | 0.643 | [[69, 18], [15, 27]] |
| HC-only LightGBM (exported model) | 0.679 | 0.513 | 0.476 | [[68, 19], [22, 20]] |
| One-feature radar rule (`VV_ASCENDING_mean_spline_troughs_values_3 < 14`) | 0.550 | 0.310 | 0.310 | [[58, 29], [29, 13]] |

The paper reports 0.798 weighted F1 for autoencoder + Fourier features. The HC+P rerun uses a single seeded holdout and 30 Optuna trials per track. The upstream training script defaults to 200 trials. [Ricemapper paper](https://arxiv.org/html/2507.08605v2)

## Review thresholds

Thresholds were selected for the HC-only model on validation only: `ptr_max_score` 0.30 and `dsr_min_score` 0.69. The objective was the most desk coverage with ≥90% precision on both desk-call sides.

On the untouched test split:
- 86% of rows fall in the review band.
- 12 rows are desk PTR calls, at 0.917 precision.
- 6 rows are desk DSR calls, at **0.667** precision, below the 0.90 target. The validation split had seven desk DSR calls.

These are model scores, not calibrated probabilities.

## Rerun

Follow the [evidence rebuild instructions](../demo/README.md#rebuild) to install the pinned libraries and rerun the 30-trial benchmark.
