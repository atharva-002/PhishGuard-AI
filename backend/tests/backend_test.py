"""End-to-end backend tests for PhishGuard AI.

Covers: health, auth, predict, analyze, metrics, feed, stats, datasets,
roadmap, workflow.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to frontend .env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# -------------------- Health --------------------
class TestHealth:
    def test_health_ok(self, session):
        r = session.get(f"{API}/health", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["model_ready"] is True
        assert set(data["models_loaded"]) == {"logistic_regression", "naive_bayes", "svm"}


# -------------------- Auth --------------------
class TestAuth:
    def test_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "demo@phishguard.ai", "password": "demo123"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["token"].startswith("demo-")
        assert data["email"] == "demo@phishguard.ai"
        assert data["name"]

    def test_login_invalid_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "demo@phishguard.ai", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_login_invalid_email(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "nope@phishguard.ai", "password": "demo123"}, timeout=15)
        assert r.status_code == 401

    def test_login_bad_payload(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "not-an-email", "password": "x"}, timeout=15)
        assert r.status_code in (400, 422)


# -------------------- Predict --------------------
PHISH_TEXT = "URGENT: Your bank account will be suspended. Verify KYC at https://hdfc-verify.in/login"
GENUINE_TEXT = "Hi mom, can you pick me up at 6pm"


class TestPredict:
    def test_predict_phishing(self, session):
        r = session.post(f"{API}/predict", json={"text": PHISH_TEXT}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["label"] == "phishing"
        assert d["threat_level"] in ("High", "Critical", "Medium")  # acceptable upper bands
        assert isinstance(d["suspicious_keywords"], list)
        assert len(d["suspicious_keywords"]) > 0
        assert 0 <= d["confidence"] <= 100
        assert d["model_used"] in ("logistic_regression", "naive_bayes", "svm")
        assert "recommendation" in d
        assert "cleaned_text" in d

    def test_predict_genuine(self, session):
        r = session.post(f"{API}/predict", json={"text": GENUINE_TEXT}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["label"] == "genuine"
        assert d["threat_level"] in ("Safe", "Low")

    def test_predict_naive_bayes(self, session):
        r = session.post(f"{API}/predict", json={"text": PHISH_TEXT, "model": "naive_bayes"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["model_used"] == "naive_bayes"

    def test_predict_svm(self, session):
        r = session.post(f"{API}/predict", json={"text": PHISH_TEXT, "model": "svm"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["model_used"] == "svm"

    def test_predict_empty_text_validation(self, session):
        r = session.post(f"{API}/predict", json={"text": ""}, timeout=15)
        assert r.status_code in (400, 422)


# -------------------- Analyze --------------------
class TestAnalyze:
    def test_analyze_all_models(self, session):
        r = session.post(f"{API}/analyze", json={"text": PHISH_TEXT}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "models" in d
        assert set(d["models"].keys()) == {"logistic_regression", "naive_bayes", "svm"}
        for k, v in d["models"].items():
            assert v["model_used"] == k
            assert v["label"] in ("phishing", "genuine")


# -------------------- Metrics & Feed & Stats --------------------
class TestAnalytics:
    def test_model_metrics(self, session):
        r = session.get(f"{API}/models/metrics", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["ready"] is True
        for key in ("logistic_regression", "naive_bayes", "svm"):
            assert key in d["metrics"], f"missing metrics for {key}"
            m = d["metrics"][key]
            assert "confusion_matrix" in m
            cm = m["confusion_matrix"]
            assert isinstance(cm, list) and len(cm) == 2 and len(cm[0]) == 2

    def test_feed(self, session):
        r = session.get(f"{API}/feed", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "feed" in d
        assert isinstance(d["feed"], list)

    def test_stats(self, session):
        r = session.get(f"{API}/stats", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "totals" in d
        assert {"scans", "phishing", "genuine", "accuracy", "dataset_size"} <= set(d["totals"].keys())
        assert isinstance(d["languages"], list)
        assert isinstance(d["threats"], list)
        assert isinstance(d["trend"], list) and len(d["trend"]) == 7


# -------------------- Datasets / Roadmap / Workflow --------------------
class TestStatic:
    def test_datasets(self, session):
        r = session.get(f"{API}/datasets", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "datasets" in d
        assert len(d["datasets"]) == 3
        for ds in d["datasets"]:
            assert {"name", "rows", "spam", "ham", "languages", "source", "description"} <= set(ds.keys())

    def test_roadmap(self, session):
        r = session.get(f"{API}/roadmap", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) == 6
        for it in d["items"]:
            assert {"title", "desc", "icon", "quarter", "status"} <= set(it.keys())

    def test_workflow(self, session):
        r = session.get(f"{API}/workflow", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["steps"]) == 7
        for s in d["steps"]:
            assert {"id", "title", "desc", "icon"} <= set(s.keys())
