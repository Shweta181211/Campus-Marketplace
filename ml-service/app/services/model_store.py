from pathlib import Path
import json
import joblib

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "models_store"
PRICE_BUNDLE = MODELS / "price_gbm.joblib"
FRAUD_BUNDLE = MODELS / "fraud_iforest.joblib"
METRICS_PATH = MODELS / "price_metrics.json"
FRAUD_METRICS_PATH = MODELS / "fraud_metrics.json"

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
    """Return a FraudScorer, or None if the bundle is missing / from the old v2 format / unreadable."""
    if not FRAUD_BUNDLE.exists():
        return None
    try:
        bundle = joblib.load(FRAUD_BUNDLE)
    except Exception as exc:
        print(f"[ml] could not load fraud model: {exc}")
        return None
    if not isinstance(bundle, dict) or "anchor_raw" not in bundle:
        return None  # old bundle -> startup hook retrains
    from app.services.fraud_model import FraudScorer

    return FraudScorer(bundle)


def load_metrics():
    if METRICS_PATH.exists():
        return json.loads(METRICS_PATH.read_text())
    return {}


def load_fraud_metrics():
    if FRAUD_METRICS_PATH.exists():
        return json.loads(FRAUD_METRICS_PATH.read_text())
    return {}


