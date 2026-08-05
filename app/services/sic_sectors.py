"""
SIC Major Group (2-digit) → human-readable sector name.

EDGAR ships a 4-digit SIC code per filer (e.g. 3571 = "Electronic Computers")
and a matching industry label. There's no native "sector" field, but the
SIC's 2-digit Major Group hierarchy is the natural coarse-grain bucket
that finance shops use (S&P/Moody's industry methodology tables key off it).

This table covers all SIC Major Groups currently in active use by SEC filers.
Source: https://www.sec.gov/info/edgar/siccodes.htm
"""

from __future__ import annotations
from typing import Optional

SIC_MAJOR_GROUPS: dict[str, str] = {
    # Agriculture, Forestry & Fishing
    "01": "Agriculture - Crops",
    "02": "Agriculture - Livestock",
    "07": "Agricultural Services",
    "08": "Forestry",
    "09": "Fishing, Hunting & Trapping",
    # Mining
    "10": "Metal Mining",
    "12": "Coal Mining",
    "13": "Oil & Gas Extraction",
    "14": "Nonmetallic Minerals Mining",
    # Construction
    "15": "Construction - General Contractors",
    "16": "Heavy Construction",
    "17": "Construction - Special Trade",
    # Manufacturing
    "20": "Food & Kindred Products",
    "21": "Tobacco Products",
    "22": "Textile Mill Products",
    "23": "Apparel & Other Finished Goods",
    "24": "Lumber & Wood Products",
    "25": "Furniture & Fixtures",
    "26": "Paper & Allied Products",
    "27": "Printing & Publishing",
    "28": "Chemicals & Allied Products",
    "29": "Petroleum Refining",
    "30": "Rubber & Plastics Products",
    "31": "Leather & Leather Products",
    "32": "Stone, Clay, Glass & Concrete",
    "33": "Primary Metal Industries",
    "34": "Fabricated Metal Products",
    "35": "Industrial Machinery & Computers",
    "36": "Electronic & Electrical Equipment",
    "37": "Transportation Equipment",
    "38": "Measuring & Optical Instruments",
    "39": "Miscellaneous Manufacturing",
    # Transportation, Communications, Utilities
    "40": "Railroad Transportation",
    "41": "Local & Highway Transit",
    "42": "Motor Freight Transportation",
    "43": "US Postal Service",
    "44": "Water Transportation",
    "45": "Air Transportation",
    "46": "Pipelines (except Natural Gas)",
    "47": "Transportation Services",
    "48": "Communications",
    "49": "Electric, Gas & Sanitary Services",
    # Wholesale Trade
    "50": "Wholesale - Durable Goods",
    "51": "Wholesale - Nondurable Goods",
    # Retail Trade
    "52": "Retail - Building Materials",
    "53": "Retail - General Merchandise",
    "54": "Retail - Food Stores",
    "55": "Retail - Automotive & Gas",
    "56": "Retail - Apparel",
    "57": "Retail - Furniture & Home",
    "58": "Eating & Drinking Places",
    "59": "Retail - Miscellaneous",
    # Finance, Insurance, Real Estate
    "60": "Depository Institutions",
    "61": "Non-Depository Credit",
    "62": "Securities & Commodity Brokers",
    "63": "Insurance Carriers",
    "64": "Insurance Agents & Brokers",
    "65": "Real Estate",
    "67": "Holding & Investment Offices",
    # Services
    "70": "Hotels & Lodging",
    "72": "Personal Services",
    "73": "Business Services",
    "75": "Automotive Repair & Services",
    "76": "Miscellaneous Repair Services",
    "78": "Motion Pictures",
    "79": "Amusement & Recreation",
    "80": "Health Services",
    "81": "Legal Services",
    "82": "Educational Services",
    "83": "Social Services",
    "84": "Museums & Botanical Gardens",
    "86": "Membership Organizations",
    "87": "Engineering & Management Services",
    "88": "Private Households",
    "89": "Services - Other",
    # Public Administration
    "91": "Government - Executive & Legislative",
    "92": "Justice & Public Safety",
    "93": "Public Finance & Taxation",
    "94": "Human Resource Programs",
    "95": "Environment & Housing Programs",
    "96": "Economic Programs Administration",
    "97": "National Security & Foreign Affairs",
    # Nonclassifiable
    "99": "Nonclassifiable Establishments",
}


def sector_from_sic(sic: Optional[str]) -> Optional[str]:
    """Map a SIC code to its 2-digit Major Group sector name. Accepts strings
    like "3571" or "35"; pads single-digit codes. Returns None when SIC is
    missing/empty or the major group isn't in the table."""
    if not sic:
        return None
    s = str(sic).strip()
    if not s.isdigit():
        return None
    s = s.zfill(2) if len(s) < 2 else s
    return SIC_MAJOR_GROUPS.get(s[:2])


# ---------------------------------------------------------------------------
# Display overrides: friendlier industry names than SIC's 1987 wording.
# ---------------------------------------------------------------------------
# SIC is canonical (and what EDGAR ships) but its labels are dated — e.g.
# "Operative Builders" for home-builders, "Services-Prepackaged Software" for
# software companies. This map translates the SIC industry text into the
# concise names analysts actually use (GICS / Morningstar / Yahoo-style).
# Anything not in this map keeps its raw SIC label.
INDUSTRY_DISPLAY_OVERRIDES: dict[str, str] = {
    # Construction
    "Operative Builders": "Home Builders",
    "General Bldg Contractors - Residential Bldgs": "Home Builders",
    "General Bldg Contractors - Nonresidential Bldgs": "Construction - Commercial",
    "Heavy Construction Other Than Bldg Const - Contractors": "Engineering & Construction",
    "Construction - Special Trade Contractors": "Construction Services",

    # Financials
    "National Commercial Banks": "Banks - Diversified",
    "State Commercial Banks": "Banks - Regional",
    "Savings Institution, Federal Charter": "Banks - Thrifts",
    "Savings Institutions, State Chartered": "Banks - Thrifts",
    "Personal Credit Institutions": "Credit Services",
    "Short-Term Business Credit Institutions": "Credit Services",
    "Federal & Federally-Sponsored Credit Agencies": "Credit Services",
    "Finance Services": "Financial Services - Other",
    "Security Brokers, Dealers & Flotation Companies": "Capital Markets",
    "Investment Advice": "Asset Management",
    "Real Estate Investment Trusts": "REITs - Diversified",
    "Real Estate Agents & Managers (For Others)": "Real Estate Services",
    "Operators Of Apartment Buildings": "REITs - Residential",
    "Land Subdividers & Developers (No Cemeteries)": "Real Estate - Development",

    # Insurance
    "Life Insurance": "Insurance - Life",
    "Accident & Health Insurance": "Insurance - Health",
    "Fire, Marine & Casualty Insurance": "Insurance - P&C",
    "Surety Insurance": "Insurance - Specialty",
    "Hospital & Medical Service Plans": "Insurance - Managed Care",
    "Insurance Agents, Brokers & Service": "Insurance Brokers",

    # Tech & software
    "Electronic Computers": "Computer Hardware",
    "Computer Storage Devices": "Storage & Data Infrastructure",
    "Computer Communications Equipment": "Networking Equipment",
    "Computer Peripheral Equipment": "Computer Peripherals",
    "Calculating & Accounting Machines": "Office Equipment",
    "Semiconductors & Related Devices": "Semiconductors",
    "Electronic Components, NEC": "Electronic Components",
    "Printed Circuit Boards": "Electronic Components",
    "Telephone & Telegraph Apparatus": "Communications Equipment",
    "Radio & Tv Broadcasting & Communications Equipment": "Communications Equipment",
    "Services-Prepackaged Software": "Software - Application",
    "Services-Computer Programming, Data Processing, Etc.": "IT Services",
    "Services-Computer Programming Services": "IT Services",
    "Services-Computer Integrated Systems Design": "IT Services",
    "Services-Information Retrieval Services": "Internet Content & Information",
    "Services-Business Services, NEC": "Business Services",

    # Healthcare / Pharma
    "Pharmaceutical Preparations": "Drug Manufacturers - General",
    "Biological Products (No Diagnostic Substances)": "Biotechnology",
    "Pharmaceutical Preparations - In Vitro & In Vivo Diagnostic Substances": "Diagnostics & Research",
    "Medicinal Chemicals & Botanical Products": "Drug Manufacturers - Specialty",
    "Surgical & Medical Instruments & Apparatus": "Medical Devices",
    "Electromedical & Electrotherapeutic Apparatus": "Medical Devices",
    "X-Ray Apparatus & Tubes & Related Irradiation Apparatus": "Medical Devices",
    "Dental Equipment & Supplies": "Medical Devices",
    "Services-Health Services": "Healthcare Services",
    "Services-Hospitals": "Hospitals",
    "Services-Home Health Care Services": "Home Healthcare",
    "Services-Medical Laboratories": "Diagnostics & Research",
    "Services-Nursing & Personal Care Facilities": "Long-term Care",

    # Energy
    "Crude Petroleum & Natural Gas": "Oil & Gas E&P",
    "Petroleum Refining": "Oil & Gas Refining & Marketing",
    "Natural Gas Distribution": "Utilities - Regulated Gas",
    "Natural Gas Transmission": "Oil & Gas Midstream",
    "Drilling Oil & Gas Wells": "Oil & Gas Drilling",
    "Oil & Gas Field Services, NEC": "Oil & Gas Equipment & Services",
    "Services-Oil & Gas Field Services": "Oil & Gas Equipment & Services",
    "Bituminous Coal & Lignite Surface Mining": "Coal",
    "Bituminous Coal & Lignite Mining": "Coal",
    "Electric Services": "Utilities - Regulated Electric",
    "Gas & Other Services Combined": "Utilities - Diversified",
    "Water Supply": "Utilities - Regulated Water",
    "Cogeneration Services & Small Power Producers": "Utilities - Renewable",

    # Industrials
    "Aircraft": "Aerospace & Defense",
    "Aircraft Engines & Engine Parts": "Aerospace & Defense",
    "Aircraft Parts & Auxiliary Equipment, NEC": "Aerospace & Defense",
    "Guided Missiles & Space Vehicles & Parts": "Aerospace & Defense",
    "Motor Vehicles & Passenger Car Bodies": "Auto Manufacturers",
    "Motor Vehicle Parts & Accessories": "Auto Parts",
    "Truck & Bus Bodies": "Truck Manufacturing",
    "Industrial & Commercial Machinery & Computer Equipment": "Specialty Industrial Machinery",
    "Construction, Mining & Materials Handling Machinery & Equipment": "Farm & Heavy Construction Machinery",
    "Farm Machinery & Equipment": "Farm & Heavy Construction Machinery",
    "Air-Cond & Warm Air Heatg Equip & Comm & Indl Refrig Equip": "Building Products & Equipment",
    "Special Industry Machinery, NEC": "Specialty Industrial Machinery",

    # Materials
    "Industrial Inorganic Chemicals": "Specialty Chemicals",
    "Industrial Organic Chemicals": "Specialty Chemicals",
    "Plastic Materials, Synth Resins & Nonvulcan Elastomers": "Chemicals",
    "Agricultural Chemicals": "Agricultural Inputs",
    "Specialty Chemicals": "Specialty Chemicals",
    "Steel Works, Blast Furnaces & Rolling Mills (Coke Ovens)": "Steel",
    "Primary Production Of Aluminum": "Aluminum",
    "Gold Mining": "Gold",
    "Silver Ores": "Silver",
    "Copper Ores": "Copper",

    # Consumer
    "Retail-Variety Stores": "Discount Stores",
    "Retail-Department Stores": "Department Stores",
    "Retail-Grocery Stores": "Grocery Stores",
    "Retail-Eating Places": "Restaurants",
    "Retail-Eating & Drinking Places": "Restaurants",
    "Eating Places": "Restaurants",
    "Retail-Drug Stores And Proprietary Stores": "Pharmacies & Drug Stores",
    "Retail-Apparel & Accessory Stores": "Apparel Retail",
    "Retail-Family Clothing Stores": "Apparel Retail",
    "Retail-Catalog, Mail-Order Houses": "Internet Retail",
    "Services-Auto Rental & Leasing (No Drivers)": "Rental & Leasing Services",
    "Retail-Auto Dealers & Gasoline Stations": "Auto & Truck Dealerships",
    "Retail-Lumber & Other Building Materials Dealers": "Home Improvement Retail",
    "Hotels & Motels": "Lodging",
    "Services-Hotels & Motels": "Lodging",
    "Services-Educational Services": "Education & Training Services",
    "Cigarettes": "Tobacco",
    "Beverages": "Beverages - Non-Alcoholic",
    "Malt Beverages": "Beverages - Brewers",
    "Distilled & Blended Liquors": "Beverages - Wineries & Distilleries",
    "Wines, Brandy & Brandy Spirits": "Beverages - Wineries & Distilleries",
    "Soap, Detergents, Cleng Preparations, Perfumes, Cosmetics": "Household & Personal Products",

    # Telecom / Media
    "Telephone Communications (No Radiotelephone)": "Telecom Services",
    "Radiotelephone Communications": "Telecom Services",
    "Cable & Other Pay Television Services": "Entertainment",
    "Television Broadcasting Stations": "Broadcasting",
    "Radio Broadcasting Stations": "Broadcasting",
    "Services-Motion Picture & Video Tape Production": "Entertainment",
    "Services-Amusement & Recreation Services": "Leisure",

    # Transportation
    "Air Transportation, Scheduled": "Airlines",
    "Air Transportation, Nonscheduled": "Airlines",
    "Trucking (No Local)": "Trucking",
    "Railroads, Line-Haul Operating": "Railroads",
    "Deep Sea Foreign Transportation Of Freight": "Marine Shipping",
    "Water Transportation": "Marine Shipping",
}


def display_industry(raw: Optional[str]) -> Optional[str]:
    """Translate a raw SIC industry name (as EDGAR ships it) into the modern
    analyst-friendly label when an override exists; otherwise return as-is."""
    if not raw:
        return raw
    return INDUSTRY_DISPLAY_OVERRIDES.get(raw, raw)


# Inverse lookup: given a display name (what the UI shows), return every raw
# SIC industry string that maps to it. Used by the screener endpoint to
# expand a single filter pick like "Home Builders" into the set of raw
# names actually stored in the DB ("Operative Builders", "General Bldg
# Contractors - Residential Bldgs"). The display name itself is included
# in case some rows are already stored under it.
def raw_industries_for_display(display_name: Optional[str]) -> list[str]:
    if not display_name:
        return []
    matches = [raw for raw, mapped in INDUSTRY_DISPLAY_OVERRIDES.items()
               if mapped == display_name]
    if display_name not in matches:
        matches.append(display_name)
    return matches
