"""
Filer-schema detection + structural-blank reasoning.

Why this exists:
  Some ratios are blank not because of a data-quality problem but because
  the filer's income statement / balance sheet doesn't include the line
  item at all (e.g. airlines don't report SG&A; banks have no COGS; REITs
  file unclassified balance sheets). Surfacing those as plain blanks
  hides the reason. This module:

    1. detect_filer_schema(values, is_keys, bs_keys) → an industry archetype
    2. NULL_REASONS: (ratio_key, schema) → human-readable explanation
    3. null_reason_for(ratio_key, schema) → looks up an explanation, or None
       if there's no special-case reason and the blank is just "missing data"

The mapping is intentionally narrow — only ratios that come up structurally
blank for the archetypes we see in practice are listed. Anything not in
the table falls through to None and the UI shows a plain blank.
"""

from __future__ import annotations
from typing import Iterable, Optional, Set


# Industry archetypes detected from XBRL tag presence.
SCHEMA_GOODS    = "goods"     # standard income-statement: Revenue → COGS → GP → SG&A → OpInc
SCHEMA_AIRLINE  = "airline"   # function-categorized operating expenses; no SG&A line
SCHEMA_BANK     = "bank"      # interest-income business; no COGS / no SG&A; unclassified BS
SCHEMA_REIT     = "reit"      # rental income; no COGS in conventional sense; unclassified BS
SCHEMA_INSURER  = "insurer"   # premiums earned; no COGS
SCHEMA_UNKNOWN  = "unknown"


def detect_filer_schema(
    income_statement_keys: Iterable[str],
    balance_sheet_keys: Iterable[str],
) -> str:
    """Detect the filer's income-statement schema from which XBRL tags are
    present. Returns one of the SCHEMA_* constants."""
    is_keys: Set[str] = set(income_statement_keys or [])
    bs_keys: Set[str] = set(balance_sheet_keys or [])

    has_aircraft = "AircraftMaintenanceMaterialsAndRepairs" in is_keys or "LandingFeesAndOtherRentals" in is_keys
    has_premiums = "PremiumsEarnedNet" in is_keys or "InsurancePremiumsAndDepositCollections" in is_keys
    has_lease_income = "LeaseIncome" in is_keys or "RentalIncomeOperating" in is_keys
    has_deposits = "Deposits" in bs_keys or "DepositsLiabilities" in bs_keys
    has_classified_bs = (
        "CurrentAssetsTotal" in bs_keys or "AssetsCurrent" in bs_keys
    ) and (
        "CurrentLiabilitiesTotal" in bs_keys or "LiabilitiesCurrent" in bs_keys
    )
    has_sga = "SellingGeneralAndAdminExpenses" in is_keys
    has_cogs = "CostOfGoodsAndServicesSold" in is_keys
    has_inventory = "Inventories" in bs_keys

    # Airline: distinctive operating-expense categories.
    if has_aircraft:
        return SCHEMA_AIRLINE

    # Insurer: distinctive top line.
    if has_premiums:
        return SCHEMA_INSURER

    # REIT: lease income + unclassified BS + no inventory.
    if has_lease_income and not has_classified_bs and not has_inventory:
        return SCHEMA_REIT

    # Bank: deposits liability OR unclassified BS + no inventory + no SG&A.
    # Banks frequently mis-tag interest expense under standard concepts, so
    # we lean on balance-sheet signals.
    if has_deposits or (not has_classified_bs and not has_inventory and not has_sga):
        return SCHEMA_BANK

    # Goods: has both COGS and a classified BS.
    if has_cogs and has_classified_bs:
        return SCHEMA_GOODS

    return SCHEMA_UNKNOWN


# ---------------------------------------------------------------------------
# Null-reason library
# ---------------------------------------------------------------------------
#   (ratio_key, schema) → explanation that will go into the tooltip when the
#   ratio is blank. Only entries that describe a STRUCTURAL reason (not a
#   bug or data-quality issue) belong here. Falling off this table → no
#   tooltip and the cell stays blank as before.

NULL_REASONS = {
    # SG&A — not separately reported by airlines, banks, REITs, insurers.
    ("sga_percent_of_revenue", SCHEMA_AIRLINE): (
        "Airlines don't report SG&A as a separate line. Personnel and overhead are "
        "filed under function categories (Salaries, wages, and benefits; Other operating expenses)."
    ),
    ("sga_percent_of_revenue", SCHEMA_BANK): (
        "Banks don't report SG&A in the goods-business sense. Operating costs are "
        "filed as 'Non-interest expense' sub-categories (compensation, occupancy, technology)."
    ),
    ("sga_percent_of_revenue", SCHEMA_REIT): (
        "REITs typically don't break out SG&A as a percentage of rental revenue — "
        "general & administrative is filed as a small standalone line, not within a cost structure."
    ),
    ("sga_percent_of_revenue", SCHEMA_INSURER): (
        "Insurers don't report SG&A in the goods-business sense. Operating costs flow "
        "through underwriting expenses, commissions, and general & admin separately."
    ),

    # Gross profit margin — no COGS structure for banks/REITs/insurers.
    ("gross_profit_margin", SCHEMA_BANK): (
        "Banks don't have COGS. The closest analog is net interest margin (interest income − "
        "interest expense, scaled by earning assets)."
    ),
    ("gross_profit_margin", SCHEMA_REIT): (
        "REITs don't have COGS. The closest analog is Net Operating Income (NOI) — "
        "rental income minus property-level operating expenses."
    ),
    ("gross_profit_margin", SCHEMA_INSURER): (
        "Insurers don't have COGS. Underwriting margin (premiums earned − claims and benefits) "
        "is the closest analog."
    ),

    # Operating margin — banks/REITs frequently don't tag OperatingIncomeLoss.
    ("operating_margin", SCHEMA_BANK): (
        "Banks rarely tag a standard 'Operating Income' line. Pre-provision net revenue "
        "and pretax income are the equivalents."
    ),
    ("operating_margin", SCHEMA_REIT): (
        "REITs report Funds From Operations (FFO) rather than a standard operating-income "
        "line — operating margin in the goods sense doesn't apply."
    ),

    # Liquidity ratios — unclassified balance sheets.
    ("current_ratio", SCHEMA_BANK): (
        "Banks file unclassified balance sheets — assets and liabilities aren't split current vs. "
        "long-term. Liquidity is assessed via LCR (Liquidity Coverage Ratio) instead."
    ),
    ("current_ratio", SCHEMA_REIT): (
        "REITs file unclassified balance sheets — investment real estate isn't split current vs. "
        "long-term. Liquidity is assessed via cash + revolver capacity instead."
    ),
    ("current_ratio", SCHEMA_INSURER): (
        "Insurers file unclassified balance sheets and have very different liquidity dynamics "
        "(claims reserves, investment portfolio)."
    ),

    ("quick_ratio", SCHEMA_BANK): (
        "Banks file unclassified balance sheets — there's no Current Liabilities tag to "
        "compute the quick ratio against."
    ),
    ("quick_ratio", SCHEMA_REIT): (
        "REITs file unclassified balance sheets — there's no Current Liabilities tag to "
        "compute the quick ratio against."
    ),
    ("quick_ratio", SCHEMA_INSURER): (
        "Insurers file unclassified balance sheets — the quick ratio framework doesn't apply."
    ),

    # Inventory turnover — service businesses don't carry inventory.
    ("inventory_turnover", SCHEMA_BANK):    "Banks don't carry inventory — the ratio doesn't apply.",
    ("inventory_turnover", SCHEMA_REIT):    "REITs don't carry inventory — the ratio doesn't apply.",
    ("inventory_turnover", SCHEMA_INSURER): "Insurers don't carry inventory — the ratio doesn't apply.",
    ("inventory_turnover", SCHEMA_AIRLINE): (
        "Airlines carry fuel/parts as inventory but it's tagged under industry-specific concepts "
        "(e.g. msft-style entity extensions). Standard COGS-based turnover doesn't apply."
    ),
}


def null_reason_for(ratio_key: str, schema: str) -> Optional[str]:
    """Return the structural explanation for why a ratio is blank under the
    given schema, or None if the blank is just missing data."""
    return NULL_REASONS.get((ratio_key, schema))
