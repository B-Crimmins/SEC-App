import pytest

from app.services.ingestion_service import aggregate_reports
from app.utils.validators import JSONValidationError


def _report(state: str, county: str, sale_date: str = "2017-06-01T00:00:00", price: int = 500_000) -> dict:
    return {
        "Data": {
            "SubjectProperty": {"SitusAddress": {"State": state, "County": county}},
            "LastMarketSaleInformation": {"SaleDate": sale_date, "SalePrice": price},
            "LegalAndVestingData": {"EstimatedValueLow": 400_000, "EstimatedValueHigh": 600_000},
            "LienSummary": {
                "HOALien": {"LienOnProperty": False},
                "InvoluntaryLien": {"LienOnProperty": True},
            },
        }
    }


def test_aggregate_groups_by_county_year() -> None:
    payload = {
        "Reports": [
            _report("TX", "HARRIS", "2017-06-01T00:00:00", 400_000),
            _report("TX", "HARRIS", "2017-09-01T00:00:00", 600_000),
            _report("TX", "HARRIS", "2018-01-01T00:00:00", 1_000_000),
        ]
    }
    records = aggregate_reports(payload)
    by_year = {r["year"]: r for r in records}
    assert set(by_year.keys()) == {2017, 2018}
    assert by_year[2017]["metrics"]["property_count"] == 2
    assert by_year[2017]["metrics"]["avg_sale_price"] == 500_000
    assert by_year[2017]["county_fips"] == "48201"
    assert by_year[2017]["metrics"]["involuntary_lien_count"] == 2


def test_aggregate_skips_unknown_fips() -> None:
    payload = {"Reports": [_report("TX", "HARRIS"), _report("XX", "NOWHERE")]}
    records = aggregate_reports(payload)
    assert len(records) == 1
    assert records[0]["state"] == "TX"


def test_validate_rejects_missing_reports() -> None:
    with pytest.raises(JSONValidationError):
        aggregate_reports({})


def test_validate_rejects_empty_reports() -> None:
    with pytest.raises(JSONValidationError):
        aggregate_reports({"Reports": []})
