"""Common-size income statement ratios.

Common-size ratios express income-statement line items as a percentage of
revenue, making margin structure easy to compare across periods or peers.

Exports:
- `calculate_common_size(values)` — pure function over an extracted values dict
- `calculate_common_size_multi_period(...)` — orchestrator that pulls data for
  each period from SECService and runs the ratios.
"""

from typing import Any, Dict, List, Optional

from services.sec_service import SECService
from services.financial_ratios import FinancialRatioCalculator
from services.ratio_tooltips import COMPONENT_LABELS, identify_primary_driver


def _result(value: Optional[float], label: str) -> Dict[str, Any]:
    return {
        "value": round(value, 4) if value is not None else None,
        "label": label,
    }


def _safe_div(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator


def _pct(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    ratio = _safe_div(numerator, denominator)
    return ratio * 100 if ratio is not None else None


# ---------------------------------------------------------------------------
# Tooltip specs + driver attribution
# ---------------------------------------------------------------------------
# Each spec mirrors the corresponding calculation inside
# `calculate_common_size` so driver-attribution swap logic operates on the
# same raw inputs the displayed figure was derived from. Reusing
# `identify_primary_driver` from ratio_tooltips keeps the YoY driver math
# consistent with the Ratio Analysis tab.


def _pretax_income(v: Dict[str, float]) -> Optional[float]:
    total = (
        (v.get("operating_income") or 0)
        + (v.get("interest_expense") or 0)
        + (v.get("interest_income") or 0)
        + (v.get("non_operating_income") or 0)
    )
    return total or None


def _operating_expenses_total(v: Dict[str, float]) -> Optional[float]:
    reported = v.get("operating_expenses")
    if reported:
        return reported
    summed = (
        (v.get("cost_of_goods_sold") or 0)
        + (v.get("sg&a") or 0)
        + (v.get("depreciation_amortization") or 0)
        + (v.get("research_and_developement") or 0)
    )
    return summed or None


def _ebitda(v: Dict[str, float]) -> Optional[float]:
    oi = v.get("operating_income")
    if oi is None:
        return None
    return oi + (v.get("depreciation_amortization") or 0)


def _adjusted_ebit(v: Dict[str, float]) -> Optional[float]:
    oi = v.get("operating_income")
    if oi is None:
        return None
    etr = _safe_div(v.get("income_taxes"), _pretax_income(v))
    if etr is None:
        return None
    return oi * (1 - etr)


COMMON_SIZE_SPECS: Dict[str, Dict[str, Any]] = {
    "cost_of_goods_sold": {
        "label": "Cost of Goods Sold",
        "formula": "(COGS / Revenue) × 100",
        "definition": "Direct cost of producing goods and services sold, as a share of revenue.",
        "components": ["cost_of_goods_sold", "revenue"],
        "fn": lambda v: _pct(v.get("cost_of_goods_sold"), v.get("revenue")),
    },
    "gross_margin": {
        "label": "Gross Margin",
        "formula": "(Gross Profit / Revenue) × 100",
        "definition": "Share of revenue remaining after direct cost of goods sold.",
        "components": ["gross_profit", "revenue"],
        "fn": lambda v: _pct(v.get("gross_profit"), v.get("revenue")),
    },
    "sga": {
        "label": "Selling, General & Administrative",
        "formula": "(SG&A / Revenue) × 100",
        "definition": "SG&A overhead intensity as a share of revenue.",
        "components": ["sg&a", "revenue"],
        "fn": lambda v: _pct(v.get("sg&a"), v.get("revenue")),
    },
    "research_and_development": {
        "label": "Research & Development",
        "formula": "(R&D / Revenue) × 100",
        "definition": "R&D spend as a share of revenue.",
        "components": ["research_and_developement", "revenue"],
        "fn": lambda v: _pct(v.get("research_and_developement"), v.get("revenue")),
    },
    "depreciation_amortization": {
        "label": "Depreciation & Amortization",
        "formula": "(D&A / Revenue) × 100",
        "definition": "Non-cash depreciation and amortization as a share of revenue.",
        "components": ["depreciation_amortization", "revenue"],
        "fn": lambda v: _pct(v.get("depreciation_amortization"), v.get("revenue")),
    },
    "operating_expenses": {
        "label": "Operating Expenses",
        "formula": "(Operating Expenses / Revenue) × 100",
        "definition": "Reported total operating expense (or COGS + SG&A + D&A + R&D) as a share of revenue.",
        "components": [
            "operating_expenses",
            "cost_of_goods_sold",
            "sg&a",
            "depreciation_amortization",
            "research_and_developement",
            "revenue",
        ],
        "fn": lambda v: _pct(_operating_expenses_total(v), v.get("revenue")),
    },
    "operating_margin": {
        "label": "Operating Margin",
        "formula": "(Operating Income / Revenue) × 100",
        "definition": "Profit from core operations as a share of revenue, before interest and taxes.",
        "components": ["operating_income", "revenue"],
        "fn": lambda v: _pct(v.get("operating_income"), v.get("revenue")),
    },
    "pre_tax_margin": {
        "label": "Pre-Tax Margin",
        "formula": "((Operating Income + Interest Expense + Interest Income + Non-operating Income) / Revenue) × 100",
        "definition": "Profit before tax as a share of revenue.",
        "components": [
            "operating_income",
            "interest_expense",
            "interest_income",
            "non_operating_income",
            "revenue",
        ],
        "fn": lambda v: _pct(_pretax_income(v), v.get("revenue")),
    },
    "effective_tax_rate": {
        "label": "Effective Tax Rate",
        "formula": "(Income Taxes / Pretax Income) × 100",
        "definition": "Blended tax rate actually paid on pretax income.",
        "components": [
            "income_taxes",
            "operating_income",
            "interest_expense",
            "interest_income",
            "non_operating_income",
        ],
        "fn": lambda v: _pct(v.get("income_taxes"), _pretax_income(v)),
    },
    "net_margin": {
        "label": "Net Margin",
        "formula": "(Net Income / Revenue) × 100",
        "definition": "Share of revenue that converts to bottom-line profit.",
        "components": ["net_income", "revenue"],
        "fn": lambda v: _pct(v.get("net_income"), v.get("revenue")),
    },
    "ebit": {
        "label": "EBIT ($)",
        "formula": "Operating Income (proxy for EBIT)",
        "definition": "Earnings before interest and taxes, in dollars.",
        "components": ["operating_income"],
        "fn": lambda v: v.get("operating_income"),
    },
    "ebit_margin": {
        "label": "EBIT Margin",
        "formula": "(EBIT / Revenue) × 100",
        "definition": "EBIT as a share of revenue.",
        "components": ["operating_income", "revenue"],
        "fn": lambda v: _pct(v.get("operating_income"), v.get("revenue")),
    },
    "ebitda": {
        "label": "EBITDA ($)",
        "formula": "Operating Income + D&A",
        "definition": "Earnings before interest, taxes, depreciation and amortization, in dollars.",
        "components": ["operating_income", "depreciation_amortization"],
        "fn": _ebitda,
    },
    "ebitda_margin": {
        "label": "EBITDA Margin",
        "formula": "((Operating Income + D&A) / Revenue) × 100",
        "definition": "EBITDA as a share of revenue.",
        "components": ["operating_income", "depreciation_amortization", "revenue"],
        "fn": lambda v: _pct(_ebitda(v), v.get("revenue")),
    },
    "adjusted_ebit": {
        "label": "Adjusted EBIT ($)",
        "formula": "EBIT × (1 − Effective Tax Rate)",
        "definition": "NOPAT: after-tax operating profit, in dollars.",
        "components": [
            "operating_income",
            "income_taxes",
            "interest_expense",
            "interest_income",
            "non_operating_income",
        ],
        "fn": _adjusted_ebit,
    },
}


def _component_label(key: str) -> str:
    return COMPONENT_LABELS.get(key, key.replace("_", " ").title())


def _pct_change(curr: Optional[float], prev: Optional[float]) -> Optional[float]:
    if curr is None or prev is None or prev == 0:
        return None
    return (curr - prev) / abs(prev) * 100


def _build_cs_tooltip(
    spec: Dict[str, Any],
    curr_values: Optional[Dict[str, float]],
    prev_values: Optional[Dict[str, float]],
) -> Dict[str, Any]:
    """Tooltip payload for a single common-size cell.

    Matches the shape produced by `ratio_tooltips.build_tooltip` so the
    frontend `RatioTooltipCell` renders identically for both tabs.
    """
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
    }
    return payload


def _attach_common_size_tooltips(
    by_period: Dict[str, Dict[str, Any]],
    raw_values_by_period: Dict[str, Dict[str, float]],
) -> None:
    """Attach tooltip + YoY driver info onto each common-size cell in-place.

    Periods sort chronologically; the earliest shows formula only, and each
    later period compares against its immediate predecessor.
    """
    if not by_period:
        return
    periods_sorted = sorted(by_period.keys())
    prev_period: Optional[str] = None
    for period in periods_sorted:
        curr_values = raw_values_by_period.get(period) or {}
        prev_values = raw_values_by_period.get(prev_period) if prev_period else None
        for metric_key, spec in COMMON_SIZE_SPECS.items():
            tooltip = _build_cs_tooltip(spec, curr_values, prev_values)
            cell = by_period.get(period, {}).get(metric_key)
            if isinstance(cell, dict):
                cell["tooltip"] = tooltip
        prev_period = period


def calculate_common_size(values: Dict[str, float]) -> Dict[str, Dict[str, Any]]:
    """Build common-size income statement ratios from an extracted values dict.

    Percentages are expressed in standard form (e.g. 42.1 means 42.1%).
    Dollar figures (EBIT, adjusted EBIT) pass through as-is.
    """
    ratios: Dict[str, Dict[str, Any]] = {}
    revenue = values.get("revenue") or None  # treat 0 as missing for denominators

    # --- line-item margins ---------------------------------------------------
    ratios["cost_of_goods_sold"] = _result(
        _pct(values.get("cost_of_goods_sold"), revenue), "Cost of Goods Sold"
    )
    ratios["gross_margin"] = _result(
        _pct(values.get("gross_profit"), revenue), "Gross Margin"
    )
    ratios["sga"] = _result(
        _pct(values.get("sg&a"), revenue), "Selling, General & Administrative"
    )
    ratios["research_and_development"] = _result(
        _pct(values.get("research_and_developement"), revenue),
        "Research & Development",
    )
    ratios["depreciation_amortization"] = _result(
        _pct(values.get("depreciation_amortization"), revenue),
        "Depreciation & Amortization",
    )

    # --- total operating expenses (reported, else sum of components) --------
    op_expenses = values.get("operating_expenses")
    if not op_expenses:
        op_expenses = (
            (values.get("cost_of_goods_sold") or 0)
            + (values.get("sg&a") or 0)
            + (values.get("depreciation_amortization") or 0)
            + (values.get("research_and_developement") or 0)
        ) or None
    ratios["operating_expenses"] = _result(_pct(op_expenses, revenue), "Operating Expenses")

    # --- margins below the line ---------------------------------------------
    ratios["operating_margin"] = _result(
        _pct(values.get("operating_income"), revenue), "Operating Margin"
    )

    # Pre-tax income follows the same construction used in financial_ratios.py
    # for consistency with the rest of the app's ratio pipeline.
    pretax_income = (
        (values.get("operating_income") or 0)
        + (values.get("interest_expense") or 0)
        + (values.get("interest_income") or 0)
        + (values.get("non_operating_income") or 0)
    )
    pretax_income_denom = pretax_income or None
    ratios["pre_tax_margin"] = _result(_pct(pretax_income_denom, revenue), "Pre-Tax Margin")

    etr_decimal = _safe_div(values.get("income_taxes"), pretax_income_denom)
    ratios["effective_tax_rate"] = _result(
        etr_decimal * 100 if etr_decimal is not None else None,
        "Effective Tax Rate",
    )

    ratios["net_margin"] = _result(
        _pct(values.get("net_income"), revenue), "Net Margin"
    )

    # --- EBIT and derived figures -------------------------------------------
    operating_income = values.get("operating_income")
    depreciation = values.get("depreciation_amortization") or 0

    # Filers like Alcoa don't tag us-gaap:OperatingIncomeLoss, so the lookup
    # returns 0. Fall back to EBIT = Net Income + Income Taxes + Interest
    # Expense, which is derivable from concepts those filers do tag.
    if not operating_income and values.get("net_income") and values.get("income_taxes"):
        ebit = (
            values["net_income"]
            + values["income_taxes"]
            + (values.get("interest_expense") or 0)
        )
    else:
        ebit = operating_income if operating_income else None
    ratios["ebit"] = _result(ebit, "EBIT ($)")
    ratios["ebit_margin"] = _result(_pct(ebit, revenue), "EBIT Margin")

    ebitda = (ebit + depreciation) if ebit is not None else None

    ratios["ebitda"] = _result(ebitda, "EBITDA ($)")
    ratios["ebitda_margin"] = _result(_pct(ebitda, revenue), "EBITDA Margin")

    # NOPAT — EBIT × (1 − effective tax rate). Original file called this
    # "Adjusted EBIT"; keeping the label for UI familiarity. When EBIT came
    # from the NI+Tax+InterestExpense fallback, derive ETR from those same
    # filer-tagged inputs (Tax / (NI + Tax)) instead of the operating-income-
    # based pretax — otherwise the broken pretax leaks into NOPAT.
    if not operating_income and values.get("net_income") and values.get("income_taxes"):
        pretax_for_etr = values["net_income"] + values["income_taxes"]
        etr_for_nopat = (
            values["income_taxes"] / pretax_for_etr if pretax_for_etr else None
        )
    else:
        etr_for_nopat = etr_decimal
    if ebit is not None and etr_for_nopat is not None:
        adjusted_ebit = ebit * (1 - etr_for_nopat)
    else:
        adjusted_ebit = None
    ratios["adjusted_ebit"] = _result(adjusted_ebit, "Adjusted EBIT ($)")

    return ratios


def calculate_common_size_multi_period(
    sec_service: SECService,
    ratio_calculator: FinancialRatioCalculator,
    cik: str,
    report_type: str,
    periods: List[str],
) -> Dict[str, Any]:
    """Run common-size analysis across multiple periods for a single ticker.

    Returns `{"periods": [...covered...], "by_period": {period: {ratios}}}`.
    Periods with no extractable data are silently skipped.
    """
    by_period: Dict[str, Dict[str, Any]] = {}
    raw_values_by_period: Dict[str, Dict[str, float]] = {}
    covered: List[str] = []

    for period in periods:
        data = sec_service.get_financial_statements(cik, report_type, period)
        if not data or not data.get("income_statement"):
            continue

        values = ratio_calculator._extract_key_values(
            data["income_statement"],
            data.get("balance_sheet", {}),
            data.get("cash_flow", {}),
            user_inputs={},  # _extract_key_values dereferences this dict
        )
        by_period[period] = calculate_common_size(values)
        raw_values_by_period[period] = values
        covered.append(period)

    _attach_common_size_tooltips(by_period, raw_values_by_period)

    return {"periods": covered, "by_period": by_period}
