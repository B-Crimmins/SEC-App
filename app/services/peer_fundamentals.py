"""
Peer fundamentals fetcher — wraps yfinance.Ticker.info to pull TTM
financials + market data for relative-valuation multiples in a single
HTTP roundtrip per peer.

We use yfinance (not XBRL) for the peer set for two reasons:
  1. TTM stitching from raw XBRL would require 5–7 filings per peer.
     yfinance.info returns it already stitched — same TTM data backing
     Bloomberg's RV screen.
  2. Market cap / enterprise value need a recent equity price, which
     SEC filings don't carry.

For the *target* company the rest of the app stays on XBRL; this module
is invoked once per peer (and once for the target's market metrics)
within the relative-valuation flow.

Cache: 24h in-memory, same TTL as peer_pricing — these fundamentals
change at most quarterly.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

_TTL_SECONDS = 24 * 60 * 60
_cache: Dict[str, tuple] = {}
_lock = threading.Lock()


@dataclass
class PeerFundamentals:
    """TTM-adjusted equity + market metrics for a single ticker.

    Every numeric field is in USD and absolute (no millions/billions
    scaling) so downstream multiples are unit-free.
    """
    symbol: str
    company_name: Optional[str]
    sector: Optional[str]
    industry: Optional[str]

    price: Optional[float]
    shares_outstanding: Optional[float]
    market_cap: Optional[float]
    enterprise_value: Optional[float]

    revenue_ttm: Optional[float]
    ebitda_ttm: Optional[float]
    ebit_ttm: Optional[float]
    net_income_ttm: Optional[float]
    book_value_per_share: Optional[float]

    total_debt: Optional[float]
    total_cash: Optional[float]

    # Growth + return + earnings-quality metrics. Used by the category
    # health computation in relative_valuation.py — every field here is
    # a category input, so don't drop fields without checking the service.
    revenue_growth_ttm: Optional[float]
    earnings_growth_ttm: Optional[float]
    gross_margin: Optional[float]
    operating_margin: Optional[float]
    return_on_equity: Optional[float]
    interest_expense_ttm: Optional[float]

    def to_dict(self) -> Dict:
        return asdict(self)


def _now() -> float:
    return time.time()


def _from_cache(symbol: str) -> Optional[PeerFundamentals]:
    with _lock:
        entry = _cache.get(symbol)
    if not entry:
        return None
    obj, ts = entry
    if _now() - ts > _TTL_SECONDS:
        return None
    return obj


def _to_cache(symbol: str, obj: PeerFundamentals) -> None:
    with _lock:
        _cache[symbol] = (obj, _now())


def _safe_float(v) -> Optional[float]:
    """Coerce yfinance values to floats. yfinance uses pandas NaN, None,
    and occasionally a string sentinel — collapse all of them to None."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _fetch_one(symbol: str) -> Optional[PeerFundamentals]:
    try:
        import yfinance as yf
    except Exception as exc:
        logger.warning("yfinance not importable: %s", exc)
        return None

    try:
        t = yf.Ticker(symbol)
        info = t.info or {}
    except Exception as exc:
        logger.warning("yfinance Ticker(%s).info failed: %s", symbol, exc)
        return None

    if not info or not info.get("symbol") and not info.get("shortName"):
        logger.warning("yfinance returned empty info for %s", symbol)
        return None

    # Price: prefer regularMarketPrice (the official close); fall back to
    # currentPrice (intraday) for after-hours edge cases.
    price = _safe_float(info.get("regularMarketPrice")) \
        or _safe_float(info.get("currentPrice")) \
        or _safe_float(info.get("previousClose"))

    # ebitda is TTM in yfinance's schema. ebit isn't always populated —
    # back into it from operating margin × revenue when missing.
    ebitda = _safe_float(info.get("ebitda"))
    revenue = _safe_float(info.get("totalRevenue"))
    op_margin = _safe_float(info.get("operatingMargins"))
    ebit = _safe_float(info.get("ebit"))
    if ebit is None and op_margin is not None and revenue is not None:
        ebit = op_margin * revenue

    book_per_share = _safe_float(info.get("bookValue"))
    if book_per_share is None:
        # Some non-US ADRs surface bookValue at the equity-level instead
        # — divide by shares to get per-share. Best-effort only.
        equity = _safe_float(info.get("totalStockholderEquity"))
        sh = _safe_float(info.get("sharesOutstanding"))
        if equity is not None and sh and sh > 0:
            book_per_share = equity / sh

    return PeerFundamentals(
        symbol=symbol.upper(),
        company_name=info.get("longName") or info.get("shortName"),
        sector=info.get("sector"),
        industry=info.get("industry"),

        price=price,
        shares_outstanding=_safe_float(info.get("sharesOutstanding")),
        market_cap=_safe_float(info.get("marketCap")),
        enterprise_value=_safe_float(info.get("enterpriseValue")),

        revenue_ttm=revenue,
        ebitda_ttm=ebitda,
        ebit_ttm=ebit,
        net_income_ttm=_safe_float(info.get("netIncomeToCommon")),
        book_value_per_share=book_per_share,

        total_debt=_safe_float(info.get("totalDebt")),
        total_cash=_safe_float(info.get("totalCash")),

        revenue_growth_ttm=_safe_float(info.get("revenueGrowth")),
        earnings_growth_ttm=_safe_float(info.get("earningsGrowth"))
            or _safe_float(info.get("earningsQuarterlyGrowth")),
        gross_margin=_safe_float(info.get("grossMargins")),
        operating_margin=op_margin,
        return_on_equity=_safe_float(info.get("returnOnEquity")),
        interest_expense_ttm=_safe_float(info.get("interestExpense")),
    )


def get_fundamentals(symbol: str) -> Optional[PeerFundamentals]:
    if not symbol:
        return None
    key = symbol.strip().upper()
    if not key:
        return None
    hit = _from_cache(key)
    if hit is not None:
        return hit
    obj = _fetch_one(key)
    if obj is not None:
        _to_cache(key, obj)
    return obj


def get_many(symbols: List[str]) -> Dict[str, Optional[PeerFundamentals]]:
    out: Dict[str, Optional[PeerFundamentals]] = {}
    seen: set = set()
    for s in symbols:
        if not s:
            continue
        key = s.strip().upper()
        if not key or key in seen:
            continue
        seen.add(key)
        out[key] = get_fundamentals(key)
    return out
