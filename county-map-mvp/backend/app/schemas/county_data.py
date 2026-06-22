from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class CountyMetrics(BaseModel):
    property_count: int = 0
    avg_sale_price: Optional[float] = None
    avg_estimated_value: Optional[float] = None
    involuntary_lien_count: int = 0
    hoa_lien_count: int = 0


class CountyRecord(BaseModel):
    county_fips: str = Field(..., description="5-digit county FIPS code, zero-padded")
    county_name: str
    state: str = Field(..., min_length=2, max_length=2, description="USPS 2-letter state code")
    year: Optional[int] = Field(None, description="Year bucket (from sale year), null = unbucketed")
    metrics: CountyMetrics


class CountiesResponse(BaseModel):
    records: list[CountyRecord]
    count: int
    filters_applied: dict[str, Any]


class MetadataResponse(BaseModel):
    available_states: list[str]
    available_years: list[int]
    available_metrics: list[str]
    record_count: int
    file_status: dict[str, Any]


class IngestRequest(BaseModel):
    filename: Optional[str] = Field(
        None,
        description="Filename in backend/app/data/raw/. If omitted, defaults to 'mock_totalview_reports.json'.",
    )


class IngestResponse(BaseModel):
    ok: bool
    message: str
    records_written: int
    source_path: str
    output_path: str
