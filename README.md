# SYNAPSE: Institutional Accountability Graph (SIH26264 prototype)

Cross-bureau case coordination for AICTE. The **college** is the main object, not the complaint. Every complaint, enforcement action and bureau decision hangs off the institution it concerns.

## Run it

```bash
# 1. backend (first start seeds the database automatically, ~20 s)
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000

# 2. frontend, development mode (hot reload, proxies /api to :8000)
cd frontend
npm install
npm run dev          # http://localhost:5173

# or build once and let the backend serve everything on :8000
npm run build        # then open http://localhost:8000
```

Reset the demo data any time: `POST /api/admin/reseed` or `python -m app.seed` (stop the server first).
Check the whole system end to end: `python backend/tests_smoke.py` (26 checks, needs the API running).

## What is real and what is simulated

| Layer | Source |
|---|---|
| 130 institutions (IITs, NITs, state colleges, well-known private and deemed institutions) | Real, publicly known names, cities, states and ownership type. **No allegations are attached to them.** Used as the registry for entity resolution. |
| 34 institutions in 16 trusts ("ABC Institute of Technology", "XYZ Education Trust", ...) | Fictional composites in real cities. **All simulated cases attach only to these**, so no real college is accused of anything. |
| Complaint categories, priorities, SLA norms (15 days), fee-refund and certificate rules, ragging helpline, escalation route (APH 2021-22 cl. 8.17) | Taken from published AICTE, UGC and CPGRAMS material (see `backend/app/data/knowledge.py`). |
| Complaint text, volumes, dates, actions | Simulated from those categories, with planted scenarios so each engine has something to find. |
| AICTE IDs (`EN00xxxx`) | Placeholders. AICTE does not publish a bulk institution list. |

## Engines (from the architecture document)

| Engine | Where | Notes |
|---|---|---|
| E1 Entity resolution | `engines/resolve.py` | RapidFuzz + phonetic skeleton + Indic-to-Latin transliteration + spoken acronyms ("el-em-en" matches LMN) |
| E2 Issue threads | `engines/intel.py` | HDBSCAN on text vectors, merged per issue; separates fake-complaint bursts |
| E3 5-tier classifier | `engines/tiers.py` | Deterministic rules with reasons |
| E4 ACE | `engines/ace.py` + YAML matrix in `data/knowledge.py` | 16 contradiction rules, each with a clause reference |
| E5 Coordination Room | `main.py` rooms endpoints | Acknowledgement by both bureaus, one consolidated notice |
| E6 Resolution Assurance | `main.py` close and callback | Reasonless or unconfirmed closure refused; "not solved" reopens |
| E7 Corroboration index | `engines/intel.py` | Checks incidents against inspection and action records |
| E8 Silence anomaly + Grievance Health Index | `engines/intel.py` | Self-reported pending vs observed intake |
| E9 SLA time engine | `engines/intel.py` | Breach prediction, stall and ping-pong detection |
| E10 LLM Firewall | `engines/firewall.py` | Rule-based injection detection; complaint text is never used as an instruction |
| Audit ledger | `engines/ledger.py` | SHA-256 hash chain, verify and tamper demo |

## Honest list of stand-ins

- **Database:** SQLite instead of PostgreSQL + pgvector + Apache AGE (no Docker or Postgres on this machine). The graph is stored as relational links and shaped into nodes and edges by the API. Schema in `db.py` is plain SQL and ports to Postgres.
- **Embeddings:** TF-IDF (word + character n-grams) by default, fully offline. Set `SYNAPSE_EMBED=mpnet` to use `paraphrase-multilingual-mpnet-base-v2` if `sentence-transformers` is installed.
- **Bhashini voice/translation, WhatsApp, IVR, SMS:** not connected. Voice intake takes a transcript; translation uses an offline glossary adapter (`engines/intake.py`) that is the swap point for the real Bhashini client.
- **Authentication:** the "Viewing as" switcher sends an `X-Role` header to demonstrate bureau-level visibility. It is not real login.
