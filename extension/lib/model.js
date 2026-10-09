// AUTO-COPIED from shared/model-core.js (run: node shared/sync.js)
// PhishGuard on-device model: JavaScript port of backend/ml/text_utils.clean_text
// and scikit-learn's TF-IDF (char_wb) + Logistic Regression.
// The same file is used by the mobile app and the browser extension.
// Python regex semantics are reproduced: \w = letters, numbers, underscore
// (combining marks are NOT word characters), \b is unicode-aware.

const W = "\\p{L}\\p{N}_";
const B = `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`; // Python's unicode \b
const D = "\\p{Nd}";
const INDIC = "\\u0900-\\u097F\\u0980-\\u09FF\\u0B80-\\u0BFF\\u0C00-\\u0C7F\\u0A80-\\u0AFF\\u0C80-\\u0CFF\\u0D00-\\u0D7F";

const URL_RE = new RegExp(
  `https?://\\S+|www\\.\\S+|${B}[${W}.\\-]+\\.(?:com|in|net|org|io|co|ru|info|xyz|app|me)${B}`, "giu");
const EMAIL_RE = new RegExp(`${B}[${W}.\\-]+@[${W}.\\-]+\\.[${W}]+${B}`, "gu");
const PHONE_RE = new RegExp(`${B}\\+?${D}[${D}\\s\\-]{7,}${B}`, "gu");
const CURRENCY_RE = new RegExp(`[£€$₹¥]|${B}rs\\.?\\s*${D}|${B}usd${B}|${B}inr${B}`, "giu");
const NON_WORD = new RegExp(`[^${W}\\s${INDIC}]`, "gu");

function cleanText(text) {
  if (typeof text !== "string") return "";
  let t = text.toLowerCase();
  t = t.replace(URL_RE, " __url__ ");
  t = t.replace(EMAIL_RE, " __email__ ");
  t = t.replace(PHONE_RE, " __phone__ ");
  t = t.replace(CURRENCY_RE, " __money__ ");
  t = t.replace(NON_WORD, " ");
  return t.replace(/\s+/gu, " ").trim();
}

function charWbNgrams(text, minN, maxN) {
  const out = [];
  const words = text.split(/\s+/u).filter(Boolean);
  for (const word of words) {
    const w = Array.from(" " + word + " ");
    const len = w.length;
    for (let n = minN; n <= maxN; n++) {
      let offset = 0;
      out.push(w.slice(offset, offset + n).join(""));
      while (offset + n < len) {
        offset += 1;
        out.push(w.slice(offset, offset + n).join(""));
      }
      if (offset === 0) break; // short word counted once
    }
  }
  return out;
}

const KEYWORDS = ["urgent", "verify", "account", "bank", "password", "otp", "click", "link", "winner", "prize",
  "lottery", "congratulations", "claim", "refund", "kyc", "blocked", "suspend", "expire", "reward", "free",
  "जीत", "लॉटरी", "इनाम", "बैंक", "खाता", "पासवर्ड", "तुरंत", "केवाईसी", "बँक", "जिंकले",
  "ব্যাংক", "পাসওয়ার্ড", "வங்கி", "இலவசம்", "బ్యాంక్", "ఉచితం", "બેંક", "મફત"];

function createModel(json) {
  const index = new Map();
  json.ngrams.forEach((g, i) => index.set(g, i));
  const [minN, maxN] = json.ngram_range;
  const idf = json.idf, coef = json.coef;

  function score(text, preCleaned = false) {
    const cleaned = preCleaned ? text : cleanText(text);
    const counts = new Map();
    for (const g of charWbNgrams(cleaned, minN, maxN)) {
      const i = index.get(g);
      if (i !== undefined) counts.set(i, (counts.get(i) || 0) + 1);
    }
    let norm = 0;
    const weights = [];
    for (const [i, c] of counts) {
      const v = (json.sublinear_tf ? 1 + Math.log(c) : c) * idf[i];
      weights.push([i, v]);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    let z = json.intercept;
    const contrib = [];
    for (const [i, v] of weights) {
      const c = (v / norm) * coef[i];
      z += c;
      contrib.push([json.ngrams[i], c]);
    }
    const p = 1 / (1 + Math.exp(-z));
    contrib.sort((a, b) => b[1] - a[1]);
    return { p, cleaned, top: contrib.slice(0, 8).filter((x) => x[1] > 0).map((x) => x[0].trim()) };
  }

  function predict(text) {
    const { p, cleaned, top } = score(text);
    const lower = (text || "").toLowerCase();
    const keywords = KEYWORDS.filter((k) => lower.includes(k));
    if (/https?:\/\/|www\./i.test(text || "")) keywords.push("__url__");
    const level = p >= 0.85 ? "Critical" : p >= 0.65 ? "High" : p >= 0.4 ? "Medium" : p >= 0.2 ? "Low" : "Safe";
    return {
      label: p >= 0.5 ? "phishing" : "genuine",
      confidence: Math.round(p * 10000) / 100,
      threat_level: level,
      suspicious_keywords: keywords.slice(0, 12),
      top_ngrams: top,
      cleaned_text: cleaned,
      model_used: "on_device",
    };
  }

  return { predict, score, cleanText, metrics: json.metrics || null };
}

globalThis.PhishGuardModel = { cleanText, createModel };
