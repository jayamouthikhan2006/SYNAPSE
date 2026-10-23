"""Layer A - ingestion helpers: language detection, offline translation stub, issue classification, routing.

Translation is an *offline stand-in* for the Bhashini adapter: it maps known complaint vocabulary from Hindi, Tamil
and Telugu to English and produces a readable gist. Swap `translate()` for the Bhashini REST client in production.
"""
import re

from ..data.knowledge import CATEGORIES, EN_GIST, GLOSSARY

KEYWORDS = {
    "fee_excess": ["excess fee", "excess fees", "extra fee", "higher fee", "more fee", "donation", "capitation", "overcharg", "development fee", "without receipt", "no receipt", "additional rs"],
    "fee_refund": ["refund", "return my fee", "return the fee", "withdrew", "cancel", "cancelled", "processing charge", "not returned"],
    "cert_withheld": ["original certificate", "original documents", "transfer certificate", "leaving certificate", "mark sheet", "original mark", "holding my", "withheld", "retain"],
    "unapproved": ["not approved", "without approval", "unapproved", "approved intake", "not on the aicte", "approval has not", "higher intake", "no approval"],
    "faculty": ["faculty", "teachers", "teaching staff", "guest teachers", "student faculty ratio"],
    "ragging": ["ragging", "raging", "ragged", "seniors", "hostel at night", "bullied", "physically harass"],
    "scholarship": ["scholarship", "stipend", "fee waiver"],
    "infra": ["laborator", "equipment", "library", "classroom", "infrastructure", "hostel fee", "mess charges", "campus does not"],
    "placement": ["placement", "package", "offers", "brochure"],
    "admission": ["management quota", "quota seats", "counselling process", "merit", "admission irregular", "sold seats"],
    "financial": ["diverted", "diversion", "misappropriat", "accounts are not", "audit", "embezzl", "funds", "trust is moving"],
    "harassment": ["threaten", "harass", "terminated", "detention", "victimis", "retaliat", "removed from hostel"],
}
URGENT = re.compile(r"suicide|self[- ]harm|attempted|hospital|died|death|sexual|physically assault", re.I)


def detect_lang(text):
    counts = {"hi": 0, "ta": 0, "te": 0, "other": 0}
    for ch in text:
        cp = ord(ch)
        if 0x0900 <= cp <= 0x097F:
            counts["hi"] += 1
        elif 0x0B80 <= cp <= 0x0BFF:
            counts["ta"] += 1
        elif 0x0C00 <= cp <= 0x0C7F:
            counts["te"] += 1
        elif cp > 0x0900 and not (0x2000 <= cp <= 0x206F):
            counts["other"] += 1
    best = max(counts, key=counts.get)
    return best if counts[best] >= 4 and best != "other" else "en"


def translate(text, lang):
    """Offline glossary translation -> (english_text, method)."""
    if lang == "en":
        return text, "none (already English)"
    hits = []
    for tok in re.findall(r"[^\s,.;:!?\"'()\-]+", text):
        if tok in GLOSSARY:
            hits.append(GLOSSARY[tok])
    seen, uniq = set(), []
    for h in hits:
        if h not in seen:
            seen.add(h)
            uniq.append(h)
    u = set(uniq)
    if "ragging" in u:
        cat = "ragging"
    elif "certificate" in u:
        cat = "cert_withheld"
    elif "fee" in u and "excess" in u:
        cat = "fee_excess"
    elif "fee" in u and "refund" in u:
        cat = "fee_refund"
    else:
        cat = classify(" ".join(uniq))[0]
    gist = EN_GIST.get(cat)
    amt = re.search(r"(?:Rs|₹)\s?([\d,]+)", text)
    if gist:
        en = gist
    elif uniq:
        en = "Complaint in a regional language mentioning: " + ", ".join(uniq) + "."
    else:
        en = "Complaint in a regional language (no known vocabulary matched; routed for manual translation)."
    if amt and gist:
        en += f" Amount mentioned: Rs {amt.group(1)}."
    return en, "offline glossary (stand-in for Bhashini translation adapter)"


def classify(text):
    t = text.lower()
    scores = {}
    for cat, words in KEYWORDS.items():
        s = sum(2 if " " in w else 1 for w in words if w in t)
        if s:
            scores[cat] = s
    if not scores:
        return "fee_excess", 0.0, []
    order = sorted(scores.items(), key=lambda kv: -kv[1])
    best = order[0][0]
    conf = min(0.99, 0.45 + 0.12 * order[0][1])
    return best, round(conf, 2), [c for c, _ in order[:3]]


def priority_for(category, text):
    p = CATEGORIES[category][1]
    if URGENT.search(text) or category == "ragging":
        return "P0"
    return p


def route(category, priority):
    home = CATEGORIES[category][2]
    return home, CATEGORIES[category][3], ("mandatory approval escalation" if priority == "P0" else None)
