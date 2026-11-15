# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Contract-gated terrain entry point and private projected-relief diagnostics.

The legacy AEQD/mean-centered calculation is not exact Cartesian ENU. Production
extraction is blocked until source frames, height datums and ENU are resolved.
"""

from __future__ import annotations

import json
import math
import pathlib
from typing import Any

import numpy as np
import pyproj
import rasterio
from rasterio.windows import from_bounds
from shapely.geometry import Point, shape
from shapely.ops import transform as shapely_transform, unary_union
from shapely.prepared import prep

from pae_pipeline.sources import SUPPORTED_SOURCE_FRAMES

SUPPORTED_VERTICAL_UNITS: frozenset[str] = frozenset(
    {"m", "meter", "meters", "metre", "metres"}
)
MAX_OUTPUT_GRID_NODES: int = 4_000_000
MAX_READ_WINDOW_PIXELS: int = 16_777_216


class TerrainValidationError(ValueError):
    """Raised when a DEM or AOI fails georeferencing, unit, or geometry checks."""


class InsufficientResolutionError(TerrainValidationError):
    """Raised when the source DEM is coarser than profile comparison_resolution_m."""


class InsufficientCoverageError(TerrainValidationError):
    """Raised when valid DEM coverage inside the AOI/window is below min_valid_area_fraction."""


def _extract_ellipsoid_radii(crs: pyproj.CRS) -> tuple[float, float]:
    """Extract (semi_major_m, semi_minor_m) directly from a pyproj CRS without Earth defaults."""
    ellipsoid = crs.ellipsoid
    if ellipsoid is None or ellipsoid.semi_major_metre is None:
        raise TerrainValidationError(
            "DEM CRS lacks explicit ellipsoid/sphere semi-major axis parameters; "
            "refusing to assume an Earth datum."
        )
    a = float(ellipsoid.semi_major_metre)
    if ellipsoid.semi_minor_metre is not None:
        b = float(ellipsoid.semi_minor_metre)
    elif ellipsoid.inverse_flattening is not None and ellipsoid.inverse_flattening > 0:
        b = a * (1.0 - 1.0 / float(ellipsoid.inverse_flattening))
    else:
        b = a
    if not (math.isfinite(a) and math.isfinite(b) and a > 0.0 and b > 0.0):
        raise TerrainValidationError(f"Invalid ellipsoid radii ({a}, {b}) in DEM CRS")
    return a, b


def _load_aoi_union(aoi_path: pathlib.Path) -> Any:
    raw = json.loads(aoi_path.read_text(encoding="utf-8"))
    gtype = raw.get("type")
    geoms = []
    if gtype == "FeatureCollection":
        for feat in raw.get("features", []):
            if isinstance(feat, dict) and feat.get("geometry"):
                geoms.append(shape(feat["geometry"]))
    elif gtype == "Feature":
        if raw.get("geometry"):
            geoms.append(shape(raw["geometry"]))
    elif gtype in {"Polygon", "MultiPolygon"}:
        geoms.append(shape(raw))
    if not geoms:
        raise TerrainValidationError(f"No valid AOI polygons found in {aoi_path}")
    union_geom = unary_union(geoms)
    if not union_geom.is_valid or union_geom.is_empty or union_geom.area <= 0.0:
        raise TerrainValidationError(f"Invalid or empty AOI geometry in {aoi_path}")
    return union_geom


def _planetocentric_to_geodetic_deg(lat_c_deg: float, a_m: float, b_m: float) -> float:
    """Convert planetocentric latitude (deg) to geodetic/planetographic latitude (deg)."""
    if not math.isfinite(lat_c_deg) or lat_c_deg < -90.0 or lat_c_deg > 90.0:
        raise TerrainValidationError(f"Latitude out of [-90, 90]: {lat_c_deg!r}")
    if math.isclose(a_m, b_m, rel_tol=0.0, abs_tol=1e-9) or abs(lat_c_deg) >= 90.0 - 1e-12:
        if abs(lat_c_deg) >= 90.0 - 1e-12:
            return math.copysign(90.0, lat_c_deg)
        return float(lat_c_deg)
    ratio_sq = (a_m / b_m) ** 2
    return float(math.degrees(math.atan(ratio_sq * math.tan(math.radians(lat_c_deg)))))


def _planetocentric_to_geodetic_coords(
    xs: Any,
    ys: Any,
    zs: Any = None,
    *,
    a_m: float,
    b_m: float,
) -> tuple[Any, ...]:
    ys_arr = np.asarray(ys, dtype=np.float64)
    ratio_sq = (a_m / b_m) ** 2
    out_y = np.empty_like(ys_arr)
    pole_mask = np.abs(ys_arr) >= (90.0 - 1e-12)
    out_y[pole_mask] = np.copysign(90.0, ys_arr[pole_mask])
    non_pole = ~pole_mask
    if np.any(non_pole):
        out_y[non_pole] = np.degrees(np.arctan(ratio_sq * np.tan(np.radians(ys_arr[non_pole]))))
    if np.ndim(ys) == 0:
        out_y_val: Any = float(out_y)
    else:
        out_y_val = out_y
    if zs is not None:
        return xs, out_y_val, zs
    return xs, out_y_val


def _unwrap_antimeridian_aoi(aoi_geom: Any) -> tuple[Any, float, float]:
    """Handle antimeridian-split MultiPolygons safely; reject global (>180 deg) spans."""
    minx, _miny, maxx, _maxy = aoi_geom.bounds
    if maxx - minx <= 180.0:
        return aoi_geom, float(aoi_geom.centroid.x), float(aoi_geom.centroid.y)
    if aoi_geom.geom_type != "MultiPolygon":
        raise TerrainValidationError(
            "AOI spans > 180 degrees; split antimeridian geometry into a MultiPolygon explicitly"
        )

    def _shift_neg(xs: Any, ys: Any, zs: Any = None) -> tuple[Any, ...]:
        xs_arr = np.asarray(xs, dtype=np.float64)
        shifted = np.where(xs_arr < 0.0, xs_arr + 360.0, xs_arr)
        out_x: Any = float(shifted) if np.ndim(xs) == 0 else shifted
        return (out_x, ys, zs) if zs is not None else (out_x, ys)

    shifted_geom = shapely_transform(_shift_neg, aoi_geom)
    if shifted_geom.geom_type == "MultiPolygon":
        shifted_geom = unary_union(list(shifted_geom.geoms))
    if not shifted_geom.is_valid or shifted_geom.is_empty:
        raise TerrainValidationError("AOI geometry became invalid after antimeridian unwrapping")

    s_minx, _s_miny, s_maxx, _s_maxy = shifted_geom.bounds
    if s_maxx - s_minx > 180.0:
        raise TerrainValidationError(
            "AOI spans > 180 degrees of longitude and cannot be projected onto a local tangent plane"
        )
    cx_raw = float(shifted_geom.centroid.x)
    cy = float(shifted_geom.centroid.y)
    centroid_lon = ((cx_raw + 180.0) % 360.0) - 180.0
    if math.isclose(centroid_lon, -180.0, abs_tol=1e-12) and math.isclose(cx_raw, 180.0, abs_tol=1e-12):
        centroid_lon = 180.0
    return shifted_geom, float(centroid_lon), cy


def _horn_slope_deg(
    elev: np.ndarray,
    valid_mask: np.ndarray,
    dx_m: float,
    dz_m: float,
) -> tuple[float, float, int]:
    """Compute Horn 3x3 slope in degrees strictly on fully valid 3x3 neighborhoods.

    Boundary rows/columns and neighborhoods containing any invalid sample are excluded.
    """
    h, w = elev.shape
    if h < 3 or w < 3:
        raise InsufficientCoverageError(
            f"Grid dimensions ({h}x{w}) too small for 3x3 Horn slope operator"
        )

    # All 9 neighbors in 3x3 window must be valid (no synthesis or border padding)
    neigh_valid = (
        valid_mask[0 : h - 2, 0 : w - 2]
        & valid_mask[0 : h - 2, 1 : w - 1]
        & valid_mask[0 : h - 2, 2:w]
        & valid_mask[1 : h - 1, 0 : w - 2]
        & valid_mask[1 : h - 1, 1 : w - 1]
        & valid_mask[1 : h - 1, 2:w]
        & valid_mask[2:h, 0 : w - 2]
        & valid_mask[2:h, 1 : w - 1]
        & valid_mask[2:h, 2:w]
    )
    valid_count = int(np.sum(neigh_valid))
    if valid_count == 0:
        raise InsufficientCoverageError(
            "No valid 3x3 neighborhoods available for Horn slope computation"
        )

    z_tl = elev[0 : h - 2, 0 : w - 2]
    z_tc = elev[0 : h - 2, 1 : w - 1]
    z_tr = elev[0 : h - 2, 2:w]
    z_ml = elev[1 : h - 1, 0 : w - 2]
    z_mr = elev[1 : h - 1, 2:w]
    z_bl = elev[2:h, 0 : w - 2]
    z_bc = elev[2:h, 1 : w - 1]
    z_br = elev[2:h, 2:w]

    dz_dx = ((z_tr + 2.0 * z_mr + z_br) - (z_tl + 2.0 * z_ml + z_bl)) / (8.0 * dx_m)
    dz_dz = ((z_bl + 2.0 * z_bc + z_br) - (z_tl + 2.0 * z_tc + z_tr)) / (8.0 * dz_m)

    grad_mag = np.sqrt(dz_dx[neigh_valid] ** 2 + dz_dz[neigh_valid] ** 2)
    slopes_deg = np.degrees(np.arctan(grad_mag))
    return float(np.mean(slopes_deg)), float(np.max(slopes_deg)), valid_count


def _detrended_roughness(
    x_grid: np.ndarray,
    z_grid: np.ndarray,
    elev: np.ndarray,
    valid_mask: np.ndarray,
    support_window_m: float,
) -> float:
    """Compute dimensionless roughness_index = RMS(detrended plane residual) / support_window_m.

    Plane z = a*x + b*z + c is fit strictly on valid DEM samples via ordinary least squares.
    """
    xs = x_grid[valid_mask]
    zs = z_grid[valid_mask]
    ys = elev[valid_mask]
    if ys.size < 3:
        raise InsufficientCoverageError(
            f"Need at least 3 valid DEM samples to fit detrended plane, got {ys.size}"
        )

    design = np.column_stack([xs, zs, np.ones_like(xs)])
    if np.linalg.matrix_rank(design) < 3:
        raise InsufficientCoverageError(
            "Valid DEM samples are collinear; cannot fit 2D detrended plane"
        )
    coeffs, _residuals, _rank, _svals = np.linalg.lstsq(design, ys, rcond=None)
    predicted = design @ coeffs
    residuals = ys - predicted
    rms_m = float(np.sqrt(np.mean(residuals ** 2)))
    return float(rms_m / support_window_m)


def _apply_scale_offset_masked(
    band_data: np.ndarray,
    band_mask: np.ndarray,
    src: rasterio.DatasetReader,
) -> tuple[np.ndarray, np.ndarray]:
    """Evaluate raw-DN nodata mask first, then apply GDAL band scale and offset."""
    src_valid = band_mask & np.isfinite(band_data)
    if src.nodata is not None and math.isfinite(float(src.nodata)):
        src_valid &= ~np.isclose(band_data, float(src.nodata), rtol=0.0, atol=1e-9)

    scales = getattr(src, "scales", None)
    offsets = getattr(src, "offsets", None)
    scale = float(scales[0]) if scales and len(scales) >= 1 and scales[0] is not None else 1.0
    offset = float(offsets[0]) if offsets and len(offsets) >= 1 and offsets[0] is not None else 0.0
    if not (math.isfinite(scale) and scale > 0.0 and math.isfinite(offset)):
        raise TerrainValidationError(
            f"Invalid DEM band scale={scale!r} or offset={offset!r}"
        )

    scaled = band_data * scale + offset
    if np.any(src_valid) and not np.all(np.isfinite(scaled[src_valid])):
        raise TerrainValidationError("Non-finite DEM elevation values after applying band scale/offset")
    return scaled, src_valid


class TerrainContractBlockedError(ValueError):
    """Fatal contract blocker, deliberately separate from per-site terrain errors.

    The CLI catches TerrainValidationError to continue with site exclusions. This
    error must instead reach its outer ValueError handler and abort publication.
    """


def extract_terrain(
    dem_path: pathlib.Path,
    aoi_path: pathlib.Path,
    profile: dict[str, object],
    *,
    aoi_frame: str | None = None,
) -> dict[str, object]:
    """Fail closed: no production terrain satisfies frozen Contract 1.0.0 yet.

    No profile field, body, filename or CLI readiness flag bypasses this gate.
    Keep the signature stable for callers; do not inspect or read source data.
    """
    require_exact_enu_contract()
    raise AssertionError("Exact ENU gate unexpectedly returned")


def require_exact_enu_contract() -> None:
    """Reject production preparation before source reads, staging or downloads."""
    raise TerrainContractBlockedError(
        "TERRAIN_CONTRACT_BLOCKED: Contract 1.0.0 requires exact local ENU; "
        "the available terrain routine uses AEQD horizontal coordinates and "
        "mean-centered source heights. Source-frame realization, absolute height "
        "datum and source-height/body-fixed XYZ/exact ENU conversion remain "
        "unresolved. Production prepare/offline terrain export is disabled."
    )


def _extract_projected_relief_for_tests(
    dem_path: pathlib.Path,
    aoi_path: pathlib.Path,
    profile: dict[str, object],
    *,
    aoi_frame: str | None = None,
) -> dict[str, object]:
    """Private numerical diagnostic for synthetic tests; never a contract export.

    Values are AEQD projected relief and mean-centered source elevations. The
    returned camera frame intentionally fails the production schema enum. This
    routine neither resolves source orientation nor verifies absolute height zero.
    """
    dem_file = pathlib.Path(dem_path)
    aoi_file = pathlib.Path(aoi_path)
    if not dem_file.is_file():
        raise FileNotFoundError(f"DEM file not found: {dem_file}")
    if not aoi_file.is_file():
        raise FileNotFoundError(f"AOI file not found: {aoi_file}")

    effective_aoi_frame = aoi_frame if aoi_frame is not None else profile.get("aoi_frame")
    if effective_aoi_frame is not None:
        effective_aoi_frame = str(effective_aoi_frame)
        if effective_aoi_frame not in SUPPORTED_SOURCE_FRAMES:
            raise TerrainValidationError(f"Unsupported AOI coordinate frame {effective_aoi_frame!r}")

    res_m = float(profile["comparison_resolution_m"])
    window_m = float(profile["window_m"])
    min_valid_frac = float(profile["min_valid_area_fraction"])
    if not (math.isfinite(res_m) and math.isfinite(window_m) and math.isfinite(min_valid_frac)):
        raise TerrainValidationError("Non-finite profile terrain parameters")
    if res_m <= 0.0 or window_m <= 0.0 or not (0.0 < min_valid_frac <= 1.0):
        raise TerrainValidationError(
            f"Invalid profile grid parameters: res={res_m}, win={window_m}, min_frac={min_valid_frac}"
        )

    intervals = int(round(window_m / res_m))
    if intervals < 2 or abs(intervals * res_m - window_m) > 1e-4 * window_m:
        raise TerrainValidationError(
            f"window_m ({window_m}) must be an integer multiple (>=2) of comparison_resolution_m ({res_m})"
        )
    width = intervals + 1
    height = intervals + 1
    if width * height > MAX_OUTPUT_GRID_NODES:
        raise TerrainValidationError(
            f"Requested output grid {width}x{height} ({width * height} nodes) exceeds "
            f"MAX_OUTPUT_GRID_NODES={MAX_OUTPUT_GRID_NODES}"
        )
    half_w = 0.5 * intervals * res_m

    aoi_geom_raw = _load_aoi_union(aoi_file)
    aoi_geom_unwrapped, centroid_lon, centroid_lat = _unwrap_antimeridian_aoi(aoi_geom_raw)

    with rasterio.open(dem_file) as src:
        if src.crs is None:
            raise TerrainValidationError(f"DEM lacks CRS georeferencing: {dem_file}")
        if abs(src.transform.a) == 0.0 or abs(src.transform.e) == 0.0:
            raise TerrainValidationError(f"DEM has degenerate affine transform: {dem_file}")

        units = src.units[0] if src.units else None
        declared_units = profile.get("vertical_units")
        if units is not None and str(units).lower() not in SUPPORTED_VERTICAL_UNITS:
            raise TerrainValidationError(
                f"Unsupported DEM vertical unit {units!r} in {dem_file}; expected meters"
            )
        if declared_units is not None and str(declared_units).lower() not in SUPPORTED_VERTICAL_UNITS:
            raise TerrainValidationError(
                f"Unsupported declared vertical unit {declared_units!r}; expected meters"
            )

        src_crs = pyproj.CRS.from_user_input(src.crs.to_wkt())
        a_m, b_m = _extract_ellipsoid_radii(src_crs)

        # PROJ +proj=longlat and +proj=aeqd expect geodetic/planetographic latitude on oblate ellipsoids.
        if (
            effective_aoi_frame is not None
            and effective_aoi_frame.endswith("_iau_planetocentric")
            and not math.isclose(a_m, b_m, rel_tol=0.0, abs_tol=1e-9)
        ):
            proj_lat_0 = _planetocentric_to_geodetic_deg(centroid_lat, a_m, b_m)
            aoi_geom_geog = shapely_transform(
                lambda x, y, z=None: _planetocentric_to_geodetic_coords(x, y, z, a_m=a_m, b_m=b_m),
                aoi_geom_unwrapped,
            )
        else:
            proj_lat_0 = centroid_lat
            aoi_geom_geog = aoi_geom_unwrapped

        # Build body-matched geographic CRS and AEQD projected metric CRS (not exact ENU)
        body_geog_crs = pyproj.CRS.from_proj4(
            f"+proj=longlat +a={a_m} +b={b_m} +no_defs"
        )
        local_aeqd_crs = pyproj.CRS.from_proj4(
            f"+proj=aeqd +lat_0={proj_lat_0} +lon_0={centroid_lon} "
            f"+x_0=0 +y_0=0 +a={a_m} +b={b_m} +units=m +no_defs"
        )

        geog_to_local = pyproj.Transformer.from_crs(
            body_geog_crs, local_aeqd_crs, always_xy=True
        )
        local_to_src = pyproj.Transformer.from_crs(
            local_aeqd_crs, src_crs, always_xy=True
        )
        src_to_local = pyproj.Transformer.from_crs(
            src_crs, local_aeqd_crs, always_xy=True
        )

        aoi_local = shapely_transform(geog_to_local.transform, aoi_geom_geog)
        if not aoi_local.is_valid or aoi_local.is_empty:
            raise TerrainValidationError("AOI geometry invalid after local metric projection")

        src_is_0_to_360 = (
            src_crs.is_geographic
            and src.bounds.right > 180.0 + 1e-6
            and src.bounds.left >= -1e-6
        )

        # Measure effective source DEM pixel spacing in meters at the AOI center
        center_sx, center_sy = local_to_src.transform(0.0, 0.0)
        if not (math.isfinite(center_sx) and math.isfinite(center_sy)):
            raise TerrainValidationError("Non-finite projected center coordinate")
        if src_is_0_to_360:
            center_sx = center_sx % 360.0
        elif src_crs.is_geographic and math.isclose(center_sx, 180.0, rel_tol=0.0, abs_tol=1e-9):
            # +180 and -180 denote the same meridian. Use the western edge
            # only when this raster actually includes it; regional extents
            # must still fail the ordinary coverage check below.
            if math.isclose(src.bounds.left, -180.0, rel_tol=0.0, abs_tol=1e-9):
                center_sx = -180.0
        col_c, row_c = ~src.transform * (center_sx, center_sy)
        if not (0.0 <= col_c < src.width and 0.0 <= row_c < src.height):
            raise InsufficientCoverageError(
                f"AOI center ({centroid_lat}, {centroid_lon}) lies outside DEM raster extent"
            )
        sx0, sy0 = src.transform * (col_c, row_c)
        sx1, sy1 = src.transform * (col_c + 1.0, row_c)
        sx2, sy2 = src.transform * (col_c, row_c + 1.0)
        lx0, ly0 = src_to_local.transform(sx0, sy0)
        lx1, ly1 = src_to_local.transform(sx1, sy1)
        lx2, ly2 = src_to_local.transform(sx2, sy2)
        if not all(math.isfinite(v) for v in (lx0, ly0, lx1, ly1, lx2, ly2)):
            raise TerrainValidationError("Non-finite local coordinates while measuring source DEM spacing")
        src_dx_m = math.hypot(lx1 - lx0, ly1 - ly0)
        src_dy_m = math.hypot(lx2 - lx0, ly2 - ly0)
        coarsest_src_m = max(src_dx_m, src_dy_m)

        if coarsest_src_m > res_m * 1.01:
            raise InsufficientResolutionError(
                f"Source DEM effective resolution ({coarsest_src_m:.3f} m) is coarser than "
                f"profile comparison_resolution_m ({res_m:.3f} m); upsampling finer than source is prohibited"
            )

        # Build common grid nodes: x East (-half_w..+half_w), z South (-half_w..+half_w, y_north = -z)
        x_axis = np.linspace(-half_w, half_w, width, dtype=np.float64)
        z_axis = np.linspace(-half_w, half_w, height, dtype=np.float64)
        x_grid, z_grid = np.meshgrid(x_axis, z_axis)
        y_north_grid = -z_grid

        # Determine which grid nodes fall inside/on the AOI polygon
        prepared_aoi = prep(aoi_local)
        in_aoi = np.zeros((height, width), dtype=bool)
        for r in range(height):
            for c in range(width):
                in_aoi[r, c] = prepared_aoi.covers(
                    Point(float(x_grid[r, c]), float(y_north_grid[r, c]))
                )

        # Transform grid nodes to source raster coordinates
        src_xs, src_ys = local_to_src.transform(
            x_grid.ravel(), y_north_grid.ravel()
        )
        src_xs = np.asarray(src_xs, dtype=np.float64).reshape((height, width))
        src_ys = np.asarray(src_ys, dtype=np.float64).reshape((height, width))
        if not (np.all(np.isfinite(src_xs)) and np.all(np.isfinite(src_ys))):
            raise TerrainValidationError("Non-finite projected source coordinates in terrain grid")

        if src_is_0_to_360:
            src_xs = np.mod(src_xs, 360.0)

        min_sx, max_sx = float(np.min(src_xs)), float(np.max(src_xs))
        min_sy, max_sy = float(np.min(src_ys)), float(np.max(src_ys))

        # Handle geographic DEMs straddling the antimeridian without full-globe reads
        if src_crs.is_geographic and (max_sx - min_sx) > 180.0:
            if src_is_0_to_360:
                raise TerrainValidationError("Geographic source window spans > 180 degrees of longitude")
            src_xs_360 = np.where(src_xs < 0.0, src_xs + 360.0, src_xs)
            if (float(np.max(src_xs_360)) - float(np.min(src_xs_360))) > 180.0:
                raise TerrainValidationError("Geographic source window spans > 180 degrees of longitude")
            cols_f, rows_f, band_data, src_valid = _read_antimeridian_geographic_seam(
                src, src_xs, src_xs_360, src_ys, min_sy, max_sy
            )
        else:
            cols_f, rows_f, band_data, src_valid = _read_single_bounded_window(
                src, src_xs, src_ys, min_sx, min_sy, max_sx, max_sy
            )

        wh, ww = band_data.shape
        elev_out = np.zeros((height, width), dtype=np.float64)
        valid_out = np.zeros((height, width), dtype=bool)

        for r in range(height):
            for c in range(width):
                if not in_aoi[r, c]:
                    continue
                rf = rows_f[r, c]
                cf = cols_f[r, c]
                r0 = int(math.floor(rf))
                c0 = int(math.floor(cf))
                r1 = r0 + 1
                c1 = c0 + 1
                if r0 < 0 or c0 < 0 or r1 >= wh or c1 >= ww:
                    continue
                if not (
                    src_valid[r0, c0]
                    and src_valid[r0, c1]
                    and src_valid[r1, c0]
                    and src_valid[r1, c1]
                ):
                    continue
                dr = rf - r0
                dc = cf - c0
                z00 = band_data[r0, c0]
                z01 = band_data[r0, c1]
                z10 = band_data[r1, c0]
                z11 = band_data[r1, c1]
                elev_out[r, c] = (
                    (1.0 - dr) * (1.0 - dc) * z00
                    + (1.0 - dr) * dc * z01
                    + dr * (1.0 - dc) * z10
                    + dr * dc * z11
                )
                valid_out[r, c] = True

    valid_fraction = float(np.sum(valid_out)) / float(valid_out.size)
    if valid_fraction < min_valid_frac:
        raise InsufficientCoverageError(
            f"Valid DEM coverage fraction {valid_fraction:.4f} is below required "
            f"min_valid_area_fraction {min_valid_frac:.4f}"
        )

    z_valid = elev_out[valid_out]
    elevation_delta_m = float(np.max(z_valid) - np.min(z_valid))
    slope_mean_deg, slope_max_deg, slope_sample_count = _horn_slope_deg(
        elev_out, valid_out, res_m, res_m
    )
    roughness_index = _detrended_roughness(
        x_grid, z_grid, elev_out, valid_out, window_m
    )

    # Heightmap relative to mean valid elevation
    origin_elev_m = float(np.mean(z_valid))
    offsets_f32 = np.zeros((height, width), dtype=np.dtype("<f4"))
    offsets_f32[valid_out] = (elev_out[valid_out] - origin_elev_m).astype(np.dtype("<f4"))
    offsets_f32[~valid_out] = np.float32(0.0)
    if not np.all(np.isfinite(offsets_f32)):
        raise TerrainValidationError("Non-finite heightmap offsets generated")

    mask_u8 = valid_out.astype(np.uint8)

    # Place default camera over valid terrain looking toward valid terrain center
    valid_indices = np.argwhere(valid_out)
    mean_rc = np.mean(valid_indices, axis=0)
    dists_to_center = np.sum((valid_indices - mean_rc) ** 2, axis=1)
    look_r, look_c = valid_indices[int(np.argmin(dists_to_center))]
    look_x = float(x_grid[look_r, look_c])
    look_z = float(z_grid[look_r, look_c])
    look_y = float(offsets_f32[look_r, look_c])

    # Choose camera position at a valid node offset from lookAt so viewing direction is nonzero
    cam_r, cam_c = int(look_r), int(look_c)
    best_dist = -1.0
    for vr, vc in valid_indices:
        d = math.hypot(float(x_grid[vr, vc] - look_x), float(z_grid[vr, vc] - look_z))
        if d <= 0.45 * window_m and d > best_dist:
            best_dist = d
            cam_r, cam_c = int(vr), int(vc)
    cam_x = float(x_grid[cam_r, cam_c])
    cam_z = float(z_grid[cam_r, cam_c])
    cam_ground_y = float(offsets_f32[cam_r, cam_c])
    cam_y = cam_ground_y + max(15.0, 0.25 * window_m)

    common_meta = {
        "spatial_resolution_m": res_m,
        "support_window_m": window_m,
    }
    terrain_method_base = "physical_meter_aeqd_masked_bilinear_grid"

    return {
        "features": {
            "slope_mean_deg": {
                "value": slope_mean_deg,
                "unit": "deg",
                "quantity": "terrain_slope_mean",
                "method": f"horn_3x3_valid_neighborhood_mean;{terrain_method_base}",
                **common_meta,
            },
            "slope_max_deg": {
                "value": slope_max_deg,
                "unit": "deg",
                "quantity": "terrain_slope_max",
                "method": f"horn_3x3_valid_neighborhood_max;{terrain_method_base}",
                **common_meta,
            },
            "roughness_index": {
                "value": roughness_index,
                "unit": "1",
                "quantity": "detrended_plane_rms_roughness_over_support_window",
                "method": f"ols_plane_rms_div_window_m_valid_only;{terrain_method_base}",
                **common_meta,
            },
            "elevation_delta_m": {
                "value": elevation_delta_m,
                "unit": "m",
                "quantity": "terrain_relief_max_minus_min",
                "method": f"max_minus_min_valid_nodes;{terrain_method_base}",
                **common_meta,
            },
        },
        "heightmap_data": {
            "width": width,
            "height": height,
            "extent_m": [-half_w, -half_w, half_w, half_w],
            "origin": {
                "latitude_deg": centroid_lat,
                "longitude_deg": centroid_lon,
                "elevation_m": origin_elev_m,
            },
            "heights_bytes": offsets_f32.tobytes(),
            "mask_bytes": mask_u8.tobytes(),
            "valid_fraction": valid_fraction,
        },
        "default_camera": {
            "position": [cam_x, cam_y, cam_z],
            "lookAt": [look_x, look_y, look_z],
            "frame": "diagnostic_aeqd_x_east_y_mean_centered_height_z_south",
            "fov": 55.0,
            "near": 0.5,
            "far": max(5000.0, window_m * 4.0),
        },
        "diagnostics": {
            "contract_exportable": False,
            "geometry": "aeqd_projected_relief_not_exact_enu",
            "absolute_height_datum_verified": False,
            "slope_sample_count": slope_sample_count,
            "valid_fraction": valid_fraction,
            "grid_width": width,
            "grid_height": height,
            "aoi_frame": effective_aoi_frame,
        },
        "source_effective_resolution_m": [src_dx_m, src_dy_m],
        "source_crs_wkt": src.crs.to_wkt(),
    }


def _read_single_bounded_window(
    src: rasterio.DatasetReader,
    src_xs: np.ndarray,
    src_ys: np.ndarray,
    min_sx: float,
    min_sy: float,
    max_sx: float,
    max_sy: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    win = from_bounds(min_sx, min_sy, max_sx, max_sy, src.transform)
    col_off = max(0, int(math.floor(win.col_off)) - 2)
    row_off = max(0, int(math.floor(win.row_off)) - 2)
    col_end = min(src.width, int(math.ceil(win.col_off + win.width)) + 2)
    row_end = min(src.height, int(math.ceil(win.row_off + win.height)) + 2)
    if col_end <= col_off or row_end <= row_off:
        raise InsufficientCoverageError("AOI analysis grid does not overlap DEM raster")

    win_w = col_end - col_off
    win_h = row_end - row_off
    if win_w * win_h > MAX_READ_WINDOW_PIXELS:
        raise TerrainValidationError(
            f"Source DEM read window {win_w}x{win_h} ({win_w * win_h} pixels) exceeds "
            f"MAX_READ_WINDOW_PIXELS={MAX_READ_WINDOW_PIXELS}"
        )

    read_win = rasterio.windows.Window(col_off, row_off, win_w, win_h)
    win_transform = src.window_transform(read_win)
    band_raw = src.read(1, window=read_win).astype(np.float64)
    band_mask = src.read_masks(1, window=read_win) > 0
    band_data, src_valid = _apply_scale_offset_masked(band_raw, band_mask, src)

    inv_tf = ~win_transform
    cols_f, rows_f = inv_tf * (src_xs.ravel(), src_ys.ravel())
    cols_f = np.asarray(cols_f, dtype=np.float64).reshape(src_xs.shape) - 0.5
    rows_f = np.asarray(rows_f, dtype=np.float64).reshape(src_ys.shape) - 0.5
    return cols_f, rows_f, band_data, src_valid


def _read_antimeridian_geographic_seam(
    src: rasterio.DatasetReader,
    src_xs: np.ndarray,
    src_xs_360: np.ndarray,
    src_ys: np.ndarray,
    min_sy: float,
    max_sy: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    if (
        src.transform.b != 0.0
        or src.transform.d != 0.0
        or src.transform.a <= 0.0
        or abs((src.bounds.right - src.bounds.left) - 360.0) > 1e-3
    ):
        raise InsufficientCoverageError(
            "Geographic DEM does not provide continuous 360-degree coverage across the antimeridian"
        )

    east_xs = src_xs[src_xs >= 0.0]
    west_xs = src_xs[src_xs < 0.0]
    if east_xs.size == 0 or west_xs.size == 0:
        raise InsufficientCoverageError("Antimeridian split did not span both east and west hemispheres")

    dx = float(src.transform.a)
    dy = float(src.transform.e)
    origin_x = float(src.transform.c)
    origin_y = float(src.transform.f)

    row_a = (max_sy - origin_y) / dy
    row_b = (min_sy - origin_y) / dy
    row_off = max(0, int(math.floor(min(row_a, row_b))) - 2)
    row_end = min(src.height, int(math.ceil(max(row_a, row_b))) + 2)
    east_col_off = max(0, int(math.floor((float(np.min(east_xs)) - origin_x) / dx)) - 2)
    west_col_end = min(src.width, int(math.ceil((float(np.max(west_xs)) - origin_x) / dx)) + 2)

    if row_end <= row_off or east_col_off >= src.width or west_col_end <= 0:
        raise InsufficientCoverageError("Antimeridian seam windows lie outside DEM raster bounds")

    win_h = row_end - row_off
    east_w = src.width - east_col_off
    west_w = west_col_end
    if win_h * (east_w + west_w) > MAX_READ_WINDOW_PIXELS:
        raise TerrainValidationError(
            f"Antimeridian read windows ({win_h}x({east_w}+{west_w})) exceed "
            f"MAX_READ_WINDOW_PIXELS={MAX_READ_WINDOW_PIXELS}"
        )

    east_win = rasterio.windows.Window(east_col_off, row_off, east_w, win_h)
    west_win = rasterio.windows.Window(0, row_off, west_w, win_h)

    east_raw = src.read(1, window=east_win).astype(np.float64)
    west_raw = src.read(1, window=west_win).astype(np.float64)
    east_mask = src.read_masks(1, window=east_win) > 0
    west_mask = src.read_masks(1, window=west_win) > 0

    east_scaled, east_valid = _apply_scale_offset_masked(east_raw, east_mask, src)
    west_scaled, west_valid = _apply_scale_offset_masked(west_raw, west_mask, src)

    band_data = np.concatenate([east_scaled, west_scaled], axis=1)
    src_valid = np.concatenate([east_valid, west_valid], axis=1)

    strip_origin_x = origin_x + east_col_off * dx
    strip_origin_y = origin_y + row_off * dy
    cols_f = ((src_xs_360 - strip_origin_x) / dx) - 0.5
    rows_f = ((src_ys - strip_origin_y) / dy) - 0.5
    return cols_f, rows_f, band_data, src_valid
