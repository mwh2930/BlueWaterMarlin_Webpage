#!/usr/bin/env python3
"""Build destination report shells from the shared hub; never fetch or publish data."""

from __future__ import annotations

import argparse
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[1]
START = "<!-- REPORT_DESTINATION_DIRECTORY_START -->"
END = "<!-- REPORT_DESTINATION_DIRECTORY_END -->"
ORIGIN = "https://www.bluewatermarlin.com"
COASTS = {"atlantic": "Atlantic Coast", "gulf": "Gulf Coast", "west-coast": "Pacific Coast"}
STATES = {"FL", "GA", "SC", "NC", "VA", "MD", "DE", "NJ", "NY", "RI", "MA", "ME",
          "AL", "MS", "LA", "TX", "CA", "OR", "WA"}
ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


def catalog(root=ROOT):
    value = json.loads((root / "data/report-destinations.json").read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise ValueError("invalid destination catalog")
    rows = value.get("destinations")
    if not isinstance(rows, list) or len(rows) != 60:
        raise ValueError("expected the reviewed 60-destination U.S. catalog")
    seen = set()
    for row in rows:
        if (not isinstance(row, dict) or not isinstance(row.get("id"), str)
                or not ID.fullmatch(row["id"]) or row["id"] in seen
                or row.get("admin") not in STATES or row.get("coast") not in COASTS
                or row.get("available") is not False
                or not isinstance(row.get("name"), str) or not row["name"].strip()
                or len(row["name"]) > 120 or re.search(r"[\x00-\x1f<>]", row["name"])):
            raise ValueError("catalog must contain reviewed, unique U.S. destinations with lookup disabled")
        seen.add(row["id"])
    return rows


def label(row):
    return row["name"] + ", " + row["admin"]


def directory(rows, current=None):
    lines = [
        '        <section class="report-directory" aria-labelledby="report-directory-title" id="destinations">',
        '          <div class="directory-heading"><div><p class="eyebrow">United States</p>',
        '          <h2 id="report-directory-title">Choose a destination</h2></div>',
        '          <p>When search is unavailable, open a coast and select a report.</p></div>',
        '          <div class="directory-coasts">',
    ]
    for coast, name in COASTS.items():
        places = [row for row in rows if row["coast"] == coast]
        lines += [
            f'            <details class="directory-coast" id="destinations-{coast}">',
            f'              <summary><span>{name}</span><span class="directory-count">{len(places)} destinations</span></summary>',
            f'              <nav aria-label="{name} destinations"><ul>',
        ]
        for row in places:
            active = ' aria-current="page"' if row["id"] == current else ""
            lines.append(f'                <li><a href="/report/{row["id"]}/"{active}><span>{escape(row["name"])}</span><span class="directory-state">{row["admin"]}</span></a></li>')
        lines += ['              </ul></nav>', '            </details>']
    lines += ['          </div>', '        </section>']
    return "\n".join(lines)


def with_directory(source, rows, current=None):
    if source.count(START) != 1 or source.count(END) != 1:
        raise ValueError("hub needs exactly one destination-directory marker pair")
    before, tail = source.split(START, 1)
    _, after = tail.split(END, 1)
    return before + START + "\n" + directory(rows, current) + "\n        " + END + after


class Elements(HTMLParser):
    """Locate complete, possibly nested elements without rewriting the template."""

    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source, self.stack, self.by_id = source, [], {}
        self.lines = [0]
        for match in re.finditer("\n", source):
            self.lines.append(match.end())
        self.feed(source)

    def absolute_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        beginning = self.absolute_offset()
        row = (tag, values.get("id"), beginning, beginning + len(self.get_starttag_text()))
        if tag not in VOID:
            self.stack.append(row)
        elif row[1]:
            self.by_id[row[1]] = (beginning, row[3], row[3], row[3])

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                _, ident, beginning, inner = self.stack[index]
                del self.stack[index:]
                if ident:
                    if ident in self.by_id:
                        raise ValueError(f"duplicate template id: {ident}")
                    closing = self.absolute_offset()
                    self.by_id[ident] = (beginning, inner, closing, self.source.index(">", closing) + 1)
                return


def replace_inner(source, ident, content):
    element = Elements(source).by_id.get(ident)
    if element is None:
        raise ValueError(f"missing template element: {ident}")
    _, opening_end, closing, _ = element
    return source[:opening_end] + content + source[closing:]


def replace_once(source, pattern, replacement):
    result, count = re.subn(pattern, lambda _: replacement, source, flags=re.S)
    if count != 1:
        raise ValueError("template element must occur exactly once: " + pattern)
    return result


def root_relative(source):
    def replace(match):
        prefix, value, quote = match.groups()
        parsed = urlsplit(value)
        if not value or value.startswith(("#", "/")) or parsed.scheme or parsed.netloc:
            return match.group(0)
        return prefix + urljoin("/report/", value) + quote
    return re.sub(r'((?:href|src)=")(.*?)(")', replace, source)


def destination_page(template, row, rows):
    if 'id="historical-report"' not in template:
        raise ValueError("the hub historical example must be isolated in its inert template before generating pages")
    ident = row["id"]
    name = escape(label(row))
    title = f"{label(row)} Offshore Report — B.I.L.L. | BlueWater Marlin"
    description = (f"Read the B.I.L.L. offshore report for {label(row)} on the {COASTS[row['coast']]}. "
                   "Check report dates, source dates and availability for your destination.")
    canonical = ORIGIN + "/report/" + ident + "/"
    page = with_directory(template, rows, ident)
    page = replace_once(page, r'<title>.*?</title>', '<title>' + escape(title) + '</title>')
    for attribute, field, value in (("name", "description", description), ("property", "og:title", title),
                                    ("property", "og:description", description), ("property", "og:url", canonical)):
        page = replace_once(page, rf'<meta {attribute}="{field}" content="[^"]*">',
                            f'<meta {attribute}="{field}" content="{escape(value, quote=True)}">')
    page = replace_once(page, r'<link rel="canonical" href="[^"]*">',
                        f'<link rel="canonical" href="{canonical}">')
    page = replace_once(page, r'<body class="report-page">',
                        f'<body class="report-page" data-report-destination="{ident}">')
    # Unlike the unselected hub, a permanent leaf has useful static identity.
    # Keep it readable while data loads and without JavaScript.
    sheet = Elements(page).by_id.get("report-sheet")
    if sheet is None:
        raise ValueError("missing template element: report-sheet")
    opening, opening_end, _, _ = sheet
    visible_sheet = re.sub(r'''\s+hidden(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|>)''',
                           "", page[opening:opening_end], flags=re.I)
    page = page[:opening] + visible_sheet + page[opening_end:]
    page = replace_inner(page, "page-title", '<span class="report-name">B.I.L.L.</span> ' + name + ' Report')
    breadcrumb = ('<nav class="report-breadcrumb" aria-label="Breadcrumb"><ol>'
                  '<li><a href="/">Home</a></li><li><a href="/report/">Report</a></li>'
                  f'<li><span aria-current="page">{name}</span></li></ol></nav>')
    page = replace_once(page, r'<p class="intro">.*?</p>',
                        f'<p class="intro">{COASTS[row["coast"]]} · United States</p>\n        {breadcrumb}')
    for target, content in (
        ("report-kind", "Selected destination"), ("report-title", name), ("report-meta", ""),
        ("selection-status", "Selected destination: " + name + "."),
        ("report-notice", "Checking for a published report for " + name + ". No current conditions are shown until it is available."),
        ("report-body", '<div class="empty-report">'
         '<p>The report loads from published destination data. If it is unavailable, no current conditions will be inferred.</p></div>'),
    ):
        page = replace_inner(page, target, content)
    page = replace_once(page, r'<input id="destination-search"[^>]*>',
                        re.search(r'<input id="destination-search"[^>]*>', page).group(0)[:-1]
                        + f' value="{name}">')
    page = replace_once(page, r'<noscript>.*?</noscript>',
                        '<noscript><p class="report-notice">JavaScript is required to load the current report for '
                        + name + '. You can browse all U.S. destination pages using the links on this page. '
                        'No current conditions are shown without the report connection.</p></noscript>')
    # The footer leads back to the report directory; this leaf owns aria-current instead.
    page = page.replace('<a href="./" aria-current="page">Report</a>', '<a href="/report/">Report</a>')
    page = page.replace('<a href="/report/" aria-current="page">Report</a>', '<a href="/report/">Report</a>')
    return root_relative(page)


def outputs(root=ROOT):
    rows = catalog(root)
    template = (root / "report/index.html").read_text(encoding="utf-8")
    pages = {Path("report/index.html"): with_directory(template, rows)}
    for row in rows:
        pages[Path("report") / row["id"] / "index.html"] = destination_page(template, row, rows)
    return pages


def build(root=ROOT, *, check=False):
    pages = outputs(root)
    changed = []
    for relative, content in pages.items():
        target = root / relative
        if any(part.is_symlink() for part in (target, *target.parents)):
            raise ValueError("refusing symbolic-link output path")
        if target.exists() and target.read_text(encoding="utf-8") == content:
            continue
        changed.append(str(relative))
        if not check:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
    if check and changed:
        raise ValueError("generated report pages need rebuilding: " + ", ".join(changed))
    return len(pages) - 1, len(changed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify generated pages without writing")
    args = parser.parse_args()
    try:
        total, changed = build(check=args.check)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.exit(1, str(error) + "\n")
    print(f"Verified {total} destination report pages." if args.check else
          f"Built {total} destination report pages; {changed} files updated. No data fetched or published.")


if __name__ == "__main__":
    main()
