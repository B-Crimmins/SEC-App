#!/usr/bin/env python3
import sys
print("Script is running!", flush=True)

import requests
import json
from collections import defaultdict
import zipfile
import io
import xml.etree.ElementTree as ET

# SEC requires a User-Agent header
HEADERS = {
    'User-Agent': 'MyName myemail@example.com',  # REPLACE WITH YOUR INFO
}

# ============================================================================
# CONFIGURATION
# ============================================================================
TARGET_YEAR = 2024
INCLUDE_DEPRECATED = False

def download_and_parse_taxonomy():
    """Download FASB taxonomy and parse EVERY presentation and calculation file"""
    print("\nDownloading FASB taxonomy...", flush=True)
    
    taxonomy_url = "https://xbrl.fasb.org/us-gaap/2024/us-gaap-2024.zip"
    
    try:
        response = requests.get(taxonomy_url, timeout=120)
        response.raise_for_status()
        print("Taxonomy downloaded, extracting...", flush=True)
        
        zip_file = zipfile.ZipFile(io.BytesIO(response.content))
        
        # Get ALL linkbase files (presentation and calculation)
        all_files = zip_file.namelist()
        linkbase_files = [f for f in all_files if (f.endswith('-pre-2024.xml') or f.endswith('-cal-2024.xml'))]
        
        print(f"Found {len(linkbase_files)} total linkbase files", flush=True)
        print("Parsing ALL files (this will take a minute)...", flush=True)
        
        # Categorization based on file path and name
        def get_category_from_filepath(filepath):
            lower_path = filepath.lower()
    
            # Statement files - highest priority
            if '/stm/' in lower_path:
                if any(x in lower_path for x in ['soi', 'soc']):
                    return 'Income Statement'
                elif 'sfp' in lower_path:
                    return 'Balance Sheet'
                elif 'scf' in lower_path:
                    return 'Cash Flow'
                elif any(x in lower_path for x in ['sheci', 'spc']):
                    return 'Statement of Equity'
            
            # Disclosure files - COMPREHENSIVE categorization
            if '/dis/' in lower_path:
                # Income statement topics
                if any(x in lower_path for x in [
                    'revenue', 'income', 'inctax', 'eps', 'disops', 'earnings',
                    'operating', 'expense', 'cost', 'margin', 'ebit', 'tax',
                    '-oi-', 'otherexp', '-sr-', 'compensation',
                    'crcrb',  # Compensation/Retirement Benefits
                    'crcsbp',  # Share-based payments
                    'ctbl',  # Contract with Customer
                    'rcc',  # Revenue from Contracts
                ]):
                    return 'Income Statement'
                
                # Balance sheet topics
                if any(x in lower_path for x in [
                    'asset', 'liability', 'debt', 'equity', 'inv-', 'inventory',
                    'ppe', 'goodwill', 'intangible', 'leas', 'investment',
                    'receivable', 'payable', 'securities', 'derivative',
                    'loan', 'deposit', 'property', '-re-', 'cash', 'othliab',
                    'ides',  # Investments, Debt and Equity Securities
                    'bsoff',  # Balance Sheet Offsetting
                    'diha',  # Derivatives and Hedging
                    'fifvd',  # Fair Value Disclosures
                    'cc-',  # Commitments and Contingencies
                ]):
                    return 'Balance Sheet'
                
                # Cash flow topics
                if any(x in lower_path for x in ['scf', 'cashflow']):
                    return 'Cash Flow'
                
                # Equity topics
                if any(x in lower_path for x in ['-se-', 'sharehold', 'stockholder']):
                    return 'Statement of Equity'
            
            return None
        
        # Store all tags with their categories
        tag_map = {}
        
        # Parse EVERY linkbase file
        for i, file_path in enumerate(linkbase_files):
            try:
                # Progress indicator
                if (i + 1) % 50 == 0:
                    print(f"Processed {i + 1}/{len(linkbase_files)} files, {len(tag_map)} tags so far...", flush=True)
                
                category = get_category_from_filepath(file_path)
                
                xml_content = zip_file.read(file_path)
                root = ET.fromstring(xml_content)
                
                # Find all locators
                locators = root.findall('.//{http://www.xbrl.org/2003/linkbase}loc')
                
                for loc in locators:
                    href = loc.get('{http://www.w3.org/1999/xlink}href', '')
                    
                    # Extract tag name
                    if '#us-gaap_' in href:
                        tag_name = href.split('#us-gaap_')[1]
                        full_tag = f'us-gaap:{tag_name}'
                        
                        # Store tag with category (first appearance wins)
                        if full_tag not in tag_map and category:
                            tag_map[full_tag] = category
            
            except Exception as e:
                pass
        
        print(f"\nCompleted parsing {len(linkbase_files)} files", flush=True)
        print(f"Total tags categorized: {len(tag_map)}", flush=True)
        
        return tag_map, zip_file  # Return zip_file for reuse
        
    except Exception as e:
        print(f"Error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return {}, None

def categorize_by_keywords(tag_name):
    """Enhanced fallback categorization"""
    tag_lower = tag_name.lower()
    
    # Disclosure/Note items
    disclosure_keywords = ['disclosure', 'textblock', 'policy', 'table', 'abstract',
                          'lineitem', 'domain', 'member', 'axis']
    
    if any(kw in tag_lower for kw in disclosure_keywords):
        return 'Disclosure/Notes'
    
    # Cash Flow - check FIRST
    cashflow_keywords = [
        'cashflow', 'cashprovided', 'cashused', 'operatingactivities',
        'investingactivities', 'financingactivities', 'depreciation', 
        'payment', 'proceeds', 'disposal', 'issuance', 'repayment',
        'increasedecrease', 'sharebased', 'amortization', 'capitalexpenditure'
    ]
    
    if any(kw in tag_lower for kw in cashflow_keywords):
        return 'Cash Flow'
    
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
    
    return 'Unknown'

# ============================================================================
# MAIN EXECUTION
# ============================================================================

print(f"Configuration: Target Year = {TARGET_YEAR}, Include Deprecated = {INCLUDE_DEPRECATED}", flush=True)
print("Downloading Microsoft data from SEC...", flush=True)

url = "https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json"

try:
    response = requests.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    msft_data = response.json()
    print("Download complete!", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    sys.exit(1)

# Get taxonomy mappings
taxonomy_map, zip_file_tax = download_and_parse_taxonomy()

# Process tags
print(f"\nProcessing Microsoft tags for year {TARGET_YEAR}...", flush=True)
categorized = defaultdict(list)
skipped_deprecated = 0
skipped_no_year_data = 0
taxonomy_hits = 0
keyword_hits = 0

if 'facts' in msft_data and 'us-gaap' in msft_data['facts']:
    us_gaap_facts = msft_data['facts']['us-gaap']
    print(f"Found {len(us_gaap_facts)} total US GAAP tags", flush=True)
    
    for tag_name, tag_data in us_gaap_facts.items():
        full_tag = f"us-gaap:{tag_name}"
        label = tag_data.get('label', '') or tag_name
        
        # Skip deprecated tags if configured
        if not INCLUDE_DEPRECATED and 'Deprecated' in label:
            skipped_deprecated += 1
            continue
        
        # Try taxonomy first, then keywords
        if full_tag in taxonomy_map:
            category = taxonomy_map[full_tag]
            taxonomy_hits += 1
        else:
            category = categorize_by_keywords(tag_name)
            if category != 'Unknown':
                keyword_hits += 1
        
        # Filter by target year and get value
        latest_value = None
        filing_date = None
        
        if 'units' in tag_data:
            for unit_type, values in tag_data['units'].items():
                year_values = [v for v in values 
                              if v.get('end', '').startswith(str(TARGET_YEAR)) or 
                                 v.get('fy', 0) == TARGET_YEAR]
                
                if year_values:
                    sorted_values = sorted(year_values, key=lambda x: x.get('filed', ''), reverse=True)
                    if sorted_values:
                        val = sorted_values[0].get('val', 'N/A')
                        latest_value = f"{val} ({unit_type})"
                        filing_date = sorted_values[0].get('filed', 'Unknown')
                        break
        
        if latest_value:
            categorized[category].append({
                'tag': full_tag,
                'label': label,
                'value': latest_value,
                'filed': filing_date
            })
        else:
            skipped_no_year_data += 1

# Display results
print("\n" + "="*80, flush=True)
print(f"RESULTS FOR YEAR {TARGET_YEAR}", flush=True)
print("="*80, flush=True)
print(f"Taxonomy hits: {taxonomy_hits}", flush=True)
print(f"Keyword hits: {keyword_hits}", flush=True)
print(f"Unknown: {len(categorized.get('Unknown', []))}", flush=True)
print(f"Skipped {skipped_deprecated} deprecated tags", flush=True)
print(f"Skipped {skipped_no_year_data} tags with no {TARGET_YEAR} data", flush=True)

# ============================================================================
# DIAGNOSTIC: Analyze remaining keyword hits
# ============================================================================
if keyword_hits > 0:
    print("\n" + "="*80, flush=True)
    print("ANALYZING REMAINING KEYWORD HITS", flush=True)
    print("="*80, flush=True)

    remaining_keyword_hits = []

    # Identify keyword hits
    for tag_name, tag_data in us_gaap_facts.items():
        full_tag = f"us-gaap:{tag_name}"
        label = tag_data.get('label', '') or tag_name
        
        if not INCLUDE_DEPRECATED and 'Deprecated' in label:
            continue
        
        if full_tag not in taxonomy_map:
            category = categorize_by_keywords(tag_name)
            if category != 'Unknown':
                remaining_keyword_hits.append({
                    'tag': full_tag,
                    'tag_name': tag_name,
                    'label': label,
                    'category': category
                })

    print(f"Found {len(remaining_keyword_hits)} keyword hits to analyze", flush=True)
    
    if len(remaining_keyword_hits) == 0:
        print("WARNING: No keyword hits found even though keyword_hits = {keyword_hits}", flush=True)
        print("This suggests the data changed between processing and diagnostic", flush=True)
    else:
        # Write list
        import os
        output_file = 'remaining_keyword_hits.txt'
        print(f"Writing to {os.path.abspath(output_file)}...", flush=True)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"REMAINING {len(remaining_keyword_hits)} KEYWORD HITS\n")
            f.write("="*80 + "\n\n")
            
            by_category = defaultdict(list)
            for item in remaining_keyword_hits:
                by_category[item['category']].append(item)
            
            for category in sorted(by_category.keys()):
                f.write(f"\n{category} ({len(by_category[category])} tags):\n")
                f.write("-"*80 + "\n")
                for item in by_category[category]:
                    f.write(f"{item['tag']}\n")
                    f.write(f"  {item['label']}\n\n")

        print(f"File written successfully to: {os.path.abspath(output_file)}", flush=True)
        print(f"File size: {os.path.getsize(output_file)} bytes", flush=True)

        # Search for these in taxonomy
        if zip_file_tax:
            print("\nSearching for these tags in ALL taxonomy files...", flush=True)

            all_linkbase = [f for f in zip_file_tax.namelist() if (f.endswith('-pre-2024.xml') or f.endswith('-cal-2024.xml'))]
            tag_search_list = [item['tag_name'] for item in remaining_keyword_hits]
            tag_locations = {tag: [] for tag in tag_search_list}

            for i, file_path in enumerate(all_linkbase):
                if (i + 1) % 100 == 0:
                    print(f"  Searched {i+1}/{len(all_linkbase)} files...", flush=True)
                    
                try:
                    xml_content = zip_file_tax.read(file_path)
                    root = ET.fromstring(xml_content)
                    locators = root.findall('.//{http://www.xbrl.org/2003/linkbase}loc')
                    
                    for loc in locators:
                        href = loc.get('{http://www.w3.org/1999/xlink}href', '')
                        
                        for tag in tag_search_list:
                            if f'us-gaap_{tag}' in href:
                                tag_locations[tag].append(file_path)
                                break
                except:
                    pass

            # Write locations
            output_file2 = 'remaining_tag_locations.txt'
            print(f"\nWriting locations to {os.path.abspath(output_file2)}...", flush=True)
            
            with open(output_file2, 'w', encoding='utf-8') as f:
                f.write(f"LOCATIONS OF REMAINING {len(remaining_keyword_hits)} KEYWORD HITS IN TAXONOMY\n")
                f.write("="*80 + "\n\n")
                
                found_count = 0
                not_found_count = 0
                
                for tag, files in sorted(tag_locations.items()):
                    if files:
                        found_count += 1
                        unique_files = list(set([f.split('/')[-1] for f in files]))
                        unique_dirs = list(set(['/'.join(f.split('/')[:-1]) for f in files]))
                        
                        f.write(f"\n{tag}:\n")
                        f.write(f"  Found in {len(unique_files)} file(s)\n")
                        f.write(f"  Directories: {', '.join(unique_dirs)}\n")
                        for fname in sorted(unique_files)[:5]:
                            f.write(f"    - {fname}\n")
                    else:
                        not_found_count += 1
                        f.write(f"\n{tag}: NOT FOUND in any linkbase file\n")
                
                f.write(f"\n\n{'='*80}\n")
                f.write(f"SUMMARY:\n")
                f.write(f"  Tags found in taxonomy: {found_count}\n")
                f.write(f"  Tags NOT in taxonomy: {not_found_count}\n")

            print(f"File written successfully to: {os.path.abspath(output_file2)}", flush=True)
            print(f"File size: {os.path.getsize(output_file2)} bytes", flush=True)
            print("\nUpload both files for final analysis")

print("\nDone!", flush=True)