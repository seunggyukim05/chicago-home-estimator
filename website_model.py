"""Predict using the team's exported log-OLS coefficients, without unpickling."""

import csv
import hashlib
import json
import math
from datetime import date
from pathlib import Path


def predict_price(details, assets_dir):
    """Return a dollar estimate using the exact exported transformations.

    Date limits match the app's historical-estimate scope. This function
    does not train a model, calculate an interval, or replace team evaluation.
    """
    assets = Path(assets_dir)
    with (assets / "final_model_settings.json").open(encoding="utf-8-sig") as f:
        settings = json.load(f)
    expected_hash = settings.get("coefficient_sha256")
    if expected_hash:
        # Git may convert CSV line endings between Windows and Linux.
        coefficient_bytes = (assets / "final_model_coefficients.csv").read_bytes()
        lf_bytes = coefficient_bytes.replace(b"\r\n", b"\n")
        compatible_hashes = {
            hashlib.sha256(candidate).hexdigest()
            for candidate in (
                coefficient_bytes,
                lf_bytes,
                lf_bytes.replace(b"\n", b"\r\n"),
            )
        }
        if expected_hash not in compatible_hashes:
            raise ValueError("The model coefficients and settings do not match.")
    with (assets / "final_model_coefficients.csv").open(
        encoding="utf-8-sig", newline=""
    ) as f:
        rows = list(csv.reader(f))
    coefficients = {row[0]: float(row[1]) for row in rows[1:] if row}
    if len(coefficients) != len([row for row in rows[1:] if row]):
        raise ValueError("Duplicate model coefficients; check the exported file.")
    if not all(math.isfinite(x) for x in coefficients.values()):
        raise ValueError("Model coefficients must be finite.")

    required = [
        "ZIP Code", "Property Class", "Valuation Date", "Building Area (sq ft)",
        "Land Area (sq ft)", "Bedrooms", "Full Bathrooms", "Half Bathrooms",
        "Year Built",
    ]
    if any(key not in details for key in required):
        raise ValueError("Return to Property Details and submit all model inputs.")

    zip_code = str(details["ZIP Code"])
    property_class = str(details["Property Class"])
    if zip_code not in settings["zip_codes"]:
        raise ValueError("This ZIP is not supported by the model.")
    if property_class not in settings["house_classes"]:
        raise ValueError("This property class is not supported by the model.")
    valuation = date.fromisoformat(str(details["Valuation Date"]))
    if not date(2019, 9, 1) <= valuation <= date.today():
        raise ValueError(
            "The estimate date must be between "
            "2019-09-01 and today."
        )
    
    def number(key):
        value = float(details[key])
        if not math.isfinite(value):
            raise ValueError(f"{key} must be finite.")
        return value

    building = number("Building Area (sq ft)")
    land = number("Land Area (sq ft)")
    if building <= 0 or land <= 0:
        raise ValueError("Building and land areas must be positive.")
    year_built = number("Year Built")
    if not year_built.is_integer() or not 1600 <= year_built <= valuation.year:
        raise ValueError("Year Built must be a valid year no later than valuation.")
    rooms = [number(k) for k in ["Bedrooms", "Full Bathrooms", "Half Bathrooms"]]
    if any(value < 0 or not value.is_integer() for value in rooms):
        raise ValueError("Bedroom and bathroom counts must be nonnegative integers.")

    features = {
        "Intercept": 1.0,
        "log_building_area": math.log(building),
        "log_lot_area": math.log(land),
        "home_age": valuation.year - year_built,
        "char_beds": rooms[0],
        "char_fbath": rooms[1],
        "char_hbath": rooms[2],
        "trend_years": (valuation - date.fromisoformat(settings["trend_origin"])).days / 365.25,
    }
    categories = {
        "property_class": (property_class, list(settings["house_classes"])),
        "sale_month": (str(valuation.month), [str(m) for m in range(1, 13)]),
        "zip_code": (zip_code, settings["zip_codes"]),
    }
    for field, (selected, levels) in categories.items():
        reference = settings["reference_levels"][field]
        if reference not in levels:
            raise ValueError(f"Invalid reference category for {field}.")
        for level in levels:
            if level != reference:
                features[f"{field}[{level}]"] = float(selected == level)
    if set(features) != set(coefficients):
        raise ValueError("Coefficient names do not match the model settings.")
    smear = float(settings["smearing_factor"])
    if not math.isfinite(smear) or smear <= 0:
        raise ValueError("Invalid model smearing factor.")
    log_price = math.fsum(coefficients[name] * value for name, value in features.items())
    try:
        price = math.exp(log_price) * smear
    except OverflowError as exc:
        raise ValueError("These inputs produce an unsupported numerical result.") from exc
    if not math.isfinite(price) or price <= 0:
        raise ValueError("These inputs produce an unsupported numerical result.")
    return price
