"""Reproducible Ricemapper sowing (DSR) benchmark for Sabūt.

Downloads the released Ricemapper feature tables at a pinned commit, verifies their
SHA-256, and runs on one stratified split (upstream recipe: test 10%, validation 10%,
random_state 42):

  hc_p_lgb    named released configuration: DSR task, Jun 1-Sep 5 f=4d, HC+P features, LightGBM
  hc_lgb      handcrafted-only LightGBM (the track Sabūt could compute from a plot series)
  radar_rule  one-feature threshold rule fit on training rows only

Then selects Sabūt review thresholds on the validation split for the HC-only model,
evaluates them once on the untouched test split, and exports:

  reports/benchmark.json
  reports/model-manifest.json
  reports/models/sabut-dsr-hc-lgb.txt          (native LightGBM text model)
  reports/models/sabut-dsr-hc-features.json    (ordered feature schema)

Usage:
  python scripts/benchmark.py [--trials 30] [--cache ~/.cache/sabut/ricemapper]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "reports"
MODELS = REPORTS / "models"

UPSTREAM_REPO = "microsoft/rice-irrigation-mapping-s1s2"
UPSTREAM_COMMIT = "62ba379a8b1c923eb36232ee814bfdee6ce861c3"
PAPER = {
    "title": "Machine Learning for Sustainable Rice Production: Region-Scale Monitoring of Water-Saving Practices in Punjab, India",
    "authors": "Ando Shah et al.",
    "arxiv": "2507.08605v2",
    "url": "https://arxiv.org/abs/2507.08605v2",
    "published_weighted_f1": 0.798,
    "published_configuration": "Autoencoder + Fourier features (AE+FT), Punjab sowing classification.",
}
FILES = {
    "train_HC": ("data/features/06-01_09-05_f4d/train_HC.parquet",
                 "33cb92e003f7573a5754fe5edabd55e10d3c49773dd149623516dd914ec55de7"),
    "train_HC_P": ("data/features/06-01_09-05_f4d/train_HC_P.parquet",
                   "593b6441ae226612cc8a437f1081c040c3d5a69b221eaa98ccaaee4703b7b431"),
    "pretrained_lgb": ("data/models/DSR_Jun-Sep/lgb_model.txt",
                       "bea0457452602f9c9e971a2ab68b9d3c601aeacb4b3e68d2824ab21cb17c1d1a"),
}
LABEL_MAP = {"AWD": 0, "PTR": 0, "DSR": 1}  # upstream TASK=DSR
DROP = ["label", "Class"]
SEED = 42
SPLIT_TEST = 0.1
SPLIT_VAL = 0.1
TARGET_DESK_PRECISION = 0.90
MODEL_VERSION = "sabut-dsr-hc-lgb-v1"


def fetch(cache: Path) -> dict[str, Path]:
    paths = {}
    for key, (rel, sha) in FILES.items():
        dest = cache / UPSTREAM_COMMIT / rel
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            url = f"https://raw.githubusercontent.com/{UPSTREAM_REPO}/{UPSTREAM_COMMIT}/{rel}"
            print(f"downloading {rel}", flush=True)
            tmp = dest.with_suffix(dest.suffix + ".part")
            urllib.request.urlretrieve(url, tmp)  # noqa: S310 - fixed https URL at a pinned commit
            tmp.rename(dest)
        digest = hashlib.sha256(dest.read_bytes()).hexdigest()
        if digest != sha:
            raise RuntimeError(f"SHA-256 mismatch for {rel}: {digest}")
        paths[key] = dest
    return paths


def split(df: pd.DataFrame):
    y = df["label"].map(LABEL_MAP)
    if y.isna().any():
        raise ValueError(f"Unexpected labels: {sorted(df.loc[y.isna(), 'label'].unique())}")
    X = df.drop(columns=DROP)
    X_tmp, X_test, y_tmp, y_test = train_test_split(X, y, test_size=SPLIT_TEST, random_state=SEED, stratify=y)
    X_tr, X_val, y_tr, y_val = train_test_split(
        X_tmp, y_tmp, test_size=SPLIT_VAL / (1 - SPLIT_TEST), random_state=SEED, stratify=y_tmp)
    return X_tr, X_val, X_test, y_tr.astype(int), y_val.astype(int), y_test.astype(int)


def metrics(y_true, y_pred) -> dict:
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return {
        "n": int(len(y_true)),
        "weighted_f1": round(float(f1_score(y_true, y_pred, average="weighted")), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro")), 4),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "dsr_precision": round(float(precision_score(y_true, y_pred, pos_label=1, zero_division=0)), 4),
        "dsr_recall": round(float(recall_score(y_true, y_pred, pos_label=1, zero_division=0)), 4),
        "confusion_matrix": {"labels": ["non-DSR (PTR or AWD-transplanted)", "DSR"],
                             "rows_true_cols_pred": cm.tolist()},
    }


def balanced_weights(y: pd.Series) -> np.ndarray:
    counts = np.bincount(y)
    w = len(y) / (len(counts) * counts)
    return w[y.to_numpy()]


def fixed_params() -> dict:
    return {"objective": "multiclass", "num_class": 2, "boosting_type": "gbdt", "random_state": SEED,
            "verbose": -1, "max_bin": 63, "bin_construct_sample_cnt": 100000, "force_row_wise": True,
            "n_jobs": max(1, (os.cpu_count() or 2) - 1), "deterministic": True}


def tune_and_fit(X_tr, y_tr, X_val, y_val, trials: int):
    """Upstream search space (scripts/train/train_model.py), TPE sampler seeded, val weighted F1."""
    w = balanced_weights(y_tr)

    def objective(trial):
        params = {**fixed_params(),
                  "max_depth": trial.suggest_int("max_depth", 3, 8),
                  "learning_rate": trial.suggest_float("learning_rate", 0.001, 0.01, log=True),
                  "n_estimators": trial.suggest_int("n_estimators", 100, 500),
                  "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                  "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
                  "min_child_samples": trial.suggest_int("min_child_samples", 5, 30),
                  "min_split_gain": trial.suggest_float("min_split_gain", 1e-8, 0.1),
                  "num_leaves": trial.suggest_int("num_leaves", 20, 3000),
                  "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 0.5, log=True),
                  "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 0.5, log=True)}
        model = lgb.LGBMClassifier(**params).fit(X_tr, y_tr, sample_weight=w)
        return f1_score(y_val, model.predict(X_val), average="weighted")

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=SEED))
    study.optimize(objective, n_trials=trials, n_jobs=1)
    params = {**fixed_params(), **study.best_params}
    model = lgb.LGBMClassifier(**params).fit(X_tr, y_tr, sample_weight=w)
    return model, study.best_params, round(float(study.best_value), 4)


def run_lgb_track(name, df, trials, description):
    X_tr, X_val, X_te, y_tr, y_val, y_te = split(df)
    model, best, best_val = tune_and_fit(X_tr, y_tr, X_val, y_val, trials)
    print(f"{name}: val wF1 {best_val}", flush=True)
    return {
        "name": name, "description": description, "model": "LightGBM (LGBMClassifier, multiclass objective, 2 classes)",
        "n_features": int(X_tr.shape[1]),
        "hyperparameter_search": {"sampler": "optuna TPE seed 42", "trials": trials, "objective": "validation weighted F1",
                                  "search_space": "upstream train_model.py", "best_params": best,
                                  "best_validation_weighted_f1": best_val},
        "validation": metrics(y_val, model.predict(X_val)),
        "test": metrics(y_te, model.predict(X_te)),
    }, model, (X_tr, X_val, X_te, y_tr, y_val, y_te)


def radar_rule(X_tr, y_tr, X_te, y_te, columns) -> dict:
    """Best single feature + threshold + direction by training weighted F1. NaN predicts non-DSR."""
    best = None
    ytr = y_tr.to_numpy()
    for col in columns:
        x = X_tr[col].to_numpy(dtype=float)
        finite = x[np.isfinite(x)]
        if finite.size == 0:
            continue
        for t in np.unique(np.quantile(finite, np.linspace(0.02, 0.98, 49))):
            for direction in (">=", "<"):
                pred = np.where(np.isfinite(x), (x >= t) if direction == ">=" else (x < t), False).astype(int)
                score = f1_score(ytr, pred, average="weighted")
                if best is None or score > best[0]:
                    best = (score, col, float(t), direction)
    _, col, t, direction = best
    x = X_te[col].to_numpy(dtype=float)
    pred = np.where(np.isfinite(x), (x >= t) if direction == ">=" else (x < t), False).astype(int)
    xtr = X_tr[col].to_numpy(dtype=float)
    ptr = np.where(np.isfinite(xtr), (xtr >= t) if direction == ">=" else (xtr < t), False).astype(int)
    return {"name": "radar_rule", "description": "One-feature radar threshold rule fit on training rows (HC features).",
            "rule": f"predict DSR if {col} {direction} {t:.6g}", "feature": col, "threshold": t, "direction": direction,
            "fit": "exhaustive search over 61 HC features x 49 training quantiles x 2 directions, max training weighted F1",
            "train": metrics(y_tr, ptr), "test": metrics(y_te, pred)}


def select_thresholds(p_val: np.ndarray, y_val: np.ndarray) -> dict:
    """Maximise desk coverage on validation while both desk-call sides keep >= target precision."""
    grid = np.round(np.arange(0.02, 0.99, 0.01), 2)
    best = None
    for lo in grid:
        for hi in grid:
            if hi <= lo:
                continue
            dsr_calls = p_val >= hi
            ptr_calls = p_val <= lo
            if dsr_calls.sum() == 0 or ptr_calls.sum() == 0:
                continue
            prec_dsr = y_val[dsr_calls].mean()
            prec_ptr = 1 - y_val[ptr_calls].mean()
            if prec_dsr < TARGET_DESK_PRECISION or prec_ptr < TARGET_DESK_PRECISION:
                continue
            cov = (dsr_calls.sum() + ptr_calls.sum()) / len(p_val)
            key = (cov, -(hi - lo))
            if best is None or key > best[0]:
                best = (key, float(lo), float(hi))
    if best is None:
        return {"ptr_max_score": None, "dsr_min_score": None, "feasible": False}
    return {"ptr_max_score": best[1], "dsr_min_score": best[2], "feasible": True}


def evaluate_thresholds(p: np.ndarray, y: np.ndarray, lo: float, hi: float) -> dict:
    dsr_calls, ptr_calls = p >= hi, p <= lo
    band = ~(dsr_calls | ptr_calls)
    return {
        "n": int(len(p)),
        "desk_dsr_calls": int(dsr_calls.sum()), "desk_dsr_precision": round(float(y[dsr_calls].mean()), 4) if dsr_calls.any() else None,
        "desk_ptr_calls": int(ptr_calls.sum()), "desk_ptr_precision": round(float(1 - y[ptr_calls].mean()), 4) if ptr_calls.any() else None,
        "review_band_count": int(band.sum()), "review_band_fraction": round(float(band.mean()), 4),
        "desk_coverage": round(float(1 - band.mean()), 4),
        "dsr_in_review_band": int(y[band].sum()),
        "dsr_rows_called_ptr_at_desk": int(y[ptr_calls].sum()),
        "non_dsr_rows_called_dsr_at_desk": int((1 - y[dsr_calls]).sum()),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--trials", type=int, default=30, help="Optuna trials per LightGBM track (upstream uses 200).")
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "sabut" / "ricemapper")
    args = ap.parse_args()

    paths = fetch(args.cache)
    hc = pd.read_parquet(paths["train_HC"])
    hcp = pd.read_parquet(paths["train_HC_P"])
    if not hc["label"].equals(hcp["label"]) or not hc["label"].equals(hc["Class"]):
        raise ValueError("HC and HC_P rows or label/Class columns disagree; the shared split would be invalid.")
    class_counts = hc["label"].value_counts().to_dict()

    pretrained = lgb.Booster(model_file=str(paths["pretrained_lgb"]))
    pre_feats = pretrained.feature_name()
    hc_cols = [c for c in hc.columns if c not in DROP]
    pretrained_info = {
        "path": FILES["pretrained_lgb"][0], "sha256": FILES["pretrained_lgb"][1], "format": "LightGBM text v4",
        "num_class": 2, "n_features": len(pre_feats),
        "n_handcrafted_features": sum(f in hc_cols for f in pre_feats),
        "n_other_features": len(pre_feats) - sum(f in hc_cols for f in pre_feats),
        "feature_groups": sorted({f.split("_")[0] for f in pre_feats if f not in hc_cols}),
        "matches_train_HC_P_columns": all(f in hcp.columns for f in pre_feats),
        "used_for_scores": False,
        "reason_not_used": ("Its training split is not released, so scoring our holdout could include its training rows. "
                            "It also needs Presto embeddings that Sabūt cannot compute for a new plot. Inspected only."),
    }

    hcp_track, _, _ = run_lgb_track(
        "hc_p_lgb", hcp, args.trials,
        "Named released configuration: TASK=DSR, Jun 1-Sep 5 2024 at f=4d, handcrafted + Presto features (train_HC_P.parquet), LightGBM.")
    hc_track, hc_model, (X_tr, X_val, X_te, y_tr, y_val, y_te) = run_lgb_track(
        "hc_lgb", hc, args.trials,
        "Handcrafted-only LightGBM (train_HC.parquet), same split and search.")
    rule = radar_rule(X_tr, y_tr, X_te, y_te, hc_cols)
    print(f"rule: {rule['rule']} test wF1 {rule['test']['weighted_f1']}", flush=True)

    p_val = hc_model.predict_proba(X_val)[:, 1]
    p_te = hc_model.predict_proba(X_te)[:, 1]
    thr = select_thresholds(p_val, y_val.to_numpy())
    threshold_eval = None
    if thr["feasible"]:
        threshold_eval = {"validation": evaluate_thresholds(p_val, y_val.to_numpy(), thr["ptr_max_score"], thr["dsr_min_score"]),
                          "test": evaluate_thresholds(p_te, y_te.to_numpy(), thr["ptr_max_score"], thr["dsr_min_score"])}

    MODELS.mkdir(parents=True, exist_ok=True)
    model_path = MODELS / "sabut-dsr-hc-lgb.txt"
    hc_model.booster_.save_model(str(model_path))
    feature_schema = list(X_tr.columns)
    schema_path = MODELS / "sabut-dsr-hc-features.json"
    schema_path.write_text(json.dumps({"model_version": MODEL_VERSION, "ordered_features": feature_schema}, indent=2) + "\n")
    model_sha = hashlib.sha256(model_path.read_bytes()).hexdigest()

    split_info = {
        "method": "sklearn train_test_split, stratified on the DSR label, random_state 42: 10% test first, then 10% of all rows as validation (upstream SPLIT=0.1, SPLIT_VAL=0.1 recipe).",
        "seed": SEED,
        "rows": {"train": int(len(y_tr)), "validation": int(len(y_val)), "test": int(len(y_te))},
        "dsr_rows": {"train": int(y_tr.sum()), "validation": int(y_val.sum()), "test": int(y_te.sum())},
        "same_split_for_all_tracks": True,
        "geographic_separation": "Not verifiable. The release removes coordinates and district identifiers, so the holdout is a random plot-level split, not a geographic one.",
    }
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    benchmark = {
        "schema_version": 1, "generated_at": now, "generator": "scripts/benchmark.py",
        "rerun_command": f"python scripts/benchmark.py --trials {args.trials}",
        "provenance": "Public Ricemapper Punjab Kharif 2024 feature release (TNC PRANA labels). No Haryana labels were used or evaluated.",
        "paper": PAPER,
        "upstream": {"repo": f"https://github.com/{UPSTREAM_REPO}", "commit": UPSTREAM_COMMIT,
                     "files": {k: {"path": v[0], "sha256": v[1]} for k, v in FILES.items()},
                     "archive_not_used": "data/dataset_features.tar.xz (the two parquet files above are the extracted DSR inputs)"},
        "task": {"name": "DSR (sowing)", "label_map": LABEL_MAP,
                 "note": "Upstream TASK=DSR maps PTR and AWD to 0. AWD plots are transplanted with alternate wetting and drying, so the negative class is transplanted rice.",
                 "window": "2024-06-01 to 2024-09-05", "cadence": "4-day resampled grid (f=4d)",
                 "class_counts": class_counts, "binary_counts": {"DSR": int((hc['label'] == 'DSR').sum()), "non_DSR": int((hc['label'] != 'DSR').sum())}},
        "split": split_info,
        "tracks": [hcp_track, hc_track, rule],
        "comparison_on_test": {t["name"]: {"weighted_f1": t["test"]["weighted_f1"], "dsr_precision": t["test"]["dsr_precision"],
                                           "dsr_recall": t["test"]["dsr_recall"]} for t in (hcp_track, hc_track, rule)},
        "pretrained_model": pretrained_info,
        "protocol_differences": [
            f"Optuna runs {args.trials} trials per track (upstream default 200) with a seeded TPE sampler; upstream's sampler is unseeded.",
            "Hyperparameters are tuned on the validation split (upstream does the same when SPLIT_VAL > 0); the test split is used once.",
            "deterministic=True and n_jobs set to the local CPU count; upstream uses min(8, cpu_count//4).",
            "The paper's reported numbers may use different splits, trials or ensembles; this is a single seeded holdout of the public release.",
            "Geographic grouping (district holdout) cannot be reproduced because coordinates are removed.",
        ],
        "sabut_review_thresholds": {"model_version": MODEL_VERSION, **thr,
                                    "objective": f"On validation only: maximise desk coverage subject to >= {TARGET_DESK_PRECISION:.0%} precision for both desk DSR calls (score >= dsr_min_score) and desk PTR calls (score <= ptr_max_score); ties prefer the narrower review band. Grid step 0.01.",
                                    "evaluation": threshold_eval},
        "limitations": [
            "Punjab-only training labels; Haryana transfer is not validated and no Haryana accuracy is reported.",
            "Single random plot-level holdout of 129 test rows; metrics carry sampling noise of several F1 points.",
            "Scores are LightGBM model scores, not calibrated probabilities.",
            "Validation split has ~128 rows, so review thresholds are coarse.",
        ],
    }
    manifest = {
        "schema_version": 1, "generated_at": now, "model_version": MODEL_VERSION,
        "format": "lightgbm_text", "artifact_path": "reports/models/sabut-dsr-hc-lgb.txt", "artifact_sha256": model_sha,
        "feature_schema_path": "reports/models/sabut-dsr-hc-features.json",
        "feature_schema": feature_schema,
        "output": "predict_proba[:, 1] = model score for DSR (class 1). A model score, not a calibrated probability.",
        "training_data": {"source": f"{UPSTREAM_REPO}@{UPSTREAM_COMMIT}:{FILES['train_HC'][0]}", "rows": int(len(y_tr)),
                          "region": "Punjab, India, Kharif 2024"},
        "processing_assumptions": {
            "coefficient": "gamma0 (SNAP: orbit file, calibration to gamma0, multi-temporal Refined Lee speckle filter, terrain correction)",
            "orbit": "ascending", "polarizations": ["VV", "VH"],
            "plot_reducer": "exactextract area-weighted mean per plot (scripts/features/s1_stats.py)",
            "window": {"start": "2024-06-01", "end": "2024-09-05"},
            "cadence": "resampled to a 4-day grid and spline-smoothed before handcrafted features (troughs, crests, inflections, gaussian fit of VH/VV ratio)",
            "missing_values": "LightGBM native NaN handling; rows with NaN features exist in training",
        },
        "validation_thresholds": {"ptr_max_score": thr["ptr_max_score"], "dsr_min_score": thr["dsr_min_score"],
                                  "selected_on": "validation split", "objective": benchmark["sabut_review_thresholds"]["objective"]},
        "validation_metrics": hc_track["validation"], "test_metrics": hc_track["test"],
        "threshold_test_evaluation": threshold_eval["test"] if threshold_eval else None,
        "compatible_exports": [],
        "known_compatibility_limits": [
            "No export profile is verified compatible, so compatible_exports is empty and the API must not emit a real model score.",
            "Planetary Computer sentinel-1-rtc (sabut-s1rtc-plotmean-v1) is gamma0 RTC without speckle filtering, plot mean over pixel centres, 7 actual dates on relative orbit 27 with no 4-day resampling or spline features computed: parity unverified.",
            "Earth Engine COPERNICUS/S1_GRD is sigma0 in dB; converting units does not convert sigma0 to gamma0.",
            "Presto embeddings (needed by the upstream pretrained model) are not produced by Sabūt.",
        ],
        "real_export_compatibility": {
            "export": "demo/evidence.json", "processing_version": "sabut-s1rtc-plotmean-v1", "compatible": False,
            "checks": {
                "coefficient": "gamma0 RTC vs SNAP gamma0: similar coefficient, different processor and terrain model (unverified)",
                "units": "export dB of linear-power plot mean; training feature units after spline unknown (unverified)",
                "reducer": "pixel-centre mean vs exactextract area-weighted mean (differs at edges)",
                "smoothing": "none vs multi-temporal Refined Lee + spline (differs)",
                "window": "2024-06-01..2024-09-05 (matches)",
                "cadence": "7 actual 12-day-repeat dates (06-28 missing) vs 4-day resampled grid (differs)",
                "feature_definitions": "handcrafted features not computed for the export (missing)",
                "missingness": "no missing VV/VH on the 7 dates; one missing repeat date",
            },
        },
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "benchmark.json").write_text(json.dumps(benchmark, indent=2, allow_nan=False) + "\n")
    (REPORTS / "model-manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"comparison_on_test": benchmark["comparison_on_test"], "thresholds": thr,
                      "threshold_test": threshold_eval["test"] if threshold_eval else None}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
