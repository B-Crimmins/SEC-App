"""Revenue segment analysis — product, geography, and business-segment splits.

Pulls dimensional XBRL rows from a filing's income statement and buckets them
by their `dimension_axis` so callers can render stacked bars / pies without
having to interpret the XBRL dimensional structure.

The `sec_service.SECService` normally *drops* dimensional rows before handing
data back; this module keeps them. It reuses the same filing discovery and
date-column heuristics so behaviour stays aligned with the rest of the app.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import pandas as pd

from services.sec_service import SECService, _find_period_column

logger = logging.getLogger(__name__)


# Axis labels we split revenue by. Anything outside this map is ignored.
_AXIS_BUCKETS: Dict[str, str] = {
    "srt:ProductOrServiceAxis": "product",
    "srt:StatementGeographicalAxis": "geography",
    "srt:ConsolidationItemsAxis": "business_segment",
    # Less common aliases seen across filers.
    "us-gaap:StatementGeographicalAxis": "geography",
    "us-gaap:ProductOrServiceAxis": "product",
}

# Revenue concepts we consider. Order matters only for picking a total.
_REVENUE_CONCEPTS = (
    "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",
    "us-gaap_Revenues",
    "us-gaap_SalesRevenueNet",
    "us-gaap_RevenueFromContractWithCustomerIncludingAssessedTax",
)


def _is_revenue_concept(concept: str, standard_concept: Optional[str]) -> bool:
    if concept in _REVENUE_CONCEPTS:
        return True
    if standard_concept and str(standard_concept).strip().lower() == "revenue":
        return True
    return False


def _pick_revenue_concept(df: pd.DataFrame) -> Optional[str]:
    """Pick the single revenue concept to report on.

    Prefer the concept with the most dimensional breakdown rows so we maximize
    segment coverage; fall back to the first matching concept.
    """
    if "concept" not in df.columns:
        return None

    candidates: Dict[str, int] = {}
    std_col = "standard_concept" in df.columns
    for _, row in df.iterrows():
        concept = row.get("concept")
        if not isinstance(concept, str):
            continue
        std = row.get("standard_concept") if std_col else None
        if not _is_revenue_concept(concept, std):
            continue
        if row.get("dimension") is True:
            candidates[concept] = candidates.get(concept, 0) + 1
        else:
            candidates.setdefault(concept, 0)

    if not candidates:
        return None
    return max(candidates.items(), key=lambda kv: kv[1])[0]


def _extract_rollup_value(df: pd.DataFrame, concept: str, period_col: str) -> Optional[float]:
    """Return the non-dimensional total for a given revenue concept."""
    mask = (df["concept"] == concept)
    if "dimension" in df.columns:
        mask = mask & (df["dimension"] != True)  # noqa: E712
    rows = df[mask]
    if rows.empty:
        return None
    val = rows.iloc[0].get(period_col)
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _dimensional_rows(df: pd.DataFrame, concept: str) -> pd.DataFrame:
    mask = (df["concept"] == concept)
    if "dimension" in df.columns:
        mask = mask & (df["dimension"] == True)  # noqa: E712
    return df[mask]


def _build_buckets(
    rows: pd.DataFrame, period_col: str
) -> Dict[str, List[Dict[str, Any]]]:
    buckets: Dict[str, List[Dict[str, Any]]] = {
        "product": [],
        "geography": [],
        "business_segment": [],
    }
    if rows.empty:
        return buckets

    for _, row in rows.iterrows():
        axis = row.get("dimension_axis")
        bucket_key = _AXIS_BUCKETS.get(str(axis)) if axis else None
        if bucket_key is None:
            continue

        value = row.get(period_col)
        if value is None or (isinstance(value, float) and pd.isna(value)):
            continue
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            continue

        member = row.get("dimension_member")
        label = row.get("label") or row.get("dimension_member_label") or str(member)
        buckets[bucket_key].append(
            {
                "member": str(member) if member is not None else "",
                "label": str(label),
                "value": numeric_value,
                "is_breakdown": bool(row.get("is_breakdown")) if "is_breakdown" in rows.columns else False,
            }
        )

    # Sort each bucket descending by value so the largest segments surface first.
    for key in buckets:
        buckets[key].sort(key=lambda r: r["value"], reverse=True)
    return buckets


class SegmentAnalysisService:
    """Revenue segmentation (product / geography / business segment) per period."""

    def __init__(self, sec_service: Optional[SECService] = None):
        self._sec = sec_service or SECService()

    def get_revenue_segments(
        self, cik: str, report_type: str, period: str
    ) -> Dict[str, Any]:
        """Return revenue buckets for a single filing period.

        Response shape:
            {
                "period": "2024",
                "concept": "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",
                "total": float | None,
                "product":          [{member, label, value, is_breakdown}, ...],
                "geography":        [...],
                "business_segment": [...],
            }
        """
        filing = self._sec._find_filing(cik, report_type, period)  # reuse existing matcher
        if filing is None:
            logger.warning("No %s filing for CIK %s period %s", report_type, cik, period)
            return self._empty(period)

        financials = SECService._extract_financials(filing)
        if financials is None:
            return self._empty(period)

        try:
            income = financials.income_statement()
            df = income.to_dataframe() if income is not None else None
        except Exception as exc:
            logger.warning("income_statement.to_dataframe failed: %s", exc)
            return self._empty(period)

        if df is None or df.empty:
            return self._empty(period)

        period_col = _find_period_column(df, period)
        if period_col is None:
            return self._empty(period)

        concept = _pick_revenue_concept(df)
        if concept is None:
            return self._empty(period)

        dim_rows = _dimensional_rows(df, concept)
        buckets = _build_buckets(dim_rows, period_col)
        total = _extract_rollup_value(df, concept, period_col)

        return {
            "period": str(period),
            "concept": concept,
            "total": total,
            **buckets,
        }

    def get_revenue_segments_multi_period(
        self, cik: str, report_type: str, periods: List[str]
    ) -> Dict[str, Any]:
        """Return per-period buckets for a multi-year series.

        Response shape:
            {
                "cik": "...",
                "report_type": "10-K",
                "periods": ["2022","2023","2024"],
                "by_period": { "2022": {...}, ... },
            }
        """
        by_period: Dict[str, Any] = {}
        for period in periods:
            by_period[str(period)] = self.get_revenue_segments(cik, report_type, period)
        return {
            "cik": str(cik),
            "report_type": report_type,
            "periods": [str(p) for p in periods],
            "by_period": by_period,
        }

    @staticmethod
    def _empty(period: str) -> Dict[str, Any]:
        return {
            "period": str(period),
            "concept": None,
            "total": None,
            "product": [],
            "geography": [],
            "business_segment": [],
        }
