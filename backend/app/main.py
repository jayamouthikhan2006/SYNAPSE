import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta

from fastapi import Body, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .data.knowledge import (ACTION_TYPES, BUREAUS, CATEGORIES, CHANNELS, SLA_DAYS, STATUSES)
from .engines import ace, embed, firewall, intake, intel, ledger, resolve, tiers

app = FastAPI(title="SYNAPSE API", version="1.0",
              description="Institutional Accountability Graph for cross-bureau case coordination (SIH26264 prototype)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROLES = {**{k: v["name"] for k, v in BUREAUS.items()}, "ADMIN": "Command Centre (all bureaus)"}
ACTION_RANK = {"withdraw_approval": 6, "hearing": 5, "penalty": 4, "show_cause": 3, "cap_intake": 3, "warning": 2, "expert_visit": 2,
               "audit": 2, "refund_order": 2, "new_course": 1, "extend_approval": 1, "close_case": 0}


@app.on_event("startup")
def startup():
    if not db.rows("SELECT id FROM institutions LIMIT 1"):
        from . import seed
        seed.build()
    embed.build()
    resolve.build()


def now_iso():
    return ledger.now_iso()


def page(items, total):
    return {"items": items, "total": total}


# ----------------------------------------------------------------------------------------- helpers
CJ = ("SELECT c.*, i.name AS institution_name, i.city AS city, i.state AS state, i.parent_id AS parent_id "
      "FROM complaints c JOIN institutions i ON i.id=c.institution_id")


def cview(c, full=False):
    c = dict(c)
    c["category_label"] = CATEGORIES[c["category"]][0]
    c["subject"] = CATEGORIES[c["category"]][4]
    c["bureau_name"] = BUREAUS[c["bureau"]]["name"]
    c["firewall_reasons"] = db.unj(c.get("firewall_reasons"), [])
    c["allegations"] = db.unj(c.get("allegations"), [])
    c["sla"] = intel.sla_view(c)
    if not full:
        c.pop("text_original", None)
    return c


def aview(a, role="ADMIN", in_alert=None):
    a = dict(a)
    a["type_label"] = ACTION_TYPES[a["type"]]
    a["bureau_name"] = BUREAUS[a["bureau"]]["name"]
    a["complaint_ids"] = db.unj(a.get("complaint_ids"), [])
    return a


def action_visible(a, role, alerted_ids):
    if role == "ADMIN" or a["bureau"] == role:
        return True
    if a["status"] in ("draft", "proposed", "under_review"):
        return a["id"] in alerted_ids
    return True


def alerted_action_ids():
    s = set()
    for r in db.rows("SELECT action_a, action_b FROM alerts WHERE status<>'dismissed'"):
        s.update((r["action_a"], r["action_b"]))
    return s


def get_complaint(cid):
    c = db.row(CJ + " WHERE c.id=?", (cid,))
    if not c:
        raise HTTPException(404, "Complaint not found")
    return c


def timeline(ref):
    out = []
    for r in db.rows("SELECT id, ts, actor, action, payload, model_version FROM ledger WHERE ref=? ORDER BY id", (ref,)):
        out.append({"ledger_id": r["id"], "ts": r["ts"], "actor": r["actor"], "action": r["action"],
                    "payload": db.unj(r["payload"], {}), "model_version": r["model_version"]})
    return out


def log(actor, action, ref, payload=None, mv=None):
    return ledger.append(actor, action, ref, payload or {}, model_version=mv)


# ----------------------------------------------------------------------------------------- meta
@app.get("/api/meta")
def meta():
    return {"bureaus": BUREAUS, "roles": ROLES, "channels": CHANNELS,
            "categories": {k: {"label": v[0], "priority": v[1], "home": v[2], "subject": v[4]} for k, v in CATEGORIES.items()},
            "action_types": ACTION_TYPES, "statuses": STATUSES, "sla_days": SLA_DAYS,
            "tiers": tiers.TIER_NAMES, "tier_workflow": tiers.TIER_WORKFLOW, "embedding": embed.backend(),
            "data_note": "Institution names are a public registry of real technical institutions. Complaints, actions and cases are simulated from published AICTE/UGC/CPGRAMS categories and rules, and are attached only to fictional composite institutions."}


@app.get("/api/counts")
def counts():
    q = lambda sql: db.row(sql)["n"]
    return {"alerts": q("SELECT COUNT(*) n FROM alerts WHERE status IN ('open','joint_review')"),
            "rooms": q("SELECT COUNT(*) n FROM rooms WHERE status='open'"),
            "quarantined": q("SELECT COUNT(*) n FROM complaints WHERE firewall_flag=1 AND status='New'")}


@app.get("/api/health")
def health():
    return {"ok": True, "time": now_iso(), "embedding": embed.backend()}


# ----------------------------------------------------------------------------------------- dashboard
@app.get("/api/dashboard")
def dashboard(period: str = "year"):
    n = datetime.now()
    since = {"month": n - timedelta(days=30), "quarter": n - timedelta(days=90), "year": n - timedelta(days=365)}.get(period, n - timedelta(days=3650))
    q = lambda s, a=(): db.row(s, a)["n"]
    open_ph = ",".join("?" * len(intel.OPEN_STATES))
    prev30 = q("SELECT COUNT(*) n FROM complaints WHERE filed_at>=? AND filed_at<?", ((n - timedelta(days=60)).isoformat(), (n - timedelta(days=30)).isoformat()))
    cur30 = q("SELECT COUNT(*) n FROM complaints WHERE filed_at>=?", ((n - timedelta(days=30)).isoformat(),))
    by_bureau = db.rows("SELECT bureau, COUNT(*) n FROM complaints WHERE filed_at>=? GROUP BY bureau ORDER BY n DESC", (since.isoformat(),))
    months = []
    for k in range(6, -1, -1):
        d = (n.replace(day=1) - timedelta(days=30 * k)).replace(day=1)
        months.append(d.strftime("%Y-%m"))
    months = sorted(set(months))[-7:]
    cm = {r["m"]: r["n"] for r in db.rows("SELECT substr(filed_at,1,7) m, COUNT(*) n FROM complaints GROUP BY m")}
    am = {r["m"]: r["n"] for r in db.rows("SELECT substr(created_at,1,7) m, COUNT(*) n FROM actions GROUP BY m")}
    trend = [{"month": datetime.strptime(m, "%Y-%m").strftime("%b"), "complaints": cm.get(m, 0), "actions": am.get(m, 0)} for m in months]
    sil = {s["institution_id"]: s for s in intel.silence_report()}
    risky = [{"id": r["id"], "name": r["name"], "city": r["city"], "risk": r["risk"], "level": r["risk_level"],
              "open": r["stats"]["open"], "alerts": r["stats"]["alerts"]}
             for r in sorted((r for r in inst_list_rows() if r["source"] == "demo"), key=lambda r: -r["risk"])[:6]]
    all_open = [dict(c) for c in db.rows(f"SELECT * FROM complaints WHERE status IN ({open_ph})", intel.OPEN_STATES)]
    sla = [intel.sla_view(c) for c in all_open]
    closed = q("SELECT COUNT(*) n FROM complaints WHERE status='Closed'")
    confirmed = q("SELECT COUNT(*) n FROM complaints WHERE status='Closed' AND resolution_confirmed=1")
    channels = db.rows("SELECT channel, COUNT(*) n FROM complaints WHERE filed_at>=? GROUP BY channel ORDER BY n DESC", (since.isoformat(),))
    recent_alerts = db.rows("SELECT a.id, a.alert_no, a.severity, a.status, a.created_at, a.rule_id, i.name AS institution_name FROM alerts a JOIN institutions i ON i.id=a.institution_id WHERE a.status IN ('open','joint_review') ORDER BY a.id DESC LIMIT 5")
    return {
        "kpis": {
            "institutions": q("SELECT COUNT(*) n FROM institutions"),
            "institutions_with_cases": q("SELECT COUNT(DISTINCT institution_id) n FROM complaints"),
            "open_complaints": len(all_open),
            "complaints_30d": cur30, "complaints_change_pct": round((cur30 - prev30) / prev30 * 100) if prev30 else 0,
            "active_actions": q("SELECT COUNT(*) n FROM actions WHERE status IN ('draft','proposed','under_review')"),
            "bureaus_with_actions": q("SELECT COUNT(DISTINCT bureau) n FROM actions WHERE status IN ('draft','proposed','under_review')"),
            "open_alerts": q("SELECT COUNT(*) n FROM alerts WHERE status IN ('open','joint_review')"),
            "rooms_open": q("SELECT COUNT(*) n FROM rooms WHERE status='open'"),
            "incidents": q("SELECT COUNT(*) n FROM incidents WHERE kind='systemic'"),
            "campaigns": q("SELECT COUNT(*) n FROM incidents WHERE kind='coordinated_campaign'"),
            "sla_breached": sum(1 for s in sla if s["breached"]), "sla_predicted": sum(1 for s in sla if s["predicted_breach"]),
            "ping_pong": sum(1 for s in sla if any("Ping-pong" in f for f in s["flags"])),
            "quarantined": q("SELECT COUNT(*) n FROM complaints WHERE firewall_flag=1"),
            "silence_anomalies": len(sil),
            "resolution_confirmed_pct": round(confirmed / closed * 100) if closed else 0,
            "total_complaints": q("SELECT COUNT(*) n FROM complaints"),
        },
        "by_bureau": [{"bureau": r["bureau"], "name": BUREAUS[r["bureau"]]["short"], "color": BUREAUS[r["bureau"]]["color"], "count": r["n"]} for r in by_bureau],
        "trend": trend,
        "channels": [{"channel": r["channel"], "label": CHANNELS[r["channel"]], "count": r["n"]} for r in channels],
        "risky": risky, "recent_alerts": recent_alerts,
        "ledger": ledger.verify(),
    }


# ----------------------------------------------------------------------------------------- institutions
def inst_list_rows():
    stats = intel.institution_stats()
    sil = {s["institution_id"]: s for s in intel.silence_report()}
    parents = {r["id"]: r for r in db.rows("SELECT * FROM parents")}
    # trust heat: how many sibling campuses carry open alerts or incidents
    heat = Counter()
    for r in db.rows("SELECT parent_id, id FROM institutions WHERE parent_id IS NOT NULL"):
        st = stats.get(r["id"])
        if st and (st["alerts"] or st["incidents"]):
            heat[r["parent_id"]] += 1
    out = []
    for r in db.rows("SELECT * FROM institutions"):
        st = stats.get(r["id"], {"total": 0, "open": 0, "breached": 0, "closed": 0, "confirmed": 0, "reopened": 0, "actions": 0, "alerts": 0, "incidents": 0, "p0": 0})
        risk = intel.risk_from(st, r["id"] in sil, max(0, heat[r["parent_id"]] - 1) if r["parent_id"] else 0)
        out.append({**r, "aliases": db.unj(r["aliases"], []), "stats": st, "risk": risk, "risk_level": intel.level(risk),
                    "silent": r["id"] in sil, "parent_name": parents[r["parent_id"]]["name"] if r["parent_id"] else None,
                    "health": intel.health_index(st, r["id"] in sil)})
    return out


@app.get("/api/institutions")
def institutions(q: str = "", state: str = "", type: str = "", risk: str = "", source: str = "", sort: str = "risk",
                 offset: int = 0, limit: int = 30):
    rows = inst_list_rows()
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r["name"].lower() or ql in r["city"].lower() or ql in (r["aicte_id"] or "").lower()
                or any(ql in a.lower() for a in r["aliases"])]
    if state:
        rows = [r for r in rows if r["state"] == state]
    if type:
        rows = [r for r in rows if r["type"] == type]
    if risk:
        rows = [r for r in rows if r["risk_level"] == risk]
    if source:
        rows = [r for r in rows if r["source"] == source]
    key = {"risk": lambda r: -r["risk"], "open": lambda r: -r["stats"]["open"], "name": lambda r: r["name"], "health": lambda r: r["health"]}[sort]
    rows.sort(key=key)
    states = sorted({r["state"] for r in inst_list_rows()})
    return {**page(rows[offset:offset + limit], len(rows)), "states": states}


@app.get("/api/institutions/resolve")
def inst_resolve(q: str, city: str = "", state: str = ""):
    return resolve.resolve(q, city_hint=city or None, state_hint=state or None)


@app.get("/api/institutions/{iid}")
def institution(iid: int, role: str = Header("ADMIN", alias="X-Role")):
    inst = next((r for r in inst_list_rows() if r["id"] == iid), None)
    if not inst:
        raise HTTPException(404, "Institution not found")
    cs = [cview(c) for c in db.rows(CJ + " WHERE c.institution_id=? ORDER BY c.filed_at DESC", (iid,))]
    alerted = alerted_action_ids()
    all_actions = db.rows("SELECT * FROM actions WHERE institution_id=? ORDER BY id DESC", (iid,))
    actions = [aview(a) for a in all_actions if action_visible(a, role, alerted)]
    hidden = len(all_actions) - len(actions)
    incidents = db.rows("SELECT * FROM incidents WHERE institution_id=? ORDER BY complaint_count DESC", (iid,))
    for i in incidents:
        i["checks"] = db.unj(i["checks"], {})
        i["category_label"] = CATEGORIES[i["category"]][0]
    alerts = db.rows("SELECT * FROM alerts WHERE institution_id=? ORDER BY id DESC", (iid,))
    sil = intel.silence_for(iid)
    indicators = []
    st = inst["stats"]
    if st["open"] >= 15:
        indicators.append({"level": "high", "text": f"High complaint volume: {st['open']} open cases"})
    bureaus = {c["bureau"] for c in cs if c["status"] in intel.OPEN_STATES} | {a["bureau"] for a in all_actions if a["status"] in ("draft", "proposed", "under_review")}
    if len(bureaus) >= 3:
        indicators.append({"level": "high", "text": f"Multiple bureaus acting at once: {', '.join(BUREAUS[b]['short'] for b in sorted(bureaus))}"})
    if alerts and any(a["status"] in ("open", "joint_review") for a in alerts):
        indicators.append({"level": "high", "text": "Action collision detected by ACE"})
    if incidents:
        indicators.append({"level": "medium", "text": f"{len(incidents)} systemic incident(s) surfaced from complaint clusters"})
    if sil:
        indicators.append({"level": "high", "text": sil["message"]})
    if st["breached"]:
        indicators.append({"level": "medium", "text": f"{st['breached']} case(s) past SLA"})
    sib = db.rows("SELECT id,name,city FROM institutions WHERE parent_id=? AND id<>?", (inst["parent_id"], iid)) if inst["parent_id"] else []
    sib_stats = {r["id"]: r for r in inst_list_rows() if r["parent_id"] == inst["parent_id"]} if inst["parent_id"] else {}
    if any(sib_stats.get(s["id"], {}).get("risk_level") == "High" for s in sib):
        indicators.append({"level": "medium", "text": "Parent trust under scrutiny: sister campus is high risk"})
    by_cat = Counter(c["category"] for c in cs)
    return {"institution": inst, "complaints": cs, "actions": actions, "hidden_actions": hidden, "incidents": incidents, "alerts": alerts,
            "silence": sil, "indicators": indicators, "siblings": sib,
            "categories": [{"category": k, "label": CATEGORIES[k][0], "count": v} for k, v in by_cat.most_common()],
            "graph": inst_graph(inst, cs, all_actions, sib, sib_stats, alerts)}


def inst_graph(inst, cs, actions, siblings, sib_stats, alerts):
    nodes = [{"id": f"i{inst['id']}", "label": inst["name"], "type": "institution", "center": True, "href": f"/institutions/{inst['id']}"}]
    edges = []
    if inst["parent_name"]:
        nodes.append({"id": "parent", "label": inst["parent_name"], "type": "trust"})
        edges.append({"source": "parent", "target": f"i{inst['id']}", "label": "manages"})
        for s in siblings[:8]:
            r = sib_stats.get(s["id"], {})
            nodes.append({"id": f"i{s['id']}", "label": s["name"], "type": "sister", "risk": r.get("risk_level"), "href": f"/institutions/{s['id']}"})
            edges.append({"source": "parent", "target": f"i{s['id']}", "label": "manages"})
    if inst.get("shared_campus_with"):
        o = db.row("SELECT id,name FROM institutions WHERE id=?", (inst["shared_campus_with"],))
        if o:
            nodes.append({"id": f"i{o['id']}", "label": o["name"], "type": "sister", "href": f"/institutions/{o['id']}"})
            edges.append({"source": f"i{o['id']}", "target": f"i{inst['id']}", "label": "shared campus"})
    for b, v in BUREAUS.items():
        n_c = sum(1 for c in cs if c["bureau"] == b and c["status"] in intel.OPEN_STATES)
        n_a = sum(1 for a in actions if a["bureau"] == b and a["status"] in ("draft", "proposed", "under_review"))
        if n_c or n_a:
            nodes.append({"id": f"b{b}", "label": v["short"], "type": "bureau", "color": v["color"], "complaints": n_c, "actions": n_a})
            edges.append({"source": f"b{b}", "target": f"i{inst['id']}", "label": f"{n_c} cases" + (f", {n_a} actions" if n_a else "")})
    return {"nodes": nodes, "edges": edges}


# ----------------------------------------------------------------------------------------- complaints
@app.get("/api/complaints")
def complaints(q: str = "", status: str = "", bureau: str = "", category: str = "", priority: str = "", institution_id: int = 0,
               flag: str = "", sort: str = "filed", offset: int = 0, limit: int = 25):
    where, args = ["1=1"], []
    if q:
        where.append("(c.ref_no LIKE ? OR c.text_en LIKE ? OR i.name LIKE ? OR c.passport_id LIKE ?)")
        args += [f"%{q}%"] * 4
    for col, val in (("c.status", status), ("c.bureau", bureau), ("c.category", category), ("c.priority", priority)):
        if val:
            where.append(f"{col}=?")
            args.append(val)
    if institution_id:
        where.append("c.institution_id=?")
        args.append(institution_id)
    if flag == "quarantined":
        where.append("c.firewall_flag=1")
    elif flag == "campaign":
        where.append("c.campaign_flag=1")
    elif flag == "open":
        where.append(f"c.status IN ({','.join('?' * len(intel.OPEN_STATES))})")
        args += list(intel.OPEN_STATES)
    elif flag == "overdue":
        where.append(f"c.status IN ({','.join('?' * len(intel.OPEN_STATES))}) AND c.due_at<?")
        args += list(intel.OPEN_STATES) + [now_iso()]
    elif flag == "pingpong":
        where.append("c.transfers>=3 AND c.status NOT IN ('Closed')")
    order = {"filed": "c.filed_at DESC", "due": "c.due_at ASC", "priority": "c.priority ASC, c.filed_at DESC"}[sort]
    base = " FROM complaints c JOIN institutions i ON i.id=c.institution_id WHERE " + " AND ".join(where)
    total = db.row("SELECT COUNT(*) n" + base, args)["n"]
    rows = db.rows("SELECT c.*, i.name AS institution_name, i.city AS city, i.state AS state, i.parent_id AS parent_id" + base +
                   f" ORDER BY {order} LIMIT ? OFFSET ?", args + [limit, offset])
    ids = [r["id"] for r in rows]
    rel = {}
    if ids:
        ph = ",".join("?" * len(ids))
        for r in db.rows(f"SELECT a, b, tier FROM relationships WHERE (a IN ({ph}) OR b IN ({ph})) AND tier>=3", ids + ids):
            for x in (r["a"], r["b"]):
                rel[x] = max(rel.get(x, 0), r["tier"])
    out = []
    for r in rows:
        v = cview(r)
        v["max_tier"] = rel.get(r["id"], 0)
        out.append(v)
    return page(out, total)


@app.get("/api/complaints/{cid}")
def complaint(cid: int):
    c = get_complaint(cid)
    v = cview(c, full=True)
    v["timeline"] = timeline(c["ref_no"])
    v["institution"] = db.row("SELECT id,name,city,state,aicte_id,type FROM institutions WHERE id=?", (c["institution_id"],))
    v["incident"] = db.row("SELECT id,title,complaint_count,kind,corroboration FROM incidents WHERE id=?", (c["incident_id"],)) if c["incident_id"] else None
    top = tiers.related(cid, limit=1, include_tier1=False)
    v["max_tier"] = top[0]["tier"] if top else 1
    v["passport_url"] = f"/track/{c['passport_id']}"
    return v


@app.get("/api/complaints/{cid}/analysis")
def analysis(cid: int, other: int = 0):
    c = get_complaint(cid)
    rel = tiers.related(cid, limit=10)
    pick = next((r for r in rel if r["id"] == other), None) or (rel[0] if rel else None)
    cmp = None
    if pick:
        cmp = {"current": {"ref_no": c["ref_no"], "text": c["text_en"]}, "matched": {"ref_no": pick["ref_no"], "text": pick["text_en"]},
               "shared_terms": tiers.highlights(c["text_en"], pick["text_en"]), "similarity": pick["similarity"]}
    alerts = db.rows("SELECT al.id, al.alert_no, al.severity, al.status, al.rule_id FROM alerts al JOIN actions x ON x.id=al.action_a JOIN actions y ON y.id=al.action_b "
                     "WHERE al.institution_id=? AND (x.complaint_ids LIKE ? OR y.complaint_ids LIKE ?)", (c["institution_id"], f"%{cid}%", f"%{cid}%"))
    return {"matches": [{k: v for k, v in r.items() if k != "text_en"} for r in rel], "comparison": cmp,
            "overall": round(max([r["similarity"] for r in rel if r["tier"] >= 2], default=0), 3),
            "embedding": embed.backend(),
            "method": "Deterministic 5-tier rules over text-embedding similarity, institution, trust, bureau and ACE collisions. No black-box model decides.",
            "alerts": alerts}


class IntakeBody(dict):
    pass


@app.post("/api/complaints")
def file_complaint(body: dict = Body(...)):
    """Layer A to C pipeline. Returns every step so the UI can show what happened and why."""
    text = (body.get("text") or "").strip()
    if len(text) < 15:
        raise HTTPException(422, "Please describe the complaint in at least a sentence.")
    channel = body.get("channel") or "portal"
    if channel not in CHANNELS:
        raise HTTPException(422, "Unknown channel")
    steps = []
    fw = firewall.scan(text)
    steps.append({"step": "Protect", "title": "LLM Firewall", "ok": not fw["flagged"],
                  "detail": fw["action"] if fw["flagged"] else "No instruction-like text found. Complaint treated as untrusted data.",
                  "findings": [r["why"] for r in fw["reasons"]]})
    lang = body.get("lang") or intake.detect_lang(text)
    safe_text = fw["sanitized"]
    text_en, method = intake.translate(safe_text, lang)
    steps.append({"step": "Understand", "title": "Language and translation", "ok": True,
                  "detail": f"Language detected: {lang.upper()}. Translation: {method}.", "findings": [text_en] if lang != "en" else []})
    inst, cand = None, None
    if body.get("institution_id"):
        inst = db.row("SELECT * FROM institutions WHERE id=?", (int(body["institution_id"]),))
        steps.append({"step": "Identify", "title": "Institution selected", "ok": True, "detail": f"Officer/complainant picked {inst['name']}.", "findings": []})
        conf = 100.0
    else:
        q = body.get("institution_text") or safe_text
        r = resolve.resolve(q, city_hint=body.get("city"), state_hint=body.get("state")) if body.get("institution_text") else None
        if r is None:
            r = resolve.find_in_text(safe_text, state_hint=body.get("state"))
            cand = r
            conf = r["score"] if r else 0
            inst = db.row("SELECT * FROM institutions WHERE id=?", (r["id"],)) if r else None
            confident = r and r.get("decision") == "auto-matched"
            cands = [r] if r else []
        else:
            cands = r["candidates"]
            conf = cands[0]["score"] if cands else 0
            inst = db.row("SELECT * FROM institutions WHERE id=?", (cands[0]["id"],)) if cands else None
            confident = r["confident"]
        steps.append({"step": "Identify", "title": "Entity resolution (E1)", "ok": bool(inst and confident),
                      "detail": (f"Matched to {inst['name']} ({inst['city']}) with {conf:.0f}% confidence. " + ("Auto-accepted." if confident else "Below the auto-accept bar: an officer must confirm."))
                      if inst else "No institution found.",
                      "findings": [f"{c['name']} - {c['score']:.0f}% ({c.get('why', '')})" for c in cands[:3]]})
    if not inst:
        raise HTTPException(422, "Could not identify the institution. Please name it or pick it from the list.")
    cat, cat_conf, alts = intake.classify(text_en)
    prio = intake.priority_for(cat, text_en)
    home, others, escalation = intake.route(cat, prio)
    steps.append({"step": "Understand", "title": "Issue classification", "ok": True,
                  "detail": f"{CATEGORIES[cat][0]} (confidence {cat_conf:.0%}). Priority {prio}. Routed to {BUREAUS[home]['name']}." + (f" {escalation.capitalize()} triggered." if escalation else ""),
                  "findings": [CATEGORIES[a][0] for a in alts[1:]]})
    filed = datetime.now().replace(microsecond=0)
    due = filed + timedelta(days=SLA_DAYS[prio])
    token = "V-" + os.urandom(4).hex().upper()
    db.execute("INSERT INTO vault(token,masked_contact,lang,created_at) VALUES(?,?,?,?)", (token, body.get("contact_masked") or "+91 XXXXX XXXXX", lang, filed.isoformat()))
    ref = f"C-2026-{db.row('SELECT COUNT(*) n FROM complaints')['n'] + 9100:05d}"
    pid = "SYN-" + os.urandom(4).hex().upper()
    status = "Escalated" if prio == "P0" else "New"
    cid = db.execute(
        """INSERT INTO complaints(ref_no,passport_id,channel,lang,text_original,text_en,institution_id,category,allegations,bureau,status,priority,filed_at,due_at,
           complainant,firewall_flag,firewall_reasons,assigned_to,academic_year,transfers,last_event_at,match_confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (ref, pid, channel, lang, text, text_en, inst["id"], cat, db.j([CATEGORIES[cat][4]]), home, status, prio, filed.isoformat(), due.isoformat(),
         token, 1 if fw["flagged"] else 0, db.j(fw["reasons"]), None, body.get("academic_year") or "2025-26", 0, filed.isoformat(), conf))
    embed.add(cid, text_en if not fw["flagged"] else fw["sanitized"])
    log("intake", "complaint.filed", ref, {"channel": channel, "institution_id": inst["id"], "bureau": home, "priority": prio,
                                           "firewall": "quarantined" if fw["flagged"] else "clean"}, "firewall-rules-v1")
    steps.append({"step": "Protect", "title": "Identity Vault and Complaint Passport", "ok": True,
                  "detail": f"Contact details moved to the pseudonymous vault (token {token}). Passport {pid} issued. Status updates by SMS/WhatsApp.", "findings": []})
    related = []
    if not fw["flagged"]:
        related = tiers.persist(cid)
    top = related[:5]
    maxt = max([r["tier"] for r in related], default=1)
    steps.append({"step": "Detect", "title": "5-tier relationship check (E3)", "ok": True,
                  "detail": (f"Highest tier: {maxt} - {tiers.TIER_NAMES[maxt]} -> {tiers.TIER_WORKFLOW[maxt]}." if related else "No related open cases found beyond the same institution (Tier 1: log)."),
                  "findings": [f"{r['ref_no']} - Tier {r['tier']} {r['tier_name']} ({r['similarity']:.0%}, {BUREAUS[r['bureau']]['short']})" for r in top]})
    steps.append({"step": "Track", "title": "SLA clock started", "ok": True,
                  "detail": f"Due {due.strftime('%d %b %Y')} ({SLA_DAYS[prio]} days, {prio}). Delay prediction runs automatically.", "findings": []})
    return {"id": cid, "ref_no": ref, "passport_id": pid, "institution": {"id": inst["id"], "name": inst["name"]}, "category": cat, "priority": prio,
            "bureau": home, "quarantined": fw["flagged"], "steps": steps, "max_tier": maxt}


@app.post("/api/complaints/{cid}/assign")
def assign(cid: int, body: dict = Body(...)):
    c = get_complaint(cid)
    officer = body.get("officer") or f"{c['bureau']}-01"
    db.execute("UPDATE complaints SET assigned_to=?, status=CASE WHEN status='New' THEN 'Under Review' ELSE status END, last_event_at=? WHERE id=?",
               (officer, now_iso(), cid))
    log(officer, "complaint.assigned", c["ref_no"], {"officer": officer, "basis": "workload, skill, language, conflict-of-interest check passed"})
    return {"ok": True}


@app.post("/api/complaints/{cid}/transfer")
def transfer(cid: int, body: dict = Body(...)):
    c = get_complaint(cid)
    to = body.get("bureau")
    if to not in BUREAUS:
        raise HTTPException(422, "Unknown bureau")
    db.execute("UPDATE complaints SET bureau=?, transfers=transfers+1, last_event_at=? WHERE id=?", (to, now_iso(), cid))
    log(f"{c['bureau']}-officer", "complaint.transferred", c["ref_no"], {"from": c["bureau"], "to": to})
    return {"ok": True}


@app.post("/api/complaints/{cid}/status")
def set_status(cid: int, body: dict = Body(...)):
    c = get_complaint(cid)
    st = body.get("status")
    if st not in STATUSES or st == "Closed":
        raise HTTPException(422, "Use the Resolution Assurance gate to close a case.")
    db.execute("UPDATE complaints SET status=?, last_event_at=? WHERE id=?", (st, now_iso(), cid))
    log(f"{c['bureau']}-officer", "complaint.status_changed", c["ref_no"], {"from": c["status"], "to": st, "note": body.get("note", "")})
    return {"ok": True}


@app.post("/api/complaints/{cid}/close")
def close_request(cid: int, body: dict = Body(...)):
    """Resolution Assurance gate: closure needs a reason AND the complainant's confirmation."""
    c = get_complaint(cid)
    reason = (body.get("reason") or "").strip()
    if len(reason) < 15:
        raise HTTPException(422, "Closure refused: a written reason (at least 15 characters) is mandatory. Reasonless closure is not allowed.")
    if c["status"] == "Closed":
        raise HTTPException(409, "Already closed")
    if c["resolution_confirmed"] != 1:
        db.execute("UPDATE complaints SET status='Resolved - Pending Confirmation', resolution_note=?, last_event_at=? WHERE id=?", (reason, now_iso(), cid))
        log(f"{c['bureau']}-officer", "complaint.resolution_proposed", c["ref_no"], {"reason": reason})
        raise HTTPException(409, "Closure refused: the complainant has not confirmed the resolution yet. A voice callback has been queued; the case moves to 'Resolved - Pending Confirmation'.")
    db.execute("UPDATE complaints SET status='Closed', closed_at=?, resolution_note=?, last_event_at=? WHERE id=?", (now_iso(), reason, now_iso(), cid))
    log(f"{c['bureau']}-officer", "complaint.closed", c["ref_no"], {"reason": reason, "confirmed_by_complainant": True})
    return {"ok": True}


@app.post("/api/complaints/{cid}/callback")
def callback(cid: int, body: dict = Body(...)):
    """Simulates the voice callback result from the complainant."""
    c = get_complaint(cid)
    ok = bool(body.get("resolved"))
    if ok:
        db.execute("UPDATE complaints SET status='Closed', closed_at=?, resolution_confirmed=1, last_event_at=? WHERE id=?", (now_iso(), now_iso(), cid))
        log("callback-system", "complaint.resolution_confirmed", c["ref_no"], {"complainant_says": "resolved"})
        return {"status": "Closed", "message": "Complainant confirmed the resolution. Case closed."}
    new_p = {"P3": "P2", "P2": "P1", "P1": "P1", "P0": "P0"}[c["priority"]]
    db.execute("UPDATE complaints SET status='Reopened', closed_at=NULL, resolution_confirmed=0, priority=?, last_event_at=?, due_at=? WHERE id=?",
               (new_p, now_iso(), (datetime.now() + timedelta(days=SLA_DAYS[new_p])).replace(microsecond=0).isoformat(), cid))
    log("callback-system", "complaint.reopened", c["ref_no"], {"complainant_says": "not solved", "original_context_kept": True, "priority": new_p})
    return {"status": "Reopened", "message": "Complainant said the issue is not solved. Case reopened with its full original context and a new SLA."}


@app.get("/api/passport/{pid}")
def passport(pid: str):
    c = db.row(CJ + " WHERE c.passport_id=?", (pid.upper(),))
    if not c:
        raise HTTPException(404, "No complaint found for this Complaint Passport")
    steps = [{"ts": t["ts"], "label": {"complaint.filed": "Complaint received", "complaint.assigned": "Assigned to an officer",
                                       "complaint.transferred": "Moved to another bureau", "complaint.closed": "Closed after your confirmation",
                                       "complaint.reopened": "Reopened because you said it was not solved",
                                       "complaint.resolution_proposed": "Officer says it is resolved. Waiting for your confirmation",
                                       "complaint.resolution_confirmed": "You confirmed the resolution"}.get(t["action"], "Case updated")}
             for t in timeline(c["ref_no"]) if t["action"].startswith("complaint.")]
    return {"passport_id": c["passport_id"], "ref_no": c["ref_no"], "status": c["status"], "institution": c["institution_name"],
            "issue": CATEGORIES[c["category"]][0], "filed_at": c["filed_at"], "due_at": c["due_at"], "bureau": BUREAUS[c["bureau"]]["name"],
            "steps": steps, "message": "Your identity is protected. Officers see only a pseudonymous token."}


# ----------------------------------------------------------------------------------------- actions & ACE
@app.get("/api/actions")
def actions(bureau: str = "", status: str = "", institution_id: int = 0, role: str = Header("ADMIN", alias="X-Role")):
    where, args = ["1=1"], []
    for col, val in (("bureau", bureau), ("status", status)):
        if val:
            where.append(f"{col}=?")
            args.append(val)
    if institution_id:
        where.append("institution_id=?")
        args.append(institution_id)
    rows = db.rows("SELECT a.*, i.name AS institution_name FROM actions a JOIN institutions i ON i.id=a.institution_id WHERE " + " AND ".join(f"a.{w}" if not w.startswith("1=1") else w for w in where) + " ORDER BY a.id DESC", args)
    alerted = alerted_action_ids()
    vis = [a for a in rows if action_visible(a, role, alerted)]
    ids_in_alert = alerted
    out = []
    for a in vis:
        v = aview(a)
        v["institution_name"] = a["institution_name"]
        v["in_alert"] = a["id"] in ids_in_alert
        out.append(v)
    return {"items": out, "total": len(out), "hidden": len(rows) - len(vis)}


@app.post("/api/actions/check")
def actions_check(body: dict = Body(...)):
    hits = ace.check(int(body["institution_id"]), body["type"], body.get("subject") or "general", body["bureau"])
    # pre-threshold: ACE sees everything, but shows the creating officer only what the rule needs
    return {"collisions": hits, "ok": not hits,
            "verdict": "No conflict with any other bureau's pending action." if not hits else
            f"{len(hits)} potential conflict(s) found. Review before proceeding.", "rules_checked": len(ace.RULES)}


@app.post("/api/actions")
def create_action(body: dict = Body(...)):
    iid, typ, bureau = int(body["institution_id"]), body["type"], body["bureau"]
    if typ not in ACTION_TYPES or bureau not in BUREAUS:
        raise HTTPException(422, "Unknown action type or bureau")
    subject = body.get("subject") or "general"
    hits = ace.check(iid, typ, subject, bureau)
    n = db.row("SELECT COUNT(*) n FROM actions WHERE bureau=?", (bureau,))["n"] + 31
    ref = body.get("ref_no") or f"{bureau}-2026-{n:03d}"
    inst = db.row("SELECT name FROM institutions WHERE id=?", (iid,))
    status = body.get("status") or "proposed"
    aid = db.execute(
        "INSERT INTO actions(ref_no,type,subject,institution_id,bureau,status,proposed_date,summary,complaint_ids,created_by,created_at,clause) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (ref, typ, subject, iid, bureau, status, body.get("proposed_date") or (datetime.now() + timedelta(days=14)).date().isoformat(),
         body.get("summary") or f"{ACTION_TYPES[typ]} for {inst['name']}", db.j(body.get("complaint_ids") or []),
         body.get("created_by") or f"{bureau}-officer", now_iso(), body.get("clause") or "APH 2021-22 cl. 8.17"))
    me = db.row("SELECT * FROM actions WHERE id=?", (aid,))
    log(f"{bureau}-officer", "action.proposed", ref, {"type": typ, "institution_id": iid, "ace_collisions": len(hits)}, "ace-rules-v1")
    alerts = []
    if status in ("proposed", "under_review"):
        for h in hits:
            other = db.row("SELECT * FROM actions WHERE id=?", (h["other_action"]["id"],))
            alert, _ = ace.raise_alert(me, other, h, iid, actor=f"{bureau}-officer")
            alerts.append(alert)
    return {"action": aview(me), "collisions": hits, "alerts": alerts}


@app.post("/api/actions/{aid}/status")
def action_status(aid: int, body: dict = Body(...)):
    a = db.row("SELECT * FROM actions WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404, "Action not found")
    st = body.get("status")
    if st == "issued":
        blocking = db.rows("SELECT * FROM alerts WHERE (action_a=? OR action_b=?) AND status IN ('open','joint_review')", (aid, aid))
        if blocking:
            raise HTTPException(409, f"Blocked: ACE alert {blocking[0]['alert_no']} requires a joint review acknowledged by both bureaus before this action can advance.")
    db.execute("UPDATE actions SET status=? WHERE id=?", (st, aid))
    log(f"{a['bureau']}-officer", "action.status_changed", a["ref_no"], {"to": st})
    return {"ok": True}


def alert_view(a, with_actions=True):
    a = dict(a)
    a["refs"] = db.unj(a["refs"], [])
    inst = db.row("SELECT id,name,city,state FROM institutions WHERE id=?", (a["institution_id"],))
    a["institution"] = inst
    if with_actions:
        a["action_a_full"] = aview(db.row("SELECT * FROM actions WHERE id=?", (a["action_a"],)))
        a["action_b_full"] = aview(db.row("SELECT * FROM actions WHERE id=?", (a["action_b"],)))
    a["tier"] = 5 if a["severity"] == "hard" else 4
    a["tier_name"] = tiers.TIER_NAMES[a["tier"]]
    return a


@app.get("/api/alerts")
def alerts(status: str = ""):
    rows = db.rows("SELECT * FROM alerts" + (" WHERE status=?" if status else "") + " ORDER BY id DESC", (status,) if status else ())
    return page([alert_view(a) for a in rows], len(rows))


@app.get("/api/alerts/{aid}")
def alert(aid: int):
    a = db.row("SELECT * FROM alerts WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404, "Alert not found")
    v = alert_view(a)
    cids = set(v["action_a_full"]["complaint_ids"]) | set(v["action_b_full"]["complaint_ids"])
    v["complaints"] = [cview(c) for c in db.rows(CJ + f" WHERE c.id IN ({','.join('?' * len(cids)) or 'NULL'})", list(cids))] if cids else []
    v["timeline"] = timeline(a["alert_no"])
    v["room"] = db.row("SELECT id,status FROM rooms WHERE id=?", (a["room_id"],)) if a["room_id"] else None
    return v


@app.post("/api/alerts/{aid}/comment")
def alert_comment(aid: int, body: dict = Body(...)):
    a = db.row("SELECT * FROM alerts WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404, "Alert not found")
    log(body.get("author") or "officer", "alert.comment", a["alert_no"], {"comment": body.get("body", "")})
    return {"ok": True}


@app.post("/api/alerts/{aid}/dismiss")
def alert_dismiss(aid: int, body: dict = Body(...)):
    a = db.row("SELECT * FROM alerts WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404, "Alert not found")
    reason = (body.get("reason") or "").strip()
    if len(reason) < 15:
        raise HTTPException(422, "A written reason (at least 15 characters) is required to dismiss an ACE alert. The reason is stored in the audit ledger.")
    db.execute("UPDATE alerts SET status='dismissed' WHERE id=?", (aid,))
    log(body.get("author") or "officer", "alert.dismissed", a["alert_no"], {"reason": reason})
    return {"ok": True}


@app.post("/api/alerts/{aid}/joint-review")
def joint_review(aid: int):
    a = db.row("SELECT * FROM alerts WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404, "Alert not found")
    if a["room_id"]:
        return {"room_id": a["room_id"], "existing": True}
    xa, xb = (db.row("SELECT * FROM actions WHERE id=?", (a["action_a"],)), db.row("SELECT * FROM actions WHERE id=?", (a["action_b"],)))
    lead = (xa if ACTION_RANK.get(xa["type"], 0) >= ACTION_RANK.get(xb["type"], 0) else xb)["bureau"]
    rid = db.execute("INSERT INTO rooms(institution_id,alert_id,lead_bureau,status,created_at,acks) VALUES(?,?,?,?,?,?)",
                     (a["institution_id"], aid, lead, "open", now_iso(), db.j([])))
    db.execute("UPDATE alerts SET status='joint_review', room_id=? WHERE id=?", (rid, aid))
    db.execute("INSERT INTO room_messages(room_id,author,body,ts) VALUES(?,?,?,?)",
               (rid, "SYNAPSE", f"Coordination Room opened for {a['alert_no']}. Proposed lead bureau: {BUREAUS[lead]['name']} (higher-level action). "
                                f"Neither action can advance until both bureaus acknowledge the joint review.", now_iso()))
    log("system", "room.opened", a["alert_no"], {"room_id": rid, "lead": lead})
    return {"room_id": rid, "existing": False}


# ----------------------------------------------------------------------------------------- coordination rooms
@app.get("/api/rooms")
def rooms():
    out = []
    for r in db.rows("SELECT r.*, i.name AS institution_name, a.alert_no, a.rule_id, a.severity FROM rooms r JOIN institutions i ON i.id=r.institution_id JOIN alerts a ON a.id=r.alert_id ORDER BY r.id DESC"):
        r["acks"] = db.unj(r["acks"], [])
        r["lead_name"] = BUREAUS[r["lead_bureau"]]["name"]
        out.append(r)
    return page(out, len(out))


def room_bureaus(room):
    al = db.row("SELECT * FROM alerts WHERE id=?", (room["alert_id"],))
    xa, xb = db.row("SELECT * FROM actions WHERE id=?", (al["action_a"],)), db.row("SELECT * FROM actions WHERE id=?", (al["action_b"],))
    return al, xa, xb


@app.get("/api/rooms/{rid}")
def room(rid: int):
    r = db.row("SELECT * FROM rooms WHERE id=?", (rid,))
    if not r:
        raise HTTPException(404, "Room not found")
    al, xa, xb = room_bureaus(r)
    r["acks"] = db.unj(r["acks"], [])
    r["lead_name"] = BUREAUS[r["lead_bureau"]]["name"]
    r["institution"] = db.row("SELECT id,name,city,state FROM institutions WHERE id=?", (r["institution_id"],))
    r["alert"] = alert_view(al)
    r["participants"] = sorted({xa["bureau"], xb["bureau"]})
    r["messages"] = db.rows("SELECT * FROM room_messages WHERE room_id=? ORDER BY id", (rid,))
    merged = []
    for ref in (xa["ref_no"], xb["ref_no"], al["alert_no"]):
        merged += timeline(ref)
    for cid in set(db.unj(xa["complaint_ids"], [])) | set(db.unj(xb["complaint_ids"], [])):
        c = db.row("SELECT ref_no FROM complaints WHERE id=?", (cid,))
        if c:
            merged += timeline(c["ref_no"])
    merged.sort(key=lambda t: t["ts"])
    r["timeline"] = merged[-40:]
    return r


@app.post("/api/rooms/{rid}/message")
def room_message(rid: int, body: dict = Body(...)):
    r = db.row("SELECT * FROM rooms WHERE id=?", (rid,))
    if not r:
        raise HTTPException(404, "Room not found")
    text = (body.get("body") or "").strip()
    if not text:
        raise HTTPException(422, "Empty message")
    # messages are user text too: they pass through the firewall and are only ever displayed, never executed
    fw = firewall.scan(text)
    db.execute("INSERT INTO room_messages(room_id,author,body,ts) VALUES(?,?,?,?)", (rid, body.get("author") or "officer", fw["sanitized"], now_iso()))
    return {"ok": True, "firewall": fw["flagged"]}


@app.post("/api/rooms/{rid}/ack")
def room_ack(rid: int, body: dict = Body(...)):
    r = db.row("SELECT * FROM rooms WHERE id=?", (rid,))
    if not r:
        raise HTTPException(404, "Room not found")
    b = body.get("bureau")
    al, xa, xb = room_bureaus(r)
    if b not in (xa["bureau"], xb["bureau"]):
        raise HTTPException(403, "Only the bureaus in this collision can acknowledge")
    acks = db.unj(r["acks"], [])
    if b not in acks:
        acks.append(b)
    db.execute("UPDATE rooms SET acks=? WHERE id=?", (db.j(acks), rid))
    db.execute("INSERT INTO room_messages(room_id,author,body,ts) VALUES(?,?,?,?)", (rid, BUREAUS[b]["short"], "Joint review acknowledged.", now_iso()))
    log(f"{b}-officer", "room.acknowledged", al["alert_no"], {"bureau": b})
    return {"acks": acks, "complete": set(acks) >= {xa["bureau"], xb["bureau"]}}


@app.post("/api/rooms/{rid}/notice")
def room_notice(rid: int):
    r = db.row("SELECT * FROM rooms WHERE id=?", (rid,))
    if not r:
        raise HTTPException(404, "Room not found")
    al, xa, xb = room_bureaus(r)
    inst = db.row("SELECT * FROM institutions WHERE id=?", (r["institution_id"],))
    lead = r["lead_bureau"]
    notice = (f"AICTE - Single-Window Notice\nTo: The Head of Institution, {inst['name']}, {inst['city']}, {inst['state']} (AICTE ID {inst['aicte_id']})\n\n"
              f"Subject: Consolidated notice on behalf of {BUREAUS[xa['bureau']]['name']} and {BUREAUS[xb['bureau']]['name']}\n\n"
              f"1. {xa['ref_no']} ({ACTION_TYPES[xa['type']]}): {xa['summary']}\n"
              f"2. {xb['ref_no']} ({ACTION_TYPES[xb['type']]}): {xb['summary']}\n\n"
              f"The above matters concern the same institution and subject. To avoid conflicting directions, they are issued as ONE notice under the lead of the {BUREAUS[lead]['name']}. "
              f"You are requested to submit a single consolidated reply within 15 days.\n\nRef: {al['alert_no']} | Basis: {', '.join(db.unj(al['refs'], []))}")
    db.execute("UPDATE rooms SET notice=? WHERE id=?", (notice, rid))
    log("system", "room.notice_drafted", al["alert_no"], {"lead": lead})
    return {"notice": notice}


@app.post("/api/rooms/{rid}/resolve")
def room_resolve(rid: int):
    r = db.row("SELECT * FROM rooms WHERE id=?", (rid,))
    if not r:
        raise HTTPException(404, "Room not found")
    al, xa, xb = room_bureaus(r)
    acks = set(db.unj(r["acks"], []))
    if not acks >= {xa["bureau"], xb["bureau"]}:
        raise HTTPException(409, "Both bureaus must acknowledge the joint review before the conflict can be resolved.")
    if not r["notice"]:
        raise HTTPException(409, "Draft the single consolidated notice first.")
    lead, other = (xa, xb) if xa["bureau"] == r["lead_bureau"] else (xb, xa)
    db.execute("UPDATE actions SET status='merged' WHERE id=?", (other["id"],))
    db.execute("UPDATE actions SET summary=? WHERE id=?", (lead["summary"] + f" (Consolidated with {other['ref_no']} after joint review.)", lead["id"]))
    db.execute("UPDATE alerts SET status='resolved' WHERE id=?", (al["id"],))
    db.execute("UPDATE rooms SET status='resolved' WHERE id=?", (rid,))
    log(f"{r['lead_bureau']}-officer", "room.resolved", al["alert_no"], {"lead_action": lead["ref_no"], "merged": other["ref_no"]})
    return {"ok": True, "lead_action": lead["ref_no"], "merged": other["ref_no"]}


# ----------------------------------------------------------------------------------------- incidents, analytics, sla
@app.get("/api/incidents")
def incidents(kind: str = ""):
    rows = db.rows("SELECT n.*, i.name AS institution_name, i.city FROM incidents n JOIN institutions i ON i.id=n.institution_id" + (" WHERE n.kind=?" if kind else "") + " ORDER BY n.complaint_count DESC", (kind,) if kind else ())
    for r in rows:
        r["checks"] = db.unj(r["checks"], {})
        r["category_label"] = CATEGORIES[r["category"]][0]
    return page(rows, len(rows))


@app.get("/api/incidents/{nid}")
def incident(nid: int):
    r = db.row("SELECT n.*, i.name AS institution_name, i.city FROM incidents n JOIN institutions i ON i.id=n.institution_id WHERE n.id=?", (nid,))
    if not r:
        raise HTTPException(404, "Incident not found")
    r["checks"] = db.unj(r["checks"], {})
    r["category_label"] = CATEGORIES[r["category"]][0]
    r["complaints"] = [cview(c) for c in db.rows(CJ + " WHERE c.incident_id=? ORDER BY c.filed_at DESC LIMIT 60", (nid,))]
    r["by_channel"] = db.rows("SELECT channel, COUNT(*) n FROM complaints WHERE incident_id=? GROUP BY channel ORDER BY n DESC", (nid,))
    r["by_bureau"] = db.rows("SELECT bureau, COUNT(*) n FROM complaints WHERE incident_id=? GROUP BY bureau ORDER BY n DESC", (nid,))
    return r


@app.get("/api/analytics")
def analytics(state: str = "", type: str = ""):
    rows = [r for r in inst_list_rows() if (not state or r["state"] == state) and (not type or r["type"] == type)]
    demo = [r for r in rows if r["source"] == "demo"]
    top_volume = sorted(demo, key=lambda r: -r["stats"]["total"])[:10]
    cats = db.rows("SELECT category, COUNT(*) n FROM complaints GROUP BY category ORDER BY n DESC")
    total = sum(c["n"] for c in cats) or 1
    by_state = Counter()
    for r in demo:
        by_state[r["state"]] += r["stats"]["total"]
    # trust-level patterns: repeat violators across colleges of one management
    trusts = {}
    for r in demo:
        t = trusts.setdefault(r["parent_name"], {"trust": r["parent_name"], "colleges": [], "open": 0, "high": 0, "alerts": 0})
        t["colleges"].append({"id": r["id"], "name": r["name"], "risk": r["risk"], "level": r["risk_level"]})
        t["open"] += r["stats"]["open"]
        t["alerts"] += r["stats"]["alerts"]
        t["high"] += 1 if r["risk_level"] == "High" else 0
    watch = sorted((t for t in trusts.values() if t["high"] >= 1 and len(t["colleges"]) >= 2), key=lambda t: (-t["high"], -t["open"]))
    ghi_buckets = Counter()
    for r in demo:
        ghi_buckets["Good (70+)" if r["health"] >= 70 else "Fair (40-69)" if r["health"] >= 40 else "Poor (<40)"] += 1
    multi = sum(1 for r in demo if r["stats"]["actions"] >= 2)
    repeat = db.row("SELECT COUNT(*) n FROM (SELECT complainant FROM complaints GROUP BY complainant HAVING COUNT(*)>1)")["n"]
    return {
        "kpis": {"high_risk": sum(1 for r in demo if r["risk_level"] == "High"), "multi_action": multi,
                 "trusts_watch": len(watch), "repeat_complainants": repeat, "silent": sum(1 for r in demo if r["silent"])},
        "top_volume": [{"id": r["id"], "name": r["name"], "city": r["city"], "total": r["stats"]["total"], "open": r["stats"]["open"], "risk": r["risk"]} for r in top_volume],
        "categories": [{"category": c["category"], "label": CATEGORIES[c["category"]][0], "count": c["n"], "pct": round(c["n"] / total * 100)} for c in cats],
        "by_state": [{"state": k, "count": v} for k, v in by_state.most_common()],
        "watch": watch[:6], "ghi": [{"band": k, "count": v} for k, v in ghi_buckets.items()],
        "silence": intel.silence_report(),
        "risk_table": sorted(({"id": r["id"], "name": r["name"], "city": r["city"], "state": r["state"], "risk": r["risk"], "level": r["risk_level"],
                               "open": r["stats"]["open"], "alerts": r["stats"]["alerts"], "ghi": r["health"], "silent": r["silent"]} for r in demo),
                             key=lambda r: -r["risk"])[:15],
        "states": sorted({r["state"] for r in inst_list_rows()}),
    }


@app.get("/api/sla")
def sla(kind: str = "predicted"):
    cs = [cview(c) for c in db.rows(CJ + f" WHERE c.status IN ({','.join('?' * len(intel.OPEN_STATES))})", intel.OPEN_STATES)]
    if kind == "predicted":
        cs = [c for c in cs if c["sla"]["predicted_breach"]]
    elif kind == "breached":
        cs = [c for c in cs if c["sla"]["breached"]]
    elif kind == "pingpong":
        cs = [c for c in cs if any("Ping-pong" in f for f in c["sla"]["flags"])]
    elif kind == "stalled":
        cs = [c for c in cs if any("Stalled" in f for f in c["sla"]["flags"])]
    cs.sort(key=lambda c: -c["sla"]["risk"])
    return page(cs[:50], len(cs))


# ----------------------------------------------------------------------------------------- ledger & firewall & demo
@app.get("/api/ledger")
def ledger_list(ref: str = "", limit: int = 40, offset: int = 0, action: str = ""):
    where, args = ["1=1"], []
    if ref:
        where.append("ref LIKE ?")
        args.append(f"%{ref}%")
    if action:
        where.append("action LIKE ?")
        args.append(f"{action}%")
    total = db.row("SELECT COUNT(*) n FROM ledger WHERE " + " AND ".join(where), args)["n"]
    rows = db.rows("SELECT * FROM ledger WHERE " + " AND ".join(where) + " ORDER BY id DESC LIMIT ? OFFSET ?", args + [limit, offset])
    for r in rows:
        r["payload"] = db.unj(r["payload"], {})
    return page(rows, total)


@app.get("/api/ledger/verify")
def ledger_verify():
    return ledger.verify()


@app.post("/api/ledger/tamper-demo")
def ledger_tamper():
    """DEMO ONLY: edits a ledger row behind the application's back so the integrity check can catch it."""
    row = db.row("SELECT id, payload FROM ledger ORDER BY id LIMIT 1 OFFSET 900")
    if not row:
        raise HTTPException(409, "Ledger too short for the demo")
    db.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('tamper_backup',?)", (db.j({"id": row["id"], "payload": row["payload"]}),))
    db.execute("UPDATE ledger SET payload=? WHERE id=?", (json.dumps({"edited": "someone changed this record"}), row["id"]))
    return {"tampered_row": row["id"], "verify": ledger.verify()}


@app.post("/api/ledger/restore-demo")
def ledger_restore():
    b = db.row("SELECT value FROM meta WHERE key='tamper_backup'")
    if not b:
        return {"restored": False, "verify": ledger.verify()}
    v = json.loads(b["value"])
    db.execute("UPDATE ledger SET payload=? WHERE id=?", (v["payload"], v["id"]))
    db.execute("DELETE FROM meta WHERE key='tamper_backup'")
    return {"restored": True, "verify": ledger.verify()}


@app.post("/api/firewall/scan")
def fw_scan(body: dict = Body(...)):
    return firewall.scan(body.get("text", ""))


@app.get("/api/demo/traps")
def demo_traps():
    out = []
    for t in json.loads((db.row("SELECT value FROM meta WHERE key='traps'") or {"value": "[]"})["value"]):
        a, b = get_complaint(t["a"]), get_complaint(t["b"])
        rel = [r for r in tiers.related(t["a"], limit=100) if r["id"] == t["b"]]
        out.append({"a": {"id": a["id"], "ref_no": a["ref_no"], "institution": a["institution_name"]},
                    "b": {"id": b["id"], "ref_no": b["ref_no"], "institution": b["institution_name"]},
                    "similarity": round(embed.sim(t["a"], t["b"]), 3), "tier": rel[0]["tier"] if rel else 0,
                    "tier_name": tiers.TIER_NAMES[rel[0]["tier"]] if rel else "Not linked", "why": t["why"],
                    "flagged_wrongly": bool(rel and rel[0]["tier"] >= 3)})
    return out


@app.post("/api/admin/reseed")
def reseed():
    from . import seed
    s = seed.build()
    embed.build()
    resolve.build()
    return s


# ----------------------------------------------------------------------------------------- frontend (production build)
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = os.path.join(DIST, path)
        return FileResponse(f if path and os.path.isfile(f) else os.path.join(DIST, "index.html"))
