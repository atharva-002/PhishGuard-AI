"""Optional transformer model (XLM-RoBERTa / IndicBERT) served next to the
classical models.

It is loaded only when a fine-tuned model exists in ml/models/transformer/
(produced by ml/train_transformer.py) AND torch + transformers are installed.
If either is missing, the API simply runs without it.
"""
import json
from pathlib import Path
from typing import List, Optional

MODEL_DIR = Path(__file__).resolve().parent / "models" / "transformer"


class TransformerPredictor:
    def __init__(self, model_dir: Path = MODEL_DIR):
        self.model_dir = Path(model_dir)
        self.ready = False
        self.error: Optional[str] = None
        self.info = {}
        self._tok = None
        self._model = None
        self._torch = None
        self._spam_idx = 1
        self._max_len = 128
        self._load()

    def _load(self):
        if not (self.model_dir / "config.json").exists():
            self.error = "No fine-tuned transformer found in ml/models/transformer/"
            return
        try:
            import torch  # noqa: WPS433 (optional dependency)
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
        except ImportError:
            self.error = "torch/transformers not installed (pip install -r requirements-transformer.txt)"
            return
        try:
            self._torch = torch
            torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
            self._tok = AutoTokenizer.from_pretrained(self.model_dir)
            self._model = AutoModelForSequenceClassification.from_pretrained(self.model_dir)
            self._model.eval()
            id2label = {int(k): v for k, v in self._model.config.id2label.items()}
            self._spam_idx = next((i for i, v in id2label.items() if str(v).lower() == "spam"), 1)
            info_p = self.model_dir / "phishguard_info.json"
            if info_p.exists():
                self.info = json.loads(info_p.read_text())
                self._max_len = int(self.info.get("max_length", 128))
            self.ready = True
            self.error = None
        except Exception as e:  # pragma: no cover - depends on local files
            self.error = f"Failed to load transformer: {e}"
            self.ready = False

    def predict_proba(self, texts: List[str]) -> List[float]:
        """Return P(spam) for each (already cleaned) text."""
        if not self.ready:
            raise RuntimeError(self.error or "transformer not ready")
        torch = self._torch
        enc = self._tok(texts, truncation=True, max_length=self._max_len, padding=True, return_tensors="pt")
        with torch.no_grad():
            logits = self._model(**enc).logits
        probs = torch.softmax(logits, dim=-1)[:, self._spam_idx]
        return [float(p) for p in probs]

    @property
    def name(self) -> str:
        base = self.info.get("base_model", "transformer")
        return f"Transformer ({base})"
