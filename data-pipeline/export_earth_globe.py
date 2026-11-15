"""Export a deterministic NASA Blue Marble texture for Earth context."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import shutil
import urllib.request
from pathlib import Path

from PIL import Image, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/earth_context"
ASSET_DIR = ROOT / "web-client/public/assets/earth-context"
SOURCE = EVIDENCE / "world.200408.3x5400x2700.jpg"
TEXTURE = ASSET_DIR / "blue-marble-2048.jpg"
DETAIL_TEXTURE = ASSET_DIR / "blue-marble-5400.jpg"
MANIFEST = ASSET_DIR / "manifest.json"

SOURCE_URL = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/august/world.200408.3x5400x2700.jpg"
SOURCE_PAGE = "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: object):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def fetch_source() -> dict:
    receipt_path = EVIDENCE / "source_receipt.json"
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if not SOURCE.exists():
        request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "planetary-analog-explorer/1.0"})
        with urllib.request.urlopen(request, timeout=180) as response:
            data = response.read()
            headers = dict(response.headers.items())
        SOURCE.write_bytes(data)
        retrieved_at = dt.datetime.now(dt.timezone.utc).isoformat()
    else:
        headers = {}
        retrieved_at = dt.datetime.fromtimestamp(SOURCE.stat().st_mtime, dt.timezone.utc).isoformat()
        if receipt_path.exists() and json.loads(receipt_path.read_text()).get("canonical_url") == SOURCE_URL:
            previous = json.loads(receipt_path.read_text())
            retrieved_at = previous["retrieved_at"]
            headers = previous.get("http_headers", {})
    with Image.open(SOURCE) as image:
        if image.format != "JPEG" or image.mode != "RGB" or image.size != (5400, 2700):
            raise ValueError("Unexpected NASA Blue Marble source image")
        image.verify()
    receipt = {
        "canonical_url": SOURCE_URL,
        "source_page": SOURCE_PAGE,
        "local_path": SOURCE.relative_to(ROOT).as_posix(),
        "retrieved_at": retrieved_at,
        "http_headers": headers,
        "sha256": sha256(SOURCE),
        "bytes": SOURCE.stat().st_size,
        "width": 5400,
        "height": 2700,
        "identity_scope": "SHA256 identifies the complete downloaded NASA JPEG object.",
    }
    write_json(receipt_path, receipt)
    return receipt


def export():
    source = fetch_source()
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as image:
        texture = image.resize((2048, 1024), resample=Image.Resampling.LANCZOS)
        texture.save(
            TEXTURE,
            format="JPEG",
            quality=88,
            subsampling=2,
            optimize=True,
            progressive=False,
        )
    shutil.copyfile(SOURCE, DETAIL_TEXTURE)
    texture_hash = sha256(TEXTURE)
    detail_hash = sha256(DETAIL_TEXTURE)
    if detail_hash != source["sha256"] or DETAIL_TEXTURE.stat().st_size != source["bytes"]:
        raise ValueError("Detail texture must be an exact copy of the NASA source JPEG")
    manifest = {
        "schema_version": "1.0.0",
        "title": "NASA Blue Marble: Next Generation — August 2004",
        "credit": "NASA Earth Observatory / Blue Marble: Next Generation",
        "source_url": SOURCE_URL,
        "source_page": SOURCE_PAGE,
        "source_sha256": source["sha256"],
        "source_bytes": source["bytes"],
        "source_width": 5400,
        "source_height": 2700,
        "texture": {
            "url": "/assets/earth-context/blue-marble-2048.jpg",
            "sha256": texture_hash,
            "bytes": TEXTURE.stat().st_size,
            "width": 2048,
            "height": 1024,
        },
        "detail_texture": {
            "url": "/assets/earth-context/blue-marble-5400.jpg",
            "sha256": detail_hash,
            "bytes": DETAIL_TEXTURE.stat().st_size,
            "width": 5400,
            "height": 2700,
        },
        "disclaimer": "Historical monthly composite from August 2004 for planetary context imagery only; it is not the measured 600 m terrain used by the Earth analog search.",
    }
    write_json(MANIFEST, manifest)
    write_json(EVIDENCE / "derivation.json", {
        "operation": "Resize the complete source image from 5400x2700 to 2048x1024 with Pillow LANCZOS for the overview; copy the original JPEG bytes unchanged for optional detail. No crop, upscaling, compositing, generation, or content replacement.",
        "software": f"Pillow {pillow_version}",
        "resampling": "Pillow Image.Resampling.LANCZOS",
        "jpeg_settings": {"quality": 88, "subsampling": 2, "optimize": True, "progressive": False},
        "source_sha256": source["sha256"],
        "source_bytes": source["bytes"],
        "output_sha256": texture_hash,
        "output_bytes": TEXTURE.stat().st_size,
        "output_dimensions": [2048, 1024],
        "detail_operation": "Exact byte-for-byte copy of the downloaded NASA source JPEG; no decoding or resampling.",
        "detail_sha256": detail_hash,
        "detail_bytes": DETAIL_TEXTURE.stat().st_size,
        "detail_dimensions": [5400, 2700],
        "manifest_sha256": sha256(MANIFEST),
    })
    print(json.dumps({
        "manifest": str(MANIFEST),
        "source_sha256": source["sha256"],
        "source_bytes": source["bytes"],
        "texture_sha256": texture_hash,
        "texture_bytes": TEXTURE.stat().st_size,
        "detail_texture_sha256": detail_hash,
        "detail_texture_bytes": DETAIL_TEXTURE.stat().st_size,
    }, indent=2))


if __name__ == "__main__":
    export()
