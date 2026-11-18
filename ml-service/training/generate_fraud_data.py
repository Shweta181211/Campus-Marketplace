"""Synthetic marketplace activity for the fraud model.

Be honest in the viva: there is no public "campus scam" dataset and a new marketplace has no confirmed fraud
labels on day one.  That is exactly why the PDF recommends an *unsupervised* Isolation Forest first.

This script simulates realistic listing/user/behaviour payloads (the same JSON the Node API sends to
``/ai/fraud-score``):

* ~95 % normal students, including two tricky-but-legit groups the model must NOT flag:
    - ``legit_bargain``      established sellers pricing 25-45 % under the fair price (moving out, need cash)
    - ``graduating_senior``  old, trusted accounts that post 5-10 different items within an hour
* ~5 % fraud, spread over six scam patterns seen on student marketplaces:
    price_bait, spam_duplicator, multi_account, repeat_offender, stolen_photos, activity_spike

The ``label`` / ``archetype`` columns are NEVER shown to the Isolation Forest; they are only used to measure
how well the unsupervised model separates the injected scams (precision / recall / ROC-AUC).
"""
from __future__ import annotations

import csv
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.services.fraud_features import RAW_DEFAULTS  # noqa: E402

OUT = ROOT / "data" / "fraud_seed.csv"

# (mrp low, mrp high, typical depreciation ratio range)
ITEMS = {
    "phone": (12000, 80000, (0.35, 0.70)),
    "laptop": (30000, 90000, (0.35, 0.70)),
    "tablet": (15000, 50000, (0.35, 0.70)),
    "calculator": (700, 1500, (0.45, 0.85)),
    "cycle": (4000, 15000, (0.40, 0.75)),
    "textbook": (300, 1200, (0.30, 0.65)),
    "notes": (50, 250, (0.25, 0.60)),
    "hostel": (300, 3000, (0.30, 0.70)),
    "furniture": (800, 5000, (0.30, 0.70)),
    "audio": (800, 6000, (0.25, 0.65)),
}
EXPENSIVE = ["phone", "laptop", "tablet"]
FRAUD_SHARE = {
    "price_bait": 0.016,
    "spam_duplicator": 0.008,
    "multi_account": 0.008,
    "repeat_offender": 0.006,
    "stolen_photos": 0.008,
    "activity_spike": 0.006,
}


def _poisson(rng: random.Random, lam: float) -> int:
    # Knuth; fine for the small lambdas used here
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


def _item(rng: random.Random, pool=None):
    name = rng.choice(pool or list(ITEMS))
    lo, hi, (dlo, dhi) = ITEMS[name]
    mrp = round(math.exp(rng.uniform(math.log(lo), math.log(hi))))
    fair = mrp * rng.uniform(dlo, dhi)
    return name, mrp, fair


def normal_row(rng: random.Random) -> dict:
    name, mrp, fair = _item(rng)
    price = fair * math.exp(rng.gauss(0, 0.15))
    age = rng.expovariate(1 / 220)
    if rng.random() < 0.12:
        age = rng.uniform(0, 4)  # genuinely new students list too (often on day one)
    return {
        "price": round(price),
        "originalPrice": mrp,
        "fairPrice": round(fair),
        "priceRatio": round(math.exp(rng.gauss(0, 0.35)), 3),
        "originalRatio": round(price / mrp, 3),
        "titleLength": rng.randint(10, 55),
        "descriptionLength": 0 if rng.random() < 0.12 else int(rng.lognormvariate(math.log(90), 0.6)),
        "duplicateTitleCount": 1 if rng.random() < 0.08 else 0,  # popular items ("Casio fx-991EX") repeat
        "duplicateContentCount": 0,
        "imageCount": 0 if rng.random() < 0.15 else rng.randint(1, 5),
        "reusedImageCount": 1 if rng.random() < 0.015 else 0,  # stock photo
        "contactInDescription": 1 if rng.random() < 0.03 else 0,
        "urgencyScore": 1 if rng.random() < 0.06 else 0,
        "accountAgeDays": round(age, 2),
        "verified": 1,
        "linkedAccounts": 1 if rng.random() < 0.03 else 0,  # roommates sharing a laptop
        "confirmedReports": 0,
        "openReports": 1 if rng.random() < 0.04 else 0,
        # matches server/utils/trust.js: a freshly verified student starts around 45-55 and grows with history
        "trustScore": rng.uniform(43, 58) if age < 14 else max(20, min(98, rng.gauss(64, 11))),
        "listingBurst1h": _poisson(rng, 0.3),
        "listings24h": _poisson(rng, 1.0),
        "messages1h": _poisson(rng, 2.0),
        "recentTransactions24h": _poisson(rng, 0.3),
    }


def legit_bargain(rng):
    r = normal_row(rng)
    r["price"] = round(r["fairPrice"] * rng.uniform(0.55, 0.75))
    r["originalRatio"] = round(r["price"] / r["originalPrice"], 3)
    r["priceRatio"] = round(r["priceRatio"] * 0.7, 3)
    r["accountAgeDays"] = rng.uniform(60, 900)
    r["trustScore"] = rng.uniform(60, 90)
    r["urgencyScore"] = 1 if rng.random() < 0.3 else 0  # "leaving campus" is common and legit
    return r


def graduating_senior(rng):
    r = normal_row(rng)
    r["accountAgeDays"] = rng.uniform(600, 1400)
    r["trustScore"] = rng.uniform(65, 95)
    r["listingBurst1h"] = rng.randint(4, 9)
    r["listings24h"] = r["listingBurst1h"] + rng.randint(0, 4)
    r["price"] = round(r["fairPrice"] * rng.uniform(0.7, 1.0))
    r["originalRatio"] = round(r["price"] / r["originalPrice"], 3)
    return r


def price_bait(rng):
    r = normal_row(rng)
    name, mrp, fair = _item(rng, EXPENSIVE)
    price = fair * rng.uniform(0.10, 0.30)
    r.update(
        price=round(price), originalPrice=mrp, fairPrice=round(fair), originalRatio=round(price / mrp, 3),
        priceRatio=round(rng.uniform(0.08, 0.35), 3), descriptionLength=rng.randint(0, 45),
        imageCount=rng.choice([0, 0, 1]), reusedImageCount=rng.choice([0, 1, 1]),
        contactInDescription=rng.randint(1, 3), urgencyScore=rng.randint(1, 3),
        accountAgeDays=rng.uniform(0, 6), trustScore=rng.uniform(35, 55), messages1h=rng.randint(3, 25),
    )
    if rng.random() < 0.3:
        # compromised / borrowed account: an old, trusted profile suddenly posting a too-good-to-be-true deal
        r.update(accountAgeDays=rng.uniform(60, 900), trustScore=rng.uniform(55, 88), imageCount=rng.choice([0, 1, 2]))
    return r


def spam_duplicator(rng):
    r = normal_row(rng)
    n = rng.randint(3, 12)
    r.update(
        duplicateTitleCount=n, duplicateContentCount=max(2, n - rng.randint(0, 2)),
        listingBurst1h=rng.randint(4, 14), listings24h=rng.randint(8, 35),
        accountAgeDays=rng.uniform(0, 40), trustScore=rng.uniform(35, 60), contactInDescription=rng.choice([0, 1]),
    )
    return r


def multi_account(rng):
    r = normal_row(rng)
    r.update(
        linkedAccounts=rng.randint(2, 7), accountAgeDays=rng.uniform(0, 3), verified=rng.choice([1, 1, 0]),
        listingBurst1h=rng.randint(1, 4), trustScore=rng.uniform(40, 55),
        price=round(r["fairPrice"] * rng.uniform(0.4, 0.85)), openReports=rng.choice([0, 1]),
    )
    r["originalRatio"] = round(r["price"] / r["originalPrice"], 3)
    return r


def repeat_offender(rng):
    r = normal_row(rng)
    r.update(
        confirmedReports=rng.randint(1, 4), openReports=rng.randint(1, 5), trustScore=rng.uniform(5, 35),
        price=round(r["fairPrice"] * rng.uniform(0.4, 0.9)),
    )
    r["originalRatio"] = round(r["price"] / r["originalPrice"], 3)
    return r


def stolen_photos(rng):
    r = normal_row(rng)
    r.update(
        reusedImageCount=rng.randint(1, 5), imageCount=rng.randint(1, 5), accountAgeDays=rng.uniform(0, 20),
        price=round(r["fairPrice"] * rng.uniform(0.25, 0.6)), trustScore=rng.uniform(40, 58),
        descriptionLength=rng.randint(0, 60),
    )
    r["originalRatio"] = round(r["price"] / r["originalPrice"], 3)
    return r


def activity_spike(rng):
    r = normal_row(rng)
    r.update(
        messages1h=rng.randint(30, 150), recentTransactions24h=rng.randint(3, 12),
        contactInDescription=rng.choice([0, 1, 2]), accountAgeDays=rng.uniform(0, 60), trustScore=rng.uniform(35, 60),
    )
    return r


FRAUD_MAKERS = {
    "price_bait": price_bait,
    "spam_duplicator": spam_duplicator,
    "multi_account": multi_account,
    "repeat_offender": repeat_offender,
    "stolen_photos": stolen_photos,
    "activity_spike": activity_spike,
}


def make_rows(n: int = 12000, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    rows: list[dict] = []
    for _ in range(n):
        u = rng.random()
        acc = 0.0
        archetype = None
        for name, share in FRAUD_SHARE.items():
            acc += share
            if u < acc:
                archetype = name
                break
        if archetype:
            row, label = FRAUD_MAKERS[archetype](rng), 1
        else:
            v = rng.random()
            if v < 0.07:
                archetype, row = "legit_bargain", legit_bargain(rng)
            elif v < 0.10:
                archetype, row = "graduating_senior", graduating_senior(rng)
            else:
                archetype, row = "normal", normal_row(rng)
            label = 0
        clean = {k: round(float(row.get(k, RAW_DEFAULTS[k])), 4) for k in RAW_DEFAULTS}
        clean.update(label=label, archetype=archetype)
        rows.append(clean)
    return rows


def main(n: int = 12000):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = make_rows(n)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    frauds = sum(r["label"] for r in rows)
    print(f"Wrote {len(rows)} synthetic marketplace rows ({frauds} injected scams) to {OUT}")


if __name__ == "__main__":
    main()
