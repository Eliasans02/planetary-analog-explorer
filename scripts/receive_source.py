"""Loopback-only source receipt. Validates and saves JSON; never extracts or runs it."""
from __future__ import annotations

import argparse
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import stat
from urllib.parse import parse_qs

EXPECTED_SHA256 = "e438d1228ea2e8c922d7247808ead159853381da6029d3c602895048bfa5a33a"
EXPECTED_BYTES = 224050
EXPECTED_FILES = 17
REQUIRED_PREFIX = "data-pipeline"
MAX_BODY_BYTES = 2 * 1024 * 1024
REPO_ROOT = Path(__file__).resolve().parents[1]
DESTINATION = REPO_ROOT / "incoming" / "dev_a_source_bundle_r1.json"
SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
                  *(f"LPT{i}" for i in range(1, 10))}
ARTIFACTS = {
    "gemini_handoff": {
        "sha256": "de2efba091fa1e100f428bdd3ac7dfe5be4f39e7f39fa85233e1bd97a1fc51dc",
        "bytes": 214268, "files": 8, "prefix": None,
        "filename": "gemini_handoff_visible_archive.json",
    },
    "b03_review_snapshots": {
        "sha256": "3e316e8692d1f0637490fe492b65e852b78bc825b881f84768124aa1093f2f3a",
        "bytes": 28584, "files": 2, "prefix": "reports",
        "filename": "b03_review_visible_snapshots.json",
    },
    "dev_a_r1": {
        "sha256": EXPECTED_SHA256, "bytes": 224050, "files": 17,
        "prefix": "data-pipeline", "filename": "dev_a_source_bundle_r1.json",
    },
    "dev_b_b03": {
        "sha256": "9a6d29de8654d9baae7707cf69432728559f7bba003039c32b3a13d1977f7506",
        "bytes": 336551, "files": 36, "prefix": None,
        "filename": "dev_b_source_bundle_b03.json",
    },
    "dev_a_a04": {
        "sha256": "6ad8fdb3558f70a629f66a892c79a70442e03caa2a8f882a67808840d53e0985",
        "bytes": 298535, "files": 17, "prefix": "data-pipeline",
        "filename": "dev_a_source_bundle_a04.json",
    },
}


class ReceiptError(ValueError):
    """An input failed validation. Messages must never include source contents."""


def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ReceiptError("Duplicate JSON object key.")
        result[key] = value
    return result


def reject_constant(_: str) -> None:
    raise ReceiptError("Non-finite JSON number.")


def is_link(path: Path) -> bool:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    # Also catches Windows junctions/reparse points on Python 3.11.
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def validate_source_path(value: object, seen: set[str]) -> None:
    if not isinstance(value, str) or not value or "\\" in value:
        raise ReceiptError("Invalid source path.")
    path = PurePosixPath(value)
    parts = value.split("/")
    if path.is_absolute():
        raise ReceiptError("Source paths must be relative.")
    if REQUIRED_PREFIX is not None and (len(parts) < 2 or parts[0] != REQUIRED_PREFIX):
        raise ReceiptError("Source paths must be relative beneath the configured source directory.")
    for part in parts:
        if (not part or part in {".", ".."} or part[-1] in {".", " "}
                or any(ord(c) < 32 or c in '<>:"|?*' for c in part)
                or part.split(".", 1)[0].upper() in RESERVED_NAMES):
            raise ReceiptError("Unsafe source path component.")
        lowered = part.casefold()
        if (lowered == ".env" or (lowered.startswith(".env.") and lowered != ".env.example")
                or lowered in {".git", "node_modules", ".ssh", ".aws", ".npmrc", ".netrc",
                               ".pypirc", "id_rsa", "id_ed25519", "credentials.json", "secrets.json"}
                or Path(lowered).suffix in {".pem", ".key", ".p12", ".pfx"}):
            raise ReceiptError("Secret or dependency-tree source path is not accepted.")
    folded = value.casefold()
    if folded in seen:
        raise ReceiptError("Duplicate or case-colliding source path.")
    seen.add(folded)
    candidate = REPO_ROOT
    for part in parts:
        candidate = candidate / part
        if is_link(candidate):
            raise ReceiptError("Source path encounters a local symlink or junction.")
    if not candidate.resolve(strict=False).is_relative_to(REPO_ROOT):
        raise ReceiptError("Source path escapes the repository.")


def validate_bundle(raw: bytes) -> dict[str, object]:
    if len(raw) != EXPECTED_BYTES:
        raise ReceiptError(f"Bundle byte count mismatch; expected {EXPECTED_BYTES}.")
    if not hmac.compare_digest(hashlib.sha256(raw).hexdigest(), EXPECTED_SHA256):
        raise ReceiptError("Bundle SHA-256 mismatch; original UTF-8 bytes are required.")
    try:
        bundle = json.loads(raw.decode("utf-8", errors="strict"),
                            object_pairs_hook=unique_object, parse_constant=reject_constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise ReceiptError("Bundle is not valid UTF-8 JSON.") from exc
    if not isinstance(bundle, dict) or not isinstance(bundle.get("files"), list):
        raise ReceiptError("Expected a JSON object containing files[].")
    files = bundle["files"]
    if len(files) != EXPECTED_FILES:
        raise ReceiptError(f"Expected exactly {EXPECTED_FILES} source files.")
    seen: set[str] = set()
    for item in files:
        if not isinstance(item, dict) or set(item) != {"path", "bytes", "sha256", "content"}:
            raise ReceiptError("Each file must contain only path, bytes, sha256, content.")
        validate_source_path(item["path"], seen)
        size, digest, content = item["bytes"], item["sha256"], item["content"]
        if (type(size) is not int or size < 0 or size > MAX_BODY_BYTES
                or not isinstance(digest, str) or not SHA256_RE.fullmatch(digest)
                or not isinstance(content, str)):
            raise ReceiptError("Invalid source file metadata.")
        try:
            encoded = content.encode("utf-8", errors="strict")
        except UnicodeError as exc:
            raise ReceiptError("A source file is not valid UTF-8.") from exc
        if len(encoded) != size or not hmac.compare_digest(hashlib.sha256(encoded).hexdigest(), digest):
            raise ReceiptError("A source file byte count or SHA-256 does not match.")
    return bundle


def save_exclusive(raw: bytes) -> str:
    parent = DESTINATION.parent
    if parent.parent != REPO_ROOT or not DESTINATION.is_relative_to(REPO_ROOT):
        raise ReceiptError("Destination containment check failed.")
    if is_link(parent):
        raise ReceiptError("Incoming directory must not be a symlink or junction.")
    try:
        parent.mkdir(exist_ok=True)
    except OSError as exc:
        raise ReceiptError("Cannot create incoming directory.") from exc
    if is_link(parent) or not parent.is_dir() or parent.resolve() != parent:
        raise ReceiptError("Incoming directory containment check failed.")
    if is_link(DESTINATION):
        raise ReceiptError("Destination must not be a symlink or junction.")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(DESTINATION, flags, 0o600)
    except FileExistsError:
        try:
            info = DESTINATION.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_size != len(raw) or is_link(DESTINATION):
                raise ReceiptError("Existing destination is not an identical regular file.")
            with DESTINATION.open("rb") as existing:
                if existing.read(MAX_BODY_BYTES + 1) != raw:
                    raise ReceiptError("Existing destination differs; overwrite is forbidden.")
        except OSError as exc:
            raise ReceiptError("Cannot verify existing destination.") from exc
        return "ALREADY SAVED: identical bytes verified"
    except OSError as exc:
        raise ReceiptError("Cannot create the destination exclusively.") from exc
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
    except OSError as exc:
        raise ReceiptError("Write failed; destination was not removed or overwritten.") from exc
    return "SAVED: verified source bundle"


def make_handler(port: int, csrf_token: str) -> type[BaseHTTPRequestHandler]:
    nonce = secrets.token_urlsafe(24)
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
    allowed_origins = {f"http://{host}" for host in allowed_hosts}
    html = f"""<!doctype html><html lang="en"><meta charset="utf-8">
<title>Local source receipt</title><meta name="viewport" content="width=device-width">
<style nonce="{nonce}">body{{font:16px system-ui;max-width:75rem;margin:2rem auto;padding:1rem}}
textarea{{box-sizing:border-box;width:100%;height:55vh}}button{{margin:1rem 0;padding:.7rem}}
pre{{white-space:pre-wrap;overflow-wrap:anywhere}}</style>
<h1>Local source receipt</h1><p>Validates {EXPECTED_FILES} files and saves JSON only. Nothing is extracted or executed.</p>
<form action="/submit" method="post"><label for="bundle">Exact UTF-8 source bundle JSON</label>
<textarea id="bundle" name="bundle" spellcheck="false" required></textarea>
<input type="hidden" name="csrf" value="{csrf_token}">
<button type="submit">Save verified source bundle</button></form>
<pre id="result" role="status" aria-live="polite"></pre>
<script nonce="{nonce}">
document.querySelector('form').addEventListener('submit', async event => {{
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const result = document.querySelector('#result');
  button.disabled = true; result.textContent = 'Validating…';
  try {{
    const response = await fetch('/submit', {{method:'POST', redirect:'error',
      headers:{{'Content-Type':'text/plain;charset=UTF-8','X-CSRF-Token':'{csrf_token}'}},
      body:document.querySelector('#bundle').value}});
    result.textContent = await response.text();
  }} catch {{ result.textContent = 'Local receipt request failed. No success is assumed.'; }}
  finally {{ button.disabled = false; }}
}});
</script></html>""".encode("utf-8")

    class Handler(BaseHTTPRequestHandler):
        server_version = "PAEReceipt/1"
        sys_version = ""

        def setup(self) -> None:
            super().setup()
            self.connection.settimeout(15)

        def log_message(self, fmt: str, *args: object) -> None:
            # Never log the request URL, body, source text or CSRF token.
            print("Local receipt request processed.", flush=True)

        def respond(self, status: int, body: bytes, content_type: str = "text/plain; charset=utf-8") -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", f"default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def valid_host(self) -> bool:
            hosts = self.headers.get_all("Host", [])
            return len(hosts) == 1 and hosts[0] in allowed_hosts

        def do_GET(self) -> None:
            if not self.valid_host() or self.path != "/":
                self.respond(404, b"Not found.")
                return
            self.respond(200, html, "text/html; charset=utf-8")

        def do_POST(self) -> None:
            try:
                if not self.valid_host() or self.path != "/submit":
                    raise ReceiptError("Invalid endpoint or Host.")
                origins = self.headers.get_all("Origin", [])
                if len(origins) != 1 or origins[0] not in allowed_origins:
                    raise ReceiptError("A same-origin loopback browser request is required.")
                if origins[0] != f"http://{self.headers['Host']}":
                    raise ReceiptError("Origin must match Host exactly.")
                lengths = self.headers.get_all("Content-Length", [])
                if self.headers.get_all("Transfer-Encoding") or len(lengths) != 1 or not re.fullmatch(r"[0-9]+", lengths[0]):
                    raise ReceiptError("One valid Content-Length is required; chunked bodies are rejected.")
                length = int(lengths[0])
                if not 0 < length <= MAX_BODY_BYTES:
                    raise ReceiptError("Request body exceeds the 2 MiB limit or is empty.")
                if self.headers.get_all("Content-Encoding"):
                    raise ReceiptError("Encoded request bodies are not supported.")
                content_types = self.headers.get_all("Content-Type", [])
                if len(content_types) != 1:
                    raise ReceiptError("One Content-Type is required.")
                content_type = content_types[0].replace(" ", "").lower()
                raw_body = self.rfile.read(length)
                if len(raw_body) != length:
                    raise ReceiptError("Incomplete request body.")
                if content_type in {"text/plain;charset=utf-8", "application/json;charset=utf-8", "application/json"}:
                    tokens = self.headers.get_all("X-CSRF-Token", [])
                    if len(tokens) != 1 or not hmac.compare_digest(tokens[0], csrf_token):
                        raise ReceiptError("Invalid CSRF token.")
                    raw = raw_body
                elif content_type in {"application/x-www-form-urlencoded", "application/x-www-form-urlencoded;charset=utf-8"}:
                    try:
                        form = parse_qs(raw_body.decode("utf-8", errors="strict"), keep_blank_values=True,
                                        strict_parsing=True, encoding="utf-8", errors="strict", max_num_fields=2)
                    except (UnicodeError, ValueError) as exc:
                        raise ReceiptError("Invalid UTF-8 form body.") from exc
                    if set(form) != {"bundle", "csrf"} or any(len(v) != 1 for v in form.values()):
                        raise ReceiptError("Expected exactly one bundle and CSRF form field.")
                    if not hmac.compare_digest(form["csrf"][0], csrf_token):
                        raise ReceiptError("Invalid CSRF token.")
                    raw = form["bundle"][0].encode("utf-8", errors="strict")
                else:
                    raise ReceiptError("Unsupported Content-Type.")
                validate_bundle(raw)
                outcome = save_exclusive(raw)
                message = f"{outcome}\nPath: {DESTINATION}\nSHA256: {EXPECTED_SHA256}\nBytes: {len(raw)}\nFiles: {EXPECTED_FILES}\nJSON only; no extraction or execution.\n"
                self.respond(200, message.encode("utf-8"))
                print(f"Receipt success: path={DESTINATION} sha256={EXPECTED_SHA256} bytes={len(raw)} files={EXPECTED_FILES}", flush=True)
            except (ReceiptError, UnicodeError, OSError, ValueError) as exc:
                message = str(exc) if isinstance(exc, ReceiptError) else "Request rejected; no success is assumed."
                self.close_connection = True
                self.respond(400, ("REJECTED: " + message).encode("utf-8"))

    return Handler


def main() -> None:
    global EXPECTED_SHA256, EXPECTED_BYTES, EXPECTED_FILES, REQUIRED_PREFIX, DESTINATION
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8769)
    parser.add_argument("--artifact", choices=tuple(ARTIFACTS), default="dev_a_r1")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")
    artifact = ARTIFACTS[args.artifact]
    EXPECTED_SHA256 = str(artifact["sha256"])
    EXPECTED_BYTES = int(artifact["bytes"])
    EXPECTED_FILES = int(artifact["files"])
    REQUIRED_PREFIX = artifact["prefix"]
    DESTINATION = REPO_ROOT / "incoming" / str(artifact["filename"])
    with HTTPServer(("127.0.0.1", args.port), make_handler(args.port, secrets.token_urlsafe(32))) as server:
        print(f"Local source receipt ready: http://127.0.0.1:{args.port}/", flush=True)
        print(f"Expected sha256={EXPECTED_SHA256} bytes={EXPECTED_BYTES} files={EXPECTED_FILES}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
