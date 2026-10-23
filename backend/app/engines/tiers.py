"""E3 - 5-Tier Relationship Classifier. Deterministic and rule-based; every tier lists the reasons behind it.

Tier 1  Same Institution Only      -> log
Tier 2  Potentially Related        -> notify both officers
Tier 3  Potential Duplicate        -> merge review
Tier 4  Potential Action Collision -> Coordination Room
Tier 5  Confirmed Conflict         -> mandatory joint resolution (a 'hard' ACE rule is hit)
"""
import re

from .. import db
from ..data.knowledge import CATEGORIES, KEYWORDS
from . import embed, ledger

TIER_NAMES = {1: "Same Institution Only", 2: "Potentially Related", 3: "Potential Duplicate",
              4: "Potential Action Collision", 5: "Confirmed Conflict"}
TIER_WORKFLOW = {1: "Log and monitor", 2: "Notify both officers", 3: "Merge review",
                 4: "Open Coordination Room", 5: "Mandatory joint resolution"}

DUP_SIM = 0.85          # near-verbatim text, same institution + category -> duplicate
DUP_SAME_PERSON_SIM = 0.45  # same complainant re-filing the same issue elsewhere
RELATED_SIM = 0.26      # same institution + this similar -> related
SIBLING_SIM = 0.42      # same parent body, other campus, same category -> related (repeat-violator signal)


def classify(a, b, sim):
    """a, b are complaint rows (dict). Returns (tier, reasons) or (0, []) when unrelated."""
    reasons = []
    same_inst = a["institution_id"] == b["institution_id"]
    same_cat = a["category"] == b["category"]
    if not same_inst:
        pa, pb = a.get("parent_id"), b.get("parent_id")
        if pa and pa == pb and same_cat and sim >= SIBLING_SIM:
            return 2, [f"Same management trust, different campus, same issue ({CATEGORIES[a['category']][0]})",
                       f"Text similarity {sim:.0%}"]
        return 0, []
    reasons.append("Same institution")
    if same_cat:
        reasons.append(f"Same issue type: {CATEGORIES[a['category']][0]}")
    if a["bureau"] != b["bureau"]:
        reasons.append(f"Different bureaus ({a['bureau']} and {b['bureau']}) - neither sees the other's case")
    if a.get("complainant") and a["complainant"] == b.get("complainant"):
        reasons.append("Same complainant")
    if a.get("academic_year") and a["academic_year"] == b.get("academic_year"):
        reasons.append(f"Same academic year {a['academic_year']}")
    reasons.append(f"Text similarity {sim:.0%}")
    same_person = bool(a.get("complainant")) and a["complainant"] == b.get("complainant")
    if same_cat and (sim >= DUP_SIM or (same_person and sim >= DUP_SAME_PERSON_SIM)):
        return 3, reasons
    if sim >= RELATED_SIM or (same_cat and a["bureau"] != b["bureau"] and sim >= 0.12):
        return 2, reasons
    return 1, reasons


def _complaint(cid):
    return db.row(
        "SELECT c.*, i.parent_id AS parent_id, i.name AS institution_name FROM complaints c "
        "JOIN institutions i ON i.id=c.institution_id WHERE c.id=?", (cid,))


def _pool(c):
    """Complaints that could relate to c: same institution plus sibling campuses of the same trust."""
    if c.get("parent_id"):
        return db.rows(
            "SELECT c.*, i.parent_id AS parent_id, i.name AS institution_name FROM complaints c "
            "JOIN institutions i ON i.id=c.institution_id WHERE (c.institution_id=? OR i.parent_id=?) AND c.id<>?",
            (c["institution_id"], c["parent_id"], c["id"]))
    return db.rows(
        "SELECT c.*, i.parent_id AS parent_id, i.name AS institution_name FROM complaints c "
        "JOIN institutions i ON i.id=c.institution_id WHERE c.institution_id=? AND c.id<>?",
        (c["institution_id"], c["id"]))


def _collision_map(institution_id):
    """{(complaint_a, complaint_b): tier} for complaints cited by colliding actions of one institution."""
    out = {}
    for al in db.rows("SELECT al.severity, x.complaint_ids AS ca, y.complaint_ids AS cb FROM alerts al "
                      "JOIN actions x ON x.id=al.action_a JOIN actions y ON y.id=al.action_b "
                      "WHERE al.status<>'dismissed' AND al.institution_id=?", (institution_id,)):
        tier = 5 if al["severity"] == "hard" else 4
        for a in db.unj(al["ca"], []):
            for b in db.unj(al["cb"], []):
                k = tuple(sorted((a, b)))
                out[k] = max(out.get(k, 0), tier)
    return out


def related(cid, limit=8, include_tier1=True):
    """Ranked list of complaints related to `cid`, with tier, similarity, reasons."""
    c = _complaint(cid)
    if not c:
        return []
    out = []
    cmap = _collision_map(c["institution_id"])
    for o in _pool(c):
        s = embed.sim(cid, o["id"])
        tier, reasons = classify(c, o, s)
        ct = cmap.get(tuple(sorted((cid, o["id"]))), 0)
        if ct > tier:
            tier = ct
            reasons = ["An enforcement action by one bureau collides with the other's (see ACE alert)"] + reasons
        if tier == 0 or (tier == 1 and not include_tier1):
            continue
        out.append({"id": o["id"], "ref_no": o["ref_no"], "title": CATEGORIES[o["category"]][0], "tier": tier,
                    "tier_name": TIER_NAMES[tier], "workflow": TIER_WORKFLOW[tier], "similarity": round(s, 3),
                    "reasons": reasons, "bureau": o["bureau"], "status": o["status"], "filed_at": o["filed_at"],
                    "institution_id": o["institution_id"], "institution_name": o["institution_name"],
                    "text_en": o["text_en"], "category": o["category"]})
    out.sort(key=lambda r: (-r["tier"], -r["similarity"]))
    return out[:limit]


def persist(cid):
    """Store Tier 2+ relationships for a complaint; returns the list stored."""
    stored = []
    for r in related(cid, limit=50, include_tier1=False):
        a, b = sorted((cid, r["id"]))
        db.get().execute(
            "INSERT INTO relationships(a,b,tier,score,reasons,created_at) VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(a,b) DO UPDATE SET tier=MAX(tier,excluded.tier), score=excluded.score, reasons=excluded.reasons",
            (a, b, r["tier"], r["similarity"], db.j(r["reasons"]), ledger.now_iso()))
        stored.append(r)
    db.get().commit()
    return stored


def highlights(text_a, text_b):
    """Words shared between two complaints that matter (for the side-by-side highlight)."""
    wa = set(re.findall(r"[a-z]+", text_a.lower()))
    wb = set(re.findall(r"[a-z]+", text_b.lower()))
    shared = {w for w in (wa & wb) if w in KEYWORDS or (len(w) > 6 and w not in {"because", "despite", "college", "institution"})}
    return sorted(shared)


def persist_all():
    """Fast bulk version of persist() used by the seed: one matrix product per institution/trust group."""
    import numpy as np
    conn = db.get()
    conn.execute("DELETE FROM relationships")
    cs = db.rows("SELECT c.*, i.parent_id AS parent_id FROM complaints c JOIN institutions i ON i.id=c.institution_id WHERE c.firewall_flag=0")
    by_inst, by_parent = {}, {}
    for c in cs:
        by_inst.setdefault(c["institution_id"], []).append(c)
        if c["parent_id"]:
            by_parent.setdefault(c["parent_id"], []).append(c)
    stamp = ledger.now_iso()
    rows = {}

    def sims(group):
        X, ok = embed.dense([c["id"] for c in group])
        keep = {c: k for k, c in enumerate(ok)}
        S = X @ X.T
        S = S.toarray() if hasattr(S, "toarray") else S
        return keep, np.asarray(S)

    for inst, group in by_inst.items():
        cmap = _collision_map(inst)
        keep, S = sims(group)
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if a["id"] not in keep or b["id"] not in keep:
                    continue
                s = float(S[keep[a["id"]], keep[b["id"]]])
                tier, reasons = classify(a, b, s)
                ct = cmap.get(tuple(sorted((a["id"], b["id"]))), 0)
                if ct > tier:
                    tier, reasons = ct, ["An enforcement action by one bureau collides with the other's (see ACE alert)"] + reasons
                if tier >= 2:
                    rows[tuple(sorted((a["id"], b["id"])))] = (tier, s, reasons)
    for parent, group in by_parent.items():
        if len({c["institution_id"] for c in group}) < 2:
            continue
        keep, S = sims(group)
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if a["institution_id"] == b["institution_id"] or a["category"] != b["category"]:
                    continue
                s = float(S[keep[a["id"]], keep[b["id"]]])
                tier, reasons = classify(a, b, s)
                if tier >= 2:
                    rows[tuple(sorted((a["id"], b["id"])))] = (tier, s, reasons)
    conn.executemany("INSERT OR REPLACE INTO relationships(a,b,tier,score,reasons,created_at) VALUES(?,?,?,?,?,?)",
                     [(min(k), max(k), v[0], round(v[1], 3), db.j(v[2]), stamp) for k, v in rows.items()])
    conn.commit()
    return len(rows)
