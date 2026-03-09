# SEC Financial Export Tool - Development Conversation Summary

**Date:** 2026-02-03
**Project:** SEC-App
**Files Created/Modified:**
- `financial_export_20260203.py` (new)
- `financial_export_changes_20260203.txt` (new)
- `verify_taxonomy.py` (analysis script)
- `analyze_categorization.py` (analysis script)
- `explain_balance_type.py` (analysis script)
- `explain_dates.py` (analysis script)

---

## Table of Contents

1. [Initial Context](#1-initial-context)
2. [ChatGPT Claims Verification](#2-chatgpt-claims-verification)
3. [Problems Identified in Original Script](#3-problems-identified-in-original-script)
4. [Solution: 4-Layer Categorization Strategy](#4-solution-4-layer-categorization-strategy)
5. [Layer 4 Deep Dive: Balance Type Discriminator](#5-layer-4-deep-dive-balance-type-discriminator)
6. [Implementation Details](#6-implementation-details)
7. [Data Provenance Feature](#7-data-provenance-feature)
8. [Test Results](#8-test-results)
9. [Files Created](#9-files-created)

---

## 1. Initial Context

### The Problem Statement

The user had a conversation (stored in `info.txt`) about issues with the `sec_financial_export.py` script. The Excel files it generated had problems with financial statement categorization.

### Original Conversation Summary (from info.txt)

The conversation identified that:

1. **XBRL Naming Flexibility**: Companies can name line items differently from official FASB taxonomy names. For example, "Selling, General, and Administrative Expense" might be labeled as "Marketing" or broken into separate line items.

2. **Three Specific Issues**:
   - Extensions not rolling up to parent level
   - Syntax/label mismatches
   - Line items being dumped into wrong financial statements (HIGH PRIORITY)

3. **ChatGPT's Proposed Solution**: A layered mapping strategy:
   - Layer 1: Use concept IDs (~70-85% coverage)
   - Layer 2: Extension roll-ups via calculation trees
   - Layer 3: Dimensional context
   - Layer 4: Fuzzy text matching as last resort

### User Request

Verify the ChatGPT claims and implement fixes to the script.

---

## 2. ChatGPT Claims Verification

We systematically verified each claim made by ChatGPT:

### Claim 1: "XBRL concept IDs are the primary key, not labels"

**VERDICT: VERIFIED**

We fetched data from SEC's companyfacts API and confirmed:

```python
# SEC API returns data keyed by concept ID with separate label
{
    'Assets': {
        'label': 'Assets',
        'description': 'Sum of the carrying amounts...',
        'units': {
            'USD': [
                {'end': '2024-06-30', 'val': 512163000000, ...}
            ]
        }
    }
}
```

### Claim 2: "Calculation linkbases contain parent-child relationships"

**VERDICT: VERIFIED**

We parsed `us-gaap-stm-sfp-cls1-cal-2024.xml` and found:

```
Found 257 calculation arcs (parent-child relationships)
  LiabilitiesAndStockholdersEquity -> Liabilities (weight=1.0)
  LiabilitiesAndStockholdersEquity -> CommitmentsAndContingencies (weight=1.0)
  CapitalizedComputerSoftwareNet -> CapitalizedComputerSoftwareGross (weight=1.0)
  CapitalizedComputerSoftwareNet -> CapitalizedComputerSoftwareAccumulatedAmortization (weight=-1.0)
```

### Claim 3: "70-85% coverage with standard concepts"

**VERDICT: INCORRECT**

Actual coverage for Microsoft (CIK 0000789019):
- Total US-GAAP concepts: 543
- Found in taxonomy statements: 266 (**49.0%**, not 70-85%)
- Categorized by keywords: 267 (49.2%)
- Uncategorized: 10 (1.8%)

### Claim 4: "Extensions can roll up to parents via calculation trees"

**VERDICT: VERIFIED**

Calculation arcs show hierarchy:
```
Assets
  -> CurrentAssets
       -> CashAndCashEquivalents
       -> AccountsReceivable
```

### Claim 5: "periodType (instant vs duration) discriminates statements"

**VERDICT: VERIFIED**

From taxonomy schema:
- `instant` = Balance Sheet items (point-in-time measurements)
- `duration` = Income Statement/Cash Flow items (over-time measurements)

---

## 3. Problems Identified in Original Script

### Problem 1: Naive Substring Matching

The original code:
```python
if any(kw in tag_lower for kw in income_keywords):
    return 'Income Statement'
```

This caused false matches:

```
Tag: "AvailableForSaleSecuritiesCurrent"
                    ^^^^^ ^
                    "sale" + "s" from "Securities" = "sales"

The keyword "sales" accidentally matched because "ForSale" + "Securities"
contains the substring "sales" when concatenated.

Result: Balance Sheet item incorrectly categorized as Income Statement
```

**Proof:**
```python
tag = 'availableforsalesecuritiescurrent'
# Position 12-16 contains "sales":
# a-v-a-i-l-a-b-l-e-f-o-r-s-a-l-e-s-e-c...
#                         ^ ^ ^ ^ ^
#                         s a l e s
```

### Problem 2: Keyword Priority Order

Original order:
1. Cash Flow Statement
2. Income Statement  <-- checked BEFORE Balance Sheet
3. Balance Sheet

For `DeferredTaxAssetsNetCurrent`:
- Contains "tax" (Income Statement keyword)
- Contains "asset" (Balance Sheet keyword)
- "tax" checked FIRST -> returned Income Statement (WRONG)

### Problem 3: Deprecated Tags Not Handled

Evidence from `remaining_keyword_hits.txt`:
- 55 tags fell back to keyword categorization
- 37 incorrectly categorized as "Income Statement"
- 13 incorrectly categorized as "Cash Flow"
- 5 incorrectly categorized as "Balance Sheet"

Many tags marked "NOT FOUND in any linkbase file":
- `AvailableForSaleSecuritiesCurrent`
- `DeferredTaxAssetsNetCurrent`
- `EffectOfExchangeRateOnCashAndCashEquivalents`

### Problem 4: No Calculation Hierarchy Usage

The script downloaded calculation files but only used file path patterns:
```python
def get_category_from_filepath(filepath):
    if '/stm/' in lower_path:
        if 'sfp' in lower_path:
            return 'Balance Sheet'
```

It NEVER parsed the actual parent-child relationships.

### Problem 5: Balance Type Information Ignored

The taxonomy schema contains:
```xml
<xs:element name="Assets"
    xbrli:balance="debit"
    xbrli:periodType="instant"/>
```

This was never extracted or used.

---

## 4. Solution: 4-Layer Categorization Strategy

### Layer 1: Word-Boundary-Aware Keyword Matching

**Before:**
```python
if any(kw in tag_lower for kw in income_keywords):
    return 'Income Statement'
```

**After:**
```python
def split_camel_case(tag_name: str) -> set:
    """Split camelCase tag name into individual words"""
    words = re.findall(r'[A-Z][a-z]*|[a-z]+', tag_name)
    return {w.lower() for w in words}

# "AvailableForSaleSecuritiesCurrent"
#     -> {'available', 'for', 'sale', 'securities', 'current'}
# Now "sales" does NOT match because "sale" != "sales"
```

Also reordered checks - Balance Sheet indicators checked FIRST:
```python
balance_position_words = {'current', 'noncurrent', 'net', 'gross'}
balance_type_words = {'assets', 'asset', 'liabilities', 'liability', ...}

# If has position word AND balance sheet type word -> Balance Sheet
if (words & balance_position_words) and (words & balance_type_words):
    return 'Balance Sheet'  # Checked FIRST now
```

### Layer 2: Complete Taxonomy Map with Calculation Hierarchy

Parse all linkbase files:
```python
taxonomy_data = {
    'tag_to_category': {},      # Direct tag -> statement mapping
    'parent_child': {},          # Calculation hierarchy for roll-ups
    'balance_types': {},         # Balance type info for Layer 4
}
```

Roll-up function:
```python
def find_parent_category(tag_name: str, taxonomy_data: dict, max_depth: int = 5) -> str:
    """Walk up the calculation hierarchy to find a categorized parent."""
    current = clean_tag
    for _ in range(max_depth):
        parent = parent_child.get(current)
        if not parent:
            break
        parent_full = f'us-gaap:{parent}'
        if parent_full in tag_to_category:
            return tag_to_category[parent_full]
        current = parent
    return None
```

### Layer 3: Deprecated Tag Mappings

Static dictionary for known problem tags:
```python
DEPRECATED_TAG_MAPPINGS = {
    # Balance Sheet items incorrectly matched by keywords
    'AvailableForSaleSecurities': 'Balance Sheet',
    'AvailableForSaleSecuritiesCurrent': 'Balance Sheet',
    'DeferredTaxAssetsNetCurrent': 'Balance Sheet',
    'DeferredTaxAssetsNetNoncurrent': 'Balance Sheet',

    # Cash Flow items
    'EffectOfExchangeRateOnCashAndCashEquivalents': 'Cash Flow Statement',
    'CashAndCashEquivalentsPeriodIncreaseDecrease': 'Cash Flow Statement',

    # Income Statement items
    'ImpairmentOfInvestments': 'Income Statement',
    'LeaseAndRentalExpense': 'Income Statement',
    ...
}
```

### Layer 4: Balance Type Discriminator

Extract from taxonomy schema and use as override:
```python
def categorize_with_balance_type(tag_name, keyword_result, balance_types):
    info = balance_types.get(clean_tag, {})
    balance = info.get('balance')      # 'debit' or 'credit'
    period_type = info.get('periodType')  # 'instant' or 'duration'

    # Decision matrix:
    # debit + instant = Balance Sheet (Asset)
    # credit + instant = Balance Sheet (Liability/Equity)
    # debit + duration = Income Statement (Expense/Loss)
    # credit + duration = Income Statement (Revenue/Gain)

    if period_type == 'instant':
        if keyword_result != 'Balance Sheet':
            return ('Balance Sheet', 'high', 'periodType=instant overrides')

    elif period_type == 'duration':
        if keyword_result == 'Balance Sheet':
            return ('Income Statement', 'high', 'periodType=duration overrides')
```

### Categorization Priority Order

```python
def categorize_tag(tag_name: str, taxonomy_data: dict) -> tuple:
    # 1. Layer 3: Check deprecated mappings first (highest priority)
    if clean_tag in DEPRECATED_TAG_MAPPINGS:
        return (DEPRECATED_TAG_MAPPINGS[clean_tag], 'high', 'deprecated_mapping')

    # 2. Layer 2a: Check taxonomy direct match
    if full_tag in taxonomy_data['tag_to_category']:
        return (category, 'high', 'taxonomy_direct')

    # 3. Layer 2b: Try parent roll-up
    parent_category = find_parent_category(full_tag, taxonomy_data)
    if parent_category:
        return (parent_category, 'medium-high', 'taxonomy_rollup')

    # 4. Layer 1: Keyword-based categorization
    keyword_result = categorize_by_keywords(clean_tag)

    # 5. Layer 4: Validate/override with balance type
    final_category, confidence, override = categorize_with_balance_type(...)

    return (final_category, confidence, method)
```

---

## 5. Layer 4 Deep Dive: Balance Type Discriminator

### The Accounting Foundation

Every XBRL monetary concept has two key attributes:

| Attribute | Values | Meaning |
|-----------|--------|---------|
| **balance** | `debit` or `credit` | Natural balance in double-entry accounting |
| **periodType** | `instant` or `duration` | Point-in-time vs over-time measurement |

### The Double-Entry Rule

```
DEBIT BALANCE                    CREDIT BALANCE
-------------                    --------------
* Assets                         * Liabilities
* Expenses                       * Equity
* Losses                         * Revenue/Income
* Dividends                      * Gains
```

### The Decision Matrix

| Balance | PeriodType | Likely Statement |
|---------|------------|------------------|
| debit | instant | **Balance Sheet** (Asset) |
| credit | instant | **Balance Sheet** (Liability/Equity) |
| debit | duration | **Income Statement** (Expense/Loss) |
| credit | duration | **Income Statement** (Revenue/Gain) |
| (none) | duration | **Cash Flow** (typically) |

### How This Solves Problem Tags

**Example: `DeferredTaxAssetsNetCurrent`**
- Keyword result: Income Statement (matched "tax")
- Balance type: `debit`
- Period type: `instant`
- **Debit + Instant = Asset = Balance Sheet** (OVERRIDE!)

**Example: `IncomeTaxExpenseBenefit`**
- Keyword result: Income Statement (matched "tax" and "income")
- Balance type: `debit`
- Period type: `duration`
- **Debit + Duration = Expense = Income Statement** (CORRECT)

Both contain "tax", but periodType discriminates:
- `instant` = point in time = Balance Sheet
- `duration` = over time = Income Statement

### Taxonomy Statistics

From the 2024 US-GAAP taxonomy:
- Elements with debit balance: 4,030
- Elements with credit balance: 3,509
- Elements with no balance (non-monetary): 9,849

---

## 6. Implementation Details

### New Function: `split_camel_case()`

```python
def split_camel_case(tag_name: str) -> set:
    """Split camelCase tag name into individual words"""
    words = re.findall(r'[A-Z][a-z]*|[a-z]+', tag_name)
    return {w.lower() for w in words}
```

### Enhanced: `download_and_parse_taxonomy()`

Now parses:
1. Presentation linkbases for direct categorization
2. Calculation linkbases for parent-child hierarchy
3. Schema files for balance type extraction

Returns:
```python
{
    'tag_to_category': {...},    # 10,723 tags categorized
    'parent_child': {...},        # 4,438 relationships
    'balance_types': {...},       # 17,388 balance types
}
```

### New Function: `categorize_with_balance_type()`

```python
def categorize_with_balance_type(tag_name: str, keyword_result: str, balance_types: dict) -> tuple:
    """
    Use balance type and periodType to validate/override keyword categorization.

    Returns:
        tuple: (final_category, confidence_level, override_reason)
    """
```

### New Function: `find_parent_category()`

```python
def find_parent_category(tag_name: str, taxonomy_data: dict, max_depth: int = 5) -> str:
    """
    Walk up the calculation hierarchy to find a categorized parent.
    This handles extension tags that roll up to standard GAAP parents.
    """
```

---

## 7. Data Provenance Feature

### The Problem: Comparative Filing Dates

When requesting FY2024 data, we saw two different filing dates in the output:
- 2024-07-30: 45 items
- 2025-07-30: 201 items (same day, different year!)

### Investigation Results

```python
Tag: AccountsReceivableNetCurrent

All FY2024 10-K entries from SEC API:
  Filed: 2024-07-30  End: 2023-06-30  FY: 2024  Val: $48,688M  (prior year comparative)
  Filed: 2024-07-30  End: 2024-06-30  FY: 2024  Val: $56,924M  (current year)
  Filed: 2025-07-30  End: 2024-06-30  FY: 2025  Val: $56,924M  (now prior year comparative)
```

The FY2025 10-K includes FY2024 data as comparative figures!

### Why This is Correct Behavior

1. **Accuracy**: If a company restated values, the latest filing has corrections
2. **Audit Standard**: This matches how Bloomberg, FactSet, CapIQ operate
3. **Transparency**: Need to show WHERE data came from

### Hybrid Solution Implemented

#### Part 1: New Columns in Main Tabs

| Column | Description |
|--------|-------------|
| Source | `Original (FY2024 10-K)` or `Comparative (FY2025 10-K)` |
| Restated | `Yes` (red) or `No` |
| Original Value | Only if restated |
| Delta | Change amount and percentage |

#### Part 2: Data Provenance Tab

```
Data Provenance Report

Target Fiscal Year: 2024
Form Type: 10-K

Filing Sources:
  2024-07-30: 45 items
  2025-07-30: 201 items

SEC Accession Numbers (for audit trail):
  0000950170-24-087843
  0000950170-25-100235

Restatements Detected:
  No restatements detected - all values match between original and subsequent filings.
```

#### Part 3: Summary Tab Updates

```
Data Provenance Summary:
  Items from original FY2024 filing: 45
  Items from comparative filings: 201
  Restatements detected: 0
```

### Restatement Detection Logic

A restatement is detected when:
1. Multiple filings report data for the SAME period (same `end` date)
2. The reported values DIFFER between filings

**Bug Fix Applied:**

Original code compared entries with different end dates (FY2023 vs FY2024), incorrectly flagging 189 "restatements".

Fixed code groups by end date first:
```python
# Group by end date to properly detect restatements
by_end_date = defaultdict(list)
for v in year_values:
    end_date = v.get('end', '')
    by_end_date[end_date].append(v)

# Use the latest end date (typically the fiscal year end)
latest_end_date = max(by_end_date.keys())
entries_for_period = by_end_date[latest_end_date]

# Only compare entries with the SAME end date
if len(sorted_values) > 1 and original_value != latest_value:
    is_restated = True  # TRUE restatement
```

---

## 8. Test Results

### Microsoft FY2024 10-K Export

```
Categorization Statistics:
  Taxonomy direct matches: 406
  Taxonomy roll-ups: 0
  Deprecated mappings: 37
  Keyword matches: 20
  Balance type overrides: 1
  Skipped deprecated: 79
  Skipped (no 2024 data): 209

Confidence breakdown:
  high: 463
  medium: 1

Data Provenance:
  Items from original FY2024 filing: 45
  Items from comparative filings: 201
  Restatements detected: 0

Total items exported: 246
```

### Comparison: Original vs New Script

| Metric | Original Script | New Script |
|--------|-----------------|------------|
| Taxonomy direct matches | ~266 (49%) | **406 (75%)** |
| Deprecated mappings | 0 | **37** |
| Keyword fallbacks | ~267 (49%) | **20 (4%)** |
| Balance type overrides | 0 | **1** |
| High confidence items | N/A | **463 (99.8%)** |
| Medium confidence items | N/A | **1 (0.2%)** |

### Excel Output Verification

```
Sheets in workbook:
  - Summary
  - Income Statement
  - Balance Sheet
  - Cash Flow Statement
  - Statement of Equity
  - Data Provenance

Balance Sheet Headers:
  1. XBRL Tag
  2. Label
  3. Value
  4. Unit
  5. Filing Date
  6. Source
  7. Restated
  8. Original Value
  9. Delta
  10. Confidence
  11. Method

Sample data:
  us-gaap:AccountsPayableCurrent | Source: Comparative (FY2025 10-K) | Restated: No
  us-gaap:AccountsReceivableNetCurrent | Source: Comparative (FY2025 10-K) | Restated: No
```

---

## 9. Files Created

### Main Script
- **`financial_export_20260203.py`** - Improved script with all 4 layers + provenance tracking

### Documentation
- **`financial_export_changes_20260203.txt`** - Comprehensive change documentation
- **`conversation_summary_20260203.md`** - This file

### Analysis Scripts (can be deleted)
- **`verify_taxonomy.py`** - Verifies XBRL taxonomy structure claims
- **`analyze_categorization.py`** - Analyzes miscategorization root causes
- **`explain_balance_type.py`** - Demonstrates balance type discrimination
- **`explain_dates.py`** - Explains comparative filing date behavior

---

## Appendix A: Key Code Snippets

### A.1: Improved Keyword Categorization

```python
def categorize_by_keywords(tag_name: str) -> str:
    # Split camelCase into individual words
    words = split_camel_case(tag_name)
    tag_lower = tag_name.lower()

    # Disclosure/Note items - skip these first
    disclosure_keywords = {'disclosure', 'textblock', 'policy', 'table', 'abstract',
                           'lineitem', 'domain', 'member', 'axis'}
    if words & disclosure_keywords:
        return 'Disclosure/Notes'

    # IMPORTANT: Check Balance Sheet FIRST for items with position words
    balance_position_words = {'current', 'noncurrent', 'net', 'gross'}
    balance_type_words = {'assets', 'asset', 'liabilities', 'liability',
                          'receivable', 'receivables', 'payable', 'payables',
                          'equity', 'deficit', 'stock', 'shares'}

    if (words & balance_position_words) and (words & balance_type_words):
        return 'Balance Sheet'

    # ... rest of categorization logic
```

### A.2: Balance Type Override

```python
def categorize_with_balance_type(tag_name: str, keyword_result: str, balance_types: dict) -> tuple:
    info = balance_types.get(clean_tag, {})
    balance = info.get('balance')
    period_type = info.get('periodType')

    if not period_type:
        return (keyword_result, 'medium', None)

    if period_type == 'instant':
        if keyword_result != 'Balance Sheet' and keyword_result not in ['Disclosure/Notes', 'Other']:
            return ('Balance Sheet', 'high', f'periodType=instant overrides {keyword_result}')
        return (keyword_result, 'high', None)

    elif period_type == 'duration':
        if keyword_result == 'Balance Sheet':
            if balance in ['debit', 'credit']:
                return ('Income Statement', 'high', f'periodType=duration overrides Balance Sheet')
            else:
                return ('Cash Flow Statement', 'medium', f'periodType=duration + no balance suggests Cash Flow')
        return (keyword_result, 'high', None)

    return (keyword_result, 'medium', None)
```

### A.3: Provenance Tracking

```python
# Determine source type based on which filing the data came from
if latest_fy > target_year:
    is_comparative = True
    source = f"Comparative (FY{latest_fy} {form_type})"
elif len(sorted_values) > 1 and latest_filed != original_filed:
    is_comparative = True
    source = f"Revised (filed {latest_filed})"
else:
    is_comparative = False
    source = f"Original (FY{target_year} {form_type})"

# Check for restatement (value changed between filings FOR THE SAME PERIOD)
if len(sorted_values) > 1 and original_value != latest_value:
    is_restated = True
    restatement_delta = latest_value - original_value
    restatement_pct = (restatement_delta / original_value) * 100
```

---

## Appendix B: Verification Scripts Output

### B.1: Taxonomy Structure Verification

```
=== Parsing Balance Sheet Calculation File ===
Found 1 calculation links
Role: http://fasb.org/us-gaap/role/statement/StatementOfFinancialPositionClassifiedFirstAlternative
Found 257 calculation arcs (parent-child relationships)

Examples:
  LiabilitiesAndStockholdersEquity -> Liabilities (weight=1.0)
  LiabilitiesAndStockholdersEquity -> CommitmentsAndContingencies (weight=1.0)
  PartnersCapital -> GeneralPartnersCapitalAccount (weight=1.0)
  GeneralPartnersCapitalAccount -> GeneralPartnersContributedCapital (weight=1.0)
```

### B.2: SEC API Structure Verification

```
Company: MICROSOFT CORPORATION
CIK: 789019
Total US-GAAP concepts reported: 543

Example: Assets
  Label: Assets
  Description: Sum of the carrying amounts as of the balance sheet date...
  Unit: USD, Values count: 138
  Sample value: {'end': '2024-06-30', 'val': 512163000000, ...}
```

### B.3: Keyword Match Analysis

```
Tag: availableforsalesecuritiescurrent

Checking income keywords:
  MATCH: "sales" found in "availableforsalesecuritiescurrent"
    Position 12: ...for[sales]ecuri...
```

---

## Appendix C: Recommendations for Future Work

1. **Build Exception Table** - Company-specific overrides for known problem filers
2. **Version Taxonomy Mappings** - FASB taxonomy changes yearly
3. **Add Manual Review Queue** - Flag medium-confidence items
4. **Implement Dimensional Analysis** - XBRL dimensions (segment, geography)
5. **Add Unit Testing** - Test cases for known problem tags
6. **Option for Original-Only Data** - `--original-only` flag
7. **Restatement Alerts** - Visual alerts for significant restatements
8. **Historical Provenance** - Track patterns across multiple years

---

*End of Conversation Summary*
