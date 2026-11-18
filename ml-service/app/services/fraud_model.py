"""Serving-side fraud scoring: Isolation Forest (+ optional supervised model) -> calibrated 0-1 risk.

Score pipeline
--------------
1. ``build_vector``                     raw payload -> 22 risk-oriented features
2. ``IsolationForest.score_samples``    anomaly score; we negate it so larger = more anomalous
3. calibration (``np.interp`` anchors)  raw anomaly -> 0..1 risk.  Anchors are percentiles of the TRAINING
                                        scores, so "risk 0.70" means "more anomalous than ~97 % of normal
                                        campus activity".  This is monotone and easy to explain.
4. optional supervised model            once admins have confirmed enough frauds, a RandomForestClassifier is
                                        trained on those labels and blended in (50/50) with the anomaly score
5. explanations                         occlusion: reset one feature at a time to the typical (median) value and
                                        measure how much the risk drops.  The biggest drops are the reasons.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.services.fraud_features import FEATURE_NAMES, FEATURE_TEXT, FEATURE_LEVEL, build_vector, rule_signals

LOW_MAX = 0.40  # risk < 0.40  -> LOW    -> publish
HIGH_MIN = 0.70  # risk >= 0.70 -> HIGH   -> hold + admin review; in between -> MEDIUM -> extra verification


def apply_rule_floor(risk: float, signals: list[str]) -> float:
    """Guardrail: two or more independent, human-checkable red flags (e.g. 4 accounts on one device AND a
    burst of listings on day one) always get at least the extra-verification step, even if the anomaly score
    alone is just under the MEDIUM line. One red flag alone never triggers this."""
    return max(risk, LOW_MAX) if len(signals) >= 2 else risk


def level_for(risk: float) -> str:
    if risk >= HIGH_MIN:
        return "HIGH"
    if risk >= LOW_MAX:
        return "MEDIUM"
    return "LOW"


DECISION = {
    "LOW": ("PUBLISH", "Published normally."),
    "MEDIUM": ("VERIFY", "Published after the seller completes an extra verification step (email OTP)."),
    "HIGH": ("HOLD", "Held for admin review. It is not visible to buyers yet."),
}


@dataclass
class FraudResult:
    risk: float
    level: str
    anomaly_risk: float
    supervised_risk: float | None
    signals: list[str]
    reasons: list[dict]


class FraudScorer:
    def __init__(self, bundle: dict):
        self.bundle = bundle
        self.iforest = bundle["iforest"]
        self.anchor_raw = np.asarray(bundle["anchor_raw"], dtype=float)
        self.anchor_risk = np.asarray(bundle["anchor_risk"], dtype=float)
        self.baseline = np.asarray(bundle["baseline"], dtype=float)  # per-feature median of normal activity
        self.supervised = bundle.get("supervised")
        self.blend = float(bundle.get("supervised_weight", 0.5))

    # -- core ---------------------------------------------------------------------------------------------
    def _anomaly_risk(self, X: np.ndarray) -> np.ndarray:
        raw = -self.iforest.score_samples(X)
        return np.interp(raw, self.anchor_raw, self.anchor_risk)

    def _risk(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray | None]:
        a = self._anomaly_risk(X)
        if self.supervised is None:
            return a, a, None
        s = self.supervised.predict_proba(X)[:, 1]
        return (1 - self.blend) * a + self.blend * s, a, s

    def risk_matrix(self, X: np.ndarray) -> np.ndarray:
        return self._risk(X)[0]

    # -- public -------------------------------------------------------------------------------------------
    def score(self, payload: dict) -> FraudResult:
        x = build_vector(payload).reshape(1, -1)
        risk, a, s = self._risk(x)
        r = float(np.clip(risk[0], 0.0, 1.0))
        signals = rule_signals(payload)
        r = apply_rule_floor(r, signals)
        reasons = self._explain(x[0], r)
        if not signals:
            signals = ["multivariate_anomaly"] if r >= LOW_MAX else ["no_strong_anomaly"]
        return FraudResult(
            risk=round(r, 3),
            level=level_for(r),
            anomaly_risk=round(float(a[0]), 3),
            supervised_risk=None if s is None else round(float(s[0]), 3),
            signals=signals,
            reasons=reasons,
        )

    def _explain(self, x: np.ndarray, risk: float, top: int = 3) -> list[dict]:
        """Occlusion attribution: how much does the risk fall if this one feature looked typical?"""
        if risk < 0.25:
            return []
        probes = np.repeat(x.reshape(1, -1), len(x), axis=0)
        idx = np.arange(len(x))
        probes[idx, idx] = np.minimum(x, self.baseline)  # features are risk-oriented: only lower them
        drops = risk - self.risk_matrix(probes)
        order = np.argsort(-drops)
        out = []
        for i in order[:top]:
            if drops[i] < 0.02:
                break
            name = FEATURE_NAMES[i]
            out.append(
                {
                    "feature": name,
                    "level": FEATURE_LEVEL[name],
                    "text": FEATURE_TEXT[name],
                    "impact": round(float(drops[i]), 3),
                }
            )
        return out

    def info(self) -> dict:
        return {
            "algorithm": "IsolationForest" + (" + RandomForest (admin-confirmed labels)" if self.supervised else ""),
            "features": FEATURE_NAMES,
            "thresholds": {"LOW": f"< {LOW_MAX}", "MEDIUM": f"{LOW_MAX} - {HIGH_MIN}", "HIGH": f">= {HIGH_MIN}"},
            "version": self.bundle.get("version"),
            "trainedOn": self.bundle.get("trainedOn"),
            "nRealLabels": self.bundle.get("n_real_labels", 0),
        }
