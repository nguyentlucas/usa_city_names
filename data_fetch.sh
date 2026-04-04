#!/usr/bin/env bash

set -euo pipefail

BASE_URL="https://www2.census.gov/geo/tiger/TIGER2025/PLACE/"
OUTDIR="./working_data"

mkdir -p "${OUTDIR}"
cd "${OUTDIR}"

echo "Downloading TIGER 2025 PLACE files..."

# Fetch directory listing and extract zip filenames
curl -s "${BASE_URL}/" \
  | grep -oE 'tl_2025_[0-9]{2}_place\.zip' \
  | sort -u \
  | while read -r file; do
      echo "Downloading ${file}..."
      curl -fL --retry 5 --retry-delay 2 -O "${BASE_URL}/${file}"
    done

echo "All downloads complete."