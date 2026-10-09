"""In-process tests for the new feature APIs (no running server or MongoDB needed).

    cd backend
    pip install mongomock-motor pytest httpx
    pytest tests/test_features.py -q
"""
import os
import sys
from email.message import EmailMessage
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phishguard_test")

import motor.motor_asyncio  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient  # swap real Mongo for an in-memory one

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
from ml.text_utils import extract_indicators, detect_language  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as c:
        yield c


# ------------------------------------------------------------- text utils
def test_extract_indicators():
    found = extract_indicators("Pay now at https://www.sbi-kyc.in/login?x=1 or call +91 98765-43210, mail a@b.co")
    kinds = {(i["type"], i["value"]) for i in found}
    assert ("url", "sbi-kyc.in/login?x=1") in kinds
    assert ("domain", "sbi-kyc.in") in kinds
    assert ("phone", "9876543210") in kinds
    assert ("email", "a@b.co") in kinds


def test_detect_language():
    assert detect_language("Hello there") == "en"
    assert detect_language("आपका खाता बंद होगा") == "hi"
    assert detect_language("তোমার অ্যাকাউন্ট") == "bn"
    assert detect_language("உங்கள் வங்கி") == "ta"


# ------------------------------------------------------------- threat intel
def test_report_lookup_and_confirm(client):
    for _ in range(3):
        r = client.post("/api/threats/report", json={"value": "http://hdfc-secure-kyc.xyz/verify", "category": "kyc"})
        assert r.status_code == 200, r.text
    look = client.get("/api/threats/lookup", params={"value": "hdfc-secure-kyc.xyz/verify"}).json()
    assert look["found"] is True
    assert look["matches"][0]["status"] == "confirmed"
    assert look["matches"][0]["reports"] == 3


def test_report_from_message_extracts_indicators(client):
    r = client.post("/api/threats/report", json={
        "message": "आपका खाता बंद होगा। तुरंत कॉल करें 9123456780 या http://sbi-alert.top/kyc", "category": "bank"})
    assert r.status_code == 200, r.text
    kinds = {d["type"] for d in r.json()["saved"]}
    assert {"phone", "url", "domain"} <= kinds
    assert r.json()["model_verdict"]["label"] == "phishing"


def test_safe_domains_not_reported(client):
    r = client.post("/api/threats/report", json={"value": "google.com"})
    assert r.status_code == 400


def test_predict_flags_known_threat(client):
    # Benign-looking text, but with a link the community has confirmed
    r = client.post("/api/predict", json={"text": "hey see this http://hdfc-secure-kyc.xyz/verify"})
    assert r.status_code == 200
    body = r.json()
    assert body["known_threats"], body
    assert body["threat_level"] == "Critical"
    assert body["label"] == "phishing"


def test_vote_list_stats_export(client):
    items = client.get("/api/threats", params={"sort": "reports"}).json()["items"]
    assert items
    tid = items[0]["id"]
    assert client.post(f"/api/threats/{tid}/vote", json={"direction": "up"}).status_code == 200
    stats = client.get("/api/threats/stats").json()
    assert stats["total"] >= 3 and "trend" in stats
    csv = client.get("/api/threats/export", params={"format": "csv"})
    assert csv.status_code == 200 and "type,value" in csv.text


def test_auto_ingest_from_confident_scan(client):
    client.post("/api/predict", json={"text": "URGENT: Your SBI account is blocked. Update KYC now at http://sbi-update-kyc.ru/login or lose access"})
    look = client.get("/api/threats/lookup", params={"value": "sbi-update-kyc.ru"}).json()
    assert look["found"], "confident phishing verdicts should add their domains to the hub"
    assert "auto-detector" in look["matches"][0]["sources"]


# ------------------------------------------------------------- e-mail
def test_email_brand_spoof_and_deceptive_link(client):
    r = client.post("/api/email/analyze", json={
        "subject": "Your account access is limited",
        "sender": "HDFC Bank <alerts@hdfc-support-team.top>",
        "reply_to": "recovery@protonmail.com",
        "html": '<p>Dear customer, verify within 24 hours.</p><a href="http://45.12.9.8/login">https://netbanking.hdfcbank.com</a>',
        "auth_results": "mx.google.com; spf=fail smtp.mailfrom=hdfc-support-team.top; dmarc=fail",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    ids = {s["id"] for s in body["signals"]}
    assert {"brand_spoof", "reply_to_mismatch", "deceptive_link", "ip_link", "dmarc_fail"} <= ids
    assert body["label"] == "phishing" and body["threat_level"] == "Critical"


def test_email_genuine(client):
    r = client.post("/api/email/analyze", json={
        "subject": "Minutes from Monday's project meeting",
        "sender": "Priya <priya@college.edu>",
        "body": "Hi all, attaching the notes from Monday. Next meeting is Thursday at 4pm in lab 3. Thanks!",
    })
    assert r.status_code == 200
    assert r.json()["label"] == "genuine"


def test_eml_upload_with_attachment(client):
    msg = EmailMessage()
    msg["From"] = "Amazon <no-reply@amaz0n-refunds.info>"
    msg["To"] = "me@example.com"
    msg["Subject"] = "Refund pending: action required"
    msg.set_content("You are eligible for a refund of Rs 4,999. Open the attached form to claim.")
    msg.add_attachment(b"MZ...", maintype="application", subtype="octet-stream", filename="refund_form.exe")
    r = client.post("/api/email/analyze-eml", files={"file": ("mail.eml", msg.as_bytes(), "message/rfc822")})
    assert r.status_code == 200, r.text
    ids = {s["id"] for s in r.json()["signals"]}
    assert {"brand_spoof", "risky_attachment"} <= ids
    assert r.json()["label"] == "phishing"


def test_email_providers_not_configured(client):
    prov = client.get("/api/email/providers").json()["providers"]
    assert {p["id"] for p in prov} == {"gmail", "outlook"}
    r = client.get("/api/email/gmail/connect")
    assert r.status_code == 400 and "GOOGLE_CLIENT_ID" in r.json()["detail"]


def test_gmail_connect_url_when_configured(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    r = client.get("/api/email/gmail/connect")
    assert r.status_code == 200
    url = r.json()["auth_url"]
    assert url.startswith("https://accounts.google.com/") and "gmail.readonly" in url and "state=" in url


# ------------------------------------------------------------- voice
def test_vishing_transcript_hindi(client):
    text = ("नमस्ते मैं मुंबई पुलिस से बोल रहा हूं, आपके नाम पर एक पार्सल में ड्रग्स मिले हैं। "
            "आप डिजिटल अरेस्ट में हैं, किसी को मत बताएं और तुरंत पैसे ट्रांसफर करें।")
    r = client.post("/api/voice/analyze-transcript", json={"text": text})
    assert r.status_code == 200
    body = r.json()
    cue_ids = {c["id"] for c in body["cues"]}
    assert {"authority_threat", "secrecy", "money_transfer", "urgency", "parcel_scam"} <= cue_ids
    assert body["label"] == "phishing"


def test_vishing_transcript_english_remote_access(client):
    text = "Sir this is from your bank. Please download AnyDesk and tell me the OTP you received to stop the account block."
    body = client.post("/api/voice/analyze-transcript", json={"text": text}).json()
    assert {"remote_access", "otp_request", "account_block"} <= {c["id"] for c in body["cues"]}
    assert body["threat_level"] in ("High", "Critical")


def test_normal_call_transcript(client):
    body = client.post("/api/voice/analyze-transcript",
                       json={"text": "Hi, it's Rahul. I'm running ten minutes late, see you at the cafe."}).json()
    assert body["label"] == "genuine"


def test_voice_status(client):
    s = client.get("/api/voice/status").json()
    assert "stt_installed" in s and "hi" in s["languages"]


# ------------------------------------------------------------- misc
def test_roadmap_all_live(client):
    items = client.get("/api/roadmap").json()["items"]
    assert len(items) == 6 and all("quarter" not in i for i in items)


def test_on_device_model_served(client):
    r = client.get("/api/models/on-device")
    assert r.status_code == 200
    assert r.json()["format"] == "phishguard-on-device-v1"


def test_audio_upload_pipeline(client, monkeypatch):
    """Audio path with a stand-in for Whisper (the real model is downloaded on first use)."""
    fw = pytest.importorskip("faster_whisper")

    class Seg:
        def __init__(self, s, e, t):
            self.start, self.end, self.text = s, e, t

    class Info:
        language, language_probability, duration = "en", 0.98, 70.0

    class FakeModel:
        def __init__(self, *a, **k):
            pass

        def transcribe(self, path, **k):
            return iter([
                Seg(0, 30, "This is the cyber crime department, your Aadhaar is linked to a money laundering case."),
                Seg(30.2, 62, "You are under digital arrest. Do not tell anyone and stay on the call."),
                Seg(63, 68, "Transfer the money to the RBI verification account immediately."),
            ]), Info()

    monkeypatch.setattr(fw, "WhisperModel", FakeModel)
    r = client.post("/api/voice/analyze", files={"file": ("call.wav", b"RIFF....WAVE", "audio/wav")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "audio" and body["stt_language"] == "en"
    assert body["delivery"]["longest_monologue_sec"] >= 60
    assert {"authority_threat", "secrecy", "money_transfer"} <= {c["id"] for c in body["cues"]}
    assert body["label"] == "phishing"
