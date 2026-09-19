#!/usr/bin/env python3
"""Build an isolated, deterministic Functions source ZIP; never deploy it."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import zipfile


ROOT = Path(__file__).absolute().parents[1]
RUNTIME_FILES = (
    "azure.mjs", "functions.mjs", "host.json", "package-lock.json",
    "package.json", "schedule.mjs", "security.mjs", "service.mjs",
)
CATALOG_PATH = "data/report-destinations.json"
# The server's existing approval catalog is intentionally broader than the
# website's reviewed U.S. picker. Never replace it with the public UI scope.
CATALOG_SOURCE_PATH = "backend/reports/data/report-destinations.json"
FIXED_TIME = (2020, 1, 1, 0, 0, 0)
MAX_FILE_BYTES = 1024 * 1024
IDENTIFIER = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
UNSAFE_TEXT = re.compile(r"[\x00-\x1f\x7f<>]|https?://|www\.|(?:blob|table|dfs|queue)\.core|[?&](?:sig|sv|se|sp)=", re.I)


def checked_path(path: Path) -> Path:
    """Reject symbolic links in the supplied path, including parent folders."""
    path = Path(os.path.abspath(path))
    for component in reversed((path, *path.parents)):
        if component.is_symlink():
            raise ValueError("symbolic links are not allowed in package paths")
    return path


def source_bytes(path: Path) -> bytes:
    path = checked_path(path)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_FILE_BYTES:
            raise ValueError("package input must be a bounded regular file")
        body = stream.read(MAX_FILE_BYTES + 1)
    if not body or len(body) > MAX_FILE_BYTES:
        raise ValueError("package input must be a bounded nonempty file")
    return body


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON member in package input")
        result[key] = value
    return result


def document(body: bytes):
    return json.loads(body.decode("utf-8"), object_pairs_hook=unique_object)


def plain_text(value, *, minimum: int, maximum: int) -> bool:
    return (isinstance(value, str) and minimum <= len(value.strip()) <= maximum
            and not UNSAFE_TEXT.search(value))


def sanitized_catalog(body: bytes) -> bytes:
    value = document(body)
    if (not isinstance(value, dict) or set(value) != {"schemaVersion", "destinations"}
            or type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1
            or not isinstance(value["destinations"], list)
            or not 1 <= len(value["destinations"]) <= 256):
        raise ValueError("invalid report catalog")
    rows, seen = [], set()
    for row in value["destinations"]:
        allowed = {"id", "name", "admin", "available", "coast", "timeZone"}
        if (not isinstance(row, dict) or not {"id", "name", "admin", "available"} <= row.keys()
                or not row.keys() <= allowed):
            raise ValueError("unexpected report catalog fields")
        identifier = row["id"]
        if (not isinstance(identifier, str) or len(identifier) > 80
                or not IDENTIFIER.fullmatch(identifier) or identifier in seen
                or not plain_text(row["name"], minimum=1, maximum=120)
                or not plain_text(row["admin"], minimum=0, maximum=100)
                or row["available"] is not False):
            raise ValueError("catalog must contain unique, safe, unavailable destinations")
        seen.add(identifier)
        rows.append({"id": identifier, "name": row["name"].strip(),
                     "admin": row["admin"].strip(), "available": False})
    return (json.dumps({"schemaVersion": 1, "destinations": rows},
                       sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def validate_runtime(entries: dict[str, bytes]) -> None:
    package = document(entries["package.json"])
    lock = document(entries["package-lock.json"])
    host = document(entries["host.json"])
    if (not isinstance(package, dict) or package.get("type") != "module"
            or package.get("main") != "functions.mjs" or package.get("private") is not True):
        raise ValueError("invalid report Functions entrypoint")
    if (not isinstance(host, dict) or host.get("version") != "2.0"
            or host.get("extensions", {}).get("http", {}).get("routePrefix") != "api"):
        raise ValueError("invalid report Functions host")
    if (not isinstance(lock, dict) or lock.get("lockfileVersion") != 3
            or not isinstance(lock.get("packages"), dict)
            or not isinstance(lock["packages"].get(""), dict)):
        raise ValueError("missing report dependency lock")
    pinned = lock["packages"][""]
    if any(package.get(key) != pinned.get(key) for key in ("name", "version", "dependencies", "engines")):
        raise ValueError("report package and lock do not match")


def build_package(source: Path, output: Path) -> dict:
    source, output = checked_path(source), checked_path(output)
    if not source.is_dir():
        raise ValueError("website source directory is missing")
    if output == source or source in output.parents:
        raise ValueError("backend package must be outside the website source tree")
    if output.suffix.lower() != ".zip" or not output.parent.is_dir():
        raise ValueError("output must be a ZIP inside an existing directory")
    if output.exists():
        raise ValueError("refusing to overwrite an existing package")
    # No traversal, glob, copytree, environment file, or installed dependency can
    # expand this deployment boundary. Runtime files are at the Functions root.
    entries = {name: source_bytes(source / "backend" / "reports" / name)
               for name in RUNTIME_FILES}
    entries[CATALOG_PATH] = sanitized_catalog(source_bytes(source / CATALOG_SOURCE_PATH))
    validate_runtime(entries)
    buffer = io.BytesIO()
    # Stored entries avoid compressor-version variation in source ZIP hashes.
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, body in sorted(entries.items()):
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, body)
    body = buffer.getvalue()
    # Exclusive creation also rejects a file/link created after the path checks.
    with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as stream:
        stream.write(body)
    return {"package": str(output), "files": len(entries), "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT, help="website repository root")
    parser.add_argument("--output", type=Path, required=True, help="new ZIP path outside the website tree")
    args = parser.parse_args()
    try:
        result = build_package(args.source, args.output)
    except (OSError, ValueError, TypeError, AttributeError) as error:
        parser.exit(1, f"Report backend package failed: {type(error).__name__}. No deployment attempted.\n")
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
