"""Train and export the compact on-device model.

The mobile app and the browser extension cannot run scikit-learn, so this
script trains a small character n-gram model (TF-IDF char_wb 3-5 grams +
Logistic Regression) on the SAME train/test split as train.py and writes it
as plain JSON. mobile/src/model.js and extension/model.js re-implement the
cleaning, n-gram, TF-IDF and logistic steps in JavaScript.

    cd backend
    python -m ml.export_on_device            # writes ml/models/on_device.json
"""
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

from .train import load_dataset

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "models" / "on_device.json"
METRICS = ROOT / "models" / "metrics.json"
MAX_FEATURES = 30_000


def main():
    df = load_dataset()
    X, y = df["text"].tolist(), df["label"].tolist()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), max_features=MAX_FEATURES,
                          min_df=2, sublinear_tf=True, dtype=np.float32)
    Xtr = vec.fit_transform(X_tr)
    Xte = vec.transform(X_te)
    clf = LogisticRegression(C=8.0, class_weight="balanced", solver="liblinear", max_iter=4000)
    clf.fit(Xtr, y_tr)
    pred = clf.predict(Xte)
    m = {
        "name": "On-device (char n-gram LR)",
        "accuracy": float(accuracy_score(y_te, pred)),
        "precision": float(precision_score(y_te, pred, pos_label="spam")),
        "recall": float(recall_score(y_te, pred, pos_label="spam")),
        "f1": float(f1_score(y_te, pred, pos_label="spam")),
        "confusion_matrix": confusion_matrix(y_te, pred, labels=["ham", "spam"]).tolist(),
        "labels": ["ham", "spam"],
        "features": int(len(vec.vocabulary_)),
    }
    print({k: v for k, v in m.items() if k != "confusion_matrix"})

    spam_sign = 1.0 if list(clf.classes_).index("spam") == 1 else -1.0
    coef = clf.coef_[0] * spam_sign
    intercept = float(clf.intercept_[0] * spam_sign)
    vocab = sorted(vec.vocabulary_.items(), key=lambda kv: kv[1])
    payload = {
        "format": "phishguard-on-device-v1",
        "analyzer": "char_wb",
        "ngram_range": [3, 5],
        "sublinear_tf": True,
        "norm": "l2",
        "ngrams": [g for g, _ in vocab],
        "idf": [round(float(vec.idf_[i]), 5) for _, i in vocab],
        "coef": [round(float(coef[i]), 5) for _, i in vocab],
        "intercept": round(intercept, 6),
        "metrics": {k: m[k] for k in ("accuracy", "precision", "recall", "f1")},
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.2f} MB)")

    # Store reference probabilities for the JS parity test
    probs = clf.predict_proba(Xte)[:, list(clf.classes_).index("spam")]
    ref = ROOT / "models" / "on_device_reference.json"
    ref.write_text(json.dumps({"texts": X_te[:400], "probs": [float(p) for p in probs[:400]],
                               "labels": y_te[:400]}, ensure_ascii=False), encoding="utf-8")

    if METRICS.exists():
        allm = json.loads(METRICS.read_text())
        allm["on_device"] = m
        METRICS.write_text(json.dumps(allm, indent=2))


if __name__ == "__main__":
    main()
