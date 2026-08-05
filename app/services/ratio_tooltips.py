"""Ratio metadata and YoY driver attribution for hover tooltips.

The UI renders a tooltip when a user hovers a ratio cell. For the earliest
period in a series the tooltip shows only the formula and definition; for
later periods it also shows the year-over-year change and identifies the
single raw-value input that drove the largest share of that change.

Driver attribution uses a one-at-a-time swap: starting from the prior
period's values, we swap in the current period's value for one component
and recompute the ratio. The component whose swap produces the largest
absolute change in the ratio is labelled the primary driver. This handles
any ratio whose formula is expressible as a pure function of a few
numeric inputs, without hand-written per-ratio decompositions.

Callers pass the same `values` dict that `FinancialRatioCalculator
._extract_key_values` produces so we operate on raw inputs, not on the
already-rounded ratio outputs.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


# ---------------------------------------------------------------------------
# Ratio specifications
# ---------------------------------------------------------------------------

# Human-readable labels for the raw-value keys that back each ratio. Keys
# here match the dict produced by `_extract_key_values` in financial_ratios.py.
COMPONENT_LABELS: Dict[str, str] = {
    "revenue": "Revenue",
    "gross_profit": "Gross Profit",
    "operating_income": "Operating Income",
    "net_income": "Net Income",
    "cost_of_goods_sold": "Cost of Goods Sold",
    "interest_expense": "Interest Expense",
    "interest_income": "Interest Income",
    "non_operating_income": "Non-operating Income",
    "income_taxes": "Income Taxes",
    "sg&a": "SG&A",
    "depreciation_amortization": "Depreciation & Amortization",
    "shares_outstanding": "Shares Outstanding",
    "total_assets": "Total Assets",
    "current_assets": "Current Assets",
    "total_liabilities": "Total Liabilities",
    "current_liabilities": "Current Liabilities",
    "long_term_debt": "Long-term Debt",
    "total_equity": "Total Equity",
    "cash": "Cash & Equivalents",
    "short_term_investments": "Short-term Investments",
    "inventory": "Inventory",
    "accounts_receivable": "Accounts Receivable",
    "deffered_tax_assets": "Deferred Tax Assets",
    "PrepaidExpensesAndOtherCurrentAssets": "Prepaid Expenses",
    "accumulated_depreciation": "Accumulated Depreciation",
    "PP&E_net": "Net PP&E",
    "pp&e_gross": "Gross PP&E",
    "goodwill": "Goodwill",
    "operating_cash_flow": "Operating Cash Flow",
    "capex": "Capital Expenditures",
    "preferred_stock": "Preferred Stock",
}


def _safe_div(num: float, den: float) -> Optional[float]:
    """Return num/den or None when denominator is non-positive or missing."""
    if den is None or den == 0:
        return None
    try:
        return num / den
    except (TypeError, ZeroDivisionError):
        return None


# Each spec's `fn` receives a dict of raw values and returns the ratio value
# on the same scale the calculator produces (e.g. margins are returned as
# percent, leverage ratios as decimals).
RATIO_SPECS: Dict[str, Dict[str, Any]] = {
    "revenue": {
        "label": "Revenue",
        "formula": "Total revenue recognized during the period",
        "definition": "Top-line sales recognized from goods and services.",
        "components": ["revenue"],
        "fn": lambda v: v.get("revenue"),
    },
    "gross_profit_margin": {
        "label": "Gross Profit Margin",
        "formula": "(Gross Profit / Revenue) × 100",
        "definition": "Share of revenue remaining after direct cost of goods sold.",
        "components": ["gross_profit", "revenue"],
        "fn": lambda v: _safe_div(v.get("gross_profit", 0), v.get("revenue", 0)) and (v["gross_profit"] / v["revenue"]) * 100,
    },
    "operating_margin": {
        "label": "Operating Margin",
        "formula": "(Operating Income / Revenue) × 100",
        "definition": "Profit from core operations as a percentage of revenue, before interest and taxes.",
        "components": ["operating_income", "revenue"],
        "fn": lambda v: _safe_div(v.get("operating_income", 0), v.get("revenue", 0)) and (v["operating_income"] / v["revenue"]) * 100,
    },
    "net_margin": {
        "label": "Net Margin",
        "formula": "(Net Income / Revenue) × 100",
        "definition": "Share of revenue that converts to bottom-line profit after all expenses and taxes.",
        "components": ["net_income", "revenue"],
        "fn": lambda v: _safe_div(v.get("net_income", 0), v.get("revenue", 0)) and (v["net_income"] / v["revenue"]) * 100,
    },
    "ebitda_margin": {
        "label": "EBITDA Margin",
        "formula": "((Operating Income + D&A) / Revenue) × 100",
        "definition": "Operating profit before depreciation and amortization, as a share of revenue.",
        "components": ["operating_income", "depreciation_amortization", "revenue"],
        "fn": lambda v: _safe_div(
            v.get("operating_income", 0) + v.get("depreciation_amortization", 0),
            v.get("revenue", 0),
        ) and ((v["operating_income"] + v["depreciation_amortization"]) / v["revenue"]) * 100,
    },
    "current_ratio": {
        "label": "Current Ratio",
        "formula": "Current Assets / Current Liabilities",
        "definition": "Short-term liquidity: ability to cover obligations due within a year.",
        "components": ["current_assets", "current_liabilities"],
        "fn": lambda v: _safe_div(v.get("current_assets", 0), v.get("current_liabilities", 0)),
    },
    "quick_ratio": {
        "label": "Quick Ratio",
        "formula": "(Current Assets − Inventory − Deferred Tax Assets − Prepaid Expenses) / Current Liabilities",
        "definition": "Acid-test liquidity: near-cash resources versus short-term obligations.",
        "components": [
            "current_assets",
            "inventory",
            "deffered_tax_assets",
            "PrepaidExpensesAndOtherCurrentAssets",
            "current_liabilities",
        ],
        "fn": lambda v: _safe_div(
            v.get("current_assets", 0)
            - v.get("inventory", 0)
            - v.get("deffered_tax_assets", 0)
            - v.get("PrepaidExpensesAndOtherCurrentAssets", 0),
            v.get("current_liabilities", 0),
        ),
    },
    "cash_ratio": {
        "label": "Cash Ratio",
        "formula": "(Cash + Short-term Investments) / Current Liabilities",
        "definition": "Most conservative liquidity measure: cash-only coverage of short-term obligations.",
        "components": ["cash", "short_term_investments", "current_liabilities"],
        "fn": lambda v: _safe_div(
            v.get("cash", 0) + v.get("short_term_investments", 0),
            v.get("current_liabilities", 0),
        ),
    },
    "debt_to_equity": {
        "label": "Debt to Equity",
        "formula": "Long-term Debt / Total Equity",
        "definition": "Leverage: long-term debt financing relative to shareholders' equity.",
        "components": ["long_term_debt", "total_equity"],
        "fn": lambda v: _safe_div(v.get("long_term_debt", 0), v.get("total_equity", 0)),
    },
    "debt_to_total_capitalization": {
        "label": "Debt to Total Capitalization",
        "formula": "Long-term Debt / (Long-term Debt + Total Equity)",
        "definition": "Long-term debt's share of the company's total capital base.",
        "components": ["long_term_debt", "total_equity"],
        "fn": lambda v: _safe_div(
            v.get("long_term_debt", 0),
            v.get("long_term_debt", 0) + v.get("total_equity", 0),
        ),
    },
    "total_assets_to_equity": {
        "label": "Total Assets / Equity",
        "formula": "Total Assets / Total Equity",
        "definition": "Equity multiplier: how many dollars of assets each dollar of equity supports.",
        "components": ["total_assets", "total_equity"],
        "fn": lambda v: _safe_div(v.get("total_assets", 0), v.get("total_equity", 0)),
    },
    "roe": {
        "label": "Return on Equity",
        "formula": "(Net Income / Total Equity) × 100",
        "definition": "Profit generated per dollar of shareholders' equity.",
        "components": ["net_income", "total_equity"],
        "fn": lambda v: _safe_div(v.get("net_income", 0), v.get("total_equity", 0)) and (v["net_income"] / v["total_equity"]) * 100,
    },
    "roa": {
        "label": "Return on Assets",
        "formula": "(Net Income / Total Assets) × 100",
        "definition": "Profit generated per dollar of total assets deployed.",
        "components": ["net_income", "total_assets"],
        "fn": lambda v: _safe_div(v.get("net_income", 0), v.get("total_assets", 0)) and (v["net_income"] / v["total_assets"]) * 100,
    },
    "roic": {
        "label": "Return on Invested Capital",
        "formula": "(Net Income / (Total Assets − Current Liabilities)) × 100",
        "definition": "Profit per dollar of invested capital (long-term funding).",
        "components": ["net_income", "total_assets", "current_liabilities"],
        "fn": lambda v: _safe_div(
            v.get("net_income", 0),
            v.get("total_assets", 0) - v.get("current_liabilities", 0),
        ) and (v["net_income"] / (v["total_assets"] - v["current_liabilities"])) * 100,
    },
    "return_on_invested_capital": {
        "label": "Return on Invested Capital",
        "formula": "(Net Income / (Long-term Debt + Total Equity)) × 100",
        "definition": "Profit generated per dollar of long-term capital (debt + equity).",
        "components": ["net_income", "long_term_debt", "total_equity"],
        "fn": lambda v: _safe_div(
            v.get("net_income", 0),
            v.get("long_term_debt", 0) + v.get("total_equity", 0),
        ) and (v["net_income"] / (v["long_term_debt"] + v["total_equity"])) * 100,
    },
    "interest_coverage": {
        "label": "Interest Coverage",
        "formula": "Operating Income / Interest Expense",
        "definition": "How many times operating profit covers interest obligations.",
        "components": ["operating_income", "interest_expense"],
        "fn": lambda v: _safe_div(v.get("operating_income", 0), v.get("interest_expense", 0)),
    },
    "inventory_turnover": {
        "label": "Inventory Turnover",
        "formula": "|Cost of Goods Sold| / Inventory",
        "definition": "How many times inventory was sold and replaced during the period.",
        "components": ["cost_of_goods_sold", "inventory"],
        "fn": lambda v: _safe_div(abs(v.get("cost_of_goods_sold", 0) or 0), v.get("inventory", 0)),
    },
    "receivables_turnover": {
        "label": "Receivables Turnover",
        "formula": "Revenue / Accounts Receivable",
        "definition": "How many times the AR balance turned over during the period — higher = faster collection.",
        "components": ["revenue", "accounts_receivable"],
        "fn": lambda v: _safe_div(v.get("revenue", 0), v.get("accounts_receivable", 0)),
    },
    "operating_cash_flow_to_net_income": {
        "label": "Operating Cash Flow / Net Income",
        "formula": "Operating Cash Flow / Net Income",
        "definition": "Earnings quality: how much of reported earnings converts to cash.",
        "components": ["operating_cash_flow", "net_income"],
        "fn": lambda v: _safe_div(v.get("operating_cash_flow", 0), v.get("net_income", 0)),
    },
    "capex_to_depreciation": {
        "label": "Capex / Depreciation",
        "formula": "Capital Expenditures / Depreciation & Amortization",
        "definition": "Reinvestment intensity: capex relative to non-cash depreciation charge.",
        "components": ["capex", "depreciation_amortization"],
        "fn": lambda v: _safe_div(v.get("capex", 0), v.get("depreciation_amortization", 0)),
    },
    "net_working_capital_ratio": {
        "label": "Net Working Capital Ratio",
        "formula": "(Current Assets − Current Liabilities) / Total Assets",
        "definition": "Working capital funded by the balance sheet, scaled to total assets.",
        "components": ["current_assets", "current_liabilities", "total_assets"],
        "fn": lambda v: _safe_div(
            v.get("current_assets", 0) - v.get("current_liabilities", 0),
            v.get("total_assets", 0),
        ),
    },
    "sga_percent_of_revenue": {
        "label": "SG&A as % of Revenue",
        "formula": "(SG&A / Revenue) × 100",
        "definition": "Overhead intensity: selling, general and administrative expense as a share of revenue.",
        "components": ["sg&a", "revenue"],
        "fn": lambda v: _safe_div(v.get("sg&a", 0), v.get("revenue", 0)) and (v["sg&a"] / v["revenue"]) * 100,
    },
    "effective_tax_rate": {
        "label": "Effective Tax Rate",
        "formula": "(Income Taxes / Pretax Income) × 100",
        "definition": "Blended tax rate actually paid, based on pretax income.",
        "components": [
            "income_taxes",
            "operating_income",
            "interest_expense",
            "interest_income",
            "non_operating_income",
        ],
        "fn": lambda v: _safe_div(
            v.get("income_taxes", 0),
            v.get("operating_income", 0)
            + v.get("interest_expense", 0)
            + v.get("interest_income", 0)
            + v.get("non_operating_income", 0),
        ) and (
            v["income_taxes"]
            / (
                v["operating_income"]
                + v["interest_expense"]
                + v["interest_income"]
                + v["non_operating_income"]
            )
        ) * 100,
    },
    "book_value": {
        "label": "Book Value per Share",
        "formula": "(Total Assets − Total Liabilities) / Shares Outstanding",
        "definition": "Accounting equity per share — residual claim if assets were liquidated at book.",
        "components": ["total_assets", "total_liabilities", "shares_outstanding"],
        "fn": lambda v: _safe_div(
            v.get("total_assets", 0) - v.get("total_liabilities", 0),
            v.get("shares_outstanding", 0),
        ),
    },
    "tangible_book_value": {
        "label": "Tangible Book Value per Share",
        "formula": "(Total Assets − Total Liabilities − Goodwill) / Shares Outstanding",
        "definition": "Book value excluding goodwill — harder-asset equity per share.",
        "components": ["total_assets", "total_liabilities", "goodwill", "shares_outstanding"],
        "fn": lambda v: _safe_div(
            v.get("total_assets", 0) - v.get("total_liabilities", 0) - v.get("goodwill", 0),
            v.get("shares_outstanding", 0),
        ),
    },
    "average_age_of_plant": {
        "label": "Average Age of Plant",
        "formula": "Accumulated Depreciation / Depreciation Expense",
        "definition": "Rough age (in years) of the in-service fixed asset base.",
        "components": ["accumulated_depreciation", "depreciation_amortization"],
        "fn": lambda v: _safe_div(v.get("accumulated_depreciation", 0), v.get("depreciation_amortization", 0)),
    },
    "average_remaining_life_of_plant": {
        "label": "Average Remaining Life of Plant",
        "formula": "Net PP&E / Depreciation Expense",
        "definition": "Rough remaining useful life of fixed assets at current depreciation pace.",
        "components": ["PP&E_net", "depreciation_amortization"],
        "fn": lambda v: _safe_div(v.get("PP&E_net", 0), v.get("depreciation_amortization", 0)),
    },
    "average_total_life_span_of_plant": {
        "label": "Average Total Life Span of Plant",
        "formula": "Gross PP&E / Depreciation Expense",
        "definition": "Rough total useful life implied by the depreciation schedule.",
        "components": ["pp&e_gross", "depreciation_amortization"],
        "fn": lambda v: _safe_div(v.get("pp&e_gross", 0), v.get("depreciation_amortization", 0)),
    },
    "earnings_per_share": {
        "label": "Earnings per Share",
        "formula": "Net Income / Shares Outstanding",
        "definition": "Earnings attributable to each share of common stock.",
        "components": ["net_income", "shares_outstanding"],
        "fn": lambda v: _safe_div(v.get("net_income", 0), v.get("shares_outstanding", 0)),
    },
    "free_cash_flow": {
        "label": "Free Cash Flow",
        "formula": "Operating Cash Flow − Capex + Interest Expense × (1 − Tax Rate)",
        "definition": "Cash available to all capital providers after reinvestment.",
        "components": ["operating_cash_flow", "capex", "interest_expense"],
        "fn": lambda v: (
            v.get("operating_cash_flow", 0)
            - abs(v.get("capex", 0) or 0)
            + v.get("interest_expense", 0) * (1 - 0.21)
        ),
    },
}


# ---------------------------------------------------------------------------
# Driver attribution
# ---------------------------------------------------------------------------


def _component_label(component_key: str) -> str:
    return COMPONENT_LABELS.get(component_key, component_key.replace("_", " ").title())


def _safe_call(fn: Callable[[Dict[str, float]], Any], values: Dict[str, float]) -> Optional[float]:
    """Invoke a ratio fn, returning None on zero-division or bad inputs."""
    try:
        result = fn(values)
    except (ZeroDivisionError, TypeError, KeyError):
        return None
    if result is None or result is False:
        return None
    try:
        return float(result)
    except (TypeError, ValueError):
        return None


def _pct_change(curr: Optional[float], prev: Optional[float]) -> Optional[float]:
    if curr is None or prev is None or prev == 0:
        return None
    return (curr - prev) / abs(prev) * 100


def identify_primary_driver(
    spec: Dict[str, Any],
    curr_values: Dict[str, float],
    prev_values: Dict[str, float],
) -> Optional[Dict[str, Any]]:
    """Attribute a ratio's YoY change to its largest single-component mover.

    For each input component we compute the ratio that would obtain if only
    that component swapped to its current-period value (all other components
    held at their prior-period value). The component whose swap moves the
    ratio by the largest absolute amount is the primary driver.
    """
    fn = spec.get("fn")
    components = spec.get("components") or []
    if not fn or not components:
        return None

    prev_ratio = _safe_call(fn, prev_values)
    curr_ratio = _safe_call(fn, curr_values)
    if prev_ratio is None or curr_ratio is None:
        return None

    total_delta = curr_ratio - prev_ratio

    contributions: List[Dict[str, Any]] = []
    for component in components:
        if component not in prev_values or component not in curr_values:
            continue
        hybrid = dict(prev_values)
        hybrid[component] = curr_values[component]
        hybrid_ratio = _safe_call(fn, hybrid)
        if hybrid_ratio is None:
            continue
        contribution = hybrid_ratio - prev_ratio
        contributions.append(
            {
                "component": component,
                "component_label": _component_label(component),
                "prev_value": prev_values.get(component),
                "curr_value": curr_values.get(component),
                "component_pct_change": _pct_change(
                    curr_values.get(component), prev_values.get(component)
                ),
                "contribution": contribution,
            }
        )

    if not contributions:
        return None

    # Pick the component whose single-component swap moves the ratio in the
    # SAME direction as the actual change. A counter-direction component
    # (e.g. current assets growing on a ratio that fell) isn't the driver —
    # it's a partial offset. Falling back to the largest |contribution| only
    # when every component moved against the net delta (rare; usually a
    # rounding-tier change).
    aligned: List[Dict[str, Any]] = []
    if total_delta != 0:
        sign = 1.0 if total_delta > 0 else -1.0
        aligned = [
            c for c in contributions
            if (c.get("contribution") or 0.0) * sign > 0
        ]

    pool = aligned if aligned else contributions
    primary = max(pool, key=lambda c: abs(c["contribution"] or 0))
    return {
        "prev_ratio": prev_ratio,
        "curr_ratio": curr_ratio,
        "total_delta": total_delta,
        "component": primary["component"],
        "component_label": primary["component_label"],
        "component_pct_change": primary["component_pct_change"],
        "contribution": primary["contribution"],
        "direction": "increase" if total_delta > 0 else ("decrease" if total_delta < 0 else "flat"),
        "all_contributions": contributions,
    }


# ---------------------------------------------------------------------------
# Public tooltip builders
# ---------------------------------------------------------------------------


def build_tooltip(
    ratio_key: str,
    curr_values: Optional[Dict[str, float]] = None,
    prev_values: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """Return the tooltip payload for a single ratio cell.

    Args:
        ratio_key: e.g. ``"roe"`` — must match a key in ``RATIO_SPECS``.
        curr_values: raw values dict for the current period (same shape as
            ``FinancialRatioCalculator._extract_key_values`` returns). Only
            used when a prior period is also provided.
        prev_values: raw values dict for the prior period, or None. When
            None, the tooltip reports formula and definition only.

    Returns:
        A dict with ``label``, ``formula``, ``definition`` always present,
        and ``yoy`` (delta + primary driver info) when ``prev_values`` is
        supplied and the ratio could be computed for both periods.
    """
    spec = RATIO_SPECS.get(ratio_key)
    if not spec:
        return {
            "label": ratio_key,
            "formula": None,
            "definition": None,
            "yoy": None,
        }

    payload: Dict[str, Any] = {
        "label": spec["label"],
        "formula": spec["formula"],
        "definition": spec["definition"],
        "components": [_component_label(c) for c in spec.get("components", [])],
        "yoy": None,
    }

    if prev_values is None or curr_values is None:
        return payload

    driver = identify_primary_driver(spec, curr_values, prev_values)
    if driver is None:
        return payload

    payload["yoy"] = {
        "prev_ratio": driver["prev_ratio"],
        "curr_ratio": driver["curr_ratio"],
        "delta": driver["total_delta"],
        "delta_pct": _pct_change(driver["curr_ratio"], driver["prev_ratio"]),
        "direction": driver["direction"],
        "primary_driver": {
            "component": driver["component"],
            "component_label": driver["component_label"],
            "component_pct_change": driver["component_pct_change"],
            "contribution": driver["contribution"],
        },
        "summary": _format_driver_summary(spec, driver),
    }
    return payload


def build_tooltips_for_series(
    ratio_key: str,
    periods_in_order: List[str],
    values_by_period: Dict[str, Dict[str, float]],
) -> Dict[str, Dict[str, Any]]:
    """Build tooltip payloads for every period in a multi-year series.

    ``periods_in_order`` should list periods oldest-to-newest (or newest-to-
    oldest — the function treats the first entry as the baseline and compares
    each subsequent period to the one immediately before it). The first
    period's tooltip shows formula only; each later period shows YoY change
    versus its immediate predecessor plus the primary driver of that change.
    """
    out: Dict[str, Dict[str, Any]] = {}
    prev_period: Optional[str] = None
    for period in periods_in_order:
        curr_values = values_by_period.get(period)
        prev_values = values_by_period.get(prev_period) if prev_period else None
        out[period] = build_tooltip(ratio_key, curr_values, prev_values)
        prev_period = period
    return out


def _format_driver_summary(spec: Dict[str, Any], driver: Dict[str, Any]) -> str:
    """Short human-readable summary of the YoY move and its primary driver."""
    direction = driver["direction"]
    delta = driver["total_delta"] or 0
    component_label = driver["component_label"]
    pct = driver["component_pct_change"]
    pct_str = f"{pct:+.1f}%" if pct is not None else "n/a"
    move_word = {
        "increase": "rose",
        "decrease": "fell",
        "flat": "was unchanged",
    }.get(direction, "moved")
    if direction == "flat":
        return f"{spec['label']} was unchanged period-over-period."
    return (
        f"{spec['label']} {move_word} by {abs(delta):.2f}; "
        f"primary driver was {component_label} ({pct_str})."
    )
