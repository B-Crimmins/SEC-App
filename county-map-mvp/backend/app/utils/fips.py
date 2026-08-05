"""
Minimal (state, county-name) -> 5-digit FIPS lookup.

This MVP only covers the counties present in the sample mock_totalview_reports
data. To support arbitrary U.S. counties, replace this dict with a full lookup
sourced from the Census Bureau's national county file (or load it from JSON at
startup).
"""
from __future__ import annotations

# Keys are (state_code_upper, county_name_title_case).
# County names are normalized to Title Case (e.g. "Miami-Dade", "King").
FIPS_LOOKUP: dict[tuple[str, str], str] = {
    ("AZ", "Maricopa"): "04013",
    ("CO", "Denver"): "08031",
    ("FL", "Miami-Dade"): "12086",
    ("GA", "Fulton"): "13121",
    ("IL", "Cook"): "17031",
    ("MA", "Suffolk"): "25025",
    ("NC", "Mecklenburg"): "37119",
    ("NY", "Kings"): "36047",
    ("TX", "Harris"): "48201",
    ("WA", "King"): "53033",
}


def normalize_county_name(name: str) -> str:
    """Normalize a county name to the form used as a lookup key."""
    return (name or "").strip().title()


def lookup_fips(state: str, county_name: str) -> str | None:
    if not state or not county_name:
        return None
    return FIPS_LOOKUP.get((state.upper(), normalize_county_name(county_name)))
