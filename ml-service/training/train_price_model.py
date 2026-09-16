from pathlib import Path
import json
import sys
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, IsolationForest
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
import joblib

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))
from app.services.model_store import encode_features, MODELS, PRICE_BUNDLE, FRAUD_BUNDLE, METRICS_PATH  # noqa: E402

DATA = ROOT / "data" / "seed_listings.csv"


def main():
    if not DATA.exists():
        from training.generate_seed import main as gen
        gen()
    df = pd.read_csv(DATA)
    X = np.vstack([encode_features(r) for r in df.to_dict(orient="records")])
    y = df["soldPrice"].to_numpy()
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.3, random_state=42)
    X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.5, random_state=42)

    model = RandomForestRegressor(n_estimators=180, max_depth=12, random_state=42, min_samples_leaf=2)
    model.fit(X_train, y_train)
    pred_val = model.predict(X_val)
    pred_test = model.predict(X_test)

    def metrics(y_true, y_pred):
        return {
            "MAE": round(float(mean_absolute_error(y_true, y_pred)), 2),
            "RMSE": round(float(mean_squared_error(y_true, y_pred) ** 0.5), 2),
            "R2": round(float(r2_score(y_true, y_pred)), 3),
        }

    report = {
        "validation": metrics(y_val, pred_val),
        "test": metrics(y_test, pred_test),
        "n_train": int(len(X_train)),
        "n_val": int(len(X_val)),
        "n_test": int(len(X_test)),
        "trainedOn": "seed_listings.csv synthetic campus data — not live user trades",
        "model": "RandomForestRegressor",
    }
    residual_std = float(np.std((y_val - pred_val) / np.clip(y_val, 1, None)))
    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "residual_std": residual_std}, PRICE_BUNDLE)
    METRICS_PATH.write_text(json.dumps(report, indent=2))

    # Isolation Forest on a mix of typical + planted anomalies
    rng = np.random.default_rng(42)
    typical = np.column_stack(
        [
            rng.normal(1500, 400, 400),
            rng.normal(4000, 800, 400),
            rng.normal(1.0, 0.15, 400),
            rng.normal(0.65, 0.12, 400),
            rng.normal(28, 8, 400),
            rng.normal(90, 30, 400),
            rng.integers(0, 2, 400),
            rng.integers(0, 2, 400),
            rng.integers(0, 2, 400),
            rng.integers(0, 1, 400),
            rng.integers(0, 3, 400),
            rng.normal(120, 40, 400),
            rng.integers(0, 2, 400),
        ]
    )
    anomalies = np.array(
        [
            [9000, 79900, 0.2, 0.11, 18, 20, 4, 3, 6, 2, 8, 0.2, 0],
            [8900, 79900, 0.18, 0.11, 18, 20, 4, 3, 5, 1, 7, 0.4, 0],
            [200, 45000, 0.05, 0.004, 12, 12, 3, 3, 8, 1, 10, 1, 0],
        ]
    )
    Xf = np.vstack([typical, anomalies])
    iforest = IsolationForest(n_estimators=200, contamination=0.04, random_state=42)
    iforest.fit(Xf)
    joblib.dump({"model": iforest}, FRAUD_BUNDLE)
    print(json.dumps(report, indent=2))
    print(f"Saved {PRICE_BUNDLE} and {FRAUD_BUNDLE}")


if __name__ == "__main__":
    main()
