"""SEC data access backed by the edgartools (`edgar`) package.

All SEC HTTP calls go through edgar.Company / edgar.Financials so we rely on
the library's XBRL parsing and rate-limit handling instead of hand-rolling
requests.
"""

import logging
import re
from typing import Any, Dict, List, Optional

import pandas as pd
from edgar import Company, Financials, find_company, set_identity

logger = logging.getLogger(__name__)

# SEC requires an identifying User-Agent. edgartools takes it via set_identity.
_IDENTITY = "brysoncrimmins@yahoo.com"

_NAMESPACES = ("us-gaap", "dei", "ifrs-full", "srt")
_DATE_COL_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")

# Calendar-quarter end dates. Companies with non-calendar fiscal years still
# file 10-Qs at one of these four points roughly — we match the closest filing
# rather than requiring exact equality so we don't reject Apple's late-Sep
# fiscal-Q4 against a calendar Q3 request.
_QUARTER_END_MMDD = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}

# Accepts "Q1 2024", "2024 Q1", "2024Q1", "2024-Q1", case-insensitive.
_QUARTER_RE = re.compile(
    r"^\s*(?:Q\s*([1-4])\s*[- ]?\s*(\d{4})|(\d{4})\s*[- ]?\s*Q\s*([1-4]))\s*$",
    re.IGNORECASE,
)


def _parse_quarter_period(period: str) -> Optional[Dict[str, Any]]:
    """Parse a 10-Q period string into year + quarter + expected end date.

    Returns None if `period` is just a year (no quarter component) or in any
    other shape — callers fall back to the legacy year-only logic for 10-K.
    """
    if not period:
        return None
    m = _QUARTER_RE.match(str(period))
    if not m:
        return None
    if m.group(1):
        quarter = int(m.group(1))
        year = int(m.group(2))
    else:
        quarter = int(m.group(4))
        year = int(m.group(3))
    end_mmdd = _QUARTER_END_MMDD[quarter]
    return {
        "year": str(year),
        "quarter": quarter,
        "expected_end": f"{year}-{end_mmdd}",
        "label": f"Q{quarter} {year}",
    }


def _date_str(value: Any) -> str:
    """Best-effort YYYY-MM-DD extraction from a date / datetime / string."""
    if value is None:
        return ""
    s = str(value)
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else s

# When several us-gaap concepts share a standard_concept, prefer the
# canonical roll-up row over subtotals and supplemental disclosures. We do
# that by penalizing tell-tale substrings in the raw concept name — higher
# penalty = less canonical. Rows with no markers score 0 and win.
# The motivating example: AMD's FY24 cash flow tags four rows with
# NetCashFromOperatingActivities, including the ROU-asset supplemental
# (which is non-cash and ~$100M), so last-wins dedup replaced the real
# $3B OCF with the lease disclosure.
_CONCEPT_PENALTIES = (
    ("Abstract", 10),
    ("RightOfUseAsset", 10),
    ("IncurredButNotYetPaid", 10),
    ("NotYetPaid", 10),
    ("DiscontinuedOperations", 5),
    ("ContinuingOperations", 2),
)

# Concepts whose unit is dollars-per-share, not raw dollars. The frontend
# uses this to skip the M/B unit toggle and render with 2-decimal precision
# (otherwise an EPS of $1.50 divided by 1e6 reads as "$0.0M" → user sees
# zero). Substring match against the full us-gaap concept name.
_PER_SHARE_MARKERS = (
    "PerShare",
    "PerCommonUnit",
    "PerLimitedPartnershipUnit",
)


def _value_kind(concept_full: str) -> str:
    if any(m in concept_full for m in _PER_SHARE_MARKERS):
        return "per_share"
    return "currency"


def _concept_penalty(concept_full: str) -> int:
    score = 0
    for marker, penalty in _CONCEPT_PENALTIES:
        if marker in concept_full:
            score += penalty
    return score


def _clean_concept(concept: Any) -> str:
    """Strip common XBRL namespaces so concept keys look like 'Revenues'."""
    if concept is None:
        return ""
    name = str(concept)
    for sep in (":", "_"):
        if sep in name:
            prefix, _, rest = name.partition(sep)
            if prefix in _NAMESPACES:
                return rest
    return name


def _find_period_column(df: pd.DataFrame, year: str) -> Optional[str]:
    """Locate the YYYY-MM-DD column that covers a given fiscal year/quarter.

    Accepts either a plain year ("2024") or a quarter string ("Q2 2024") —
    the quarter form is collapsed to its 4-digit year for substring matching
    since edgartools dataframes label columns by date, not quarter.
    """
    quarter_info = _parse_quarter_period(year)
    target = quarter_info["year"] if quarter_info else str(year)
    for col in df.columns:
        if isinstance(col, str) and _DATE_COL_RE.match(col) and target in col:
            return col
    for col in df.columns:
        if isinstance(col, str) and _DATE_COL_RE.match(col):
            return col
    return None


class SECService:
    """Thin wrapper around the edgartools package."""

    def __init__(self):
        # Must be called before any edgar HTTP request; safe to call repeatedly.
        set_identity(_IDENTITY)

    # ------------------------------------------------------------------
    # Company search
    # ------------------------------------------------------------------

    def search_companies(self, query: str) -> List[Dict[str, Any]]:
        """Return up to 10 companies matching a ticker, CIK, or name query."""
        query = (query or "").strip()
        if not query:
            return []

        results: List[Dict[str, Any]] = []
        seen_tickers: set = set()

        # Direct ticker/CIK lookup — cheapest path.
        try:
            company = Company(query)
            if company is not None and getattr(company, "cik", None):
                direct = self._company_to_dict(company)
                results.append(direct)
                if direct["ticker"]:
                    seen_tickers.add(direct["ticker"].upper())
        except Exception as exc:
            logger.debug("Company(%s) direct lookup miss: %s", query, exc)

        # Fuzzy fallback for names and partial matches.
        try:
            search_results = find_company(query, top_n=10)
            if not search_results.empty:
                for _, row in search_results.results.iterrows():
                    ticker = str(row.get("ticker") or "").upper()
                    if ticker and ticker in seen_tickers:
                        continue
                    cik_raw = row.get("cik")
                    try:
                        cik_str = str(int(cik_raw))
                    except (TypeError, ValueError):
                        cik_str = str(cik_raw or "")
                    results.append({
                        "cik": cik_str,
                        "ticker": row.get("ticker") or "",
                        "company_name": row.get("company") or "",
                        "sic": "",
                        "industry": "",
                    })
                    if ticker:
                        seen_tickers.add(ticker)
                    if len(results) >= 10:
                        break
        except Exception as exc:
            logger.warning("find_company(%s) failed: %s", query, exc)

        return results

    @staticmethod
    def _company_to_dict(company) -> Dict[str, Any]:
        try:
            cik = str(int(company.cik))
        except Exception:
            cik = str(getattr(company, "cik", "") or "")

        ticker = ""
        try:
            ticker = company.get_ticker() or ""
        except Exception:
            tickers = getattr(company, "tickers", None)
            if tickers:
                ticker = tickers[0]

        from services.sic_sectors import sector_from_sic
        sic = str(getattr(company, "sic", "") or "")
        return {
            "cik": cik,
            "ticker": ticker or "",
            "company_name": getattr(company, "name", "") or "",
            "sic": sic,
            "industry": getattr(company, "industry", "") or "",
            "sector": sector_from_sic(sic) or "",
        }

    # ------------------------------------------------------------------
    # Filings
    # ------------------------------------------------------------------

    def get_company_filings(
        self, cik: str, report_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return lightweight filing metadata for a CIK."""
        try:
            company = Company(str(cik))
        except Exception as exc:
            logger.warning("Company(%s) failed: %s", cik, exc)
            return []

        try:
            filings = (
                company.get_filings(form=report_type) if report_type else company.get_filings()
            )
        except Exception as exc:
            logger.warning("get_filings(%s, %s) failed: %s", cik, report_type, exc)
            return []

        rows: List[Dict[str, Any]] = []
        try:
            for filing in filings:
                rows.append({
                    "accessionNumber": getattr(filing, "accession_number", "") or "",
                    "form": getattr(filing, "form", "") or "",
                    "filingDate": str(getattr(filing, "filing_date", "") or ""),
                    "reportDate": str(getattr(filing, "report_date", "") or ""),
                })
        except Exception as exc:
            logger.warning("iterating filings failed: %s", exc)
        return rows

    def _find_filing(self, cik: str, report_type: str, period: str):
        """Pick the filing whose period_of_report / filing_date falls in `period`.

        For 10-Q with a quarterly period (e.g. "Q2 2024"), matches by closest
        period_of_report to the calendar quarter-end (within ~45 days to
        accommodate non-calendar fiscal years). For 10-K or year-only periods,
        keeps the legacy substring match.
        """
        try:
            company = Company(str(cik))
            filings = company.get_filings(form=report_type)
        except Exception as exc:
            logger.warning("Could not load filings for %s: %s", cik, exc)
            return None

        quarter_info = _parse_quarter_period(period) if str(report_type).upper() == "10-Q" else None
        if quarter_info:
            return self._find_quarterly_filing(filings, quarter_info)

        target_year = str(period).strip()
        # Collect every year-match, then prefer the non-amendment. Amendments
        # (10-K/A, 10-Q/A) often carry only the narrative section and leave
        # the XBRL statements empty — picking them silently makes the entire
        # period look unpopulated. Original filing first, /A only as fallback.
        try:
            matches = []
            for filing in filings:
                report_date = _date_str(getattr(filing, "report_date", ""))
                filing_date = _date_str(getattr(filing, "filing_date", ""))
                if target_year and (target_year in report_date or target_year in filing_date):
                    matches.append(filing)
            if not matches:
                return None
            non_amend = [f for f in matches if not str(getattr(f, "form", "")).endswith("/A")]
            return non_amend[0] if non_amend else matches[0]
        except Exception as exc:
            logger.warning("Error scanning filings: %s", exc)
        return None

    @staticmethod
    def _find_quarterly_filing(filings, quarter_info: Dict[str, Any]):
        """Return the 10-Q filing whose period_of_report is closest to the
        calendar quarter-end. Tolerates ±45 days so non-calendar fiscal
        quarters (e.g. Apple's late-Sep Q4) still resolve correctly."""
        from datetime import date

        try:
            expected = pd.to_datetime(quarter_info["expected_end"]).date()
        except Exception:
            return None

        best = None
        best_delta = None
        try:
            for filing in filings:
                report_date_str = _date_str(getattr(filing, "report_date", "")) \
                    or _date_str(getattr(filing, "period_of_report", ""))
                if not report_date_str:
                    continue
                try:
                    rd = pd.to_datetime(report_date_str).date()
                except Exception:
                    continue
                delta = abs((rd - expected).days)
                if delta > 45:
                    continue
                if best is None or delta < best_delta:
                    best = filing
                    best_delta = delta
        except Exception as exc:
            logger.warning("Error scanning quarterly filings: %s", exc)
        if best is None:
            logger.warning(
                "No 10-Q within 45d of %s (looking for %s)",
                quarter_info["expected_end"], quarter_info["label"]
            )
        return best

    @staticmethod
    def _extract_financials(filing) -> Optional[Financials]:
        try:
            return Financials.extract(filing)
        except Exception as exc:
            logger.warning("Financials.extract failed: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Statement extraction helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _statement_dataframe(
        statement, period_filter: Optional[str] = None
    ) -> Optional[pd.DataFrame]:
        if statement is None:
            return None
        try:
            if period_filter:
                df = statement.to_dataframe(period_filter=period_filter)
            else:
                df = statement.to_dataframe()
        except TypeError:
            # Older edgartools versions don't accept period_filter — fall back
            # to the unscoped frame and let the caller pick a column.
            try:
                df = statement.to_dataframe()
            except Exception as exc:
                logger.warning("to_dataframe failed: %s", exc)
                return None
        except Exception as exc:
            logger.warning("to_dataframe failed: %s", exc)
            return None
        if df is None or not hasattr(df, "empty") or df.empty:
            return None
        # Drop XBRL dimensional breakdowns (per-segment, per-product rows) and
        # abstract header rows so we keep only roll-up concept values.
        if "dimension" in df.columns:
            df = df[df["dimension"] != True]  # noqa: E712
        if "is_breakdown" in df.columns:
            df = df[df["is_breakdown"] != True]  # noqa: E712
        # if "abstract" in df.columns:
        #     df = df[df["abstract"] != True]  # noqa: E712
        if df.empty:
            return None
        return df

    def _statement_to_concepts(
        self, statement, period: str, period_filter: Optional[str] = None
    ) -> Dict[str, Dict[str, Any]]:
        """Flatten a Statement into {key: {value, label, period, fiscal_year}}.

        Keys prefer edgartools' `standard_concept` (stable across companies —
        e.g. "Revenue", "NetIncome", "AllEquityBalance"); rows without a
        standard_concept fall back to the cleaned us-gaap concept name.
        When `period_filter` is provided (a key from xbrl.reporting_periods
        like `duration_2024-04-01_2024-06-30`), the resulting dataframe is
        scoped to just that period — used for 10-Q to pick the 3-month
        duration column instead of the YTD column.
        """
        df = self._statement_dataframe(statement, period_filter=period_filter)
        if df is None:
            return {}

        period_col = _find_period_column(df, period)
        if period_col is None:
            return {}

        concepts: Dict[str, Dict[str, Any]] = {}
        for _, row in df.iterrows():
            raw_concept = row.get("concept") if "concept" in df.columns else row.get("name")
            if raw_concept is None or (isinstance(raw_concept, float) and pd.isna(raw_concept)):
                continue
            value = row.get(period_col)
            if value is None or (isinstance(value, float) and pd.isna(value)):
                continue
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                continue

            label = row.get("label") if "label" in df.columns else raw_concept
            concept_clean = _clean_concept(raw_concept)

            std = row.get("standard_concept") if "standard_concept" in df.columns else None
            if isinstance(std, float) and pd.isna(std):
                std = None
            std = str(std).strip() if std not in (None, "") else ""

            key = std or concept_clean
            if not key:
                continue

            concept_full = str(raw_concept)
            entry = {
                "value": numeric_value,
                "label": str(label) if label is not None else key,
                "period": period_col,
                "fiscal_year": str(period),
                "concept_full": concept_full,
                "concept": concept_clean,
                "standard_concept": std,
            }

            # Rank candidates for each standard_concept key by (penalty, level).
            # Lower penalty beats higher; on a tie, lower `level` (closer to
            # the statement root) beats higher. First occurrence wins the rest.
            try:
                level = int(row.get("level")) if "level" in df.columns and row.get("level") is not None else 99
            except (TypeError, ValueError):
                level = 99
            rank = (_concept_penalty(concept_full), level)
            existing = concepts.get(key)
            if existing is None or rank < existing["_rank"]:
                entry["_rank"] = rank
                concepts[key] = entry

        for entry in concepts.values():
            entry.pop("_rank", None)
        return concepts

    # ------------------------------------------------------------------
    # Public: single-period financial statements
    # ------------------------------------------------------------------

    @staticmethod
    def _quarter_period_keys(
        xbrl, quarter_info: Dict[str, Any]
    ) -> Dict[str, Optional[str]]:
        """Pick xbrl.reporting_periods keys for a single quarter.

        For income/cashflow we want the 3-month duration ending at the
        quarter-end (~91 days). For balance sheet we want the instant on
        the quarter-end. Both fall back to the closest available period
        within ±45 days to handle non-calendar fiscal quarters.
        """
        out = {"duration": None, "instant": None}
        try:
            target = pd.to_datetime(quarter_info["expected_end"]).date()
        except Exception:
            return out
        try:
            periods = xbrl.reporting_periods or []
        except Exception:
            return out

        best_dur, best_dur_score = None, None
        best_inst, best_inst_score = None, None
        for p in periods:
            ptype = p.get("type")
            try:
                if ptype == "duration":
                    end = pd.to_datetime(p.get("end_date")).date()
                    date_delta = abs((end - target).days)
                    if date_delta > 45:
                        continue
                    days_off = abs((p.get("days") or 0) - 91)
                    score = (date_delta, days_off)
                    if best_dur is None or score < best_dur_score:
                        best_dur, best_dur_score = p, score
                elif ptype == "instant":
                    d = pd.to_datetime(p.get("date")).date()
                    delta = abs((d - target).days)
                    if delta > 45:
                        continue
                    if best_inst is None or delta < best_inst_score:
                        best_inst, best_inst_score = p, delta
            except Exception:
                continue
        if best_dur is not None:
            out["duration"] = best_dur.get("key")
        if best_inst is not None:
            out["instant"] = best_inst.get("key")
        return out

    def get_financial_statements(
        self, cik: str, report_type: str, period: str
    ) -> Dict[str, Any]:
        """Return flat concept dictionaries for a single company/period."""
        filing = self._find_filing(cik, report_type, period)
        if filing is None:
            logger.warning(
                "No %s filing matched CIK %s period %s", report_type, cik, period
            )
            return {}

        financials = self._extract_financials(filing)
        if financials is None:
            return {}

        # Quarterly 10-Q: scope each statement to a specific reporting_period
        # so we pull the 3-month duration column (income/cashflow) and the
        # quarter-end instant (balance sheet) — never the YTD column.
        quarter_info = (
            _parse_quarter_period(period)
            if str(report_type).upper() == "10-Q" else None
        )
        keys: Dict[str, Optional[str]] = {"duration": None, "instant": None}
        if quarter_info and getattr(financials, "xb", None) is not None:
            keys = self._quarter_period_keys(financials.xb, quarter_info)
            if not keys["duration"] and not keys["instant"]:
                logger.warning(
                    "No matching xbrl period for %s %s; falling back to unscoped frame",
                    cik, quarter_info["label"]
                )

        return {
            "income_statement": self._statement_to_concepts(
                financials.income_statement(), period, period_filter=keys["duration"]
            ),
            "balance_sheet": self._statement_to_concepts(
                financials.balance_sheet(), period, period_filter=keys["instant"]
            ),
            "cash_flow": self._statement_to_concepts(
                financials.cash_flow_statement(), period, period_filter=keys["duration"]
            ),
            "metadata": {
                "cik": str(cik),
                "report_type": report_type,
                "period": str(period),
                "accession_number": getattr(filing, "accession_number", "") or "",
                "filing_date": str(getattr(filing, "filing_date", "") or ""),
                "report_date": str(getattr(filing, "report_date", "") or ""),
            },
        }

    # ------------------------------------------------------------------
    # Public: multi-year statements
    # ------------------------------------------------------------------

    def get_financial_statements_multiple_years(
        self, cik: str, report_type: str, periods: List[str]
    ) -> Dict[str, Any]:
        historical_data: Dict[str, Any] = {}
        available_periods: List[str] = []

        for period in periods:
            year_data = self.get_financial_statements(cik, report_type, period)
            if year_data and any(
                year_data.get(k) for k in ("income_statement", "balance_sheet", "cash_flow")
            ):
                historical_data[period] = year_data
                available_periods.append(period)

        if not historical_data:
            return {}

        return {
            "company_cik": str(cik),
            "report_type": report_type,
            "available_years": available_periods,
            "historical_data": historical_data,
            "trend_analysis": self._prepare_trend_analysis(historical_data),
        }

    @staticmethod
    def _prepare_trend_analysis(historical_data: Dict[str, Any]) -> Dict[str, Any]:
        trend_data: Dict[str, Any] = {
            "income_statement_trends": {},
            "balance_sheet_trends": {},
            "cash_flow_trends": {},
            "key_metrics": {},
        }
        for statement_type in ("income_statement", "balance_sheet", "cash_flow"):
            bucket = trend_data[f"{statement_type}_trends"]
            for year, year_data in historical_data.items():
                for concept_name, concept_data in year_data.get(statement_type, {}).items():
                    bucket.setdefault(concept_name, {})[year] = {
                        "value": concept_data.get("value"),
                        "label": concept_data.get("label"),
                    }
        return trend_data

    # ------------------------------------------------------------------
    # Public: peer group (raw per-CIK financials)
    # ------------------------------------------------------------------

    def get_peer_group_analysis(
        self, ciks: List[str], report_type: str, period: str
    ) -> Dict[str, Any]:
        peer: Dict[str, Any] = {}
        for cik in ciks:
            data = self.get_financial_statements(cik, report_type, period)
            if data:
                peer[str(cik)] = data
        return peer

    # ------------------------------------------------------------------
    # Public: sectioned multi-year data for the Statements tab
    # ------------------------------------------------------------------

    def GetMultiParsedData(
        self, ciks: List[str], years: List[str], report_type: str = "10-K"
    ) -> Dict[str, Any]:
        """Return sectioned statement rows for NewTrendTable.jsx.

        Shape matches the original GetMultiParsedData output so the frontend
        does not need to change. `years` may be either annual labels
        ("2024") or quarterly labels ("Q2 2024") — we route 10-Q periods
        through the quarter-aware filing matcher and dataframe scoping so
        each column carries the correct 3-month value rather than YTD.
        """
        result: Dict[str, Any] = {
            "companies": [],
            "years": years,
            "summary": {
                "total_companies": len(ciks),
                "companies_processed": 0,
                "errors": [],
            },
        }

        for cik in ciks:
            try:
                result["companies"].append(
                    self._fetch_sectioned_company(cik, years, report_type)
                )
                result["summary"]["companies_processed"] += 1
            except Exception as exc:
                logger.warning("GetMultiParsedData failed for %s: %s", cik, exc)
                result["summary"]["errors"].append({"cik": str(cik), "error": str(exc)})

        return result

    def _fetch_sectioned_company(
        self, cik: str, years: List[str], report_type: str = "10-K"
    ) -> Dict[str, Any]:
        company = Company(str(cik))
        is_quarterly = str(report_type).upper() == "10-Q"

        # Cache (year -> statement_type -> dataframe) so each statement is read once.
        per_year: Dict[str, Dict[str, Optional[pd.DataFrame]]] = {}
        for year in years:
            filing = self._find_filing(cik, report_type, year)
            if filing is None:
                continue
            financials = self._extract_financials(filing)
            if financials is None:
                continue

            keys: Dict[str, Optional[str]] = {"duration": None, "instant": None}
            if is_quarterly:
                quarter_info = _parse_quarter_period(year)
                if quarter_info and getattr(financials, "xb", None) is not None:
                    keys = self._quarter_period_keys(financials.xb, quarter_info)

            per_year[year] = {
                "income_statement": self._statement_dataframe(
                    financials.income_statement(), period_filter=keys["duration"]
                ),
                "balance_sheet": self._statement_dataframe(
                    financials.balance_sheet(), period_filter=keys["instant"]
                ),
                "cash_flow": self._statement_dataframe(
                    financials.cash_flow_statement(), period_filter=keys["duration"]
                ),
            }

        categorized: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
            "income_statement": {},
            "balance_sheet": {},
            "cash_flow": {},
        }

        for statement_type in ("income_statement", "balance_sheet", "cash_flow"):
            categorized[statement_type] = self._sectionize_statement(
                statement_type, per_year, years
            )

        return {
            "company": {
                "name": getattr(company, "name", "") or "",
                "cik": str(getattr(company, "cik", "") or cik),
            },
            "years": years,
            "statements": categorized,
        }

    def _sectionize_statement(
        self,
        statement_type: str,
        per_year: Dict[str, Dict[str, Optional[pd.DataFrame]]],
        years: List[str],
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Group line items under XBRL abstract header rows.

        Each concrete row in the filing carries a `parent_abstract_concept`
        pointing at its section header (e.g. `us-gaap_AssetsCurrentAbstract`).
        We map those parent concepts to their labels ("Current assets") and
        group rows accordingly so the output mirrors the filing's structure
        exactly. Rows whose parent is the generic `StatementLineItems`
        placeholder fall back to the most recent top-level section.
        """
        canonical_year = next(
            (
                y
                for y in years
                if y in per_year and per_year[y].get(statement_type) is not None
            ),
            None,
        )
        if canonical_year is None:
            return {}

        canonical_df = per_year[canonical_year][statement_type]

        # Map abstract concept -> label ("us-gaap_AssetsCurrentAbstract" -> "Current assets").
        abstract_label_by_concept: Dict[str, str] = {}
        for _, row in canonical_df.iterrows():
            if row.get("abstract") != True:  # noqa: E712
                continue
            concept = str(row.get("concept") or "").strip()
            label = str(row.get("label") or "").strip()
            if concept and label:
                abstract_label_by_concept[concept] = label.replace("[Abstract]", "").strip()

        ordered_sections: List[str] = []
        section_item_order: Dict[str, List[str]] = {}
        concept_to_section: Dict[str, str] = {}
        concept_label: Dict[str, str] = {}
        concept_kind: Dict[str, str] = {}

        def _ensure_section(title: str) -> None:
            if title not in section_item_order:
                ordered_sections.append(title)
                section_item_order[title] = []

        # Track the most recent top-level section (an abstract whose own parent
        # is the generic StatementLineItems placeholder — i.e. Assets, Liabilities,
        # Equity). Orphan rows like "Commitments" attach here.
        current_top_level = "Other"
        has_parent_col = "parent_abstract_concept" in canonical_df.columns

        for _, row in canonical_df.iterrows():
            raw_concept = row.get("concept") if "concept" in canonical_df.columns else row.get("name")
            if raw_concept is None or (isinstance(raw_concept, float) and pd.isna(raw_concept)):
                continue
            label = row.get("label") if "label" in canonical_df.columns else raw_concept
            label_str = str(label).strip() if label is not None else ""
            concept_clean = _clean_concept(raw_concept)

            parent_raw = row.get("parent_abstract_concept") if has_parent_col else None
            parent = str(parent_raw).strip() if parent_raw not in (None, "") else ""

            if row.get("abstract") == True:  # noqa: E712
                title = label_str.replace("[Abstract]", "").strip() or concept_clean
                if parent.endswith("StatementLineItems") and title:
                    current_top_level = title
                # Don't add abstracts to ordered_sections here — sections are
                # added in the order their first concrete item appears, which
                # matches the filing's visual flow.
                continue

            if not concept_clean:
                continue

            section_title = abstract_label_by_concept.get(parent) if parent else None
            if not section_title:
                section_title = current_top_level or "Other"

            _ensure_section(section_title)
            if concept_clean not in concept_to_section:
                concept_to_section[concept_clean] = section_title
                section_item_order[section_title].append(concept_clean)
            concept_label[concept_clean] = label_str or concept_clean
            concept_kind.setdefault(concept_clean, _value_kind(str(raw_concept)))

        # Collect values across all requested years.
        concept_values: Dict[str, Dict[str, float]] = {}
        for year, statements in per_year.items():
            df = statements.get(statement_type)
            if df is None or df.empty:
                continue
            period_col = _find_period_column(df, year)
            if period_col is None:
                continue
            has_abs = "abstract" in df.columns
            for _, row in df.iterrows():
                if has_abs and row.get("abstract") == True:  # noqa: E712
                    continue
                raw_concept = row.get("concept") if "concept" in df.columns else row.get("name")
                if raw_concept is None or (isinstance(raw_concept, float) and pd.isna(raw_concept)):
                    continue
                value = row.get(period_col)
                if value is None or (isinstance(value, float) and pd.isna(value)):
                    continue
                try:
                    numeric_value = float(value)
                except (TypeError, ValueError):
                    continue
                concept_clean = _clean_concept(raw_concept)
                if not concept_clean:
                    continue

                if concept_clean not in concept_to_section:
                    concept_to_section[concept_clean] = "Other"
                    _ensure_section("Other")
                    if concept_clean not in section_item_order["Other"]:
                        section_item_order["Other"].append(concept_clean)
                    if concept_clean not in concept_label:
                        label = row.get("label") if "label" in df.columns else raw_concept
                        concept_label[concept_clean] = (
                            str(label).strip() if label is not None else concept_clean
                        )

                concept_kind.setdefault(concept_clean, _value_kind(str(raw_concept)))
                concept_values.setdefault(concept_clean, {})[year] = numeric_value

        result: Dict[str, List[Dict[str, Any]]] = {}
        for section_title in ordered_sections:
            items: List[Dict[str, Any]] = []
            for concept_key in section_item_order[section_title]:
                if concept_key not in concept_values:
                    continue
                values = {year: concept_values[concept_key].get(year) for year in years}
                items.append({
                    "type": concept_label.get(concept_key, concept_key),
                    "gaap_name": concept_key,
                    "value_kind": concept_kind.get(concept_key, "currency"),
                    "values": values,
                })
            if items:
                result[section_title] = items
        return result

    # ------------------------------------------------------------------
    # Public: /try-ratios debug endpoint
    # ------------------------------------------------------------------

    def GetRatios(self, ciks: List[str], periods: List[str]) -> Dict[str, Any]:
        """Return raw flat financials per CIK / period for the test endpoint."""
        out: Dict[str, Any] = {}
        for cik in ciks:
            out[str(cik)] = {
                period: self.get_financial_statements(cik, "10-K", period)
                for period in periods
            }
        return out
