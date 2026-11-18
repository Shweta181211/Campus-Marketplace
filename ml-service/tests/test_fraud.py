"""Fraud model tests.  Run: npm run test:ml"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

# an ordinary listing from an established, verified student
NORMAL = {
    "price": 42000, "originalPrice": 70000, "fairPrice": 41000, "priceRatio": 1.1, "originalRatio": 0.6,
    "titleLength": 28, "descriptionLength": 140, "duplicateTitleCount": 0, "duplicateContentCount": 0,
    "imageCount": 3, "reusedImageCount": 0, "contactInDescription": 0, "urgencyScore": 0,
    "accountAgeDays": 300, "verified": 1, "linkedAccounts": 0, "confirmedReports": 0, "openReports": 0,
    "trustScore": 72, "listingBurst1h": 0, "listings24h": 1, "messages1h": 2, "recentTransactions24h": 0,
}


def score(**over):
    with TestClient(app) as c:
        r = c.post("/ai/fraud-score", json={**NORMAL, **over})
        assert r.status_code == 200, r.text
        return r.json()


class FraudModelTests(unittest.TestCase):
    def test_normal_listing_is_low_and_published(self):
        r = score()
        self.assertEqual(r["fraudRiskLevel"], "LOW")
        self.assertEqual(r["decision"], "PUBLISH")
        self.assertTrue(0 <= r["fraudRiskScore"] < 0.4)

    def test_cheap_iphone_from_trusted_seller_is_not_fraud(self):
        # PDF section 7: 30 % below the range does not automatically become a fraud case
        r = score(price=28700, priceRatio=0.75, originalRatio=0.41)
        self.assertEqual(r["fraudRiskLevel"], "LOW")

    def test_classic_price_bait_scam_is_held(self):
        r = score(price=6000, priceRatio=0.15, originalRatio=0.09, descriptionLength=20, imageCount=0,
                  reusedImageCount=1, contactInDescription=2, urgencyScore=2, accountAgeDays=0.5, trustScore=45,
                  messages1h=15)
        self.assertEqual(r["fraudRiskLevel"], "HIGH")
        self.assertEqual(r["decision"], "HOLD")
        self.assertIn("off_platform_contact_or_payment", r["fraudSignals"])
        self.assertTrue(r["reasons"], "HIGH risk must come with explanations")

    def test_spam_duplicates_flagged(self):
        r = score(duplicateTitleCount=8, duplicateContentCount=7, listingBurst1h=9, listings24h=20, accountAgeDays=5)
        self.assertIn(r["fraudRiskLevel"], ("MEDIUM", "HIGH"))
        self.assertIn("duplicate_listing_title", r["fraudSignals"])

    def test_multi_account_needs_verification(self):
        r = score(linkedAccounts=4, accountAgeDays=1, trustScore=48, listingBurst1h=2)
        self.assertIn(r["fraudRiskLevel"], ("MEDIUM", "HIGH"))

    def test_more_red_flags_never_lower_risk(self):
        base = score(contactInDescription=1)["fraudRiskScore"]
        worse = score(contactInDescription=1, reusedImageCount=2, accountAgeDays=1)["fraudRiskScore"]
        self.assertGreaterEqual(worse, base)

    def test_good_behaviour_is_not_anomalous(self):
        # one-sided clipping: very old account, huge description, many photos must not raise risk
        r = score(accountAgeDays=1500, descriptionLength=2000, imageCount=6, trustScore=99)
        self.assertEqual(r["fraudRiskLevel"], "LOW")

    def test_combined_engine(self):
        body = {
            "listing": {"category": "electronics", "brand": "Apple", "title": "iPhone 13", "originalPrice": 70000,
                        "ageMonths": 18, "condition": "Good", "demand": 70, "listingType": "sale", "lendUnit": "day"},
            "price": 7000,
            "fraud": {**NORMAL, "contactInDescription": 2, "urgencyScore": 2, "accountAgeDays": 0.3,
                      "imageCount": 0, "trustScore": 45},
        }
        with TestClient(app) as c:
            r = c.post("/ai/assess-listing", json=body).json()
        self.assertEqual(r["priceVerdict"], "BELOW_FAIR_RANGE")
        self.assertEqual(r["decision"], "HOLD")
        self.assertIn("seller", r["messages"])

    def test_model_metrics_are_reported(self):
        with TestClient(app) as c:
            m = c.get("/ai/fraud-model-info").json()["metrics"]["test"]
        self.assertGreater(m["roc_auc"], 0.95)
        self.assertGreater(m["at_MEDIUM_or_HIGH"]["recall"], 0.85)
        self.assertLess(m["false_alarm_rate_normal_users"]["high"], 0.01)
        # the model must beat "flag anything with a red flag" on precision
        self.assertGreater(m["at_MEDIUM_or_HIGH"]["precision"], m["rule_baseline_any_red_flag"]["precision"])


if __name__ == "__main__":
    unittest.main()
