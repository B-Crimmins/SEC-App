"""File I/O for raw and processed county data.

This is the MVP data layer. When we add a real database later, this module is
the seam to replace: read/write functions should be swapped for queries while
the routes and services above stay unchanged.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# backend/app/data/...
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
SAMPLE_PATH = DATA_DIR / "sample_county_data.json"
PROCESSED_PATH = PROCESSED_DIR / "county_data.json"

DEFAULT_RAW_FILENAME = "mock_totalview_reports.json"


def ensure_dirs() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def raw_path(filename: str | None = None) -> Path:
    return RAW_DIR / (filename or DEFAULT_RAW_FILENAME)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Any) -> None:
    ensure_dirs()
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, path)


def load_county_data() -> list[dict[str, Any]]:
    """Return the active county dataset.

    Prefers the processed file written by ingestion; falls back to the
    bundled sample so the app always has something to show.
    """
    if PROCESSED_PATH.exists():
        data = read_json(PROCESSED_PATH)
        if isinstance(data, dict) and "records" in data:
            return data["records"]
        if isinstance(data, list):
            return data
    if SAMPLE_PATH.exists():
        data = read_json(SAMPLE_PATH)
        if isinstance(data, dict) and "records" in data:
            return data["records"]
        if isinstance(data, list):
            return data
    return []


def save_processed(records: list[dict[str, Any]], source_path: Path) -> Path:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": str(source_path),
        "record_count": len(records),
        "records": records,
    }
    write_json(PROCESSED_PATH, payload)
    return PROCESSED_PATH


def file_status() -> dict[str, Any]:
    """Status of file-based data sources, surfaced via /api/data/metadata."""
    def info(p: Path) -> dict[str, Any]:
        if not p.exists():
            return {"exists": False, "path": str(p)}
        st = p.stat()
        return {
            "exists": True,
            "path": str(p),
            "size_bytes": st.st_size,
            "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        }

    return {
        "processed": info(PROCESSED_PATH),
        "sample": info(SAMPLE_PATH),
        "raw_default": info(raw_path()),
        "active_source": "processed" if PROCESSED_PATH.exists() else ("sample" if SAMPLE_PATH.exists() else "none"),
    }
