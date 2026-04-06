# Repeated Place Names in the United States

An interactive static website that maps and ranks repeated place names across U.S. Census TIGER/Line PLACE boundaries.

Live site after deployment: [https://nguyentlucas.github.io/usa_city_names/](https://nguyentlucas.github.io/usa_city_names/)

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

The preprocessing pipeline starts directly from `working_data/tl_2025_*_place.zip` files. It programmatically extracts each shapefile bundle to a temporary directory, reads all Census `PLACE` records, merges all states and territories, normalizes names for case-insensitive matching, and writes web-ready JSON assets to `public/data/`.

Name matching is exact after light normalization:

- trim leading and trailing whitespace
- compare case-insensitively for search and counting
- preserve cleaned display names for the UI

Generated assets:

- `public/data/name_frequency.json`
- `public/data/name_lookup.json`
- `public/data/metadata.json`

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

The site now includes all Census places, including incorporated places and census-designated places, while keeping the same frontend data shape.
