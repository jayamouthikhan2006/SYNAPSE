import json
import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("SYNAPSE_DB", os.path.join(os.path.dirname(os.path.dirname(__file__)), "synapse.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS parents(
  id INTEGER PRIMARY KEY, name TEXT UNIQUE, kind TEXT, state TEXT, source TEXT
);
CREATE TABLE IF NOT EXISTS institutions(
  id INTEGER PRIMARY KEY, aicte_id TEXT UNIQUE, name TEXT, aliases TEXT, city TEXT, state TEXT, district TEXT,
  type TEXT, affiliation TEXT, estd INTEGER, intake INTEGER, parent_id INTEGER, source TEXT,
  approval_status TEXT DEFAULT 'Active', last_inspection TEXT, inspection_result TEXT,
  self_reported_pending INTEGER DEFAULT 0, shared_campus_with INTEGER
);
CREATE TABLE IF NOT EXISTS vault(
  token TEXT PRIMARY KEY, masked_contact TEXT, lang TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS complaints(
  id INTEGER PRIMARY KEY, ref_no TEXT UNIQUE, passport_id TEXT UNIQUE, channel TEXT, lang TEXT,
  text_original TEXT, text_en TEXT, institution_id INTEGER, category TEXT, allegations TEXT,
  bureau TEXT, status TEXT, priority TEXT, filed_at TEXT, due_at TEXT, closed_at TEXT,
  complainant TEXT, firewall_flag INTEGER DEFAULT 0, firewall_reasons TEXT, incident_id INTEGER,
  assigned_to TEXT, resolution_confirmed INTEGER, resolution_note TEXT, academic_year TEXT,
  transfers INTEGER DEFAULT 0, last_event_at TEXT, campaign_flag INTEGER DEFAULT 0, match_confidence REAL
);
CREATE INDEX IF NOT EXISTS ix_c_inst ON complaints(institution_id);
CREATE INDEX IF NOT EXISTS ix_c_status ON complaints(status);
CREATE TABLE IF NOT EXISTS relationships(
  id INTEGER PRIMARY KEY, a INTEGER, b INTEGER, tier INTEGER, score REAL, reasons TEXT, created_at TEXT,
  UNIQUE(a,b)
);
CREATE TABLE IF NOT EXISTS actions(
  id INTEGER PRIMARY KEY, ref_no TEXT UNIQUE, type TEXT, subject TEXT, institution_id INTEGER, bureau TEXT,
  status TEXT, proposed_date TEXT, summary TEXT, complaint_ids TEXT, created_by TEXT, created_at TEXT,
  clause TEXT
);
CREATE TABLE IF NOT EXISTS alerts(
  id INTEGER PRIMARY KEY, alert_no TEXT UNIQUE, action_a INTEGER, action_b INTEGER, institution_id INTEGER,
  rule_id TEXT, severity TEXT, status TEXT, explanation TEXT, recommendation TEXT, refs TEXT,
  created_at TEXT, room_id INTEGER
);
CREATE TABLE IF NOT EXISTS rooms(
  id INTEGER PRIMARY KEY, institution_id INTEGER, alert_id INTEGER, lead_bureau TEXT, status TEXT,
  created_at TEXT, notice TEXT, acks TEXT
);
CREATE TABLE IF NOT EXISTS room_messages(
  id INTEGER PRIMARY KEY, room_id INTEGER, author TEXT, body TEXT, ts TEXT
);
CREATE TABLE IF NOT EXISTS incidents(
  id INTEGER PRIMARY KEY, institution_id INTEGER, category TEXT, title TEXT, complaint_count INTEGER,
  complainants INTEGER, first_at TEXT, last_at TEXT, corroboration REAL, kind TEXT, checks TEXT
);
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY, ts TEXT, actor TEXT, action TEXT, ref TEXT, payload TEXT, model_version TEXT,
  prev_hash TEXT, hash TEXT
);
CREATE INDEX IF NOT EXISTS ix_l_ref ON ledger(ref);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
"""


def connect():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


_conn = None


def get() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = connect()
        _conn.executescript(SCHEMA)
    return _conn


def reset():
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None
    for suffix in ("", "-wal", "-shm"):
        try:
            os.remove(DB_PATH + suffix)
        except FileNotFoundError:
            pass
    return get()


def rows(sql, args=()):
    return [dict(r) for r in get().execute(sql, args).fetchall()]


def row(sql, args=()):
    r = get().execute(sql, args).fetchone()
    return dict(r) if r else None


def execute(sql, args=()):
    cur = get().execute(sql, args)
    get().commit()
    return cur.lastrowid


def j(v):
    return json.dumps(v, ensure_ascii=False)


def unj(v, default=None):
    if v is None or v == "":
        return default
    try:
        return json.loads(v)
    except Exception:
        return default
