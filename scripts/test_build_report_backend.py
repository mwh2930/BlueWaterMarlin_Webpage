#!/usr/bin/env python3
"""Offline packaging checks. Never access Azure or install dependencies."""

from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


SPEC = importlib.util.spec_from_file_location("report_package", Path(__file__).with_name("build_report_backend.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReportPackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / "website"
        self.backend = self.source / "backend" / "reports"
        self.backend.mkdir(parents=True)
        (self.backend / "data").mkdir()
        (self.source / "data").mkdir()
        for name in MODULE.RUNTIME_FILES:
            (self.backend / name).write_text("export const test = true;\n", encoding="utf-8")
        self.package = {"name": "report-test", "version": "0.1.0", "private": True,
                        "type": "module", "main": "functions.mjs",
                        "dependencies": {"@azure/functions": "4.16.2"}, "engines": {"node": ">=22"}}
        self.lock = {"lockfileVersion": 3, "packages": {"": {
            key: self.package[key] for key in ("name", "version", "dependencies", "engines")}}}
        self.write_json(self.backend / "package.json", self.package)
        self.write_json(self.backend / "package-lock.json", self.lock)
        self.write_json(self.backend / "host.json", {"version": "2.0", "extensions": {"http": {"routePrefix": "api"}}})
        self.catalog = {"schemaVersion": 1, "destinations": [
            {"id": "oregon-inlet-nc", "name": "Oregon Inlet", "admin": "NC",
             "available": False, "coast": "atlantic", "timeZone": "America/New_York"}]}
        self.write_json(self.source / MODULE.CATALOG_PATH, self.catalog)
        self.write_json(self.source / MODULE.CATALOG_SOURCE_PATH, self.catalog)

    def write_json(self, path, value):
        path.write_text(json.dumps(value), encoding="utf-8")

    def build(self, name="reports.zip"):
        return MODULE.build_package(self.source, self.root / name)

    def test_exact_archive_is_reproducible_and_catalog_is_sanitized(self):
        first, second = self.build("first.zip"), self.build("second.zip")
        self.assertEqual(first["sha256"], second["sha256"])
        self.assertEqual(first["files"], 9)
        self.assertEqual(hashlib.sha256(Path(first["package"]).read_bytes()).hexdigest(), first["sha256"])
        with zipfile.ZipFile(first["package"]) as archive:
            self.assertEqual(archive.namelist(), sorted((*MODULE.RUNTIME_FILES, MODULE.CATALOG_PATH)))
            self.assertTrue(all(item.date_time == MODULE.FIXED_TIME for item in archive.infolist()))
            self.assertTrue(all(item.external_attr >> 16 == 0o100644 for item in archive.infolist()))
            catalog = json.loads(archive.read(MODULE.CATALOG_PATH))
            self.assertEqual(catalog["destinations"], [{"id": "oregon-inlet-nc", "name": "Oregon Inlet",
                                                        "admin": "NC", "available": False}])
            self.assertEqual(json.loads(archive.read("package.json"))["main"], "functions.mjs")

    def test_private_and_development_inputs_never_enter_archive(self):
        marker = "DO-NOT-SHIP-report-inputs-private-storage-marker"
        for name in ("local.settings.json", "local.settings.example.json", ".env", "dev-server.mjs",
                     "README.md", "reports/latest.json", "node_modules/private.js", "test/private.mjs"):
            path = self.backend / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(marker, encoding="utf-8")
        (self.source / "index.html").write_text(marker, encoding="utf-8")
        result = self.build()
        with zipfile.ZipFile(result["package"]) as archive:
            self.assertTrue(all(marker.encode() not in archive.read(name) for name in archive.namelist()))
            self.assertEqual(len(archive.namelist()), 9)

    def test_backend_catalog_is_independent_of_the_public_picker_catalog(self):
        # A missing or invalid UI catalog cannot narrow or replace the server
        # catalog when building a backend-only release.
        public_path = self.source / MODULE.CATALOG_PATH
        public_path.write_text("not a backend catalog", encoding="utf-8")
        first = self.build("separate-catalog.zip")
        public_path.unlink()
        second = self.build("without-public-catalog.zip")
        self.assertEqual(first["sha256"], second["sha256"])
        with zipfile.ZipFile(first["package"]) as archive:
            packaged = json.loads(archive.read(MODULE.CATALOG_PATH))
            self.assertEqual([row["id"] for row in packaged["destinations"]], ["oregon-inlet-nc"])

    def test_missing_backend_catalog_never_falls_back_to_the_public_catalog(self):
        (self.source / MODULE.CATALOG_SOURCE_PATH).unlink()
        self.assertTrue((self.source / MODULE.CATALOG_PATH).is_file())
        with self.assertRaises(OSError):
            self.build()
        self.assertFalse((self.root / "reports.zip").exists())

    def test_reviewed_backend_catalog_preserves_76_server_ids_and_60_public_matches(self):
        backend_bytes = MODULE.source_bytes(MODULE.ROOT / MODULE.CATALOG_SOURCE_PATH)
        backend_catalog = MODULE.document(backend_bytes)
        public_catalog = MODULE.document(MODULE.source_bytes(MODULE.ROOT / MODULE.CATALOG_PATH))
        self.assertEqual(backend_catalog["schemaVersion"], 1)
        self.assertEqual(len(backend_catalog["destinations"]), 76)
        by_id = {row["id"]: row for row in backend_catalog["destinations"]}
        self.assertEqual(len(by_id), 76)
        self.assertEqual(MODULE.document(MODULE.sanitized_catalog(backend_bytes)), backend_catalog)
        for row in backend_catalog["destinations"]:
            self.assertEqual(set(row), {"id", "name", "admin", "available"})
            self.assertIs(row["available"], False, "Only explicit runtime approval can enable lookup")
        self.assertEqual(len(public_catalog["destinations"]), 60)
        self.assertEqual(len({row["id"] for row in public_catalog["destinations"]}), 60)
        for row in public_catalog["destinations"]:
            with self.subTest(destination=row["id"]):
                self.assertIn(row["id"], by_id)
                self.assertEqual(by_id[row["id"]]["name"], row["name"])
                self.assertEqual(by_id[row["id"]]["admin"], row["admin"])
                self.assertIs(row["available"], False)
        self.write_json(self.source / MODULE.CATALOG_SOURCE_PATH, backend_catalog)
        package = self.build("full-server-catalog.zip")
        with zipfile.ZipFile(package["package"]) as archive:
            self.assertEqual(json.loads(archive.read(MODULE.CATALOG_PATH)), backend_catalog)
            self.assertNotIn(MODULE.CATALOG_SOURCE_PATH, archive.namelist(), "Archive keeps the established runtime catalog path")

    def test_missing_runtime_file_fails_before_creating_zip(self):
        (self.backend / "security.mjs").unlink()
        with self.assertRaises(OSError):
            self.build()
        self.assertFalse((self.root / "reports.zip").exists())

    def test_source_and_catalog_symlinks_are_rejected(self):
        for relative in ("backend/reports/service.mjs", MODULE.CATALOG_SOURCE_PATH):
            with self.subTest(relative=relative):
                path = self.source / relative
                original = path.read_bytes()
                target = self.root / "private-target"
                target.write_bytes(original)
                path.unlink()
                path.symlink_to(target)
                with self.assertRaises(ValueError):
                    self.build()
                path.unlink()
                path.write_bytes(original)
        link = self.root / "source-link"
        link.symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(ValueError):
            MODULE.build_package(link, self.root / "reports.zip")
        parent_link = self.root / "parent-link"
        parent_link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            MODULE.build_package(parent_link / "website", self.root / "reports.zip")

    def test_output_must_be_isolated_and_never_overwrite(self):
        existing = self.root / "existing.zip"
        existing.write_bytes(b"keep")
        for output in (self.source / "backend.zip", self.source / "data" / "backend.zip", existing):
            with self.subTest(output=output), self.assertRaises(ValueError):
                MODULE.build_package(self.source, output)
        self.assertEqual(existing.read_bytes(), b"keep")
        link = self.root / "output.zip"
        link.symlink_to(existing)
        with self.assertRaises(ValueError):
            MODULE.build_package(self.source, link)

    def test_catalog_rejects_availability_duplicates_unknown_fields_and_unsafe_text(self):
        invalid = []
        for key, value in (("available", True), ("available", 0), ("name", "https://private.blob.core.windows.net"),
                           ("id", "../other"), ("inputPath", "report-inputs/private")):
            catalog = deepcopy(self.catalog)
            catalog["destinations"][0][key] = value
            invalid.append(catalog)
        duplicate = deepcopy(self.catalog)
        duplicate["destinations"].append(deepcopy(duplicate["destinations"][0]))
        invalid.append(duplicate)
        invalid.append({"schemaVersion": True, "destinations": self.catalog["destinations"]})
        for catalog in invalid:
            with self.subTest(catalog=catalog), self.assertRaises(ValueError):
                MODULE.sanitized_catalog(json.dumps(catalog).encode())
        with self.assertRaises(ValueError):
            MODULE.sanitized_catalog(b'{"schemaVersion":1,"schemaVersion":1,"destinations":[]}')

    def test_entrypoint_and_lock_must_match_runtime(self):
        self.package["main"] = "dev-server.mjs"
        self.write_json(self.backend / "package.json", self.package)
        with self.assertRaises(ValueError):
            self.build()
        self.package["main"] = "functions.mjs"
        self.package["dependencies"]["@azure/functions"] = "0.0.0"
        self.write_json(self.backend / "package.json", self.package)
        with self.assertRaises(ValueError):
            self.build()


if __name__ == "__main__":
    unittest.main()
