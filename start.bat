@echo off
rem Starts SYNAPSE on http://localhost:8000 (build the frontend first: cd frontend && npm run build)
cd /d "%~dp0backend"
python -m uvicorn app.main:app --port 8000
