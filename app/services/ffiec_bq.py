"""
BigQuery-backed FFIEC query engine.

The frontend sends a declarative query spec (dimensions + measures + filters +
order/limit). We compile that to a parameterized BigQuery SQL statement using
allowlisted columns and aggregation functions, execute it, and return rows.

Security model: every column, aggregation function, and alias is validated
against an allowlist built from the known table schema. User-supplied filter
*values* are passed as query parameters — never interpolated into SQL.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import cached_property, lru_cache
from typing import Any

from google.cloud import bigquery


PROJECT = "tcrimmins"
DATASET = "ffiec"
TABLE = "ffiec_data"
FULL_TABLE_ID = f"{PROJECT}.{DATASET}.{TABLE}"

# Columns we allow on the filter/dimension shelves. Anything outside this set
# is rejected before the query is compiled.
DIMENSION_COLUMNS: tuple[str, ...] = (
    "reporting_period",
    "NM_LGL",
    "ENTITY_TYPE",
    "CNTRY_NM",
    "STATE_ABBR_NM",
    "DOMESTIC_IND",
    "statement_bucket",
    "risk_type",
    "category",
    "subcategory",
    "detail",
    "measurement_type",
    "schedule_code",
    "code_prefix",
    "report_form_scope",
    "is_common_kpi_driver",
    "source_basis",
    "classification_status",
    "data_type",
    "mdrm",
    "mdrm_code",
    "short_description",
    "rssd_id",
    "#ID_RSSD",
)

# The primary 7 dimensions the UI surfaces as top-level filter dropdowns.
PRIMARY_DIMENSIONS: tuple[str, ...] = (
    "reporting_period",
    "NM_LGL",
    "statement_bucket",
    "risk_type",
    "category",
    "detail",
    "measurement_type",
)

# Numeric columns that can be aggregated as a measure.
MEASURE_COLUMNS: tuple[str, ...] = (
    "int_data",
    "float_data",
    "bool_data",
    "str_data",
    "sign",
)

# Aggregation functions. Values are SQL templates; {col} is the quoted column
# identifier. COUNT(*) is special-cased — its "column" is ignored.
AGG_TEMPLATES: dict[str, str] = {
    "sum":             "SUM({col})",
    "avg":             "AVG({col})",
    "min":             "MIN({col})",
    "max":             "MAX({col})",
    "count":           "COUNT({col})",
    "count_distinct":  "COUNT(DISTINCT {col})",
    "median":          "APPROX_QUANTILES({col}, 100)[OFFSET(50)]",
    "stddev":          "STDDEV({col})",
    "variance":        "VARIANCE({col})",
}

_ALIAS_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_PARAM_RE = re.compile(r"[^A-Za-z0-9_]")

# Maps each column to its BigQuery parameter type. Hardcoded from the known
# table schema so query compilation stays offline — no BigQuery round-trip
# needed just to parameterize a filter.
COLUMN_BQ_TYPES: dict[str, str] = {
    "mdrm": "STRING",
    "data_type": "STRING",
    "int_data": "FLOAT64",
    "float_data": "FLOAT64",
    "bool_data": "FLOAT64",
    "str_data": "INT64",
    "rssd_id": "INT64",
    "reporting_period": "STRING",
    "#ID_RSSD": "INT64",
    "NM_LGL": "STRING",
    "ENTITY_TYPE": "STRING",
    "CNTRY_NM": "STRING",
    "STATE_ABBR_NM": "STRING",
    "DOMESTIC_IND": "STRING",
    "mdrm_code": "STRING",
    "short_description": "STRING",
    "schedule_code": "STRING",
    "statement_bucket": "STRING",
    "category": "STRING",
    "subcategory": "STRING",
    "detail": "STRING",
    "risk_type": "STRING",
    "measurement_type": "STRING",
    "sign": "INT64",
    "code_prefix": "STRING",
    "report_form_scope": "STRING",
    "is_common_kpi_driver": "STRING",
    "source_basis": "STRING",
    "classification_status": "STRING",
    "notes": "STRING",
}


def _quote_ident(name: str) -> str:
    """Backtick-quote a BigQuery identifier. Column must be on the allowlist —
    we still defensively reject embedded backticks to prevent escape tricks."""
    if "`" in name:
        raise ValueError(f"Invalid identifier: {name!r}")
    return f"`{name}`"


def _param_name(column: str, suffix: str = "") -> str:
    """Build a BigQuery parameter name from a column. `#ID_RSSD` -> `_ID_RSSD`."""
    base = _PARAM_RE.sub("_", column).strip("_") or "col"
    return f"p_{base}{suffix}"


@dataclass
class FFIECBigQueryService:
    project: str = PROJECT

    @cached_property
    def client(self) -> bigquery.Client:
        return bigquery.Client(project=self.project)

    @cached_property
    def table(self) -> bigquery.Table:
        return self.client.get_table(FULL_TABLE_ID)

    @cached_property
    def schema(self) -> list[tuple[str, str]]:
        return [(f.name, f.field_type) for f in self.table.schema]

    def compile_query(
        self,
        dimensions: list[str],
        measures: list[dict[str, Any]],
        filters: dict[str, list[Any]] | None = None,
        order_by: list[dict[str, str]] | None = None,
        limit: int = 10_000,
    ) -> tuple[str, list[bigquery.ArrayQueryParameter]]:
        """Compile a declarative spec into a parameterized BigQuery SQL query."""
        if not dimensions and not measures:
            raise ValueError("Query must have at least one dimension or measure.")

        for d in dimensions:
            if d not in DIMENSION_COLUMNS:
                raise ValueError(f"Disallowed dimension: {d!r}")

        select_parts = [_quote_ident(d) for d in dimensions]
        measure_aliases: set[str] = set()

        for m in measures:
            col = m.get("column")
            agg = m.get("agg")
            if agg not in AGG_TEMPLATES:
                raise ValueError(f"Disallowed aggregation: {agg!r}")
            if col not in MEASURE_COLUMNS:
                raise ValueError(f"Disallowed measure column: {col!r}")
            alias = m.get("alias") or f"{agg}_{col}"
            alias = alias.replace("#", "_")
            if not _ALIAS_RE.match(alias):
                raise ValueError(f"Invalid measure alias: {alias!r}")
            if alias in measure_aliases:
                raise ValueError(f"Duplicate measure alias: {alias!r}")
            measure_aliases.add(alias)
            expr = AGG_TEMPLATES[agg].format(col=_quote_ident(col))
            select_parts.append(f"{expr} AS {_quote_ident(alias)}")

        where_clauses: list[str] = []
        params: list[bigquery.ArrayQueryParameter] = []
        for col, vals in (filters or {}).items():
            if col not in DIMENSION_COLUMNS:
                raise ValueError(f"Disallowed filter column: {col!r}")
            if not isinstance(vals, list) or not vals:
                continue
            pname = _param_name(col)
            bq_type = COLUMN_BQ_TYPES.get(col, "STRING")
            where_clauses.append(f"{_quote_ident(col)} IN UNNEST(@{pname})")
            params.append(bigquery.ArrayQueryParameter(pname, bq_type, vals))

        order_clauses: list[str] = []
        for ob in order_by or []:
            col = ob.get("column")
            direction = (ob.get("direction") or "ASC").upper()
            if direction not in {"ASC", "DESC"}:
                raise ValueError(f"Invalid order direction: {direction!r}")
            if col in measure_aliases:
                order_clauses.append(f"{_quote_ident(col)} {direction}")
            elif col in DIMENSION_COLUMNS and col in dimensions:
                order_clauses.append(f"{_quote_ident(col)} {direction}")
            else:
                raise ValueError(f"Cannot order by {col!r} (not in SELECT)")

        if not isinstance(limit, int) or limit < 1 or limit > 200_000:
            raise ValueError("limit must be an integer in [1, 200_000]")

        sql_lines = [
            f"SELECT {', '.join(select_parts)}",
            f"  FROM `{FULL_TABLE_ID}`",
        ]
        if where_clauses:
            sql_lines.append(f" WHERE {' AND '.join(where_clauses)}")
        if dimensions:
            sql_lines.append(
                f" GROUP BY {', '.join(_quote_ident(d) for d in dimensions)}"
            )
        if order_clauses:
            sql_lines.append(f" ORDER BY {', '.join(order_clauses)}")
        sql_lines.append(f" LIMIT {int(limit)}")
        return "\n".join(sql_lines), params

    def run_query(
        self,
        dimensions: list[str],
        measures: list[dict[str, Any]],
        filters: dict[str, list[Any]] | None = None,
        order_by: list[dict[str, str]] | None = None,
        limit: int = 10_000,
    ) -> dict[str, Any]:
        """Compile + execute. Returns {sql, rows, row_count, bytes_processed}."""
        sql, params = self.compile_query(
            dimensions=dimensions,
            measures=measures,
            filters=filters,
            order_by=order_by,
            limit=limit,
        )
        job = self.client.query(
            sql,
            job_config=bigquery.QueryJobConfig(query_parameters=params),
        )
        result = job.result()
        rows = [dict(r) for r in result]
        return {
            "sql": sql,
            "rows": rows,
            "row_count": len(rows),
            "bytes_processed": job.total_bytes_processed or 0,
        }

    def distinct_values(
        self,
        column: str,
        filters: dict[str, list[Any]] | None = None,
        limit: int = 50_000,
    ) -> list[Any]:
        """Distinct values for a single column, optionally scoped by filters.
        Used to populate dependent dropdowns in the filter sidebar."""
        if column not in DIMENSION_COLUMNS:
            raise ValueError(f"Disallowed column: {column!r}")
        quoted = _quote_ident(column)
        where_clauses: list[str] = [f"{quoted} IS NOT NULL"]
        params: list[bigquery.ArrayQueryParameter] = []
        for col, vals in (filters or {}).items():
            if col == column:
                continue
            if col not in DIMENSION_COLUMNS:
                raise ValueError(f"Disallowed filter column: {col!r}")
            if not isinstance(vals, list) or not vals:
                continue
            pname = _param_name(col)
            bq_type = COLUMN_BQ_TYPES.get(col, "STRING")
            where_clauses.append(f"{_quote_ident(col)} IN UNNEST(@{pname})")
            params.append(bigquery.ArrayQueryParameter(pname, bq_type, vals))
        sql = (
            f"SELECT DISTINCT {quoted} AS v\n"
            f"  FROM `{FULL_TABLE_ID}`\n"
            f" WHERE {' AND '.join(where_clauses)}\n"
            f" ORDER BY v\n"
            f" LIMIT {int(limit)}"
        )
        job = self.client.query(
            sql,
            job_config=bigquery.QueryJobConfig(query_parameters=params),
        )
        return [r["v"] for r in job.result()]


@lru_cache(maxsize=1)
def get_ffiec_bq_service() -> FFIECBigQueryService:
    return FFIECBigQueryService()
