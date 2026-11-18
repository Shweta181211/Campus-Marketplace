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
    """Every field is optional; missing values fall back to 'typical' defaults (see fraud_features.RAW_DEFAULTS)."""

    # listing level
    price: float = 0
    originalPrice: float = 0
    fairPrice: float = 0
    priceRatio: float = 1
    originalRatio: float = 1
    titleLength: float = 20
    descriptionLength: float = 80
    duplicateTitleCount: float = 0
    duplicateContentCount: float = 0
    imageCount: float = 1
    reusedImageCount: float = 0
    contactInDescription: float = 0
    urgencyScore: float = 0
    # user level
    accountAgeDays: float = 60
    verified: float = 1
    linkedAccounts: float = 0
    confirmedReports: float = 0
    openReports: float = 0
    trustScore: float = 60
    # behavioural
    listingBurst1h: float = 0
    listings24h: float = 0
    messages1h: float = 0
    recentTransactions24h: float = 0


class FraudReason(BaseModel):
    feature: str
    level: str
    text: str
    impact: float


class FraudScoreOut(BaseModel):
    fraudRiskScore: float
    fraudRiskLevel: str
    decision: str
    decisionText: str
    fraudSignals: list[str]
    reasons: list[FraudReason] = []
    anomalyScore: float
    supervisedScore: Optional[float] = None
    source: str = "ml"
    disclaimer: str = "Automated risk score that flags activity for review. It is not an accusation of fraud."


class AssessListingIn(BaseModel):
    """Combined AI decision engine input: the listing (for pricing) + fraud context."""

    listing: PricePredictIn
    price: float = Field(ge=0)
    fraud: FraudScoreIn = FraudScoreIn()


class AssessListingOut(BaseModel):
    pricing: PricePredictOut
    priceVerdict: str
    priceDeviationPct: float
    fraud: FraudScoreOut
    decision: str
    messages: dict
