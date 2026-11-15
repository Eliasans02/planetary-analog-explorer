# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Atomic export and cryptographic digest helpers for the PAE data pipeline."""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import tempfile


def sha256_bytes(data: bytes) -> str:
    """Return lowercase hex SHA-256 digest of in-memory bytes."""
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path, *, chunk_size: int = 1024 * 1024) -> str:
    """Return lowercase hex SHA-256 digest of a file streamed in chunks."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write_bytes(destination: pathlib.Path, data: bytes) -> tuple[str, int]:
    """Write raw bytes atomically via a same-directory temporary file and fsync.

    Returns ``(sha256_hex, byte_length)``. Existing ``destination`` is left
    untouched if serialization or disk I/O fails.
    """
    dest = pathlib.Path(destination)
    dest.parent.mkdir(parents=True, exist_ok=True)
    digest = sha256_bytes(data)
    byte_length = len(data)

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
            tmp_file.write(data)
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
        os.replace(tmp_path, dest)
    except Exception:
        if tmp_path is not None and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise
    return digest, byte_length


def atomic_copy_file(
    source: pathlib.Path,
    destination: pathlib.Path,
    *,
    chunk_size: int = 1024 * 1024,
) -> tuple[str, int]:
    """Stream-copy ``source`` to ``destination`` atomically via a same-directory temp file.

    Returns ``(sha256_hex, byte_length)`` using O(chunk_size) memory.
    """
    src = pathlib.Path(source)
    dest = pathlib.Path(destination)
    dest.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    byte_length = 0

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
            with src.open("rb") as in_handle:
                while True:
                    chunk = in_handle.read(chunk_size)
                    if not chunk:
                        break
                    digest.update(chunk)
                    byte_length += len(chunk)
                    tmp_file.write(chunk)
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
        os.replace(tmp_path, dest)
    except Exception:
        if tmp_path is not None and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise
    return digest.hexdigest(), byte_length


def atomic_write_json(destination: pathlib.Path, value: dict[str, object]) -> None:
    """Serialize ``value`` strictly (rejecting NaN/Infinity) and write atomically."""
    if not isinstance(value, dict):
        raise TypeError(f"Expected dict for JSON export, got {type(value).__name__}")
    serialized = json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    atomic_write_bytes(destination, serialized.encode("utf-8"))

