"""Pack the files Colab needs into phishguard_colab_bundle.zip (~4 MB).

    cd backend
    python -m ml.make_colab_bundle
Upload the zip in notebooks/train_transformer_colab.ipynb.
"""
import zipfile
from pathlib import Path

ML = Path(__file__).resolve().parent
OUT = ML.parent / "phishguard_colab_bundle.zip"
FILES = ["__init__.py", "text_utils.py", "train.py", "train_transformer.py", "dataset/merged.csv", "models/metrics.json"]

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        p = ML / f
        if p.exists():
            z.write(p, f"ml/{f}")
print(f"wrote {OUT}")
