"""
Screener cache tables.

Three tables back the Benchmark / Industry-Screener portal:

  - ticker_universe       — every SEC filer (mainly NYSE/Nasdaq), the
                            ticker → CIK mapping, primary exchange, SIC
                            code, industry name, sector name. Refreshed
                            monthly from SEC's company_tickers_exchange.json
                            plus per-CIK enrichment.

  - ratio_cache           — per (ticker, period, metric) the computed ratio
                            value. Avoids re-running every ratio for every
                            screener page-load.

  - industry_averages /   — pre-aggregated mean/median per
    sector_averages         (industry|sector, period, metric, value). The
                            screener UI shows these as the "industry avg"
                            against which each ticker is benchmarked.

The cache is monthly-refreshed via an admin endpoint or scheduled job.
Last-refresh timestamps live on each row so freshness can be surfaced
in the UI.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Index, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class TickerUniverse(Base):
    __tablename__ = "ticker_universe"

    id = Column(Integer, primary_key=True, index=True)
    cik = Column(String(12), nullable=False, unique=True, index=True)
    ticker = Column(String(10), nullable=False, index=True)
    company_name = Column(String(256), nullable=False)
    exchange = Column(String(32), nullable=True, index=True)  # 'Nasdaq', 'NYSE', 'OTC', 'CBOE'
    sic = Column(String(4), nullable=True, index=True)
    industry = Column(String(128), nullable=True, index=True)
    sector = Column(String(128), nullable=True, index=True)
    refreshed_at = Column(DateTime(timezone=True), server_default=func.now())


class RatioCache(Base):
    __tablename__ = "ratio_cache"

    id = Column(Integer, primary_key=True, index=True)
    cik = Column(String(12), nullable=False, index=True)
    ticker = Column(String(10), nullable=False, index=True)
    report_type = Column(String(8), nullable=False)   # '10-K' or '10-Q'
    period = Column(String(16), nullable=False)        # '2024' or 'Q2 2024'
    metric_key = Column(String(64), nullable=False, index=True)
    value = Column(Float, nullable=True)
    refreshed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("cik", "report_type", "period", "metric_key",
                         name="uq_ratio_cache_cik_period_metric"),
        Index("ix_ratio_cache_lookup", "ticker", "report_type", "period"),
    )


class IndustryAverage(Base):
    """Pre-aggregated average per (industry, period, metric).
    Mean and median both stored — median is more robust for ratios with
    fat tails (e.g. P/E, debt/equity). Frontend can pick which to show.
    """
    __tablename__ = "industry_averages"

    id = Column(Integer, primary_key=True, index=True)
    industry = Column(String(128), nullable=False, index=True)
    report_type = Column(String(8), nullable=False)
    period = Column(String(16), nullable=False, index=True)
    metric_key = Column(String(64), nullable=False, index=True)
    mean = Column(Float, nullable=True)
    median = Column(Float, nullable=True)
    n = Column(Integer, nullable=False, default=0)
    refreshed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("industry", "report_type", "period", "metric_key",
                         name="uq_industry_avg_industry_period_metric"),
    )


class SectorAverage(Base):
    """Same shape as IndustryAverage but keyed by SIC Major Group sector."""
    __tablename__ = "sector_averages"

    id = Column(Integer, primary_key=True, index=True)
    sector = Column(String(128), nullable=False, index=True)
    report_type = Column(String(8), nullable=False)
    period = Column(String(16), nullable=False, index=True)
    metric_key = Column(String(64), nullable=False, index=True)
    mean = Column(Float, nullable=True)
    median = Column(Float, nullable=True)
    n = Column(Integer, nullable=False, default=0)
    refreshed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("sector", "report_type", "period", "metric_key",
                         name="uq_sector_avg_sector_period_metric"),
    )
