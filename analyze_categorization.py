#!/usr/bin/env python3
"""
Analyze why tags are being miscategorized
"""
import requests
import zipfile
import io
import xml.etree.ElementTree as ET
from collections import defaultdict

HEADERS = {'User-Agent': 'SEC-Test test@example.com'}

def analyze_miscategorization():
    """Analyze specific miscategorized tags from remaining_keyword_hits.txt"""

    # Tags that were incorrectly categorized as Income Statement but should be Balance Sheet
    problem_tags = [
        ('AvailableForSaleSecuritiesCurrent', 'Income Statement', 'Balance Sheet'),
        ('DeferredTaxAssetsNetCurrent', 'Income Statement', 'Balance Sheet'),
        ('DeferredTaxAssetsNetNoncurrent', 'Income Statement', 'Balance Sheet'),
        ('DeferredTaxLiabilitiesNoncurrent', 'Income Statement', 'Balance Sheet'),
        ('HeldToMaturitySecuritiesAmortizedCostBeforeOtherThanTemporaryImpairment', 'Income Statement', 'Balance Sheet'),
        ('EffectOfExchangeRateOnCashAndCashEquivalents', 'Balance Sheet', 'Cash Flow Statement'),
        ('ImpairmentOfInvestments', 'Balance Sheet', 'Income Statement'),
    ]

    print("=== ANALYSIS OF MISCATEGORIZED TAGS ===\n")

    # First, download taxonomy to find where these tags actually appear
    print("Downloading FASB 2024 taxonomy...")
    url = "https://xbrl.fasb.org/us-gaap/2024/us-gaap-2024.zip"
    response = requests.get(url, timeout=120)
    zip_file = zipfile.ZipFile(io.BytesIO(response.content))

    # Get all presentation and calculation files
    linkbase_files = [f for f in zip_file.namelist() if f.endswith('.xml') and ('/stm/' in f or '/dis/' in f)]

    # Map each tag to where it appears
    tag_locations = defaultdict(list)

    for file_path in linkbase_files:
        try:
            xml_content = zip_file.read(file_path)
            content_str = xml_content.decode('utf-8', errors='ignore')

            for tag, current, correct in problem_tags:
                if f'us-gaap_{tag}' in content_str or f'us-gaap:{tag}' in content_str:
                    tag_locations[tag].append(file_path)
        except:
            pass

    # Analyze each problem tag
    for tag, current_category, correct_category in problem_tags:
        print(f"\n{'='*60}")
        print(f"TAG: us-gaap:{tag}")
        print(f"Current (wrong): {current_category}")
        print(f"Should be: {correct_category}")
        print(f"\nFound in taxonomy files:")

        locations = tag_locations.get(tag, [])
        if not locations:
            print("  NOT FOUND in any linkbase file (deprecated?)")
        else:
            for loc in locations[:5]:
                # Determine category from path
                if '/stm/' in loc:
                    if 'soi' in loc or 'soc' in loc:
                        cat = "Income Statement"
                    elif 'sfp' in loc:
                        cat = "Balance Sheet"
                    elif 'scf' in loc:
                        cat = "Cash Flow"
                    elif 'sheci' in loc:
                        cat = "Statement of Equity"
                    else:
                        cat = "Statement (unknown)"
                elif '/dis/' in loc:
                    cat = "Disclosure"
                else:
                    cat = "Other"
                print(f"  {loc}")
                print(f"    -> Implies: {cat}")

    # Now analyze why keyword matching fails
    print("\n\n=== KEYWORD MATCHING ANALYSIS ===\n")

    def categorize_by_keywords(tag_name: str) -> str:
        """Current keyword categorization logic"""
        tag_lower = tag_name.lower()

        # Cash Flow Statement keywords
        cashflow_keywords = [
            'cashflow', 'cashprovided', 'cashused', 'operatingactivities',
            'investingactivities', 'financingactivities', 'depreciation',
            'payment', 'proceeds', 'disposal', 'issuance', 'repayment',
            'increasedecrease', 'sharebased', 'amortization', 'capitalexpenditure'
        ]
        if any(kw in tag_lower for kw in cashflow_keywords):
            return 'Cash Flow Statement'

        # Income Statement keywords
        income_keywords = [
            'revenue', 'income', 'expense', 'cost', 'sales', 'earnings', 'profit', 'loss',
            'operating', 'gross', 'interest', 'tax', 'margin', 'gain', 'ebit', 'ebitda',
            'dividend', 'comprehensive'
        ]
        if any(kw in tag_lower for kw in income_keywords):
            return 'Income Statement'

        # Balance Sheet keywords
        balance_keywords = [
            'asset', 'liability', 'liabilities', 'equity', 'cash', 'inventory', 'property', 'debt',
            'payable', 'receivable', 'stockholder', 'sharehold', 'capital', 'retain',
            'goodwill', 'intangible', 'investment', 'securities', 'shares', 'stock',
            'paper', 'note', 'bond', 'accumulated', 'allowance', 'deposit', 'loan',
            'land', 'building', 'equipment', 'derivative', 'leaseasset', 'leaseliability'
        ]
        if any(kw in tag_lower for kw in balance_keywords):
            return 'Balance Sheet'

        return 'Other'

    for tag, current, correct in problem_tags:
        result = categorize_by_keywords(tag)
        tag_lower = tag.lower()

        # Find which keyword matched
        matched_keywords = []
        for kw in ['tax', 'income', 'loss', 'gain', 'asset', 'securities', 'cash', 'investment', 'impairment']:
            if kw in tag_lower:
                matched_keywords.append(kw)

        print(f"{tag}:")
        print(f"  Keyword result: {result}")
        print(f"  Matched keywords: {matched_keywords}")
        print(f"  Problem: '{matched_keywords[0] if matched_keywords else 'none'}' triggers wrong category")
        print()

    # Statistics
    print("\n=== COVERAGE STATISTICS ===\n")

    # Get Microsoft's facts to calculate coverage
    cik = "0000789019"
    facts_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    response = requests.get(facts_url, headers=HEADERS, timeout=60)

    if response.status_code == 200:
        data = response.json()
        us_gaap = data['facts'].get('us-gaap', {})
        total_concepts = len(us_gaap)

        # Load taxonomy map (simplified - just check if tag exists in any stm file)
        print("Building taxonomy coverage map...")
        stm_tags = set()

        for file_path in linkbase_files:
            if '/stm/' in file_path:
                try:
                    xml_content = zip_file.read(file_path)
                    root = ET.fromstring(xml_content)
                    locs = root.findall('.//{http://www.xbrl.org/2003/linkbase}loc')
                    for loc in locs:
                        href = loc.get('{http://www.w3.org/1999/xlink}href', '')
                        if '#us-gaap_' in href:
                            tag = href.split('#us-gaap_')[1]
                            stm_tags.add(tag)
                except:
                    pass

        print(f"Total tags in statement linkbases: {len(stm_tags)}")

        # Check coverage
        taxonomy_hits = 0
        keyword_hits = 0
        other = 0

        for concept in us_gaap.keys():
            if concept in stm_tags:
                taxonomy_hits += 1
            else:
                cat = categorize_by_keywords(concept)
                if cat in ['Income Statement', 'Balance Sheet', 'Cash Flow Statement']:
                    keyword_hits += 1
                else:
                    other += 1

        total_categorized = taxonomy_hits + keyword_hits

        print(f"\nFor Microsoft (CIK {cik}):")
        print(f"  Total US-GAAP concepts: {total_concepts}")
        print(f"  Found in taxonomy statements: {taxonomy_hits} ({100*taxonomy_hits/total_concepts:.1f}%)")
        print(f"  Categorized by keywords: {keyword_hits} ({100*keyword_hits/total_concepts:.1f}%)")
        print(f"  Uncategorized (Other/Disclosure): {other} ({100*other/total_concepts:.1f}%)")
        print(f"\n  ChatGPT claim: 70-85% taxonomy coverage")
        print(f"  Actual: {100*taxonomy_hits/total_concepts:.1f}%")

if __name__ == "__main__":
    analyze_miscategorization()
