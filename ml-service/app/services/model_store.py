from pathlib import Path
import json
import joblib
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "models_store"
PRICE_BUNDLE = MODELS / "price_gbm.joblib"
FRAUD_BUNDLE = MODELS / "fraud_iforest.joblib"
METRICS_PATH = MODELS / "price_metrics.json"

def load_price_model():
    """Load the price bundle; return None (so the API reports 503) if it is missing or unreadable."""
    if not PRICE_BUNDLE.exists():
        return None
    try:
        bundle = joblib.load(PRICE_BUNDLE)
    except Exception as exc:  # incompatible scikit-learn version, corrupt file...
        print(f"[ml] could not load price model: {exc}")
        return None
    return bundle if isinstance(bundle, dict) and "models" in bundle else None


def load_fraud_model():
    if not FRAUD_BUNDLE.exists():
        return None
    try:
        return joblib.load(FRAUD_BUNDLE)
    except Exception as exc:
        print(f"[ml] could not load fraud model: {exc}")
        return None


def load_metrics():
    if METRICS_PATH.exists():
        return json.loads(METRICS_PATH.read_text())
    return {}


def fraud_vector(payload: dict) -> np.ndarray:
    keys = [
        "price",
        "originalPrice",
        "priceRatio",
        "originalRatio",
        "titleLength",
        "descriptionLength",
        "duplicateTitleCount",
        "duplicateContentCount",
        "listingBurst1h",
        "confirmedReports",
        "recentTransactions24h",
        "accountAgeDays",
        "verified",
    ]
    return np.array([[float(payload.get(k) or 0) for k in keys]], dtype=float)


def signals_from_payload(payload: dict, score: float) -> list[str]:
    out = []
    if float(payload.get("duplicateTitleCount") or 0) >= 2:
        out.append("duplicate_listing_title")
    if float(payload.get("duplicateContentCount") or 0) >= 2:
        out.append("duplicate_description")
    if float(payload.get("listingBurst1h") or 0) >= 4:
        out.append("listing_burst")
    if float(payload.get("confirmedReports") or 0) >= 1:
        out.append("prior_confirmed_reports")
    orig = float(payload.get("originalPrice") or 0)
    ratio = float(payload.get("originalRatio") or 1)
    if orig > 2000 and 0 < ratio < 0.2:
        out.append("extreme_price_deviation")
    if float(payload.get("accountAgeDays") or 30) < 1 and float(payload.get("listingBurst1h") or 0) >= 2:
        out.append("new_account_burst")
    if not out and score >= 0.4:
        out.append("multivariate_anomaly")
    if not out:
        out.append("no_strong_anomaly")
    return out
