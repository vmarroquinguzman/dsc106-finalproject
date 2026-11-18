
"""Download global CMIP6 temperatures for the D3 globe."""

import json
from pathlib import Path

import gcsfs
import numpy as np
import pandas as pd
import xarray as xr

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data/global_cmip6_anomalies.json"

CATALOG = "https://storage.googleapis.com/cmip6/pangeo-cmip6.csv"
MODEL = "ACCESS-CM2"
MEMBER = "r1i1p1f1"
SCENARIO = "ssp370"

BASELINE_START = 1951
BASELINE_END = 1980

LAT_CENTERS = np.arange(-87.5, 90, 5)
LON_CENTERS = np.arange(2.5, 360, 5)


def open_experiment(catalog, experiment, fs):
    matches = catalog.loc[
        catalog.source_id.eq(MODEL)
        & catalog.experiment_id.eq(experiment)
        & catalog.member_id.eq(MEMBER)
        & catalog.table_id.eq("Amon")
        & catalog.variable_id.eq("tas")
    ].copy()

    if matches.empty:
        raise RuntimeError(
            f"No {MODEL} {experiment} tas dataset found"
        )

    native = matches[matches.grid_label.eq("gn")]

    if not native.empty:
        matches = native

    if len(matches) != 1:
        print(matches[["grid_label", "zstore"]])
        raise RuntimeError(
            f"Expected one {experiment} dataset"
        )

    url = matches.iloc[0]["zstore"]
    print(f"Opening {experiment}: {url}", flush=True)

    mapper = fs.get_mapper(url)

    ds = xr.open_zarr(
        mapper,
        consolidated=True,
        chunks={}
    )

    da = ds["tas"]

    if set(da.dims) != {"time", "lat", "lon"}:
        raise RuntimeError(
            f"Unexpected dimensions: {da.dims}"
        )

    if da.lat.ndim != 1 or da.lon.ndim != 1:
        raise RuntimeError("Expected a regular lat/lon grid")

    if da.attrs.get("units", "").lower() not in (
        "k", "kelvin"
    ):
        raise RuntimeError("Unexpected temperature units")

    return da


def annual_subset(da, start, end):
    model_lats = np.asarray(da.lat.values, dtype=float)
    model_lons = np.mod(
        np.asarray(da.lon.values, dtype=float), 360
    )

    lat_indices = np.abs(
        model_lats[:, None] - LAT_CENTERS[None, :]
    ).argmin(axis=0)

    distances = np.abs(
        model_lons[:, None] - LON_CENTERS[None, :]
    )

    lon_indices = np.minimum(
        distances, 360 - distances
    ).argmin(axis=0)

    selected = da.isel(
        lat=xr.DataArray(
            lat_indices, dims="display_lat"
        ),
        lon=xr.DataArray(
            lon_indices, dims="display_lon"
        )
    )

    selected = selected.sel(
        time=slice(
            f"{start}-01-01",
            f"{end}-12-31"
        )
    )

    annual = selected.groupby("time.year").mean("time")

    return annual.transpose(
        "year", "display_lat", "display_lon"
    ).compute()


def main():
    print("Reading CMIP6 catalog...", flush=True)

    catalog = pd.read_csv(CATALOG)
    fs = gcsfs.GCSFileSystem(token="anon")

    historical = annual_subset(
        open_experiment(catalog, "historical", fs),
        1950,
        2014
    )

    future = annual_subset(
        open_experiment(catalog, SCENARIO, fs),
        2015,
        2100
    )

    combined = xr.concat(
        [historical, future],
        dim="year"
    ).sortby("year")

    years = combined.year.values.astype(int)

    if not np.array_equal(
        years, np.arange(1950, 2101)
    ):
        raise RuntimeError("Missing years in CMIP6 data")

    baseline = combined.sel(
        year=slice(BASELINE_START, BASELINE_END)
    ).mean("year")

    anomalies = combined - baseline

    # Smooth year-to-year climate variability.
    anomalies = anomalies.rolling(
        year=5,
        center=True,
        min_periods=3
    ).mean()

    values = np.asarray(
        anomalies.values, dtype=float
    )

    records = []

    for i, year in enumerate(years):
        row = values[i].ravel()

        records.append({
            "year": int(year),
            "values": [
                round(float(value), 2)
                if np.isfinite(value) else None
                for value in row
            ]
        })

    payload = {
        "model": MODEL,
        "member": MEMBER,
        "variable": "tas",
        "scenario": SCENARIO,
        "baseline": [BASELINE_START, BASELINE_END],
        "lat_centers": LAT_CENTERS.tolist(),
        "lon_centers": LON_CENTERS.tolist(),
        "records": records
    }

    OUTPUT.parent.mkdir(
        parents=True, exist_ok=True
    )

    OUTPUT.write_text(
        json.dumps(payload, separators=(",", ":"))
    )

    print(f"Saved {len(records)} years to {OUTPUT}")


if __name__ == "__main__":
    main()
