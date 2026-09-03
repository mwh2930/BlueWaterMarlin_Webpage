#!/usr/bin/env python3
"""Validate the public website and its Azure Static Web Apps contract."""

from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGES = (
    Path("index.html"),
    Path("support/index.html"),
    Path("privacy/index.html"),
    Path("support.html"),
    Path("404.html"),
)
CANONICAL_PAGES = set(PUBLIC_PAGES) - {Path("404.html")}
EXPECTED_CANONICALS = {
    Path("index.html"): "https://www.bluewatermarlin.com/",
    Path("support/index.html"): "https://www.bluewatermarlin.com/support/",
    Path("privacy/index.html"): "https://www.bluewatermarlin.com/privacy/",
    Path("support.html"): "https://www.bluewatermarlin.com/support/",
}
REQUIRED_GLOBAL_HEADERS = {
    "content-security-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "permissions-policy",
    "referrer-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.html_lang = ""
        self.in_title = False
        self.title_parts: list[str] = []
        self.description = ""
        self.viewport = ""
        self.canonical = ""
        self.main_count = 0
        self.ids: list[str] = []
        self.references: list[tuple[str, str]] = []

    @property
    def title(self) -> str:
        return "".join(self.title_parts).strip()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): value or "" for name, value in attrs}
        tag = tag.lower()

        if tag == "html":
            self.html_lang = values.get("lang", "").strip()
        elif tag == "title":
            self.in_title = True
        elif tag == "main":
            self.main_count += 1

        element_id = values.get("id", "").strip()
        if element_id:
            self.ids.append(element_id)

        if tag == "meta":
            name = values.get("name", "").lower()
            if name == "description":
                self.description = values.get("content", "").strip()
            elif name == "viewport":
                self.viewport = values.get("content", "").strip()

        if tag == "link" and "canonical" in values.get("rel", "").lower().split():
            self.canonical = values.get("href", "").strip()

        for attribute in ("href", "src"):
            value = values.get(attribute, "").strip()
            if value:
                self.references.append((attribute, value))

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)


def local_target(page: Path, reference: str) -> Path | None:
    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc or reference.startswith(("mailto:", "tel:", "data:")):
        return None
    if not parsed.path:
        return None

    decoded = unquote(parsed.path)
    if decoded.startswith("/"):
        target = ROOT / decoded.lstrip("/")
    else:
        target = ROOT / page.parent / decoded

    if decoded.endswith("/"):
        return target / "index.html"
    if target.is_dir():
        return target / "index.html"
    if target.exists():
        return target

    route_index = target / "index.html"
    if route_index.exists():
        return route_index
    return target


def validate() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not (ROOT / "CNAME").is_file() or (ROOT / "CNAME").read_text().strip() != "bluewatermarlin.com":
        errors.append("CNAME must contain exactly bluewatermarlin.com")

    parsed_pages: dict[Path, PageParser] = {}
    for page in PUBLIC_PAGES:
        source = ROOT / page
        if not source.is_file():
            errors.append(f"missing public page: {page}")
            continue

        text = source.read_text(encoding="utf-8")
        parser = PageParser()
        parser.feed(text)
        parser.close()
        parsed_pages[page] = parser

        if not parser.html_lang:
            errors.append(f"{page}: missing html lang")
        if not parser.title:
            errors.append(f"{page}: missing title")
        if not parser.description:
            errors.append(f"{page}: missing meta description")
        if not parser.viewport:
            errors.append(f"{page}: missing viewport meta tag")
        if parser.main_count != 1:
            errors.append(f"{page}: expected one main element, found {parser.main_count}")
        if page in CANONICAL_PAGES and parser.canonical != EXPECTED_CANONICALS[page]:
            errors.append(
                f"{page}: canonical must be {EXPECTED_CANONICALS[page]!r}, "
                f"found {parser.canonical!r}"
            )

        duplicates = sorted(name for name, count in Counter(parser.ids).items() if count > 1)
        if duplicates:
            errors.append(f"{page}: duplicate ids: {', '.join(duplicates)}")

        if "http://" in text:
            errors.append(f"{page}: insecure http:// URL found")

        for attribute, reference in parser.references:
            if reference == "#":
                errors.append(f"{page}: placeholder {attribute}=\"#\"")
                continue
            target = local_target(page, reference)
            if target is not None and not target.is_file():
                errors.append(f"{page}: broken {attribute} {reference!r}")

    homepage = (ROOT / "index.html").read_text(encoding="utf-8")
    if 'href="/support/"' not in homepage:
        errors.append("index.html must link to the canonical /support/ route")
    if "/privacy/" not in homepage:
        errors.append("index.html must link to the canonical /privacy/ route")

    required_homepage_copy = (
        "48&nbsp;hours",
        "$32.99",
        "$99.00",
        "$8.25",
        "Free chart &amp; plans available.",
        "B.I.L.L. Pro · Monthly",
        "B.I.L.L. Pro · Annual",
        "Final App Store price",
        "Coming soon",
        "supported regions",
        "source or analysis time",
        "no app-side interpolation",
    )
    for phrase in required_homepage_copy:
        if phrase not in homepage:
            errors.append(f"index.html: missing approved product copy {phrase!r}")

    forbidden_homepage_copy = (
        "3&nbsp;days",
        "3 days",
        "$99.99",
        "$8.33",
        "Every other chart",
        "All six instruments, every region",
        "Every forecast engineered is graded",
        "Works offline, sixty miles out",
        "Pre-rendered and cached on the device",
        "Real-time satellite ocean data doesn't exist",
        "every retrospective chart",
        "every chart in this category",
        "being built in the open",
        "Planned",
        "planned",
    )
    for phrase in forbidden_homepage_copy:
        if phrase in homepage:
            errors.append(f"index.html: unapproved or stale product copy {phrase!r}")

    support_copy = (ROOT / "support/index.html").read_text(encoding="utf-8")
    required_support_copy = (
        "Previously loaded SST, chlorophyll, and sargassum grids",
        "no app-side interpolation",
        "source or analysis time",
    )
    for phrase in required_support_copy:
        if phrase not in support_copy:
            errors.append(f"support/index.html: missing approved product copy {phrase!r}")

    redirect = (ROOT / "support.html").read_text(encoding="utf-8")
    if 'url=/support/' not in redirect:
        errors.append("support.html must redirect to /support/")

    privacy = (ROOT / "privacy/index.html").read_text(encoding="utf-8")
    for phrase in (
        "Microsoft Azure hosts our public website",
        "https://www.microsoft.com/privacy/privacystatement",
    ):
        if phrase not in privacy:
            errors.append(f"privacy/index.html: missing Azure disclosure {phrase!r}")

    config_path = ROOT / "staticwebapp.config.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"staticwebapp.config.json: invalid or unreadable: {error}")
    else:
        headers = config.get("globalHeaders", {})
        missing_headers = sorted(REQUIRED_GLOBAL_HEADERS - set(headers))
        if missing_headers:
            errors.append(
                "staticwebapp.config.json: missing security headers: "
                + ", ".join(missing_headers)
            )
        csp = headers.get("content-security-policy", "")
        for directive in ("default-src 'self'", "frame-ancestors 'none'", "object-src 'none'"):
            if directive not in csp:
                errors.append(
                    "staticwebapp.config.json: content-security-policy missing "
                    f"{directive!r}"
                )
        if headers.get("x-frame-options") != "DENY":
            errors.append("staticwebapp.config.json: x-frame-options must be DENY")
        if headers.get("x-content-type-options") != "nosniff":
            errors.append("staticwebapp.config.json: x-content-type-options must be nosniff")

    return errors, warnings


def main() -> int:
    errors, warnings = validate()
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}")

    if errors:
        print(f"Site validation failed with {len(errors)} error(s).")
        return 1

    print(f"Site validation passed for {len(PUBLIC_PAGES)} public pages ({len(warnings)} warning(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
