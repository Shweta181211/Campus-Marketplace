from pydantic import BaseModel, Field
from typing import Optional


class PricePredictIn(BaseModel):
    category: str
    brand: str = ""
    title: str = ""
    originalPrice: float = Field(ge=0)
    ageMonths: float = 0
    condition: str
    demand: float = 50
    listingType: str = "sale"
    lendUnit: str = "day"


class PricePredictOut(BaseModel):
    recommendedPrice: float
    minFairPrice: float
    maxFairPrice: float
    confidence: float
    explanation: str
    metrics: Optional[dict] = None
    source: str = "ml"
    usedTypicalMrp: bool = False
    disclaimer: str = "AI-estimated fair price from a trained model. Not guaranteed market value."


class FraudScoreIn(BaseModel):
    price: float = 0
    originalPrice: float = 0
    priceRatio: float = 1
    originalRatio: float = 1
    titleLength: float = 10
    descriptionLength: float = 40
    duplicateTitleCount: float = 0
    duplicateContentCount: float = 0
    listingBurst1h: float = 0
    confirmedReports: float = 0
    recentTransactions24h: float = 0
    accountAgeDays: float = 30
    verified: float = 1


class FraudScoreOut(BaseModel):
    fraudRiskScore: float
    fraudRiskLevel: str
    fraudSignals: list[str]
    source: str = "ml"
    disclaimer: str = "Automated anomaly score, not an accusation of fraud."
