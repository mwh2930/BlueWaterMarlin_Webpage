#!/usr/bin/env python3
"""Validate the public website and its Azure Static Web Apps contract."""

from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit
from build_report_pages import build as check_report_pages, catalog as report_catalog


ROOT = Path(__file__).resolve().parents[1]
try:
    DESTINATION_ROWS = report_catalog(ROOT)
    DESTINATION_ERROR = None
except (OSError, ValueError, KeyError, TypeError) as error:
    DESTINATION_ROWS = []
    DESTINATION_ERROR = str(error)
DESTINATION_PAGES = tuple(Path("report") / row["id"] / "index.html" for row in DESTINATION_ROWS)
PUBLIC_PAGES = (
    Path("index.html"),
    Path("support/index.html"),
    Path("privacy/index.html"),
    Path("sources/index.html"),
    Path("report/index.html"),
    Path("report/privacy/index.html"),
    Path("support.html"),
    Path("404.html"),
) + DESTINATION_PAGES
CANONICAL_PAGES = set(PUBLIC_PAGES) - {Path("404.html")}
EXPECTED_CANONICALS = {
    Path("index.html"): "https://www.bluewatermarlin.com/",
    Path("support/index.html"): "https://www.bluewatermarlin.com/support/",
    Path("privacy/index.html"): "https://www.bluewatermarlin.com/privacy/",
    Path("sources/index.html"): "https://www.bluewatermarlin.com/sources/",
    Path("report/index.html"): "https://www.bluewatermarlin.com/report/",
    Path("report/privacy/index.html"): "https://www.bluewatermarlin.com/report/privacy/",
    Path("support.html"): "https://www.bluewatermarlin.com/support/",
}
EXPECTED_CANONICALS.update({
    Path("report") / row["id"] / "index.html": f'https://www.bluewatermarlin.com/report/{row["id"]}/'
    for row in DESTINATION_ROWS
})
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
        self.in_head = False
        self.in_footer = False
        self.footer_links: list[str] = []
        self.title_parts: list[str] = []
        self.description = ""
        self.viewport = ""
        self.canonical = ""
        self.main_count = 0
        self.form_count = 0
        self.input_types: list[str] = []
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
        elif tag == "head":
            self.in_head = True
        elif tag == "footer":
            self.in_footer = True
        elif tag == "title" and self.in_head:
            self.in_title = True
        elif tag == "main":
            self.main_count += 1
        elif tag == "form":
            self.form_count += 1
        elif tag == "input":
            self.input_types.append(values.get("type", "text").lower())

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
                if tag == "a" and attribute == "href" and self.in_footer:
                    self.footer_links.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "head":
            self.in_head = False
        elif tag.lower() == "footer":
            self.in_footer = False
        elif tag.lower() == "title":
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
    if DESTINATION_ERROR:
        errors.append("U.S. destination directory: " + DESTINATION_ERROR)
    else:
        try:
            check_report_pages(ROOT, check=True)
        except (OSError, ValueError, KeyError, TypeError) as error:
            errors.append("Generated destination pages: " + str(error))

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

    # Verify in-page links (including the source register contents) after all
    # route IDs have been collected. External fragments belong to their providers.
    for page, parser in parsed_pages.items():
        for attribute, reference in parser.references:
            parsed = urlsplit(reference)
            if not parsed.fragment or parsed.scheme or parsed.netloc:
                continue
            target = local_target(page, reference) or ROOT / page
            try:
                target_page = target.resolve().relative_to(ROOT.resolve())
            except ValueError:
                continue
            target_parser = parsed_pages.get(target_page)
            if target_parser and unquote(parsed.fragment) not in target_parser.ids:
                errors.append(f"{page}: missing fragment target for {attribute} {reference!r}")

    for page in (Path("index.html"), Path("support/index.html")):
        parser = parsed_pages.get(page)
        if parser and "/sources/" not in parser.footer_links:
            errors.append(f"{page}: footer must link to the canonical /sources/ route")

    homepage = (ROOT / "index.html").read_text(encoding="utf-8")
    if "/report/" not in parsed_pages[Path("index.html")].footer_links:
        errors.append("index.html: footer must link to /report/")
    if '>Free Report</a>' not in homepage:
        errors.append("index.html: missing Free Report button")
    if 'href="/support/"' not in homepage:
        errors.append("index.html must link to the canonical /support/ route")
    if "/privacy/" not in homepage:
        errors.append("index.html must link to the canonical /privacy/ route")

    required_homepage_copy = (
        "48&nbsp;hours",
        "$34.99",
        "$99.99",
        "$8.33",
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
        "$32.99",
        "$99.00",
        "$8.25",
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

    # Public report surfaces have no infrastructure settings or direct storage
    # links. The report reader never collects contacts or submits mutations.
    report_assets = ("report/index.html", "report/privacy/index.html", "assets/js/report.js", "data/report-destinations.json", *(str(page) for page in DESTINATION_PAGES))
    for asset in report_assets:
        if not (ROOT / asset).is_file():
            errors.append(f"{asset}: missing public report asset")
            continue
        content = (ROOT / asset).read_text(encoding="utf-8")
        for forbidden in (".blob.core.windows.net", ".table.core.windows.net", ".azurewebsites.net", "AccountKey=", "SharedAccessSignature="):
            if forbidden in content:
                errors.append(f"{asset}: internal distribution address or credential present")
    report_copy = (ROOT / "report/index.html").read_text(encoding="utf-8")
    for phrase in ("Historical example", "Not current conditions", "approximately 14 nm ENE", "not a confirmed weed line"):
        if phrase not in report_copy:
            errors.append(f"report/index.html: missing report safety copy {phrase!r}")
    for page in (Path("report/index.html"), Path("report/privacy/index.html"), *DESTINATION_PAGES):
        parser = parsed_pages.get(page)
        if parser and (parser.form_count or any(kind in ("email", "password", "tel") for kind in parser.input_types)):
            errors.append(f"{page}: website-only report reader must not collect contacts or credentials")
    report_script = (ROOT / "assets/js/report.js").read_text(encoding="utf-8")
    for forbidden in ("signupEnabled", "FormData(", "/subscribe", "/unsubscribe", "sendBeacon("):
        if forbidden in report_script:
            errors.append(f"assets/js/report.js: obsolete mutation or signup code {forbidden!r}")
    try:
        catalog = json.loads((ROOT / "data/report-destinations.json").read_text(encoding="utf-8"))
        if set(catalog) != {"schemaVersion", "destinations"}:
            errors.append("Static destination catalog contains obsolete or nonpublic settings")
        destinations = catalog["destinations"]
        ids = [place["id"] for place in destinations]
        if not ids or len(ids) != len(set(ids)):
            errors.append("data/report-destinations.json: missing or duplicate destination IDs")
        if any(place.get("available") is not False for place in destinations):
            errors.append("Static destination fallback must never assert live report availability")
        if any(set(place) - {"id", "name", "admin", "coast", "timeZone", "available"} for place in destinations):
            errors.append("Static destination catalog contains nonpublic fields")
    except (OSError, KeyError, TypeError, json.JSONDecodeError):
        errors.append("data/report-destinations.json: invalid public destination catalog")

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
        report_routes = [route for route in config.get("routes", []) if route.get("route") == "/report/*"]
        routes = config.get("routes", [])
        report_wildcard = next((index for index, route in enumerate(routes) if route.get("route") == "/report/*"), len(routes))
        for row in DESTINATION_ROWS:
            path = f'/report/{row["id"]}'
            if not any(route.get("route") == path and route.get("redirect") == path + "/" and route.get("statusCode") == 301 for route in routes[:report_wildcard]):
                errors.append(f"staticwebapp.config.json: missing canonical redirect for {path}")
        if not any("form-action 'none'" in route.get("headers", {}).get("content-security-policy", "") for route in report_routes):
            errors.append("staticwebapp.config.json: report routes must prohibit form submissions")
        for route_path in ("/report", "/report/privacy"):
            if not any(route.get("route") == route_path and route.get("redirect") == route_path + "/" and route.get("statusCode") == 301 for route in config.get("routes", [])):
                errors.append(f"staticwebapp.config.json: {route_path} must permanently redirect to directory route")
        if not any(
            route.get("route") == "/sources"
            and route.get("redirect") == "/sources/"
            and route.get("statusCode") == 301
            for route in config.get("routes", [])
        ):
            errors.append("staticwebapp.config.json: /sources must permanently redirect to /sources/")
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
