#!/usr/bin/env python3
"""
Explain XBRL Balance Types and how they can discriminate statement types
"""
import requests
import zipfile
import io
import xml.etree.ElementTree as ET
from collections import defaultdict

HEADERS = {'User-Agent': 'SEC-Test test@example.com'}

def explain_balance_types():
    """Download taxonomy and extract balance type information"""

    print("=" * 70)
    print("XBRL BALANCE TYPES EXPLAINED")
    print("=" * 70)

    print("""
BACKGROUND: Double-Entry Accounting
-----------------------------------
In accounting, every transaction affects at least two accounts.
The fundamental equation is: Assets = Liabilities + Equity

XBRL encodes this via the 'balance' attribute on monetary concepts:

  DEBIT BALANCE                    CREDIT BALANCE
  -------------                    --------------
  * Assets                         * Liabilities
  * Expenses                       * Equity
  * Losses                         * Revenue/Income
  * Dividends                      * Gains
  * Contra-Liabilities             * Contra-Assets

WHY THIS MATTERS FOR CATEGORIZATION
-----------------------------------
The balance type tells you the NATURE of the item:

  Tag: "DeferredTaxAssetsNetCurrent"
  Balance: DEBIT -> This is an ASSET -> Balance Sheet

  Tag: "IncomeTaxExpenseBenefit"
  Balance: DEBIT -> This is an EXPENSE -> Income Statement

  Tag: "Revenues"
  Balance: CREDIT -> This is REVENUE -> Income Statement

Even if the keyword "tax" appears in both, the balance type discriminates!
""")

    # Download taxonomy to show actual balance types
    print("\nDownloading FASB 2024 taxonomy schema files...")
    url = "https://xbrl.fasb.org/us-gaap/2024/us-gaap-2024.zip"
    response = requests.get(url, timeout=120)
    zip_file = zipfile.ZipFile(io.BytesIO(response.content))

    # Find the main schema file (contains element definitions with balance types)
    schema_files = [f for f in zip_file.namelist() if f.endswith('.xsd') and 'us-gaap-2024' in f]

    # The main elements are defined in us-gaap-2024.xsd
    main_schema = [f for f in schema_files if f.endswith('us-gaap-2024.xsd')]

    if main_schema:
        print(f"\nParsing schema: {main_schema[0]}")
        xml_content = zip_file.read(main_schema[0])
        root = ET.fromstring(xml_content)

        # XBRL uses xbrli namespace for balance attribute
        ns = {
            'xs': 'http://www.w3.org/2001/XMLSchema',
            'xbrli': 'http://www.xbrl.org/2003/instance'
        }

        # Find elements with balance attributes
        elements = root.findall('.//xs:element', ns)

        balance_examples = {
            'debit': [],
            'credit': []
        }

        # Specific tags we're interested in
        target_tags = [
            'Assets', 'Liabilities', 'Revenues', 'CostOfGoodsSold',
            'NetIncomeLoss', 'DeferredTaxAssetsNet', 'DeferredTaxLiabilitiesNet',
            'CashAndCashEquivalentsAtCarryingValue', 'AccountsPayableCurrent',
            'RetainedEarningsAccumulatedDeficit', 'SellingGeneralAndAdministrativeExpense',
            'InterestExpense', 'IncomeTaxExpenseBenefit', 'AvailableForSaleSecuritiesDebtSecurities'
        ]

        found_balances = {}

        for elem in elements:
            name = elem.get('name', '')
            balance = elem.get('{http://www.xbrl.org/2003/instance}balance')
            period_type = elem.get('{http://www.xbrl.org/2003/instance}periodType')

            if name in target_tags and balance:
                found_balances[name] = {
                    'balance': balance,
                    'periodType': period_type
                }

            # Collect examples
            if balance and len(balance_examples[balance]) < 10:
                balance_examples[balance].append((name, period_type))

        print("\n" + "=" * 70)
        print("ACTUAL BALANCE TYPES FROM US-GAAP TAXONOMY")
        print("=" * 70)

        print("\nDEBIT BALANCE EXAMPLES (Assets, Expenses, Losses):")
        print("-" * 50)
        for name, period in balance_examples['debit'][:10]:
            print(f"  {name}")
            print(f"    periodType: {period}")

        print("\nCREDIT BALANCE EXAMPLES (Liabilities, Equity, Revenue):")
        print("-" * 50)
        for name, period in balance_examples['credit'][:10]:
            print(f"  {name}")
            print(f"    periodType: {period}")

        print("\n" + "=" * 70)
        print("HOW TO USE BALANCE + PERIOD TYPE FOR CATEGORIZATION")
        print("=" * 70)

        print("""
DECISION MATRIX:
----------------
+-------------+-------------+----------------------------------+
| Balance     | PeriodType  | Likely Statement                 |
+-------------+-------------+----------------------------------+
| debit       | instant     | BALANCE SHEET (Asset)            |
| credit      | instant     | BALANCE SHEET (Liability/Equity) |
| debit       | duration    | INCOME STMT (Expense/Loss)       |
| credit      | duration    | INCOME STMT (Revenue/Gain)       |
| (none)      | duration    | CASH FLOW (typically)            |
+-------------+-------------+----------------------------------+

EXAMPLES WITH PROBLEM TAGS:
---------------------------""")

        # Show how this helps with problem tags
        problem_analysis = [
            ('DeferredTaxAssetsNetCurrent', 'debit', 'instant',
             'Balance Sheet', 'DEBIT + INSTANT = Asset on Balance Sheet'),
            ('IncomeTaxExpenseBenefit', 'debit', 'duration',
             'Income Statement', 'DEBIT + DURATION = Expense on Income Statement'),
            ('Revenues', 'credit', 'duration',
             'Income Statement', 'CREDIT + DURATION = Revenue on Income Statement'),
            ('RetainedEarningsAccumulatedDeficit', 'credit', 'instant',
             'Balance Sheet', 'CREDIT + INSTANT = Equity on Balance Sheet'),
        ]

        for tag, balance, period, statement, explanation in problem_analysis:
            print(f"\n  Tag: {tag}")
            print(f"  Balance: {balance}, PeriodType: {period}")
            print(f"  -> {statement}")
            print(f"  Why: {explanation}")

        print("\n" + "=" * 70)
        print("IMPLEMENTATION APPROACH")
        print("=" * 70)

        print("""
1. EXTRACT BALANCE TYPES FROM TAXONOMY SCHEMA:

   Parse us-gaap-2024.xsd to build a map:

   balance_type_map = {
       'Assets': {'balance': 'debit', 'periodType': 'instant'},
       'Revenues': {'balance': 'credit', 'periodType': 'duration'},
       ...
   }

2. USE AS TIEBREAKER IN CATEGORIZATION:

   def categorize_with_balance_type(tag, balance_info, keyword_result):
       balance = balance_info.get('balance')
       period = balance_info.get('periodType')

       # If keyword says "Income Statement" but balance is instant...
       if keyword_result == 'Income Statement' and period == 'instant':
           # It's probably a Balance Sheet item!
           return 'Balance Sheet'

       # If keyword says "Balance Sheet" but period is duration...
       if keyword_result == 'Balance Sheet' and period == 'duration':
           # Might be Income Statement or Cash Flow
           if balance in ['debit', 'credit']:
               return 'Income Statement'
           return 'Cash Flow Statement'

       return keyword_result

3. CONFIDENCE SCORING:

   Assign confidence based on how many signals align:

   - Taxonomy match + balance type agrees = HIGH confidence
   - Keyword match + balance type agrees = MEDIUM confidence
   - Keyword match + balance type disagrees = LOW confidence (flag for review)
""")

        # Count elements with balance types
        debit_count = sum(1 for e in elements if e.get('{http://www.xbrl.org/2003/instance}balance') == 'debit')
        credit_count = sum(1 for e in elements if e.get('{http://www.xbrl.org/2003/instance}balance') == 'credit')
        no_balance = sum(1 for e in elements if e.get('{http://www.xbrl.org/2003/instance}balance') is None)

        print(f"\nTAXONOMY STATISTICS:")
        print(f"  Elements with debit balance: {debit_count}")
        print(f"  Elements with credit balance: {credit_count}")
        print(f"  Elements with no balance (non-monetary): {no_balance}")

    else:
        print("Could not find main schema file")

if __name__ == "__main__":
    explain_balance_types()
