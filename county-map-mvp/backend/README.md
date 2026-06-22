# Backend — County Map MVP

FastAPI service that ingests TotalView-style JSON reports and serves
county-level aggregations to the frontend map.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
# from backend/
uvicorn app.main:app --reload --port 8000
```

The API is then at `http://localhost:8000` and interactive docs at
`http://localhost:8000/docs`.

## Tests

```bash
# from backend/
pytest
```

## Endpoints

| Method | Path                  | Purpose                                                  |
|--------|-----------------------|----------------------------------------------------------|
| GET    | `/health`             | Liveness probe                                           |
| GET    | `/api/data/counties`  | County-level records, optional `state`/`year`/`metric` filters |
| GET    | `/api/data/metadata`  | Available states / years / metrics / file status         |
| POST   | `/api/data/ingest`    | Read a raw JSON file, aggregate, write processed output  |

### Ingest a JSON file

1. Drop your file in `backend/app/data/raw/`. Example:

   ```bash
   cp ../../mock_totalview_reports.json backend/app/data/raw/
   ```

2. Call ingest. Defaults to `mock_totalview_reports.json`:

   ```bash
   curl -X POST http://localhost:8000/api/data/ingest \
        -H 'Content-Type: application/json' \
        -d '{}'
   # or for a custom filename:
   curl -X POST http://localhost:8000/api/data/ingest \
        -H 'Content-Type: application/json' \
        -d '{"filename": "my_other_file.json"}'
   ```

The result is written to `backend/app/data/processed/county_data.json` and
becomes the active dataset returned by `/api/data/counties`.

## Expected JSON schema

The ingester is loose by design — only a couple of fields are required.

```jsonc
{
  "Reports": [
    {
      "Data": {
        "SubjectProperty": {
          "SitusAddress": {
            "State": "TX",            // required, USPS 2-letter
            "County": "HARRIS"        // required, county name
          }
        },
        "LastMarketSaleInformation": {
          "SaleDate": "2017-06-01T00:00:00",  // year used for the year bucket
          "SalePrice": 500000                 // optional
        },
        "LegalAndVestingData": {
          "EstimatedValueLow":  400000,       // optional
          "EstimatedValueHigh": 600000        // optional
        },
        "LienSummary": {
          "HOALien":         { "LienOnProperty": false },
          "InvoluntaryLien": { "LienOnProperty": true }
        }
      }
    }
  ]
}
```

Records grouped by `(state, county, sale_year)`. The county is joined to a
5-digit FIPS code via `app/utils/fips.py`. **That lookup currently only knows
the 10 counties in the sample data** — to support more, replace it with a
full Census-derived table.

## Layout

```
backend/
  app/
    main.py                # FastAPI app + CORS
    api/routes/
      health.py            # GET /health
      data.py              # /api/data/* (counties, metadata, ingest)
    schemas/county_data.py # Pydantic models (requests + responses)
    services/
      ingestion_service.py # raw reports -> county-level aggregations
      file_service.py      # raw/processed JSON I/O  <-- swap this for a DB later
    utils/
      validators.py        # JSON shape checks
      fips.py              # (state, county) -> FIPS lookup
    data/
      raw/                 # drop incoming JSON here
      processed/           # ingest output (county_data.json)
      sample_county_data.json  # bundled fallback so the app runs immediately
  tests/
```

## Future database integration

`services/file_service.py` is the swap point. Replace `load_county_data` /
`save_processed` with DB queries (e.g. SQLAlchemy session + a `counties`
table keyed on `county_fips, year`) and the routes don't need to change.
