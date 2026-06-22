from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import data as data_routes
from app.api.routes import health as health_routes
from app.services import file_service


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Make sure raw/ and processed/ exist on first run.
    file_service.ensure_dirs()
    yield


app = FastAPI(
    title="County Map MVP API",
    version="0.1.0",
    description="Ingests TotalView-style JSON and serves county-level aggregations.",
    lifespan=lifespan,
)

# Permissive CORS for local development. Lock this down before any deploy.
_dev_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _dev_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_routes.router)
app.include_router(data_routes.router, prefix="/api")
