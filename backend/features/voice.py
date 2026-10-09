"""Voice phishing (vishing) detection.

  POST /api/voice/analyze             audio file (wav/mp3/m4a/ogg/webm) -> transcript + verdict
  POST /api/voice/analyze-transcript  text you already have            -> verdict
  GET  /api/voice/status              is speech-to-text available?

Speech-to-text uses faster-whisper (OpenAI Whisper, CPU-friendly), which
handles English, Hindi, Marathi, Tamil, Bengali, Telugu and Gujarati. It is an
optional dependency: pip install -r requirements-voice.txt. The first call
downloads the model (WHISPER_MODEL, default "small", ~460 MB).

The verdict combines:
  * the text classifier's score on the transcript,
  * vishing "cues" (OTP/PIN requests, remote-access apps, fake police or
    "digital arrest", secrecy and urgency), in all seven languages,
  * simple delivery features from the timestamps: speaking rate, how much of
    the call is one long uninterrupted monologue, and silence.
"""
import asyncio
import logging
import os
import re
import tempfile
from typing import Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

log = logging.getLogger("voice")

# cue id -> (weight, label, patterns)
CUES: Dict[str, Dict] = {
    "otp_request": {
        "weight": 0.5, "label": "Asks for OTP / PIN / CVV",
        "patterns": [r"\botp\b", r"\bone[- ]time password", r"\bcvv\b", r"\bpin\b", r"\bupi pin",
                     r"ओटीपी", r"पिन", r"ओ टी पी", r"ওটিপি", r"ஓடிபி", r"ఓటీపీ", r"ઓટીપી", r"कोड बताइए", r"कोड सांगा"],
    },
    "remote_access": {
        "weight": 0.55, "label": "Asks you to install a screen-sharing app",
        "patterns": [r"any ?desk", r"team ?viewer", r"quick ?support", r"rust ?desk", r"screen ?shar",
                     r"एनीडेस्क", r"ऐप डाउनलोड", r"app download", r"download (the|this) app"],
    },
    "authority_threat": {
        "weight": 0.45, "label": "Claims to be police / CBI / customs / court",
        "patterns": [r"digital arrest", r"\bcbi\b", r"\bpolice\b", r"customs", r"narcotics", r"\bed\b officer",
                     r"arrest warrant", r"court", r"cyber cell", r"trai", r"पुलिस", r"गिरफ्तार", r"डिजिटल अरेस्ट",
                     r"सीबीआई", r"पोलीस", r"অ্যারেস্ট", r"পুলিশ", r"காவல்", r"పోలీస్", r"પોલીસ"],
    },
    "account_block": {
        "weight": 0.35, "label": "Says your account / SIM / card will be blocked",
        "patterns": [r"account (will be |is |has been )?(block|blocked|suspended|closed|freeze|frozen)", r"sim (will be )?(blocked|deactivated)",
                     r"card (is |will be )?blocked", r"\bkyc\b", r"खाता बंद", r"ब्लॉक", r"केवाईसी", r"बंद हो जाएगा",
                     r"ব্লক", r"முடக்க", r"బ్లాక్", r"બ્લોક"],
    },
    "money_transfer": {
        "weight": 0.35, "label": "Asks you to pay or transfer money",
        "patterns": [r"transfer (the )?money", r"pay (a |the )?(fine|fee|charge)", r"processing fee", r"\bupi\b",
                     r"gift card", r"security deposit", r"पैसे (भेज|ट्रांसफर)", r"जुर्माना", r"फीस", r"पैसे पाठवा",
                     r"টাকা পাঠান", r"பணம் அனுப்ப", r"డబ్బు పంప", r"પૈસા મોકલ"],
    },
    "prize_refund": {
        "weight": 0.3, "label": "Prize, lottery, refund or cashback offer",
        "patterns": [r"lottery", r"you (have )?won", r"prize", r"cash ?back", r"refund", r"lucky draw",
                     r"लॉटरी", r"इनाम", r"जीत", r"रिफंड", r"লটারি", r"பரிசு", r"లాటరీ", r"લોટરી"],
    },
    "secrecy": {
        "weight": 0.3, "label": "Tells you to keep it secret / stay on the line",
        "patterns": [r"don'?t tell", r"do not tell", r"keep (this|it) (secret|confidential)", r"don'?t (hang|cut) up",
                     r"stay on the (line|call)", r"किसी को (मत|न) बताएं", r"फोन (मत|न) काट", r"कोणालाही सांगू नका"],
    },
    "urgency": {
        "weight": 0.2, "label": "Creates urgency",
        "patterns": [r"immediately", r"right now", r"within (\d+|one|two) (minutes|hours)", r"last chance", r"urgent",
                     r"तुरंत", r"अभी", r"लगेच", r"এখনই", r"உடனடியாக", r"వెంటనే", r"તરત"],
    },
    "parcel_scam": {
        "weight": 0.3, "label": "Parcel / courier with illegal items",
        "patterns": [r"parcel", r"courier", r"fedex", r"\bdhl\b", r"drugs", r"पार्सल", r"कूरियर"],
    },
}
_COMPILED = {k: [re.compile(p, re.I) for p in v["patterns"]] for k, v in CUES.items()}


def find_cues(text: str) -> List[Dict]:
    out = []
    for cid, pats in _COMPILED.items():
        hits = sorted({m.group(0) for p in pats for m in p.finditer(text or "")})
        if hits:
            out.append({"id": cid, "label": CUES[cid]["label"], "weight": CUES[cid]["weight"], "matches": hits[:6]})
    return out


def delivery_features(segments: List[Dict], duration: float) -> Dict:
    """Speaking rate, longest monologue and silence ratio from STT timestamps."""
    if not segments or duration <= 0:
        return {}
    words = sum(len(s["text"].split()) for s in segments)
    speech = sum(max(0.0, s["end"] - s["start"]) for s in segments)
    # merge segments separated by < 0.6 s into "turns"
    turns, cur = [], None
    for s in segments:
        if cur and s["start"] - cur[1] < 0.6:
            cur[1] = s["end"]
        else:
            if cur:
                turns.append(cur)
            cur = [s["start"], s["end"]]
    if cur:
        turns.append(cur)
    longest = max((e - b for b, e in turns), default=0.0)
    return {
        "duration_sec": round(duration, 1),
        "words_per_minute": round(words / (speech / 60.0), 1) if speech > 0 else 0.0,
        "speech_ratio": round(min(1.0, speech / duration), 3),
        "silence_ratio": round(max(0.0, 1 - speech / duration), 3),
        "longest_monologue_sec": round(longest, 1),
        "turns": len(turns),
    }


def delivery_weight(f: Dict) -> List[Dict]:
    """Script-like delivery: long fast monologues are common in scripted scam calls."""
    notes = []
    if not f:
        return notes
    if f.get("longest_monologue_sec", 0) >= 45:
        notes.append({"id": "long_monologue", "label": "Long uninterrupted script-like speech", "weight": 0.1})
    if f.get("words_per_minute", 0) >= 170:
        notes.append({"id": "fast_speech", "label": "Very fast speaking rate", "weight": 0.05})
    return notes


def score(model_prob: float, cues: List[Dict], delivery: List[Dict]) -> float:
    keep = 1.0 - model_prob
    for c in cues + delivery:
        keep *= 1.0 - c["weight"]
    return 1.0 - keep


def level(p: float) -> str:
    return ("Critical" if p >= 0.85 else "High" if p >= 0.65 else
            "Medium" if p >= 0.4 else "Low" if p >= 0.2 else "Safe")


class _Whisper:
    def __init__(self):
        self.model = None
        self.error: Optional[str] = None
        self.size = os.environ.get("WHISPER_MODEL", "small")
        self._lock = asyncio.Lock()
        try:
            import faster_whisper  # noqa: F401
            self.installed = True
        except ImportError:
            self.installed = False
            self.error = "faster-whisper not installed (pip install -r requirements-voice.txt)"

    async def get(self):
        if not self.installed:
            raise HTTPException(501, self.error)
        async with self._lock:
            if self.model is None:
                from faster_whisper import WhisperModel
                loop = asyncio.get_running_loop()
                self.model = await loop.run_in_executor(
                    None, lambda: WhisperModel(self.size, device="cpu", compute_type="int8"))
        return self.model

    async def transcribe(self, path: str, language: Optional[str]) -> Dict:
        model = await self.get()

        def run():
            segs, info = model.transcribe(path, language=language or None, vad_filter=True, beam_size=1)
            segs = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs]
            return segs, info

        loop = asyncio.get_running_loop()
        segs, info = await loop.run_in_executor(None, run)
        return {"segments": segs, "language": info.language,
                "language_probability": round(float(info.language_probability), 3),
                "duration": float(info.duration)}


class TranscriptIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000)


SUPPORTED = {"en", "hi", "mr", "ta", "bn", "te", "gu"}


def build_router(predictor, intel) -> APIRouter:
    router = APIRouter(prefix="/voice", tags=["voice"])
    whisper = _Whisper()

    async def verdict(transcript: str, features: Dict, extra: Dict) -> Dict:
        if not predictor.ready:
            raise HTTPException(503, "Model is still loading")
        model = predictor.predict(transcript[:10000]) if transcript.strip() else None
        p_model = (model["confidence"] / 100.0) if model else 0.0
        cues = find_cues(transcript)
        deliv = delivery_weight(features)
        hits = await intel.match_text(transcript) if intel else []
        p = score(p_model, cues, deliv)
        if any(h.get("status") == "confirmed" for h in hits):
            p = max(p, 0.95)
        label = "phishing" if p >= 0.5 else "genuine"
        return {
            "label": label,
            "confidence": round(p * 100, 2),
            "threat_level": level(p),
            "model_score": model["confidence"] if model else None,
            "cues": cues,
            "delivery": features,
            "delivery_flags": deliv,
            "known_threats": hits,
            "transcript": transcript,
            "recommendation": (
                "This call shows signs of a scam. Hang up, never share OTP/PIN or install apps a caller "
                "asks for, and report it at cybercrime.gov.in or by calling 1930."
                if label == "phishing" else
                "No strong scam signs found. Still never share OTPs, PINs or passwords on a call."
            ),
            **extra,
        }

    @router.get("/status")
    async def status():
        return {"stt_installed": whisper.installed, "stt_loaded": whisper.model is not None,
                "model_size": whisper.size, "error": whisper.error,
                "languages": sorted(SUPPORTED)}

    @router.post("/analyze-transcript")
    async def analyze_transcript(req: TranscriptIn):
        return await verdict(req.text, {}, {"source": "transcript"})

    @router.post("/analyze")
    async def analyze(file: UploadFile = File(...), language: Optional[str] = Form(None)):
        data = await file.read()
        if not data:
            raise HTTPException(400, "Empty audio file")
        if len(data) > 50 * 1024 * 1024:
            raise HTTPException(413, "Audio too large (50 MB max)")
        lang = language if language in SUPPORTED else None
        suffix = os.path.splitext(file.filename or "")[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            path = tmp.name
        try:
            stt = await whisper.transcribe(path, lang)
        except HTTPException:
            raise
        except Exception as e:
            log.exception("transcription failed")
            raise HTTPException(422, f"Could not read this audio file: {e}")
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
        transcript = " ".join(s["text"] for s in stt["segments"])
        feats = delivery_features(stt["segments"], stt["duration"])
        return await verdict(transcript, feats, {
            "source": "audio", "segments": stt["segments"], "stt_language": stt["language"],
            "stt_language_probability": stt["language_probability"],
        })

    return router
