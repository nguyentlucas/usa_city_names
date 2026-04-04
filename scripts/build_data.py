#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import tempfile
import zipfile
from pathlib import Path

try:
    import geopandas as gpd
    import pandas as pd
except ModuleNotFoundError as exc:
    raise SystemExit(
        "Missing geospatial dependencies. Create the conda environment first:\n"
        "  conda env create -f environment.yml\n"
        "  conda activate city-names"
    ) from exc


VALID_CLASSFP = {"C1", "C2", "C3", "C4", "C5"}
NAME_COLUMNS = ["GEOID", "NAME", "CLASSFP", "STATEFP"]
MAP_EXCLUDED_STATE_IDS = {"15", "60", "66", "69", "72", "78"}
STATE_INFO = {
    "01": {"abbr": "AL", "name": "Alabama"},
    "02": {"abbr": "AK", "name": "Alaska"},
    "04": {"abbr": "AZ", "name": "Arizona"},
    "05": {"abbr": "AR", "name": "Arkansas"},
    "06": {"abbr": "CA", "name": "California"},
    "08": {"abbr": "CO", "name": "Colorado"},
    "09": {"abbr": "CT", "name": "Connecticut"},
    "10": {"abbr": "DE", "name": "Delaware"},
    "11": {"abbr": "DC", "name": "District of Columbia"},
    "12": {"abbr": "FL", "name": "Florida"},
    "13": {"abbr": "GA", "name": "Georgia"},
    "15": {"abbr": "HI", "name": "Hawaii"},
    "16": {"abbr": "ID", "name": "Idaho"},
    "17": {"abbr": "IL", "name": "Illinois"},
    "18": {"abbr": "IN", "name": "Indiana"},
    "19": {"abbr": "IA", "name": "Iowa"},
    "20": {"abbr": "KS", "name": "Kansas"},
    "21": {"abbr": "KY", "name": "Kentucky"},
    "22": {"abbr": "LA", "name": "Louisiana"},
    "23": {"abbr": "ME", "name": "Maine"},
    "24": {"abbr": "MD", "name": "Maryland"},
    "25": {"abbr": "MA", "name": "Massachusetts"},
    "26": {"abbr": "MI", "name": "Michigan"},
    "27": {"abbr": "MN", "name": "Minnesota"},
    "28": {"abbr": "MS", "name": "Mississippi"},
    "29": {"abbr": "MO", "name": "Missouri"},
    "30": {"abbr": "MT", "name": "Montana"},
    "31": {"abbr": "NE", "name": "Nebraska"},
    "32": {"abbr": "NV", "name": "Nevada"},
    "33": {"abbr": "NH", "name": "New Hampshire"},
    "34": {"abbr": "NJ", "name": "New Jersey"},
    "35": {"abbr": "NM", "name": "New Mexico"},
    "36": {"abbr": "NY", "name": "New York"},
    "37": {"abbr": "NC", "name": "North Carolina"},
    "38": {"abbr": "ND", "name": "North Dakota"},
    "39": {"abbr": "OH", "name": "Ohio"},
    "40": {"abbr": "OK", "name": "Oklahoma"},
    "41": {"abbr": "OR", "name": "Oregon"},
    "42": {"abbr": "PA", "name": "Pennsylvania"},
    "44": {"abbr": "RI", "name": "Rhode Island"},
    "45": {"abbr": "SC", "name": "South Carolina"},
    "46": {"abbr": "SD", "name": "South Dakota"},
    "47": {"abbr": "TN", "name": "Tennessee"},
    "48": {"abbr": "TX", "name": "Texas"},
    "49": {"abbr": "UT", "name": "Utah"},
    "50": {"abbr": "VT", "name": "Vermont"},
    "51": {"abbr": "VA", "name": "Virginia"},
    "53": {"abbr": "WA", "name": "Washington"},
    "54": {"abbr": "WV", "name": "West Virginia"},
    "55": {"abbr": "WI", "name": "Wisconsin"},
    "56": {"abbr": "WY", "name": "Wyoming"},
    "60": {"abbr": "AS", "name": "American Samoa"},
    "66": {"abbr": "GU", "name": "Guam"},
    "69": {"abbr": "MP", "name": "Northern Mariana Islands"},
    "72": {"abbr": "PR", "name": "Puerto Rico"},
    "78": {"abbr": "VI", "name": "U.S. Virgin Islands"},
}


def normalize_name(value: str) -> str:
    return value.strip().casefold()


def clean_display_name(value: str) -> str:
    return value.strip()


def choose_display_name(names: pd.Series) -> str:
    counts = names.value_counts()
    return sorted(counts[counts == counts.max()].index)[0]


def load_place_zip(zip_path: Path) -> gpd.GeoDataFrame:
    with tempfile.TemporaryDirectory(prefix="city_names_") as temp_dir:
        extract_dir = Path(temp_dir) / zip_path.stem
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(extract_dir)

        shapefile_path = next(extract_dir.glob("*.shp"))
        gdf = gpd.read_file(shapefile_path, columns=NAME_COLUMNS)

    missing = [column for column in NAME_COLUMNS if column not in gdf.columns]
    if missing:
        raise ValueError(f"{zip_path.name} is missing expected columns: {missing}")

    match = re.search(r"tl_2025_(\d{2})_place$", zip_path.stem)
    if not match:
        raise ValueError(f"Could not parse state code from {zip_path.name}")

    state_code = match.group(1)
    state_meta = STATE_INFO.get(state_code)
    if state_meta is None:
        raise ValueError(f"Unknown state code in {zip_path.name}: {state_code}")

    gdf = gdf.loc[gdf["CLASSFP"].isin(VALID_CLASSFP), NAME_COLUMNS].copy()
    if gdf.empty:
        gdf["display_name"] = pd.Series(dtype="string")
        gdf["normalized_name"] = pd.Series(dtype="string")
        gdf["state_abbr"] = pd.Series(dtype="string")
        gdf["state_name"] = pd.Series(dtype="string")
        return gdf

    gdf["display_name"] = gdf["NAME"].map(clean_display_name)
    gdf["normalized_name"] = gdf["display_name"].map(normalize_name)
    gdf["state_abbr"] = state_meta["abbr"]
    gdf["state_name"] = state_meta["name"]
    return gdf


def build_name_assets(df: pd.DataFrame, output_dir: Path) -> None:
    summaries = []
    lookup = {}

    grouped = df.groupby("normalized_name", sort=False)
    for normalized_name, group in grouped:
        places = group.sort_values(["state_name", "display_name", "GEOID"])
        state_ids = sorted(places["STATEFP"].unique().tolist())
        mapped_state_ids = [state_id for state_id in state_ids if state_id not in MAP_EXCLUDED_STATE_IDS]

        record = {
            "normalizedName": normalized_name,
            "displayName": choose_display_name(places["display_name"]),
            "count": int(len(places)),
            "stateCount": int(len(state_ids)),
            "stateIds": state_ids,
            "mappedStateIds": mapped_state_ids,
            "stateNames": [STATE_INFO[state_id]["name"] for state_id in state_ids],
            "mappedStateNames": [STATE_INFO[state_id]["name"] for state_id in mapped_state_ids],
        }
        summaries.append(record)

    summaries.sort(key=lambda item: (-item["count"], item["displayName"], item["normalizedName"]))

    for index, record in enumerate(summaries, start=1):
        record["rank"] = index
        lookup[record["normalizedName"]] = index - 1

    (output_dir / "name_frequency.json").write_text(
        json.dumps(summaries, indent=2),
        encoding="utf-8",
    )
    (output_dir / "name_lookup.json").write_text(
        json.dumps(lookup, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build ranked incorporated place-name assets from TIGER/Line PLACE zip bundles."
    )
    parser.add_argument(
        "--input-dir",
        default="working_data",
        type=Path,
        help="Directory containing tl_2025_*_place.zip files.",
    )
    parser.add_argument(
        "--output-dir",
        default="public/data",
        type=Path,
        help="Directory for generated JSON assets.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    zip_paths = sorted(args.input_dir.glob("tl_2025_*_place.zip"))
    if not zip_paths:
        raise SystemExit(f"No input zips found in {args.input_dir}")

    frames = [load_place_zip(path) for path in zip_paths]
    combined = pd.concat(frames, ignore_index=True)
    combined = combined.loc[combined["normalized_name"] != ""].copy()
    combined = combined.sort_values(
        ["normalized_name", "state_abbr", "display_name", "GEOID"]
    ).reset_index(drop=True)

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    build_name_assets(combined, output_dir)

    for stale_name in ("places.topo.json", "top_names.json"):
        stale_path = output_dir / stale_name
        if stale_path.exists():
            stale_path.unlink()

    metadata = {
        "source": "U.S. Census TIGER/Line PLACE shapefiles",
        "year": 2025,
        "includedClassfp": sorted(VALID_CLASSFP),
        "placeCount": int(len(combined)),
        "nameCount": int(combined["normalized_name"].nunique()),
        "stateCount": int(combined["STATEFP"].nunique()),
        "mappedStateCount": int(
            combined.loc[~combined["STATEFP"].isin(MAP_EXCLUDED_STATE_IDS), "STATEFP"].nunique()
        ),
        "defaultFocusedName": "Franklin",
        "excludedMapStateIds": sorted(MAP_EXCLUDED_STATE_IDS),
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )

    print(
        f"Built assets in {output_dir}: "
        f"{metadata['placeCount']} incorporated places, "
        f"{metadata['nameCount']} distinct names."
    )


if __name__ == "__main__":
    main()
