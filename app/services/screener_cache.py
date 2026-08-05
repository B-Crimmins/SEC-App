"""
Screener cache pipeline.

Three-stage refresh:

  1. refresh_universe(): pulls SEC's company_tickers_exchange.json
     (~10k filers), upserts ticker/cik/name/exchange into ticker_universe.

  2. refresh_ratios(limit=None, exchanges=None): walks ticker_universe,
     for each CIK pulls financial statements via SECService and computes
     ratios via FinancialRatioCalculator, upserts into ratio_cache.
     SIC/industry/sector also enriched onto ticker_universe during this
     pass (each company lookup gives them for free).

  3. refresh_averages(report_type='10-K', period=None): aggregates from
     ratio_cache, computes mean/median per (industry|sector, period,
     metric), upserts into industry_averages and sector_averages.

Designed to run as a single command (`refresh_all`) or in stages.
Monthly cron suggested.
"""

from __future__ import annotations

import logging
import statistics
import time
from datetime import datetime, timezone
from typing import Iterable, List, Optional, Sequence

import requests
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from database import SessionLocal
from models.screener import (
    TickerUniverse, RatioCache, IndustryAverage, SectorAverage,
)
from services.sec_service import SECService
from services.financial_ratios import FinancialRatioCalculator
from services.filer_schema import detect_filer_schema
from services.sic_sectors import sector_from_sic, display_industry

logger = logging.getLogger(__name__)

# Metrics we cache per ticker. Same lineup as the Benchmark UI columns.
CACHED_METRICS = [
    "gross_profit_margin", "operating_margin", "net_margin", "ebitda_margin",
    "roe", "roa", "roic", "current_ratio", "quick_ratio", "debt_to_equity",
    "interest_coverage", "inventory_turnover", "sga_percent_of_revenue",
]

EXCHANGES_JSON_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
USER_AGENT = "intrinsiq research bryson@example.com"


# ---------------------------------------------------------------------------
# Universe refresh
# ---------------------------------------------------------------------------

def refresh_universe(db: Session) -> dict:
    """Pull the SEC's ticker-exchange table and upsert ticker_universe rows."""
    logger.info("Fetching %s", EXCHANGES_JSON_URL)
    r = requests.get(EXCHANGES_JSON_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    payload = r.json()
    fields: List[str] = payload["fields"]
    rows = payload["data"]
    idx = {name: fields.index(name) for name in fields}

    upserts = 0
    now = datetime.now(timezone.utc)
    for row in rows:
        cik = str(row[idx["cik"]]).zfill(10)
        ticker = row[idx["ticker"]] or ""
        name = row[idx["name"]] or ""
        exchange = row[idx["exchange"]] or None

        stmt = pg_insert(TickerUniverse).values(
            cik=cik, ticker=ticker.upper(), company_name=name,
            exchange=exchange, refreshed_at=now,
        ).on_conflict_do_update(
            index_elements=["cik"],
            set_={"ticker": ticker.upper(), "company_name": name,
                  "exchange": exchange, "refreshed_at": now},
        )
        db.execute(stmt)
        upserts += 1
    db.commit()
    logger.info("Upserted %s rows into ticker_universe", upserts)
    return {"upserts": upserts, "rows_in_source": len(rows)}


# ---------------------------------------------------------------------------
# Universe enrichment (SIC / industry / sector)
# ---------------------------------------------------------------------------

def enrich_universe(
    db: Session,
    *,
    exchanges: Optional[Sequence[str]] = None,
    limit: Optional[int] = None,
    force: bool = False,
    sleep_between: float = 0.12,
) -> dict:
    """Fill sic/industry/sector on ticker_universe rows.

    Decoupled from the (slow) ratio refresh — needs only one EDGAR call
    per CIK. ~17 minutes for the full ~8k universe at 8 req/sec.

    Args:
        exchanges: optional list to scope (e.g. ['NYSE', 'Nasdaq']).
        limit: cap on rows processed.
        force: re-enrich rows that already have all three fields.
        sleep_between: seconds between EDGAR calls.
    """
    q = select(TickerUniverse)
    if exchanges:
        q = q.where(TickerUniverse.exchange.in_(list(exchanges)))
    if not force:
        # Only refresh rows missing any of the three enrichment fields.
        q = q.where((TickerUniverse.sic.is_(None))
                    | (TickerUniverse.industry.is_(None))
                    | (TickerUniverse.sector.is_(None)))
    q = q.order_by(TickerUniverse.ticker)
    if limit:
        q = q.limit(limit)
    rows = db.execute(q).scalars().all()

    sec = SECService()
    stats = {"processed": 0, "enriched": 0, "errors": 0, "skipped": 0}
    now = datetime.now(timezone.utc)

    for row in rows:
        stats["processed"] += 1
        ticker = row.ticker
        if not ticker:
            stats["skipped"] += 1
            continue
        try:
            match = None
            for comp in sec.search_companies(ticker) or []:
                if comp.get("ticker", "").upper() == ticker:
                    match = comp
                    break
            if match:
                row.sic = (match.get("sic") or "")[:4] or None
                row.industry = display_industry(match.get("industry")) or None
                row.sector = match.get("sector") or sector_from_sic(row.sic)
                row.refreshed_at = now
                stats["enriched"] += 1
            else:
                stats["skipped"] += 1
            db.commit()
            time.sleep(sleep_between)
        except Exception as e:
            logger.warning("enrich_universe error for %s: %s", ticker, e)
            stats["errors"] += 1
            db.rollback()

    logger.info("enrich_universe done: %s", stats)
    return stats


# ---------------------------------------------------------------------------
# Ratio cache refresh
# ---------------------------------------------------------------------------

def refresh_ratios(
    db: Session,
    *,
    report_type: str = "10-K",
    period: Optional[str] = None,
    exchanges: Optional[Sequence[str]] = None,
    limit: Optional[int] = None,
    sleep_between: float = 0.12,  # ~8 req/sec, under SEC's 10/sec cap
) -> dict:
    """Walk the universe, pull financials per CIK, compute ratios, cache.

    Also enriches ticker_universe with sic/industry/sector since each
    company lookup gives them for free.

    Args:
        report_type: '10-K' or '10-Q'.
        period: e.g. '2024' for 10-K, 'Q2 2024' for 10-Q. Defaults to
            last completed fiscal year for 10-K.
        exchanges: limit refresh to listed exchanges (e.g. ['NYSE', 'Nasdaq']).
        limit: cap on number of tickers processed (useful for dev / first run).
        sleep_between: seconds to sleep between requests to respect EDGAR
            rate limit.
    """
    if period is None and report_type == "10-K":
        period = str(datetime.now(timezone.utc).year - 1)

    q = select(TickerUniverse)
    if exchanges:
        q = q.where(TickerUniverse.exchange.in_(list(exchanges)))
    q = q.order_by(TickerUniverse.ticker)
    if limit:
        q = q.limit(limit)
    universe = db.execute(q).scalars().all()

    sec = SECService()
    calc = FinancialRatioCalculator()
    stats = {"processed": 0, "with_data": 0, "errors": 0, "skipped_no_cik": 0}
    now = datetime.now(timezone.utc)

    for row in universe:
        stats["processed"] += 1
        cik = row.cik
        ticker = row.ticker
        if not cik:
            stats["skipped_no_cik"] += 1
            continue

        try:
            # Enrich universe with sic/industry/sector (one search_companies
            # call gives all three; cheap relative to financials).
            for comp in sec.search_companies(ticker) or []:
                if comp.get("ticker", "").upper() == ticker:
                    row.sic = (comp.get("sic") or "")[:4] or None
                    row.industry = display_industry(comp.get("industry")) or None
                    row.sector = comp.get("sector") or sector_from_sic(row.sic)
                    break
            time.sleep(sleep_between)

            financial = sec.get_financial_statements(cik, report_type, period)
            if not financial or not financial.get("income_statement"):
                continue

            is_ = financial.get("income_statement") or {}
            bs = financial.get("balance_sheet") or {}
            cf = financial.get("cash_flow") or {}
            schema = detect_filer_schema(is_.keys(), bs.keys())
            values = calc._extract_key_values(is_, bs, cf, user_inputs={})
            ratios = calc._calculate_ratios(values, schema=schema)
            stats["with_data"] += 1

            for metric_key in CACHED_METRICS:
                entry = ratios.get(metric_key) or {}
                val = entry.get("value")
                stmt = pg_insert(RatioCache).values(
                    cik=cik, ticker=ticker, report_type=report_type,
                    period=period, metric_key=metric_key,
                    value=val if val is not None else None,
                    refreshed_at=now,
                ).on_conflict_do_update(
                    index_elements=["cik", "report_type", "period", "metric_key"],
                    set_={"value": val if val is not None else None,
                          "ticker": ticker, "refreshed_at": now},
                )
                db.execute(stmt)

            # Commit per ticker so a crash midway doesn't wipe progress.
            db.commit()
            time.sleep(sleep_between)

        except Exception as e:
            logger.warning("refresh_ratios error for %s (%s): %s", ticker, cik, e)
            stats["errors"] += 1
            db.rollback()

    logger.info("refresh_ratios done: %s", stats)
    return {**stats, "report_type": report_type, "period": period}


# ---------------------------------------------------------------------------
# Industry / sector averages refresh
# ---------------------------------------------------------------------------

def refresh_averages(
    db: Session,
    *,
    report_type: str = "10-K",
    period: Optional[str] = None,
) -> dict:
    """Aggregate ratio_cache into industry_averages + sector_averages.

    For each (industry|sector, period, metric) computes mean, median,
    and n (non-null sample size). Outliers aren't clipped — that's the
    UI's job if it wants to.
    """
    if period is None and report_type == "10-K":
        period = str(datetime.now(timezone.utc).year - 1)

    # Join ratio_cache to ticker_universe to get industry/sector tags.
    rows = db.execute(
        select(
            RatioCache.metric_key, RatioCache.value,
            TickerUniverse.industry, TickerUniverse.sector,
        )
        .join(TickerUniverse, TickerUniverse.cik == RatioCache.cik)
        .where(RatioCache.report_type == report_type)
        .where(RatioCache.period == period)
        .where(RatioCache.value.isnot(None))
    ).all()

    # Bucket values by (key, group, metric)
    industry_buckets: dict[tuple, list[float]] = {}
    sector_buckets: dict[tuple, list[float]] = {}
    for metric_key, value, industry, sector in rows:
        if industry:
            industry_buckets.setdefault((industry, metric_key), []).append(value)
        if sector:
            sector_buckets.setdefault((sector, metric_key), []).append(value)

    now = datetime.now(timezone.utc)

    def _stats(values: list[float]) -> tuple[float, float, int]:
        n = len(values)
        if n == 0:
            return None, None, 0
        return (statistics.mean(values), statistics.median(values), n)

    industry_upserts = 0
    for (industry, metric_key), vals in industry_buckets.items():
        mean, median, n = _stats(vals)
        stmt = pg_insert(IndustryAverage).values(
            industry=industry, report_type=report_type, period=period,
            metric_key=metric_key, mean=mean, median=median, n=n,
            refreshed_at=now,
        ).on_conflict_do_update(
            index_elements=["industry", "report_type", "period", "metric_key"],
            set_={"mean": mean, "median": median, "n": n, "refreshed_at": now},
        )
        db.execute(stmt)
        industry_upserts += 1

    sector_upserts = 0
    for (sector, metric_key), vals in sector_buckets.items():
        mean, median, n = _stats(vals)
        stmt = pg_insert(SectorAverage).values(
            sector=sector, report_type=report_type, period=period,
            metric_key=metric_key, mean=mean, median=median, n=n,
            refreshed_at=now,
        ).on_conflict_do_update(
            index_elements=["sector", "report_type", "period", "metric_key"],
            set_={"mean": mean, "median": median, "n": n, "refreshed_at": now},
        )
        db.execute(stmt)
        sector_upserts += 1

    db.commit()
    logger.info("refresh_averages: industry=%s sector=%s", industry_upserts, sector_upserts)
    return {
        "industry_upserts": industry_upserts,
        "sector_upserts": sector_upserts,
        "report_type": report_type,
        "period": period,
    }


# ---------------------------------------------------------------------------
# One-shot orchestrator
# ---------------------------------------------------------------------------

def refresh_all(
    *,
    report_type: str = "10-K",
    period: Optional[str] = None,
    exchanges: Optional[Sequence[str]] = None,
    limit: Optional[int] = None,
) -> dict:
    db = SessionLocal()
    try:
        u = refresh_universe(db)
        e = enrich_universe(db, exchanges=exchanges)
        r = refresh_ratios(db, report_type=report_type, period=period,
                           exchanges=exchanges, limit=limit)
        a = refresh_averages(db, report_type=report_type, period=period)
        return {"universe": u, "enrichment": e, "ratios": r, "averages": a}
    finally:
        db.close()
