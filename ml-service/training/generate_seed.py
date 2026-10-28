"""Generate the synthetic campus price dataset.

IMPORTANT (be honest in the viva): this is *synthetic* data.  It encodes realistic
second-hand depreciation behaviour (per-item-class decay curves, condition,
brand and demand effects, log-normal noise) so the model has something sensible
to learn on day one.  As real sales accumulate, ``npm run export-training`` writes
them to ``server/data/export-training.json`` and ``train_price_model.py`` mixes
them in with a higher weight, so the model gradually learns from real campus trades.
"""
from __future__ import annotations

import csv
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.services.features import LEND_UNIT_DAYS  # noqa: E402

OUT = ROOT / "data" / "seed_listings.csv"

# class -> (category, typical MRP, decay/month, floor ratio, example titles, brands)
CLASSES = {
    "calculator": ("electronics", 899, 0.010, 0.45, ["Casio fx-991EX calculator", "Scientific calculator"], ["Casio", "Citizen"]),
    "phone": ("electronics", 22000, 0.035, 0.18, ["OnePlus Nord phone", "Redmi Note smartphone", "iPhone 12"], ["OnePlus", "Redmi", "Apple", "Samsung"]),
    "laptop": ("electronics", 38000, 0.028, 0.20, ["Dell Inspiron laptop", "HP Pavilion laptop", "Lenovo ThinkPad"], ["Dell", "HP", "Lenovo", "Asus"]),
    "tablet": ("electronics", 18000, 0.030, 0.20, ["iPad 9th gen tablet", "Samsung tablet"], ["Apple", "Samsung"]),
    "audio": ("electronics", 1299, 0.030, 0.20, ["boAt headphones", "Wireless earbuds", "JBL speaker"], ["boAt", "JBL", "Sony"]),
    "cycle": ("cycles", 6500, 0.012, 0.35, ["Hero Sprint cycle", "Firefox bicycle", "Giant gear cycle"], ["Hero", "Firefox", "Giant", "BSA"]),
    "textbook": ("books", 550, 0.015, 0.30, ["Engineering Mathematics textbook", "Physics textbook Pearson", "Chemistry textbook"], ["Pearson", "Wiley", "McGraw Hill", "Cengage"]),
    "notes": ("notes", 120, 0.050, 0.15, ["Handwritten notes semester 3", "Photocopy notes bundle"], ["Handwritten", ""]),
    "appliance": ("hostel", 899, 0.020, 0.30, ["Electric kettle", "Induction cooktop", "Table fan"], ["Pigeon", "Prestige", "Local"]),
    "bedding": ("hostel", 2500, 0.030, 0.20, ["Single bed mattress", "Hostel pillow set"], ["Local", "Sleepwell"]),
    "furniture": ("furniture", 1200, 0.015, 0.30, ["Study table", "Plastic chair", "Steel almirah"], ["Nilkamal", "Local", "IKEA"]),
    "lab_gear": ("lab", 499, 0.015, 0.35, ["Engineering drafter", "Lab coat", "Digital multimeter"], ["Rotring", "Generic", "Omega"]),
    "generic": ("other", 699, 0.020, 0.30, ["Badminton racket", "Backpack", "Trekking shoes"], ["Yonex", "Quechua", "Local"]),
}
COND_MULT = {"New": 0.95, "Like New": 0.85, "Good": 0.72, "Fair": 0.55}
BRAND_MULT = {0: 0.92, 1: 1.0, 2: 1.08}
LEND_RATE = {"day": 0.02, "week": 0.07, "semester": 0.25}
LEND_MIN = {"day": 10, "week": 40, "semester": 100}
PREMIUM = {"apple", "sony", "dell", "hp", "lenovo", "asus", "samsung", "oneplus", "casio", "giant", "jbl", "rotring", "ikea"}
BUDGET = {"local", "generic", "handwritten"}


def tier(brand: str) -> int:
    b = brand.lower()
    if b in PREMIUM:
        return 2
    if b in BUDGET:
        return 0
    return 1


def sale_value(klass: str, original: float, condition: str, age: float, demand: float, brand: str, noise: float) -> float:
    _, _, decay, floor, _, _ = CLASSES[klass]
    curve = floor + (1 - floor) * math.exp(-decay * age)
    ratio = COND_MULT[condition] * curve * BRAND_MULT[tier(brand)] * (0.9 + 0.2 * demand / 100) * noise
    return original * min(0.95, max(0.03, ratio))


def make_rows(n: int, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    names = list(CLASSES)
    rows = []
    for i in range(n):
        klass = names[i % len(names)]
        category, mrp, _, _, titles, brands = CLASSES[klass]
        original = max(80, round(rng.lognormvariate(math.log(mrp), 0.35)))
        condition = rng.choices(["New", "Like New", "Good", "Fair"], weights=[1, 3, 4, 2])[0]
        age = min(60, int(rng.expovariate(1 / 14)))
        demand = max(5, min(98, int(rng.gauss(55, 20))))
        brand = rng.choice(brands)
        title = rng.choice(titles)
        noise = math.exp(rng.gauss(0, 0.10))
        listing_type = "lend" if rng.random() < 0.2 else "sale"
        lend_unit = rng.choice(list(LEND_UNIT_DAYS)) if listing_type == "lend" else "day"
        value = sale_value(klass, original, condition, age, demand, brand, noise)
        if listing_type == "lend":
            price = max(LEND_MIN[lend_unit], min(original * 0.25, value * LEND_RATE[lend_unit]))
        else:
            price = max(40, value)
        rows.append(
            {
                "category": category, "title": title, "brand": brand, "originalPrice": original,
                "ageMonths": age, "condition": condition, "demand": demand,
                "listingType": listing_type, "lendUnit": lend_unit, "soldPrice": round(price), "source": "synthetic",
            }
        )
    return rows


def main(n: int = 6000):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = make_rows(n)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} synthetic rows to {OUT}")


if __name__ == "__main__":
    main()
