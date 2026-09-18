#!/usr/bin/env python3
"""Offline checks for destination shells; no providers, credentials or reports."""

from html.parser import HTMLParser
from pathlib import Path
import tempfile
import unittest

import build_report_pages as builder


TEMPLATE = '''<!doctype html><html lang="en"><head>
<title>Report</title><meta name="description" content="Report">
<meta property="og:title" content="Report"><meta property="og:description" content="Report">
<meta property="og:url" content="https://www.bluewatermarlin.com/report/">
<link rel="canonical" href="https://www.bluewatermarlin.com/report/">
<link rel="stylesheet" href="../assets/css/report.css"><script src="../assets/js/report.js" defer></script>
</head><body class="report-page"><main>
<h1 id="page-title">Report</h1><p class="intro">Report</p>
<input id="destination-search" type="search" disabled><p id="selection-status">Choose a destination.</p>
<p id="report-kind">Choose a destination</p><h2 id="report-title">Choose a destination</h2>
<p id="report-meta"></p><p id="report-notice">No report selected.</p>
<div id="report-body"><div class="empty-report"><h3>Select a destination</h3><p>No current conditions.</p></div></div>
<!-- REPORT_DESTINATION_DIRECTORY_START -->
<!-- REPORT_DESTINATION_DIRECTORY_END -->
<template id="historical-report"><section><h3>Oregon Inlet historical example</h3><p>Not current conditions.</p></section></template>
<noscript>JavaScript required.</noscript></main>
<footer><a href="./" aria-current="page">Report</a><a href="./privacy/">Privacy</a><a href="../">Home</a></footer>
</body></html>
'''


class Links(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.links = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {"href", "src"}:
                self.links.append(value)


class ReportPagesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = builder.catalog()

    def test_catalog_has_only_reviewed_us_destinations(self):
        self.assertEqual(len(self.rows), 60)
        self.assertEqual({coast: sum(row["coast"] == coast for row in self.rows)
                          for coast in builder.COASTS}, {"atlantic": 27, "gulf": 16, "west-coast": 17})

    def test_directory_links_every_destination_without_javascript(self):
        content = builder.directory(self.rows)
        links = Links(content).links
        self.assertEqual(links, [f'/report/{row["id"]}/' for coast in builder.COASTS
                                 for row in self.rows if row["coast"] == coast])
        self.assertEqual(content.count('<details '), 3)
        self.assertNotIn(' onclick=', content)

    def test_every_leaf_has_identity_and_root_relative_navigation(self):
        for row in self.rows:
            with self.subTest(destination=row["id"]):
                page = builder.destination_page(TEMPLATE, row, self.rows)
                self.assertIn(f'data-report-destination="{row["id"]}"', page)
                self.assertIn(f'https://www.bluewatermarlin.com/report/{row["id"]}/', page)
                spans = builder.Elements(page).by_id
                title = spans["report-title"]
                self.assertEqual(page[title[1]:title[2]], builder.escape(builder.label(row)))
                body = spans["report-body"]
                self.assertNotIn('historical', page[body[1]:body[2]])
                for link in Links(page).links:
                    self.assertTrue(link.startswith(("/", "#", "https://")), link)
                self.assertIn('href="/report/privacy/"', page)
                self.assertEqual(page.count('href="/report/' + row["id"] + '/" aria-current="page"'), 1)

    def test_missing_marker_and_unisolated_history_fail_closed(self):
        with self.assertRaises(ValueError):
            builder.with_directory(TEMPLATE.replace(builder.START, ""), self.rows)
        with self.assertRaises(ValueError):
            builder.destination_page(TEMPLATE.replace('id="historical-report"', 'id="other"'), self.rows[0], self.rows)

    def test_marker_update_preserves_surrounding_hub_exactly(self):
        changed = builder.with_directory(TEMPLATE, self.rows)
        self.assertEqual(changed.split(builder.START)[0], TEMPLATE.split(builder.START)[0])
        self.assertEqual(changed.split(builder.END)[1], TEMPLATE.split(builder.END)[1])
        self.assertEqual(builder.with_directory(changed, self.rows), changed)

    def test_build_and_check_are_deterministic_and_never_delete(self):
        with tempfile.TemporaryDirectory(prefix="report-pages-test-") as directory:
            root = Path(directory).resolve()
            (root / "data").mkdir()
            (root / "report").mkdir()
            (root / "data/report-destinations.json").write_text(
                (builder.ROOT / "data/report-destinations.json").read_text())
            (root / "report/index.html").write_text(TEMPLATE)
            sentinel = root / "report/untouched.txt"
            sentinel.write_text("preserve me")
            self.assertEqual(builder.build(root), (60, 61))
            self.assertEqual(builder.build(root), (60, 0))
            self.assertEqual(builder.build(root, check=True), (60, 0))
            self.assertEqual(sentinel.read_text(), "preserve me")
            leaf = root / "report/miami-fl/index.html"
            leaf.write_text(leaf.read_text() + "\nchanged")
            with self.assertRaises(ValueError):
                builder.build(root, check=True)


if __name__ == "__main__":
    unittest.main()
