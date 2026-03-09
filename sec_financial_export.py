#!/usr/bin/env python3
"""
SEC Financial Data Export Tool

This script fetches financial data from the SEC for a given company ticker and year,
categorizes the data by financial statement type (Income Statement, Balance Sheet,
Cash Flow Statement), and exports the results to an Excel spreadsheet.

Usage:
    python sec_financial_export.py

    Then enter the ticker symbol (e.g., MSFT) and year (e.g., 2024) when prompted.
"""

import sys
import requests
import json
from collections import defaultdict
import zipfile
import io
import xml.etree.ElementTree as ET

# Excel export
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("Error: openpyxl is required. Install with: pip install openpyxl")
    sys.exit(1)

# SEC requires a User-Agent header
HEADERS = {
    'User-Agent': 'SEC-Financial-Export support@example.com',
}

INCLUDE_DEPRECATED = False


def get_cik_from_ticker(ticker: str) -> tuple[str, str]:
    """
    Look up the CIK number from a ticker symbol using SEC's company_tickers.json

    Returns:
        tuple: (CIK padded to 10 digits, company name) or (None, None) if not found
    """
    print(f"Looking up CIK for ticker: {ticker.upper()}...")

    url = "https://www.sec.gov/files/company_tickers.json"

    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        tickers_data = response.json()

        ticker_upper = ticker.upper()

        for entry in tickers_data.values():
            if entry.get('ticker', '').upper() == ticker_upper:
                cik = str(entry.get('cik_str', '')).zfill(10)
                company_name = entry.get('title', 'Unknown Company')
                print(f"Found: {company_name} (CIK: {cik})")
                return cik, company_name

        print(f"Ticker '{ticker}' not found in SEC database.")
        return None, None

    except Exception as e:
        print(f"Error looking up ticker: {e}")
        return None, None


def download_company_facts(cik: str) -> dict:
    """Download company facts from SEC EDGAR API"""
    print(f"Downloading company facts from SEC...")

    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

    try:
        response = requests.get(url, headers=HEADERS, timeout=60)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error downloading company facts: {e}")
        return None


def download_and_parse_taxonomy(year: int) -> dict:
    """Download FASB taxonomy and parse presentation and calculation files"""
    print(f"\nDownloading FASB {year} taxonomy...")

    taxonomy_url = f"https://xbrl.fasb.org/us-gaap/{year}/us-gaap-{year}.zip"

    try:
        response = requests.get(taxonomy_url, timeout=120)
        response.raise_for_status()
        print("Taxonomy downloaded, extracting...")

        zip_file = zipfile.ZipFile(io.BytesIO(response.content))

        # Get linkbase files
        all_files = zip_file.namelist()
        linkbase_files = [f for f in all_files if (f.endswith(f'-pre-{year}.xml') or f.endswith(f'-cal-{year}.xml'))]

        print(f"Found {len(linkbase_files)} linkbase files, parsing...")

        def get_category_from_filepath(filepath):
            lower_path = filepath.lower()

            # Statement files
            if '/stm/' in lower_path:
                if any(x in lower_path for x in ['soi', 'soc']):
                    return 'Income Statement'
                elif 'sfp' in lower_path:
                    return 'Balance Sheet'
                elif 'scf' in lower_path:
                    return 'Cash Flow Statement'
                elif any(x in lower_path for x in ['sheci', 'spc']):
                    return 'Statement of Equity'

            # Disclosure files
            if '/dis/' in lower_path:
                if any(x in lower_path for x in [
                    'revenue', 'income', 'inctax', 'eps', 'disops', 'earnings',
                    'operating', 'expense', 'cost', 'margin', 'ebit', 'tax',
                    '-oi-', 'otherexp', '-sr-', 'compensation',
                    'crcrb', 'crcsbp', 'ctbl', 'rcc',
                ]):
                    return 'Income Statement'

                if any(x in lower_path for x in [
                    'asset', 'liability', 'debt', 'equity', 'inv-', 'inventory',
                    'ppe', 'goodwill', 'intangible', 'leas', 'investment',
                    'receivable', 'payable', 'securities', 'derivative',
                    'loan', 'deposit', 'property', '-re-', 'cash', 'othliab',
                    'ides', 'bsoff', 'diha', 'fifvd', 'cc-',
                ]):
                    return 'Balance Sheet'

                if any(x in lower_path for x in ['scf', 'cashflow']):
                    return 'Cash Flow Statement'

                if any(x in lower_path for x in ['-se-', 'sharehold', 'stockholder']):
                    return 'Statement of Equity'

            return None

        tag_map = {}

        for i, file_path in enumerate(linkbase_files):
            try:
                if (i + 1) % 50 == 0:
                    print(f"  Processed {i + 1}/{len(linkbase_files)} files...")

                category = get_category_from_filepath(file_path)

                xml_content = zip_file.read(file_path)
                root = ET.fromstring(xml_content)

                locators = root.findall('.//{http://www.xbrl.org/2003/linkbase}loc')

                for loc in locators:
                    href = loc.get('{http://www.w3.org/1999/xlink}href', '')

                    if '#us-gaap_' in href:
                        tag_name = href.split('#us-gaap_')[1]
                        full_tag = f'us-gaap:{tag_name}'

                        if full_tag not in tag_map and category:
                            tag_map[full_tag] = category
            except Exception:
                pass

        print(f"Taxonomy parsing complete. {len(tag_map)} tags categorized.")
        return tag_map

    except Exception as e:
        print(f"Error downloading taxonomy: {e}")
        print("Falling back to keyword-based categorization only.")
        return {}


def categorize_by_keywords(tag_name: str) -> str:
    """Fallback categorization using keywords"""
    tag_lower = tag_name.lower()

    # Disclosure/Note items - skip these
    disclosure_keywords = ['disclosure', 'textblock', 'policy', 'table', 'abstract',
                          'lineitem', 'domain', 'member', 'axis']

    if any(kw in tag_lower for kw in disclosure_keywords):
        return 'Disclosure/Notes'

    # Cash Flow Statement
    cashflow_keywords = [
        'cashflow', 'cashprovided', 'cashused', 'operatingactivities',
        'investingactivities', 'financingactivities', 'depreciation',
        'payment', 'proceeds', 'disposal', 'issuance', 'repayment',
        'increasedecrease', 'sharebased', 'amortization', 'capitalexpenditure'
    ]

    if any(kw in tag_lower for kw in cashflow_keywords):
        return 'Cash Flow Statement'

    # Income Statement
    income_keywords = [
        'revenue', 'income', 'expense', 'cost', 'sales', 'earnings', 'profit', 'loss',
        'operating', 'gross', 'interest', 'tax', 'margin', 'gain', 'ebit', 'ebitda',
        'dividend', 'comprehensive'
    ]

    if any(kw in tag_lower for kw in income_keywords):
        return 'Income Statement'

    # Balance Sheet
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


def process_company_data(company_data: dict, taxonomy_map: dict, target_year: int, form_type: str = '10-K') -> dict:
    """Process company facts and categorize by statement type"""
    print(f"\nProcessing financial data for year {target_year} ({form_type} filings)...")

    categorized = defaultdict(list)
    stats = {
        'total_tags': 0,
        'taxonomy_hits': 0,
        'keyword_hits': 0,
        'skipped_deprecated': 0,
        'skipped_no_year_data': 0
    }

    if 'facts' not in company_data or 'us-gaap' not in company_data['facts']:
        print("No US GAAP facts found in company data.")
        return categorized

    us_gaap_facts = company_data['facts']['us-gaap']
    stats['total_tags'] = len(us_gaap_facts)
    print(f"Found {stats['total_tags']} total US GAAP tags")

    for tag_name, tag_data in us_gaap_facts.items():
        full_tag = f"us-gaap:{tag_name}"
        label = tag_data.get('label', '') or tag_name

        # Skip deprecated tags
        if not INCLUDE_DEPRECATED and 'Deprecated' in label:
            stats['skipped_deprecated'] += 1
            continue

        # Categorize: taxonomy first, then keywords
        if full_tag in taxonomy_map:
            category = taxonomy_map[full_tag]
            stats['taxonomy_hits'] += 1
        else:
            category = categorize_by_keywords(tag_name)
            if category not in ['Other', 'Disclosure/Notes']:
                stats['keyword_hits'] += 1

        # Skip non-statement categories
        if category in ['Disclosure/Notes', 'Other', 'Unknown']:
            continue

        # Filter by target year and get value
        latest_value = None
        unit_type = None
        filing_date = None

        if 'units' in tag_data:
            for unit, values in tag_data['units'].items():
                year_values = [v for v in values
                              if (v.get('end', '').startswith(str(target_year)) or
                                  v.get('fy', 0) == target_year) and
                                 v.get('form') == form_type]

                if year_values:
                    sorted_values = sorted(year_values, key=lambda x: x.get('filed', ''), reverse=True)
                    if sorted_values:
                        latest_value = sorted_values[0].get('val', None)
                        unit_type = unit
                        filing_date = sorted_values[0].get('filed', 'Unknown')
                        break

        if latest_value is not None:
            categorized[category].append({
                'tag': full_tag,
                'label': label,
                'value': latest_value,
                'unit': unit_type,
                'filed': filing_date
            })
        else:
            stats['skipped_no_year_data'] += 1

    print(f"Taxonomy categorizations: {stats['taxonomy_hits']}")
    print(f"Keyword categorizations: {stats['keyword_hits']}")
    print(f"Skipped deprecated: {stats['skipped_deprecated']}")
    print(f"Skipped (no {target_year} data): {stats['skipped_no_year_data']}")

    return categorized


def export_to_excel(categorized_data: dict, ticker: str, company_name: str, year: int, form_type: str, output_file: str):
    """Export categorized data to Excel spreadsheet"""
    print(f"\nExporting to Excel: {output_file}")

    wb = Workbook()

    # Styles
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    category_fills = {
        'Income Statement': PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid"),
        'Balance Sheet': PatternFill(start_color="DDEBF7", end_color="DDEBF7", fill_type="solid"),
        'Cash Flow Statement': PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid"),
        'Statement of Equity': PatternFill(start_color="FCE4D6", end_color="FCE4D6", fill_type="solid"),
    }

    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    # Desired order for sheets
    sheet_order = ['Income Statement', 'Balance Sheet', 'Cash Flow Statement', 'Statement of Equity']

    first_sheet = True
    for category in sheet_order:
        if category not in categorized_data or not categorized_data[category]:
            continue

        items = categorized_data[category]

        if first_sheet:
            ws = wb.active
            ws.title = category[:31]  # Excel sheet name limit
            first_sheet = False
        else:
            ws = wb.create_sheet(title=category[:31])

        # Header info
        ws['A1'] = f"{company_name} ({ticker.upper()})"
        ws['A1'].font = Font(bold=True, size=14)
        ws['A2'] = f"Fiscal Year: {year}"
        ws['A2'].font = Font(bold=True, size=12)
        ws['A3'] = f"Statement Type: {category}"
        ws['A3'].font = Font(bold=True, size=12)
        ws.merge_cells('A1:E1')
        ws.merge_cells('A2:E2')
        ws.merge_cells('A3:E3')

        # Column headers
        headers = ['XBRL Tag', 'Label', 'Value', 'Unit', 'Filing Date']
        header_row = 5

        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=header_row, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border

        # Data rows
        category_fill = category_fills.get(category, PatternFill())

        for row_idx, item in enumerate(items, header_row + 1):
            ws.cell(row=row_idx, column=1, value=item['tag']).border = thin_border
            ws.cell(row=row_idx, column=2, value=item['label']).border = thin_border

            value_cell = ws.cell(row=row_idx, column=3, value=item['value'])
            value_cell.border = thin_border
            if isinstance(item['value'], (int, float)):
                value_cell.number_format = '#,##0'

            ws.cell(row=row_idx, column=4, value=item['unit']).border = thin_border
            ws.cell(row=row_idx, column=5, value=item['filed']).border = thin_border

            # Apply category fill to entire row
            for col in range(1, 6):
                ws.cell(row=row_idx, column=col).fill = category_fill

        # Auto-adjust column widths
        column_widths = [40, 60, 20, 15, 15]
        for col, width in enumerate(column_widths, 1):
            ws.column_dimensions[get_column_letter(col)].width = width

    # Summary sheet
    ws_summary = wb.create_sheet(title="Summary", index=0)
    ws_summary['A1'] = f"SEC Financial Data Export"
    ws_summary['A1'].font = Font(bold=True, size=16)
    ws_summary['A3'] = f"Company: {company_name}"
    ws_summary['A4'] = f"Ticker: {ticker.upper()}"
    ws_summary['A5'] = f"Fiscal Year: {year}"
    ws_summary['A6'] = f"Form Type: {form_type}"
    ws_summary['A8'] = "Data by Statement Type:"
    ws_summary['A8'].font = Font(bold=True)

    row = 9
    total_items = 0
    for category in sheet_order:
        if category in categorized_data:
            count = len(categorized_data[category])
            total_items += count
            ws_summary[f'A{row}'] = f"  {category}:"
            ws_summary[f'B{row}'] = f"{count} items"
            row += 1

    ws_summary[f'A{row + 1}'] = "Total:"
    ws_summary[f'A{row + 1}'].font = Font(bold=True)
    ws_summary[f'B{row + 1}'] = f"{total_items} items"
    ws_summary[f'B{row + 1}'].font = Font(bold=True)

    ws_summary.column_dimensions['A'].width = 30
    ws_summary.column_dimensions['B'].width = 15

    # Save workbook
    wb.save(output_file)
    print(f"Excel file saved successfully!")
    print(f"Total items exported: {total_items}")


def main():
    print("=" * 60)
    print("SEC Financial Data Export Tool")
    print("=" * 60)
    print()

    # Get user input
    ticker = input("Enter ticker symbol (e.g., MSFT, AAPL): ").strip()
    if not ticker:
        print("Error: Ticker symbol is required.")
        sys.exit(1)

    year_input = input("Enter fiscal year (e.g., 2024): ").strip()
    try:
        year = int(year_input)
        if year < 2000 or year > 2030:
            raise ValueError("Year out of reasonable range")
    except ValueError:
        print("Error: Please enter a valid year (e.g., 2024).")
        sys.exit(1)

    print("\nForm types:")
    print("  1. 10-K (Annual Report)")
    print("  2. 10-Q (Quarterly Report)")
    form_choice = input("Select form type [1]: ").strip()

    if form_choice == '2':
        form_type = '10-Q'
    else:
        form_type = '10-K'

    print(f"\nSelected: {form_type}")
    print()

    # Step 1: Look up CIK from ticker
    cik, company_name = get_cik_from_ticker(ticker)
    if not cik:
        print(f"Could not find CIK for ticker '{ticker}'. Please verify the ticker symbol.")
        sys.exit(1)

    # Step 2: Download company facts
    company_data = download_company_facts(cik)
    if not company_data:
        print("Failed to download company data.")
        sys.exit(1)

    # Step 3: Download and parse taxonomy
    taxonomy_map = download_and_parse_taxonomy(year)

    # Step 4: Process and categorize data
    categorized_data = process_company_data(company_data, taxonomy_map, year, form_type)

    if not any(categorized_data.values()):
        print(f"\nNo financial data found for {ticker.upper()} in year {year} ({form_type}).")
        sys.exit(1)

    # Step 5: Export to Excel
    output_file = f"{ticker.upper()}_{year}_{form_type}_financial_data.xlsx"
    export_to_excel(categorized_data, ticker, company_name, year, form_type, output_file)

    print()
    print("=" * 60)
    print(f"Export complete: {output_file}")
    print("=" * 60)


if __name__ == "__main__":
    main()
