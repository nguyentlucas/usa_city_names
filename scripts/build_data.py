#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

try:
    import geopandas as gpd
    import pandas as pd
    from shapely import make_valid
except ModuleNotFoundError as exc:
    raise SystemExit(
        "Missing geospatial dependencies. Create the conda environment first:\n"
        "  conda env create -f environment.yml\n"
        "  conda activate city-names"
    ) from exc


VALID_CLASSFP = {"C1", "C2", "C3", "C4", "C5"}
NAME_COLUMNS = ["GEOID", "NAME", "CLASSFP", "STATEFP"]
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


def safe_make_valid(series):
    try:
        return series.apply(make_valid)
    except Exception:
        return series.buffer(0)


def load_place_zip(zip_path: Path) -> gpd.GeoDataFrame:
    with tempfile.TemporaryDirectory(prefix="city_names_") as temp_dir:
        extract_dir = Path(temp_dir) / zip_path.stem
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(extract_dir)

        shapefile_path = next(extract_dir.glob("*.shp"))
        gdf = gpd.read_file(shapefile_path)
        gdf = gdf.set_crs(4326, allow_override=True)

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

    gdf = gdf.loc[gdf["CLASSFP"].isin(VALID_CLASSFP), NAME_COLUMNS + ["geometry"]].copy()
    if gdf.empty:
        gdf["display_name"] = pd.Series(dtype="string")
        gdf["normalized_name"] = pd.Series(dtype="string")
        gdf["state_abbr"] = pd.Series(dtype="string")
        gdf["state_name"] = pd.Series(dtype="string")
        gdf["place_label"] = pd.Series(dtype="string")
        return gdf

    gdf["display_name"] = gdf["NAME"].map(clean_display_name)
    gdf["normalized_name"] = gdf["display_name"].map(normalize_name)

    gdf["state_abbr"] = state_meta["abbr"]
    gdf["state_name"] = state_meta["name"]
    gdf["place_label"] = gdf["display_name"] + ", " + gdf["state_abbr"]
    return gdf


def build_name_assets(df: gpd.GeoDataFrame, output_dir: Path, top_n: int) -> None:
    summaries = []
    lookup = {}
    grouped = df.groupby("normalized_name", sort=False)

    for normalized_name, group in grouped:
        places = group.sort_values(["state_name", "display_name", "GEOID"])
        record = {
            "normalizedName": normalized_name,
            "displayName": choose_display_name(places["display_name"]),
            "count": int(len(places)),
            "stateCount": int(places["state_abbr"].nunique()),
            "states": sorted(places["state_name"].unique().tolist()),
            "places": [
                {
                    "geoid": row.GEOID,
                    "name": row.display_name,
                    "stateAbbr": row.state_abbr,
                    "stateName": row.state_name,
                    "classfp": row.CLASSFP,
                }
                for row in places.itertuples(index=False)
            ],
        }
        summaries.append(record)
        lookup[normalized_name] = record

    summaries.sort(key=lambda item: (-item["count"], item["displayName"], item["normalizedName"]))
    top_names = summaries[:top_n]

    (output_dir / "name_frequency.json").write_text(
        json.dumps(summaries, indent=2),
        encoding="utf-8",
    )
    (output_dir / "top_names.json").write_text(
        json.dumps(top_names, indent=2),
        encoding="utf-8",
    )
    (output_dir / "name_lookup.json").write_text(
        json.dumps(lookup, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def build_topology(df: gpd.GeoDataFrame, output_dir: Path) -> None:
    topo_df = df[
        [
            "GEOID",
            "NAME",
            "display_name",
            "normalized_name",
            "state_abbr",
            "state_name",
            "CLASSFP",
            "place_label",
            "area_m2",
            "centroid_lon",
            "centroid_lat",
            "geometry",
        ]
    ].copy()

    project_root = Path(__file__).resolve().parents[1]
    geo2topo_bin = project_root / "node_modules" / ".bin" / "geo2topo"
    if not geo2topo_bin.exists():
        raise SystemExit(
            "Missing frontend dependency `geo2topo`. Run `npm install` before building data."
        )

    feature_collection = json.loads(topo_df.to_json(drop_id=True))
    topo_path = output_dir / "places.topo.json"
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".geojson",
        delete=False,
        encoding="utf-8",
    ) as temp_file:
        json.dump(feature_collection, temp_file, separators=(",", ":"))
        temp_geojson_path = Path(temp_file.name)

    try:
        subprocess.run(
            [
                str(geo2topo_bin),
                f"places={temp_geojson_path}",
                "-q",
                "1e5",
                "-o",
                str(topo_path),
            ],
            check=True,
            cwd=project_root,
        )
    finally:
        temp_geojson_path.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build web-ready assets from TIGER/Line PLACE zip bundles."
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
    parser.add_argument(
        "--simplify-tolerance",
        default=250.0,
        type=float,
        help="Douglas-Peucker simplify tolerance in meters in a global metric projection.",
    )
    parser.add_argument(
        "--top-n",
        default=40,
        type=int,
        help="How many top repeated names to include in top_names.json.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    zip_paths = sorted(args.input_dir.glob("tl_2025_*_place.zip"))
    if not zip_paths:
        raise SystemExit(f"No input zips found in {args.input_dir}")

    frames = [load_place_zip(path) for path in zip_paths]
    combined = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)
    combined = combined.loc[combined["normalized_name"] != ""].copy()
    combined["geometry"] = safe_make_valid(combined.geometry)
    combined = combined[combined.geometry.notnull() & ~combined.geometry.is_empty].copy()

    projected = combined.to_crs(3857)
    projected["area_m2"] = projected.geometry.area.round(2)
    projected["centroid_geom"] = projected.geometry.representative_point()
    projected["geometry"] = projected.geometry.simplify(
        args.simplify_tolerance,
        preserve_topology=True,
    )

    simplified = projected.to_crs(4326)
    centroids = gpd.GeoSeries(projected["centroid_geom"], crs=3857).to_crs(4326)
    simplified["area_m2"] = projected["area_m2"].astype(float)
    simplified["centroid_lon"] = centroids.x.round(6)
    simplified["centroid_lat"] = centroids.y.round(6)
    simplified["NAME"] = simplified["display_name"]
    simplified = simplified.sort_values(
        ["normalized_name", "state_abbr", "display_name", "GEOID"]
    ).reset_index(drop=True)

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    build_topology(simplified, output_dir)
    build_name_assets(simplified, output_dir, args.top_n)

    metadata = {
        "source": "U.S. Census TIGER/Line PLACE shapefiles",
        "year": 2025,
        "includedClassfp": sorted(VALID_CLASSFP),
        "excludedExamples": ["U1"],
        "placeCount": int(len(simplified)),
        "nameCount": int(simplified["normalized_name"].nunique()),
        "stateCount": int(simplified["state_abbr"].nunique()),
        "simplifyToleranceMeters": args.simplify_tolerance,
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
