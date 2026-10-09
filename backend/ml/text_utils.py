"""Shared text normalisation and indicator extraction.

Training (train.py), serving (predictor.py), the threat-intel hub and the
on-device model export all import from here, so a message is cleaned the
same way everywhere.
"""
import re
from typing import Dict, List
from urllib.parse import urlsplit

URL_RE = re.compile(
    r"https?://\S+|www\.\S+|\b[\w.-]+\.(?:com|in|net|org|io|co|ru|info|xyz|app|me)\b", re.I
)
EMAIL_RE = re.compile(r"\b[\w.-]+@[\w.-]+\.\w+\b")
PHONE_RE = re.compile(r"\b\+?\d[\d\s\-]{7,}\b")
CURRENCY_RE = re.compile(r"[£€$₹¥]|\brs\.?\s*\d|\busd\b|\binr\b", re.I)
# Strip junk characters but keep Indic scripts.
NON_WORD = re.compile(
    r"[^\w\sऀ-ॿঀ-৿஀-௿ఀ-౿઀-૿ಀ-೿ഀ-ൿ]"
)

# Rough script ranges used for language detection.
SCRIPT_RANGES = {
    "bn": (0x0980, 0x09FF),
    "gu": (0x0A80, 0x0AFF),
    "ta": (0x0B80, 0x0BFF),
    "te": (0x0C00, 0x0C7F),
}
MARATHI_HINTS = ("आहे", "आणि", "तुमचे", "तुमच्या", "करा", "बँक", "झाले", "नाही", "मध्ये", "जिंकले")


def clean_text(text: str) -> str:
    """Normalise a message exactly as the models were trained."""
    if not isinstance(text, str):
        return ""
    t = text.lower()
    t = URL_RE.sub(" __url__ ", t)
    t = EMAIL_RE.sub(" __email__ ", t)
    t = PHONE_RE.sub(" __phone__ ", t)
    t = CURRENCY_RE.sub(" __money__ ", t)
    t = NON_WORD.sub(" ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def detect_language(text: str) -> str:
    """Cheap script-based language guess: en, hi, mr, bn, gu, ta, te."""
    counts: Dict[str, int] = {}
    deva = 0
    for ch in text or "":
        cp = ord(ch)
        if 0x0900 <= cp <= 0x097F:
            deva += 1
            continue
        for lang, (lo, hi) in SCRIPT_RANGES.items():
            if lo <= cp <= hi:
                counts[lang] = counts.get(lang, 0) + 1
                break
    if deva:
        counts["mr" if any(h in text for h in MARATHI_HINTS) else "hi"] = deva
    if not counts:
        return "en"
    return max(counts, key=counts.get)


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def normalize_url(raw: str) -> Dict[str, str]:
    """Return {'url': canonical url, 'domain': registrable-ish host}."""
    u = (raw or "").strip().rstrip(".,;:!?)\"'")
    if not re.match(r"^[a-z][a-z0-9+.-]*://", u, re.I):
        u = "http://" + u
    parts = urlsplit(u)
    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = parts.path.rstrip("/")
    canonical = host + path + (("?" + parts.query) if parts.query else "")
    return {"url": canonical, "domain": host}


def extract_indicators(text: str) -> List[Dict[str, str]]:
    """Pull URLs, domains, e-mail addresses and phone numbers out of a message."""
    found: List[Dict[str, str]] = []
    seen = set()

    def add(kind: str, value: str):
        if value and (kind, value) not in seen:
            seen.add((kind, value))
            found.append({"type": kind, "value": value})

    text = text or ""
    emails = EMAIL_RE.findall(text)
    for e in emails:
        add("email", e.lower())
    without_emails = EMAIL_RE.sub(" ", text)
    for m in URL_RE.findall(without_emails):
        n = normalize_url(m)
        if n["domain"]:
            add("url", n["url"])
            add("domain", n["domain"])
    for m in PHONE_RE.findall(without_emails):
        p = normalize_phone(m)
        if 8 <= len(p) <= 13:
            add("phone", p)
    return found
