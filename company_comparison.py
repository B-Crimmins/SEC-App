#!/usr/bin/env python3
"""
Company Financial Comparison Tool

Compares financial data between two companies using EdgarTools for
XBRL normalization and standardized labels.

Usage:
    python company_comparison.py

    Then enter two ticker symbols, a year, and form type when prompted.

Requirements:
    pip install edgartools openpyxl
"""

import sys
from collections import OrderedDict

# EdgarTools for SEC data with XBRL normalization
try:
    from edgar import Company, set_identity
except ImportError:
    print("Error: edgartools is required. Install with: pip install edgartools")
    sys.exit(1)

# Excel export
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("Error: openpyxl is required. Install with: pip install openpyxl")
    sys.exit(1)

# Set identity for SEC requests (required by SEC)
set_identity("CompanyComparison support@example.com")


def get_company_financials(ticker: str, year: int, form_type: str) -> dict:
    """
    Fetch financial statements for a company using EdgarTools.

    Returns:
        dict with keys: 'income_statement', 'balance_sheet', 'cash_flow', 'company_name'
        Each statement is an OrderedDict mapping standard_concept -> (label, value)
    """
    print(f"  Fetching {ticker} {year} {form_type}...")

    try:
        company = Company(ticker)
        company_name = company.name

        # Get filings for the specified form type
        filings = company.get_filings(form=form_type)

        # Find filing for the target year
        target_filing = None
        for filing in filings:
            # Check period_of_report for the fiscal year
            if hasattr(filing, 'period_of_report') and filing.period_of_report:
                period_str = str(filing.period_of_report)
                if period_str.startswith(str(year)):
                    target_filing = filing
                    break

        if not target_filing:
            print(f"    Warning: No {form_type} found for {ticker} in year {year}")
            return None

        print(f"    Found filing: {target_filing.filing_date}, period: {target_filing.period_of_report}")

        # Get the form-specific object (TenK or TenQ)
        form_obj = target_filing.obj()

        result = {
            'company_name': company_name,
            'ticker': ticker,
            'filing_date': str(target_filing.filing_date),
            'period_end': str(target_filing.period_of_report),
            'income_statement': OrderedDict(),
            'balance_sheet': OrderedDict(),
            'cash_flow': OrderedDict(),
        }

        # Extract financial statements - financials methods need to be CALLED with ()
        if hasattr(form_obj, 'financials') and form_obj.financials:
            financials = form_obj.financials

            # Income Statement - call as method
            try:
                income = financials.income_statement()
                if income:
                    result['income_statement'] = extract_statement_data(income, year)
                    print(f"    Income Statement: {len(result['income_statement'])} items")
            except Exception as e:
                print(f"    Warning: Could not get income statement: {e}")

            # Balance Sheet - call as method
            try:
                balance = financials.balance_sheet()
                if balance:
                    result['balance_sheet'] = extract_statement_data(balance, year)
                    print(f"    Balance Sheet: {len(result['balance_sheet'])} items")
            except Exception as e:
                print(f"    Warning: Could not get balance sheet: {e}")

            # Cash Flow Statement - call as method
            try:
                cashflow = financials.cash_flow_statement()
                if cashflow:
                    result['cash_flow'] = extract_statement_data(cashflow, year)
                    print(f"    Cash Flow: {len(result['cash_flow'])} items")
            except Exception as e:
                print(f"    Warning: Could not get cash flow: {e}")

        return result

    except Exception as e:
        print(f"    Error fetching {ticker}: {e}")
        import traceback
        traceback.print_exc()
        return None


def extract_statement_data(statement, target_year: int) -> OrderedDict:
    """
    Extract label/value pairs from a financial statement object.
    Uses standard_concept for cross-company comparison when available.

    Returns:
        OrderedDict mapping concept_key -> {'label': str, 'value': float, 'concept': str}
    """
    data = OrderedDict()

    try:
        # Use DataFrame conversion - this is the primary method for edgartools
        if hasattr(statement, 'to_dataframe'):
            df = statement.to_dataframe()
            if df is not None and not df.empty:
                # Find the value column for the target year
                value_col = None
                for col in df.columns:
                    if str(target_year) in str(col):
                        value_col = col
                        break

                # If no year-specific column, try to find the first date-like column
                if value_col is None:
                    for col in df.columns:
                        # Date columns typically look like "2021-09-25"
                        if '-' in str(col) and len(str(col)) == 10:
                            value_col = col
                            break

                if value_col is None:
                    print(f"      Warning: Could not find value column for year {target_year}")
                    print(f"      Available columns: {list(df.columns)}")
                    return data

                # Extract data using standard_concept as key (for cross-company matching)
                # Fall back to label if standard_concept is not available
                for idx, row in df.iterrows():
                    label = row.get('label', '')
                    standard_concept = row.get('standard_concept', None)
                    concept = row.get('concept', '')
                    value = row.get(value_col)

                    # Skip rows without values or abstract/header rows
                    if value is None or (hasattr(value, '__float__') and str(value) == 'nan'):
                        continue
                    if row.get('abstract', False):
                        continue

                    # Use standard_concept as key if available (enables cross-company comparison)
                    # Otherwise fall back to label
                    if standard_concept and str(standard_concept) != 'None':
                        key = str(standard_concept)
                    else:
                        key = str(label) if label else str(concept)

                    if not key:
                        continue

                    # Store both the key and original label for display
                    try:
                        numeric_value = float(value)
                        data[key] = {
                            'label': str(label),
                            'value': numeric_value,
                            'concept': str(concept),
                            'standard_concept': str(standard_concept) if standard_concept else None
                        }
                    except (ValueError, TypeError):
                        continue

                return data

    except Exception as e:
        print(f"      Warning extracting statement data: {e}")
        import traceback
        traceback.print_exc()

    return data


def merge_statements(data1: OrderedDict, data2: OrderedDict) -> list:
    """
    Merge two company statements into aligned rows based on standard_concept.

    Returns:
        list of dicts with keys: 'key', 'label1', 'label2', 'value1', 'value2'
    """
    # Get all unique keys in order (preserving order from first company, then adding new from second)
    all_keys = list(data1.keys())
    for key in data2.keys():
        if key not in all_keys:
            all_keys.append(key)

    merged = []
    for key in all_keys:
        item1 = data1.get(key)
        item2 = data2.get(key)

        merged.append({
            'key': key,
            'label1': item1['label'] if item1 else None,
            'label2': item2['label'] if item2 else None,
            'value1': item1['value'] if item1 else None,
            'value2': item2['value'] if item2 else None,
            'concept1': item1.get('concept') if item1 else None,
            'concept2': item2.get('concept') if item2 else None,
        })

    return merged


def export_comparison_to_excel(
    company1_data: dict,
    company2_data: dict,
    year: int,
    form_type: str,
    output_file: str
):
    """Export side-by-side comparison to Excel"""
    print(f"\nExporting comparison to: {output_file}")

    wb = Workbook()

    # Styles
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    company1_fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
    company2_fill = PatternFill(start_color="DDEBF7", end_color="DDEBF7", fill_type="solid")
    label_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    matched_fill = PatternFill(start_color="E2F0D9", end_color="E2F0D9", fill_type="solid")

    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    ticker1 = company1_data['ticker']
    ticker2 = company2_data['ticker']
    name1 = company1_data['company_name']
    name2 = company2_data['company_name']

    statements = [
        ('Income Statement', 'income_statement'),
        ('Balance Sheet', 'balance_sheet'),
        ('Cash Flow', 'cash_flow'),
    ]

    first_sheet = True
    for sheet_name, statement_key in statements:
        data1 = company1_data.get(statement_key, OrderedDict())
        data2 = company2_data.get(statement_key, OrderedDict())

        # Skip if both are empty
        if not data1 and not data2:
            continue

        merged = merge_statements(data1, data2)

        if first_sheet:
            ws = wb.active
            ws.title = sheet_name
            first_sheet = False
        else:
            ws = wb.create_sheet(title=sheet_name)

        # Title
        ws['A1'] = f"Company Comparison - {sheet_name}"
        ws['A1'].font = Font(bold=True, size=14)
        ws['A2'] = f"Fiscal Year: {year} | Form: {form_type}"
        ws['A2'].font = Font(size=11)
        ws.merge_cells('A1:F1')
        ws.merge_cells('A2:F2')

        # Column headers
        headers = ['Standard Concept', f'{ticker1} Label', f'{ticker1} Value', f'{ticker2} Label', f'{ticker2} Value', 'Difference']
        header_row = 4

        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=header_row, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", wrap_text=True)
            cell.border = thin_border

        # Data rows
        for row_idx, item in enumerate(merged, header_row + 1):
            key = item['key']
            label1 = item['label1']
            label2 = item['label2']
            val1 = item['value1']
            val2 = item['value2']

            # Determine if this is a matched row (both companies have data)
            is_matched = val1 is not None and val2 is not None

            # Standard Concept / Key
            key_cell = ws.cell(row=row_idx, column=1, value=key)
            key_cell.border = thin_border
            key_cell.fill = matched_fill if is_matched else label_fill

            # Company 1 label
            label1_cell = ws.cell(row=row_idx, column=2, value=label1 if label1 else '-')
            label1_cell.border = thin_border
            label1_cell.fill = company1_fill

            # Company 1 value
            val1_cell = ws.cell(row=row_idx, column=3)
            val1_cell.border = thin_border
            val1_cell.fill = company1_fill
            if val1 is not None:
                val1_cell.value = val1
                if isinstance(val1, (int, float)):
                    val1_cell.number_format = '#,##0'
            else:
                val1_cell.value = '-'
                val1_cell.alignment = Alignment(horizontal="center")

            # Company 2 label
            label2_cell = ws.cell(row=row_idx, column=4, value=label2 if label2 else '-')
            label2_cell.border = thin_border
            label2_cell.fill = company2_fill

            # Company 2 value
            val2_cell = ws.cell(row=row_idx, column=5)
            val2_cell.border = thin_border
            val2_cell.fill = company2_fill
            if val2 is not None:
                val2_cell.value = val2
                if isinstance(val2, (int, float)):
                    val2_cell.number_format = '#,##0'
            else:
                val2_cell.value = '-'
                val2_cell.alignment = Alignment(horizontal="center")

            # Difference
            diff_cell = ws.cell(row=row_idx, column=6)
            diff_cell.border = thin_border
            if val1 is not None and val2 is not None:
                try:
                    diff = float(val2) - float(val1)
                    diff_cell.value = diff
                    diff_cell.number_format = '+#,##0;-#,##0'
                    # Color based on positive/negative
                    if diff > 0:
                        diff_cell.font = Font(color="006600")
                    elif diff < 0:
                        diff_cell.font = Font(color="CC0000")
                except (ValueError, TypeError):
                    diff_cell.value = '-'
            else:
                diff_cell.value = '-'
                diff_cell.alignment = Alignment(horizontal="center")

        # Column widths
        ws.column_dimensions['A'].width = 35
        ws.column_dimensions['B'].width = 35
        ws.column_dimensions['C'].width = 18
        ws.column_dimensions['D'].width = 35
        ws.column_dimensions['E'].width = 18
        ws.column_dimensions['F'].width = 18

    # Summary sheet
    ws_summary = wb.create_sheet(title="Summary", index=0)
    ws_summary['A1'] = "Company Financial Comparison"
    ws_summary['A1'].font = Font(bold=True, size=16)

    ws_summary['A3'] = "Company 1:"
    ws_summary['B3'] = f"{name1} ({ticker1})"
    ws_summary['A4'] = "Company 2:"
    ws_summary['B4'] = f"{name2} ({ticker2})"
    ws_summary['A5'] = "Fiscal Year:"
    ws_summary['B5'] = year
    ws_summary['A6'] = "Form Type:"
    ws_summary['B6'] = form_type
    ws_summary['A7'] = "Period End:"
    ws_summary['B7'] = f"{ticker1}: {company1_data.get('period_end', 'N/A')}, {ticker2}: {company2_data.get('period_end', 'N/A')}"

    ws_summary['A9'] = "Data Coverage:"
    ws_summary['A9'].font = Font(bold=True)

    row = 10
    for sheet_name, statement_key in statements:
        data1 = company1_data.get(statement_key, OrderedDict())
        data2 = company2_data.get(statement_key, OrderedDict())

        count1 = len(data1)
        count2 = len(data2)
        merged = merge_statements(data1, data2)
        common = sum(1 for item in merged if item['value1'] is not None and item['value2'] is not None)

        ws_summary[f'A{row}'] = f"  {sheet_name}:"
        ws_summary[f'B{row}'] = f"{ticker1}: {count1} items, {ticker2}: {count2} items, Matched: {common}"
        row += 1

    row += 1
    ws_summary[f'A{row}'] = "Notes:"
    ws_summary[f'A{row}'].font = Font(bold=True)
    row += 1
    ws_summary[f'A{row}'] = "- Line items are matched using EdgarTools' standard_concept (XBRL standardization)"
    row += 1
    ws_summary[f'A{row}'] = "- 'Standard Concept' column shows the normalized concept used for matching"
    row += 1
    ws_summary[f'A{row}'] = "- Green highlighted rows indicate both companies reported this concept"
    row += 1
    ws_summary[f'A{row}'] = "- 'Difference' column shows Company 2 value minus Company 1 value"
    row += 1
    ws_summary[f'A{row}'] = "- '-' indicates the line item was not reported by that company"

    ws_summary.column_dimensions['A'].width = 20
    ws_summary.column_dimensions['B'].width = 70

    # Save
    wb.save(output_file)
    print(f"Excel file saved: {output_file}")


def main():
    print("=" * 70)
    print("Company Financial Comparison Tool (EdgarTools)")
    print("=" * 70)
    print()
    print("This tool compares financial statements between two companies")
    print("using EdgarTools for XBRL normalization.")
    print()

    # Get user input
    ticker1 = input("Enter first ticker symbol (e.g., MSFT): ").strip().upper()
    if not ticker1:
        print("Error: Ticker symbol is required.")
        sys.exit(1)

    ticker2 = input("Enter second ticker symbol (e.g., AAPL): ").strip().upper()
    if not ticker2:
        print("Error: Ticker symbol is required.")
        sys.exit(1)

    if ticker1 == ticker2:
        print("Error: Please enter two different tickers.")
        sys.exit(1)

    year_input = input("Enter fiscal year (e.g., 2024): ").strip()
    try:
        year = int(year_input)
        if year < 2000 or year > 2030:
            raise ValueError("Year out of range")
    except ValueError:
        print("Error: Please enter a valid year.")
        sys.exit(1)

    print("\nForm types:")
    print("  1. 10-K (Annual Report)")
    print("  2. 10-Q (Quarterly Report)")
    form_choice = input("Select form type [1]: ").strip()

    form_type = "10-Q" if form_choice == '2' else "10-K"

    print(f"\nComparing {ticker1} vs {ticker2} for FY{year} ({form_type})")
    print("-" * 50)

    # Fetch data for both companies
    print("\nFetching financial data...")

    company1_data = get_company_financials(ticker1, year, form_type)
    company2_data = get_company_financials(ticker2, year, form_type)

    if not company1_data:
        print(f"\nError: Could not retrieve data for {ticker1}")
        sys.exit(1)

    if not company2_data:
        print(f"\nError: Could not retrieve data for {ticker2}")
        sys.exit(1)

    # Check if we got any data
    has_data1 = any([
        len(company1_data.get('income_statement', {})) > 0,
        len(company1_data.get('balance_sheet', {})) > 0,
        len(company1_data.get('cash_flow', {})) > 0
    ])
    has_data2 = any([
        len(company2_data.get('income_statement', {})) > 0,
        len(company2_data.get('balance_sheet', {})) > 0,
        len(company2_data.get('cash_flow', {})) > 0
    ])

    if not has_data1:
        print(f"\nWarning: No financial statement data extracted for {ticker1}")
    if not has_data2:
        print(f"\nWarning: No financial statement data extracted for {ticker2}")

    if not has_data1 and not has_data2:
        print("\nError: No data available for comparison.")
        sys.exit(1)

    # Export to Excel
    output_file = f"{ticker1}_vs_{ticker2}_{year}_{form_type}_comparison.xlsx"
    export_comparison_to_excel(company1_data, company2_data, year, form_type, output_file)

    print()
    print("=" * 70)
    print(f"Comparison complete: {output_file}")
    print("=" * 70)


if __name__ == "__main__":
    main()
