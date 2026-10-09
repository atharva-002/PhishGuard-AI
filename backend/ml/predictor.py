"""Runtime phishing predictor – loads trained artifacts and exposes a clean API."""
import json
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np
from scipy.sparse import hstack

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"

# Suspicious keywords across languages (used both as a soft signal & UI highlight)
SUSPICIOUS_KEYWORDS = [
    # English
    "urgent", "verify", "account", "bank", "password", "otp", "click", "link",
    "winner", "prize", "lottery", "congratulations", "claim", "refund", "tax",
    "free", "offer", "limited", "expire", "suspend", "blocked", "kyc", "alert",
    "credit card", "atm", "pin", "transfer", "wire", "bitcoin", "crypto",
    "loan", "deposit", "gift", "voucher", "reward", "selected", "lucky",
    # Hindi (Devanagari)
    "जीत", "लॉटरी", "इनाम", "बैंक", "खाता", "पासवर्ड", "तुरंत", "सत्यापित",
    "क्लिक", "लिंक", "मुफ्त", "केवाईसी", "सावधान",
    # Bengali
    "জিতেছেন", "ব্যাংক", "পাসওয়ার্ড", "ক্লিক", "অবিলম্বে",
    # Tamil
    "வங்கி", "கடவுச்சொல்", "வென்றீர்கள்", "இலவசம்", "உடனடியாக",
    # Telugu
    "బ్యాంక్", "పాస్‌వర్డ్", "గెలుచుకున్నారు", "ఉచితం",
    # Marathi
    "बँक", "पासवर्ड", "जिंकले", "त्वरित",
    # Gujarati
    "બેંક", "પાસવર્ડ", "જીત્યા", "મફત",
]

from .transformer_predictor import TransformerPredictor  # noqa: E402
from .text_utils import (  # noqa: E402  (shared with train.py)
    URL_RE, EMAIL_RE, PHONE_RE, clean_text, detect_language,
)

class PhishingPredictor:
    """Loads and serves the trained models."""

    def __init__(self):
        self.ready = False
        self.word_vec = None
        self.char_vec = None
        self.models: Dict[str, object] = {}
        self.metrics: Dict = {}
        self.best_key = "logistic_regression"
        self.transformer: Optional[TransformerPredictor] = None
        self._load()

    def _load(self):
        if not (MODEL_DIR / "vectorizer.joblib").exists():
            return
        try:
            vec = joblib.load(MODEL_DIR / "vectorizer.joblib")
            if isinstance(vec, dict):
                self.word_vec = vec.get("word")
                self.char_vec = vec.get("char")
            else:
                # Backward compat: single vectorizer
                self.word_vec = vec
                self.char_vec = None
            for key in ("logistic_regression", "naive_bayes", "svm"):
                p = MODEL_DIR / f"{key}.joblib"
                if p.exists():
                    self.models[key] = joblib.load(p)
            metrics_p = MODEL_DIR / "metrics.json"
            if metrics_p.exists():
                with open(metrics_p) as f:
                    self.metrics = json.load(f)
                self.best_key = self.metrics.get("best_model", "logistic_regression")
            self.ready = bool(self.models and self.word_vec is not None)
        except Exception as e:
            print(f"[predictor] load failed: {e}")
            self.ready = False
        # Optional transformer (only if a fine-tuned model has been added)
        self.transformer = TransformerPredictor()
        if not self.transformer.ready:
            print(f"[predictor] transformer disabled: {self.transformer.error}")

    @property
    def available_models(self) -> List[str]:
        keys = list(self.models.keys())
        if self.transformer is not None and self.transformer.ready:
            keys.append("transformer")
        return keys

    def _vectorize(self, texts):
        W = self.word_vec.transform(texts)
        if self.char_vec is not None:
            C = self.char_vec.transform(texts)
            return hstack([W, C]).tocsr()
        return W

    # ----------------------- helpers -----------------------
    def _extract_suspicious(self, raw_text: str) -> List[str]:
        lowered = raw_text.lower()
        found = []
        for kw in SUSPICIOUS_KEYWORDS:
            if kw.lower() in lowered and kw not in found:
                found.append(kw)
        # URLs / phone / email count as suspicious surface signals
        if URL_RE.search(raw_text):
            found.append("__url__")
        if EMAIL_RE.search(raw_text):
            found.append("__email__")
        if PHONE_RE.search(raw_text):
            found.append("__phone__")
        return found[:20]

    def _confidence(self, model, X) -> float:
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(X)[0]
            classes = list(model.classes_)
            spam_idx = classes.index("spam") if "spam" in classes else 1
            return float(proba[spam_idx])
        if hasattr(model, "decision_function"):
            score = float(model.decision_function(X)[0])
            # squash to 0..1 via logistic
            return float(1.0 / (1.0 + np.exp(-score)))
        return 0.5

    # ----------------------- API -----------------------
    def predict(self, text: str, model_key: Optional[str] = None) -> Dict:
        if not self.ready:
            return {"error": "Model not ready. Please train the model first."}
        key = model_key if model_key in self.available_models else self.best_key
        cleaned = clean_text(text)
        if key == "transformer":
            spam_prob = self.transformer.predict_proba([cleaned])[0]
            label = "spam" if spam_prob >= 0.5 else "ham"
            model_name = self.transformer.name
        else:
            model = self.models[key]
            X = self._vectorize([cleaned])
            label = model.predict(X)[0]
            spam_prob = self._confidence(model, X)
            model_name = self.metrics.get(key, {}).get("name", key)
        keywords = self._extract_suspicious(text)
        # Threat level mapping
        if spam_prob >= 0.85:
            threat = "Critical"
        elif spam_prob >= 0.65:
            threat = "High"
        elif spam_prob >= 0.4:
            threat = "Medium"
        elif spam_prob >= 0.2:
            threat = "Low"
        else:
            threat = "Safe"

        recommendation = (
            "Do NOT click any links or share personal data. Report this message."
            if label == "spam"
            else "Message appears legitimate. Stay vigilant for unexpected requests."
        )

        return {
            "label": "phishing" if label == "spam" else "genuine",
            "raw_label": label,
            "model_used": key,
            "model_name": model_name,
            "confidence": round(spam_prob * 100, 2),
            "genuine_score": round((1 - spam_prob) * 100, 2),
            "threat_level": threat,
            "suspicious_keywords": keywords,
            "recommendation": recommendation,
            "cleaned_text": cleaned,
            "detected_language": detect_language(text),
        }

    def all_predictions(self, text: str) -> Dict:
        results = {}
        for key in self.available_models:
            results[key] = self.predict(text, key)
        return results

    def get_metrics(self) -> Dict:
        return self.metrics
