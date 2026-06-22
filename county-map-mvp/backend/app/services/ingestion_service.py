"""Transform raw TotalView property reports into county-level aggregations.

One input property report -> contributes to one (state, county, sale_year)
bucket. Each bucket becomes one CountyRecord on output.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from app.utils.fips import lookup_fips, normalize_county_name
from app.utils.validators import validate_totalview_payload


@dataclass
class _Bucket:
    count: int = 0
    sale_sum: float = 0.0
    sale_n: int = 0
    ev_sum: float = 0.0
    ev_n: int = 0
    involuntary_liens: int = 0
    hoa_liens: int = 0


def _safe_get(d: Any, *keys: str) -> Any:
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def _year_from_sale_date(sale_date: Any) -> int | None:
    if not isinstance(sale_date, str) or len(sale_date) < 4:
        return None
    head = sale_date[:4]
    return int(head) if head.isdigit() else None


def aggregate_reports(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Validate and aggregate a TotalView payload into county-year records.

    Records without a recognizable (state, county) FIPS mapping are skipped.
    """
    validate_totalview_payload(payload)

    buckets: dict[tuple[str, str, int | None], _Bucket] = defaultdict(_Bucket)
    skipped_unknown_fips: list[tuple[str, str]] = []

    for rep in payload.get("Reports", []):
        if not isinstance(rep, dict):
            continue

        state = _safe_get(rep, "Data", "SubjectProperty", "SitusAddress", "State")
        county_raw = _safe_get(rep, "Data", "SubjectProperty", "SitusAddress", "County")
        if not state or not county_raw:
            continue

        state = str(state).upper()
        county_name = normalize_county_name(str(county_raw))

        sale_price = _safe_get(rep, "Data", "LastMarketSaleInformation", "SalePrice")
        sale_date = _safe_get(rep, "Data", "LastMarketSaleInformation", "SaleDate")
        year = _year_from_sale_date(sale_date)

        ev_low = _safe_get(rep, "Data", "LegalAndVestingData", "EstimatedValueLow")
        ev_high = _safe_get(rep, "Data", "LegalAndVestingData", "EstimatedValueHigh")
        ev_mid: float | None = None
        if isinstance(ev_low, (int, float)) and isinstance(ev_high, (int, float)):
            ev_mid = (float(ev_low) + float(ev_high)) / 2.0

        involuntary = bool(_safe_get(rep, "Data", "LienSummary", "InvoluntaryLien", "LienOnProperty"))
        hoa = bool(_safe_get(rep, "Data", "LienSummary", "HOALien", "LienOnProperty"))

        key = (state, county_name, year)
        b = buckets[key]
        b.count += 1
        if isinstance(sale_price, (int, float)):
            b.sale_sum += float(sale_price)
            b.sale_n += 1
        if ev_mid is not None:
            b.ev_sum += ev_mid
            b.ev_n += 1
        if involuntary:
            b.involuntary_liens += 1
        if hoa:
            b.hoa_liens += 1

    records: list[dict[str, Any]] = []
    for (state, county_name, year), b in buckets.items():
        fips = lookup_fips(state, county_name)
        if not fips:
            skipped_unknown_fips.append((state, county_name))
            continue
        records.append(
            {
                "county_fips": fips,
                "county_name": county_name,
                "state": state,
                "year": year,
                "metrics": {
                    "property_count": b.count,
                    "avg_sale_price": (b.sale_sum / b.sale_n) if b.sale_n else None,
                    "avg_estimated_value": (b.ev_sum / b.ev_n) if b.ev_n else None,
                    "involuntary_lien_count": b.involuntary_liens,
                    "hoa_lien_count": b.hoa_liens,
                },
            }
        )

    records.sort(key=lambda r: (r["state"], r["county_name"], r["year"] or 0))
    # TODO: surface `skipped_unknown_fips` to the caller (e.g. via a richer
    # IngestResponse) once the FIPS lookup table is comprehensive.
    return records


# Names of metrics the UI can color by. Kept in one place so the metadata
# endpoint and the frontend stay in sync.
AVAILABLE_METRICS: list[str] = [
    "property_count",
    "avg_sale_price",
    "avg_estimated_value",
    "involuntary_lien_count",
    "hoa_lien_count",
]
