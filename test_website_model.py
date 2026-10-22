"""Run model checks: python -m unittest test_website_model.py"""
import json
import math
from pathlib import Path
import tempfile
import unittest

from website_model import predict_price


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "app_assets"


class WebsiteModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.examples = json.loads(
            (ASSETS / "prediction_examples.json").read_text(encoding="utf8")
        )

    def test_saved_notebook_examples_match(self):
        for case in self.examples:
            with self.subTest(inputs=case["inputs"]):
                value = predict_price(case["inputs"], ASSETS)
                self.assertTrue(
                    math.isclose(
                        value, case["expected_price_USD"], rel_tol=1e-10, abs_tol=1e-6
                    )
                )

    def test_invalid_inputs_are_rejected(self):
        cases = {
            "unknown_zip": {"ZIP Code": "99999"},
            "unknown_class": {"Property Class": "999"},
            "zero_area": {"Building Area (sq ft)": 0},
            "negative_land": {"Land Area (sq ft)": -1},
            "nonfinite_area": {"Building Area (sq ft)": float("nan")},
            "negative_bedrooms": {"Bedrooms": -1},
            "fractional_bathrooms": {"Full Bathrooms": 1.5},
            "future_year_built": {"Year Built": 3000},
            "missing_bedrooms": None,
        }
        for name, changes in cases.items():
            details = dict(self.examples[0]["inputs"])
            if changes is None:
                details.pop("Bedrooms")
            else:
                details.update(changes)
            with self.subTest(case=name), self.assertRaises(ValueError):
                predict_price(details, ASSETS)

    def test_csv_line_endings_preserve_predictions(self):
        expected = predict_price(self.examples[0]["inputs"], ASSETS)
        with tempfile.TemporaryDirectory(prefix="model_test_", dir=ROOT) as name:
            folder = Path(name)
            (folder / "final_model_settings.json").write_bytes(
                (ASSETS / "final_model_settings.json").read_bytes()
            )
            lf_bytes = (ASSETS / "final_model_coefficients.csv").read_bytes().replace(
                b"\r\n", b"\n"
            )
            for content in (lf_bytes, lf_bytes.replace(b"\n", b"\r\n")):
                with self.subTest(line_ending="CRLF" if b"\r\n" in content else "LF"):
                    (folder / "final_model_coefficients.csv").write_bytes(content)
                    self.assertAlmostEqual(
                        predict_price(self.examples[0]["inputs"], folder), expected
                    )

    def test_mismatched_export_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="model_test_", dir=ROOT) as name:
            folder = Path(name)
            self.assertTrue(folder.resolve().is_relative_to(ROOT))
            for filename in ["final_model_settings.json", "final_model_coefficients.csv"]:
                (folder / filename).write_bytes((ASSETS / filename).read_bytes())
            with (folder / "final_model_coefficients.csv").open("a", encoding="utf8") as f:
                f.write("\n")
            with self.assertRaisesRegex(ValueError, "do not match"):
                predict_price(self.examples[0]["inputs"], folder)


if __name__ == "__main__":
    unittest.main()
