#!/usr/bin/env python3
"""Local-only visual copy editor for the BlueWater Marlin landing page."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import secrets
import shutil
import tempfile
import threading
import webbrowser
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EDITOR_TEMPLATE = Path(__file__).with_name("content_editor.html")
TARGET_NAME = "index.html"
MAX_BODY_BYTES = 1_000_000
MAX_CHANGES = 250
MAX_TEXT_LENGTH = 4_000
ALLOWED_TAGS = {
    "a",
    "b",
    "button",
    "div",
    "figcaption",
    "h1",
    "h2",
    "h3",
    "p",
    "span",
}


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def apply_text_changes(source: str, changes: list[dict[str, Any]]) -> str:
    """Apply direct-text replacements without rewriting surrounding HTML."""
    prepared: list[tuple[str, str, str, int]] = []

    for change in changes:
        tag = str(change.get("tag", "")).lower()
        before = normalize_text(str(change.get("before", "")))
        after = normalize_text(str(change.get("after", "")))
        occurrence = change.get("occurrence", -1)

        if tag not in ALLOWED_TAGS:
            raise ValueError(f"Editing <{tag or '?'}> elements is not allowed.")
        if not isinstance(occurrence, int) or occurrence < 0:
            raise ValueError("A text occurrence could not be identified.")
        if not before:
            raise ValueError("The original text cannot be empty.")
        if len(before) > MAX_TEXT_LENGTH or len(after) > MAX_TEXT_LENGTH:
            raise ValueError("One edit is longer than the editor permits.")
        if before == after:
            continue

        prepared.append(
            (
                tag,
                before,
                html.escape(after, quote=False),
                occurrence,
            )
        )

    # Replacing repeated text from the last occurrence backwards keeps earlier
    # occurrence indexes stable when two identical labels are edited together.
    prepared.sort(key=lambda item: (item[0], item[1], -item[3]))

    result = source
    for tag, before, after, occurrence in prepared:
        pattern = re.compile(
            rf"(<{tag}\b[^>]*>)([^<>]*)(</{tag}\s*>)",
            re.IGNORECASE,
        )
        matches = [
            match
            for match in pattern.finditer(result)
            if normalize_text(html.unescape(match.group(2))) == before
        ]
        if occurrence >= len(matches):
            raise ValueError(
                f'Could not safely locate "{before[:80]}" in the current file.'
            )

        match = matches[occurrence]
        existing = match.group(2)
        leading = re.match(r"\s*", existing).group(0)
        trailing = re.search(r"\s*$", existing).group(0)
        replacement = (
            f"{match.group(1)}{leading}{after}{trailing}{match.group(3)}"
        )
        result = result[: match.start()] + replacement + result[match.end() :]

    return result


def atomic_save(target: Path, content: str) -> Path:
    backup_dir = target.parent / ".content-editor-backups"
    backup_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = backup_dir / f"index-{stamp}.html"
    shutil.copy2(target, backup)

    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="",
            dir=target.parent,
            prefix=".index-editor-",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
            temp_name = temporary.name
        os.replace(temp_name, target)
    except Exception:
        if temp_name:
            Path(temp_name).unlink(missing_ok=True)
        raise

    return backup


def build_handler(root: Path, token: str):
    target = root / TARGET_NAME

    class EditorHandler(SimpleHTTPRequestHandler):
        server_version = "BlueWaterContentEditor/1.0"

        def end_headers(self) -> None:
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            super().end_headers()

        def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802 - inherited HTTP method name
            request_url = urlsplit(self.path)
            path = request_url.path
            if path in {"/__editor__", "/__editor__/"}:
                if not EDITOR_TEMPLATE.is_file():
                    self.send_error(HTTPStatus.NOT_FOUND, "Editor UI is missing")
                    return
                page = EDITOR_TEMPLATE.read_text(encoding="utf-8")
                page = page.replace("__EDITOR_TOKEN__", token)
                page = page.replace("__SOURCE_HASH__", file_hash(target))
                body = page.encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
                return

            if path == "/__editor__/state":
                self.send_json(
                    HTTPStatus.OK,
                    {"sourceHash": file_hash(target), "target": TARGET_NAME},
                )
                return

            if (
                path in {"/", "/index.html"}
                and parse_qs(request_url.query).get("live_preview") == ["1"]
            ):
                source_hash = file_hash(target)
                page = target.read_text(encoding="utf-8")
                live_reload = f"""
<script data-bluewater-live-preview>
(() => {{
  let sourceHash = {json.dumps(source_hash)};
  window.setInterval(async () => {{
    try {{
      const response = await fetch('/__editor__/state', {{cache: 'no-store'}});
      const state = await response.json();
      if (state.sourceHash !== sourceHash) window.location.reload();
    }} catch (_) {{}}
  }}, 900);
}})();
</script>
"""
                if "</body>" not in page:
                    self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "index.html is incomplete")
                    return
                body = page.replace("</body>", f"{live_reload}</body>", 1).encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
                return

            super().do_GET()

        def do_POST(self) -> None:  # noqa: N802 - inherited HTTP method name
            if urlsplit(self.path).path != "/__editor__/save":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            if self.headers.get("X-Editor-Token") != token:
                self.send_json(HTTPStatus.FORBIDDEN, {"error": "Invalid editor token."})
                return

            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0 or length > MAX_BODY_BYTES:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid save payload."})
                return

            try:
                payload = json.loads(self.rfile.read(length))
                changes = payload.get("changes", [])
                expected_hash = payload.get("sourceHash", "")
                if not isinstance(changes, list) or len(changes) > MAX_CHANGES:
                    raise ValueError("The save contains too many edits.")

                current_hash = file_hash(target)
                if not secrets.compare_digest(str(expected_hash), current_hash):
                    self.send_json(
                        HTTPStatus.CONFLICT,
                        {
                            "error": (
                                "index.html changed outside the editor. Reload before saving "
                                "so another agent's work is not overwritten."
                            )
                        },
                    )
                    return

                original = target.read_text(encoding="utf-8")
                updated = apply_text_changes(original, changes)
                if updated == original:
                    self.send_json(
                        HTTPStatus.OK,
                        {"changed": 0, "sourceHash": current_hash, "backup": None},
                    )
                    return

                backup = atomic_save(target, updated)
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "changed": len(changes),
                        "sourceHash": file_hash(target),
                        "backup": str(backup.relative_to(root)),
                    },
                )
            except (json.JSONDecodeError, OSError, ValueError) as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})

        def log_message(self, message: str, *args: Any) -> None:
            if urlsplit(self.path).path.startswith("/__editor__"):
                print(f"[editor] {message % args}")

    return partial(EditorHandler, directory=str(root))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766, help="Local port (default: 8766)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser")
    parser.add_argument(
        "--root",
        type=Path,
        default=PROJECT_ROOT,
        help=argparse.SUPPRESS,
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    target = root / TARGET_NAME
    if not target.is_file():
        raise SystemExit(f"Missing target file: {target}")

    token = secrets.token_urlsafe(32)
    handler = build_handler(root, token)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        raise SystemExit(
            f"Could not start the editor on port {args.port}: {error}\n"
            f"Try: python3 scripts/content_editor.py --port {args.port + 1}"
        ) from error

    url = f"http://127.0.0.1:{args.port}/__editor__/"
    print("BlueWater content editor")
    print(f"Editing: {target}")
    print(f"Open:    {url}")
    print("Press Control-C here when you are finished.\n")

    if not args.no_browser:
        threading.Timer(0.35, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEditor stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
