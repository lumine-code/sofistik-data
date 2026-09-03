"""Tests for the local licensed-catalogue staging step."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("0_copyerr.py")
SPEC = importlib.util.spec_from_file_location("sofistik_copyerr", MODULE_PATH)
copier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(copier)


class CopierTests(unittest.TestCase):
    def test_uses_versions_from_the_data_manifest(self):
        self.assertEqual(
            copier.available_versions(),
            ["2018", "2020", "2022", "2023", "2024", "2025", "2026"],
        )

    def test_missing_source_does_not_delete_the_existing_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cache = root / "cache"
            destination = cache / "2026"
            destination.mkdir(parents=True)
            existing = destination / "existing.err"
            existing.write_text("cached", encoding="utf-8")

            copied = copier.copy_err_files("2026", cache, root / "missing")

            self.assertEqual(copied, 0)
            self.assertEqual(existing.read_text(encoding="utf-8"), "cached")

    def test_replaces_the_cache_only_after_sources_are_available(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "install" / "2026" / "SOFiSTiK 2026"
            source.mkdir(parents=True)
            (source / "a.err").write_text("a", encoding="utf-8")
            (source / "TABLELAYOUT.err").write_text("skip", encoding="utf-8")

            cache = root / "cache"
            destination = cache / "2026"
            destination.mkdir(parents=True)
            (destination / "old.err").write_text("old", encoding="utf-8")

            copied = copier.copy_err_files("2026", cache, root / "install")

            self.assertEqual(copied, 1)
            self.assertEqual([file.name for file in destination.glob("*.err")], ["a.err"])
            provenance = json.loads(
                (destination / "provenance.json").read_text(encoding="utf-8")
            )
            self.assertEqual(provenance["release"], "2026")
            self.assertEqual(provenance["catalogues"][0]["file"], "a.err")
            self.assertEqual(len(provenance["catalogues"][0]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
