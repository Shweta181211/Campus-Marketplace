from fastapi import FastAPI

from app.routes import ai as ai_routes
from app.routes.ai import router as ai_router

app = FastAPI(title="Campus Marketplace ML", version="3.0.0")
app.include_router(ai_router)


@app.on_event("startup")
def ensure_models():
    """If the price model is missing or was saved by an incompatible scikit-learn, retrain automatically."""
    if ai_routes.price_bundle and ai_routes.fraud_bundle:
        return
    print("[ml] model files missing or unreadable — training now (takes ~30s)...")
    if not ai_routes.price_bundle:
        from training.train_price_model import main as train_price

        train_price()
    if not ai_routes.fraud_bundle:
        from training.train_fraud_model import main as train_fraud

        train_fraud()
    ai_routes.reload_models()


@app.get("/health")
def health():
    m = ai_routes.metrics or {}
    return {
        "ok": True,
        "priceModel": bool(ai_routes.price_bundle),
        "fraudModel": bool(ai_routes.fraud_bundle),
        "metrics": {k: v for k, v in m.items() if k != "features"},
        "trainedOn": m.get("trainedOn", "unknown"),
        "fraudMetrics": {
            k: v for k, v in (ai_routes.fraud_metrics or {}).items() if k in ("test", "model", "trainedOn", "real_labels")
        },
    }
