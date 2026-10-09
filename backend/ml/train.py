"""
Phishing & Mishing Detection Model Trainer (v2 — high accuracy)
Combines word + character n-gram TF-IDF features for stronger signal on
short, multilingual SMS messages. Trains Logistic Regression, Multinomial
Naive Bayes, and Linear SVM (calibrated for probabilities).
"""
import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report,
)

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent
DATASET = ROOT / "dataset" / "merged.csv"
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

try:
    from .text_utils import clean_text
except ImportError:  # run as a script: python ml/train.py
    from text_utils import clean_text


def load_dataset() -> pd.DataFrame:
    df = pd.read_csv(DATASET, low_memory=False)
    df = df[["label", "text", "lang"]].copy()
    df["label"] = df["label"].astype(str).str.lower().str.strip()
    df = df[df["label"].isin(["ham", "spam"])]
    # Keep only rows with a real language tag — the untagged ~117K rows
    # contain mislabeled tweet/social content that severely hurts SMS-domain accuracy.
    df = df[df["lang"].notna()]
    df = df[~df["lang"].astype(str).isin(["und", "nan", ""])]
    df["text"] = df["text"].astype(str).map(clean_text)
    df = df[df["text"].str.len() >= 5]
    df = df.drop_duplicates(subset=["text"]).reset_index(drop=True)
    return df


def evaluate(name, y_true, y_pred):
    return {
        "name": name,
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, pos_label="spam")),
        "recall": float(recall_score(y_true, y_pred, pos_label="spam")),
        "f1": float(f1_score(y_true, y_pred, pos_label="spam")),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=["ham", "spam"]).tolist(),
        "labels": ["ham", "spam"],
        "report": classification_report(y_true, y_pred, output_dict=True),
    }


def top_features(word_vec, classifier, n=20):
    try:
        names = np.array(word_vec.get_feature_names_out())
        if hasattr(classifier, "coef_"):
            coefs = classifier.coef_[0][: len(names)]
        elif hasattr(classifier, "feature_log_prob_"):
            spam_idx = list(classifier.classes_).index("spam")
            ham_idx = list(classifier.classes_).index("ham")
            coefs = (classifier.feature_log_prob_[spam_idx] - classifier.feature_log_prob_[ham_idx])[: len(names)]
        else:
            return []
        top_idx = np.argsort(coefs)[-n:][::-1]
        return [{"feature": names[i], "weight": float(coefs[i])} for i in top_idx]
    except Exception:
        return []


def main():
    print("> Loading dataset…")
    df = load_dataset()
    print(f"  rows={len(df)}  labels={df['label'].value_counts().to_dict()}")

    X = df["text"].tolist()
    y = df["label"].tolist()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # ----- Build combined TF-IDF feature space (word + char ngrams) -----
    print("> Fitting word TF-IDF (1-2 ngrams)…")
    word_vec = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        max_features=80_000,
        min_df=2,
        sublinear_tf=True,
        strip_accents="unicode",
    )
    Wtr = word_vec.fit_transform(X_train)

    print("> Fitting char TF-IDF (3-5 ngrams)…")
    char_vec = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        max_features=60_000,
        min_df=2,
        sublinear_tf=True,
    )
    Ctr = char_vec.fit_transform(X_train)

    Xtr = hstack([Wtr, Ctr]).tocsr()
    Wte = word_vec.transform(X_test)
    Cte = char_vec.transform(X_test)
    Xte = hstack([Wte, Cte]).tocsr()
    print(f"  total dims={Xtr.shape[1]:,}  train={Xtr.shape[0]:,}  test={Xte.shape[0]:,}")

    artifacts = {}
    metrics = {}

    print("> Training Logistic Regression (C=8, balanced)…")
    lr = LogisticRegression(max_iter=4000, n_jobs=-1, C=8.0, class_weight="balanced", solver="liblinear")
    lr.fit(Xtr, y_train)
    metrics["logistic_regression"] = evaluate("Logistic Regression", y_test, lr.predict(Xte))
    artifacts["logistic_regression"] = lr

    print("> Training Multinomial Naive Bayes…")
    nb = MultinomialNB(alpha=0.3)
    nb.fit(Xtr, y_train)
    metrics["naive_bayes"] = evaluate("Naive Bayes", y_test, nb.predict(Xte))
    artifacts["naive_bayes"] = nb

    print("> Training Linear SVM (calibrated, C=1)…")
    base_svm = LinearSVC(C=1.0, class_weight="balanced")
    svm = CalibratedClassifierCV(base_svm, cv=3)
    svm.fit(Xtr, y_train)
    metrics["svm"] = evaluate("SVM (Linear)", y_test, svm.predict(Xte))
    artifacts["svm"] = svm

    for k in ("logistic_regression", "naive_bayes", "svm"):
        m = metrics[k]
        print(f"  {k}: acc={m['accuracy']*100:.2f}% f1={m['f1']*100:.2f}% prec={m['precision']*100:.2f}% rec={m['recall']*100:.2f}%")

    best_key = max(("logistic_regression", "naive_bayes", "svm"), key=lambda k: metrics[k]["f1"])
    metrics["best_model"] = best_key
    print(f"> Best model: {best_key}  acc={metrics[best_key]['accuracy']*100:.2f}%  f1={metrics[best_key]['f1']*100:.2f}%")

    # Feature importance from logistic regression (word features only)
    metrics["feature_importance"] = top_features(word_vec, lr, n=20)

    metrics["dataset"] = {
        "total_rows": int(len(df)),
        "spam": int((df["label"] == "spam").sum()),
        "ham": int((df["label"] == "ham").sum()),
        "languages": df["lang"].value_counts().head(20).to_dict(),
    }

    print("> Saving artifacts…")
    # Save both vectorizers as a tuple-compatible structure
    joblib.dump({"word": word_vec, "char": char_vec}, MODEL_DIR / "vectorizer.joblib")
    for k, m in artifacts.items():
        joblib.dump(m, MODEL_DIR / f"{k}.joblib")
    with open(MODEL_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    print("> Done.")


if __name__ == "__main__":
    main()
