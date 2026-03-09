import requests

HEADERS = {'User-Agent': 'SEC-Test test@example.com'}
response = requests.get('https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json', headers=HEADERS, timeout=60)
data = response.json()

print('=== UNDERSTANDING THE TWO FILING DATES ===')
print()
print('Microsoft Fiscal Year ends June 30.')
print('- FY2024 10-K filed: 2024-07-30')
print('- FY2025 10-K filed: 2025-07-30')
print()

# Show how FY2025 10-K includes FY2024 comparative data
tag = 'AccountsReceivableNetCurrent'
tag_data = data['facts']['us-gaap'][tag]

print(f'Example: {tag}')
print('='*70)
print()
print('All 10-K entries from SEC API:')
print()

for unit, values in tag_data['units'].items():
    tenk_values = [v for v in values if v.get('form') == '10-K']
    for v in sorted(tenk_values, key=lambda x: (x.get('filed', ''), x.get('end', ''))):
        val = v.get('val', 0)
        print(f"  Filed: {v.get('filed')}  |  End: {v.get('end')}  |  FY: {v.get('fy')}  |  Value: ${val:,}")
    break

print()
print('='*70)
print()
print('KEY INSIGHT:')
print('- FY2025 10-K (filed 2025-07-30) includes FY2024 data as COMPARATIVE figures')
print('- When you request FY2024 data, the filter matches:')
print('    end.startswith("2024") OR fy == 2024')
print()
print('- For AccountsReceivableNetCurrent with end=2024-06-30:')
print('    * FY2024 10-K reports it (filed 2024-07-30)')
print('    * FY2025 10-K ALSO reports it as prior-year comparative (filed 2025-07-30)')
print()
print('- The script takes the LATEST filing, so it picks 2025-07-30')
print()
print('WHY THIS IS ACTUALLY CORRECT:')
print('- You get the MOST RECENT audited version of the data')
print('- If there was a restatement, you would get the corrected value')
print('- This is how professional data vendors (Bloomberg, FactSet) work')
