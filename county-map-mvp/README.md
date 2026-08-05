# County Map MVP

A minimal full-stack starter that ingests TotalView-style JSON property reports
and renders a U.S. county-level choropleth map.

```
county-map-mvp/
├── backend/      # FastAPI service (ingest + serve aggregated county data)
└── frontend/     # React + Vite + TypeScript map UI
```

No database, no auth, no deployment — just enough to load real data into a
county map and click around.

## Quick start

Two terminals.

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend is at http://localhost:8000, docs at http://localhost:8000/docs.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App is at http://127.0.0.1:5173.

> If `localhost:5173` shows "can't be found", use `127.0.0.1:5173` instead —
> some shell/OS combos resolve `localhost` to IPv6 first. It will display the bundled sample data
(10 counties derived from `mock_totalview_reports.json`) until you ingest
your own file.

## Ingesting your own JSON

The app loads in this priority order:

1. `backend/app/data/processed/county_data.json` (produced by ingest)
2. `backend/app/data/sample_county_data.json` (bundled fallback)

To replace the sample with real data:

```bash
# Drop your TotalView JSON into the raw/ folder.
cp /path/to/mock_totalview_reports.json backend/app/data/raw/

# Either click "Ingest raw JSON" in the UI, or curl:
curl -X POST http://localhost:8000/api/data/ingest \
     -H 'Content-Type: application/json' -d '{}'
```

Or call with a custom filename:

```bash
curl -X POST http://localhost:8000/api/data/ingest \
     -H 'Content-Type: application/json' \
     -d '{"filename": "my_file.json"}'
```

The processed county-level result is written to
`backend/app/data/processed/county_data.json`. Delete that file to fall back
to the bundled sample.

## Where to put real data

| What                          | Path                                                |
|-------------------------------|-----------------------------------------------------|
| Raw TotalView JSON to ingest  | `backend/app/data/raw/`                             |
| Aggregated output             | `backend/app/data/processed/` (auto-written)        |
| Bundled fallback              | `backend/app/data/sample_county_data.json`          |

## Expected JSON schema

See [backend/README.md](backend/README.md) for the full schema. Minimum
required per report:

```jsonc
{
  "Reports": [
    {
      "Data": {
        "SubjectProperty": {
          "SitusAddress": { "State": "TX", "County": "HARRIS" }
        }
      }
    }
  ]
}
```

Optional fields the aggregator uses if present:
`Data.LastMarketSaleInformation.SaleDate`,
`Data.LastMarketSaleInformation.SalePrice`,
`Data.LegalAndVestingData.EstimatedValueLow` / `EstimatedValueHigh`,
`Data.LienSummary.HOALien.LienOnProperty`,
`Data.LienSummary.InvoluntaryLien.LienOnProperty`.

## API surface

| Method | Path                  |
|--------|-----------------------|
| GET    | `/health`             |
| GET    | `/api/data/counties`  |
| GET    | `/api/data/metadata`  |
| POST   | `/api/data/ingest`    |

See [backend/README.md](backend/README.md#endpoints).

## County boundaries (TopoJSON)

The frontend pulls U.S. county TopoJSON from the jsdelivr CDN by default. To
vendor it locally (offline use, pinning), see
[frontend/public/counties.README.md](frontend/public/counties.README.md).

## Important caveats

- **FIPS lookup is intentionally tiny.** `backend/app/utils/fips.py` only
  knows the 10 counties in the sample data. Any (state, county) pair not in
  that table is silently dropped at ingest time. Replace with a complete
  Census-derived table when you ingest broader data.
- **No persistence beyond JSON files.** When you outgrow this, replace
  `backend/app/services/file_service.py` — that module is the seam.
- **CORS is permissive for localhost.** Lock down before any deploy.

## Next logical steps

1. Expand `backend/app/utils/fips.py` to a complete national lookup (load from
   a CSV/JSON at startup).
2. Add a SQLite or Postgres backing store: swap `file_service.load_county_data`
   / `save_processed` for queries, keep the routes unchanged.
3. Vendor the county TopoJSON to `frontend/public/` for offline use.
4. Add a legend, color-scale controls, and a numeric metric formatter.
5. Add basic auth and lock down CORS before exposing the backend.

## Tests

```bash
cd backend
source .venv/bin/activate
pytest
```
