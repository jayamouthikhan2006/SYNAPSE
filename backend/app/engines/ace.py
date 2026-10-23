"""E4 - Action Consistency Engine (ACE) and E5 support.

Reads the pending enforcement actions of every bureau for one institution, runs the YAML contradiction matrix
and raises a Potential Action Collision BEFORE either action executes. Deterministic: each flag cites a rule id.
"""
import yaml

from .. import db
from ..data.knowledge import ACTION_TYPES, BUREAUS, CONTRADICTION_MATRIX_YAML
from . import ledger

RULES = yaml.safe_load(CONTRADICTION_MATRIX_YAML)["rules"]
_BY_PAIR = {}
for _r in RULES:
    _BY_PAIR[frozenset(_r["pair"])] = _r

ACTIVE = ("draft", "proposed", "under_review")

# subjects that legitimately overlap (e.g. a fee complaint is also a finance matter)
RELATED = {
    "fee": {"finance"}, "finance": {"fee"}, "approval": {"faculty", "infrastructure", "admission"},
    "faculty": {"approval"}, "infrastructure": {"approval"}, "admission": {"approval", "fee"},
}


def subjects_overlap(a, b):
    if a == b or "general" in (a, b):
        return True
    return b in RELATED.get(a, set())


def rule_for(type_a, type_b):
    return _BY_PAIR.get(frozenset([type_a, type_b]))


def active_actions(institution_id, exclude_id=None):
    qs = ",".join("?" * len(ACTIVE))
    sql = f"SELECT * FROM actions WHERE institution_id=? AND status IN ({qs})"
    args = [institution_id, *ACTIVE]
    if exclude_id:
        sql += " AND id<>?"
        args.append(exclude_id)
    return db.rows(sql, args)


def check(institution_id, action_type, subject, bureau, exclude_id=None):
    """Return every collision between a (proposed) action and other bureaus' active actions."""
    hits = []
    for other in active_actions(institution_id, exclude_id):
        if other["bureau"] == bureau:
            continue
        if not subjects_overlap(subject or "general", other["subject"] or "general"):
            continue
        rule = rule_for(action_type, other["type"])
        if not rule:
            continue
        hits.append({
            "rule_id": rule["id"], "severity": rule["severity"], "why": rule["why"], "ref": rule["ref"],
            "tier": 5 if rule["severity"] == "hard" else 4,
            "other_action": {k: other[k] for k in ("id", "ref_no", "type", "bureau", "status", "proposed_date", "summary", "subject")},
        })
    hits.sort(key=lambda h: (-h["tier"], h["rule_id"]))
    return hits


def _next_alert_no():
    n = db.row("SELECT COUNT(*) AS n FROM alerts")["n"] + 42
    return f"ACE-2026-{n:04d}"


def raise_alert(action_a, action_b, hit, institution_id, actor="ACE", ts=None, commit=True):
    """Create (or return existing) alert for a pair of actions."""
    lo, hi = sorted((action_a["id"], action_b["id"]))
    ex = db.row("SELECT * FROM alerts WHERE action_a=? AND action_b=?", (lo, hi))
    if ex:
        return ex, False
    ba, bb = BUREAUS[action_a["bureau"]]["name"], BUREAUS[action_b["bureau"]]["name"]
    ta, tb = ACTION_TYPES[action_a["type"]], ACTION_TYPES[action_b["type"]]
    explanation = (f"{ba} proposes '{ta}' and {bb} proposes '{tb}' for the same institution and subject "
                   f"({action_a['subject']}). {hit['why']}")
    reco = f"Joint review by {ba} and {bb} before either action proceeds. One consolidated decision to be issued."
    aid = db.execute(
        "INSERT INTO alerts(alert_no,action_a,action_b,institution_id,rule_id,severity,status,explanation,recommendation,refs,created_at)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (_next_alert_no(), lo, hi, institution_id, hit["rule_id"], hit["severity"], "open", explanation, reco,
         db.j([hit["ref"]]), ts or ledger.now_iso()),
    )
    alert = db.row("SELECT * FROM alerts WHERE id=?", (aid,))
    ledger.append(actor, "ace.collision_flagged", alert["alert_no"],
                  {"rule": hit["rule_id"], "severity": hit["severity"], "actions": [action_a["ref_no"], action_b["ref_no"]]},
                  ts=ts, model_version="ace-rules-v1")
    return alert, True


def scan_institution(institution_id, actor="ACE"):
    """Run ACE across all active action pairs of an institution (used after seed / on demand)."""
    acts = active_actions(institution_id)
    created = []
    for i, a in enumerate(acts):
        for b in acts[i + 1:]:
            if a["bureau"] == b["bureau"] or not subjects_overlap(a["subject"] or "general", b["subject"] or "general"):
                continue
            rule = rule_for(a["type"], b["type"])
            if rule:
                hit = {"rule_id": rule["id"], "severity": rule["severity"], "why": rule["why"], "ref": rule["ref"]}
                alert, new = raise_alert(a, b, hit, institution_id, actor=actor)
                if new:
                    created.append(alert)
    return created
