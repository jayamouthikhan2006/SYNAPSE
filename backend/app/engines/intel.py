"""Intelligence engines: E2 clustering (HDBSCAN), E7 corroboration, E8 silence anomaly + Grievance Health
Index, E9 SLA time engine, plus the institution risk score used by analytics."""
from datetime import datetime, timedelta
from statistics import median

import numpy as np
from sklearn.cluster import HDBSCAN
from sklearn.decomposition import TruncatedSVD

from .. import db
from ..data.knowledge import CATEGORIES, SLA_DAYS
from . import embed, ledger

OPEN_STATES = ("New", "Under Review", "Awaiting Institution", "Escalated", "Reopened", "Resolved - Pending Confirmation")


def parse(ts):
    return datetime.fromisoformat(ts) if ts else None


def now():
    return datetime.now().replace(microsecond=0)


# ---------------------------------------------------------------- E2 clustering + E7 corroboration ----
def _title_terms(texts, k=3):
    from sklearn.feature_extraction.text import TfidfVectorizer
    try:
        v = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=200)
        m = v.fit_transform(texts)
        scores = np.asarray(m.sum(axis=0)).ravel()
        names = v.get_feature_names_out()
        return [names[i] for i in scores.argsort()[::-1][:k]]
    except ValueError:
        return []


def corroborate(inst, category, complainants, channels):
    """E7: check an incident's allegations against AICTE's own records for that institution."""
    checks, score = [], min(55, 9 * complainants)
    checks.append({"label": f"{complainants} independent complainants", "ok": complainants >= 3})
    if inst["inspection_result"] in ("Deficiencies noted", "Adverse"):
        checks.append({"label": f"Last AICTE inspection ({inst['last_inspection']}): {inst['inspection_result']}", "ok": True})
        score += 20
    else:
        checks.append({"label": f"Last AICTE inspection: {inst['inspection_result'] or 'not on record'}", "ok": False})
    subject = CATEGORIES[category][4]
    prior = db.row("SELECT COUNT(*) n FROM actions WHERE institution_id=? AND subject=? AND status IN ('issued','under_review','proposed')",
                   (inst["id"], subject))["n"]
    if prior:
        checks.append({"label": f"{prior} enforcement action(s) already open on '{subject}'", "ok": True})
        score += 12
    else:
        checks.append({"label": "No enforcement action open on this subject yet", "ok": False})
    if channels >= 3:
        checks.append({"label": f"Reported through {channels} different channels", "ok": True})
        score += 13
    return min(100, score), checks


def rebuild_incidents(min_size=6):
    """Group complaints of each institution into systemic incidents with HDBSCAN (no preset cluster count)."""
    conn = db.get()
    conn.execute("DELETE FROM incidents")
    conn.execute("UPDATE complaints SET incident_id=NULL, campaign_flag=0")
    insts = db.rows("SELECT * FROM institutions")
    made = 0
    for inst in insts:
        cs = db.rows("SELECT id, category, text_en, complainant, channel, filed_at FROM complaints WHERE institution_id=? AND firewall_flag=0",
                     (inst["id"],))
        if len(cs) < min_size:
            continue
        X, ids = embed.dense([c["id"] for c in cs])
        if len(ids) < min_size:
            continue
        k = max(2, min(15, len(ids) - 1, X.shape[1] - 1))
        Z = TruncatedSVD(n_components=k, random_state=7).fit_transform(X)
        Z /= (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
        labels = HDBSCAN(min_cluster_size=min_size, min_samples=3).fit_predict(Z)
        by = {c["id"]: c for c in cs}
        groups = {}
        for lab in sorted(set(labels) - {-1}):
            members = [by[ids[k]] for k in range(len(ids)) if labels[k] == lab]
            times = sorted(parse(m["filed_at"]) for m in members)
            span_h = (times[-1] - times[0]).total_seconds() / 3600
            complainants = len({m["complainant"] for m in members})
            campaign = len(members) >= min_size and complainants <= 3 and span_h <= 48
            cats = [m["category"] for m in members]
            category = max(set(cats), key=cats.count)
            key = ("campaign", CATEGORIES[category][4]) if campaign else ("systemic", CATEGORIES[category][4])
            groups.setdefault(key, []).extend(members)
        for (kind, _subject), members in groups.items():
            cats = [m["category"] for m in members]
            category = max(set(cats), key=cats.count)
            complainants = len({m["complainant"] for m in members})
            times = sorted(parse(m["filed_at"]) for m in members)
            span_h = (times[-1] - times[0]).total_seconds() / 3600
            campaign = kind == "campaign"
            channels = len({m["channel"] for m in members})
            idx, checks = corroborate(inst, category, complainants, channels)
            terms = _title_terms([m["text_en"] for m in members])
            kind = "coordinated_campaign" if campaign else "systemic"
            title = (f"Coordinated complaint burst: {CATEGORIES[category][0].lower()}" if campaign
                     else f"{CATEGORIES[category][0]}: {len(members)} complaints form one systemic incident")
            iid = db.execute(
                "INSERT INTO incidents(institution_id,category,title,complaint_count,complainants,first_at,last_at,corroboration,kind,checks) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (inst["id"], category, title, len(members), complainants, times[0].isoformat(), times[-1].isoformat(),
                 0 if campaign else idx, kind, db.j({"checks": checks, "terms": terms, "span_hours": round(span_h, 1)})))
            conn.executemany("UPDATE complaints SET incident_id=?, campaign_flag=? WHERE id=?",
                             [(iid, 1 if campaign else 0, m["id"]) for m in members])
            made += 1
    conn.commit()
    return made


# ---------------------------------------------------------------- E9 SLA time engine ----------------
def sla_view(c, at=None):
    at = at or now()
    filed, due = parse(c["filed_at"]), parse(c["due_at"])
    end = parse(c["closed_at"]) or at
    total = (due - filed).total_seconds() or 1
    elapsed = (end - filed).total_seconds()
    frac = elapsed / total
    last = parse(c["last_event_at"]) or filed
    stalled_days = max(0.0, (at - last).total_seconds() / 86400)
    sla_days = SLA_DAYS.get(c["priority"], 15)
    is_open = c["status"] in OPEN_STATES
    breached = is_open and at > due
    risk = min(1.0, 0.65 * frac + 0.25 * min(1.0, stalled_days / max(1.0, sla_days * 0.5)) + 0.10 * min(1.0, c["transfers"] / 3))
    predicted = is_open and not breached and risk >= 0.70
    flags = []
    if c["transfers"] >= 3:
        flags.append("Ping-pong: transferred between bureaus 3+ times")
    if is_open and stalled_days > max(2, sla_days * 0.4):
        flags.append(f"Stalled: no activity for {stalled_days:.0f} days")
    return {"due_at": c["due_at"], "elapsed_pct": round(min(frac, 2.0) * 100), "breached": breached,
            "predicted_breach": predicted, "risk": round(risk, 2), "stalled_days": round(stalled_days, 1), "flags": flags,
            "days_left": round((due - at).total_seconds() / 86400, 1) if is_open else None}


# ---------------------------------------------------------------- E8 silence anomaly ----------------
def silence_report():
    since = (now() - timedelta(days=90)).isoformat()
    obs = {r["institution_id"]: r["n"] for r in db.rows(
        "SELECT institution_id, COUNT(*) n FROM complaints WHERE filed_at>=? AND firewall_flag=0 GROUP BY institution_id", (since,))}
    open_now = {r["institution_id"]: r["n"] for r in db.rows(
        f"SELECT institution_id, COUNT(*) n FROM complaints WHERE status IN ({','.join('?' * len(OPEN_STATES))}) GROUP BY institution_id", OPEN_STATES)}
    insts = db.rows("SELECT id,name,city,state,type,self_reported_pending FROM institutions WHERE source='demo'")
    peer = [obs.get(i["id"], 0) for i in insts if obs.get(i["id"], 0) > 0]
    peer_median = median(peer) if peer else 0
    out = []
    for i in insts:
        o, reported = obs.get(i["id"], 0), i["self_reported_pending"]
        expected = max(o, 0)
        anomalous = o >= max(6, 1.5 * peer_median) and reported <= max(1, 0.1 * o)
        if anomalous:
            out.append({"institution_id": i["id"], "name": i["name"], "city": i["city"], "state": i["state"],
                        "self_reported": reported, "observed_90d": o, "open_now": open_now.get(i["id"], 0),
                        "peer_median": peer_median,
                        "score": round(min(1.0, (o - reported) / max(o, 1)), 2),
                        "message": f"Reports {reported} pending grievances, but AICTE intake channels show {o} complaints in the last 90 days (peer median {peer_median:.0f})."})
    out.sort(key=lambda r: -r["observed_90d"])
    return out


def silence_for(institution_id):
    return next((s for s in silence_report() if s["institution_id"] == institution_id), None)


# ---------------------------------------------------------------- stats, risk, Grievance Health Index --
def institution_stats():
    """One pass of grouped SQL that every list/analytics view reuses."""
    n = now().isoformat()
    ph = ",".join("?" * len(OPEN_STATES))
    stats = {}

    def slot(i):
        return stats.setdefault(i, {"total": 0, "open": 0, "breached": 0, "closed": 0, "confirmed": 0, "reopened": 0,
                                    "actions": 0, "alerts": 0, "incidents": 0, "p0": 0})
    for r in db.rows("SELECT institution_id i, COUNT(*) n FROM complaints GROUP BY institution_id"):
        slot(r["i"])["total"] = r["n"]
    for r in db.rows(f"SELECT institution_id i, COUNT(*) n FROM complaints WHERE status IN ({ph}) GROUP BY institution_id", OPEN_STATES):
        slot(r["i"])["open"] = r["n"]
    for r in db.rows(f"SELECT institution_id i, COUNT(*) n FROM complaints WHERE status IN ({ph}) AND due_at<? GROUP BY institution_id", (*OPEN_STATES, n)):
        slot(r["i"])["breached"] = r["n"]
    for r in db.rows("SELECT institution_id i, COUNT(*) n, SUM(resolution_confirmed=1) cf FROM complaints WHERE status='Closed' GROUP BY institution_id"):
        slot(r["i"])["closed"], slot(r["i"])["confirmed"] = r["n"], r["cf"] or 0
    for r in db.rows("SELECT institution_id i, COUNT(*) n FROM complaints WHERE status='Reopened' GROUP BY institution_id"):
        slot(r["i"])["reopened"] = r["n"]
    for r in db.rows("SELECT institution_id i, COUNT(*) n FROM complaints WHERE priority='P0' GROUP BY institution_id"):
        slot(r["i"])["p0"] = r["n"]
    for r in db.rows("SELECT institution_id i, COUNT(*) n FROM actions WHERE status IN ('draft','proposed','under_review','issued') GROUP BY institution_id"):
        slot(r["i"])["actions"] = r["n"]
    for r in db.rows("SELECT institution_id i, COUNT(*) n FROM alerts WHERE status IN ('open','joint_review') GROUP BY institution_id"):
        slot(r["i"])["alerts"] = r["n"]
    for r in db.rows("SELECT institution_id i, COUNT(*) n FROM incidents WHERE kind='systemic' GROUP BY institution_id"):
        slot(r["i"])["incidents"] = r["n"]
    return stats


def risk_from(st, silent=False, trust_heat=0):
    score = (min(35, st["open"] * 1.3) + min(15, st["breached"] * 3) + min(12, st["alerts"] * 6) + min(14, st["incidents"] * 7)
             + (10 if silent else 0) + min(8, trust_heat * 2) + min(6, st["p0"] * 3))
    return round(min(100, score))


def health_index(st, silent=False):
    closed_total = st["closed"] + st["reopened"]
    res_rate = (st["confirmed"] / closed_total) if closed_total else 0.7
    breach_rate = (st["breached"] / st["open"]) if st["open"] else 0.0
    reopen_rate = (st["reopened"] / max(1, st["total"]))
    ghi = 100 * (0.35 * res_rate + 0.25 * (1 - breach_rate) + 0.15 * (1 - min(1, reopen_rate * 4))
                 + 0.15 * (1 - min(1, st["incidents"] / 3)) + 0.10 * (0 if silent else 1))
    return round(ghi)


def level(score):
    return "High" if score >= 55 else "Medium" if score >= 25 else "Low"
