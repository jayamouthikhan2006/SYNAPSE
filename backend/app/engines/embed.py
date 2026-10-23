"""E2 support - text embeddings.

Default: TF-IDF (word + character n-grams) fitted on the live complaint corpus; runs offline with no model
download. Set SYNAPSE_EMBED=mpnet (needs sentence-transformers + HF cache) to use
paraphrase-multilingual-mpnet-base-v2, the model named in the architecture.
"""
import os

import numpy as np
from scipy.sparse import hstack, vstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .. import db

_S = {"word": None, "char": None, "matrix": None, "ids": [], "pos": {}, "backend": "tfidf", "st": None}


def build():
    rows = db.rows("SELECT id, text_en FROM complaints ORDER BY id")
    ids = [r["id"] for r in rows]
    texts = [r["text_en"] or "" for r in rows]
    if os.environ.get("SYNAPSE_EMBED") == "mpnet" and texts:
        try:
            from sentence_transformers import SentenceTransformer
            st = SentenceTransformer("sentence-transformers/paraphrase-multilingual-mpnet-base-v2")
            m = np.asarray(st.encode(texts, normalize_embeddings=True, show_progress_bar=False))
            _S.update(st=st, matrix=m, ids=ids, pos={i: k for k, i in enumerate(ids)}, backend="mpnet")
            return len(ids)
        except Exception as e:  # fall back to TF-IDF
            print("mpnet unavailable, using TF-IDF:", e)
    word = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english", lowercase=True)
    char = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, min_df=2, lowercase=True)
    fit_texts = texts or ["placeholder text"]
    w = word.fit_transform(fit_texts)
    c = char.fit_transform(fit_texts)
    m = normalize(hstack([w * 0.7, c * 0.3]).tocsr())
    _S.update(word=word, char=char, matrix=m, ids=ids, pos={i: k for k, i in enumerate(ids)}, backend="tfidf", st=None)
    return len(ids)


def backend():
    return _S["backend"]


def encode(texts):
    if _S["backend"] == "mpnet":
        return np.asarray(_S["st"].encode(texts, normalize_embeddings=True, show_progress_bar=False))
    w = _S["word"].transform(texts)
    c = _S["char"].transform(texts)
    return normalize(hstack([w * 0.7, c * 0.3]).tocsr())


def add(complaint_id, text):
    """Fold a freshly filed complaint into the live index without refitting."""
    v = encode([text])
    if _S["backend"] == "mpnet":
        _S["matrix"] = np.vstack([_S["matrix"], v]) if len(_S["ids"]) else v
    else:
        _S["matrix"] = vstack([_S["matrix"], v]).tocsr() if len(_S["ids"]) else v
    _S["pos"][complaint_id] = len(_S["ids"])
    _S["ids"].append(complaint_id)


def _dot(a, b):
    if _S["backend"] == "mpnet":
        return float(a @ b)
    return float(a.multiply(b).sum())


def sim(a, b):
    ka, kb = _S["pos"].get(a), _S["pos"].get(b)
    if ka is None or kb is None:
        return 0.0
    return _dot(_S["matrix"][ka], _S["matrix"][kb])


def dense(complaint_ids):
    ids = [c for c in complaint_ids if c in _S["pos"]]
    m = _S["matrix"][[_S["pos"][c] for c in ids]]
    return (m if _S["backend"] == "mpnet" else m.toarray()), ids
