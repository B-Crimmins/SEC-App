"""
FFIEC Parquet query service.

Queries the `full_dat` Parquet object in the `ffiec_data` GCS bucket using
pyarrow's Dataset API over gcsfs. Column projection and predicate pushdown
mean only requested columns + matching row groups are pulled from GCS — the
full file is never materialized locally, so storage and bandwidth stay flat
regardless of dataset size.

Auth uses Application Default Credentials:
  - Dev: `gcloud auth application-default login`
  - Or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path.

Two entry points:
  1. Import `FFIECQueryService` and call `.query(...)` from FastAPI handlers.
  2. Run `python -m app.services.ffiec_query` for an interactive REPL shell.
"""

from __future__ import annotations

import cmd
import os
import shlex
from dataclasses import dataclass, field
from functools import cached_property
from typing import Any, Iterator

import gcsfs
import pandas as pd
import pyarrow.compute as pc
import pyarrow.dataset as ds


DEFAULT_PROJECT = "tcrimmins"
DEFAULT_BUCKET = "ffiec_data"
DEFAULT_OBJECT = "ffiec_data.parquet"

# Tuple-form filter operators: filters={"col": (">=", 100)}
_OPS = {
    "=":  lambda f, v: f == v,
    "==": lambda f, v: f == v,
    "!=": lambda f, v: f != v,
    ">":  lambda f, v: f > v,
    ">=": lambda f, v: f >= v,
    "<":  lambda f, v: f < v,
    "<=": lambda f, v: f <= v,
    "in": lambda f, v: f.isin(list(v)),
}


@dataclass
class FFIECQueryService:
    project: str = DEFAULT_PROJECT
    bucket: str = DEFAULT_BUCKET
    object_key: str = DEFAULT_OBJECT
    credentials_path: str | None = None
    _fs: gcsfs.GCSFileSystem | None = field(default=None, init=False, repr=False)

    @property
    def fs(self) -> gcsfs.GCSFileSystem:
        if self._fs is None:
            # Resolution order: explicit constructor arg > GOOGLE_APPLICATION_CREDENTIALS
            # env var > ADC from `gcloud auth application-default login`. Without a
            # valid source gcsfs silently falls back to anonymous and 401s.
            token = (
                self.credentials_path
                or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
                or "google_default"
            )
            self._fs = gcsfs.GCSFileSystem(project=self.project, token=token)
        return self._fs

    @property
    def path(self) -> str:
        return f"{self.bucket}/{self.object_key}"

    @cached_property
    def _dataset(self) -> ds.Dataset:
        return ds.dataset(self.path, filesystem=self.fs, format="parquet")

    @cached_property
    def schema(self) -> list[tuple[str, str]]:
        return [(f.name, str(f.type)) for f in self._dataset.schema]

    @cached_property
    def _columns(self) -> set[str]:
        return {name for name, _ in self.schema}

    def _build_filter(self, filters: dict[str, Any] | None) -> pc.Expression | None:
        if not filters:
            return None
        expr: pc.Expression | None = None
        for col, val in filters.items():
            if col not in self._columns:
                raise ValueError(f"Unknown filter column: {col!r}")
            f = pc.field(col)
            if isinstance(val, tuple) and len(val) == 2 and val[0] in _OPS:
                sub = _OPS[val[0]](f, val[1])
            elif isinstance(val, (list, set)):
                sub = f.isin(list(val))
            else:
                sub = f == val
            expr = sub if expr is None else expr & sub
        return expr

    def query(
        self,
        columns: list[str] | None = None,
        filters: dict[str, Any] | None = None,
        limit: int | None = 1000,
    ) -> pd.DataFrame:
        """Pull a filtered slice into memory as a pandas DataFrame.

        `columns` and `filters` both push down into the Parquet reader: only
        matching row groups are fetched from GCS, and only the requested
        columns are decoded.
        """
        if columns:
            unknown = [c for c in columns if c not in self._columns]
            if unknown:
                raise ValueError(f"Unknown columns: {unknown}")
        expr = self._build_filter(filters)
        scanner = self._dataset.scanner(columns=columns, filter=expr)
        table = scanner.head(limit) if limit else scanner.to_table()
        return table.to_pandas()

    def iter_batches(
        self,
        columns: list[str] | None = None,
        filters: dict[str, Any] | None = None,
        batch_size: int = 10_000,
    ) -> Iterator[pd.DataFrame]:
        """Stream results one batch at a time — use when the filtered slice
        itself is too large to materialize (e.g. multi-million-row exports).
        """
        if columns:
            unknown = [c for c in columns if c not in self._columns]
            if unknown:
                raise ValueError(f"Unknown columns: {unknown}")
        expr = self._build_filter(filters)
        scanner = self._dataset.scanner(
            columns=columns,
            filter=expr,
            batch_size=batch_size,
        )
        for batch in scanner.to_batches():
            yield batch.to_pandas()

    def count(self, filters: dict[str, Any] | None = None) -> int:
        expr = self._build_filter(filters)
        return self._dataset.count_rows(filter=expr)


# ---- Interactive REPL ---------------------------------------------------

class _Shell(cmd.Cmd):
    intro = (
        "FFIEC Parquet query shell.\n"
        "  schema                              list columns and types\n"
        "  q col1,col2 key=val ... limit=N     run a filtered query\n"
        "  count key=val ...                   count matching rows\n"
        "  exit                                quit\n"
    )
    prompt = "ffiec> "

    def __init__(self, svc: FFIECQueryService):
        super().__init__()
        self.svc = svc

    def do_schema(self, _arg: str):
        for name, typ in self.svc.schema:
            print(f"  {name}: {typ}")

    def do_q(self, arg: str):
        cols, filters, limit = _parse_query_args(arg, default_limit=100)
        try:
            df = self.svc.query(columns=cols, filters=filters, limit=limit)
        except Exception as e:
            print(f"error: {e}")
            return
        if df.empty:
            print("(no rows)")
            return
        with pd.option_context(
            "display.max_rows", 200,
            "display.max_columns", None,
            "display.width", 200,
        ):
            print(df)

    def do_count(self, arg: str):
        _, filters, _ = _parse_query_args(arg, default_limit=None)
        try:
            print(self.svc.count(filters=filters))
        except Exception as e:
            print(f"error: {e}")

    def do_exit(self, _arg: str):
        return True

    do_EOF = do_exit
    do_quit = do_exit


def _parse_query_args(
    arg: str, default_limit: int | None
) -> tuple[list[str] | None, dict[str, Any], int | None]:
    cols: list[str] | None = None
    filters: dict[str, Any] = {}
    limit = default_limit
    for token in shlex.split(arg):
        if "=" in token:
            k, v = token.split("=", 1)
            if k == "limit":
                limit = int(v) if v.lower() != "none" else None
            else:
                filters[k] = _coerce(v)
        else:
            cols = [c.strip() for c in token.split(",") if c.strip()]
    return cols, filters, limit


def _coerce(v: str) -> Any:
    low = v.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    if low == "null" or low == "none":
        return None
    if v.startswith("[") and v.endswith("]"):
        return [_coerce(x.strip()) for x in v[1:-1].split(",") if x.strip()]
    try:
        return int(v)
    except ValueError:
        try:
            return float(v)
        except ValueError:
            return v


def _cli():
    try:
        _Shell(FFIECQueryService()).cmdloop()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    _cli()
