"""Feature engineering shared by training and serving.

The price model predicts a *ratio* (resale price / original MRP) rather than a raw
rupee amount.  Raw prices span ₹40 -> ₹80,000, which makes tree models learn
mostly "how expensive is the item" and almost nothing about depreciation.  Ratios
put a calculator and a laptop on the same scale; we multiply back by the MRP.
"""
from __future__ import annotations

import math
import re

import numpy as np

CONDITIONS = ["Fair", "Good", "Like New", "New"]
CATEGORIES = ["books", "cycles", "electronics", "lab", "furniture", "hostel", "notes", "other"]
LEND_UNIT_DAYS = {"day": 1, "week": 7, "semester": 120}

# (item_class, regex on "title brand", typical MRP in INR)
ITEM_CLASSES: list[tuple[str, re.Pattern, int]] = [
    ("calculator", re.compile(r"casio|fx-?991|scientific|calculat", re.I), 899),
    ("phone", re.compile(r"iphone|pixel|oneplus|samsung galaxy|redmi|realme|phone", re.I), 22000),
    ("laptop", re.compile(r"macbook|laptop|thinkpad|notebook pc|chromebook", re.I), 38000),
    ("tablet", re.compile(r"ipad|tablet", re.I), 18000),
    ("audio", re.compile(r"headphone|earbud|boat|airpods|neckband|speaker", re.I), 1299),
    ("cycle", re.compile(r"cycle|bicycle|hero|firefox|giant|bsa", re.I), 6500),
    ("textbook", re.compile(r"textbook|mathematics|physics|chemistry|engineering|cengage|pearson|wiley|mcgraw", re.I), 550),
    ("notes", re.compile(r"notes|handwritten|photocopy", re.I), 120),
    ("appliance", re.compile(r"kettle|iron|induction|mixer|heater|cooler|fan", re.I), 899),
    ("bedding", re.compile(r"mattress|bed|pillow", re.I), 2500),
    ("furniture", re.compile(r"chair|table|almirah|shelf|desk", re.I), 1200),
    ("lab_gear", re.compile(r"drafter|lab coat|apron|multimeter|arduino|breadboard", re.I), 499),
]
ITEM_CLASS_NAMES = [c[0] for c in ITEM_CLASSES] + ["generic"]

CATEGORY_TYPICAL_MRP = {
    "books": 499, "notes": 149, "electronics": 1999, "cycles": 6500,
    "lab": 799, "furniture": 1499, "hostel": 799, "other": 699,
}

PREMIUM_BRANDS = re.compile(
    r"apple|sony|bose|dell|hp|lenovo|asus|samsung|oneplus|casio|giant|decathlon|ikea|rotring|jbl|logitech", re.I
)
BUDGET_BRANDS = re.compile(r"local|generic|classmate|no.?name|handmade|handwritten", re.I)


def item_class(title: str = "", brand: str = "") -> str:
    text = f"{title or ''} {brand or ''}"
    for name, pattern, _ in ITEM_CLASSES:
        if pattern.search(text):
            return name
    return "generic"


def typical_mrp(category: str, title: str = "", brand: str = "") -> int:
    text = f"{title or ''} {brand or ''}"
    for _, pattern, price in ITEM_CLASSES:
        if pattern.search(text):
            return price
    return CATEGORY_TYPICAL_MRP.get(category, 799)


def brand_tier(brand: str = "") -> int:
    """0 = budget/unbranded, 1 = unknown/standard, 2 = premium."""
    b = (brand or "").strip()
    if not b:
        return 1
    if PREMIUM_BRANDS.search(b):
        return 2
    if BUDGET_BRANDS.search(b):
        return 0
    return 1


def resolve_original(original: float, category: str, title: str = "", brand: str = "") -> tuple[float, bool]:
    """MRP below ₹80 is almost always a typo or the rent typed in the wrong box."""
    typed = max(0.0, float(original or 0))
    if typed >= 80:
        return typed, False
    return float(typical_mrp(category, title, brand)), True


FEATURE_NAMES = (
    ["log_original", "age_months", "condition", "demand", "brand_tier", "is_lend", "log_lend_days"]
    + [f"cat_{c}" for c in CATEGORIES]
    + [f"item_{c}" for c in ITEM_CLASS_NAMES]
)

# Monotonic constraints keep the model sensible even where data is thin:
# older -> never worth more, better condition -> never worth less, hotter demand -> never worth less.
MONOTONIC = {"age_months": -1, "condition": 1, "demand": 1}


def monotonic_vector() -> list[int]:
    return [MONOTONIC.get(name, 0) for name in FEATURE_NAMES]


def encode(row: dict) -> np.ndarray:
    original, _ = resolve_original(
        row.get("originalPrice", 0), row.get("category", "other"), row.get("title", ""), row.get("brand", "")
    )
    cond = row.get("condition", "Good")
    cond_idx = CONDITIONS.index(cond) if cond in CONDITIONS else 1
    is_lend = 1 if row.get("listingType") == "lend" else 0
    unit_days = LEND_UNIT_DAYS.get(row.get("lendUnit") or "day", 1) if is_lend else 1
    cat = row.get("category", "other")
    cat_vec = [1.0 if cat == c else 0.0 for c in CATEGORIES]
    klass = item_class(row.get("title", ""), row.get("brand", ""))
    item_vec = [1.0 if klass == c else 0.0 for c in ITEM_CLASS_NAMES]
    return np.array(
        [
            math.log(max(original, 1.0)),
            max(0.0, float(row.get("ageMonths") or 0)),
            float(cond_idx),
            float(row.get("demand") if row.get("demand") is not None else 50),
            float(brand_tier(row.get("brand", ""))),
            float(is_lend),
            math.log(unit_days) if is_lend else 0.0,
            *cat_vec,
            *item_vec,
        ],
        dtype=float,
    )
