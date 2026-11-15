"""Bounded, non-executing ZIP import for external source review (Python 3.11+).

All archive metadata and payloads are checked before creating the destination.
Sensitive files are neither extracted nor embedded. Secret detection is heuristic:
inspect REVIEW_BUNDLE.json before sending it outside the local machine.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import struct
import sys
import unicodedata
import zipfile
from dataclasses import dataclass

MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
MAX_TOTAL_BYTES = 100 * 1024 * 1024
MAX_ENTRY_BYTES = 10 * 1024 * 1024
MAX_ENTRIES = 2000
MAX_COMPRESSION_RATIO = 200
MAX_CENTRAL_BYTES = 4 * 1024 * 1024
MAX_PATH_BYTES = 1024
MAX_DEPTH = 32
CHUNK_BYTES = 64 * 1024
PROJECT_ROOT = Path(__file__).resolve().parents[1]


class BundleError(ValueError):
    """Only fixed, non-sensitive error codes are exposed by the CLI."""


@dataclass(frozen=True)
class Entry:
    path: str
    data: bytes
    sha256: str
    text: str | None
    exclusion: str | None
    sensitive: bool


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _lexists(path: Path) -> bool:
    return os.path.lexists(path)


def _is_link_or_reparse(path: Path) -> bool:
    mode = path.lstat()
    flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    return stat.S_ISLNK(mode.st_mode) or bool(
        getattr(mode, "st_file_attributes", 0) & flag
    )


def _check_existing_parents(path: Path, root: Path) -> None:
    """Reject existing links/junctions and non-directory ancestors."""
    try:
        parts = path.relative_to(root).parts
    except ValueError:
        raise BundleError("destination_outside_incoming") from None
    current = root
    for part in (None, *parts):
        if part is not None:
            current = current / part
        if _lexists(current):
            if _is_link_or_reparse(current):
                raise BundleError("destination_link_or_reparse")
            if not current.is_dir():
                raise BundleError("destination_parent_not_directory")


def _destination(out: Path, project_root: Path) -> Path:
    project_root = project_root.resolve(strict=True)
    incoming = project_root / "incoming"
    if ".." in out.parts:
        raise BundleError("destination_dot_segment")
    candidate = out if out.is_absolute() else project_root / out
    candidate = Path(os.path.abspath(candidate))
    try:
        relative = candidate.relative_to(incoming)
    except ValueError:
        raise BundleError("destination_outside_incoming") from None
    if not relative.parts:
        raise BundleError("destination_must_be_child")
    _check_existing_parents(candidate.parent, project_root)
    if _lexists(candidate):
        raise BundleError("destination_already_exists")
    if not candidate.resolve(strict=False).is_relative_to(incoming.resolve(strict=False)):
        raise BundleError("destination_outside_incoming")
    return candidate


def _read_archive(path: Path) -> bytes:
    try:
        # Refuse pipes/devices before open(), which could otherwise block.
        if not stat.S_ISREG(path.stat().st_mode):
            raise BundleError("archive_not_regular_file")
        with path.open("rb") as handle:
            metadata = os.fstat(handle.fileno())
            if not stat.S_ISREG(metadata.st_mode):
                raise BundleError("archive_not_regular_file")
            if metadata.st_size > MAX_ARCHIVE_BYTES:
                raise BundleError("archive_size_limit")
            data = handle.read(MAX_ARCHIVE_BYTES + 1)
    except BundleError:
        raise
    except OSError:
        raise BundleError("archive_unreadable") from None
    if len(data) > MAX_ARCHIVE_BYTES:
        raise BundleError("archive_size_limit")
    return data


def _check_zip_envelope(data: bytes) -> int:
    """Bound the central directory before zipfile allocates ZipInfo objects."""
    marker = data.rfind(b"PK\x05\x06", max(0, len(data) - 65557))
    if marker < 0 or marker + 22 > len(data):
        raise BundleError("invalid_zip_end_record")
    _, disk, central_disk, disk_count, count, central_size, offset, comment = (
        struct.unpack_from("<4s4H2IH", data, marker)
    )
    if marker + 22 + comment != len(data):
        raise BundleError("invalid_zip_end_record")
    if disk or central_disk or disk_count != count:
        raise BundleError("multipart_zip_not_supported")
    if count == 0xFFFF or central_size == 0xFFFFFFFF or offset == 0xFFFFFFFF:
        raise BundleError("zip64_not_supported")
    if not 0 < count <= MAX_ENTRIES:
        raise BundleError("entry_count_limit")
    if central_size > MAX_CENTRAL_BYTES or offset + central_size != marker:
        raise BundleError("invalid_central_directory")
    if data[:4] != b"PK\x03\x04":
        raise BundleError("prefixed_or_empty_zip_not_supported")
    return count


def _safe_name(info: zipfile.ZipInfo) -> tuple[str, bool]:
    raw = info.orig_filename
    if not raw or "\x00" in raw or "\\" in raw or raw.startswith("/"):
        raise BundleError("unsafe_archive_path")
    is_directory = raw.endswith("/")
    name = raw[:-1] if is_directory else raw
    if len(name.encode("utf-8")) > MAX_PATH_BYTES:
        raise BundleError("archive_path_limit")
    parts = name.split("/")
    if len(parts) > MAX_DEPTH:
        raise BundleError("archive_path_limit")
    reserved = {"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"}
    reserved |= {f"{base}{n}" for base in ("COM", "LPT") for n in "123456789¹²³"}
    for part in parts:
        if not part or part in (".", "..") or part.endswith((".", " ")):
            raise BundleError("unsafe_archive_path")
        if len(part.encode("utf-16-le")) // 2 > 255:
            raise BundleError("archive_path_limit")
        if any(c in '<>:"|?*' or ord(c) < 32 or ord(c) == 127
               or unicodedata.category(c) in ("Cf", "Cs") for c in part):
            raise BundleError("unsafe_archive_path")
        if part.split(".", 1)[0].upper() in reserved:
            raise BundleError("windows_reserved_path")
        if unicodedata.normalize("NFC", part) != part:
            raise BundleError("noncanonical_unicode_path")
    kind = stat.S_IFMT(info.external_attr >> 16)
    expected = stat.S_IFDIR if is_directory else stat.S_IFREG
    if kind not in (0, expected):
        raise BundleError("non_regular_archive_entry")
    if not is_directory and info.external_attr & 0x10:
        raise BundleError("inconsistent_directory_entry")
    return name, is_directory


def _validate_members(infos: list[zipfile.ZipInfo]) -> list[tuple[zipfile.ZipInfo, str]]:
    explicit: set[str] = set()
    paths: dict[str, tuple[str, bool]] = {}
    files: list[tuple[zipfile.ZipInfo, str]] = []
    total = 0
    for info in infos:
        name, is_directory = _safe_name(info)
        key = name.casefold()
        if key in explicit:
            raise BundleError("duplicate_or_case_collision")
        explicit.add(key)
        parts = name.split("/")
        for index in range(1, len(parts) + 1):
            prefix = "/".join(parts[:index])
            directory = index < len(parts) or is_directory
            previous = paths.get(prefix.casefold())
            if previous is not None and previous != (prefix, directory):
                raise BundleError("path_type_or_case_collision")
            paths[prefix.casefold()] = (prefix, directory)
        if info.flag_bits & 1:
            raise BundleError("encrypted_zip_not_supported")
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise BundleError("compression_method_not_supported")
        if info.file_size < 0 or info.file_size > MAX_ENTRY_BYTES:
            raise BundleError("entry_expanded_size_limit")
        if info.compress_size < 0 or info.compress_size > MAX_ARCHIVE_BYTES:
            raise BundleError("entry_compressed_size_limit")
        if info.file_size > max(info.compress_size, 1) * MAX_COMPRESSION_RATIO:
            raise BundleError("compression_ratio_limit")
        if is_directory:
            # A valid empty DEFLATE directory can have a two-byte stream.
            if info.file_size or info.compress_size > 64:
                raise BundleError("directory_has_payload")
            continue
        total += info.file_size
        if total > MAX_TOTAL_BYTES:
            raise BundleError("total_expanded_size_limit")
        files.append((info, name))
    return files


_TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc",
    ".py", ".pyi", ".toml", ".ini", ".cfg", ".yaml", ".yml", ".md",
    ".markdown", ".txt", ".css", ".scss", ".sass", ".html", ".htm",
    ".xml", ".svg", ".csv", ".tsv", ".sh", ".bat", ".cmd", ".ps1",
    ".sql", ".log", ".lock", ".example", ".sample", ".template",
}
_TEXT_NAMES = {"license", "notice", "dockerfile", "makefile", ".gitignore",
               ".gitattributes", ".editorconfig", ".dockerignore", ".nvmrc"}
_SECRET_NAMES = {".npmrc", ".pypirc", ".netrc", "id_rsa", "id_dsa", "id_ecdsa",
                 "id_ed25519", "credentials", "credentials.json", "token.json",
                 "tokens.json", "secrets.json", "secrets.yaml", "secrets.yml"}
_SECRET_PARTS = {".ssh", ".aws", ".azure", ".gcloud", ".gnupg"}
_PLACEHOLDER = re.compile(
    r"(?ix)^(?:|\*+|x+|<[^>]+>|\$\{[^}]+\}|your[-_ ].*|replace[-_ ].*|"
    r"change[-_ ]?me|example|placeholder|dummy|test[-_ ].*|undefined|null|none)$"
)
_PRIVATE_KEY = re.compile(r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----")
_KNOWN_TOKEN = re.compile(
    r"\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|"
    r"gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{30,}|"
    r"sk-(?:proj-|svcacct-)?[0-9A-Za-z_-]{20,})\b"
)
_CREDENTIAL_URL = re.compile(r"\b[a-zA-Z][a-zA-Z0-9+.-]*://[^\s/@]+:[^\s/@]+@")
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*")
_SENSITIVE_ASSIGNMENT = re.compile(
    r"(?im)[\"']?\b(?:[a-z0-9_-]*(?:api[_-]?key|access[_-]?token|"
    r"refresh[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|"
    r"private[_-]?key|secret[_-]?key)|token|secret)[\"']?\s*[:=]\s*"
    r"(?:[\"']([^\"'\r\n]+)[\"']|([^\s,;#}\r\n]+))"
)


def _sensitive_name(name: str) -> bool:
    parts = [part.casefold() for part in name.split("/")]
    base = parts[-1]
    if any(part in _SECRET_PARTS for part in parts):
        return True
    if base in _SECRET_NAMES:
        return True
    if base == ".env" or (base.startswith(".env.") and base not in
                           {".env.example", ".env.sample", ".env.template"}):
        return True
    if Path(base).suffix in {".pem", ".key", ".p12", ".pfx", ".keystore", ".jks"}:
        return True
    return bool(re.search(r"(?:service[-_]?account|credentials|secrets)[._-].*\.(?:json|ya?ml)$", base))


def _credential_content(text: str) -> bool:
    if any(pattern.search(text) for pattern in
           (_PRIVATE_KEY, _KNOWN_TOKEN, _CREDENTIAL_URL, _BEARER)):
        return True
    for match in _SENSITIVE_ASSIGNMENT.finditer(text):
        value = match.group(1) or match.group(2) or ""
        # Dynamic code references are not embedded credential values.
        dynamic = value.startswith(("process.env.", "import.meta.env.", "os.environ",
                                    "getenv(", "config.", "settings.", "env."))
        if not dynamic and not _PLACEHOLDER.fullmatch(value):
            return True
    return False


def _classify(name: str, data: bytes) -> tuple[str | None, str | None, bool]:
    if _sensitive_name(name) or _credential_content(name):
        return None, "sensitive_filename", True
    # Even a binary/unusual file with a recognizable key must not be extracted.
    scan_text = data.decode("utf-8", errors="replace")
    if _credential_content(scan_text):
        return None, "credential_content", True
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return None, "non_utf8_or_binary", False
    if "\x00" in text:
        return None, "non_utf8_or_binary", False
    path = Path(name)
    if path.suffix.casefold() not in _TEXT_SUFFIXES and path.name.casefold() not in _TEXT_NAMES:
        return None, "non_source_extension", False
    if any(part.casefold() in {"node_modules", ".git", ".venv", "__pycache__"}
           for part in path.parts):
        return None, "generated_or_dependency_tree", False
    return text, None, False


def _validated_entries(data: bytes) -> list[Entry]:
    expected_count = _check_zip_envelope(data)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) != expected_count or len(infos) > MAX_ENTRIES:
                raise BundleError("entry_count_mismatch")
            files = _validate_members(infos)
            entries = []
            actual_total = 0
            for info, name in files:
                chunks = []
                size = 0
                with archive.open(info, "r") as stream:
                    while chunk := stream.read(min(CHUNK_BYTES, MAX_ENTRY_BYTES - size + 1)):
                        size += len(chunk)
                        actual_total += len(chunk)
                        if size > MAX_ENTRY_BYTES or actual_total > MAX_TOTAL_BYTES:
                            raise BundleError("actual_expanded_size_limit")
                        chunks.append(chunk)
                if size != info.file_size:
                    raise BundleError("entry_size_mismatch")
                payload = b"".join(chunks)
                text, exclusion, sensitive = _classify(name, payload)
                entries.append(Entry(name, payload, _digest(payload), text, exclusion, sensitive))
            return entries
    except BundleError:
        raise
    except (zipfile.BadZipFile, RuntimeError, OSError, ValueError, NotImplementedError):
        raise BundleError("invalid_or_corrupt_archive") from None


def _safe_write(path: Path, data: bytes, root: Path) -> None:
    if not path.resolve(strict=False).is_relative_to(root.resolve(strict=True)):
        raise BundleError("write_outside_destination")
    _check_existing_parents(path.parent, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    _check_existing_parents(path.parent, root)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags, 0o600), "wb") as handle:
        handle.write(data)


def build_review_bundle(archive_path: Path, out: Path, *, project_root: Path = PROJECT_ROOT) -> dict:
    """Validate first; write once to a new incoming child. Never delete or execute."""
    root = project_root.resolve(strict=True)
    destination = _destination(out, root)
    archive_bytes = _read_archive(archive_path)
    entries = _validated_entries(archive_bytes)
    manifest = []
    sources = []
    excluded = []
    for entry in entries:
        if entry.sensitive:
            # Do not expose credential-bearing names to external review sessions.
            excluded.append({"path": None, "bytes": len(entry.data),
                             "sha256": entry.sha256, "reason": entry.exclusion})
            continue
        manifest.append({"path": entry.path, "bytes": len(entry.data),
                         "sha256": entry.sha256, "text_included": entry.text is not None})
        if entry.text is not None:
            sources.append({"path": entry.path, "bytes": len(entry.data),
                            "sha256": entry.sha256, "contents": entry.text})
        else:
            excluded.append({"path": entry.path, "bytes": len(entry.data),
                             "sha256": entry.sha256, "reason": entry.exclusion})
    bundle = {
        "schema_version": "pae-review-bundle-1",
        "original_archive_sha256": _digest(archive_bytes),
        "original_archive_bytes": len(archive_bytes),
        "source_root": "source",
        "manifest": manifest,
        "files": sources,
        "excluded": excluded,
        "handling": {
            "code_executed": False,
            "secrets_policy": "heuristic_exclusion_entire_file_and_sensitive_path",
            "human_sensitive_review_required_before_transmission": True,
            "excluded_content_is_not_reviewed": True,
        },
    }
    encoded = (json.dumps(bundle, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    # Recheck after reads; an existing destination is never reused.
    destination = _destination(out, root)
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        _check_existing_parents(destination.parent, root)
        destination.mkdir(exist_ok=False)
        source_root = destination / "source"
        source_root.mkdir(exist_ok=False)
        for entry in entries:
            if not entry.sensitive:
                _safe_write(source_root.joinpath(*entry.path.split("/")), entry.data, source_root)
        bundle_path = destination / "REVIEW_BUNDLE.json"
        _safe_write(bundle_path, encoded, destination)
    except BundleError:
        raise
    except OSError:
        # Keep any partial output for inspection; never delete/overwrite it.
        raise BundleError("write_failed_partial_destination_may_remain") from None
    return {"bundle_path": str(bundle_path), "bundle_sha256": _digest(encoded),
            "archive_sha256": _digest(archive_bytes), "manifest_files": len(manifest),
            "included_text_files": len(sources), "excluded_files": len(excluded)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True,
                        help="New child of this repository's incoming/ directory")
    arguments = parser.parse_args()
    try:
        result = build_review_bundle(arguments.archive, arguments.out)
    except BundleError as error:
        print(f"review_bundle: {error}", file=sys.stderr)
        return 2
    except (OSError, ValueError):
        print("review_bundle: input_or_destination_error", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
