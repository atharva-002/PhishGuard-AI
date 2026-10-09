"""E-mail phishing scanner.

Three ways in:
  1. Paste subject / sender / body            POST /api/email/analyze
  2. Upload a raw .eml file                   POST /api/email/analyze-eml
  3. Connect Gmail or Outlook (OAuth, read-only) and scan the inbox
       GET  /api/email/providers
       GET  /api/email/{provider}/connect     -> URL to the provider's consent screen
       GET  /api/email/{provider}/callback    <- provider redirects here
       POST /api/email/{provider}/scan
       POST /api/email/{provider}/disconnect
       GET  /api/email/results                 recent inbox scan results

The verdict combines the ML model's score on the text with header and link
checks that the SMS-trained model cannot see (sender spoofing, Reply-To
mismatch, SPF/DKIM/DMARC failures, deceptive links, risky attachments).

Gmail needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, Outlook needs
MS_CLIENT_ID / MS_CLIENT_SECRET, both need PUBLIC_BACKEND_URL and FRONTEND_URL
in backend/.env. See docs/EMAIL_SETUP.md.
"""
import asyncio
import base64
import email
import logging
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timezone
from email import policy
from email.utils import getaddresses, parseaddr
from html.parser import HTMLParser
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ml.text_utils import normalize_url

log = logging.getLogger("email_scan")

# ----------------------------------------------------------------- heuristics
BRANDS = {
    # display-name keyword -> legitimate sending domains
    "sbi": ["sbi.co.in", "onlinesbi.sbi", "sbicard.com"],
    "state bank": ["sbi.co.in", "onlinesbi.sbi"],
    "hdfc": ["hdfcbank.com", "hdfcbank.net", "hdfclife.com"],
    "icici": ["icicibank.com", "icicidirect.com"],
    "axis": ["axisbank.com"],
    "kotak": ["kotak.com"],
    "paytm": ["paytm.com"],
    "phonepe": ["phonepe.com"],
    "amazon": ["amazon.in", "amazon.com"],
    "flipkart": ["flipkart.com"],
    "netflix": ["netflix.com"],
    "paypal": ["paypal.com"],
    "microsoft": ["microsoft.com", "office.com", "outlook.com"],
    "google": ["google.com", "accounts.google.com"],
    "apple": ["apple.com", "icloud.com"],
    "income tax": ["incometax.gov.in", "gov.in"],
    "uidai": ["uidai.gov.in"],
    "aadhaar": ["uidai.gov.in"],
    "irctc": ["irctc.co.in"],
    "india post": ["indiapost.gov.in"],
    "fedex": ["fedex.com"],
    "dhl": ["dhl.com"],
}
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "rb.gy", "cutt.ly", "shorturl.at", "ow.ly", "t.ly"}
RISKY_TLDS = (".xyz", ".top", ".club", ".online", ".site", ".live", ".icu", ".buzz", ".rest", ".info", ".ru", ".tk")
RISKY_ATTACHMENTS = (".exe", ".scr", ".js", ".vbs", ".bat", ".cmd", ".jar", ".apk", ".iso", ".img",
                     ".html", ".htm", ".hta", ".lnk", ".msi", ".docm", ".xlsm")
IP_HOST = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


class _HTMLText(HTMLParser):
    """Collect visible text and (anchor text, href) pairs from HTML mail."""

    def __init__(self):
        super().__init__()
        self.parts: List[str] = []
        self.links: List[Tuple[str, str]] = []
        self._href: Optional[str] = None
        self._anchor: List[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._anchor = []
        if tag in ("br", "p", "div", "tr", "li"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1
        if tag == "a" and self._href:
            self.links.append(("".join(self._anchor).strip(), self._href))
            self._href = None

    def handle_data(self, data):
        if self._skip:
            return
        self.parts.append(data)
        if self._href is not None:
            self._anchor.append(data)


def html_to_text(html: str) -> Tuple[str, List[Tuple[str, str]]]:
    p = _HTMLText()
    try:
        p.feed(html or "")
    except Exception:
        pass
    text = re.sub(r"[ \t]+", " ", "".join(p.parts))
    return re.sub(r"\n\s*\n+", "\n\n", text).strip(), p.links


def _domain(addr: str) -> str:
    return addr.rsplit("@", 1)[-1].lower().strip(">").strip() if "@" in addr else ""


def _same_org(a: str, b: str) -> bool:
    """Loose check that two domains belong to the same organisation."""
    if not a or not b:
        return True
    a2 = ".".join(a.split(".")[-2:])
    b2 = ".".join(b.split(".")[-2:])
    return a == b or a.endswith("." + b) or b.endswith("." + a) or a2 == b2


def header_link_signals(sender: str, reply_to: str, auth_results: str,
                        links: List[Tuple[str, str]], attachments: List[str]) -> List[Dict]:
    signals: List[Dict] = []
    name, addr = parseaddr(sender or "")
    from_dom = _domain(addr)
    lowered_name = (name or "").lower()

    for kw, legit in BRANDS.items():
        if kw in lowered_name and from_dom and not any(_same_org(from_dom, d) for d in legit):
            signals.append({"id": "brand_spoof", "severity": "high", "weight": 0.55,
                            "detail": f'Display name says "{name}" but the mail comes from {from_dom}'})
            break

    if reply_to:
        _, rt_addr = parseaddr(reply_to)
        rt_dom = _domain(rt_addr)
        if rt_dom and from_dom and not _same_org(rt_dom, from_dom):
            signals.append({"id": "reply_to_mismatch", "severity": "medium", "weight": 0.3,
                            "detail": f"Replies go to {rt_dom}, not the sender's domain {from_dom}"})

    ar = (auth_results or "").lower()
    for mech in ("spf", "dkim", "dmarc"):
        if re.search(rf"\b{mech}=(fail|softfail|permerror)", ar):
            signals.append({"id": f"{mech}_fail", "severity": "high" if mech == "dmarc" else "medium",
                            "weight": 0.45 if mech == "dmarc" else 0.25,
                            "detail": f"{mech.upper()} check failed: the sender may be forged"})

    seen_hosts = set()
    for anchor, href in links:
        if not href or href.startswith(("mailto:", "#", "tel:")):
            continue
        host = normalize_url(href)["domain"]
        if not host or host in seen_hosts:
            continue
        seen_hosts.add(host)
        shown = re.search(r"(?:https?://)?(?:www\.)?([\w-]+(?:\.[\w-]+)+)", anchor or "")
        if shown and "." in shown.group(1):
            shown_host = shown.group(1).lower()
            if not _same_org(shown_host, host):
                signals.append({"id": "deceptive_link", "severity": "high", "weight": 0.5,
                                "detail": f'Link text shows "{shown_host}" but opens {host}'})
        if IP_HOST.match(host):
            signals.append({"id": "ip_link", "severity": "high", "weight": 0.4,
                            "detail": f"Link points to a bare IP address ({host})"})
        if host in SHORTENERS:
            signals.append({"id": "shortened_link", "severity": "medium", "weight": 0.2,
                            "detail": f"Shortened link hides the real destination ({host})"})
        if "xn--" in host:
            signals.append({"id": "punycode_link", "severity": "high", "weight": 0.4,
                            "detail": f"Look-alike (punycode) domain: {host}"})
        if host.endswith(RISKY_TLDS):
            signals.append({"id": "risky_tld", "severity": "low", "weight": 0.15,
                            "detail": f"Link uses a TLD often abused by scammers ({host})"})

    for fn in attachments:
        if fn and fn.lower().endswith(RISKY_ATTACHMENTS):
            signals.append({"id": "risky_attachment", "severity": "high", "weight": 0.5,
                            "detail": f"Risky attachment type: {fn}"})
    return signals


def combine(model_prob: float, signals: List[Dict], intel_hits: List[Dict]) -> float:
    """P(phish) = 1 - (1 - p_model) * prod(1 - w_signal)."""
    keep = 1.0 - model_prob
    for s in signals:
        keep *= 1.0 - s["weight"]
    if any(h.get("status") == "confirmed" for h in intel_hits):
        keep *= 0.05
    elif intel_hits:
        keep *= 0.6
    return 1.0 - keep


def threat_level(p: float) -> str:
    return ("Critical" if p >= 0.85 else "High" if p >= 0.65 else
            "Medium" if p >= 0.4 else "Low" if p >= 0.2 else "Safe")


def parse_eml(raw: bytes) -> Dict:
    msg = email.message_from_bytes(raw, policy=policy.default)
    text_parts, html_parts, attachments = [], [], []
    for part in msg.walk():
        if part.is_multipart():
            continue
        fn = part.get_filename()
        if fn or part.get_content_disposition() == "attachment":
            attachments.append(fn or "unnamed")
            continue
        ctype = part.get_content_type()
        try:
            content = part.get_content()
        except Exception:
            content = (part.get_payload(decode=True) or b"").decode("utf-8", "ignore")
        if ctype == "text/plain":
            text_parts.append(content)
        elif ctype == "text/html":
            html_parts.append(content)
    links: List[Tuple[str, str]] = []
    body = "\n".join(text_parts)
    if html_parts:
        html_text, links = html_to_text("\n".join(html_parts))
        if not body.strip():
            body = html_text
    return {
        "subject": str(msg.get("Subject", "")),
        "sender": str(msg.get("From", "")),
        "reply_to": str(msg.get("Reply-To", "") or ""),
        "to": ", ".join(a for _, a in getaddresses([str(msg.get("To", ""))])),
        "date": str(msg.get("Date", "")),
        "auth_results": " ".join(str(h) for h in (msg.get_all("Authentication-Results") or [])),
        "body": body,
        "links": links,
        "attachments": attachments,
    }


class EmailAnalyzer:
    def __init__(self, predictor, intel):
        self.predictor = predictor
        self.intel = intel

    async def analyze(self, *, subject="", sender="", reply_to="", body="", auth_results="",
                      links=None, attachments=None, html=None) -> Dict:
        links = list(links or [])
        if html:
            html_text, html_links = html_to_text(html)
            links += html_links
            body = body or html_text
        # plain-text links
        for m in re.findall(r"https?://\S+", body or ""):
            links.append((m, m))
        text = f"{subject}\n{body}".strip()
        if not text:
            raise HTTPException(400, "Empty e-mail")
        if not self.predictor.ready:
            raise HTTPException(503, "Model is still loading")
        model = self.predictor.predict(text[:10000])
        p_model = model["confidence"] / 100.0
        signals = header_link_signals(sender, reply_to, auth_results, links, attachments or [])
        hits = await self.intel.match_text(text + " " + " ".join(h for _, h in links)) if self.intel else []
        p = combine(p_model, signals, hits)
        label = "phishing" if p >= 0.5 else "genuine"
        return {
            "label": label,
            "confidence": round(p * 100, 2),
            "threat_level": threat_level(p),
            "model_score": model["confidence"],
            "model_used": model["model_used"],
            "signals": signals,
            "known_threats": hits,
            "suspicious_keywords": model["suspicious_keywords"],
            "detected_language": model.get("detected_language"),
            "links_checked": len({h for _, h in links}),
            "attachments": attachments or [],
            "recommendation": (
                "Treat this e-mail as phishing: don't click links, open attachments or reply. "
                "Report it to your bank or IT team."
                if label == "phishing" else
                "No strong phishing signs found. Still verify any request for money or passwords "
                "through an official channel."
            ),
            "subject": subject,
            "sender": sender,
        }


class EmailIn(BaseModel):
    subject: str = ""
    sender: str = ""
    reply_to: str = ""
    body: str = Field("", max_length=200000)
    html: Optional[str] = Field(None, max_length=500000)
    auth_results: str = ""


class ScanRequest(BaseModel):
    max_results: int = Field(20, ge=1, le=100)
    query: Optional[str] = None  # Gmail search syntax, e.g. "newer_than:7d"


# --------------------------------------------------------------- OAuth / inbox
PROVIDERS = {
    "gmail": {
        "label": "Gmail",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": "openid email https://www.googleapis.com/auth/gmail.readonly",
        "id_env": "GOOGLE_CLIENT_ID",
        "secret_env": "GOOGLE_CLIENT_SECRET",
        "extra": {"access_type": "offline", "prompt": "consent"},
    },
    "outlook": {
        "label": "Outlook",
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "scope": "offline_access openid email Mail.Read User.Read",
        "id_env": "MS_CLIENT_ID",
        "secret_env": "MS_CLIENT_SECRET",
        "extra": {"response_mode": "query"},
    },
}


def _cfg(provider: str) -> Dict:
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider (use gmail or outlook)")
    return PROVIDERS[provider]


def _redirect_uri(provider: str) -> str:
    base = os.environ.get("PUBLIC_BACKEND_URL", "http://localhost:8000").rstrip("/")
    return f"{base}/api/email/{provider}/callback"


def _configured(provider: str) -> bool:
    c = PROVIDERS[provider]
    return bool(os.environ.get(c["id_env"]) and os.environ.get(c["secret_env"]))


class InboxClient:
    """Minimal Gmail REST / Microsoft Graph client (read-only)."""

    def __init__(self, db):
        self.accounts = db.email_accounts
        self.results = db.email_scans
        self.states = db.oauth_states

    async def token(self, provider: str) -> Tuple[str, Dict]:
        acc = await self.accounts.find_one({"provider": provider}, {"_id": 0})
        if not acc:
            raise HTTPException(400, f"{PROVIDERS[provider]['label']} is not connected")
        if acc.get("expires_at", 0) - 60 > time.time():
            return acc["access_token"], acc
        if not acc.get("refresh_token"):
            raise HTTPException(401, "Session expired, please reconnect")
        c = PROVIDERS[provider]
        async with httpx.AsyncClient(timeout=20) as http:
            r = await http.post(c["token_url"], data={
                "client_id": os.environ[c["id_env"]],
                "client_secret": os.environ[c["secret_env"]],
                "refresh_token": acc["refresh_token"],
                "grant_type": "refresh_token",
            })
        if r.status_code != 200:
            raise HTTPException(401, "Could not refresh access, please reconnect")
        tok = r.json()
        upd = {"access_token": tok["access_token"], "expires_at": time.time() + int(tok.get("expires_in", 3600))}
        if tok.get("refresh_token"):
            upd["refresh_token"] = tok["refresh_token"]
        await self.accounts.update_one({"provider": provider}, {"$set": upd})
        acc.update(upd)
        return acc["access_token"], acc

    async def fetch_raw(self, provider: str, max_results: int, query: Optional[str]) -> List[Tuple[str, bytes]]:
        access, _ = await self.token(provider)
        headers = {"Authorization": f"Bearer {access}"}
        out: List[Tuple[str, bytes]] = []
        async with httpx.AsyncClient(timeout=30, headers=headers) as http:
            if provider == "gmail":
                params = {"maxResults": max_results, "q": query or "in:inbox newer_than:14d"}
                r = await http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", params=params)
                r.raise_for_status()
                for m in r.json().get("messages", []):
                    rr = await http.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{m['id']}",
                                        params={"format": "raw"})
                    if rr.status_code == 200:
                        raw = base64.urlsafe_b64decode(rr.json()["raw"] + "==")
                        out.append((m["id"], raw))
            else:
                r = await http.get("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
                                   params={"$top": max_results, "$select": "id", "$orderby": "receivedDateTime desc"})
                r.raise_for_status()
                for m in r.json().get("value", []):
                    rr = await http.get(f"https://graph.microsoft.com/v1.0/me/messages/{m['id']}/$value")
                    if rr.status_code == 200:
                        out.append((m["id"], rr.content))
        return out


def build_router(db, predictor, intel) -> APIRouter:
    router = APIRouter(prefix="/email", tags=["email"])
    analyzer = EmailAnalyzer(predictor, intel)
    inbox = InboxClient(db)
    router.analyzer = analyzer
    router.inbox = inbox

    @router.post("/analyze")
    async def analyze(req: EmailIn):
        return await analyzer.analyze(subject=req.subject, sender=req.sender, reply_to=req.reply_to,
                                      body=req.body, html=req.html, auth_results=req.auth_results)

    @router.post("/analyze-eml")
    async def analyze_eml(file: UploadFile = File(...)):
        raw = await file.read()
        if len(raw) > 15 * 1024 * 1024:
            raise HTTPException(413, "E-mail file too large (15 MB max)")
        m = parse_eml(raw)
        res = await analyzer.analyze(subject=m["subject"], sender=m["sender"], reply_to=m["reply_to"],
                                     body=m["body"], auth_results=m["auth_results"], links=m["links"],
                                     attachments=m["attachments"])
        res["date"] = m["date"]
        return res

    @router.get("/providers")
    async def providers():
        out = []
        for key, c in PROVIDERS.items():
            acc = await inbox.accounts.find_one({"provider": key}, {"_id": 0, "email": 1, "connected_at": 1})
            out.append({"id": key, "label": c["label"], "configured": _configured(key),
                        "connected": bool(acc), "account": (acc or {}).get("email"),
                        "connected_at": (acc or {}).get("connected_at")})
        return {"providers": out, "auto_scan_seconds": int(os.environ.get("EMAIL_POLL_SECONDS", "0") or 0)}

    @router.get("/{provider}/connect")
    async def connect(provider: str):
        c = _cfg(provider)
        if not _configured(provider):
            raise HTTPException(400, f"{c['label']} is not set up yet: add {c['id_env']} and "
                                     f"{c['secret_env']} to backend/.env (see docs/EMAIL_SETUP.md)")
        state = secrets.token_urlsafe(24)
        await inbox.states.insert_one({"state": state, "provider": provider, "created": time.time()})
        params = {"client_id": os.environ[c["id_env"]], "redirect_uri": _redirect_uri(provider),
                  "response_type": "code", "scope": c["scope"], "state": state, **c["extra"]}
        return {"auth_url": f"{c['auth_url']}?{urlencode(params)}"}

    @router.get("/{provider}/callback")
    async def callback(provider: str, code: Optional[str] = None, state: Optional[str] = None,
                       error: Optional[str] = None):
        c = _cfg(provider)
        front = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
        if error or not code:
            return RedirectResponse(f"{front}/dashboard/email?error={error or 'cancelled'}")
        st = await inbox.states.find_one_and_delete({"state": state, "provider": provider})
        if not st or time.time() - st["created"] > 900:
            return RedirectResponse(f"{front}/dashboard/email?error=invalid_state")
        async with httpx.AsyncClient(timeout=20) as http:
            r = await http.post(c["token_url"], data={
                "client_id": os.environ[c["id_env"]], "client_secret": os.environ[c["secret_env"]],
                "code": code, "redirect_uri": _redirect_uri(provider), "grant_type": "authorization_code",
            })
            if r.status_code != 200:
                log.warning("token exchange failed: %s", r.text[:300])
                return RedirectResponse(f"{front}/dashboard/email?error=token_exchange_failed")
            tok = r.json()
            who = None
            try:
                if provider == "gmail":
                    p = await http.get("https://gmail.googleapis.com/gmail/v1/users/me/profile",
                                       headers={"Authorization": f"Bearer {tok['access_token']}"})
                    who = p.json().get("emailAddress")
                else:
                    p = await http.get("https://graph.microsoft.com/v1.0/me",
                                       headers={"Authorization": f"Bearer {tok['access_token']}"})
                    j = p.json()
                    who = j.get("mail") or j.get("userPrincipalName")
            except Exception:
                pass
        await inbox.accounts.update_one({"provider": provider}, {"$set": {
            "provider": provider, "email": who, "access_token": tok["access_token"],
            "refresh_token": tok.get("refresh_token"),
            "expires_at": time.time() + int(tok.get("expires_in", 3600)),
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }}, upsert=True)
        return RedirectResponse(f"{front}/dashboard/email?connected={provider}")

    async def scan_inbox(provider: str, max_results: int = 20, query: Optional[str] = None) -> List[Dict]:
        try:
            raws = await inbox.fetch_raw(provider, max_results, query)
        except httpx.HTTPStatusError as e:
            raise HTTPException(502, f"{PROVIDERS[provider]['label']} API error: {e.response.status_code}")
        results = []
        for msg_id, raw in raws:
            cached = await inbox.results.find_one({"provider": provider, "message_id": msg_id}, {"_id": 0})
            if cached:
                results.append(cached)
                continue
            m = parse_eml(raw)
            try:
                res = await analyzer.analyze(subject=m["subject"], sender=m["sender"], reply_to=m["reply_to"],
                                             body=m["body"], auth_results=m["auth_results"],
                                             links=m["links"], attachments=m["attachments"])
            except HTTPException:
                continue
            doc = {"id": uuid.uuid4().hex[:10], "provider": provider, "message_id": msg_id,
                   "date": m["date"], "scanned_at": datetime.now(timezone.utc).isoformat(),
                   **{k: res[k] for k in ("label", "confidence", "threat_level", "subject", "sender",
                                          "signals", "known_threats", "model_score", "recommendation")}}
            await inbox.results.insert_one(dict(doc))
            results.append(doc)
        return results

    router.scan_inbox = scan_inbox

    @router.post("/{provider}/scan")
    async def scan(provider: str, req: ScanRequest):
        _cfg(provider)
        results = await scan_inbox(provider, req.max_results, req.query)
        flagged = [r for r in results if r["label"] == "phishing"]
        return {"provider": provider, "scanned": len(results), "flagged": len(flagged), "results": results}

    @router.post("/{provider}/disconnect")
    async def disconnect(provider: str):
        _cfg(provider)
        await inbox.accounts.delete_one({"provider": provider})
        return {"disconnected": provider}

    @router.get("/results")
    async def results(limit: int = Query(50, ge=1, le=500), only_flagged: bool = False):
        filt = {"label": "phishing"} if only_flagged else {}
        items = await inbox.results.find(filt, {"_id": 0}).sort("scanned_at", -1).limit(limit).to_list(limit)
        return {"items": items}

    return router


async def poll_inboxes_forever(router: APIRouter, db, interval: int):
    """Background task: re-scan every connected inbox every `interval` seconds."""
    while True:
        await asyncio.sleep(interval)
        try:
            async for acc in db.email_accounts.find({}, {"provider": 1}):
                try:
                    await router.scan_inbox(acc["provider"], 15, None)
                except Exception as e:  # keep polling even if one provider fails
                    log.warning("auto-scan %s failed: %s", acc.get("provider"), e)
        except Exception as e:
            log.warning("auto-scan loop error: %s", e)
