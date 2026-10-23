"""Vercel serverless entry point: exposes the FastAPI app (ASGI) from backend/app."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.main import app  # noqa: E402,F401
