# Repeated Incorporated Place Names in the United States

An interactive static website that maps and ranks repeated incorporated place names across U.S. Census TIGER/Line PLACE boundaries.

Live site after deployment: [https://<your-github-username>.github.io/<your-repo-name>/](https://<your-github-username>.github.io/<your-repo-name>/)

## Local setup

Create the geospatial environment:

```bash
conda env create -f environment.yml
conda activate city-names
```

Install frontend dependencies:

```bash
npm install
```

Run the data build from the local TIGER zip bundles in `working_data/`:

```bash
python3 scripts/build_data.py
```

Start the local dev server:

```bash
npm run dev
```

## Data build

The preprocessing pipeline starts directly from `working_data/tl_2025_*_place.zip` files. It programmatically extracts each shapefile bundle to a temporary directory, reads the geometries, merges all states and territories, filters to incorporated places only, simplifies geometry for the browser, and writes web-ready assets to `public/data/`.

Included `CLASSFP` values:

- `C1`
- `C2`
- `C3`
- `C4`
- `C5`

Excluded non-incorporated examples:

- `U1`

Name matching is exact after light normalization:

- trim leading and trailing whitespace
- compare case-insensitively for search and counting
- preserve cleaned display names for the UI

Generated assets:

- `public/data/places.topo.json`
- `public/data/name_frequency.json`
- `public/data/top_names.json`
- `public/data/name_lookup.json`
- `public/data/metadata.json`

Optional build flags:

```bash
python3 scripts/build_data.py --simplify-tolerance 250 --top-n 40
```

## Project structure

```text
city_names/
├── README.md
├── environment.yml
├── package.json
├── vite.config.js
├── index.html
├── public/
│   └── data/
├── scripts/
│   └── build_data.py
├── src/
│   ├── main.js
│   └── styles.css
└── working_data/
```

## Deployment to GitHub Pages

This project is GitHub Pages compatible because the site is fully static.

1. Run the data build locally so `public/data/*.json` exists.
2. Commit the generated `public/data` assets.
3. Push the repository to GitHub.
4. In GitHub, enable Pages with GitHub Actions as the source.
5. Add the workflow below or keep the provided one if present.

Example workflow:

```yaml
name: Deploy Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm install
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    needs: build
    runs-on: ubuntu-latest
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Notes

Source data: U.S. Census TIGER/Line PLACE shapefiles.

Analysis in the site is restricted to incorporated places only, using `CLASSFP` values `C1` through `C5`.
