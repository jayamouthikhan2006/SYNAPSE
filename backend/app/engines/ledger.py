"""E-Governance: append-only, hash-chained audit ledger (tamper evident)."""
import hashlib
import json
from datetime import datetime

from .. import db

GENESIS = "0" * 64


def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()


def _digest(prev, ts, actor, action, ref, payload, model_version):
    body = json.dumps([prev, ts, actor, action, ref, payload, model_version], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def append(actor, action, ref, payload=None, ts=None, model_version=None, commit=True):
    conn = db.get()
    last = conn.execute("SELECT hash FROM ledger ORDER BY id DESC LIMIT 1").fetchone()
    prev = last["hash"] if last else GENESIS
    ts = ts or now_iso()
    pj = db.j(payload or {})
    h = _digest(prev, ts, actor, action, ref, pj, model_version)
    conn.execute(
        "INSERT INTO ledger(ts,actor,action,ref,payload,model_version,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?)",
        (ts, actor, action, ref, pj, model_version, prev, h),
    )
    if commit:
        conn.commit()
    return h


def verify():
    """Walk the chain. Returns {ok, checked, broken_at, reason}."""
    prev = GENESIS
    checked = 0
    for r in db.get().execute("SELECT * FROM ledger ORDER BY id"):
        expected = _digest(prev, r["ts"], r["actor"], r["action"], r["ref"], r["payload"], r["model_version"])
        if r["prev_hash"] != prev:
            return {"ok": False, "checked": checked, "broken_at": r["id"], "reason": "chain link broken (a row was removed or reordered)"}
        if r["hash"] != expected:
            return {"ok": False, "checked": checked, "broken_at": r["id"], "reason": "row content does not match its hash (row was edited)"}
        prev = r["hash"]
        checked += 1
    return {"ok": True, "checked": checked, "broken_at": None, "reason": None, "head": prev}
