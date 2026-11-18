"""Train the price-recommendation model (and the fraud anomaly model).

Price model
-----------
* target      : log(price / originalMRP)       (scale-free, see features.py)
* algorithm   : HistGradientBoosting, three quantile models (q10 / q50 / q90)
* constraints : price is monotone decreasing in age, increasing in condition and demand
* output      : median = recommended price, [q10, q90] = fair-price band
* evaluation  : held-out test set, compared with a naive baseline, plus 80%-interval coverage
* real data   : rows from server/data/export-training.json (sold listings) are mixed in with weight 5
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.services.features import encode, monotonic_vector, resolve_original, FEATURE_NAMES  # noqa: E402
from app.services.model_store import MODELS, PRICE_BUNDLE, FRAUD_BUNDLE, METRICS_PATH  # noqa: E402
from training.generate_seed import make_rows  # noqa: E402

REAL_DATA = ROOT.parent / "server" / "data" / "export-training.json"
REAL_WEIGHT = 5.0
QUANTILES = (0.10, 0.50, 0.90)


def load_real_rows() -> list[dict]:
    if not REAL_DATA.exists():
        return []
    rows = []
    for r in json.loads(REAL_DATA.read_text()):
        sold = r.get("soldPrice")
        if r.get("isSeed") or not sold or float(sold) <= 0 or float(r.get("originalPrice") or 0) < 80:
            continue
        rows.append({**r, "soldPrice": float(sold), "source": "real"})
    return rows


def build_frame() -> pd.DataFrame:
    rows = make_rows(6000)
    real = load_real_rows()
    rows.extend(real)
    df = pd.DataFrame(rows)
    df["weight"] = np.where(df["source"] == "real", REAL_WEIGHT, 1.0)
    print(f"Training rows: {len(df)} (synthetic {int((df.source == 'synthetic').sum())}, real {len(real)})")
    return df


def target_and_X(df: pd.DataFrame):
    X = np.vstack([encode(r) for r in df.to_dict(orient="records")])
    originals = np.array([resolve_original(r["originalPrice"], r["category"], r.get("title", ""), r.get("brand", ""))[0]
                          for r in df.to_dict(orient="records")])
    y = np.log(np.clip(df["soldPrice"].to_numpy(dtype=float), 1, None) / originals)
    return X, y, originals


def fit_quantile(X, y, w, q):
    model = HistGradientBoostingRegressor(
        loss="quantile", quantile=q, max_iter=300, learning_rate=0.06, max_depth=6,
        min_samples_leaf=20, l2_regularization=1.0, monotonic_cst=monotonic_vector(), random_state=42,
    )
    model.fit(X, y, sample_weight=w)
    return model


def train_price():
    df = build_frame()
    X, y, originals = target_and_X(df)
    idx = np.arange(len(df))
    train_idx, test_idx = train_test_split(idx, test_size=0.2, random_state=42, stratify=df["listingType"])
    w = df["weight"].to_numpy()

    # carve a calibration split out of the training data for conformalized quantile regression (CQR):
    # raw quantile models usually under-cover, so we widen the band by the amount needed to hit 80%.
    fit_idx, cal_idx = train_test_split(train_idx, test_size=0.2, random_state=7)
    models = {q: fit_quantile(X[fit_idx], y[fit_idx], w[fit_idx], q) for q in QUANTILES}
    cal_lo = np.minimum(models[0.1].predict(X[cal_idx]), models[0.5].predict(X[cal_idx]))
    cal_hi = np.maximum(models[0.9].predict(X[cal_idx]), models[0.5].predict(X[cal_idx]))
    scores = np.maximum(cal_lo - y[cal_idx], y[cal_idx] - cal_hi)
    n_cal = len(cal_idx)
    cqr_offset = float(max(0.0, np.quantile(scores, min(1.0, np.ceil((n_cal + 1) * 0.8) / n_cal))))

    pred = {q: np.exp(models[q].predict(X[test_idx])) * originals[test_idx] for q in QUANTILES}
    lo = np.exp(np.minimum(models[0.1].predict(X[test_idx]), models[0.5].predict(X[test_idx])) - cqr_offset) * originals[test_idx]
    hi = np.exp(np.maximum(models[0.9].predict(X[test_idx]), models[0.5].predict(X[test_idx])) + cqr_offset) * originals[test_idx]
    med = pred[0.5]
    truth = df["soldPrice"].to_numpy(dtype=float)[test_idx]

    # naive baseline: average ratio per (condition, listingType) from the training split
    base_df = pd.DataFrame({"cond": df["condition"].to_numpy()[train_idx], "lt": df["listingType"].to_numpy()[train_idx], "y": y[train_idx]})
    base_map = base_df.groupby(["cond", "lt"])["y"].mean().to_dict()
    base_pred = np.array([
        np.exp(base_map.get((c, t), base_df["y"].mean())) * o
        for c, t, o in zip(df["condition"].to_numpy()[test_idx], df["listingType"].to_numpy()[test_idx], originals[test_idx])
    ])

    def report(p):
        return {
            "MAE_inr": round(float(mean_absolute_error(truth, p)), 2),
            "MAPE_pct": round(float(np.mean(np.abs(p - truth) / np.clip(truth, 1, None)) * 100), 2),
            "R2": round(float(r2_score(truth, p)), 4),
        }

    sale_mask = (df["listingType"].to_numpy()[test_idx] == "sale")
    metrics = {
        "model": "HistGradientBoosting quantile (q10/q50/q90) on log(price/MRP), monotone constraints",
        "test_overall": report(med),
        "test_sale_only": {
            "MAE_inr": round(float(mean_absolute_error(truth[sale_mask], med[sale_mask])), 2),
            "MAPE_pct": round(float(np.mean(np.abs(med[sale_mask] - truth[sale_mask]) / truth[sale_mask]) * 100), 2),
        },
        "naive_baseline_test": report(base_pred),
        "interval_80pct_coverage": round(float(np.mean((truth >= lo) & (truth <= hi))), 3),
        "cqr_log_offset": round(cqr_offset, 4),
        "n_train": int(len(train_idx)),
        "n_test": int(len(test_idx)),
        "n_real_rows": int((df["source"] == "real").sum()),
        "trainedOn": "synthetic campus depreciation data"
        + (" + real campus sales" if (df["source"] == "real").any() else " (no real sales yet — retrain after trades accumulate)"),
        "features": FEATURE_NAMES,
    }
    # refit on everything for serving
    final = {q: fit_quantile(X, y, w, q) for q in QUANTILES}
    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"models": final, "version": 2, "cqr_offset": cqr_offset, "feature_names": FEATURE_NAMES}, PRICE_BUNDLE)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    print(json.dumps({k: v for k, v in metrics.items() if k != "features"}, indent=2))


def train_fraud():
    rng = np.random.default_rng(42)
    typical = np.column_stack(
        [
            rng.normal(1500, 400, 400), rng.normal(4000, 800, 400), rng.normal(1.0, 0.15, 400),
            rng.normal(0.65, 0.12, 400), rng.normal(28, 8, 400), rng.normal(90, 30, 400),
            rng.integers(0, 2, 400), rng.integers(0, 2, 400), rng.integers(0, 2, 400),
            rng.integers(0, 1, 400), rng.integers(0, 3, 400), rng.normal(120, 40, 400), rng.integers(0, 2, 400),
        ]
    )
    anomalies = np.array(
        [
            [9000, 79900, 0.2, 0.11, 18, 20, 4, 3, 6, 2, 8, 0.2, 0],
            [8900, 79900, 0.18, 0.11, 18, 20, 4, 3, 5, 1, 7, 0.4, 0],
            [200, 45000, 0.05, 0.004, 12, 12, 3, 3, 8, 1, 10, 1, 0],
        ]
    )
    iforest = IsolationForest(n_estimators=200, contamination=0.04, random_state=42)
    iforest.fit(np.vstack([typical, anomalies]))
    joblib.dump({"model": iforest}, FRAUD_BUNDLE)


def main():
    train_price()
    train_fraud()
    print(f"Saved {PRICE_BUNDLE} and {FRAUD_BUNDLE}")


if __name__ == "__main__":
    main()
