"""
Peer pricing service — process-local 24h cache around yfinance.

Multiples (EV/EBITDA, P/E, P/B, …) all require a recent equity price for
each peer; SEC XBRL only carries share counts, not prices. yfinance is
free and key-less, so this module wraps it with a TTL cache so a single
relative-valuation request (5–10 peers) doesn't redundantly hammer the
upstream endpoint when the user adjusts the peer set.

Cache is in-memory and process-local — fine for the current single-worker
uvicorn setup. If the deployment scales to multiple workers, swap the
dict for redis but keep the same get/set surface.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# 24h freshness — closing prices for valuation comps don't need real-time
# fidelity, and yfinance throttles when hammered. One-day TTL keeps the
# UX snappy while keeping the upstream calls cheap.
_TTL_SECONDS = 24 * 60 * 60

# {symbol_upper: (price, fetched_at_epoch)}
_cache: Dict[str, tuple] = {}
_lock = threading.Lock()


def _now() -> float:
    return time.time()


def _from_cache(symbol: str) -> Optional[float]:
    with _lock:
        entry = _cache.get(symbol)
    if not entry:
        return None
    price, ts = entry
    if _now() - ts > _TTL_SECONDS:
        return None
    return price


def _to_cache(symbol: str, price: Optional[float]) -> None:
    if price is None:
        return
    with _lock:
        _cache[symbol] = (price, _now())


def _fetch_one(symbol: str) -> Optional[float]:
    """Fetch the latest close for `symbol` via yfinance.

    Returns None on any failure — the caller is expected to surface the
    missing price as a "no multiple computable" rather than to error out
    the whole request.
    """
    try:
        import yfinance as yf  # imported lazily so test envs without it still import this module
    except Exception as exc:
        logger.warning("yfinance not importable: %s", exc)
        return None

    try:
        t = yf.Ticker(symbol)
    except Exception as exc:
        logger.warning("yfinance Ticker(%s) failed: %s", symbol, exc)
        return None

    # fast_info is preferred — single HTTP roundtrip, no DataFrame parse.
    try:
        fi = getattr(t, "fast_info", None)
        if fi is not None:
            last = getattr(fi, "last_price", None)
            if last is None and isinstance(fi, dict):
                last = fi.get("last_price") or fi.get("lastPrice")
            if last is not None and float(last) > 0:
                return float(last)
    except Exception as exc:
        logger.debug("fast_info miss for %s: %s", symbol, exc)

    # Fallback: 5d history, take the most recent close.
    try:
        hist = t.history(period="5d", auto_adjust=False)
        if hist is not None and not hist.empty and "Close" in hist.columns:
            last = float(hist["Close"].dropna().iloc[-1])
            if last > 0:
                return last
    except Exception as exc:
        logger.warning("yfinance history(%s) failed: %s", symbol, exc)

    return None


def get_price(symbol: str) -> Optional[float]:
    """Return the latest close for `symbol`, using a 24h in-memory cache."""
    if not symbol:
        return None
    key = symbol.strip().upper()
    if not key:
        return None
    hit = _from_cache(key)
    if hit is not None:
        return hit
    price = _fetch_one(key)
    _to_cache(key, price)
    return price


def get_prices(symbols: List[str]) -> Dict[str, Optional[float]]:
    """Return {symbol: price|None} for a list of tickers."""
    out: Dict[str, Optional[float]] = {}
    seen: set = set()
    for s in symbols:
        if not s:
            continue
        key = s.strip().upper()
        if not key or key in seen:
            continue
        seen.add(key)
        out[key] = get_price(key)
    return out
