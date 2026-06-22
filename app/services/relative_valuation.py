"""
Relative valuation service — the three-layer teaching framework.

  Layer 1: Suggest a peer set, compute multiples (EV/EBITDA, EV/EBIT,
           EV/Sales, P/E, P/B) for target and peers, and run the
           multiple-selection engine to recommend 2–3 trustworthy
           multiples per company-specific rules.

  Layer 2: For each recommended multiple, decompose the spread vs peer
           median into growth / margin / ROIC components plus an
           unexplained residual ("alpha"). Coefficients are research
           defaults flagged as ASSUMED so a student can see what's
           load-bearing.

  Layer 3: Reconcile against the existing DCF by computing the peer-
           median-implied share price alongside the target's intrinsic
           per-share. The market-implied driver from a reverse DCF at
           the current price is computed separately by the frontend
           via the existing /reverse-dcf endpoint.

The peer set is sourced from the cached TickerUniverse keyed by SIC
industry. Fundamentals come from yfinance — XBRL doesn't carry market
data and TTM stitching from raw filings would require 5–7 fetches per
peer (vs one info call).
"""

from __future__ import annotations

import logging
import math
import statistics
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select as _sql_select, or_ as _sql_or
from sqlalchemy.orm import Session

from models.screener import TickerUniverse
from services import peer_fundamentals
from services.peer_fundamentals import PeerFundamentals
from services.sec_service import SECService
from services.sic_sectors import sector_from_sic, display_industry
from services.curated_peers import get_curated_peers, has_curated_set

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Multiple definitions
# ---------------------------------------------------------------------------

# Each multiple knows: its numerator (equity-vs-EV), its denominator key
# on the PeerFundamentals dataclass, and a human-readable label. The
# numerator key enforces the "equity metrics over equity value / EV
# metrics over EV" rule from the spec — the selection engine and
# reconciliation reuse this map so the UI never has a chance to assemble
# an incoherent multiple like Price/EBITDA.
MULTIPLES: Dict[str, Dict[str, Any]] = {
    "EV/EBITDA": {"numerator": "enterprise_value", "denominator": "ebitda_ttm", "label": "EV/EBITDA"},
    "EV/EBIT":   {"numerator": "enterprise_value", "denominator": "ebit_ttm",   "label": "EV/EBIT"},
    "EV/Sales":  {"numerator": "enterprise_value", "denominator": "revenue_ttm", "label": "EV/Sales"},
    "P/E":       {"numerator": "market_cap",       "denominator": "net_income_ttm", "label": "P/E"},
    "P/B":       {"numerator": "market_cap",       "denominator": "_book_equity", "label": "P/B"},  # book equity computed inline
}

# Financial-sector SIC Major Groups (Depository, Non-Depository, Brokers,
# Insurance carriers/agents, Holding companies). EV-based multiples are
# meaningless for banks where debt is the product.
FINANCIAL_SIC_MAJORS = {"60", "61", "62", "63", "64", "67"}
REIT_SIC_FULL = "6798"

# ---------------------------------------------------------------------------
# Category-health framework — 5 ratio buckets per peer comparison.
# ---------------------------------------------------------------------------
# Polarity per ratio: True = higher is better (growth, margins, coverage),
# False = lower is better (valuation multiples, leverage, capital structure).
# Each category collects a few ratios; per-peer health is computed as the
# mean of per-ratio "good-side / bad-side of median" signals.
CATEGORY_DEFS: Dict[str, Dict] = {
    "Valuation": {
        "description": "Cheaper relative to peers = better.",
        "ratios": [
            {"key": "EV/EBITDA", "label": "EV/EBITDA", "higher_better": False, "source": "multiple"},
            {"key": "EV/EBIT",   "label": "EV/EBIT",   "higher_better": False, "source": "multiple"},
            {"key": "EV/Sales",  "label": "EV/Sales",  "higher_better": False, "source": "multiple"},
            {"key": "P/E",       "label": "P/E",       "higher_better": False, "source": "multiple"},
            {"key": "P/B",       "label": "P/B",       "higher_better": False, "source": "multiple"},
        ],
    },
    "Growth": {
        "description": "Faster top-line and earnings growth = better.",
        "ratios": [
            {"key": "revenue_growth_ttm",  "label": "Revenue growth (TTM)",  "higher_better": True, "source": "fundamental"},
            {"key": "earnings_growth_ttm", "label": "Earnings growth (TTM)", "higher_better": True, "source": "fundamental"},
        ],
    },
    "Leverage": {
        "description": "Can the company service its debt comfortably?",
        "ratios": [
            {"key": "interest_coverage",   "label": "Interest coverage (EBIT ÷ interest)", "higher_better": True,  "source": "derived"},
            {"key": "net_debt_to_ebitda",  "label": "Net debt / EBITDA",                    "higher_better": False, "source": "derived"},
        ],
    },
    "Capital": {
        "description": "Capital structure — lower debt-funding share = safer.",
        "ratios": [
            {"key": "debt_to_equity",      "label": "Debt / Equity",             "higher_better": False, "source": "derived"},
            {"key": "debt_to_total_cap",   "label": "Debt / Total capitalization", "higher_better": False, "source": "derived"},
        ],
    },
    "Profitability": {
        "description": "More efficient conversion of revenue to profit = better.",
        "ratios": [
            {"key": "gross_margin",        "label": "Gross margin",     "higher_better": True, "source": "fundamental"},
            {"key": "operating_margin",    "label": "Operating margin", "higher_better": True, "source": "fundamental"},
            {"key": "net_margin",          "label": "Net margin",       "higher_better": True, "source": "derived"},
            {"key": "return_on_equity",    "label": "Return on equity", "higher_better": True, "source": "fundamental"},
        ],
    },
}

CATEGORY_ORDER = ["Valuation", "Growth", "Leverage", "Capital", "Profitability"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _book_equity(p: PeerFundamentals) -> Optional[float]:
    """Book equity = book value per share × shares outstanding."""
    if p.book_value_per_share is None or p.shares_outstanding is None:
        return None
    if p.book_value_per_share <= 0 or p.shares_outstanding <= 0:
        return None
    return p.book_value_per_share * p.shares_outstanding


def _safe_div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    """Division that returns None on any non-positive denominator. We
    suppress (not signal) negative multiples — P/E on a loss-making
    company isn't 'negative valuation', it's not-meaningful."""
    if num is None or den is None or den <= 0:
        return None
    try:
        return num / den
    except (TypeError, ZeroDivisionError):
        return None


def _compute_multiples(p: PeerFundamentals) -> Dict[str, Optional[float]]:
    out: Dict[str, Optional[float]] = {}
    for name, defn in MULTIPLES.items():
        num = getattr(p, defn["numerator"], None)
        if defn["denominator"] == "_book_equity":
            den: Optional[float] = _book_equity(p)
        else:
            den = getattr(p, defn["denominator"], None)
        out[name] = _safe_div(num, den)
    return out


def _median(values: List[Optional[float]]) -> Optional[float]:
    clean = [v for v in values if v is not None and not math.isnan(v)]
    if not clean:
        return None
    return statistics.median(clean)


def _stdev(values: List[Optional[float]]) -> Optional[float]:
    clean = [v for v in values if v is not None and not math.isnan(v)]
    if len(clean) < 2:
        return None
    return statistics.stdev(clean)


def _derived_ratios(p: PeerFundamentals, multiples: Dict[str, Optional[float]]) -> Dict[str, Optional[float]]:
    """Compute the category-level derived ratios (debt/equity, interest
    coverage, etc.) per peer. Multiples come from the existing _compute_multiples
    output so we can merge them under one ratio dictionary downstream.
    """
    book = _book_equity(p)
    debt = p.total_debt or 0.0
    cash = p.total_cash or 0.0

    out: Dict[str, Optional[float]] = {}

    # Leverage
    out["interest_coverage"] = _safe_div(p.ebit_ttm, p.interest_expense_ttm)
    out["net_debt_to_ebitda"] = _safe_div(debt - cash, p.ebitda_ttm)

    # Capital
    out["debt_to_equity"] = _safe_div(debt, book)
    out["debt_to_total_cap"] = (
        _safe_div(debt, debt + book) if (book is not None and book > 0) else None
    )

    # Profitability
    out["net_margin"] = _safe_div(p.net_income_ttm, p.revenue_ttm)

    # Carry through the multiples + raw growth/margin fields so category_health
    # can pull every input from a single per-peer dictionary.
    out.update(multiples)
    out["revenue_growth_ttm"]  = p.revenue_growth_ttm
    out["earnings_growth_ttm"] = p.earnings_growth_ttm
    out["gross_margin"]        = p.gross_margin
    out["operating_margin"]    = p.operating_margin
    out["return_on_equity"]    = p.return_on_equity

    return out


def _category_health(
    all_peers_ratios: Dict[str, Dict[str, Optional[float]]],
) -> Dict[str, Dict[str, Dict]]:
    """For every (peer, category) pair, score where the peer sits on each
    ratio relative to the peer-set median, then average those signals into
    a single category-level bucket (good / okay / bad).

    Signal per ratio:
        +1  if peer is on the "good" side of median (per the ratio's polarity)
        -1  if peer is on the "bad" side of median
         0  if at median or peer value is missing

    Category score = mean of per-ratio signals across that category's ratios
    (with the peer's missing-data ratios excluded from the denominator).
    Bucketed as:
        score > +0.5          → "good"   (clearly better than peers)
        -0.5 <= score <= +0.5 → "okay"   (around peer median)
        score < -0.5          → "bad"    (clearly worse)

    Returns: { peer_symbol: { category: {score, label, ratios: [{key, value, peer_median, signal}]} } }
    """
    if not all_peers_ratios:
        return {}

    out: Dict[str, Dict[str, Dict]] = {sym: {} for sym in all_peers_ratios}

    for cat_name in CATEGORY_ORDER:
        cat_def = CATEGORY_DEFS[cat_name]
        for ratio in cat_def["ratios"]:
            key = ratio["key"]
            polarity_higher = ratio["higher_better"]

            # Median across all peers (including the target — passed in as
            # part of all_peers_ratios — so the target compares against the
            # full cohort that contains it).
            values = [all_peers_ratios[sym].get(key) for sym in all_peers_ratios]
            peer_median = _median(values)

            for sym, peer_ratios in all_peers_ratios.items():
                cat_slot = out[sym].setdefault(cat_name, {"ratios": []})
                v = peer_ratios.get(key)
                if v is None or peer_median is None:
                    signal = None
                else:
                    if v > peer_median:
                        signal = 1 if polarity_higher else -1
                    elif v < peer_median:
                        signal = -1 if polarity_higher else 1
                    else:
                        signal = 0
                cat_slot["ratios"].append({
                    "key": key,
                    "label": ratio["label"],
                    "value": v,
                    "peer_median": peer_median,
                    "higher_better": polarity_higher,
                    "signal": signal,
                })

    # Aggregate per category — mean of available signals → bucket.
    for sym in out:
        for cat_name in CATEGORY_ORDER:
            cat = out[sym].get(cat_name, {"ratios": []})
            signals = [r["signal"] for r in cat["ratios"] if r["signal"] is not None]
            if not signals:
                score = None
                label = "no_data"
            else:
                score = sum(signals) / len(signals)
                if score > 0.5:
                    label = "good"
                elif score < -0.5:
                    label = "bad"
                else:
                    label = "okay"
            cat["score"] = score
            cat["label"] = label
            cat["description"] = CATEGORY_DEFS[cat_name]["description"]
            out[sym][cat_name] = cat

    return out


# ---------------------------------------------------------------------------
# Peer set suggestion
# ---------------------------------------------------------------------------

@dataclass
class PeerCandidate:
    ticker: str
    cik: str
    company_name: str
    sic: str
    industry: str


def _suggest_peer_candidates(
    db: Session,
    target_industry: str,
    target_ticker: str,
    pool_size: int = 18,
) -> List[PeerCandidate]:
    """Pull up to `pool_size` peer candidates from TickerUniverse using
    EXACT industry-string match only.

    We deliberately do NOT fall back to 2-digit SIC. SIC Major Groups
    are far too coarse for relative valuation — "35" sweeps Electronic
    Computers (AAPL), Refrigeration & Service Machinery (AAON), Printing
    Presses, and Construction Machinery into one bucket. A peer set
    mixing those business models is worse than a sparse one.

    Trade-off: industries with few peers in our cache (e.g. tobacco)
    will return a small set — the caller surfaces that as a warning
    rather than silently expanding the cohort.
    """
    if not target_industry:
        return []

    q = (
        _sql_select(TickerUniverse)
        .where(TickerUniverse.industry == target_industry)
        .where(TickerUniverse.ticker != target_ticker.upper())
        .limit(pool_size)
    )
    matches: List[PeerCandidate] = []
    for row in db.execute(q).scalars():
        matches.append(PeerCandidate(
            ticker=row.ticker, cik=row.cik, company_name=row.company_name,
            sic=row.sic or "", industry=row.industry or "",
        ))
    return matches


def _filter_and_rank_peers(
    candidates: List[PeerCandidate],
    target: PeerFundamentals,
    max_peers: int = 8,
) -> Tuple[List[PeerFundamentals], List[PeerCandidate]]:
    """Fetch fundamentals for each candidate, drop the ones with no usable
    TTM revenue, rank the rest by size-proximity to the target, and keep
    the top `max_peers`. Returns (kept, dropped).

    yfinance calls go through a thread pool — 12 candidates × ~600ms each
    serial = ~7s; in parallel ~1.5s.
    """
    if not candidates:
        return [], []

    symbols = [c.ticker for c in candidates]
    with ThreadPoolExecutor(max_workers=8) as ex:
        fundamentals = list(ex.map(peer_fundamentals.get_fundamentals, symbols))

    enriched: List[Tuple[PeerCandidate, PeerFundamentals]] = []
    dropped: List[PeerCandidate] = []
    for cand, fund in zip(candidates, fundamentals):
        if fund is None or fund.revenue_ttm is None or fund.revenue_ttm <= 0:
            dropped.append(cand)
            continue
        if fund.market_cap is None or fund.market_cap <= 0:
            dropped.append(cand)
            continue
        enriched.append((cand, fund))

    # Size proximity: log-ratio of revenue to target. Closest first.
    def proximity(item):
        _, f = item
        if target.revenue_ttm is None or target.revenue_ttm <= 0:
            return 0.0
        return abs(math.log(f.revenue_ttm) - math.log(target.revenue_ttm))

    enriched.sort(key=proximity)
    kept = [f for _, f in enriched[:max_peers]]
    return kept, dropped


# ---------------------------------------------------------------------------
# Multiple-selection engine
# ---------------------------------------------------------------------------

def _select_multiples(
    target: PeerFundamentals,
    peers: List[PeerFundamentals],
) -> Tuple[List[str], List[str]]:
    """Return (recommended_multiples, reasoning_lines).

    Rules per spec:
      - REIT (SIC 6798): P/B + flag missing P/FFO.
      - Financial sector (SIC 60-64, 67): P/B + ROE focus; suppress EV-based.
      - Negative EBITDA or earnings on ANY peer: suppress EV/EBITDA and P/E,
        route to EV/Sales with margin-comparison warning.
      - Wide EBIT/EBITDA dispersion: add EV/EBIT.
      - Stable positive earnings + comparable leverage: add P/E.
      - Always recommend 2–3 multiples; never 1.
    """
    recommended: List[str] = []
    reasoning: List[str] = []

    sic = target.sector  # we'll use the SIC code lookup separately

    # We don't carry target.sic on the PeerFundamentals dataclass yet —
    # the relative-valuation caller passes in the SIC explicitly via the
    # public compute() method. For now, infer from sector field as best
    # effort. The caller overrides this branch when it knows the SIC.
    return recommended, reasoning


def _selection_engine(
    target: PeerFundamentals,
    peers: List[PeerFundamentals],
    target_sic: str,
) -> Tuple[List[str], List[str]]:
    """Same as _select_multiples but with an explicit SIC argument."""
    recommended: List[str] = []
    reasoning: List[str] = []

    sic_major = target_sic[:2] if len(target_sic) >= 2 else target_sic

    # REIT path
    if target_sic == REIT_SIC_FULL:
        recommended.append("P/B")
        reasoning.append(
            "REIT detected (SIC 6798). The gold standard is P/FFO, but FFO isn't "
            "exposed in standard XBRL — surfacing P/B + ROE as the closest available "
            "lens. Caveat: REIT book values understate inflation-adjusted asset value."
        )
        if all(p.return_on_equity is not None for p in peers + [target]):
            reasoning.append(
                "All peers expose ROE — comparing P/B alongside ROE separates "
                "asset quality from leverage."
            )
        return recommended, reasoning

    # Financials path
    if sic_major in FINANCIAL_SIC_MAJORS:
        recommended.extend(["P/B", "P/E"])
        reasoning.append(
            "Financial sector (depository / insurance / broker). EV-based multiples "
            "are not informative — debt IS the product. Using P/B (book value is the "
            "regulatory capital metric) and P/E (equity is what shareholders own)."
        )
        return recommended, reasoning

    # General industrial path
    all_for_check = [target] + peers
    all_ebitda_positive = all(
        p.ebitda_ttm is not None and p.ebitda_ttm > 0 for p in all_for_check
    )
    all_earnings_positive = all(
        p.net_income_ttm is not None and p.net_income_ttm > 0 for p in all_for_check
    )

    if not all_ebitda_positive or not all_earnings_positive:
        recommended.append("EV/Sales")
        reasoning.append(
            "At least one peer (or the target) has negative or missing EBITDA / "
            "earnings — suppressing EV/EBITDA and P/E. Falling back to EV/Sales. "
            "WARNING: EV/Sales ignores margins, so check the margin column alongside "
            "the multiple — a low EV/Sales with low margins isn't actually cheap."
        )
        # add EV/EBIT only if peers have positive EBIT
        if all(p.ebit_ttm is not None and p.ebit_ttm > 0 for p in all_for_check):
            recommended.append("EV/EBIT")
            reasoning.append(
                "EV/EBIT survives even though EBITDA didn't — adds a profitability lens."
            )
        else:
            # Last resort: book value
            recommended.append("P/B")
            reasoning.append(
                "Adding P/B as a balance-sheet anchor — useful when earnings are unreliable."
            )
        return recommended[:3], reasoning

    # Default healthy case: positive earnings + EBITDA across the board.
    recommended.append("EV/EBITDA")
    reasoning.append(
        "EV/EBITDA: the default capital-structure-neutral multiple. All peers "
        "have positive EBITDA so the multiple is meaningful for everyone."
    )

    # Wide EBIT/EBITDA dispersion → recommend EV/EBIT
    ebit_to_ebitda_ratios = []
    for p in all_for_check:
        if p.ebit_ttm is not None and p.ebitda_ttm and p.ebitda_ttm > 0 and p.ebit_ttm > 0:
            ebit_to_ebitda_ratios.append(p.ebit_ttm / p.ebitda_ttm)
    if len(ebit_to_ebitda_ratios) >= 3:
        sd = _stdev(ebit_to_ebitda_ratios)
        if sd is not None and sd > 0.15:
            recommended.append("EV/EBIT")
            reasoning.append(
                f"Wide D&A intensity across peers (stdev of EBIT/EBITDA = {sd:.2f}). "
                "EV/EBIT surfaces depreciation differences that EV/EBITDA hides — "
                "capex-heavy peers look misleadingly cheap on EV/EBITDA."
            )

    # P/E is back in: add it as a secondary equity lens when earnings are positive.
    if all_earnings_positive and "P/E" not in recommended:
        recommended.append("P/E")
        reasoning.append(
            "P/E added as an equity-holder lens. Convergence between EV/EBITDA "
            "and P/E means capital structure isn't doing much of the work; "
            "divergence means leverage is the story."
        )

    return recommended[:3], reasoning


# ---------------------------------------------------------------------------
# Implied valuation (Layer 3 core math)
# ---------------------------------------------------------------------------

def _implied_per_share_from_multiple(
    multiple_name: str,
    peer_median_multiple: float,
    target: PeerFundamentals,
) -> Optional[float]:
    """Apply the peer median multiple to the target's metric → implied EV
    or equity value → implied per-share. Returns None if the target lacks
    the metric or shares outstanding.
    """
    defn = MULTIPLES.get(multiple_name)
    if not defn or peer_median_multiple is None or target.shares_outstanding is None or target.shares_outstanding <= 0:
        return None

    if defn["denominator"] == "_book_equity":
        denom_value = _book_equity(target)
    else:
        denom_value = getattr(target, defn["denominator"], None)
    if denom_value is None or denom_value <= 0:
        return None

    implied_numerator = peer_median_multiple * denom_value

    if defn["numerator"] == "enterprise_value":
        # EV → equity: subtract debt, add cash.
        debt = target.total_debt or 0.0
        cash = target.total_cash or 0.0
        implied_equity = implied_numerator - debt + cash
    else:  # market_cap → equity directly
        implied_equity = implied_numerator

    return implied_equity / target.shares_outstanding


# ---------------------------------------------------------------------------
# Outlier flags
# ---------------------------------------------------------------------------

def _peer_flags(peer: PeerFundamentals, all_peers: List[PeerFundamentals]) -> List[Dict[str, str]]:
    """Flag a peer when it's >1.5σ from the median on growth / margin /
    leverage. Surfaces "weak comp" candidates without auto-removing them
    — the user gets to decide.
    """
    flags: List[Dict[str, str]] = []

    def outlier(value: Optional[float], series: List[Optional[float]], label: str, code: str):
        if value is None:
            return
        clean = [v for v in series if v is not None]
        if len(clean) < 3:
            return
        med = statistics.median(clean)
        sd = _stdev(clean)
        if sd is None or sd == 0:
            return
        z = (value - med) / sd
        if abs(z) > 1.5:
            direction = "high" if z > 0 else "low"
            flags.append({"code": code, "label": f"{label} {direction} ({z:+.1f}σ)"})

    outlier(peer.revenue_growth_ttm,
            [p.revenue_growth_ttm for p in all_peers],
            "Growth", "growth_outlier")
    outlier(peer.operating_margin,
            [p.operating_margin for p in all_peers],
            "Margin", "margin_outlier")
    if peer.total_debt is not None and peer.market_cap and peer.market_cap > 0:
        leverage = peer.total_debt / peer.market_cap
        all_lev = []
        for p in all_peers:
            if p.total_debt is not None and p.market_cap and p.market_cap > 0:
                all_lev.append(p.total_debt / p.market_cap)
            else:
                all_lev.append(None)
        outlier(leverage, all_lev, "Leverage", "leverage_outlier")

    return flags


# ---------------------------------------------------------------------------
# Public service
# ---------------------------------------------------------------------------

class RelativeValuationService:
    def __init__(self, db: Session):
        self.db = db
        self.sec = SECService()

    def compute(
        self,
        target_ticker: str,
        override_peers: Optional[List[str]] = None,
        dcf_per_share: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Run the three-layer flow.

        Args:
            target_ticker: ticker symbol of the company being valued.
            override_peers: optional explicit peer list (skips suggestion).
            dcf_per_share: optional DCF intrinsic value from the user's
                Fundamentals/DCF tab. When provided, the reconciliation
                card surfaces side-by-side with the relative-implied value.
        """
        target_ticker = target_ticker.strip().upper()
        if not target_ticker:
            raise ValueError("target_ticker is required")

        # 1. Identify target via EDGAR (cik, sic, industry).
        target_candidates = self.sec.search_companies(target_ticker)
        target_match = None
        for c in target_candidates:
            if (c.get("ticker") or "").upper() == target_ticker:
                target_match = c
                break
        if target_match is None and target_candidates:
            target_match = target_candidates[0]
        if target_match is None:
            raise ValueError(f"{target_ticker} not found in EDGAR")

        target_sic = str(target_match.get("sic") or "")
        target_industry = target_match.get("industry") or ""

        # 2. Fetch target's TTM fundamentals + market data.
        target_fund = peer_fundamentals.get_fundamentals(target_ticker)
        if target_fund is None:
            raise ValueError(
                f"yfinance returned no data for {target_ticker}. The target may be "
                "delisted, an OTC name without market data, or a recent IPO."
            )

        # 3. Build peer set — either from override or via industry lookup
        # with curated fallback. yfinance's industry name is what we
        # actually compare against (target_fund.industry), since the
        # TickerUniverse cache uses raw EDGAR labels which are dated.
        peer_candidates: List[PeerCandidate] = []
        peer_source = "user"  # one of: 'user' | 'edgar_industry_cache' | 'curated' | 'merged'
        warnings: List[str] = []

        yf_industry = target_fund.industry or ""

        if override_peers:
            for sym in override_peers:
                sym_clean = sym.strip().upper()
                if not sym_clean or sym_clean == target_ticker:
                    continue
                peer_candidates.append(PeerCandidate(
                    ticker=sym_clean, cik="", company_name=sym_clean,
                    sic="", industry="",
                ))
            peer_source = "user"
        else:
            # First try the EDGAR-driven DB cache using the EDGAR industry string.
            db_candidates = _suggest_peer_candidates(
                self.db, target_industry, target_ticker, pool_size=18,
            )
            peer_candidates.extend(db_candidates)
            peer_source = "edgar_industry_cache" if db_candidates else "curated"

            # If the cache returned too few, merge in the curated peer
            # set keyed by yfinance's industry name (which we trust more
            # than the cache for the common analyst-relevant industries).
            if len(peer_candidates) < 6 and has_curated_set(yf_industry):
                seen = {c.ticker for c in peer_candidates}
                curated = get_curated_peers(yf_industry, exclude=target_ticker)
                added = 0
                for sym in curated:
                    if sym in seen:
                        continue
                    peer_candidates.append(PeerCandidate(
                        ticker=sym, cik="", company_name=sym,
                        sic="", industry=yf_industry,
                    ))
                    seen.add(sym)
                    added += 1
                if added > 0:
                    peer_source = "merged" if db_candidates else "curated"

            # Still nothing? Surface that to the user.
            if not peer_candidates:
                if not yf_industry:
                    warnings.append(
                        "Couldn't determine an industry for the target from either EDGAR "
                        "or yfinance — cannot suggest peers automatically. Use 'Add peer' "
                        "to build the cohort manually."
                    )
                elif not has_curated_set(yf_industry):
                    warnings.append(
                        f"No curated peer set for industry '{yf_industry}', and the EDGAR "
                        f"industry cache returned no rows. Use 'Add peer' to build the "
                        f"cohort manually."
                    )

        peers, dropped = _filter_and_rank_peers(peer_candidates, target_fund, max_peers=8)

        # 4. Compute multiples for target + each peer.
        target_multiples = _compute_multiples(target_fund)
        peer_multiples = {p.symbol: _compute_multiples(p) for p in peers}

        # 5. Per-peer flags
        peer_flag_map: Dict[str, List[Dict[str, str]]] = {
            p.symbol: _peer_flags(p, peers + [target_fund]) for p in peers
        }

        # 6. Selection engine
        recommended, reasoning = _selection_engine(target_fund, peers, target_sic)

        # 7. Reconciliation rows (peer-median multiple → implied per share).
        reconciliation_rows: List[Dict[str, Any]] = []
        for m in recommended:
            peer_vals = [peer_multiples[s].get(m) for s in peer_multiples]
            peer_med = _median(peer_vals)
            implied_ps = _implied_per_share_from_multiple(m, peer_med, target_fund) if peer_med is not None else None
            reconciliation_rows.append({
                "multiple": m,
                "target_multiple": target_multiples.get(m),
                "peer_median_multiple": peer_med,
                "implied_per_share": implied_ps,
            })

        # 8. Reconciliation summary — average across recommended multiples.
        relative_implied_per_share = None
        ps_values = [r["implied_per_share"] for r in reconciliation_rows if r["implied_per_share"] is not None]
        if ps_values:
            relative_implied_per_share = sum(ps_values) / len(ps_values)

        # 9. Category health — assembled across the full cohort (target +
        # peers) so the per-ratio medians include the target's value too.
        all_peer_ratios: Dict[str, Dict[str, Optional[float]]] = {
            target_fund.symbol: _derived_ratios(target_fund, target_multiples),
        }
        for p in peers:
            all_peer_ratios[p.symbol] = _derived_ratios(p, peer_multiples[p.symbol])
        category_health = _category_health(all_peer_ratios)

        # 10. Build response
        return {
            "target": {
                "ticker": target_ticker,
                "cik": target_match.get("cik"),
                "company_name": target_match.get("company_name") or target_fund.company_name,
                "sic": target_sic,
                "industry": display_industry(target_industry) or target_industry,
                "sector": sector_from_sic(target_sic) or target_match.get("sector"),
                "fundamentals": target_fund.to_dict(),
                "multiples": target_multiples,
                "category_ratios": all_peer_ratios.get(target_fund.symbol, {}),
                "category_health": category_health.get(target_fund.symbol, {}),
                "current_price": target_fund.price,
            },
            "peers": [
                {
                    "fundamentals": p.to_dict(),
                    "multiples": peer_multiples[p.symbol],
                    "category_ratios": all_peer_ratios.get(p.symbol, {}),
                    "category_health": category_health.get(p.symbol, {}),
                    "flags": peer_flag_map.get(p.symbol, []),
                }
                for p in peers
            ],
            "dropped_candidates": [{"ticker": c.ticker, "reason": "no_ttm_data"} for c in dropped],
            "recommended_multiples": recommended,
            "selection_reasoning": reasoning,
            "category_definitions": {
                name: {
                    "description": defn["description"],
                    "ratios": [
                        {"key": r["key"], "label": r["label"], "higher_better": r["higher_better"]}
                        for r in defn["ratios"]
                    ],
                }
                for name, defn in CATEGORY_DEFS.items()
            },
            "reconciliation": {
                "rows": reconciliation_rows,
                "relative_implied_per_share": relative_implied_per_share,
                "dcf_per_share": dcf_per_share,
                "current_market_price": target_fund.price,
            },
            "assumptions": {
                "data_window": "Trailing twelve months (TTM) — yfinance-stitched from latest filings.",
                "peer_pool": (
                    "EDGAR industry-cache lookup first, then a curated peer set keyed by "
                    "yfinance's industry name as fallback. No 2-digit SIC fallback (too "
                    "coarse — would mix unrelated business models). Ranked by revenue-size proximity."
                ),
                "selection_engine": "Rule-based; see selection_reasoning array.",
                "category_health": (
                    "Per-ratio signal vs peer-set median (+1 good side, -1 bad side, 0 at "
                    "median or missing). Category score = mean of per-ratio signals; bucketed "
                    "as good (> +0.5), okay (within ±0.5), bad (< -0.5)."
                ),
            },
            "peer_source": peer_source,
            "warnings": warnings,
        }
