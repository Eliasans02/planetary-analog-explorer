# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Source manifest validation, coordinate conversion, AOI checks, and NASA POWER ingestion."""

from __future__ import annotations

import hashlib
import ipaddress
import json
import math
import os
import pathlib
import re
import tempfile
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse

import requests
from shapely.geometry import Point, shape

from pae_pipeline.export import atomic_write_bytes, atomic_write_json, sha256_file
from pae_pipeline.scoring import CANONICAL_UNITS

POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_PARAMETERS = "T2M_MIN,T2M_MAX,ALLSKY_SFC_SW_DWN,RH2M"
POWER_COMMUNITY = "RE"
POWER_TIME_STANDARD = "UTC"
MAX_POWER_RESPONSE_BYTES: int = 16 * 1024 * 1024
MAX_SOURCE_DOWNLOAD_BYTES: int = 512 * 1024 * 1024
MAX_HTTPS_REDIRECTS: int = 5

DECLARED_RESEARCH_REGIONS: tuple[str, ...] = (
    "Shackleton",
    "Haworth",
    "Jezero",
    "Arcadia Planitia",
    "Atacama",
    "McMurdo Dry Valleys",
    "Mauna Kea",
    "Iceland Highlands",
    "Charyn",
    "Mangystau",
)

BODY_TO_OUTPUT_FRAME: dict[str, str] = {
    "earth": "earth_wgs84",
    "moon": "moon_iau_planetocentric",
    "mars": "mars_iau_planetocentric",
}

SUPPORTED_SOURCE_FRAMES: frozenset[str] = frozenset(
    {
        "earth_wgs84",
        "moon_iau_planetocentric",
        "moon_iau_planetographic",
        "mars_iau_planetocentric",
        "mars_iau_planetographic",
    }
)

SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
REL_PATH_RE = re.compile(r"^(?!/)(?!.*(?:^|/)\.\.{1,2}(?:/|$))[A-Za-z0-9_./-]+$")
YYYYMMDD_RE = re.compile(r"^\d{8}$")


class DataReadinessError(RuntimeError):
    """Raised when required manifests, sourced assets, or calibration inputs are missing."""


class ManifestValidationError(ValueError):
    """Raised when sites_manifest.json violates the strict input contract."""


class OfflineCacheMissError(DataReadinessError):
    """Raised when offline mode encounters a missing or unverified cache entry."""


class UnsupportedUnitError(ValueError):
    """Raised when an external response or input file declares an unknown or unsupported unit."""


class SourceVerificationError(ValueError):
    """Raised when a local source file is missing, escapes root, or fails SHA-256 verification."""


def _is_finite_real(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _reject_non_finite(constant: str) -> Any:
    raise ManifestValidationError(f"Invalid non-finite JSON constant {constant!r}")


def _sanitize_url_for_error(url: str) -> str:
    """Strip any userinfo/query secrets from a URL before including it in error text."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "<invalid-host>"
        port = f":{parsed.port}" if parsed.port is not None else ""
        return f"{parsed.scheme}://{host}{port}{parsed.path}"
    except Exception:
        return "<invalid-url>"


def validate_https_url(url: Any, label: str = "url") -> str:
    """Strictly validate an https:// URL without embedded credentials or private/loopback hosts."""
    if not isinstance(url, str) or not url or any(ch.isspace() or ord(ch) < 32 for ch in url):
        raise ManifestValidationError(f"{label} must be a valid non-empty https:// URL without whitespace")
    try:
        parsed = urlparse(url)
        port = parsed.port
    except ValueError as exc:
        raise ManifestValidationError(f"{label} has malformed URL syntax") from exc

    if parsed.scheme.lower() != "https":
        raise ManifestValidationError(f"{label} must use https:// scheme")
    if not parsed.netloc or not parsed.hostname:
        raise ManifestValidationError(f"{label} is missing host")
    if parsed.username is not None or parsed.password is not None or "@" in parsed.netloc:
        raise ManifestValidationError(f"{label} must not embed userinfo credentials")
    if port is not None and not (1 <= port <= 65535):
        raise ManifestValidationError(f"{label} has out-of-range port")

    host_l = parsed.hostname.rstrip(".").lower()
    if host_l in {"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"} or host_l.endswith(
        (".localhost", ".local", ".internal")
    ):
        raise ManifestValidationError(f"{label} rejects local/internal host {host_l!r}")
    try:
        ip = ipaddress.ip_address(host_l)
    except ValueError:
        ip = None
        # Resolver APIs accept legacy integer, shortened, octal and hexadecimal
        # IPv4 spellings that ipaddress intentionally rejects. Do not reinterpret
        # those ambiguous literals as DNS names. Require conventional DNS labels
        # and a nonnumeric final label; no DNS/network lookup is performed here.
        labels = host_l.split(".")
        if (
            len(host_l) > 253
            or not all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", part) for part in labels)
            or re.fullmatch(r"(?:[0-9]+|0x[0-9a-f]+)", labels[-1])
        ):
            raise ManifestValidationError(f"{label} rejects malformed or ambiguous numeric host {host_l!r}")
    if ip is not None and (not ip.is_global or ip.is_multicast or ip.is_reserved):
        raise ManifestValidationError(f"{label} rejects non-public IP destination {host_l!r}")
    return url


def resolve_safe_path(raw_path: str | pathlib.Path, root: pathlib.Path) -> pathlib.Path:
    """Resolve ``raw_path`` under ``root`` and reject absolute paths or symlink escapes."""
    root_resolved = pathlib.Path(root).resolve()
    candidate = pathlib.Path(raw_path)
    if candidate.is_absolute():
        raise SourceVerificationError(f"Absolute path is not allowed: {raw_path!r}")
    if ".." in candidate.parts:
        raise SourceVerificationError(f"Parent traversal '..' is not allowed: {raw_path!r}")
    resolved = (root_resolved / candidate).resolve()
    if not resolved.is_relative_to(root_resolved):
        raise SourceVerificationError(
            f"Resolved path {resolved} escapes allowed root {root_resolved}"
        )
    return resolved


def normalize_east_longitude(
    lon_deg: float,
    *,
    longitude_domain: str = "minus180_to_180",
    east_positive: bool = True,
) -> float:
    """Validate longitude in declared domain first, then convert to east-positive [-180, 180] deg."""
    if not _is_finite_real(lon_deg):
        raise ManifestValidationError(f"Non-finite longitude {lon_deg!r}")
    val = float(lon_deg)
    if longitude_domain == "0_to_360":
        if val < 0.0 or val > 360.0:
            raise ManifestValidationError(
                f"Longitude {lon_deg} out of declared 0_to_360 domain"
            )
    elif longitude_domain == "minus180_to_180":
        if val < -180.0 or val > 180.0:
            raise ManifestValidationError(
                f"Longitude {lon_deg} out of declared minus180_to_180 domain"
            )
    else:
        raise ManifestValidationError(f"Unsupported longitude_domain {longitude_domain!r}")

    if not east_positive:
        val = -val

    wrapped = ((val + 180.0) % 360.0) - 180.0
    if wrapped == -180.0 and val > 0.0 and math.isclose(val, 180.0, abs_tol=1e-12):
        wrapped = 180.0
    return float(wrapped)


def convert_coordinates_to_output_frame(coord_cfg: dict[str, Any], body: str) -> dict[str, Any]:
    """Convert sourced site coordinates mathematically into the body's output frame.

    Planetographic latitudes are converted to planetocentric latitudes using the
    explicit ellipsoid radii rather than silently relabelling frames.
    """
    expected_out_frame = BODY_TO_OUTPUT_FRAME[body]
    source_frame = str(coord_cfg["frame"])
    if not source_frame.startswith(f"{body}_"):
        raise ManifestValidationError(
            f"Coordinate frame {source_frame!r} is incompatible with body {body!r}"
        )

    lat_in = float(coord_cfg["latitude_deg"])
    if lat_in < -90.0 or lat_in > 90.0:
        raise ManifestValidationError(f"Latitude {lat_in} out of [-90, 90]")

    lon_domain = str(coord_cfg.get("longitude_domain", "minus180_to_180"))
    east_pos = bool(coord_cfg.get("east_positive", True))
    lon_out = normalize_east_longitude(
        float(coord_cfg["longitude_deg"]),
        longitude_domain=lon_domain,
        east_positive=east_pos,
    )

    if source_frame == expected_out_frame:
        lat_out = lat_in
        conversion_method = "direct_frame_match_east_lon_normalized"
    elif source_frame.endswith("_iau_planetographic"):
        ellipsoid = coord_cfg.get("ellipsoid")
        if not isinstance(ellipsoid, dict):
            raise ManifestValidationError(
                f"Planetographic frame {source_frame!r} requires explicit 'ellipsoid' "
                "{semi_major_m, semi_minor_m} for mathematical conversion to planetocentric"
            )
        a = ellipsoid.get("semi_major_m")
        b = ellipsoid.get("semi_minor_m")
        if not _is_finite_real(a) or not _is_finite_real(b) or float(a) <= 0 or float(b) <= 0:
            raise ManifestValidationError(f"Invalid ellipsoid radii in coordinates: {ellipsoid!r}")
        ratio_sq = (float(b) / float(a)) ** 2
        if abs(lat_in) == 90.0:
            lat_out = lat_in
        else:
            lat_out = math.degrees(math.atan(ratio_sq * math.tan(math.radians(lat_in))))
        conversion_method = (
            f"planetographic_to_planetocentric_ellipsoid(a={float(a)},b={float(b)})"
        )
    else:
        raise ManifestValidationError(f"Unsupported coordinate source frame {source_frame!r}")

    return {
        "latitude_deg": float(lat_out),
        "longitude_deg": float(lon_out),
        "frame": expected_out_frame,
        "source_ids": list(coord_cfg["source_ids"]),
        "conversion_provenance": {
            "source_frame": source_frame,
            "source_latitude_deg": lat_in,
            "source_longitude_deg": float(coord_cfg["longitude_deg"]),
            "longitude_domain": lon_domain,
            "east_positive": east_pos,
            "method": conversion_method,
        },
    }


def _validate_source_record(src: dict[str, Any], site_id: str) -> None:
    required = {
        "id",
        "provider",
        "product_id",
        "product_url",
        "mission",
        "access_url",
        "retrieved_at",
        "sha256",
        "license",
        "local_path",
    }
    optional = {"sidecar_path", "sidecar_sha256", "crs_metadata"}
    if not isinstance(src, dict):
        raise ManifestValidationError(f"Site '{site_id}' source entry must be an object")
    missing = required - set(src.keys())
    if missing:
        raise ManifestValidationError(
            f"Site '{site_id}' source missing required keys: {sorted(missing)}"
        )
    extra = set(src.keys()) - (required | optional)
    if extra:
        raise ManifestValidationError(
            f"Site '{site_id}' source has unexpected keys: {sorted(extra)}"
        )

    for text_key in ("id", "provider", "product_id", "license"):
        if not isinstance(src[text_key], str) or not src[text_key].strip():
            raise ManifestValidationError(
                f"Site '{site_id}' source '{src.get('id')}' invalid '{text_key}'"
            )
    if src["mission"] is not None and (not isinstance(src["mission"], str) or not src["mission"].strip()):
        raise ManifestValidationError(
            f"Site '{site_id}' source '{src['id']}' mission must be null or non-empty string"
        )
    for url_key in ("product_url", "access_url"):
        validate_https_url(src[url_key], f"Site '{site_id}' source '{src['id']}' {url_key}")
    try:
        dt = datetime.fromisoformat(str(src["retrieved_at"]).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            raise ValueError("missing timezone")
    except ValueError as exc:
        raise ManifestValidationError(
            f"Site '{site_id}' source '{src['id']}' retrieved_at must be ISO-8601 UTC date-time"
        ) from exc

    if not isinstance(src["sha256"], str) or not SHA256_RE.match(src["sha256"]):
        raise ManifestValidationError(
            f"Site '{site_id}' source '{src['id']}' sha256 must be 64 lowercase hex chars"
        )
    if not isinstance(src["local_path"], str) or not REL_PATH_RE.match(src["local_path"]):
        raise ManifestValidationError(
            f"Site '{site_id}' source '{src['id']}' local_path must be safe relative path"
        )
    if "sidecar_path" in src and src["sidecar_path"] is not None:
        if not isinstance(src["sidecar_path"], str) or not REL_PATH_RE.match(src["sidecar_path"]):
            raise ManifestValidationError(
                f"Site '{site_id}' source '{src['id']}' invalid sidecar_path"
            )
        if "sidecar_sha256" not in src or not SHA256_RE.match(str(src["sidecar_sha256"])):
            raise ManifestValidationError(
                f"Site '{site_id}' source '{src['id']}' sidecar_path requires valid sidecar_sha256"
            )


def _validate_site_entry(site: dict[str, Any]) -> None:
    required = {
        "id",
        "name",
        "body",
        "coordinates",
        "aoi",
        "dem",
        "missions",
        "sources",
    }
    optional = {
        "region_status",
        "power_query",
        "observations",
        "geology",
        "splat",
        "camera",
    }
    if not isinstance(site, dict):
        raise ManifestValidationError("Each site entry must be an object")
    missing = required - set(site.keys())
    if missing:
        raise ManifestValidationError(
            f"Site {site.get('id', '<unknown>')!r} missing required keys: {sorted(missing)}"
        )
    extra = set(site.keys()) - (required | optional)
    if extra:
        raise ManifestValidationError(
            f"Site {site['id']!r} has unexpected keys: {sorted(extra)}"
        )

    sid = site["id"]
    if not isinstance(sid, str) or not SAFE_ID_RE.match(sid):
        raise ManifestValidationError(f"Site id must match [A-Za-z0-9_-]+, got {sid!r}")
    if not isinstance(site["name"], str) or not site["name"].strip():
        raise ManifestValidationError(f"Site '{sid}' name must be non-empty string")
    body = site["body"]
    if body not in BODY_TO_OUTPUT_FRAME:
        raise ManifestValidationError(f"Site '{sid}' invalid body {body!r}")

    missions = site["missions"]
    if (
        not isinstance(missions, list)
        or len(set(missions)) != len(missions)
        or any(not isinstance(m, str) or not m.strip() for m in missions)
    ):
        raise ManifestValidationError(
            f"Site '{sid}' missions must be a list of unique non-empty strings"
        )

    sources_list = site["sources"]
    if not isinstance(sources_list, list) or len(sources_list) == 0:
        raise ManifestValidationError(f"Site '{sid}' must declare at least one source record")
    site_source_ids: set[str] = set()
    for src in sources_list:
        _validate_source_record(src, sid)
        if src["id"] in site_source_ids:
            raise ManifestValidationError(f"Site '{sid}' duplicate source id {src['id']!r}")
        site_source_ids.add(src["id"])

    # Coordinates
    coords = site["coordinates"]
    coord_req = {"latitude_deg", "longitude_deg", "frame", "source_ids"}
    coord_opt = {"longitude_domain", "east_positive", "ellipsoid"}
    if not isinstance(coords, dict) or not coord_req.issubset(coords.keys()):
        raise ManifestValidationError(f"Site '{sid}' coordinates missing required fields")
    if set(coords.keys()) - (coord_req | coord_opt):
        raise ManifestValidationError(f"Site '{sid}' coordinates have unexpected fields")
    if coords["frame"] not in SUPPORTED_SOURCE_FRAMES:
        raise ManifestValidationError(f"Site '{sid}' unsupported frame {coords['frame']!r}")
    for ref in coords["source_ids"]:
        if ref not in site_source_ids:
            raise ManifestValidationError(
                f"Site '{sid}' coordinates reference unknown source_id {ref!r}"
            )
    convert_coordinates_to_output_frame(coords, body)

    # AOI
    aoi = site["aoi"]
    aoi_req = {"local_path", "sha256", "access_url", "frame", "source_ids"}
    if not isinstance(aoi, dict) or set(aoi.keys()) != aoi_req:
        raise ManifestValidationError(
            f"Site '{sid}' aoi must have exact keys {sorted(aoi_req)}"
        )
    if not isinstance(aoi["local_path"], str) or not REL_PATH_RE.match(aoi["local_path"]):
        raise ManifestValidationError(f"Site '{sid}' aoi.local_path must be safe relative path")
    if not isinstance(aoi["sha256"], str) or not SHA256_RE.match(aoi["sha256"]):
        raise ManifestValidationError(f"Site '{sid}' aoi.sha256 invalid")
    validate_https_url(aoi["access_url"], f"Site '{sid}' aoi.access_url")
    if aoi["frame"] != BODY_TO_OUTPUT_FRAME[body]:
        raise ManifestValidationError(
            f"Site '{sid}' aoi.frame {aoi['frame']!r} must match {BODY_TO_OUTPUT_FRAME[body]!r}"
        )
    if not aoi["source_ids"] or any(r not in site_source_ids for r in aoi["source_ids"]):
        raise ManifestValidationError(f"Site '{sid}' aoi.source_ids invalid or unknown")

    # DEM
    dem = site["dem"]
    dem_req = {
        "local_path",
        "sha256",
        "vertical_datum",
        "vertical_units",
        "label_path",
        "label_sha256",
        "source_ids",
    }
    if not isinstance(dem, dict) or set(dem.keys()) != dem_req:
        raise ManifestValidationError(
            f"Site '{sid}' dem must have exact keys {sorted(dem_req)}"
        )
    for pkey in ("local_path", "label_path"):
        if not isinstance(dem[pkey], str) or not REL_PATH_RE.match(dem[pkey]):
            raise ManifestValidationError(f"Site '{sid}' dem.{pkey} must be safe relative path")
    for hkey in ("sha256", "label_sha256"):
        if not isinstance(dem[hkey], str) or not SHA256_RE.match(dem[hkey]):
            raise ManifestValidationError(f"Site '{sid}' dem.{hkey} invalid sha256")
    if not isinstance(dem["vertical_datum"], str) or not dem["vertical_datum"].strip():
        raise ManifestValidationError(f"Site '{sid}' dem.vertical_datum must be non-empty")
    if str(dem["vertical_units"]).lower() not in {"m", "meter", "meters", "metre", "metres"}:
        raise UnsupportedUnitError(
            f"Site '{sid}' dem.vertical_units {dem['vertical_units']!r} unsupported (must be meters)"
        )
    if not dem["source_ids"] or any(r not in site_source_ids for r in dem["source_ids"]):
        raise ManifestValidationError(f"Site '{sid}' dem.source_ids invalid or unknown")

    # Optional power_query
    if "power_query" in site and site["power_query"] is not None:
        if body != "earth":
            raise ManifestValidationError(
                f"Site '{sid}' power_query is only valid for Earth locations"
            )
        pq = site["power_query"]
        pq_req = {"latitude_deg", "longitude_deg", "start", "end", "sampling_note"}
        if not isinstance(pq, dict) or set(pq.keys()) != pq_req:
            raise ManifestValidationError(
                f"Site '{sid}' power_query must have exact keys {sorted(pq_req)}"
            )
        if not _is_finite_real(pq["latitude_deg"]) or not (-90.0 <= float(pq["latitude_deg"]) <= 90.0):
            raise ManifestValidationError(f"Site '{sid}' power_query latitude_deg out of range")
        if not _is_finite_real(pq["longitude_deg"]) or not (-180.0 <= float(pq["longitude_deg"]) <= 180.0):
            raise ManifestValidationError(f"Site '{sid}' power_query longitude_deg out of range")
        if not YYYYMMDD_RE.match(str(pq["start"])) or not YYYYMMDD_RE.match(str(pq["end"])):
            raise ManifestValidationError(f"Site '{sid}' power_query dates must be YYYYMMDD")
        if str(pq["start"]) > str(pq["end"]):
            raise ManifestValidationError(f"Site '{sid}' power_query start > end")
        if not isinstance(pq["sampling_note"], str) or not pq["sampling_note"].strip():
            raise ManifestValidationError(f"Site '{sid}' power_query requires sampling_note")

    # Optional geology (reject SoilGrids masquerading as mineralogy/geology)
    if "geology" in site and site["geology"] is not None:
        geo = site["geology"]
        if not isinstance(geo, dict):
            raise ManifestValidationError(f"Site '{sid}' geology must be an object")
        for ref in geo.get("source_ids", []):
            if ref not in site_source_ids:
                raise ManifestValidationError(
                    f"Site '{sid}' geology references unknown source_id {ref!r}"
                )
            matching_src = next(s for s in sources_list if s["id"] == ref)
            if "soilgrids" in matching_src["provider"].lower() or "soilgrids" in matching_src["product_id"].lower():
                if geo.get("classes"):
                    raise ManifestValidationError(
                        f"Site '{sid}' SoilGrids is predicted soil properties, not mineralogy; "
                        "cannot populate geology.classes"
                    )

    # Optional observations
    if "observations" in site and site["observations"] is not None:
        obs = site["observations"]
        if not isinstance(obs, dict):
            raise ManifestValidationError(f"Site '{sid}' observations must be an object")
        allowed_obs = {
            "temp_min_c",
            "temp_max_c",
            "solar_irradiance_kwh_m2",
            "aridity_index",
            "albedo",
        }
        unknown_obs = set(obs.keys()) - allowed_obs
        if unknown_obs:
            raise ManifestValidationError(
                f"Site '{sid}' observations contain unsupported keys: {sorted(unknown_obs)}"
            )
        for okey, oentry in obs.items():
            if not isinstance(oentry, dict):
                raise ManifestValidationError(f"Site '{sid}' observation '{okey}' must be object")
            if oentry.get("unit") != CANONICAL_UNITS[okey]:
                raise UnsupportedUnitError(
                    f"Site '{sid}' observation '{okey}' unit {oentry.get('unit')!r} != "
                    f"{CANONICAL_UNITS[okey]!r}"
                )
            for ref in oentry.get("source_ids", []):
                if ref not in site_source_ids:
                    raise ManifestValidationError(
                        f"Site '{sid}' observation '{okey}' references unknown source_id {ref!r}"
                    )


def load_manifest(path: pathlib.Path) -> dict[str, object]:
    """Load and strictly validate ``sites_manifest.json``."""
    manifest_path = pathlib.Path(path)
    if not manifest_path.is_file():
        raise DataReadinessError(f"Manifest file does not exist: {manifest_path}")

    text = manifest_path.read_text(encoding="utf-8")
    data = json.loads(text, parse_constant=_reject_non_finite)
    if not isinstance(data, dict):
        raise ManifestValidationError("Manifest root must be a JSON object")
    if set(data.keys()) != {"schema_version", "sites"}:
        raise ManifestValidationError(
            f"Manifest root must have exact keys ['schema_version', 'sites'], got {sorted(data.keys())}"
        )
    if data["schema_version"] != "1.0.0":
        raise ManifestValidationError(
            f"Unsupported manifest schema_version {data['schema_version']!r}; expected '1.0.0'"
        )
    if not isinstance(data["sites"], list):
        raise ManifestValidationError("Manifest 'sites' must be an array")

    seen_site_ids: set[str] = set()
    for site in data["sites"]:
        _validate_site_entry(site)
        sid = site["id"]
        if sid in seen_site_ids:
            raise ManifestValidationError(f"Duplicate site id in manifest: {sid!r}")
        seen_site_ids.add(sid)

    return data


def _power_cache_key(latitude_deg: float, longitude_deg: float, start: str, end: str) -> str:
    canonical = f"{latitude_deg:.6f}|{longitude_deg:.6f}|{start}|{end}|{POWER_COMMUNITY}|{POWER_TIME_STANDARD}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]


def _power_cell_key(grid_lat: float, grid_lon: float, start: str, end: str) -> str:
    return f"{grid_lat:.4f}|{grid_lon:.4f}|{start}|{end}"


def _build_power_url(latitude_deg: float, longitude_deg: float, start: str, end: str) -> str:
    query = urlencode(
        {
            "parameters": POWER_PARAMETERS,
            "community": POWER_COMMUNITY,
            "longitude": f"{longitude_deg:.6f}",
            "latitude": f"{latitude_deg:.6f}",
            "start": start,
            "end": end,
            "format": "JSON",
            "time-standard": POWER_TIME_STANDARD,
        }
    )
    return f"{POWER_ENDPOINT}?{query}"


def _parse_power_payload(
    payload: dict[str, Any],
    *,
    query_url: str,
    raw_sha256: str,
    retrieved_at: str,
    local_path: str,
    start: str,
    end: str,
) -> dict[str, object]:
    """Parse NASA POWER JSON payload using units and fill_value declared IN THE RESPONSE."""
    header = payload.get("header")
    if not isinstance(header, dict):
        raise ValueError("NASA POWER response missing 'header'")
    if "fill_value" not in header or not _is_finite_real(header["fill_value"]):
        raise ValueError("NASA POWER response header missing numeric 'fill_value'")
    fill_value = float(header["fill_value"])

    api_info = header.get("api") if isinstance(header.get("api"), dict) else {}
    api_version = str(api_info.get("version", "unknown"))

    params_meta = payload.get("parameters")
    props = payload.get("properties")
    if not isinstance(params_meta, dict) or not isinstance(props, dict):
        raise ValueError("NASA POWER response missing 'parameters' or 'properties'")
    param_series = props.get("parameter")
    if not isinstance(param_series, dict):
        raise ValueError("NASA POWER response missing 'properties.parameter'")

    def _extract_valid_values(param_name: str) -> tuple[list[float], str]:
        meta = params_meta.get(param_name)
        series = param_series.get(param_name)
        if not isinstance(meta, dict) or not isinstance(series, dict):
            raise ValueError(f"NASA POWER response missing parameter '{param_name}'")
        unit = meta.get("units")
        if not isinstance(unit, str) or not unit.strip():
            raise UnsupportedUnitError(f"NASA POWER parameter '{param_name}' missing units")
        vals: list[float] = []
        for _date_key, raw_val in sorted(series.items()):
            if not _is_finite_real(raw_val):
                continue
            fval = float(raw_val)
            if math.isclose(fval, fill_value, rel_tol=0.0, abs_tol=1e-9):
                continue
            vals.append(fval)
        return vals, unit.strip()

    def _to_celsius(vals: list[float], unit: str, param_name: str) -> list[float]:
        u = unit.lower()
        if u in {"c", "degc", "celsius", "°c"}:
            return vals
        if u in {"k", "kelvin"}:
            return [v - 273.15 for v in vals]
        raise UnsupportedUnitError(
            f"Unsupported temperature unit {unit!r} for NASA POWER parameter '{param_name}'"
        )

    def _to_kwh_m2_day(vals: list[float], unit: str) -> tuple[list[float], str]:
        u = unit.lower().replace(" ", "")
        if u in {"kw-hr/m^2/day", "kwh/m^2/day", "kwh/m2/day"}:
            return vals, "direct_kwh_m2_day"
        if u in {"mj/m^2/day", "mj/m2/day"}:
            return [v / 3.6 for v in vals], "converted_mj_m2_day_div_3.6"
        raise UnsupportedUnitError(
            f"Unsupported radiation unit {unit!r} for ALLSKY_SFC_SW_DWN"
        )

    t2m_min_raw, t2m_min_unit = _extract_valid_values("T2M_MIN")
    t2m_max_raw, t2m_max_unit = _extract_valid_values("T2M_MAX")
    sw_raw, sw_unit = _extract_valid_values("ALLSKY_SFC_SW_DWN")
    rh_raw, rh_unit = _extract_valid_values("RH2M")

    t2m_min_c = _to_celsius(t2m_min_raw, t2m_min_unit, "T2M_MIN")
    t2m_max_c = _to_celsius(t2m_max_raw, t2m_max_unit, "T2M_MAX")
    sw_kwh, sw_conv_method = _to_kwh_m2_day(sw_raw, sw_unit)

    period_start = f"{start[:4]}-{start[4:6]}-{start[6:8]}T00:00:00Z"
    period_end = f"{end[:4]}-{end[4:6]}-{end[6:8]}T23:59:59Z"

    geometry = payload.get("geometry") if isinstance(payload.get("geometry"), dict) else {}
    geom_coords = geometry.get("coordinates") if isinstance(geometry.get("coordinates"), list) else []

    return {
        "query_url": query_url,
        "sha256": raw_sha256,
        "retrieved_at": retrieved_at,
        "local_path": local_path,
        "api_version": api_version,
        "fill_value": fill_value,
        "period": {"start": period_start, "end": period_end},
        "grid_coordinates": geom_coords,
        "sampling_context": "point_sampling_coarse_grid_context",
        "temp_min_c": float(min(t2m_min_c)) if t2m_min_c else None,
        "temp_max_c": float(max(t2m_max_c)) if t2m_max_c else None,
        "solar_irradiance_kwh_m2": float(sum(sw_kwh) / len(sw_kwh)) if sw_kwh else None,
        "solar_conversion_method": sw_conv_method,
        "units_reported": {
            "T2M_MIN": t2m_min_unit,
            "T2M_MAX": t2m_max_unit,
            "ALLSKY_SFC_SW_DWN": sw_unit,
            "RH2M": rh_unit,
        },
        "contextual_metadata": {
            "RH2M_mean_pct": float(sum(rh_raw) / len(rh_raw)) if rh_raw else None,
            "RH2M_unit": rh_unit,
            "RH2M_valid_days": len(rh_raw),
            "note": "RH2M is retained strictly as contextual metadata; never used as aridity_index.",
        },
        "valid_days": {
            "T2M_MIN": len(t2m_min_c),
            "T2M_MAX": len(t2m_max_c),
            "ALLSKY_SFC_SW_DWN": len(sw_kwh),
            "RH2M": len(rh_raw),
        },
    }


def _open_verified_https_stream(
    session: requests.Session,
    url: str,
    *,
    timeout: tuple[int, int],
    max_bytes: int,
    label: str,
) -> requests.Response:
    """Issue a streamed GET with manual hop-by-hop HTTPS redirect validation before every request."""
    current_url = validate_https_url(url, label)
    for _hop in range(MAX_HTTPS_REDIRECTS + 1):
        resp = session.get(
            current_url,
            timeout=timeout,
            stream=True,
            allow_redirects=False,
        )
        status = int(getattr(resp, "status_code", 200))
        if status in {301, 302, 303, 307, 308}:
            headers = getattr(resp, "headers", {}) or {}
            location = headers.get("Location") or headers.get("location")
            resp.close()
            if not isinstance(location, str) or not location.strip():
                raise DataReadinessError(
                    f"{label} returned redirect HTTP {status} without Location header"
                )
            next_url = urljoin(current_url, location.strip())
            current_url = validate_https_url(next_url, f"{label} redirect target")
            continue

        resp.raise_for_status()
        resp_url = getattr(resp, "url", current_url)
        if isinstance(resp_url, str) and resp_url:
            validate_https_url(resp_url, f"{label} final response URL")
        headers = getattr(resp, "headers", {}) or {}
        cl_raw = headers.get("Content-Length") or headers.get("content-length")
        if cl_raw is not None:
            try:
                cl_int = int(str(cl_raw).strip())
            except ValueError as exc:
                resp.close()
                raise DataReadinessError(f"{label} returned invalid Content-Length") from exc
            if cl_int > max_bytes:
                resp.close()
                raise DataReadinessError(
                    f"{label} Content-Length {cl_int} exceeds byte quota {max_bytes}"
                )
        return resp

    raise DataReadinessError(f"{label} exceeded maximum HTTPS redirects ({MAX_HTTPS_REDIRECTS})")


def _read_stream_with_quota(
    resp: requests.Response,
    *,
    max_bytes: int,
    label: str,
) -> bytes:
    buf = bytearray()
    try:
        if hasattr(resp, "iter_content"):
            for chunk in resp.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                if len(buf) + len(chunk) > max_bytes:
                    raise DataReadinessError(
                        f"{label} response exceeded byte quota of {max_bytes} bytes"
                    )
                buf.extend(chunk)
        else:
            raw = resp.content
            if len(raw) > max_bytes:
                raise DataReadinessError(
                    f"{label} response exceeded byte quota of {max_bytes} bytes"
                )
            buf.extend(raw)
    finally:
        resp.close()
    return bytes(buf)


def fetch_power(
    latitude_deg: float,
    longitude_deg: float,
    start: str,
    end: str,
    cache_dir: pathlib.Path,
    *,
    offline: bool,
    max_bytes: int = MAX_POWER_RESPONSE_BYTES,
) -> dict[str, object]:
    """Fetch or load cached NASA POWER daily point data for an Earth AOI sample point.

    In ``offline=True`` mode, prohibits ALL network access, creates no directories on
    cache miss, and requires an exact-coordinate SHA-256 verified cache entry.
    """
    if not _is_finite_real(latitude_deg) or not (-90.0 <= float(latitude_deg) <= 90.0):
        raise ValueError(f"latitude_deg out of [-90, 90]: {latitude_deg!r}")
    if not _is_finite_real(longitude_deg) or not (-180.0 <= float(longitude_deg) <= 180.0):
        raise ValueError(f"longitude_deg out of [-180, 180]: {longitude_deg!r}")
    if not YYYYMMDD_RE.match(start) or not YYYYMMDD_RE.match(end) or start > end:
        raise ValueError(f"Invalid POWER date range start={start!r}, end={end!r}")
    if int(max_bytes) < 1:
        raise ValueError(f"max_bytes must be >= 1, got {max_bytes!r}")

    power_dir = pathlib.Path(cache_dir) / "power"
    lat_f = float(latitude_deg)
    lon_f = float(longitude_deg)
    key = _power_cache_key(lat_f, lon_f, start, end)
    data_path = power_dir / f"power_{key}.json"
    meta_path = power_dir / f"power_{key}.meta.json"

    if data_path.is_file() and meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        actual_sha = sha256_file(data_path)
        if actual_sha != meta.get("sha256"):
            raise SourceVerificationError(
                f"Cached NASA POWER file {data_path} SHA-256 mismatch: "
                f"expected {meta.get('sha256')}, got {actual_sha}"
            )
        if (
            not _is_finite_real(meta.get("latitude_deg"))
            or not _is_finite_real(meta.get("longitude_deg"))
            or abs(float(meta["latitude_deg"]) - lat_f) > 1e-9
            or abs(float(meta["longitude_deg"]) - lon_f) > 1e-9
            or meta.get("start") != start
            or meta.get("end") != end
        ):
            raise SourceVerificationError(
                f"Cached NASA POWER metadata {meta_path} coordinate/period mismatch"
            )
        expected_query_url = _build_power_url(lat_f, lon_f, start, end)
        query_url_meta = str(meta["query_url"])
        validate_https_url(query_url_meta, "Cached NASA POWER query_url")
        if query_url_meta != expected_query_url:
            raise SourceVerificationError(
                f"Cached NASA POWER metadata {meta_path} query_url does not match requested point"
            )
        payload = json.loads(
            data_path.read_text(encoding="utf-8"),
            parse_constant=_reject_non_finite,
        )
        return _parse_power_payload(
            payload,
            query_url=query_url_meta,
            raw_sha256=actual_sha,
            retrieved_at=str(meta["retrieved_at"]),
            local_path=str(data_path),
            start=start,
            end=end,
        )

    if offline:
        raise OfflineCacheMissError(
            f"Offline mode prohibits network requests and NASA POWER cache is missing for "
            f"lat={lat_f}, lon={lon_f}, start={start}, end={end} under {power_dir}"
        )

    query_url = _build_power_url(lat_f, lon_f, start, end)
    max_attempts = 3
    last_exc: Exception | None = None
    raw_bytes: bytes | None = None

    with requests.Session() as session:
        session.trust_env = False
        for attempt in range(1, max_attempts + 1):
            try:
                resp = _open_verified_https_stream(
                    session,
                    query_url,
                    timeout=(10, 30),
                    max_bytes=int(max_bytes),
                    label="NASA POWER query",
                )
                raw_bytes = _read_stream_with_quota(
                    resp,
                    max_bytes=int(max_bytes),
                    label="NASA POWER query",
                )
                break
            except ManifestValidationError:
                raise
            except (requests.RequestException, DataReadinessError, OSError) as exc:
                last_exc = exc
                if attempt < max_attempts:
                    time.sleep(min(2.0 ** (attempt - 1), 4.0))

    if raw_bytes is None:
        raise DataReadinessError(
            f"Failed to fetch NASA POWER after {max_attempts} attempts: {last_exc}"
        )

    payload = json.loads(raw_bytes.decode("utf-8"), parse_constant=_reject_non_finite)
    retrieved_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    power_dir.mkdir(parents=True, exist_ok=True)
    raw_sha256, _byte_len = atomic_write_bytes(data_path, raw_bytes)

    parsed = _parse_power_payload(
        payload,
        query_url=query_url,
        raw_sha256=raw_sha256,
        retrieved_at=retrieved_at,
        local_path=str(data_path),
        start=start,
        end=end,
    )

    meta_obj: dict[str, object] = {
        "query_url": query_url,
        "sha256": raw_sha256,
        "retrieved_at": retrieved_at,
        "api_version": parsed["api_version"],
        "start": start,
        "end": end,
        "latitude_deg": lat_f,
        "longitude_deg": lon_f,
    }
    atomic_write_json(meta_path, meta_obj)
    return parsed


def _stream_response_to_verified_file(
    resp: requests.Response,
    destination: pathlib.Path,
    *,
    expected_sha256: str,
    max_bytes: int,
    label: str,
) -> None:
    dest = pathlib.Path(destination)
    dest.parent.mkdir(parents=True, exist_ok=True)
    hasher = hashlib.sha256()
    total_bytes = 0
    tmp_path: pathlib.Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=dest.parent,
            prefix=f".{dest.name}.",
            suffix=".tmp",
            delete=False,
        ) as tmp_file:
            tmp_path = pathlib.Path(tmp_file.name)
            if hasattr(resp, "iter_content"):
                for chunk in resp.iter_content(chunk_size=65536):
                    if not chunk:
                        continue
                    total_bytes += len(chunk)
                    if total_bytes > max_bytes:
                        raise SourceVerificationError(
                            f"{label} download exceeded byte quota of {max_bytes} bytes"
                        )
                    hasher.update(chunk)
                    tmp_file.write(chunk)
            else:
                raw = resp.content
                total_bytes = len(raw)
                if total_bytes > max_bytes:
                    raise SourceVerificationError(
                        f"{label} download exceeded byte quota of {max_bytes} bytes"
                    )
                hasher.update(raw)
                tmp_file.write(raw)
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
        digest = hasher.hexdigest()
        if digest != expected_sha256:
            raise SourceVerificationError(
                f"Downloaded {label} SHA-256 mismatch: expected {expected_sha256}, got {digest}"
            )
        os.replace(tmp_path, dest)
    except Exception:
        if tmp_path is not None and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise
    finally:
        resp.close()


def ensure_verified_local_file(
    *,
    local_path: str,
    expected_sha256: str,
    access_url: str | None,
    repo_root: pathlib.Path,
    offline: bool,
    max_bytes: int = MAX_SOURCE_DOWNLOAD_BYTES,
) -> pathlib.Path:
    """Verify an existing declared local file or stream-download it in prepare mode."""
    if int(max_bytes) < 1:
        raise ValueError(f"max_bytes must be >= 1, got {max_bytes!r}")
    resolved = resolve_safe_path(local_path, repo_root)
    if resolved.is_file():
        actual = sha256_file(resolved)
        if actual != expected_sha256:
            raise SourceVerificationError(
                f"SHA-256 mismatch for {local_path}: expected {expected_sha256}, got {actual}"
            )
        return resolved

    if offline:
        raise OfflineCacheMissError(
            f"Required local source file missing in offline mode: {local_path}"
        )
    if not access_url:
        raise DataReadinessError(
            f"Missing local file {local_path} and no valid https:// access_url provided"
        )
    validate_https_url(access_url, f"Source '{local_path}' access_url")
    safe_label = _sanitize_url_for_error(access_url)

    max_attempts = 3
    last_exc: Exception | None = None
    with requests.Session() as session:
        session.trust_env = False
        for attempt in range(1, max_attempts + 1):
            try:
                resp = _open_verified_https_stream(
                    session,
                    access_url,
                    timeout=(10, 60),
                    max_bytes=int(max_bytes),
                    label=safe_label,
                )
                _stream_response_to_verified_file(
                    resp,
                    resolved,
                    expected_sha256=expected_sha256,
                    max_bytes=int(max_bytes),
                    label=safe_label,
                )
                return resolved
            except (ManifestValidationError, SourceVerificationError):
                raise
            except (requests.RequestException, DataReadinessError, OSError) as exc:
                last_exc = exc
                if attempt < max_attempts:
                    time.sleep(min(2.0 ** (attempt - 1), 4.0))

    raise DataReadinessError(
        f"Failed to download declared source {safe_label} after {max_attempts} attempts: {last_exc}"
    )


def validate_aoi_geojson(
    aoi_path: pathlib.Path,
    *,
    expected_lat_deg: float | None = None,
    expected_lon_deg: float | None = None,
) -> dict[str, Any]:
    """Validate an AOI GeoJSON file offline (rings, closure, bounds, antimeridian, membership)."""
    raw = json.loads(aoi_path.read_text(encoding="utf-8"), parse_constant=_reject_non_finite)
    if not isinstance(raw, dict):
        raise ManifestValidationError(f"AOI GeoJSON must be a JSON object: {aoi_path}")

    gtype = raw.get("type")
    geometries: list[dict[str, Any]] = []
    if gtype == "FeatureCollection":
        features = raw.get("features")
        if not isinstance(features, list) or len(features) == 0:
            raise ManifestValidationError(f"AOI FeatureCollection has no features: {aoi_path}")
        for feat in features:
            if isinstance(feat, dict) and isinstance(feat.get("geometry"), dict):
                geometries.append(feat["geometry"])
    elif gtype == "Feature":
        if isinstance(raw.get("geometry"), dict):
            geometries.append(raw["geometry"])
    elif gtype in {"Polygon", "MultiPolygon"}:
        geometries.append(raw)
    else:
        raise ManifestValidationError(f"Unsupported AOI GeoJSON type {gtype!r}: {aoi_path}")

    if not geometries:
        raise ManifestValidationError(f"No Polygon/MultiPolygon geometry found in {aoi_path}")

    def _check_ring(coords: list[Any]) -> None:
        if len(coords) < 4:
            raise ManifestValidationError(f"AOI ring has <4 vertices in {aoi_path}")
        if coords[0][:2] != coords[-1][:2]:
            raise ManifestValidationError(f"AOI ring is not closed in {aoi_path}")
        prev_lon: float | None = None
        for pt in coords:
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                raise ManifestValidationError(f"Invalid AOI coordinate tuple in {aoi_path}")
            lon, lat = pt[0], pt[1]
            if not _is_finite_real(lon) or not _is_finite_real(lat):
                raise ManifestValidationError(f"Non-finite AOI coordinate in {aoi_path}")
            lon_f, lat_f = float(lon), float(lat)
            if lon_f < -180.0 or lon_f > 180.0 or lat_f < -90.0 or lat_f > 90.0:
                raise ManifestValidationError(
                    f"AOI coordinate ({lon_f}, {lat_f}) out of [-180,180]x[-90,90] in {aoi_path}"
                )
            if prev_lon is not None and abs(lon_f - prev_lon) > 180.0:
                raise ManifestValidationError(
                    f"AOI ring crosses antimeridian without splitting (|dlon| > 180) in {aoi_path}"
                )
            prev_lon = lon_f

    union_geom = None
    for geom_dict in geometries:
        geom_type = geom_dict.get("type")
        coords = geom_dict.get("coordinates")
        if geom_type == "Polygon" and isinstance(coords, list):
            for ring in coords:
                _check_ring(ring)
        elif geom_type == "MultiPolygon" and isinstance(coords, list):
            for poly in coords:
                for ring in poly:
                    _check_ring(ring)
        else:
            raise ManifestValidationError(
                f"AOI geometry must be Polygon or MultiPolygon, got {geom_type!r}"
            )
        geom = shape(geom_dict)
        if not geom.is_valid or geom.is_empty or geom.area <= 0.0:
            raise ManifestValidationError(f"Invalid or zero-area AOI geometry in {aoi_path}")
        union_geom = geom if union_geom is None else union_geom.union(geom)

    if expected_lat_deg is not None and expected_lon_deg is not None:
        pt = Point(float(expected_lon_deg), float(expected_lat_deg))
        if not union_geom.covers(pt):
            raise ManifestValidationError(
                f"Site coordinate ({expected_lat_deg}, {expected_lon_deg}) lies outside AOI {aoi_path}"
            )

    return raw
