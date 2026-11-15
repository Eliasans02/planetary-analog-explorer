"""Materialize the verified B03 source in an isolated, reproducible preview folder."""
import hashlib
import json
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "incoming/dev_b_source_bundle_b03.json"
DEST = ROOT / "previews/b03"
EXPECTED = "9a6d29de8654d9baae7707cf69432728559f7bba003039c32b3a13d1977f7506"


def main() -> None:
    raw = SOURCE.read_bytes()
    if len(raw) != 336551 or hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError("Source receipt identity mismatch")
    records = json.loads(raw)["files"]
    if len(records) != 36:
        raise ValueError("Unexpected file count")
    checked = []
    seen = set()
    for record in records:
        name = record["path"]
        relative = PurePosixPath(name)
        if (relative.is_absolute() or ".." in relative.parts or "\\" in name
                or ":" in name or name.casefold() in seen):
            raise ValueError(f"Unsafe source path: {name}")
        seen.add(name.casefold())
        content = record["content"].encode("utf-8")
        if len(content) != record["bytes"] or hashlib.sha256(content).hexdigest() != record["sha256"]:
            raise ValueError(f"Source content mismatch: {name}")
        path = DEST.joinpath(*relative.parts)
        if not path.resolve().is_relative_to(DEST.resolve()):
            raise ValueError(f"Destination escape: {name}")
        if path.exists() and path.read_bytes() != content:
            raise ValueError(f"Refusing to overwrite modified preview: {name}")
        checked.append((path, content))
    for path, content in checked:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            with path.open("xb") as output:
                output.write(content)
    print(f"Materialized {len(checked)} verified files: {DEST}")
    print("Preview only; no scientific assets, tests or acceptance implied.")


if __name__ == "__main__":
    main()
