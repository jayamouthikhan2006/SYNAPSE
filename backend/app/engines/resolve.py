"""E1 - Entity resolution.

Maps a messy institution mention (misspelt, abbreviated, transliterated from Tamil/Hindi/Telugu etc.) to one
AICTE institution. Signals: token-set fuzzy match (RapidFuzz) on name and aliases, a phonetic skeleton so that
spelling variants collide, an optional city/state hint, and a deterministic Indic->Latin transliteration.
"""
import re

from rapidfuzz import fuzz

from .. import db

_INDEX = {"items": []}

# ISCII-aligned offsets shared by the Devanagari/Bengali/.../Tamil/Telugu/Kannada/Malayalam blocks.
_BLOCKS = [0x0900, 0x0980, 0x0A00, 0x0A80, 0x0B00, 0x0B80, 0x0C00, 0x0C80, 0x0D00]
_V = {0x05: "a", 0x06: "aa", 0x07: "i", 0x08: "ee", 0x09: "u", 0x0A: "oo", 0x0B: "ri", 0x0E: "e", 0x0F: "e", 0x10: "ai",
      0x12: "o", 0x13: "o", 0x14: "au"}
_C = {0x15: "k", 0x16: "kh", 0x17: "g", 0x18: "gh", 0x19: "n", 0x1A: "ch", 0x1B: "chh", 0x1C: "j", 0x1D: "jh",
      0x1E: "n", 0x1F: "t", 0x20: "th", 0x21: "d", 0x22: "dh", 0x23: "n", 0x24: "t", 0x25: "th", 0x26: "d",
      0x27: "dh", 0x28: "n", 0x29: "n", 0x2A: "p", 0x2B: "ph", 0x2C: "b", 0x2D: "bh", 0x2E: "m", 0x2F: "y", 0x30: "r",
      0x31: "r", 0x32: "l", 0x33: "l", 0x34: "l", 0x35: "v", 0x36: "sh", 0x37: "sh", 0x38: "s", 0x39: "h"}
_M = {0x3E: "aa", 0x3F: "i", 0x40: "ee", 0x41: "u", 0x42: "oo", 0x43: "ri", 0x46: "e", 0x47: "e", 0x48: "ai",
      0x4A: "o", 0x4B: "o", 0x4C: "au"}
_VIRAMA = 0x4D


def transliterate(text):
    out, pending = [], False
    for ch in text:
        cp = ord(ch)
        base = next((b for b in _BLOCKS if b <= cp < b + 0x80), None)
        if base is None:
            if pending:
                out.append("a")
                pending = False
            out.append(ch)
            continue
        off = cp - base
        if off in _C:
            if pending:
                out.append("a")
            out.append(_C[off])
            pending = True
        elif off in _M:
            out.append(_M[off])
            pending = False
        elif off == _VIRAMA:
            pending = False
        elif off in _V:
            if pending:
                out.append("a")
                pending = False
            out.append(_V[off])
        elif pending:
            out.append("a")
            pending = False
    if pending:
        out.append("a")
    return "".join(out)


_STOP = {"of", "the", "and", "for", "in", "college", "institute", "institution", "university", "technology", "engineering",
         "technical", "science", "sciences", "campus", "group", "school", "management", "studies", "women", "womens",
         "deemed", "to", "be", "iit", "nit"}


def phonetic(s):
    """Consonant skeleton: collapses spelling variants (Vellore/Velloor, Techno/Tekno)."""
    s = s.lower()
    for a, b in [("ph", "f"), ("ck", "k"), ("kh", "k"), ("gh", "g"), ("sh", "s"), ("ch", "c"), ("th", "t"), ("dh", "d"),
                 ("bh", "b"), ("w", "v"), ("z", "s"), ("x", "ks"), ("q", "k"), ("c", "k"), ("y", "i")]:
        s = s.replace(a, b)
    s = re.sub(r"[^a-z ]", "", s)
    s = re.sub(r"(.)\1+", r"\1", s)
    return "".join(w[0] + re.sub(r"[aeiou]", "", w[1:]) for w in s.split())


def norm(s):
    s = transliterate(s or "")
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def _is_stop(w):
    if w in _STOP:
        return True
    return any(fuzz.ratio(w, st) >= 82 or (len(w) >= 4 and st.startswith(w[:4]) and len(st) > 4) for st in _STOP if len(st) > 4)


def distinctive(s):
    return " ".join(w for w in norm(s).split() if not _is_stop(w))


_SPOKEN = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", ["ei", "bee", "see", "dee", "ee", "ef", "jee", "aich", "ai", "jay", "kay", "el", "em", "en",
                                              "o", "pee", "kyu", "ar", "es", "tee", "yu", "vee", "double yu", "ex", "wai", "zed"]))


def spoken_forms(name):
    """'LMN Institute of Technology' -> 'elemen institute of technology' (how a voice note spells an acronym)."""
    first, _, rest = name.partition(" ")
    if 2 <= len(first) <= 5 and first.isupper() and first.isalpha():
        return ["".join(_SPOKEN[c] for c in first).replace(" ", "") + (" " + rest if rest else "")]
    return []


def build():
    items = []
    for r in db.rows("SELECT id,aicte_id,name,aliases,city,state FROM institutions"):
        names = [r["name"]] + (db.unj(r["aliases"], []) or [])
        names += [x for n in list(names) for x in spoken_forms(n)]
        items.append({"id": r["id"], "aicte_id": r["aicte_id"], "name": r["name"], "city": r["city"], "state": r["state"],
                      "forms": [{"raw": n, "norm": norm(n), "dist": distinctive(n), "ph": phonetic(norm(n))} for n in names]})
    _INDEX["items"] = items
    return len(items)


def resolve(query, city_hint=None, state_hint=None, limit=5):
    if not _INDEX["items"]:
        build()
    q = norm(query)
    qd = distinctive(query)
    qp = phonetic(q)
    cands = []
    for it in _INDEX["items"]:
        best, why = 0.0, ""
        for f in it["forms"]:
            token = fuzz.token_set_ratio(q, f["norm"])
            dist = fuzz.token_set_ratio(qd, f["dist"]) if qd and f["dist"] else 0
            ph = fuzz.token_set_ratio(qp, f["ph"])
            exact = 100.0 if q == f["norm"] else 0.0
            score = max(exact, 0.45 * token + 0.30 * dist + 0.25 * ph)
            if score > best:
                best = score
                why = f"matched '{f['raw']}' (token {token:.0f}, distinctive {dist:.0f}, phonetic {ph:.0f})"
        bonus = 0
        if city_hint and norm(city_hint) and norm(city_hint) in norm(it["city"]):
            bonus += 6
        if state_hint and norm(state_hint) == norm(it["state"]):
            bonus += 3
        if it["city"] and norm(it["city"]) in q:
            bonus += 4
        cands.append({"id": it["id"], "aicte_id": it["aicte_id"], "name": it["name"], "city": it["city"],
                      "state": it["state"], "score": round(min(100.0, best + bonus), 1), "why": why})
    cands.sort(key=lambda c: -c["score"])
    top = cands[:limit]
    margin = top[0]["score"] - top[1]["score"] if len(top) > 1 else 100
    confident = bool(top) and top[0]["score"] >= 80 and margin >= 5
    return {"query": query, "normalised": q, "candidates": top, "confident": confident,
            "decision": "auto-matched" if confident else "needs officer confirmation"}


def find_in_text(text, state_hint=None):
    """Look for an institution mention inside a long complaint: exact name/alias first, then fuzzy."""
    if not _INDEX["items"]:
        build()
    t = " " + norm(text) + " "
    best = None
    for it in _INDEX["items"]:
        for f in it["forms"]:
            n = f["norm"]
            if len(n) >= 5 and (" " + n + " ") in t:
                score = len(n)
                if best is None or score > best[0]:
                    best = (score, it)
    if best:
        return {"id": best[1]["id"], "name": best[1]["name"], "score": 100.0, "decision": "auto-matched",
                "why": "exact name/alias found in the text"}
    r = resolve(text[:240], state_hint=state_hint, limit=3)
    if not r["candidates"]:
        return None
    return {**r["candidates"][0], "decision": r["decision"]}
