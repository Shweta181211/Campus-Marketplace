"""Run from ml-service/:  python -m pytest tests -q   (or: python -m unittest discover tests)"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

BASE = {"category": "electronics", "brand": "Casio", "title": "Casio fx-991EX calculator",
        "originalPrice": 1200, "ageMonths": 12, "condition": "Good", "demand": 60,
        "listingType": "sale", "lendUnit": "day"}


def predict(**over):
    with TestClient(app) as c:
        r = c.post("/ai/price-predict", json={**BASE, **over})
        assert r.status_code == 200, r.text
        return r.json()


class PriceModelTests(unittest.TestCase):
    def test_band_contains_recommendation(self):
        r = predict()
        self.assertLessEqual(r["minFairPrice"], r["recommendedPrice"])
        self.assertLessEqual(r["recommendedPrice"], r["maxFairPrice"])
        self.assertEqual(r["source"], "ml")

    def test_never_above_original(self):
        r = predict(condition="New", ageMonths=0)
        self.assertLessEqual(r["recommendedPrice"], 1200 * 0.97)

    def test_older_is_cheaper(self):
        self.assertGreaterEqual(predict(ageMonths=2)["recommendedPrice"], predict(ageMonths=40)["recommendedPrice"])

    def test_better_condition_is_pricier(self):
        prices = [predict(condition=c)["recommendedPrice"] for c in ("Fair", "Good", "Like New", "New")]
        self.assertEqual(prices, sorted(prices))

    def test_phone_depreciates_faster_than_textbook(self):
        phone = predict(title="iPhone 12", brand="Apple", originalPrice=50000, ageMonths=36)["recommendedPrice"] / 50000
        book = predict(category="books", title="Engineering Mathematics textbook", brand="Wiley",
                       originalPrice=50000, ageMonths=36)["recommendedPrice"] / 50000
        self.assertLess(phone, book)

    def test_lending_is_a_fraction_of_sale_price(self):
        sale = predict()["recommendedPrice"]
        rent = predict(listingType="lend", lendUnit="week")["recommendedPrice"]
        self.assertLess(rent, sale * 0.5)
        self.assertGreater(predict(listingType="lend", lendUnit="semester")["recommendedPrice"],
                           predict(listingType="lend", lendUnit="day")["recommendedPrice"])

    def test_tiny_mrp_falls_back_to_typical_price(self):
        r = predict(originalPrice=40)  # rent typed into MRP box
        self.assertTrue(r["usedTypicalMrp"])
        self.assertGreater(r["recommendedPrice"], 100)

    def test_model_beats_naive_baseline(self):
        with TestClient(app) as c:
            m = c.get("/health").json()["metrics"]
        self.assertLess(m["test_overall"]["MAPE_pct"], m["naive_baseline_test"]["MAPE_pct"] / 2)
        self.assertGreater(m["interval_80pct_coverage"], 0.7)


if __name__ == "__main__":
    unittest.main()
