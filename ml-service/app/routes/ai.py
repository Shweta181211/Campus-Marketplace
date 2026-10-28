import math

from fastapi import APIRouter, HTTPException

from app.schemas import PricePredictIn, PricePredictOut, FraudScoreIn, FraudScoreOut
from app.services.features import encode, resolve_original, LEND_UNIT_DAYS
from app.services.model_store import (
    load_price_model,
    load_fraud_model,
    load_metrics,
    fraud_vector,
    signals_from_payload,
)

router = APIRouter()
price_bundle = load_price_model()
fraud_bundle = load_fraud_model()
metrics = load_metrics()

LEND_MIN = {"day": 10, "week": 40, "semester": 100}


def reload_models():
    """Used by the startup hook after (re)training."""
    global price_bundle, fraud_bundle, metrics
    price_bundle = load_price_model()
    fraud_bundle = load_fraud_model()
    metrics = load_metrics()


def _round_price(value: float) -> int:
    """Round to a price a human would type: nearest ₹5 below ₹500, ₹10 below ₹5000, else ₹50."""
    if value < 500:
        step = 5
    elif value < 5000:
        step = 10
    else:
        step = 50
    return max(1, int(round(value / step) * step))


@router.post("/ai/price-predict", response_model=PricePredictOut)
def price_predict(body: PricePredictIn):
    if not price_bundle:
        raise HTTPException(status_code=503, detail="Price model is not trained. Run: npm run ml:train")

    row = body.model_dump()
    original, assumed_mrp = resolve_original(body.originalPrice, body.category, body.title, body.brand)
    if original <= 0:
        raise HTTPException(status_code=422, detail="originalPrice is required")

    x = encode(row).reshape(1, -1)
    log_q = [float(price_bundle["models"][q].predict(x)[0]) for q in (0.1, 0.5, 0.9)]
    offset = float(price_bundle.get("cqr_offset") or 0.0)  # conformal widening learned at training time
    lo = math.exp(min(log_q[0], log_q[1]) - offset) * original
    mid = math.exp(log_q[1]) * original
    hi = math.exp(max(log_q[2], log_q[1]) + offset) * original

    is_lend = body.listingType == "lend"
    unit = body.lendUnit if body.lendUnit in LEND_UNIT_DAYS else "day"
    if is_lend:
        cap = original * 0.25
        floor = LEND_MIN[unit]
    else:
        cap = original * 0.97
        floor = 1
    mid = min(max(mid, floor), max(cap, floor))
    lo = min(max(lo, floor * 0.8), mid)
    hi = max(min(hi, max(cap, floor) * 1.05), mid)

    rec = _round_price(mid)
    min_fair = min(_round_price(lo), rec)
    max_fair = max(_round_price(hi), rec)

    # Confidence: narrow band relative to the price => model is sure; plus a penalty when the MRP was guessed.
    rel_width = (hi - lo) / max(mid, 1.0)
    confidence = 92.0 - rel_width * 55.0
    if assumed_mrp:
        confidence -= 15.0
    confidence = round(max(35.0, min(92.0, confidence)), 1)

    unit_note = f" per {unit}" if is_lend else ""
    basis = (
        f"a typical campus MRP of ₹{int(original)} (the original price you typed looks too low to be an MRP)"
        if assumed_mrp
        else f"original price ₹{int(original)}"
    )
    explanation = (
        f"Machine-learning estimate from {basis}, {body.condition}, {int(body.ageMonths or 0)} month(s) old, "
        f"category {body.category}{unit_note}. The fair band is the model's 10th–90th percentile. "
        "Not guaranteed market value."
    )
    return PricePredictOut(
        recommendedPrice=float(rec),
        minFairPrice=float(min_fair),
        maxFairPrice=float(max_fair),
        confidence=confidence,
        explanation=explanation,
        metrics=metrics,
        source="ml",
        usedTypicalMrp=assumed_mrp,
    )


@router.get("/ai/model-info")
def model_info():
    return {
        "loaded": bool(price_bundle),
        "version": (price_bundle or {}).get("version"),
        "metrics": {k: v for k, v in metrics.items() if k != "features"},
    }


@router.post("/ai/fraud-score", response_model=FraudScoreOut)
def fraud_score(body: FraudScoreIn):
    if not fraud_bundle:
        raise HTTPException(status_code=503, detail="Fraud model is not trained.")
    model = fraud_bundle["model"]
    x = fraud_vector(body.model_dump())
    raw = model.decision_function(x)[0]
    risk = float(1 / (1 + pow(2.71828, raw * 3)))
    risk = max(0.0, min(1.0, risk))
    payload = body.model_dump()
    if (
        risk > 0.55
        and payload.get("originalRatio", 1) >= 0.35
        and payload.get("duplicateTitleCount", 0) < 2
        and payload.get("listingBurst1h", 0) < 3
    ):
        risk *= 0.7
    level = "HIGH" if risk >= 0.7 else "MEDIUM" if risk >= 0.4 else "LOW"
    return FraudScoreOut(
        fraudRiskScore=round(risk, 3),
        fraudRiskLevel=level,
        fraudSignals=signals_from_payload(payload, risk),
    )
