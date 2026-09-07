"""Focused tests for the source catalogue parser."""

import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("1_extract.py")
SPEC = importlib.util.spec_from_file_location("sofistik_extract", MODULE_PATH)
extractor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(extractor)


class ExtractorTests(unittest.TestCase):
    def test_parses_a_complete_catalogue_through_localization(self):
        with tempfile.TemporaryDirectory() as directory:
            catalogue = Path(directory) / "dbin.err"
            catalogue.write_text(
                "0000DBIN SOFiSTiK\n"
                "0000VERSION 202600\n"
                "-*0=TEST NO \"TYPE\n"
                "-*0K A B\n",
                encoding="utf-8",
            )

            commands = extractor.parse_all_err_files(directory)
            self.assertIn("DBINFO", commands)

            for language in ("de", "en"):
                schema, _filled = extractor.build_language_schema(commands, language)
                slots = schema["DBINFO"]["TEST"]["slots"]
                self.assertEqual([slot["name"] for slot in slots], ["NO", "TYPE"])
                self.assertEqual(slots[1]["enumValues"], ["A", "B"])

    def test_pairs_commands_from_separate_language_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            catalogue = Path(directory) / "sofistik.err"
            catalogue.write_text(
                "0000SOFISTIK SOFiSTiK\n"
                "0000VERSION 202600\n"
                '-10 KOPF"XXXX\n'
                "-10 SEIT NRST\n"
                '-10 STEU"OPT VAL\n'
                "-10 ENDE\n"
                '-20 HEAD"XXXX\n'
                "-20 PAGE FIRS\n"
                '-20 CTRL"OPT VAL\n'
                "-20 END\n",
                encoding="utf-8",
            )

            parsed = extractor.parse_err_file(catalogue)
            self.assertEqual(
                [(command["de"], command["en"]) for command in parsed["commands"].values()],
                [
                    ("KOPF", "HEAD"),
                    ("SEIT", "PAGE"),
                    ("STEU", "CTRL"),
                    ("ENDE", "END"),
                ],
            )

            for language, expected in (
                ("de", {"KOPF", "SEIT", "STEU", "ENDE"}),
                ("en", {"HEAD", "PAGE", "CTRL", "END"}),
            ):
                schema, _filled = extractor.build_language_schema(
                    {"SOFISTIK": parsed["commands"]}, language
                )
                self.assertTrue(expected.issubset(schema["BASIC"]))

            english, _filled = extractor.build_language_schema(
                {"SOFISTIK": parsed["commands"]}, "en"
            )
            self.assertEqual(english["BASIC"]["CTRL"]["slots"][0]["name"], "OPT")

    def test_pairs_adjacent_commands_with_legacy_delimiters(self):
        with tempfile.TemporaryDirectory() as directory:
            catalogue = Path(directory) / "bemess.err"
            catalogue.write_text(
                "0000BEMESS SOFiSTiK\n"
                "0000VERSION 202600\n"
                "-10 BEW`BEZ\n"
                "-20 REIN`TITL\n"
                "-10 SEIT=\n"
                "-20 PAGE=\n",
                encoding="utf-8",
            )

            commands = extractor.parse_err_file(catalogue)["commands"]
            self.assertEqual(
                (commands["BEW"]["de"], commands["BEW"]["en"]),
                ("BEW", "REIN"),
            )
            self.assertEqual(
                [slot["name"] for slot in commands["BEW"]["slots_de"]], ["BEZ"]
            )
            self.assertEqual(
                [slot["name"] for slot in commands["BEW"]["slots_en"]], ["TITL"]
            )
            self.assertEqual(
                (commands["SEIT"]["de"], commands["SEIT"]["en"]),
                ("SEIT", "PAGE"),
            )
            self.assertEqual(commands["SEIT"]["slots_de"], [])
            self.assertEqual(commands["SEIT"]["slots_en"], [])

    def test_clears_only_stale_intermediate_schema_files(self):
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            stale_schema = output_dir / "sofistik.2026.en.schema.json"
            compact_data = output_dir / "sofistik.2026.en.json"
            unrelated_schema = output_dir / "notes.schema.json"
            for file in (stale_schema, compact_data, unrelated_schema):
                file.write_text("{}\n", encoding="utf-8")

            extractor.clear_extracted_schemas(output_dir)

            self.assertFalse(stale_schema.exists())
            self.assertTrue(compact_data.exists())
            self.assertTrue(unrelated_schema.exists())

    def test_rejects_a_missing_or_empty_release_source(self):
        with tempfile.TemporaryDirectory() as directory:
            build_dir = Path(directory)
            output_dir = build_dir / "extracted"
            with self.assertRaises(FileNotFoundError):
                extractor.process_version("2099", build_dir, output_dir)

            (build_dir / "2099").mkdir()
            with self.assertRaises(RuntimeError):
                extractor.process_version("2099", build_dir, output_dir)

    def test_keeps_localized_page_as_a_universal_basic_command(self):
        page = extractor.command_template("PAGE")
        page["de"] = "SEIT"
        page["slots_de"] = extractor.extract_param_slots("UNIE")
        page["slots_en"] = extractor.extract_param_slots("UNII")

        control = extractor.command_template("CTRL")
        control["slots_de"] = extractor.extract_param_slots("WARN")
        control["slots_en"] = extractor.extract_param_slots("WARN")

        page_reference = extractor.command_template("PAGE")
        page_reference["de"] = "SEIT"
        all_commands = {
            "SOFISTIK": {"PAGE": page, "CTRL": control},
            "ASE": {
                "PAGE": page_reference,
                "CTRL": extractor.command_template("CTRL"),
            },
        }

        for language, localized_page, localized_item in (
            ("en", "PAGE", "UNII"),
            ("de", "SEIT", "UNIE"),
        ):
            with self.subTest(language=language):
                schema, filled = extractor.build_language_schema(all_commands, language)

                self.assertEqual(
                    schema["ASE"][localized_page], schema["BASIC"][localized_page]
                )
                self.assertEqual(
                    schema["BASIC"][localized_page]["slots"][0]["name"],
                    localized_item,
                )
                self.assertIn(localized_page, filled)
                self.assertNotIn("CTRL", schema["BASIC"])

    def test_recovers_page_from_a_module_when_the_basic_source_is_missing(self):
        page = extractor.command_template("PAGE")
        page["de"] = "SEIT"
        page["slots_de"] = extractor.extract_param_slots("UNIE")
        page["slots_en"] = extractor.extract_param_slots("UNII")

        incomplete_basic_page = extractor.command_template("SEIT")
        all_commands = {
            "SOFISTIK": {"SEIT": incomplete_basic_page},
            "TENDON": {"PAGE": page},
            "ASE": {"PAGE": extractor.command_template("PAGE")},
        }

        schema, filled = extractor.build_language_schema(all_commands, "en")

        self.assertEqual(schema["BASIC"]["PAGE"], schema["TENDON"]["PAGE"])
        self.assertEqual(schema["ASE"]["PAGE"], schema["BASIC"]["PAGE"])
        self.assertEqual(schema["BASIC"]["PAGE"]["slots"][0]["name"], "UNII")
        self.assertIn("PAGE", filled)

    def test_preserves_prefixed_placeholders_and_repeated_names(self):
        slots = extractor.extract_param_slots('"XXXX GAMA"APAR"SUP "FAT APAR')

        self.assertEqual([slot["position"] for slot in slots], list(range(1, 7)))
        self.assertEqual(slots[0]["name"], None)
        self.assertEqual(slots[0]["kind"], "placeholder")
        self.assertEqual(
            [(slot["name"], slot["kind"]) for slot in slots[1:]],
            [
                ("GAMA", "keyword"),
                ("APAR", "enum"),
                ("SUP", "enum"),
                ("FAT", "enum"),
                ("APAR", "keyword"),
            ],
        )

    def test_preserves_directional_and_ratio_item_names(self):
        slots = extractor.extract_param_slots("P+ P- MY+ MY- A/U MUE-")

        self.assertEqual(
            [slot["name"] for slot in slots],
            ["P+", "P-", "MY+", "MY-", "A/U", "MUE-"],
        )
        prefixed = extractor.extract_param_slots('"P+ \'MY- !A/U')
        self.assertEqual(
            [(slot["name"], slot["kind"]) for slot in prefixed],
            [("P+", "enum"), ("MY-", "literal"), ("A/U", "keyword")],
        )

    def test_aligns_data_type_codes_by_source_column(self):
        slots = extractor.extract_param_slots('"OPT \'VAL  VAL2', start_column=8)
        line = "-*2" + " " * (slots[1]["_column"] - 3) + "9999"

        extractor.assign_data_types(slots, line)

        self.assertIsNone(slots[0]["dataTypeCode"])
        self.assertEqual(slots[1]["dataTypeCode"], "9999")
        self.assertIsNone(slots[2]["dataTypeCode"])

    def test_resolves_redirect_values_and_retains_provenance(self):
        schema = {
            "TEST": {
                "BASE": {
                    "slots": [
                        {
                            "position": 1,
                            "name": "TYPE",
                            "kind": "enum",
                            "dataTypeCode": None,
                            "enumValues": ["A", "B"],
                            "enumRedirect": None,
                        }
                    ]
                },
                "USE": {
                    "slots": [
                        {
                            "position": 1,
                            "name": "MODE",
                            "kind": "enum",
                            "dataTypeCode": None,
                            "enumValues": [],
                            "enumRedirect": {"command": "BASE", "item": "TYPE"},
                        }
                    ]
                },
            }
        }

        redirects, unresolved = extractor.resolve_enum_redirects(schema)

        self.assertEqual((redirects, unresolved), (1, 0))
        self.assertEqual(schema["TEST"]["USE"]["slots"][0]["enumValues"], ["A", "B"])
        self.assertEqual(
            schema["TEST"]["USE"]["slots"][0]["enumRedirect"],
            {"command": "BASE", "item": "TYPE"},
        )


if __name__ == "__main__":
    unittest.main()
