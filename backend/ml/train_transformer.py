"""Fine-tune a multilingual transformer (XLM-RoBERTa or IndicBERT) and
benchmark it against the classical models on the SAME 80/20 split.

Needs a GPU to finish in reasonable time. Free options: Google Colab or Kaggle
(use notebooks/train_transformer_colab.ipynb). On a T4 GPU, xlm-roberta-base
takes roughly 15-25 minutes for 3 epochs on this dataset.

    pip install -r requirements-transformer.txt
    cd backend
    python -m ml.train_transformer --model xlm-roberta-base --epochs 3
    python -m ml.train_transformer --model ai4bharat/IndicBERTv2-MLM-only

Outputs:
    ml/models/transformer/           model + tokenizer (served by the API automatically)
    ml/models/metrics.json           adds a "transformer" entry with the same metrics as the other models
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                             f1_score, precision_score, recall_score)
from sklearn.model_selection import train_test_split

from .train import load_dataset

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "models" / "transformer"
METRICS = ROOT / "models" / "metrics.json"
LABELS = ["ham", "spam"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="xlm-roberta-base",
                    help="xlm-roberta-base | ai4bharat/IndicBERTv2-MLM-only | bert-base-multilingual-cased")
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--max-length", type=int, default=128)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    import torch
    from torch import nn
    from transformers import (AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding,
                              Trainer, TrainingArguments, set_seed)

    set_seed(args.seed)
    df = load_dataset()
    X, y = df["text"].tolist(), df["label"].tolist()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    # small validation slice from the training part, test set stays untouched
    X_tr, X_val, y_tr, y_val = train_test_split(X_tr, y_tr, test_size=0.1, random_state=42, stratify=y_tr)
    print(f"train={len(X_tr)} val={len(X_val)} test={len(X_te)} device={'cuda' if torch.cuda.is_available() else 'cpu'}")

    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model, num_labels=2, id2label={0: "ham", 1: "spam"}, label2id={"ham": 0, "spam": 1})

    class DS(torch.utils.data.Dataset):
        def __init__(self, texts, labels):
            self.enc = tok(texts, truncation=True, max_length=args.max_length)
            self.labels = [LABELS.index(l) for l in labels]

        def __len__(self):
            return len(self.labels)

        def __getitem__(self, i):
            item = {k: v[i] for k, v in self.enc.items()}
            item["labels"] = self.labels[i]
            return item

    train_ds, val_ds, test_ds = DS(X_tr, y_tr), DS(X_val, y_val), DS(X_te, y_te)

    # class weights for the 6.5:1 imbalance (same idea as class_weight="balanced")
    counts = np.bincount(train_ds.labels, minlength=2)
    weights = torch.tensor(len(train_ds.labels) / (2.0 * counts), dtype=torch.float)

    class WeightedTrainer(Trainer):
        def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
            labels = inputs.pop("labels")
            outputs = model(**inputs)
            loss = nn.functional.cross_entropy(outputs.logits, labels, weight=weights.to(outputs.logits.device))
            return (loss, outputs) if return_outputs else loss

    def compute_metrics(p):
        pred = p.predictions.argmax(-1)
        return {"f1": f1_score(p.label_ids, pred), "accuracy": accuracy_score(p.label_ids, pred)}

    targs = TrainingArguments(
        output_dir=str(ROOT / "models" / "_transformer_ckpt"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=64,
        learning_rate=args.lr,
        weight_decay=0.01,
        warmup_steps=int(0.06 * args.epochs * len(train_ds) / args.batch),
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        save_total_limit=1,
        fp16=torch.cuda.is_available(),
        logging_steps=50,
        report_to=[],
        seed=args.seed,
    )
    trainer = WeightedTrainer(model=model, args=targs, train_dataset=train_ds, eval_dataset=val_ds,
                              data_collator=DataCollatorWithPadding(tok), compute_metrics=compute_metrics)
    t0 = time.time()
    trainer.train()
    train_minutes = (time.time() - t0) / 60

    pred = trainer.predict(test_ds).predictions.argmax(-1)
    y_pred = [LABELS[i] for i in pred]
    m = {
        "name": f"Transformer ({args.model})",
        "accuracy": float(accuracy_score(y_te, y_pred)),
        "precision": float(precision_score(y_te, y_pred, pos_label="spam")),
        "recall": float(recall_score(y_te, y_pred, pos_label="spam")),
        "f1": float(f1_score(y_te, y_pred, pos_label="spam")),
        "confusion_matrix": confusion_matrix(y_te, y_pred, labels=LABELS).tolist(),
        "labels": LABELS,
        "report": classification_report(y_te, y_pred, output_dict=True),
        "train_minutes": round(train_minutes, 1),
    }

    # CPU latency, the setting the API runs in
    model_cpu = trainer.model.to("cpu").eval()
    sample = X_te[:100]
    t0 = time.time()
    with torch.no_grad():
        for s in sample:
            model_cpu(**tok([s], truncation=True, max_length=args.max_length, return_tensors="pt"))
    m["cpu_ms_per_message"] = round((time.time() - t0) * 1000 / len(sample), 1)
    print({k: v for k, v in m.items() if k not in ("report", "confusion_matrix")})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model_cpu.save_pretrained(OUT_DIR)
    tok.save_pretrained(OUT_DIR)
    (OUT_DIR / "phishguard_info.json").write_text(json.dumps(
        {"base_model": args.model, "max_length": args.max_length, "epochs": args.epochs, **{
            k: m[k] for k in ("accuracy", "precision", "recall", "f1", "cpu_ms_per_message")}}, indent=2))

    if METRICS.exists():
        allm = json.loads(METRICS.read_text())
        allm["transformer"] = m
        METRICS.write_text(json.dumps(allm, indent=2, default=str))
    print(f"Saved to {OUT_DIR}. Restart the API (or POST /api/admin/reload) to serve it.")


if __name__ == "__main__":
    main()
