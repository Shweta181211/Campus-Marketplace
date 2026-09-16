from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "models_store"
PRICE_BUNDLE = MODELS / "price_rf.joblib"
FRAUD_BUNDLE = MODELS / "fraud_iforest.joblib"
METRICS_PATH = MODELS / "price_metrics.json"

CONDITION_ORDER = ["Fair", "Good", "Like New", "New"]
CATEGORIES = ["books", "cycles", "electronics", "lab", "furniture", "hostel", "notes", "other"]
TYPES = ["sale", "lend"]


def encode_features(row: dict) -> np.ndarray:
    cat = CATEGORIES.index(row.get("category", "other")) if row.get("category") in CATEGORIES else len(CATEGORIES) - 1
    cond = CONDITION_ORDER.index(row.get("condition", "Good")) if row.get("condition") in CONDITION_ORDER else 1
    ltype = 1 if row.get("listingType") == "lend" else 0
    brand = str(row.get("brand") or "").lower()
    brand_len = min(len(brand), 24)
    return np.array(
        [
            float(row.get("originalPrice") or 0),
            float(row.get("ageMonths") or 0),
            float(row.get("demand") or 50),
            cat,
            cond,
            ltype,
            brand_len,
        ],
        dtype=float,
    )


def load_price_model():
    if not PRICE_BUNDLE.exists():
        return None
    return joblib.load(PRICE_BUNDLE)


def load_fraud_model():
    if not FRAUD_BUNDLE.exists():
        return None
    return joblib.load(FRAUD_BUNDLE)


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
