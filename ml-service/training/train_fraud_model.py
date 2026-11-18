"""Train the fraud / scam risk model.

Stage 1 (MVP, always)      Isolation Forest — unsupervised, needs no fraud labels.
Stage 2 (when labels exist) RandomForestClassifier on admin-confirmed decisions exported by the API
                           (``npm run export-fraud``  ->  server/data/fraud-training.json).  Blended 50/50 with the
                           anomaly score.  Needs >= 10 confirmed frauds and >= 10 approved listings.

Evaluation uses the *injected* synthetic scams (labels the Isolation Forest never sees):
ROC-AUC, average precision, precision/recall at the MEDIUM and HIGH thresholds, recall per scam type,
and false-alarm rate on the two tricky legit groups (big bargains, graduating seniors).  A simple rule
baseline is reported next to it so the benefit of the model is visible.

Run from the project root:  npm run ml:train      (or)  python3 ml-service/training/train_fraud_model.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import average_precision_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import cross_val_score, train_test_split

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.services.fraud_features import FEATURE_NAMES, build_matrix, rule_signals  # noqa: E402
from app.services.fraud_model import HIGH_MIN, LOW_MAX, FraudScorer  # noqa: E402
from app.services.model_store import FRAUD_BUNDLE, FRAUD_METRICS_PATH, MODELS  # noqa: E402
from training.generate_fraud_data import make_rows  # noqa: E402

REAL_DATA = ROOT.parent / "server" / "data" / "fraud-training.json"
# training-score percentiles -> calibrated risk
ANCHOR_PCTS = [0, 50, 87, 94.5, 97.5, 99.5, 100]
ANCHOR_RISK = [0.0, 0.10, 0.30, 0.40, 0.70, 0.90, 0.99]
MIN_LABELS_PER_CLASS = 10


def load_real() -> tuple[list[dict], list[int | None]]:
    if not REAL_DATA.exists():
        return [], []
    rows, labels = [], []
    for r in json.loads(REAL_DATA.read_text()):
        feats = r.get("features")
        if not isinstance(feats, dict):
            continue
        rows.append(feats)
        lab = r.get("label")
        labels.append(int(lab) if lab in (0, 1) else None)
    return rows, labels


def fit_iforest(X: np.ndarray) -> IsolationForest:
    model = IsolationForest(n_estimators=400, max_samples=512, contamination="auto", random_state=42, n_jobs=-1)
    model.fit(X)
    return model


def anchors_from(model: IsolationForest, X: np.ndarray) -> list[float]:
    raw = -model.score_samples(X)
    anchors = list(np.percentile(raw, ANCHOR_PCTS))
    anchors[0] = min(anchors[0], 0.0)
    anchors[-1] = anchors[-1] + 0.05  # head-room for things more anomalous than anything seen in training
    for i in range(1, len(anchors)):  # np.interp needs strictly increasing x
        anchors[i] = max(anchors[i], anchors[i - 1] + 1e-6)
    return [float(a) for a in anchors]


def baseline_vector(X: np.ndarray) -> list[float]:
    return [float(v) for v in np.median(X, axis=0)]


def evaluate(scorer: FraudScorer, X: np.ndarray, rows: list[dict], y: np.ndarray, arche: np.ndarray) -> dict:
    risk = scorer.risk_matrix(X)
    n_flags = np.array([len(rule_signals(r)) for r in rows])
    risk = np.where(n_flags >= 2, np.maximum(risk, LOW_MAX), risk)  # same guardrail as serving
    med_plus = risk >= LOW_MAX
    high = risk >= HIGH_MIN
    rules = np.array([len(rule_signals(r)) >= 1 for r in rows])

    def rate(mask, sel):
        return round(float(mask[sel].mean()), 3) if sel.any() else None

    per_type = {}
    for a in sorted(set(arche)):
        sel = arche == a
        per_type[a] = {
            "n": int(sel.sum()),
            "flagged_medium_or_high": rate(med_plus, sel),
            "held_high": rate(high, sel),
        }
    return {
        "roc_auc": round(float(roc_auc_score(y, risk)), 4),
        "average_precision": round(float(average_precision_score(y, risk)), 4),
        "at_MEDIUM_or_HIGH": {
            "precision": round(float(precision_score(y, med_plus, zero_division=0)), 3),
            "recall": round(float(recall_score(y, med_plus)), 3),
            "share_of_listings_flagged": round(float(med_plus.mean()), 3),
        },
        "at_HIGH": {
            "precision": round(float(precision_score(y, high, zero_division=0)), 3),
            "recall": round(float(recall_score(y, high)), 3),
            "share_of_listings_held": round(float(high.mean()), 3),
        },
        "false_alarm_rate_normal_users": {
            "medium_or_high": rate(med_plus, y == 0),
            "high": rate(high, y == 0),
        },
        "rule_baseline_any_red_flag": {
            "precision": round(float(precision_score(y, rules, zero_division=0)), 3),
            "recall": round(float(recall_score(y, rules)), 3),
            "false_alarm_rate": rate(rules, y == 0),
        },
        "per_archetype": per_type,
    }


def main():
    synth = make_rows(12000)
    X_all = build_matrix(synth)
    y_all = np.array([r["label"] for r in synth])
    arche = np.array([r["archetype"] for r in synth])
    idx_tr, idx_te = train_test_split(np.arange(len(synth)), test_size=0.3, random_state=42, stratify=y_all)

    # ---- 1. honest evaluation: fit on the training split only (labels unused), test on held-out rows ----------
    model = fit_iforest(X_all[idx_tr])
    normal_tr = idx_tr[y_all[idx_tr] == 0]  # baseline only used for explanations; not for scoring
    eval_scorer = FraudScorer(
        {
            "iforest": model,
            "anchor_raw": anchors_from(model, X_all[idx_tr]),
            "anchor_risk": ANCHOR_RISK,
            "baseline": baseline_vector(X_all[normal_tr]),
        }
    )
    test_rows = [synth[i] for i in idx_te]
    metrics = {
        "model": "IsolationForest(n_estimators=400, max_samples=512) on 22 risk-oriented features, percentile-calibrated",
        "thresholds": {"LOW": f"risk < {LOW_MAX}", "MEDIUM": f"{LOW_MAX} <= risk < {HIGH_MIN}", "HIGH": f"risk >= {HIGH_MIN}"},
        "test": evaluate(eval_scorer, X_all[idx_te], test_rows, y_all[idx_te], arche[idx_te]),
        "n_train": int(len(idx_tr)),
        "n_test": int(len(idx_te)),
        "injected_fraud_rate": round(float(y_all.mean()), 4),
    }

    # Reference only: what a supervised model could reach IF we had labels (synthetic labels, 5-fold CV).
    rf_ref = RandomForestClassifier(n_estimators=200, min_samples_leaf=3, class_weight="balanced", random_state=42, n_jobs=-1)
    metrics["supervised_reference_rf_cv_roc_auc"] = round(
        float(cross_val_score(rf_ref, X_all, y_all, cv=5, scoring="roc_auc").mean()), 4
    )

    # ---- 2. serving model: synthetic + real (unlabelled) marketplace rows ----------------------------------
    real_rows, real_labels = load_real()
    X_serve = X_all if not real_rows else np.vstack([X_all, build_matrix(real_rows)])
    final = fit_iforest(X_serve)
    bundle = {
        "iforest": final,
        "anchor_raw": anchors_from(final, X_serve),
        "anchor_risk": ANCHOR_RISK,
        "baseline": baseline_vector(X_all[y_all == 0]),
        "feature_names": FEATURE_NAMES,
        "version": 3,
        "trainedOn": "synthetic campus marketplace activity" + (f" + {len(real_rows)} real listings" if real_rows else ""),
        "n_real_labels": 0,
        "supervised": None,
    }

    # ---- 3. supervised stage, only once admins have produced enough confirmed decisions -------------------
    labelled = [(r, lab) for r, lab in zip(real_rows, real_labels) if lab is not None]
    pos = sum(1 for _, lab in labelled if lab == 1)
    neg = len(labelled) - pos
    metrics["real_labels"] = {"confirmed_fraud": pos, "approved": neg}
    if pos >= MIN_LABELS_PER_CLASS and neg >= MIN_LABELS_PER_CLASS:
        Xl = build_matrix([r for r, _ in labelled])
        yl = np.array([lab for _, lab in labelled])
        rf = RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=42, n_jobs=-1)
        folds = min(5, pos, neg)
        metrics["supervised_real_cv_roc_auc"] = round(float(cross_val_score(rf, Xl, yl, cv=folds, scoring="roc_auc").mean()), 4)
        rf.fit(Xl, yl)
        bundle["supervised"] = rf
        bundle["supervised_weight"] = 0.5
        bundle["n_real_labels"] = int(len(labelled))
        metrics["model"] += " + RandomForestClassifier on admin-confirmed labels (50/50 blend)"
    else:
        metrics["supervised_stage"] = (
            f"not active yet — needs >= {MIN_LABELS_PER_CLASS} confirmed frauds and >= {MIN_LABELS_PER_CLASS} approved "
            "listings from admin review (run: npm run export-fraud && npm run ml:train)"
        )

    metrics["trainedOn"] = bundle["trainedOn"]
    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, FRAUD_BUNDLE)
    FRAUD_METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    print(json.dumps({k: v for k, v in metrics.items() if k != "per_archetype"}, indent=2))
    print(f"Saved {FRAUD_BUNDLE}")


if __name__ == "__main__":
    main()
