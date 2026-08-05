# County boundary data

By default the frontend loads U.S. county TopoJSON from the public CDN:

```
https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json
```

This works out of the box for local development. If you want the app to run
without network access (or to pin a version), vendor the file here:

```bash
curl -L -o frontend/public/counties-10m.json \
  https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json
```

Then set the override before running `npm run dev`:

```bash
echo 'VITE_COUNTY_TOPOJSON_URL=/counties-10m.json' > frontend/.env.local
```

The file is ~600 KB. It is intentionally NOT checked in so the repo stays small.

## Format

A TopoJSON file with a `counties` object whose features have numeric `id`
fields equal to the county FIPS code. The map joins records to features by
zero-padding `geo.id` to 5 digits.
