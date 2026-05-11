"""
FFIEC API — SQL-backed dimensional query engine on BigQuery.

Endpoints:
  GET  /api/ffiec/schema          Column list, dimensions, measures, aggs.
  POST /api/ffiec/distinct        Distinct values for a column, optionally
                                   scoped by other filters (dependent dropdowns).
  POST /api/ffiec/query           Run a compiled aggregation query.

The backend is a thin HTTP layer over `FFIECBigQueryService`, which owns all
SQL compilation and parameter binding.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from auth.auth import get_current_active_user
from models.user import User
from services.ffiec_bq import (
    AGG_TEMPLATES,
    DIMENSION_COLUMNS,
    FULL_TABLE_ID,
    MEASURE_COLUMNS,
    PRIMARY_DIMENSIONS,
    FFIECBigQueryService,
    get_ffiec_bq_service,
)


router = APIRouter(prefix="/api/ffiec", tags=["ffiec"])


class MeasureSpec(BaseModel):
    column: str
    agg: str
    alias: str | None = None


class OrderBySpec(BaseModel):
    column: str
    direction: str = "ASC"


class FFIECQueryRequest(BaseModel):
    dimensions: list[str] = Field(default_factory=list)
    measures: list[MeasureSpec] = Field(default_factory=list)
    filters: dict[str, list[Any]] = Field(default_factory=dict)
    order_by: list[OrderBySpec] = Field(default_factory=list)
    limit: int = Field(10_000, ge=1, le=200_000)


class FFIECDistinctRequest(BaseModel):
    column: str
    filters: dict[str, list[Any]] = Field(default_factory=dict)
    limit: int = Field(50_000, ge=1, le=200_000)


@router.get("/schema")
async def get_schema(
    _user: User = Depends(get_current_active_user),
    svc: FFIECBigQueryService = Depends(get_ffiec_bq_service),
):
    """Columns, dimensions, measures, and supported aggregations. Lets the
    frontend build its shelf UI without hardcoding anything."""
    try:
        schema = await run_in_threadpool(lambda: svc.schema)
        row_count = await run_in_threadpool(lambda: svc.table.num_rows)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FFIEC schema fetch failed: {e}")
    return {
        "table": FULL_TABLE_ID,
        "row_count": row_count,
        "columns": [{"name": n, "type": t} for n, t in schema],
        "dimensions": list(DIMENSION_COLUMNS),
        "primary_dimensions": list(PRIMARY_DIMENSIONS),
        "measures": list(MEASURE_COLUMNS),
        "aggregations": list(AGG_TEMPLATES.keys()),
    }


@router.post("/distinct")
async def get_distinct(
    req: FFIECDistinctRequest,
    _user: User = Depends(get_current_active_user),
    svc: FFIECBigQueryService = Depends(get_ffiec_bq_service),
):
    """Distinct values for a single column — used to populate dependent
    dropdowns. Passing `filters` narrows the result set so the user only sees
    values that are actually reachable given their current selections."""
    try:
        values = await run_in_threadpool(
            svc.distinct_values,
            req.column,
            req.filters,
            req.limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FFIEC distinct failed: {e}")
    return {"column": req.column, "values": values, "count": len(values)}


@router.post("/query")
async def run_query(
    req: FFIECQueryRequest,
    _user: User = Depends(get_current_active_user),
    svc: FFIECBigQueryService = Depends(get_ffiec_bq_service),
):
    """Run an aggregation query. Response includes the compiled SQL (handy for
    debugging in the UI) and the rows as a list of dicts."""
    try:
        result = await run_in_threadpool(
            svc.run_query,
            req.dimensions,
            [m.model_dump() for m in req.measures],
            req.filters,
            [o.model_dump() for o in req.order_by],
            req.limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FFIEC query failed: {e}")
    return {
        "sql": result["sql"],
        "rows": result["rows"],
        "row_count": result["row_count"],
        "bytes_processed": result["bytes_processed"],
        "truncated": result["row_count"] >= req.limit,
    }
