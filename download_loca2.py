"""Download a San Diego County spatial subset of LOCA2-CMIP6 from Cal-Adapt.

Run from the project root: python scripts/download_loca2.py
Requires internet access. Uses the public, anonymous S3 catalog. Does not
modify the original NASA source files.
"""
from pathlib import Path
import json
import sys

import numpy as np
import pandas as pd
from shapely.geometry import box, shape, mapping
from shapely.ops import unary_union

CATALOG_URL = "https://cadcat.s3.amazonaws.com/cae-collection.json"
MODEL = "ACCESS-CM2"
MEMBER = "r1i1p1f1"
SCENARIOS = ("ssp245", "ssp370")
MONTHS = (6, 7, 8, 9)
YEAR_START, YEAR_END = 2015, 2100
# Generous extent used for efficient cloud subsetting. Exact county clipping
# is performed later using the user-supplied county GeoJSON.
BBOX = (-117.70, 32.45, -115.75, 33.65)  # W, S, E, N
ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def open_climate_model(cat, scenario):
    query = cat.search(
        activity_id="LOCA2",
        source_id=MODEL,
        experiment_id=scenario,
        member_id=MEMBER,
        table_id="mon",
        variable_id="tasmax",
        grid_label="d03",
    )
    print(f"{scenario}: matching catalog records: {len(query.df)}")
    if query.df.empty:
        raise RuntimeError(
            f"No LOCA2 monthly tasmax match for {MODEL}/{MEMBER}/{scenario}/d03. "
            "Inspect catalog.unique() and choose one model/member shared by both scenarios."
        )
    print(query.df[["experiment_id", "source_id", "member_id", "path"]].to_string(index=False))
    ds_dict = query.to_dataset_dict(
        zarr_kwargs={"consolidated": True},
        storage_options={"anon": True},
    )
    if len(ds_dict) != 1:
        raise RuntimeError(f"Expected one dataset, got {list(ds_dict)}")
    ds = next(iter(ds_dict.values()))
    if "tasmax" not in ds:
        raise RuntimeError(f"tasmax missing in dataset: {list(ds.data_vars)}")
    return ds["tasmax"]


def to_fahrenheit(values, units):
    """Refuse to guess units, which may differ across sources."""
    u = units.strip().lower().replace("°", "")
    if u in {"k", "kelvin", "degrees_kelvin", "degree_kelvin"}:
        return (values - 273.15) * 9 / 5 + 32
    if u in {"c", "degc", "celsius", "degree_celsius", "degrees_celsius"}:
        return values * 9 / 5 + 32
    if u in {"f", "degf", "fahrenheit", "degree_fahrenheit", "degrees_fahrenheit"}:
        return values
    raise RuntimeError(
        f"Unrecognized tasmax units {units!r}. Inspect ds['tasmax'].attrs before converting."
    )


def extract_frame(da, scenario):
    print(f"{scenario}: dimensions={da.dims}, units={da.attrs.get('units')!r}")
    if not {"time", "lat", "lon"}.issubset(da.dims):
        raise RuntimeError(f"Expected time/lat/lon dimensions, found {da.dims}")
    if "member_id" in da.dims:
        if da.sizes["member_id"] != 1:
            raise RuntimeError("Expected one climate model member")
        da = da.isel(member_id=0, drop=True)
    if da["lat"].ndim != 1 or da["lon"].ndim != 1:
        raise RuntimeError("This script expects rectilinear 1D lat and lon coordinates")
    lat = np.asarray(da.lat.values)
    lon_native = np.asarray(da.lon.values)
    lon = (lon_native + 180) % 360 - 180
    west, south, east, north = BBOX
    iy = np.flatnonzero((lat >= south) & (lat <= north))
    ix = np.flatnonzero((lon >= west) & (lon <= east))
    if len(iy) == 0 or len(ix) == 0:
        raise RuntimeError("Bounding box matches no coordinate cells")
    da = da.sel(time=slice(f"{YEAR_START}-01-01", f"{YEAR_END}-12-31"))
    year_vals = da.time.dt.year.values.astype(int)
    month_vals = da.time.dt.month.values.astype(int)
    it = np.flatnonzero(
        np.isin(month_vals, MONTHS)
        & (year_vals >= YEAR_START) & (year_vals <= YEAR_END)
    )
    da = da.isel(time=it, lat=iy, lon=ix)
    print(f"{scenario}: fetching selected subset only: {dict(da.sizes)}")
    df = da.to_dataframe(name="tasmax_source").reset_index()
    if df.empty:
        raise RuntimeError("No climate records in selected range")
    df["year"] = df.time.map(lambda t: t.year).astype(int)
    df["month"] = df.time.map(lambda t: t.month).astype(int)
    df["latitude"] = df.lat.astype(float)
    df["longitude"] = ((df.lon.astype(float) + 180) % 360 - 180)
    df["temperature_f"] = to_fahrenheit(df.tasmax_source, da.attrs.get("units", ""))
    df = df[["latitude", "longitude", "year", "month", "temperature_f"]]
    df = df.dropna(subset=["temperature_f"])
    if df.empty:
        raise RuntimeError("Every temperature is missing; inspect dataset")
    if df.duplicated(["latitude", "longitude", "year", "month"]).any():
        raise RuntimeError("Multiple climate records for the same cell/month; inspect metadata")
    df = df.rename(columns={"temperature_f": f"MAX_F_{scenario.upper()}"})
    return df


def county_and_grid(frames):
    with (DATA / "san_diego_county.geojson").open() as f:
        county_json = json.load(f)
    county = unary_union([shape(feat["geometry"]) for feat in county_json["features"]])
    cells = pd.concat([f[["latitude", "longitude"]] for f in frames])
    cells = cells.drop_duplicates().sort_values(["latitude", "longitude"])
    lat_unique = np.sort(cells.latitude.unique())
    lon_unique = np.sort(cells.longitude.unique())
    lat_step = float(np.median(np.diff(lat_unique)))
    lon_step = float(np.median(np.diff(lon_unique)))
    if lat_step <= 0 or lon_step <= 0 or lat_step > .15 or lon_step > .15:
        raise RuntimeError(f"Unexpected grid spacing: {lat_step}, {lon_step}")
    features = []
    included = []
    for row in cells.itertuples(index=False):
        lat, lon = float(row.latitude), float(row.longitude)
        footprint = box(lon-lon_step/2, lat-lat_step/2, lon+lon_step/2, lat+lat_step/2)
        clipped = footprint.intersection(county)
        if clipped.is_empty or clipped.area <= 0:
            continue
        # Tiny simplification is cosmetic; keep exact full grid location key.
        features.append({
            "type": "Feature",
            "properties": {"latitude": round(lat, 6), "longitude": round(lon, 6)},
            "geometry": mapping(clipped.simplify(0.0001, preserve_topology=True)),
        })
        included.append((round(lat, 6), round(lon, 6)))
    if not features:
        raise RuntimeError("No grid polygons intersect San Diego County")
    with (DATA / "loca2_regions.geojson").open("w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
    return included


def main():
    try:
        import intake
    except ImportError as exc:
        raise SystemExit(
            'Install packages first: python3 -m pip install -r requirements-loca2.txt'
        ) from exc
    DATA.mkdir(exist_ok=True)
    print("Opening Cal-Adapt public intake catalog…")
    cat = intake.open_esm_datastore(CATALOG_URL)
    frames = []
    for scenario in SCENARIOS:
        da = open_climate_model(cat, scenario)
        frames.append(extract_frame(da, scenario))
    keys = ["latitude", "longitude", "year", "month"]
    monthly = frames[0].merge(frames[1], on=keys, how="outer", validate="one_to_one")
    included = county_and_grid(frames)
    included_keys = {(round(a, 6), round(b, 6)) for a, b in included}
    keep = [
        (round(a, 6), round(b, 6)) in included_keys
        for a, b in zip(monthly.latitude, monthly.longitude)
    ]
    monthly = monthly.loc[keep].copy().sort_values(keys)
    monthly.to_csv(DATA / "loca2_monthly.csv", index=False, float_format="%.5f")
    assert not monthly.duplicated(keys).any()
    print(f"Saved {len(monthly):,} monthly cell records across {len(included)} county-intersecting grid cells")
    print(f"Year range: {monthly.year.min()}–{monthly.year.max()}")
    print(f"Scenarios: {[c for c in monthly.columns if c.startswith('MAX_F_')]}")
    print(f"Output: {DATA / 'loca2_monthly.csv'}")
    print(f"Output: {DATA / 'loca2_regions.geojson'}")
    print("IMPORTANT: this is one climate model, not a multi-model consensus")


if __name__ == "__main__":
    main()
