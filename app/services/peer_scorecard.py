"""
Quantitative peer scorecard.

Implements the credit/equity scoring methodology exactly as specified:
  - Sub-metric score = rank portion (0-50) + absolute portion (0-50).
  - Rank portion: 1st = 50, last = 0, linear in rank.
  - Absolute portion: linear for most metrics; LOGISTIC for tail-risk
    (net debt/EBITDA, interest coverage) per the spec, with k = 1.5.
  - Pillar score = weighted_mean(sub_scores) - 0.5 * std_dev(sub_scores).
  - Composite weights vary by industry profile.

Data-availability constraints:
  Several sub-metrics required by the methodology (one-time items as
  pct of pretax, unused revolver capacity, weighted-average debt
  maturity, % fixed-rate debt, NTM debt maturities) require parsing
  10-K footnotes / MD&A and are NOT in plain XBRL. Per methodology
  ("document, don't impute") those return value=None and the pillar
  aggregates only over available sub-metrics. The threshold_source
  column documents each one.

Threshold calibration:
  Every absolute threshold below is hardcoded research with an inline
  source. All are tagged [ASSUMED] until external data (S&P methodology
  documents, Moody's bands, historical default tables, covenant data)
  is wired up. The methodology rule "do not silently guess" is honored
  by surfacing every default through threshold_source so the user can
  see what's load-bearing.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from services.sec_service import SECService

# ---------------------------------------------------------------------------
# Threshold calibration
# ---------------------------------------------------------------------------

# Each entry documents the methodology, midpoint/best/worst, and the source.
# `polarity` = 'lower_better' or 'higher_better'.
# `scoring`  = 'logistic' (use sigmoid around midpoint) or 'linear' (between
#              best/worst). LOGISTIC is mandated for tail-risk metrics by
#              the spec; do not switch them to linear.
THRESHOLDS: Dict[str, Dict[str, Any]] = {
    "nd_ebitda": {
        "label": "Net debt / EBITDA",
        "polarity": "lower_better",
        "scoring": "logistic",
        "midpoint": 3.5,   # x
        "k": 1.5,
        "source": "S&P Global Ratings General Corporate Industries 2024: IG <3x, BB 3-5x, B >5x. Midpoint at IG/HY boundary. [ASSUMED]",
    },
    "int_coverage": {
        "label": "EBIT / interest expense",
        "polarity": "higher_better",
        "scoring": "logistic",
        "midpoint": 4.0,   # x
        "k": 1.5,
        "source": "S&P methodology: IG coverage typically >5x, distressed <2x. Midpoint at investment-grade transition. [ASSUMED]",
    },
    "wa_maturity": {
        "label": "Weighted avg debt maturity (yrs)",
        "polarity": "higher_better",
        "scoring": "linear",
        "best": 8.0,
        "worst": 2.0,
        "source": "Industry norm for capital-intensive borrowers. Requires footnote (debt schedule) parsing — N/A until wired. [ASSUMED]",
        "requires_footnote": True,
    },
    "pct_fixed": {
        "label": "% fixed-rate debt",
        "polarity": "higher_better",
        "scoring": "linear",
        "best": 0.80,
        "worst": 0.30,
        "source": "Treasury-policy benchmarks. Requires debt-footnote breakdown — N/A until wired. [ASSUMED]",
        "requires_footnote": True,
    },
    "cfo_ni": {
        "label": "CFO / Net Income (3y avg)",
        "polarity": "higher_better",
        "scoring": "linear",
        "best": 1.20,
        "worst": 0.50,
        "source": "Earnings-quality literature (Sloan 1996; Penman 2010). [ASSUMED]",
    },
    "sloan": {
        "label": "Sloan accruals ratio",
        "polarity": "lower_better",  # high accruals predict reversals
        "scoring": "linear",
        "best": 0.02,
        "worst": 0.15,
        "source": "Sloan (1996), 'Do stock prices fully reflect information in accruals…'. [ASSUMED]",
    },
    "gm_cov": {
        "label": "Gross margin CoV (5y)",
        "polarity": "lower_better",
        "scoring": "linear",
        "best": 0.05,
        "worst": 0.30,
        "source": "Industry margin-volatility benchmark. [ASSUMED]",
    },
    "one_time_pct": {
        "label": "One-time items / pretax (3y)",
        "polarity": "lower_better",
        "scoring": "linear",
        "best": 0.02,
        "worst": 0.20,
        "weight": 2.0,  # methodology: weight 2x in earnings-quality pillar
        "source": "Earnings-quality literature. Requires footnote / non-GAAP reconciliation parsing — N/A until wired. [ASSUMED]",
        "requires_footnote": True,
    },
    "cash_to_maturities": {
        "label": "(Cash + mkt sec) / NTM debt maturities",
        "polarity": "higher_better",
        "scoring": "linear",
        "best": 2.0,
        "worst": 0.5,
        "source": "Liquidity coverage benchmark (S&P liquidity assessment). NTM maturities approximated with current portion of LT debt + short-term borrowings. [ASSUMED]",
    },
    "revolver_share": {
        "label": "Unused revolver / total liquidity sources",
        "polarity": "higher_better",
        "scoring": "linear",
        "best": 0.60,
        "worst": 0.10,
        "source": "Liquidity-coverage benchmark. Requires MD&A / credit-agreement parsing — N/A until wired. [ASSUMED]",
        "requires_footnote": True,
    },
    "trend_8q": {
        "label": "8-quarter liquidity trend (improving/stable/deteriorating)",
        "polarity": "higher_better",
        "scoring": "linear",
        "best": 1.0,    # improving
        "worst": -1.0,  # deteriorating
        "source": "Direction-only metric computed from 8-quarter cash-trend regression slope sign.",
    },
}

# Pillar membership and weights inside each pillar (one_time_pct is 2x).
PILLAR_DEBT = ["nd_ebitda", "int_coverage", "wa_maturity", "pct_fixed"]
PILLAR_EQ   = ["cfo_ni", "sloan", "gm_cov", "one_time_pct"]
PILLAR_LIQ  = ["cash_to_maturities", "revolver_share", "trend_8q"]

# Composite weights per industry profile (debt, earnings_quality, liquidity).
INDUSTRY_WEIGHTS: Dict[str, Tuple[float, float, float]] = {
    "cyclical":    (0.45, 0.35, 0.20),
    "asset_light": (0.20, 0.50, 0.30),
}


# ---------------------------------------------------------------------------
# XBRL concept lookup helpers
# ---------------------------------------------------------------------------

def _concept_value(statement: Dict[str, Any], *keys: str) -> Optional[float]:
    """Look up the first matching concept value. Statement dicts come from
    SECService and are keyed by either bare concept name or fully qualified
    'us-gaap:Foo'. Try both shapes."""
    if not statement:
        return None
    for key in keys:
        for variant in (key, f"us-gaap:{key}", f"us-gaap_{key}"):
            v = statement.get(variant)
            if v is None:
                continue
            # SECService entries can be {value, label} or raw scalar.
            if isinstance(v, dict):
                raw = v.get("value")
            else:
                raw = v
            try:
                return float(raw)
            except (TypeError, ValueError):
                continue
    return None


def _safe_div(num: Optional[float], denom: Optional[float]) -> Optional[float]:
    if num is None or denom is None or denom == 0:
        return None
    return num / denom


def _concept_fuzzy(statement: Dict[str, Any], *substrings: str) -> Optional[float]:
    """Substring match fallback for entity-extension tags. e.g. MSFT files
    D&A under `msft_DepreciationAmortizationAndOther` — exact-name lookups
    miss it but a substring scan on 'deprec' or 'amort' will catch it."""
    if not statement:
        return None
    needles = [s.lower() for s in substrings]
    for key in statement.keys():
        kl = key.lower()
        if any(n in kl for n in needles):
            v = statement[key]
            raw = v.get("value") if isinstance(v, dict) else v
            try:
                return float(raw)
            except (TypeError, ValueError):
                continue
    return None


# ---------------------------------------------------------------------------
# Raw metric extraction
# ---------------------------------------------------------------------------

@dataclass
class PeerPeriodMetrics:
    """Per-period raw extractions for one peer."""
    period: str
    revenue: Optional[float]
    gross_profit: Optional[float]
    cogs: Optional[float]
    operating_income: Optional[float]   # EBIT proxy
    net_income: Optional[float]
    interest_expense: Optional[float]
    da: Optional[float]                 # depreciation & amortization
    cfo: Optional[float]
    total_debt: Optional[float]
    short_term_debt: Optional[float]
    current_portion_lt_debt: Optional[float]
    cash_and_equiv: Optional[float]
    marketable_securities: Optional[float]
    total_assets: Optional[float]
    current_assets: Optional[float]
    current_liabilities: Optional[float]
    accruals_wc_change: Optional[float]  # change in non-cash WC


def _extract_period(financials: Dict[str, Any], period: str) -> PeerPeriodMetrics:
    is_ = financials.get("income_statement") or {}
    bs  = financials.get("balance_sheet") or {}
    cf  = financials.get("cash_flow") or {}

    # SECService emits normalized keys (e.g. "Revenue", "NetIncome",
    # "NetCashFromOperatingActivities"). Keep the raw us-gaap names as
    # fallbacks for filers whose statements pass through without
    # normalization.
    revenue = _concept_value(is_,
        "Revenue", "Revenues", "SalesRevenueNet",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
    )
    cogs = _concept_value(is_,
        "CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold",
    )
    gp = _concept_value(is_, "GrossProfit")
    if gp is None and revenue is not None and cogs is not None:
        gp = revenue - cogs

    op_inc = _concept_value(is_, "OperatingIncomeLoss")
    net_inc = _concept_value(is_, "NetIncome", "NetIncomeLoss")
    # Interest expense in this SEC service lives on the cash-flow side
    # (filed as "Cash paid for interest"). Income-statement fallback for
    # filers who tag it there.
    int_exp = _concept_value(cf, "InterestExpense") or _concept_value(is_, "InterestExpense")
    da = _concept_value(cf,
        "DepreciationExpense",
        "DepreciationDepletionAndAmortization",
        "DepreciationAndAmortization",
        "Depreciation",
    )
    if da is None:
        # Entity-extension fallback (e.g. msft_DepreciationAmortizationAndOther).
        da = _concept_fuzzy(cf, "depreciation", "amortization")
    cfo = _concept_value(cf,
        "NetCashFromOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByOperatingActivities",
    )

    # `CashAndMarketableSecurities` is already a combined cash + securities
    # line in the SEC service's normalized output — using it avoids double
    # counting with the separate `ShortTermInvestments` field. Fall back to
    # bare cash concepts for filers whose statements use the unsplit shape.
    cash_combined = _concept_value(bs, "CashAndMarketableSecurities")
    if cash_combined is not None:
        cash = cash_combined
        mkt_sec = None  # already included
    else:
        cash = _concept_value(bs, "CashAndCashEquivalentsAtCarryingValue", "Cash")
        mkt_sec = _concept_value(bs,
            "ShortTermInvestments",
            "MarketableSecuritiesCurrent",
            "AvailableForSaleSecuritiesCurrent",
        )

    lt_debt = _concept_value(bs, "LongTermDebt", "LongTermDebtNoncurrent")
    st_debt = _concept_value(bs,
        "ShortTermDebt",
        "ShortTermBorrowings",
        "CommercialPaper",
        "DebtCurrent",
    )
    cur_portion = _concept_value(bs, "CurrentPortionOfLongTermDebt", "LongTermDebtCurrent")
    total_debt = sum(x for x in (lt_debt, st_debt, cur_portion) if x is not None) or None
    if total_debt == 0:
        total_debt = None

    total_assets = _concept_value(bs, "Assets")
    cur_assets = _concept_value(bs, "CurrentAssetsTotal", "AssetsCurrent")
    cur_liab = _concept_value(bs, "CurrentLiabilitiesTotal", "LiabilitiesCurrent")

    # Non-cash working capital change (approx) for Sloan accruals:
    # ΔWC = Δ(current assets − cash) − Δ(current liabilities − short-term debt).
    # Period-over-period delta is computed at the peer-level (we need two
    # periods). Leave per-period storage of components here and compute the
    # delta in the aggregation step.
    return PeerPeriodMetrics(
        period=period,
        revenue=revenue,
        gross_profit=gp,
        cogs=cogs,
        operating_income=op_inc,
        net_income=net_inc,
        interest_expense=int_exp,
        da=da,
        cfo=cfo,
        total_debt=total_debt,
        short_term_debt=(st_debt or 0) + (cur_portion or 0) if (st_debt or cur_portion) else None,
        current_portion_lt_debt=cur_portion,
        cash_and_equiv=cash,
        marketable_securities=mkt_sec,
        total_assets=total_assets,
        current_assets=cur_assets,
        current_liabilities=cur_liab,
        accruals_wc_change=None,  # filled in during multi-period aggregation
    )


# ---------------------------------------------------------------------------
# Sub-metric computation per peer (multi-period)
# ---------------------------------------------------------------------------

def _compute_submetrics(periods: List[PeerPeriodMetrics],
                        quarters: List[PeerPeriodMetrics]) -> Dict[str, Optional[float]]:
    """Reduce a peer's 5y annual + 8q quarterly history into sub-metric values."""
    if not periods:
        return {k: None for k in THRESHOLDS}

    # Most recent annual point (for stocks like debt/cash).
    latest = periods[-1]

    out: Dict[str, Optional[float]] = {}

    # ----- Debt pillar -----
    ebitda = None
    if latest.operating_income is not None:
        # EBITDA ~= EBIT + D&A; use most recent D&A if available.
        ebitda = latest.operating_income + (latest.da or 0)
    net_debt = None
    if latest.total_debt is not None:
        cash_total = (latest.cash_and_equiv or 0) + (latest.marketable_securities or 0)
        net_debt = latest.total_debt - cash_total
    out["nd_ebitda"] = _safe_div(net_debt, ebitda)
    out["int_coverage"] = _safe_div(latest.operating_income, latest.interest_expense)

    # WA maturity, % fixed-rate need footnote parsing — explicit N/A.
    out["wa_maturity"] = None
    out["pct_fixed"] = None

    # ----- Earnings-quality pillar -----
    # CFO / NI trailing 3y average (use up to last 3 with both values).
    cfo_ni_pairs = [
        (p.cfo, p.net_income) for p in periods[-3:]
        if p.cfo is not None and p.net_income is not None and p.net_income != 0
    ]
    out["cfo_ni"] = (
        statistics.mean(c / n for c, n in cfo_ni_pairs) if cfo_ni_pairs else None
    )

    # Sloan accruals = (ΔWC + D&A) / avg assets, latest year.
    # ΔWC = Δ(CA − Cash) − Δ(CL − STD).
    if len(periods) >= 2:
        prev, curr = periods[-2], periods[-1]
        def _wc(p: PeerPeriodMetrics) -> Optional[float]:
            if p.current_assets is None or p.current_liabilities is None:
                return None
            ca_ex_cash = p.current_assets - (p.cash_and_equiv or 0)
            cl_ex_std = p.current_liabilities - (p.short_term_debt or 0)
            return ca_ex_cash - cl_ex_std
        wc_curr, wc_prev = _wc(curr), _wc(prev)
        avg_assets = None
        if curr.total_assets is not None and prev.total_assets is not None:
            avg_assets = (curr.total_assets + prev.total_assets) / 2
        if wc_curr is not None and wc_prev is not None and curr.da is not None and avg_assets:
            out["sloan"] = abs((wc_curr - wc_prev + curr.da) / avg_assets)
        else:
            out["sloan"] = None
    else:
        out["sloan"] = None

    # Gross margin CoV over up to 5y.
    gms = [
        p.gross_profit / p.revenue
        for p in periods[-5:]
        if p.gross_profit is not None and p.revenue not in (None, 0)
    ]
    if len(gms) >= 3 and statistics.mean(gms) != 0:
        out["gm_cov"] = statistics.pstdev(gms) / abs(statistics.mean(gms))
    else:
        out["gm_cov"] = None

    # One-time items / pretax — requires footnote parsing.
    out["one_time_pct"] = None

    # ----- Liquidity pillar -----
    ntm_maturities = latest.short_term_debt  # proxy (current portion LTD + ST debt)
    cash_plus_sec = (latest.cash_and_equiv or 0) + (latest.marketable_securities or 0)
    if cash_plus_sec and ntm_maturities and ntm_maturities > 0:
        out["cash_to_maturities"] = cash_plus_sec / ntm_maturities
    else:
        out["cash_to_maturities"] = None
    out["revolver_share"] = None  # footnote-only

    # 8q trend: sign of slope of cash+marketables across last 8 quarterly points.
    cash_series = [
        (q.cash_and_equiv or 0) + (q.marketable_securities or 0)
        for q in quarters[-8:]
        if (q.cash_and_equiv is not None or q.marketable_securities is not None)
    ]
    if len(cash_series) >= 4:
        # Simple slope via least-squares on integer time index.
        xs = list(range(len(cash_series)))
        mean_x = statistics.mean(xs)
        mean_y = statistics.mean(cash_series)
        num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, cash_series))
        den = sum((x - mean_x) ** 2 for x in xs)
        if den != 0:
            slope = num / den
            # Normalize slope to mean to get a unitless direction.
            normed = slope / mean_y if mean_y else 0
            # Map to {improving=+1, stable=0, deteriorating=-1} buckets.
            if normed > 0.02:
                out["trend_8q"] = 1.0
            elif normed < -0.02:
                out["trend_8q"] = -1.0
            else:
                out["trend_8q"] = 0.0
        else:
            out["trend_8q"] = None
    else:
        out["trend_8q"] = None

    return out


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _logistic_score(value: float, midpoint: float, k: float, polarity: str) -> float:
    """0-50 absolute score from a logistic curve.
    For lower_better metrics: score = 50 / (1 + exp((x - midpoint)*k))
    For higher_better metrics: score = 50 / (1 + exp((midpoint - x)*k))
    """
    if polarity == "lower_better":
        return 50.0 / (1.0 + math.exp((value - midpoint) * k))
    else:
        return 50.0 / (1.0 + math.exp((midpoint - value) * k))


def _linear_score(value: float, best: float, worst: float, polarity: str) -> float:
    """0-50 absolute score linearly between best and worst calibration anchors."""
    if best == worst:
        return 25.0
    if polarity == "lower_better":
        # best is the SMALLER number; linearly decreasing in value
        frac = (worst - value) / (worst - best)
    else:
        # higher_better: best is the LARGER number
        frac = (value - worst) / (best - worst)
    return max(0.0, min(1.0, frac)) * 50.0


def _absolute_score(metric_key: str, value: float,
                    override_midpoint: Optional[float] = None) -> float:
    cfg = THRESHOLDS[metric_key]
    if cfg["scoring"] == "logistic":
        mid = override_midpoint if override_midpoint is not None else cfg["midpoint"]
        return _logistic_score(value, mid, cfg["k"], cfg["polarity"])
    return _linear_score(value, cfg["best"], cfg["worst"], cfg["polarity"])


def _rank_score(rank: int, n_peers: int) -> float:
    """0-50 from peer rank, linear. rank is 1-based, 1 is best."""
    if n_peers <= 1:
        return 25.0
    return 50.0 * (n_peers - rank) / (n_peers - 1)


def _score_submetric(metric_key: str,
                     raw_by_ticker: Dict[str, Optional[float]],
                     threshold_override: Optional[float] = None) -> Dict[str, Optional[float]]:
    """Compute 0-100 scores for each ticker given the peer cohort's raw values."""
    cfg = THRESHOLDS[metric_key]
    polarity = cfg["polarity"]
    present = [(t, v) for t, v in raw_by_ticker.items() if v is not None]
    if not present:
        return {t: None for t in raw_by_ticker}

    # Rank: best first.
    reverse = polarity == "higher_better"
    ordered = sorted(present, key=lambda tv: tv[1], reverse=reverse)
    ranks = {t: i + 1 for i, (t, _) in enumerate(ordered)}
    n = len(present)

    scores: Dict[str, Optional[float]] = {}
    for t, v in raw_by_ticker.items():
        if v is None:
            scores[t] = None
            continue
        rs = _rank_score(ranks[t], n)
        ab = _absolute_score(metric_key, v, override_midpoint=threshold_override)
        scores[t] = rs + ab
    return scores


# ---------------------------------------------------------------------------
# Pillar + composite aggregation
# ---------------------------------------------------------------------------

def _pillar_score(submetric_keys: List[str],
                  ticker: str,
                  submetric_scores: Dict[str, Dict[str, Optional[float]]]) -> Optional[float]:
    """Weighted mean − 0.5 × std_dev over available sub-metrics for one ticker."""
    weighted_vals: List[Tuple[float, float]] = []
    for key in submetric_keys:
        score = submetric_scores.get(key, {}).get(ticker)
        if score is None:
            continue
        weight = THRESHOLDS[key].get("weight", 1.0)
        weighted_vals.append((score, weight))
    if not weighted_vals:
        return None
    total_w = sum(w for _, w in weighted_vals)
    wm = sum(s * w for s, w in weighted_vals) / total_w
    raw_scores = [s for s, _ in weighted_vals]
    sd = statistics.pstdev(raw_scores) if len(raw_scores) > 1 else 0.0
    return wm - 0.5 * sd


def _composite(pillars: Dict[str, Optional[float]],
               weights: Tuple[float, float, float]) -> Optional[float]:
    d, e, l = pillars.get("debt"), pillars.get("earnings_quality"), pillars.get("liquidity")
    if d is None and e is None and l is None:
        return None
    wd, we, wl = weights
    parts: List[Tuple[float, float]] = []
    if d is not None: parts.append((d, wd))
    if e is not None: parts.append((e, we))
    if l is not None: parts.append((l, wl))
    total = sum(w for _, w in parts)
    return sum(s * w for s, w in parts) / total if total else None


# ---------------------------------------------------------------------------
# Public service
# ---------------------------------------------------------------------------

class PeerScorecardService:

    def __init__(self) -> None:
        self.sec = SECService()

    # ---- data pull ----
    def _pull_annual_quarterly(self, tickers: List[str]) -> Dict[str, Dict[str, Any]]:
        """Pull 5y annual + 8q quarterly per peer. Returns {ticker: {annual: [...], quarterly: [...], cik, company_name}}."""
        now = datetime.now()
        annual_years = [str(y) for y in range(now.year - 5, now.year)]
        # 8 most-recent completed quarters relative to today.
        def _quarter_label(yr: int, q: int) -> str:
            return f"Q{q} {yr}"
        cur_q = (now.month - 1) // 3 + 1  # 1..4
        ref_q = cur_q - 1 if cur_q > 1 else 4
        ref_y = now.year if cur_q > 1 else now.year - 1
        quarterly: List[str] = []
        y, q = ref_y, ref_q
        for _ in range(8):
            quarterly.append(_quarter_label(y, q))
            q -= 1
            if q == 0:
                q, y = 4, y - 1
        quarterly.reverse()

        result: Dict[str, Dict[str, Any]] = {}
        for ticker in tickers:
            companies = self.sec.search_companies(ticker)
            match = None
            for comp in companies or []:
                if comp.get("ticker", "").upper() == ticker.upper():
                    match = comp
                    break
            if not match:
                result[ticker] = {"error": "ticker_not_found", "annual": [], "quarterly": []}
                continue
            cik = match["cik"]
            annual_data: List[PeerPeriodMetrics] = []
            for period in annual_years:
                fin = self.sec.get_financial_statements(cik, "10-K", period)
                if fin:
                    annual_data.append(_extract_period(fin, period))
            quarterly_data: List[PeerPeriodMetrics] = []
            for period in quarterly:
                fin = self.sec.get_financial_statements(cik, "10-Q", period)
                if fin:
                    quarterly_data.append(_extract_period(fin, period))
            result[ticker] = {
                "company_name": match.get("company_name"),
                "cik": cik,
                "annual": annual_data,
                "quarterly": quarterly_data,
            }
        return result

    # ---- main ----
    def compute(self, tickers: List[str], industry_profile: str) -> Dict[str, Any]:
        if industry_profile not in INDUSTRY_WEIGHTS:
            raise ValueError(
                f"industry_profile must be one of {list(INDUSTRY_WEIGHTS.keys())}; got {industry_profile}. "
                "For 'other', the user must specify weights — methodology requires explicit choice."
            )
        weights = INDUSTRY_WEIGHTS[industry_profile]

        peer_data = self._pull_annual_quarterly(tickers)

        # ----- 1. Raw sub-metrics per peer -----
        raw_by_ticker: Dict[str, Dict[str, Optional[float]]] = {}
        per_peer_flags: Dict[str, List[Dict[str, str]]] = {t: [] for t in tickers}
        for t in tickers:
            entry = peer_data.get(t, {})
            if entry.get("error"):
                per_peer_flags[t].append({"code": "no_data", "label": "Ticker not found in EDGAR", "tone": "warn"})
                raw_by_ticker[t] = {k: None for k in THRESHOLDS}
                continue
            raw_by_ticker[t] = _compute_submetrics(entry.get("annual", []), entry.get("quarterly", []))
            # Restatement / scarce-data flags.
            if len(entry.get("annual", [])) < 3:
                per_peer_flags[t].append({"code": "sparse_annual", "label": f"<3y annuals ({len(entry.get('annual', []))} found)", "tone": "warn"})
            if len(entry.get("quarterly", [])) < 4:
                per_peer_flags[t].append({"code": "sparse_quarterly", "label": "<4 quarters", "tone": "warn"})

        # ----- 2. Score each sub-metric across the peer cohort -----
        submetric_scores: Dict[str, Dict[str, Optional[float]]] = {}
        for key in THRESHOLDS:
            submetric_scores[key] = _score_submetric(
                key,
                {t: raw_by_ticker[t].get(key) for t in tickers},
            )

        # ----- 3. Pillar scores per peer (weighted_mean − 0.5×σ over available subs) -----
        pillars_by_ticker: Dict[str, Dict[str, Optional[float]]] = {}
        for t in tickers:
            pillars_by_ticker[t] = {
                "debt": _pillar_score(PILLAR_DEBT, t, submetric_scores),
                "earnings_quality": _pillar_score(PILLAR_EQ, t, submetric_scores),
                "liquidity": _pillar_score(PILLAR_LIQ, t, submetric_scores),
            }

        # ----- 4. Composite + ranking -----
        composites: Dict[str, Optional[float]] = {
            t: _composite(pillars_by_ticker[t], weights) for t in tickers
        }
        ranking_rows = [
            {
                "ticker": t,
                "composite": composites[t],
                "pillars": pillars_by_ticker[t],
                "flags": per_peer_flags.get(t, []),
            }
            for t in tickers
        ]
        ranking_rows.sort(key=lambda r: (r["composite"] is None, -(r["composite"] or 0)))

        # ----- 5. Sensitivity: weights ±10pp (one at a time), midpoints ±20% -----
        sensitivity = self._sensitivity(
            tickers, raw_by_ticker, submetric_scores, pillars_by_ticker, composites, weights
        )

        # ----- 6. Memo + appendix + quality checks -----
        memo = self._memo(tickers, pillars_by_ticker, submetric_scores, sensitivity)
        appendix = {"assumptions": sensitivity.get("flips", [])}
        quality_checks = self._quality_checks(peer_data, raw_by_ticker)

        # ----- 7. Threshold source map for the UI's threshold_source column -----
        pillar_payload = {}
        for pillar_key, keys in (("debt", PILLAR_DEBT),
                                 ("earnings_quality", PILLAR_EQ),
                                 ("liquidity", PILLAR_LIQ)):
            pillar_payload[pillar_key] = {
                "submetrics": {
                    k: {
                        "raw": {t: raw_by_ticker[t].get(k) for t in tickers},
                        "scores": submetric_scores[k],
                        "threshold_source": THRESHOLDS[k]["source"],
                    }
                    for k in keys
                }
            }

        return {
            "industry_profile": industry_profile,
            "weights": {"debt": weights[0], "earnings_quality": weights[1], "liquidity": weights[2]},
            "ranking": ranking_rows,
            "pillars": pillar_payload,
            "sensitivity": sensitivity,
            "memo": memo,
            "appendix": appendix,
            "quality_checks": quality_checks,
        }

    # ---- sensitivity ----
    def _sensitivity(self,
                     tickers: List[str],
                     raw_by_ticker: Dict[str, Dict[str, Optional[float]]],
                     submetric_scores: Dict[str, Dict[str, Optional[float]]],
                     pillars_by_ticker: Dict[str, Dict[str, Optional[float]]],
                     composites: Dict[str, Optional[float]],
                     weights: Tuple[float, float, float]) -> Dict[str, Any]:
        flips: List[Dict[str, Any]] = []
        base_order = sorted(tickers, key=lambda t: -(composites.get(t) or 0))

        # Weights ±10pp, one pillar at a time, rebalancing the other two proportionally.
        def _shift_weights(idx: int, delta: float) -> Tuple[float, float, float]:
            base = list(weights)
            base[idx] = max(0.0, min(1.0, base[idx] + delta))
            others = [i for i in range(3) if i != idx]
            remainder = 1.0 - base[idx]
            other_sum = sum(weights[i] for i in others) or 1.0
            for i in others:
                base[i] = remainder * weights[i] / other_sum
            return base[0], base[1], base[2]

        scenarios: List[Tuple[str, Tuple[float, float, float], Dict[str, float]]] = []
        for idx, name in enumerate(("debt", "earnings_quality", "liquidity")):
            for delta in (+0.10, -0.10):
                scenarios.append((f"{name} weight {'+' if delta>0 else ''}{int(delta*100)}pp",
                                  _shift_weights(idx, delta), {}))

        # Threshold midpoints ±20% — only the logistic ones (ND/EBITDA, coverage).
        for key in ("nd_ebitda", "int_coverage"):
            mid = THRESHOLDS[key]["midpoint"]
            for delta in (+0.20, -0.20):
                scenarios.append((
                    f"{THRESHOLDS[key]['label']} midpoint {'+' if delta>0 else ''}{int(delta*100)}%",
                    weights,
                    {key: mid * (1 + delta)},
                ))

        for scenario_name, w, overrides in scenarios:
            scored = dict(submetric_scores)  # shallow copy
            if overrides:
                # Recompute affected sub-metric scores with the overridden midpoint.
                for k, new_mid in overrides.items():
                    scored = {**scored, k: _score_submetric(
                        k,
                        {t: raw_by_ticker[t].get(k) for t in tickers},
                        threshold_override=new_mid,
                    )}
            pillars_s = {
                t: {
                    "debt": _pillar_score(PILLAR_DEBT, t, scored),
                    "earnings_quality": _pillar_score(PILLAR_EQ, t, scored),
                    "liquidity": _pillar_score(PILLAR_LIQ, t, scored),
                }
                for t in tickers
            }
            comps = {t: _composite(pillars_s[t], w) for t in tickers}
            new_order = sorted(tickers, key=lambda t: -(comps.get(t) or 0))
            for i in range(len(new_order) - 1):
                a, b = new_order[i], new_order[i + 1]
                if base_order.index(a) > base_order.index(b):
                    delta = (comps.get(a) or 0) - (comps.get(b) or 0)
                    flips.append({
                        "scenario": scenario_name,
                        "swapped": [a, b],
                        "delta": delta,
                        "name": scenario_name,
                        "current": "base case",
                        "range": "±10pp / ±20%",
                        "pair": [a, b],
                    })
        return {"flips": flips}

    # ---- memo ----
    def _memo(self,
              tickers: List[str],
              pillars_by_ticker: Dict[str, Dict[str, Optional[float]]],
              submetric_scores: Dict[str, Dict[str, Optional[float]]],
              sensitivity: Dict[str, Any]) -> Dict[str, Any]:
        peer_memos = []
        for t in tickers:
            pillars = pillars_by_ticker.get(t, {})
            # Top driver = pillar with highest score, plus the highest-scoring
            # sub-metric in it.
            available = [(k, v) for k, v in pillars.items() if v is not None]
            if not available:
                peer_memos.append({"ticker": t, "top_driver": "No sufficient data"})
                continue
            top_pillar_key, top_pillar_val = max(available, key=lambda kv: kv[1])
            pillar_keys = {"debt": PILLAR_DEBT, "earnings_quality": PILLAR_EQ, "liquidity": PILLAR_LIQ}[top_pillar_key]
            top_sub = max(
                ((k, submetric_scores[k].get(t) or 0) for k in pillar_keys),
                key=lambda kv: kv[1],
            )
            peer_memos.append({
                "ticker": t,
                "top_driver": f"{top_pillar_key.replace('_', ' ').title()} pillar at {top_pillar_val:.0f}, anchored by {THRESHOLDS[top_sub[0]]['label']} (score {top_sub[1]:.0f}).",
            })
        # Most-sensitive assumptions = the two scenarios with the largest |delta|.
        flips_sorted = sorted(sensitivity.get("flips", []),
                              key=lambda f: -abs(f.get("delta") or 0))
        most_sensitive = [
            f"{f['scenario']} flips {f['swapped'][0]} ↔ {f['swapped'][1]}"
            for f in flips_sorted[:2]
        ]
        return {"peers": peer_memos, "sensitive_assumptions": most_sensitive}

    # ---- quality checks ----
    def _quality_checks(self,
                        peer_data: Dict[str, Dict[str, Any]],
                        raw_by_ticker: Dict[str, Dict[str, Optional[float]]]) -> List[Dict[str, str]]:
        checks: List[Dict[str, str]] = []
        for t, entry in peer_data.items():
            annual = entry.get("annual", [])
            if not annual:
                checks.append({"title": f"{t}: no annual filings retrieved", "detail": "Cannot score — ticker absent from EDGAR pull."})
                continue
            if len(annual) < 5:
                checks.append({"title": f"{t}: only {len(annual)}/5 annual periods", "detail": "Methodology calls for 5y; pillar aggregates over available years only. Document, don't impute."})
            # Negative net debt → cash-rich, but flag for sanity.
            nd = raw_by_ticker[t].get("nd_ebitda")
            if nd is not None and nd < 0:
                checks.append({"title": f"{t}: net debt is negative", "detail": "Cash + securities exceed gross debt — flag for credit interpretation."})
            cov = raw_by_ticker[t].get("int_coverage")
            if cov is not None and cov < 0:
                checks.append({"title": f"{t}: operating loss → negative coverage", "detail": "EBIT < 0; coverage ratio is meaningless. Logistic absolute portion will score near 0."})
        return checks
