from pathlib import Path
import csv
import random

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "seed_listings.csv"
OUT.parent.mkdir(parents=True, exist_ok=True)

CATEGORIES = {
    "books": (150, 900, ["Pearson", "McGraw Hill", "Wiley", "Classic"]),
    "cycles": (4000, 15000, ["Hero", "Firefox", "Giant", "BSA"]),
    "electronics": (400, 80000, ["Casio", "Dell", "HP", "boat", "Apple", "Arduino"]),
    "lab": (200, 4000, ["Generic", "Rotring", "Omega"]),
    "furniture": (400, 8000, ["Local", "IKEA", "Nilkamal"]),
    "hostel": (200, 8000, ["Pigeon", "Croma", "Decathlon"]),
    "notes": (80, 400, ["Handwritten"]),
    "other": (150, 4000, ["Quechua", "Yonex", "Local"]),
}
CONDITIONS = ["New", "Like New", "Good", "Fair"]
CF = {"New": 0.92, "Like New": 0.78, "Good": 0.62, "Fair": 0.45}


def main():
    rng = random.Random(42)
    rows = []
    for i in range(280):
        category = list(CATEGORIES)[i % len(CATEGORIES)]
        lo, hi, brands = CATEGORIES[category]
        original = rng.randint(lo, hi)
        condition = CONDITIONS[i % 4]
        age = rng.randint(0, 48)
        demand = rng.randint(20, 95)
        listing_type = "lend" if i % 5 == 0 else "sale"
        brand = brands[i % len(brands)]
        noise = rng.uniform(0.88, 1.12)
        sold = original * CF[condition] * max(0.28, 1 - age * 0.012) * (0.9 + demand / 500) * noise
        if listing_type == "lend":
            sold = max(15, sold * 0.04)
        rows.append(
            {
                "category": category,
                "brand": brand,
                "originalPrice": original,
                "ageMonths": age,
                "condition": condition,
                "demand": demand,
                "listingType": listing_type,
                "soldPrice": round(sold, 0),
            }
        )
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {OUT}")


if __name__ == "__main__":
    main()
