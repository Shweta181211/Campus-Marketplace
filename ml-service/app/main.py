from fastapi import FastAPI
from app.routes.ai import router as ai_router, price_bundle, fraud_bundle, metrics

app = FastAPI(title="Campus Marketplace ML", version="1.0.0")
app.include_router(ai_router)


@app.get("/health")
def health():
    return {
        "ok": True,
        "priceModel": bool(price_bundle),
        "fraudModel": bool(fraud_bundle),
        "metrics": metrics,
        "trainedOn": "seed_listings.csv (synthetic campus seed data, not live user trades)",
    }
