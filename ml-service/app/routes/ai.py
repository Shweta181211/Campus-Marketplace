from fastapi import APIRouter, HTTPException
from app.schemas import PricePredictIn, PricePredictOut, FraudScoreIn, FraudScoreOut
from app.services.model_store import (
    load_price_model,
    load_fraud_model,
    load_metrics,
    encode_features,
    fraud_vector,
    signals_from_payload,
)

router = APIRouter()
price_bundle = load_price_model()
fraud_bundle = load_fraud_model()
metrics = load_metrics()


CONDITION_FACTOR = {"New": 0.92, "Like New": 0.78, "Good": 0.62, "Fair": 0.45}
CATEGORY_FACTOR = {
    "books": 0.95,
    "notes": 0.7,
    "electronics": 1.0,
    "cycles": 1.02,
    "lab": 0.98,
    "furniture": 1.0,
    "hostel": 0.97,
    "other": 1.0,
}
LEND_RATES = {"day": 0.05, "week": 0.16, "semester": 0.4}


def formula_price(body: PricePredictIn) -> float:
    typed = max(0.0, float(body.originalPrice or 0))
    text = f"{body.title or ''} {body.brand or ''}".lower()
    typical = 1999.0
    hints = [
        ("casio", 899), ("fx-991", 899), ("calculat", 899),
        ("laptop", 38000), ("cycle", 6500), ("textbook", 550),
        ("notes", 120),
    ]
    for key, price in hints:
        if key in text:
            typical = float(price)
            break
    else:
        typical = {
            "books": 499, "notes": 149, "electronics": 1999, "cycles": 6500,
            "lab": 799, "furniture": 1499, "hostel": 799, "other": 699,
        }.get(body.category, 799)
    original = typed if typed >= 80 else typical
    if original <= 0:
        return 0.0
    factor = CONDITION_FACTOR.get(body.condition, 0.6)
    age = max(0.0, float(body.ageMonths or 0))
    decay = max(0.22, 1 - age * 0.012)
    cat = CATEGORY_FACTOR.get(body.category, 1.0)
    rec = original * factor * decay * cat
    if body.listingType == "lend":
        rec *= LEND_RATES.get(body.lendUnit or "day", LEND_RATES["day"])
        min_rent = 20 if (body.lendUnit or "day") == "day" else 60 if body.lendUnit == "week" else 150
        rec = max(min_rent, min(original * 0.25, rec))
    else:
        rec = max(40.0, min(original * 0.97, rec))
    return max(1.0, rec)


@router.post("/ai/price-predict", response_model=PricePredictOut)
def price_predict(body: PricePredictIn):
    formula = formula_price(body)
    if not price_bundle:
        raise HTTPException(status_code=503, detail="Price model is not trained. Run training/train_price_model.py")
    model = price_bundle["model"]
    residual_std = float(price_bundle.get("residual_std") or 0.12)
    x = encode_features(body.model_dump()).reshape(1, -1)
    pred = float(model.predict(x)[0])
    if formula > 0 and (pred <= 0 or pred > formula * 1.8 or pred < formula * 0.45):
        pred = formula
    elif formula > 0:
        pred = formula * 0.65 + pred * 0.35
    pred = max(1.0, pred if formula <= 0 else pred)
    band = max(0.08, min(0.22, residual_std))
    confidence = max(40.0, min(92.0, 88.0 - residual_std * 80))
    return PricePredictOut(
        recommendedPrice=round(pred, 0),
        minFairPrice=round(max(1.0, pred * (1 - band)), 0),
        maxFairPrice=round(pred * (1 + band), 0),
        confidence=round(confidence, 1),
        explanation=(
            f"Calculated from original ₹{int(body.originalPrice)}, {body.condition}, "
            f"{int(body.ageMonths or 0)} months old"
            f"{' per ' + (body.lendUnit or 'day') if body.listingType == 'lend' else ''}. "
            "Depreciation-style estimate blended with similar campus seed listings. Not guaranteed market value."
        ),
        metrics=metrics,
        source="ml",
    )


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
