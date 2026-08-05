"""
Curated peer sets keyed by yfinance's `industry` string.

The TickerUniverse DB cache is populated by a monthly admin job. When
that job hasn't run (or the target's industry has no rows in the cache),
peer suggestion would return 0 candidates. This module provides a
fallback hand-curated mapping for the industries most likely to come up
in student / entry-level-analyst usage.

Lookup uses yfinance's industry name (lowercased, dash-normalized) so
the keys match what `peer_fundamentals.get_fundamentals(target).industry`
returns. Tickers are sourced from sell-side comp tables and capped at
~12 per industry — enough to give the size-proximity ranker something
to work with after yfinance drops a few for no-TTM-data.

When neither the DB cache nor this map produces enough peers, the user
adds them manually via the "Add peer" UI.
"""

from __future__ import annotations
from typing import List


def _norm(industry: str) -> str:
    """Lowercase + collapse em/en-dashes and whitespace so 'Software—Application'
    and 'software-application' both hit the same key."""
    if not industry:
        return ""
    s = industry.lower().strip()
    s = s.replace("—", "-").replace("–", "-")
    s = " ".join(s.split())
    return s


CURATED_PEERS: dict[str, List[str]] = {
    # ---- Tech hardware ----
    "consumer electronics": ["AAPL", "SONO", "LOGI", "GRMN", "HEAR", "VZIO", "GPRO", "ROKU"],
    "computer hardware": ["DELL", "HPQ", "NTAP", "PSTG", "STX", "WDC", "SMCI", "ANET"],
    "communication equipment": ["CSCO", "MSI", "JNPR", "ANET", "CIEN", "NOK", "ERIC", "EXTR"],
    "electronic components": ["TEL", "APH", "GLW", "JBL", "VSH", "FLEX", "BHE", "CLS"],

    # ---- Semiconductors ----
    "semiconductors": ["NVDA", "AMD", "INTC", "TSM", "AVGO", "QCOM", "MU", "TXN", "MRVL", "ADI", "MCHP", "ON"],
    "semiconductor equipment & materials": ["AMAT", "LRCX", "KLAC", "ASML", "TER", "ENTG", "ACMR", "ONTO"],

    # ---- Software & internet ----
    "software-infrastructure": ["MSFT", "ORCL", "CRM", "NOW", "ADBE", "IBM", "PANW", "FTNT", "CRWD", "SNOW"],
    "software-application": ["CRM", "INTU", "NOW", "ADBE", "SHOP", "WDAY", "TEAM", "HUBS", "DDOG", "ZS"],
    "internet content & information": ["GOOGL", "META", "PINS", "SNAP", "RDDT", "YELP", "Z", "MTCH"],
    "internet retail": ["AMZN", "EBAY", "ETSY", "W", "CHWY", "MELI", "CVNA"],
    "information technology services": ["ACN", "IBM", "CTSH", "INFY", "DXC", "EPAM", "GIB", "G"],

    # ---- Healthcare ----
    "drug manufacturers-general": ["JNJ", "PFE", "MRK", "ABBV", "LLY", "BMY", "NVS", "AZN", "GSK", "ROG"],
    "drug manufacturers-specialty & generic": ["TEVA", "VTRS", "PRGO", "ENDP", "ELAN", "BHC", "JAZZ"],
    "biotechnology": ["AMGN", "GILD", "BIIB", "REGN", "VRTX", "MRNA", "ALNY", "BMRN", "INCY"],
    "medical devices": ["MDT", "SYK", "BSX", "EW", "ZBH", "BDX", "ABT", "ISRG", "HOLX", "PEN"],
    "diagnostics & research": ["TMO", "DHR", "A", "IQV", "WAT", "MTD", "BIO", "ILMN"],
    "healthcare plans": ["UNH", "CVS", "HUM", "CI", "ELV", "CNC", "MOH"],

    # ---- Financials ----
    "banks-diversified": ["JPM", "BAC", "WFC", "C", "USB", "TFC", "PNC", "MTB"],
    "banks-regional": ["TFC", "USB", "PNC", "MTB", "RF", "KEY", "CFG", "HBAN", "FITB", "ZION"],
    "credit services": ["V", "MA", "AXP", "DFS", "COF", "SYF", "PYPL"],
    "asset management": ["BLK", "TROW", "BEN", "IVZ", "AB", "AMP", "JHG"],
    "capital markets": ["GS", "MS", "SCHW", "ICE", "CME", "NDAQ", "TW", "MKTX"],
    "insurance-life": ["MET", "PRU", "AFL", "LNC", "VOYA", "GL", "BHF"],
    "insurance-property & casualty": ["TRV", "CB", "ALL", "PGR", "HIG", "WRB", "MKL", "AIG"],
    "insurance brokers": ["MMC", "AON", "AJG", "WTW", "BRO", "RYAN"],
    "reit-residential": ["EQR", "AVB", "MAA", "ESS", "UDR", "CPT", "INVH", "AMH"],
    "reit-retail": ["O", "SPG", "KIM", "REG", "FRT", "MAC", "BRX"],
    "reit-industrial": ["PLD", "DRE", "EGP", "REXR", "FR", "TRNO", "STAG"],
    "reit-office": ["BXP", "VNO", "KRC", "DEI", "HPP", "CUZ", "PGRE"],
    "reit-healthcare facilities": ["WELL", "VTR", "HCP", "OHI", "DOC", "NHI", "LTC"],

    # ---- Consumer discretionary ----
    "auto manufacturers": ["TSLA", "F", "GM", "STLA", "HMC", "TM", "RIVN", "LCID", "NIO"],
    "auto parts": ["APTV", "BWA", "MGA", "LEA", "ALV", "GNTX", "MOD", "VC"],
    "apparel retail": ["TJX", "ROST", "ANF", "AEO", "URBN", "GPS", "M", "KSS"],
    "footwear & accessories": ["NKE", "DECK", "CROX", "SHOO", "SKX", "ONON"],
    "luxury goods": ["LVMUY", "CFRUY", "RACE", "TPR", "CPRI", "RL"],
    "restaurants": ["MCD", "SBUX", "CMG", "YUM", "DRI", "QSR", "DPZ", "WEN", "DNUT"],
    "home improvement retail": ["HD", "LOW", "FND", "TSCO", "BBY"],
    "specialty retail": ["BBY", "GME", "DKS", "FIVE", "OLLI", "BIG", "CASY", "PSMT"],
    "lodging": ["MAR", "HLT", "H", "IHG", "HST", "PK", "WH"],
    "travel services": ["BKNG", "EXPE", "TRIP", "ABNB", "TCOM"],

    # ---- Consumer staples ----
    "beverages-non-alcoholic": ["KO", "PEP", "MNST", "KDP", "CELH"],
    "beverages-wineries & distilleries": ["DEO", "STZ", "BF.B", "MGPI"],
    "household & personal products": ["PG", "CL", "CLX", "KMB", "CHD", "EL", "COTY"],
    "packaged foods": ["NSRGY", "MDLZ", "KHC", "GIS", "K", "CPB", "CAG", "TSN", "HRL", "SJM"],
    "tobacco": ["MO", "PM", "BTI", "TPB"],
    "discount stores": ["WMT", "COST", "TGT", "DG", "DLTR", "BJ"],
    "grocery stores": ["KR", "ACI", "SFM", "GO", "WMK", "IMKTA"],

    # ---- Industrials ----
    "aerospace & defense": ["BA", "LMT", "RTX", "NOC", "GD", "LHX", "TXT", "HEI", "TDG"],
    "specialty industrial machinery": ["ROP", "DOV", "PNR", "XYL", "GGG", "FLS", "PNR", "WTS"],
    "farm & heavy construction machinery": ["CAT", "DE", "PCAR", "OSK", "AGCO", "TEX", "WNC"],
    "railroads": ["UNP", "CSX", "NSC", "CNI", "CP", "GWR"],
    "trucking": ["ODFL", "JBHT", "KNX", "WERN", "SAIA", "ARCB", "XPO"],
    "airlines": ["DAL", "UAL", "AAL", "LUV", "ALK", "JBLU", "SAVE", "HA"],
    "marine shipping": ["KEX", "MATX", "GNK", "EGLE", "SBLK", "DAC"],
    "integrated freight & logistics": ["UPS", "FDX", "XPO", "CHRW", "EXPD", "JBHT"],
    "waste management": ["WM", "RSG", "WCN", "GFL", "CWST", "PCT"],
    "engineering & construction": ["PWR", "FLR", "MTZ", "DY", "EME", "PRIM", "ACM"],
    "industrial distribution": ["FAST", "GWW", "MSM", "BECN", "AIT"],

    # ---- Energy ----
    "oil & gas integrated": ["XOM", "CVX", "COP", "OXY", "MPC", "PSX", "VLO", "TTE", "BP", "SHEL"],
    "oil & gas e&p": ["EOG", "PXD", "FANG", "DVN", "APA", "HES", "MRO", "OVV", "MTDR", "CTRA"],
    "oil & gas midstream": ["KMI", "WMB", "OKE", "ET", "MPLX", "TRGP", "PAA", "EPD"],
    "oil & gas equipment & services": ["SLB", "HAL", "BKR", "FTI", "NOV", "WHD", "LBRT", "RIG"],
    "oil & gas refining & marketing": ["MPC", "PSX", "VLO", "DK", "PARR", "CVI"],

    # ---- Materials ----
    "chemicals": ["DOW", "LYB", "WLK", "EMN", "CE", "HUN", "OLN", "ASH"],
    "specialty chemicals": ["SHW", "ECL", "ALB", "PPG", "RPM", "NEU", "ESI"],
    "steel": ["NUE", "STLD", "X", "CLF", "MT", "CMC", "RS"],
    "copper": ["FCX", "SCCO", "TECK", "ERO"],
    "gold": ["NEM", "GOLD", "AEM", "KGC", "AU", "GFI", "BTG"],
    "building materials": ["MLM", "VMC", "EXP", "USCR", "SUM", "CX"],

    # ---- Communication services ----
    "telecom services": ["T", "VZ", "TMUS", "LUMN", "DISH", "USM", "TDS"],
    "entertainment": ["DIS", "NFLX", "PARA", "FOXA", "WBD", "LYV", "SPOT"],
    "advertising agencies": ["IPG", "OMC", "WPP", "PUBGY", "STGW", "MGNI"],
    "publishing": ["NYT", "GCI", "TRI", "SCHL"],

    # ---- Utilities ----
    "utilities-regulated electric": ["NEE", "DUK", "SO", "AEP", "EXC", "ED", "WEC", "XEL", "EIX", "ETR"],
    "utilities-regulated gas": ["ATO", "OGE", "OKE", "SR", "NWN", "SWX"],
    "utilities-diversified": ["DUK", "EIX", "SRE", "WEC", "CMS", "PEG", "AEE", "CNP"],
    "utilities-renewable": ["NEE", "BEP", "AY", "RUN", "ENPH", "SEDG"],
    "utilities-independent power producers": ["VST", "NRG", "CEG", "PCG", "TLN"],

    # ---- Real estate (non-REIT) ----
    "real estate services": ["CBRE", "JLL", "RDFN", "OPEN", "Z", "CIGI", "MLP", "OPEN"],
    "real estate-development": ["BAM", "HHC", "FOR", "JOE", "MTH"],
}


def get_curated_peers(yfinance_industry: str, exclude: str = "") -> List[str]:
    """Return the curated peer ticker list for `yfinance_industry`, with
    the target ticker filtered out. Returns empty list if no curated set
    exists for the industry — caller should surface that to the user.
    """
    key = _norm(yfinance_industry)
    raw = CURATED_PEERS.get(key, [])
    exclude_u = exclude.strip().upper()
    return [t for t in raw if t != exclude_u]


def has_curated_set(yfinance_industry: str) -> bool:
    return _norm(yfinance_industry) in CURATED_PEERS
