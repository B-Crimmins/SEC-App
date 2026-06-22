"""Lightweight validators for incoming TotalView-style report JSON."""
from __future__ import annotations

from typing import Any


class JSONValidationError(ValueError):
    """Raised when raw report JSON is missing required structure."""


REQUIRED_TOP_LEVEL_KEYS = ("Reports",)
REQUIRED_REPORT_PATHS: tuple[tuple[str, ...], ...] = (
    ("Data", "SubjectProperty", "SitusAddress", "State"),
    ("Data", "SubjectProperty", "SitusAddress", "County"),
)


def _get_path(obj: Any, path: tuple[str, ...]) -> Any:
    cur = obj
    for k in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def validate_totalview_payload(payload: Any) -> None:
    """Raise JSONValidationError if payload doesn't look like TotalView reports.

    The shape we expect (very loosely):
        {"Reports": [ { "Data": { "SubjectProperty": { "SitusAddress": {
            "State": "TX", "County": "HARRIS", ... }}}}, ... ] }

    We don't fail on a single bad report — we just require the top-level
    'Reports' list and that AT LEAST one report has the required address path.
    """
    if not isinstance(payload, dict):
        raise JSONValidationError("Root JSON must be an object.")
    for key in REQUIRED_TOP_LEVEL_KEYS:
        if key not in payload:
            raise JSONValidationError(f"Missing required top-level key: '{key}'.")
    reports = payload.get("Reports")
    if not isinstance(reports, list):
        raise JSONValidationError("'Reports' must be a list.")
    if not reports:
        raise JSONValidationError("'Reports' list is empty — nothing to ingest.")

    usable = 0
    for rep in reports:
        if not isinstance(rep, dict):
            continue
        if all(_get_path(rep, p) for p in REQUIRED_REPORT_PATHS):
            usable += 1
    if usable == 0:
        raise JSONValidationError(
            "No report contained the required address fields "
            "(Data.SubjectProperty.SitusAddress.State and .County)."
        )
