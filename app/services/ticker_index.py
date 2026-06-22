"""In-memory autocomplete index over SEC's ticker → company file.

Loads `company_tickers_exchange.json` (~10K rows, ~1.5 MB) from sec.gov
once on first use and serves it to the typeahead endpoint in O(N) per
search. The file is small enough that a linear scan is fine; if it ever
grows past ~50K rows we'd swap to a trie or RapidFuzz.
"""
from __future__ import annotations

import logging
from threading import Lock
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

_INDEX: Optional[List[Dict[str, str]]] = None
_LOAD_LOCK = Lock()

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
SEC_USER_AGENT = "Intrinsiq research support@intrinsiq.app"


def _load() -> List[Dict[str, str]]:
    """Fetch + normalize the SEC ticker file. Idempotent / thread-safe."""
    global _INDEX
    if _INDEX is not None:
        return _INDEX
    with _LOAD_LOCK:
        if _INDEX is not None:  # double-checked
            return _INDEX
        logger.info("Loading SEC ticker index from %s", SEC_TICKERS_URL)
        resp = requests.get(
            SEC_TICKERS_URL,
            headers={"User-Agent": SEC_USER_AGENT, "Accept": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        payload = resp.json()
        fields = payload.get("fields") or []
        rows = payload.get("data") or []
        # SEC field order is generally [cik, name, ticker, exchange] but
        # don't assume — resolve by name so the loader survives a change.
        idx = {name: i for i, name in enumerate(fields)}
        i_cik, i_name, i_tkr, i_exch = (
            idx.get("cik", 0),
            idx.get("name", 1),
            idx.get("ticker", 2),
            idx.get("exchange", 3),
        )
        normalized: List[Dict[str, str]] = []
        for row in rows:
            ticker = (row[i_tkr] or "").strip().upper()
            if not ticker:
                continue
            normalized.append({
                "cik": str(row[i_cik]) if row[i_cik] is not None else "",
                "name": (row[i_name] or "").strip(),
                "ticker": ticker,
                "exchange": (row[i_exch] or "").strip(),
                "_name_lower": (row[i_name] or "").strip().lower(),
            })
        logger.info("SEC ticker index loaded: %d entries", len(normalized))
        _INDEX = normalized
        return _INDEX


def search(query: str, limit: int = 20) -> List[Dict[str, str]]:
    """Three-tier ranking: ticker-prefix, ticker-substring, name-substring.

    Empty query returns [] (avoid shipping the whole 10K list across the wire).
    """
    q = (query or "").strip()
    if not q:
        return []

    index = _load()
    q_upper = q.upper()
    q_lower = q.lower()

    prefix_hits: List[Dict[str, str]] = []
    tkr_substr_hits: List[Dict[str, str]] = []
    name_hits: List[Dict[str, str]] = []

    for item in index:
        t = item["ticker"]
        if t.startswith(q_upper):
            prefix_hits.append(item)
        elif q_upper in t:
            tkr_substr_hits.append(item)
        elif q_lower in item["_name_lower"]:
            name_hits.append(item)
        # Early exit: once we have 3× the limit across all buckets we
        # have plenty to rank. Avoids touching every row for short queries.
        if len(prefix_hits) >= limit * 3:
            break

    # Sort prefix hits by ticker length (shorter = closer match), then alpha.
    prefix_hits.sort(key=lambda x: (len(x["ticker"]), x["ticker"]))
    # Name hits sorted alpha by company name.
    name_hits.sort(key=lambda x: x["_name_lower"])

    merged = prefix_hits + tkr_substr_hits + name_hits
    seen: set[str] = set()
    out: List[Dict[str, str]] = []
    for item in merged:
        if item["ticker"] in seen:
            continue
        seen.add(item["ticker"])
        out.append({
            "ticker": item["ticker"],
            "company_name": item["name"],
            "exchange": item["exchange"],
            "cik": item["cik"],
        })
        if len(out) >= limit:
            break
    return out
