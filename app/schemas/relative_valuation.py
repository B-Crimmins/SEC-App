"""
Schemas for the Relative Valuation endpoint.

The output is mostly a free-form dict (multiples / peers / attribution
rows are denormalized for the UI). We validate the request strictly but
keep the response as Dict[str, Any] in the route handler so the service
can evolve without a Pydantic round-trip for every field.
"""

from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field


class RelativeValuationRequest(BaseModel):
    ticker: str = Field(..., description="Target ticker — the company being valued")
    override_peers: Optional[List[str]] = Field(
        default=None,
        description="Explicit peer list. If omitted, peers are suggested by SIC industry.",
    )
    dcf_per_share: Optional[float] = Field(
        default=None,
        description="DCF intrinsic per-share from the user's Fundamentals/DCF tab. "
                    "Surfaced in the reconciliation card side-by-side with the "
                    "peer-multiple-implied value.",
    )
