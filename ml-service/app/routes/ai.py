import math

from fastapi import APIRouter, HTTPException

from app.schemas import (
    AssessListingIn,
    AssessListingOut,
    FraudScoreIn,
    FraudScoreOut,
    PricePredictIn,
    PricePredictOut,
)
from app.services.features import encode, resolve_original, LEND_UNIT_DAYS
from app.services.fraud_model import DECISION
from app.services.model_store import load_fraud_metrics, load_fraud_model, load_metrics, load_price_model

router = APIRouter()
price_bundle = load_price_model()
fraud_bundle = load_fraud_model()  # FraudScorer instance
metrics = load_metrics()
fraud_metrics = load_fraud_metrics()

LEND_MIN = {"day": 10, "week": 40, "semester": 100}


def reload_models():
    """Used by the startup hook after (re)training."""
    global price_bundle, fraud_bundle, metrics, fraud_metrics
    price_bundle = load_price_model()
    fraud_bundle = load_fraud_model()
    metrics = load_metrics()
    fraud_metrics = load_fraud_metrics()


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


def _fraud(body: FraudScoreIn) -> FraudScoreOut:
    if not fraud_bundle:
        raise HTTPException(status_code=503, detail="Fraud model is not trained. Run: npm run ml:train")
    r = fraud_bundle.score(body.model_dump())
    decision, text = DECISION[r.level]
    return FraudScoreOut(
        fraudRiskScore=r.risk,
        fraudRiskLevel=r.level,
        decision=decision,
        decisionText=text,
        fraudSignals=r.signals,
        reasons=r.reasons,
        anomalyScore=r.anomaly_risk,
        supervisedScore=r.supervised_risk,
    )


@router.post("/ai/fraud-score", response_model=FraudScoreOut)
def fraud_score(body: FraudScoreIn):
    return _fraud(body)


@router.get("/ai/fraud-model-info")
def fraud_model_info():
    if not fraud_bundle:
        return {"loaded": False}
    return {"loaded": True, **fraud_bundle.info(), "metrics": fraud_metrics}


@router.post("/ai/assess-listing", response_model=AssessListingOut)
def assess_listing(body: AssessListingIn):
    """Combined AI decision layer (PDF section 7): pricing model -> fair range, fraud model -> risk score.

    The price deviation is fed INTO the fraud model as one feature among 22; it is never a verdict on its
    own (an iPhone 30 % under the range from a trusted seller stays LOW)."""
    pricing = price_predict(body.listing)
    asked = float(body.price)
    fair = pricing.recommendedPrice
    deviation = round((asked - fair) / max(fair, 1.0) * 100, 1)
    if asked < pricing.minFairPrice:
        verdict = "BELOW_FAIR_RANGE"
    elif asked > pricing.maxFairPrice:
        verdict = "ABOVE_FAIR_RANGE"
    else:
        verdict = "FAIR"

    fraud_in = body.fraud.model_copy(
        update={
            "price": asked,
            "fairPrice": fair,
            "originalPrice": body.listing.originalPrice,
            "originalRatio": asked / body.listing.originalPrice if body.listing.originalPrice else 1,
        }
    )
    fraud = _fraud(fraud_in)
    price_msg = {
        "FAIR": "Price is inside the AI-estimated fair range.",
        "BELOW_FAIR_RANGE": f"Price is {abs(deviation)}% below the AI estimate — a good deal, or worth a closer look.",
        "ABOVE_FAIR_RANGE": f"Price is {deviation}% above the AI estimate — buyers may negotiate.",
    }[verdict]
    messages = {
        "seller": f"{price_msg} {fraud.decisionText}",
        "buyer": price_msg + (" Meet on campus and never pay in advance outside the app." if fraud.fraudRiskLevel != "LOW" else ""),
        "admin": f"Risk {fraud.fraudRiskScore} ({fraud.fraudRiskLevel}); signals: {', '.join(fraud.fraudSignals)}; "
        + "; ".join(f"{r.text} (+{r.impact})" for r in fraud.reasons),
    }
    return AssessListingOut(
        pricing=pricing,
        priceVerdict=verdict,
        priceDeviationPct=deviation,
        fraud=fraud,
        decision=fraud.decision,
        messages=messages,
    )
