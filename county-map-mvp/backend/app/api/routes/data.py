from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from app.schemas.county_data import (
    CountiesResponse,
    CountyRecord,
    IngestRequest,
    IngestResponse,
    MetadataResponse,
)
from app.services import file_service
from app.services.ingestion_service import AVAILABLE_METRICS, aggregate_reports
from app.utils.validators import JSONValidationError

router = APIRouter(prefix="/data", tags=["data"])


def _filter_records(
    records: list[dict[str, Any]],
    state: Optional[str],
    year: Optional[int],
) -> list[dict[str, Any]]:
    out = records
    if state:
        s = state.upper()
        out = [r for r in out if (r.get("state") or "").upper() == s]
    if year is not None:
        out = [r for r in out if r.get("year") == year]
    return out


@router.get("/counties", response_model=CountiesResponse)
def get_counties(
    state: Optional[str] = Query(None, min_length=2, max_length=2, description="USPS state code, e.g. TX"),
    year: Optional[int] = Query(None, ge=1900, le=2100),
    metric: Optional[str] = Query(None, description="Metric name; validated against /metadata.available_metrics"),
) -> CountiesResponse:
    if metric is not None and metric not in AVAILABLE_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown metric '{metric}'. Allowed: {AVAILABLE_METRICS}",
        )

    records = file_service.load_county_data()
    filtered = _filter_records(records, state, year)

    # Validate each record against the response schema so we surface malformed
    # processed/sample files as a clear 500 rather than silently dropping fields.
    typed: list[CountyRecord] = [CountyRecord(**r) for r in filtered]
    return CountiesResponse(
        records=typed,
        count=len(typed),
        filters_applied={"state": state, "year": year, "metric": metric},
    )


@router.get("/metadata", response_model=MetadataResponse)
def get_metadata() -> MetadataResponse:
    records = file_service.load_county_data()
    states = sorted({r["state"] for r in records if r.get("state")})
    years = sorted({r["year"] for r in records if isinstance(r.get("year"), int)})
    return MetadataResponse(
        available_states=states,
        available_years=years,
        available_metrics=AVAILABLE_METRICS,
        record_count=len(records),
        file_status=file_service.file_status(),
    )


@router.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest | None = None) -> IngestResponse:
    """Read a raw TotalView JSON file, aggregate it, and persist the result.

    Expects the file to live in backend/app/data/raw/. When we move to a real
    database, this is where the processed records would be written to the DB
    instead of (or in addition to) the processed JSON file.
    """
    req = req or IngestRequest()
    src = file_service.raw_path(req.filename)

    if not src.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Raw file not found at {src}. "
                f"Place a TotalView-style JSON file in backend/app/data/raw/ and retry."
            ),
        )

    try:
        payload = file_service.read_json(src)
    except ValueError as e:  # json.JSONDecodeError inherits from ValueError
        raise HTTPException(status_code=400, detail=f"File is not valid JSON: {e}") from e

    try:
        records = aggregate_reports(payload)
    except JSONValidationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    if not records:
        raise HTTPException(
            status_code=422,
            detail=(
                "JSON parsed and validated, but no records produced. "
                "Most likely the (state, county) pairs aren't in the FIPS lookup "
                "table (backend/app/utils/fips.py)."
            ),
        )

    out_path = file_service.save_processed(records, src)
    return IngestResponse(
        ok=True,
        message=f"Ingested {len(records)} county-year records.",
        records_written=len(records),
        source_path=str(src),
        output_path=str(out_path),
    )
