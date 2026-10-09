"""FastAPI server for Phishing & Mishing Detection."""
import os
import logging
import uuid
import asyncio
from collections import deque, Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from ml.predictor import PhishingPredictor, MODEL_DIR
from features import threat_intel, email_scan, voice

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection (only used for storing scan history – auth is in-memory demo)
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="PhishGuard AI", version="1.0.0")
api_router = APIRouter(prefix="/api")

# In-memory live scan feed (last 50)
SCAN_FEED: deque = deque(maxlen=50)

# Load predictor – may be None until training completes
predictor = PhishingPredictor()

# Feature routers (mounted under /api further down)
threat_router = threat_intel.build_router(db, predictor)
intel = threat_router.intel
email_router = email_scan.build_router(db, predictor, intel)
voice_router = voice.build_router(predictor, intel)


# ------------------------ Models ------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    token: str
    email: str
    name: str


class PredictRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    language: Optional[str] = "auto"
    model: Optional[str] = None  # logistic_regression | naive_bayes | svm


class AnalyzeRequest(BaseModel):
    text: str
    language: Optional[str] = "auto"


# ------------------------ Routes ------------------------
@api_router.get("/")
async def root():
    return {"message": "PhishGuard AI API", "version": "1.0.0"}


@api_router.get("/health")
async def health():
    return {
        "status": "ok",
        "model_ready": predictor.ready,
        "models_loaded": list(predictor.models.keys()),
        "transformer_ready": bool(predictor.transformer and predictor.transformer.ready),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ----- Auth (demo, no DB) -----
DEMO_USERS = {
    "demo@phishguard.ai": {"password": "demo123", "name": "Demo Analyst"},
    "admin@phishguard.ai": {"password": "admin123", "name": "Admin"},
}


@api_router.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    user = DEMO_USERS.get(req.email.lower())
    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = f"demo-{uuid.uuid4().hex}"
    return LoginResponse(token=token, email=req.email, name=user["name"])


# ----- Prediction -----
@api_router.post("/predict")
async def predict(req: PredictRequest):
    if not predictor.ready:
        predictor._load()
    if not predictor.ready:
        raise HTTPException(status_code=503, detail="Model is still training. Please retry shortly.")
    result = predictor.predict(req.text, req.model)
    language = req.language if req.language and req.language != "auto" else result.get("detected_language", "auto")
    # Check links / numbers against the Threat Intel Hub, then learn from confident verdicts
    result = threat_intel.apply_intel_to_result(result, await intel.match_text(req.text))
    try:
        await intel.auto_ingest(req.text, result, language)
    except Exception as e:
        logging.warning(f"threat auto-ingest failed: {e}")
    # Save to scan feed
    entry = {
        "id": uuid.uuid4().hex[:8],
        "text_preview": req.text[:80],
        "label": result["label"],
        "confidence": result["confidence"],
        "threat_level": result["threat_level"],
        "language": language,
        "model": result["model_used"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    SCAN_FEED.appendleft(entry)
    # Async-store in Mongo (fire and forget)
    try:
        await db.scans.insert_one({**entry, "suspicious_keywords": result["suspicious_keywords"]})
    except Exception as e:
        logging.warning(f"mongo insert failed: {e}")
    return result


@api_router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """Run all 3 models and return comparison."""
    if not predictor.ready:
        raise HTTPException(status_code=503, detail="Model is still training. Please retry shortly.")
    matches = await intel.match_text(req.text)
    models = {k: threat_intel.apply_intel_to_result(v, matches) for k, v in predictor.all_predictions(req.text).items()}
    return {"text": req.text, "models": models, "known_threats": matches}


# ----- Analytics / Stats -----
@api_router.get("/models/metrics")
async def model_metrics():
    if not predictor.ready:
        return {"ready": False, "metrics": {}}
    return {"ready": True, "metrics": predictor.get_metrics()}


@api_router.get("/models/on-device")
async def on_device_model():
    """Compact model used offline by the mobile app and browser extension."""
    path = MODEL_DIR / "on_device.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Run: python -m ml.export_on_device")
    return FileResponse(path, media_type="application/json")


@api_router.get("/feed")
async def feed():
    return {"feed": list(SCAN_FEED)}


@api_router.get("/stats")
async def stats():
    feed_list = list(SCAN_FEED)
    # Pull recent scans from mongo too
    try:
        recent = await db.scans.find({}, {"_id": 0}).sort("timestamp", -1).limit(500).to_list(500)
    except Exception:
        recent = []

    all_scans = feed_list + [s for s in recent if s.get("id") not in {f.get("id") for f in feed_list}]

    total = len(all_scans)
    phishing = sum(1 for s in all_scans if s.get("label") == "phishing")
    genuine = total - phishing

    # Language-wise distribution
    lang_counter: Counter = Counter()
    threat_counter: Counter = Counter()
    for s in all_scans:
        lang_counter[s.get("language") or "auto"] += 1
        threat_counter[s.get("threat_level") or "Safe"] += 1

    # 7-day trend
    today = datetime.now(timezone.utc).date()
    trend = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        day_scans = [s for s in all_scans if s.get("timestamp", "").startswith(d.isoformat())]
        trend.append({
            "date": d.isoformat(),
            "total": len(day_scans),
            "phishing": sum(1 for s in day_scans if s.get("label") == "phishing"),
            "genuine": sum(1 for s in day_scans if s.get("label") == "genuine"),
        })

    metrics = predictor.get_metrics() if predictor.ready else {}
    ds = metrics.get("dataset", {})

    return {
        "totals": {
            "scans": total,
            "phishing": phishing,
            "genuine": genuine,
            "accuracy": metrics.get(metrics.get("best_model", "logistic_regression"), {}).get("accuracy", 0),
            "dataset_size": ds.get("total_rows", 0),
        },
        "languages": [{"name": k, "count": v} for k, v in lang_counter.most_common()],
        "threats": [{"level": k, "count": v} for k, v in threat_counter.most_common()],
        "trend": trend,
    }


@api_router.get("/datasets")
async def datasets():
    metrics = predictor.get_metrics() if predictor.ready else {}
    ds = metrics.get("dataset", {})
    return {
        "datasets": [
            {
                "name": "Merged SMS Scam Detection (Multilingual)",
                "rows": ds.get("total_rows", 0),
                "spam": ds.get("spam", 0),
                "ham": ds.get("ham", 0),
                "languages": ds.get("languages", {}),
                "source": "Multi-source aggregation (UCI + Indic + community)",
                "description": "Curated multilingual SMS/MMS dataset with binary labels and language tags.",
            },
            {
                "name": "Multilingual SMS Data",
                "rows": 7000,
                "spam": 1500,
                "ham": 5500,
                "languages": {"en": 2000, "hi": 1500, "ta": 1000, "te": 800, "bn": 700, "mr": 500, "gu": 500},
                "source": "Indic NLP Corpus",
                "description": "SMS samples curated for 7 Indian languages including English.",
            },
            {
                "name": "SMS Phishing Dataset",
                "rows": 5000,
                "spam": 2500,
                "ham": 2500,
                "languages": {"en": 5000},
                "source": "Public phishing repositories",
                "description": "Focused English smishing/phishing examples balanced 50/50.",
            },
        ]
    }


@api_router.get("/roadmap")
async def roadmap():
    t_ready = bool(predictor.transformer and predictor.transformer.ready)
    return {
        "items": [
            {"title": "Browser Extension", "desc": "Chrome & Firefox extension: scans Gmail, Outlook and Google Messages on the web, plus any selected text.", "icon": "globe", "status": "live", "route": "/dashboard/integrations"},
            {"title": "Mobile App", "desc": "Android/iOS app with an on-device model that works offline; server check when online.", "icon": "smartphone", "status": "live", "route": "/dashboard/integrations"},
            {"title": "BERT / Transformer Models", "desc": "Fine-tuning pipeline for XLM-RoBERTa / IndicBERT, served alongside the classical models.", "icon": "brain", "status": "live" if t_ready else "ready-to-train", "route": "/dashboard/integrations"},
            {"title": "Voice Phishing Detection", "desc": "Whisper speech-to-text in 7 languages + vishing cues + delivery analysis.", "icon": "mic", "status": "live", "route": "/dashboard/voice"},
            {"title": "Real-Time Email Scanning", "desc": "Gmail & Outlook inbox scanning plus .eml upload with sender, link and attachment checks.", "icon": "mail", "status": "live", "route": "/dashboard/email"},
            {"title": "Threat Intelligence Hub", "desc": "Community database of scam links, numbers and senders, checked on every scan.", "icon": "shield", "status": "live", "route": "/dashboard/threats"},
        ]
    }


@api_router.get("/workflow")
async def workflow():
    return {
        "steps": [
            {"id": 1, "title": "Input Message", "desc": "Raw multilingual SMS/email text.", "icon": "inbox"},
            {"id": 2, "title": "Text Cleaning", "desc": "Normalize URLs, emails, phones; preserve Indic scripts.", "icon": "broom"},
            {"id": 3, "title": "Tokenization", "desc": "Split into n-gram tokens across languages.", "icon": "split"},
            {"id": 4, "title": "Dedup & Filter", "desc": "Drop messages under 5 characters and exact duplicates.", "icon": "filter"},
            {"id": 5, "title": "TF-IDF Vectorization", "desc": "Word 1-2 grams (80K) + char 3-5 grams (60K) = 140K-dim sparse vectors.", "icon": "grid"},
            {"id": 6, "title": "ML Classification", "desc": "Logistic Regression / Naive Bayes / SVM ensemble.", "icon": "cpu"},
            {"id": 7, "title": "Threat Prediction", "desc": "Output label, confidence, suspicious keywords.", "icon": "shield-check"},
        ]
    }


@api_router.post("/admin/reload")
async def reload_model():
    predictor._load()
    return {"ready": predictor.ready, "models": list(predictor.models.keys())}


# Wire routers
api_router.include_router(threat_router)
api_router.include_router(email_router)
api_router.include_router(voice_router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    logger.info(f"PhishGuard API ready. Model loaded: {predictor.ready}")
    await intel.ensure_indexes()
    poll = int(os.environ.get("EMAIL_POLL_SECONDS", "0") or 0)
    if poll > 0:
        asyncio.create_task(email_scan.poll_inboxes_forever(email_router, db, poll))
        logger.info(f"Inbox auto-scan every {poll}s")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
