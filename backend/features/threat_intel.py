"""Threat Intelligence Hub.

A shared database of scam indicators (URLs, domains, phone numbers, e-mail
senders, SMS sender IDs). Users report them, the detector adds high-confidence
ones automatically, and every new scan is checked against the database.

Collection: threat_indicators
  {id, type, value, category, status, reports, votes_up, votes_down,
   sources[], languages[], sample, first_seen, last_seen}
"""
import csv
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ml.text_utils import (
    EMAIL_RE, clean_text, detect_language, extract_indicators,
    normalize_phone, normalize_url,
)

TYPES = ("url", "domain", "phone", "email", "sender_id")
CATEGORIES = (
    "bank", "kyc", "lottery", "job", "delivery", "loan", "investment",
    "government", "utility", "tech_support", "other",
)
AUTO_INGEST_THRESHOLD = 90.0  # % spam confidence before the detector adds indicators itself
CONFIRM_REPORTS = 3           # community reports needed before "confirmed"

# Domains that appear in scam messages but are not themselves malicious.
SAFE_DOMAINS = {
    "google.com", "gmail.com", "youtube.com", "whatsapp.com", "facebook.com",
    "instagram.com", "microsoft.com", "outlook.com", "apple.com", "amazon.in",
    "amazon.com", "onlinesbi.sbi", "sbi.co.in", "hdfcbank.com", "icicibank.com",
    "axisbank.com", "paytm.com", "phonepe.com", "npci.org.in", "gov.in", "nic.in",
    "uidai.gov.in", "incometax.gov.in", "irctc.co.in", "flipkart.com",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def guess_type(value: str) -> str:
    v = value.strip()
    if EMAIL_RE.fullmatch(v):
        return "email"
    digits = re.sub(r"[\s\-+()]", "", v)
    if digits.isdigit() and 8 <= len(digits) <= 13:
        return "phone"
    if re.fullmatch(r"[A-Za-z]{2}-[A-Za-z0-9]{3,8}", v) or re.fullmatch(r"[A-Z]{6}", v):
        return "sender_id"  # e.g. "VM-HDFCBK", "AD-SBIINB"
    if "/" in v or "?" in v or v.lower().startswith(("http", "www.")):
        return "url"
    if "." in v:
        return "domain"
    raise ValueError("Could not tell what kind of indicator this is")


def normalize(kind: str, value: str) -> str:
    value = (value or "").strip()
    if kind == "phone":
        return normalize_phone(value)
    if kind == "email":
        return value.lower()
    if kind == "url":
        return normalize_url(value)["url"]
    if kind == "domain":
        return normalize_url(value)["domain"]
    if kind == "sender_id":
        return value.upper()
    return value.lower()


def _status(doc: Dict) -> str:
    if doc.get("votes_down", 0) >= 3 and doc.get("votes_down", 0) > doc.get("votes_up", 0) * 2:
        return "false_positive"
    if doc.get("reports", 0) >= CONFIRM_REPORTS or doc.get("votes_up", 0) >= CONFIRM_REPORTS:
        return "confirmed"
    return "unverified"


class ReportRequest(BaseModel):
    value: Optional[str] = Field(None, max_length=2048, description="URL, phone, e-mail or sender ID")
    type: Optional[str] = None
    category: str = "other"
    message: Optional[str] = Field(None, max_length=10000, description="The scam message, if you have it")
    language: Optional[str] = None
    source: str = "community"


class CheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)


class VoteRequest(BaseModel):
    direction: str  # "up" (yes, it's a scam) | "down" (not a scam)


class ThreatIntel:
    """Data access used by the router and by other features (predict, email, voice)."""

    def __init__(self, db):
        self.col = db.threat_indicators

    async def ensure_indexes(self):
        try:
            await self.col.create_index([("type", 1), ("value", 1)], unique=True)
            await self.col.create_index([("last_seen", -1)])
        except Exception:
            pass  # mock DBs / limited users

    async def upsert(self, kind: str, value: str, *, category="other", source="community",
                     language=None, sample=None, count_report=True) -> Optional[Dict]:
        if kind not in TYPES:
            raise ValueError(f"type must be one of {TYPES}")
        value = normalize(kind, value)
        if not value:
            return None
        if kind == "domain" and value in SAFE_DOMAINS:
            return None
        now = _now()
        existing = await self.col.find_one({"type": kind, "value": value}, {"_id": 0})
        if existing:
            update = {"$set": {"last_seen": now}, "$addToSet": {"sources": source}}
            if count_report:
                update["$inc"] = {"reports": 1}
            if language:
                update["$addToSet"]["languages"] = language
            if category and category != "other" and existing.get("category") in (None, "other"):
                update["$set"]["category"] = category
            if sample and not existing.get("sample"):
                update["$set"]["sample"] = sample
            await self.col.update_one({"type": kind, "value": value}, update)
        else:
            await self.col.insert_one({
                "id": uuid.uuid4().hex[:12],
                "type": kind,
                "value": value,
                "category": category if category in CATEGORIES else "other",
                "reports": 1 if count_report else 0,
                "votes_up": 0,
                "votes_down": 0,
                "sources": [source],
                "languages": [language] if language else [],
                "sample": sample,
                "first_seen": now,
                "last_seen": now,
                "status": "unverified",
            })
        doc = await self.col.find_one({"type": kind, "value": value}, {"_id": 0})
        new_status = _status(doc)
        if new_status != doc.get("status"):
            await self.col.update_one({"id": doc["id"]}, {"$set": {"status": new_status}})
            doc["status"] = new_status
        return doc

    async def match_text(self, text: str) -> List[Dict]:
        """Return known indicators that appear in a piece of text."""
        indicators = extract_indicators(text)
        if not indicators:
            return []
        ors = [{"type": i["type"], "value": i["value"]} for i in indicators]
        try:
            docs = await self.col.find({"$or": ors, "status": {"$ne": "false_positive"}}, {"_id": 0}).to_list(50)
        except Exception:
            return []
        return [
            {"id": d["id"], "type": d["type"], "value": d["value"], "category": d.get("category"),
             "status": d.get("status"), "reports": d.get("reports", 0)}
            for d in docs
        ]

    async def auto_ingest(self, text: str, result: Dict, language: Optional[str] = None):
        """Called after a scan: add indicators from very confident phishing verdicts."""
        if result.get("label") != "phishing" or float(result.get("confidence", 0)) < AUTO_INGEST_THRESHOLD:
            return
        for ind in extract_indicators(text):
            if ind["type"] in ("url", "domain", "phone"):
                await self.upsert(ind["type"], ind["value"], source="auto-detector",
                                  language=language, sample=result.get("cleaned_text", "")[:200],
                                  count_report=False)


def apply_intel_to_result(result: Dict, matches: List[Dict]) -> Dict:
    """Attach database hits to a prediction and raise the threat level if needed."""
    result["known_threats"] = matches
    confirmed = [m for m in matches if m.get("status") == "confirmed"]
    if confirmed:
        result["threat_level"] = "Critical"
        result["label"] = "phishing"
        result["recommendation"] = (
            "This message contains a link or number already reported as a scam in the "
            "PhishGuard Threat Hub. Do not respond, click or call."
        )
    elif matches and result.get("threat_level") in ("Safe", "Low"):
        result["threat_level"] = "Medium"
    return result


def build_router(db, predictor) -> APIRouter:
    intel = ThreatIntel(db)
    router = APIRouter(prefix="/threats", tags=["threat-intel"])
    router.intel = intel  # exposed for server.py

    @router.post("/report")
    async def report(req: ReportRequest):
        if not req.value and not req.message:
            raise HTTPException(400, "Give a URL/phone/e-mail/sender ID, or paste the scam message")
        category = req.category if req.category in CATEGORIES else "other"
        language = req.language or (detect_language(req.message) if req.message else None)
        sample = clean_text(req.message)[:200] if req.message else None
        saved = []
        if req.value:
            try:
                kind = req.type if req.type in TYPES else guess_type(req.value)
            except ValueError as e:
                raise HTTPException(400, str(e))
            doc = await intel.upsert(kind, req.value, category=category, source=req.source,
                                     language=language, sample=sample)
            if doc:
                saved.append(doc)
        model_verdict = None
        if req.message:
            for ind in extract_indicators(req.message):
                doc = await intel.upsert(ind["type"], ind["value"], category=category,
                                         source=req.source, language=language, sample=sample)
                if doc and doc["id"] not in {s["id"] for s in saved}:
                    saved.append(doc)
            if predictor.ready:
                r = predictor.predict(req.message)
                model_verdict = {"label": r["label"], "confidence": r["confidence"]}
        if not saved:
            raise HTTPException(400, "No reportable URL, phone number, e-mail or sender ID found "
                                     "(well-known safe domains are ignored)")
        return {"saved": saved, "model_verdict": model_verdict}

    @router.get("")
    async def list_threats(
        type: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
        sort: str = Query("recent", pattern="^(recent|reports)$"),
        limit: int = Query(50, ge=1, le=500),
    ):
        filt: Dict = {}
        if type in TYPES:
            filt["type"] = type
        if category in CATEGORIES:
            filt["category"] = category
        if status:
            filt["status"] = status
        if q:
            filt["value"] = {"$regex": re.escape(q.strip().lower())}
        sort_key = [("reports", -1), ("last_seen", -1)] if sort == "reports" else [("last_seen", -1)]
        items = await intel.col.find(filt, {"_id": 0}).sort(sort_key).limit(limit).to_list(limit)
        return {"items": items, "count": len(items)}

    @router.get("/lookup")
    async def lookup(value: str = Query(..., min_length=3)):
        try:
            kind = guess_type(value)
        except ValueError as e:
            raise HTTPException(400, str(e))
        norm = normalize(kind, value)
        ors = [{"type": kind, "value": norm}]
        if kind == "url":
            ors.append({"type": "domain", "value": normalize_url(value)["domain"]})
        hits = await intel.col.find({"$or": ors}, {"_id": 0}).to_list(10)
        return {"query": value, "type": kind, "normalized": norm, "found": bool(hits), "matches": hits}

    @router.post("/check")
    async def check(req: CheckRequest):
        return {"indicators": extract_indicators(req.text), "matches": await intel.match_text(req.text)}

    @router.post("/{threat_id}/vote")
    async def vote(threat_id: str, req: VoteRequest):
        if req.direction not in ("up", "down"):
            raise HTTPException(400, "direction must be 'up' or 'down'")
        field = "votes_up" if req.direction == "up" else "votes_down"
        res = await intel.col.update_one({"id": threat_id}, {"$inc": {field: 1}})
        if not res.matched_count:
            raise HTTPException(404, "Threat not found")
        doc = await intel.col.find_one({"id": threat_id}, {"_id": 0})
        st = _status(doc)
        if st != doc.get("status"):
            await intel.col.update_one({"id": threat_id}, {"$set": {"status": st}})
            doc["status"] = st
        return doc

    @router.get("/stats")
    async def stats():
        docs = await intel.col.find({}, {"_id": 0, "type": 1, "category": 1, "status": 1,
                                         "reports": 1, "first_seen": 1, "value": 1}).to_list(20000)
        by_type: Dict[str, int] = {}
        by_cat: Dict[str, int] = {}
        by_status: Dict[str, int] = {}
        for d in docs:
            by_type[d["type"]] = by_type.get(d["type"], 0) + 1
            by_cat[d.get("category", "other")] = by_cat.get(d.get("category", "other"), 0) + 1
            by_status[d.get("status", "unverified")] = by_status.get(d.get("status", "unverified"), 0) + 1
        today = datetime.now(timezone.utc).date()
        trend = []
        for i in range(13, -1, -1):
            day = (today - timedelta(days=i)).isoformat()
            trend.append({"date": day, "new": sum(1 for d in docs if str(d.get("first_seen", "")).startswith(day))})
        top_domains = sorted((d for d in docs if d["type"] == "domain"), key=lambda d: -d.get("reports", 0))[:10]
        return {
            "total": len(docs),
            "total_reports": sum(d.get("reports", 0) for d in docs),
            "by_type": by_type,
            "by_category": by_cat,
            "by_status": by_status,
            "trend": trend,
            "top_domains": [{"value": d["value"], "reports": d.get("reports", 0)} for d in top_domains],
        }

    @router.get("/export")
    async def export(format: str = Query("json", pattern="^(json|csv)$"), status: Optional[str] = None):
        """Public feed other tools can consume."""
        filt = {"status": status} if status else {"status": {"$ne": "false_positive"}}
        items = await intel.col.find(filt, {"_id": 0, "sample": 0}).sort("last_seen", -1).to_list(20000)
        if format == "json":
            return {"generated": _now(), "count": len(items), "items": items}
        buf = io.StringIO()
        fields = ["type", "value", "category", "status", "reports", "first_seen", "last_seen"]
        w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for it in items:
            w.writerow(it)
        buf.seek(0)
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                                 headers={"Content-Disposition": "attachment; filename=phishguard-threats.csv"})

    return router
