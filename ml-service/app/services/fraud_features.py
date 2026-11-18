"""Fraud / scam detection features, shared by training and serving.

The PDF splits fraud signals into three levels; every model input belongs to one of them:

* LISTING      price vs. AI fair price, price vs. campus category average, duplicate title/description,
               reused photos, missing photos, contact details / "pay outside the app" text, urgency words
* USER         account age, verification, linked accounts (same device fingerprint), prior reports,
               trust score
* BEHAVIOURAL  listing bursts (1h / 24h), outgoing-message spikes, sudden transaction spikes

Design notes (worth explaining in the viva):

1. Everything is turned into a *fixed-length numeric vector* with log transforms on skewed counts, so the
   Isolation Forest is not dominated by one large-scale column (e.g. rupee prices).
2. One-sided clipping.  Isolation Forest flags anything *unusual*, including unusually GOOD behaviour
   (a 4-year-old account, a ₹70 000 laptop priced above the fair range, a 900-word description).  Those are
   not fraud, so each feature is clipped on its "safe" side before scoring.  Only the risky direction can
   make a listing look anomalous.
3. A low price on its own is never enough.  ``price_vs_fair`` is only one of 20 columns; a genuine bargain
   from an established, verified seller stays LOW (see tests/test_fraud.py::test_cheap_iphone_*).
"""
from __future__ import annotations

import math
import re

import numpy as np

# ---- raw payload keys sent by the Node API (camelCase, all optional) ---------------------------------------
RAW_DEFAULTS: dict[str, float] = {
    "price": 0.0,
    "originalPrice": 0.0,
    "fairPrice": 0.0,  # AI recommended price for this listing (0 = unknown)
    "priceRatio": 1.0,  # price / campus category average
    "originalRatio": 1.0,  # price / original MRP
    "titleLength": 20.0,
    "descriptionLength": 80.0,
    "duplicateTitleCount": 0.0,
    "duplicateContentCount": 0.0,
    "imageCount": 1.0,
    "reusedImageCount": 0.0,
    "contactInDescription": 0.0,
    "urgencyScore": 0.0,
    "accountAgeDays": 60.0,
    "verified": 1.0,
    "linkedAccounts": 0.0,
    "confirmedReports": 0.0,
    "openReports": 0.0,
    "trustScore": 60.0,
    "listingBurst1h": 0.0,
    "listings24h": 0.0,
    "messages1h": 0.0,
    "recentTransactions24h": 0.0,
}

# (name, level, human description used in explanations)
FEATURES: list[tuple[str, str, str]] = [
    ("log_price_vs_fair", "listing", "asking price far below the AI fair price"),
    ("log_price_vs_category", "listing", "asking price far below similar campus listings"),
    ("discount_vs_original", "listing", "steep discount on an expensive item"),
    ("log_price", "listing", "high-value item"),
    ("short_title", "listing", "very short / vague title"),
    ("short_description", "listing", "little or no description"),
    ("duplicate_titles", "listing", "same title already posted"),
    ("duplicate_descriptions", "listing", "same description already posted"),
    ("no_photos", "listing", "no photos"),
    ("reused_images", "listing", "photos already used in another seller's listing"),
    ("contact_in_description", "listing", "phone / UPI / 'pay outside the app' text in description"),
    ("urgency", "listing", "pressure words (urgent, advance, token amount)"),
    ("new_account", "user", "very new account"),
    ("unverified", "user", "college email not verified"),
    ("linked_accounts", "user", "other accounts created from the same device"),
    ("confirmed_reports", "user", "previous confirmed reports"),
    ("open_reports", "user", "open reports from other students"),
    ("trust_deficit", "user", "low trust score"),
    ("listing_burst_1h", "behaviour", "many listings in the last hour"),
    ("listings_24h", "behaviour", "many listings in the last 24 hours"),
    ("messages_1h", "behaviour", "messaging spike (many buyers contacted in 1 hour)"),
    ("transactions_24h", "behaviour", "unusual spike in transactions"),
]
FEATURE_NAMES = [f[0] for f in FEATURES]
FEATURE_LEVEL = {f[0]: f[1] for f in FEATURES}
FEATURE_TEXT = {f[0]: f[2] for f in FEATURES}

# Text patterns the Node API also uses (kept in sync with server/utils/fraudText.js)
CONTACT_RX = re.compile(
    r"(\+?91[\s-]?)?[6-9]\d{9}|whats\s?app|telegram|upi\s?id|@ok(axis|hdfc|icici|sbi)|@ybl|@paytm|gpay|phonepe|"
    r"pay\s+(outside|directly|in advance)|advance\s+payment|bank\s+transfer",
    re.I,
)
URGENCY_RX = re.compile(r"urgent|today only|first come|hurry|asap|advance|token amount|limited time|leaving campus tonight", re.I)


def contact_score(text: str) -> float:
    return float(min(3, len(CONTACT_RX.findall(text or ""))))


def urgency_score(text: str) -> float:
    return float(min(3, len(URGENCY_RX.findall(text or ""))))


def _f(payload: dict, key: str) -> float:
    v = payload.get(key)
    try:
        v = float(v)
    except (TypeError, ValueError):
        return RAW_DEFAULTS[key]
    if math.isnan(v) or math.isinf(v):
        return RAW_DEFAULTS[key]
    return v


def build_vector(payload: dict) -> np.ndarray:
    """Raw API payload -> model feature vector (1-D).  All columns are oriented so *larger = riskier*."""
    p = {k: _f(payload, k) for k in RAW_DEFAULTS}
    price = max(p["price"], 0.0)
    fair = max(p["fairPrice"], 0.0)

    # price below the AI fair price (log ratio, only the "too cheap" side counts)
    if fair > 0 and price > 0:
        below_fair = max(0.0, -math.log(price / fair))
    else:
        below_fair = 0.0
    below_cat = max(0.0, -math.log(max(p["priceRatio"], 1e-3))) if p["priceRatio"] > 0 else 0.0
    orig = max(p["originalPrice"], 0.0)
    # steep discount only matters on items worth stealing (> ₹2000 MRP); weight grows with MRP
    discount = 0.0
    if orig > 2000 and p["originalRatio"] > 0:
        discount = max(0.0, 1.0 - min(1.0, p["originalRatio"])) * min(1.0, math.log10(orig) / 5)

    vec = [
        min(below_fair, 3.0),
        min(below_cat, 3.0),
        discount,
        min(math.log1p(price), math.log1p(150000)),
        max(0.0, 12.0 - p["titleLength"]) / 12.0,  # titles >= 12 chars are all "fine"
        max(0.0, 40.0 - p["descriptionLength"]) / 40.0,  # descriptions >= 40 chars are all "fine"
        math.log1p(max(0.0, p["duplicateTitleCount"])),
        math.log1p(max(0.0, p["duplicateContentCount"])),
        1.0 if p["imageCount"] <= 0 else 0.0,
        math.log1p(max(0.0, p["reusedImageCount"])),
        min(3.0, max(0.0, p["contactInDescription"])),
        min(3.0, max(0.0, p["urgencyScore"])),
        max(0.0, math.log1p(30) - math.log1p(max(0.0, p["accountAgeDays"]))),  # accounts > 30 days = 0
        1.0 - min(1.0, max(0.0, p["verified"])),
        math.log1p(max(0.0, p["linkedAccounts"])),
        math.log1p(max(0.0, p["confirmedReports"])),
        math.log1p(max(0.0, p["openReports"])),
        max(0.0, 60.0 - min(100.0, p["trustScore"])) / 60.0,  # trust >= 60 = 0
        math.log1p(max(0.0, p["listingBurst1h"])),
        math.log1p(max(0.0, p["listings24h"])),
        math.log1p(max(0.0, p["messages1h"])),
        math.log1p(max(0.0, p["recentTransactions24h"])),
    ]
    return np.asarray(vec, dtype=float)


def build_matrix(rows: list[dict]) -> np.ndarray:
    return np.vstack([build_vector(r) for r in rows])


def rule_signals(payload: dict) -> list[str]:
    """Named, human-checkable red flags (shown to admins next to the model score)."""
    p = {k: _f(payload, k) for k in RAW_DEFAULTS}
    out: list[str] = []
    if p["duplicateTitleCount"] >= 2:
        out.append("duplicate_listing_title")
    if p["duplicateContentCount"] >= 2:
        out.append("duplicate_description")
    if p["reusedImageCount"] >= 1:
        out.append("reused_images")
    if p["listingBurst1h"] >= 4:
        out.append("listing_burst")
    if p["confirmedReports"] >= 1:
        out.append("prior_confirmed_reports")
    if p["openReports"] >= 2:
        out.append("multiple_open_reports")
    if p["linkedAccounts"] >= 2:
        out.append("multiple_accounts_same_device")
    if p["contactInDescription"] >= 1:
        out.append("off_platform_contact_or_payment")
    if p["messages1h"] >= 25:
        out.append("messaging_spike")
    fair = p["fairPrice"]
    if fair > 0 and p["price"] > 0 and p["price"] < 0.35 * fair and fair > 2000:
        out.append("extreme_price_deviation")
    elif p["originalPrice"] > 2000 and 0 < p["originalRatio"] < 0.15:
        out.append("extreme_price_deviation")
    if p["accountAgeDays"] < 2 and p["listingBurst1h"] >= 2:
        out.append("new_account_burst")
    return out
