# Frontend — County Map MVP

React + Vite + TypeScript. Renders a U.S. county-level choropleth from data
served by the FastAPI backend.

## Setup

```bash
cd frontend
npm install
```

## Run

```bash
# Make sure the backend is running on http://localhost:8000 first.
npm run dev
```

Open http://localhost:5173.

## Configuration

Optional `frontend/.env.local`:

```bash
# Point at a non-default backend
VITE_API_URL=http://localhost:8000

# Use a locally-vendored TopoJSON instead of the CDN (see public/counties.README.md)
VITE_COUNTY_TOPOJSON_URL=/counties-10m.json
```

## Where things live

```
src/
  api/client.ts                 # centralized fetch wrapper
  components/
    CountyMap.tsx               # react-simple-maps choropleth, color scale, hover
    Filters.tsx                 # state / year / metric selectors + ingest button
    CountyTooltip.tsx           # hover detail panel
    Layout.tsx                  # page shell
  types/county.ts               # shared types — keep in sync with backend schemas
  App.tsx                       # state owner; fetches metadata + counties
  main.tsx                      # entry
  styles/global.css             # base styles
public/
  counties.README.md            # how to vendor the TopoJSON locally
```

## Mapping library

[react-simple-maps](https://www.react-simple-maps.io/) renders TopoJSON via
d3-geo with a small surface area, which keeps the MVP simple. For richer
interactions (zoom, panning, layered overlays) consider deck.gl or Mapbox
later — at that point the swap is a `CountyMap.tsx` rewrite, not a
project-wide change.
