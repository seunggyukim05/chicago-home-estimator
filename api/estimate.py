"""Python prediction API. The model and data remain on the server."""
import csv
import json
import logging
import math
import statistics
import sys
from datetime import datetime
from functools import lru_cache
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from website_model import predict_price

ASSETS = ROOT / "app_assets"


@lru_cache(maxsize=1)
def settings():
    return json.loads((ASSETS / "final_model_settings.json").read_text(encoding="utf-8-sig"))


@lru_cache(maxsize=2)
def records(filename):
    with (ASSETS / filename).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def today():
    return datetime.now(ZoneInfo("America/Chicago")).date().isoformat()


def metadata():
    config = settings()
    locations = json.loads((ASSETS / "settings.json").read_text(encoding="utf-8-sig"))
    return {"zip_codes": supported_chicago_zips(), "house_classes": config["house_classes"],
            "neighborhoods": locations["zip_neighborhoods"], "today": today(),
            "mae": config["holdout_MAE_USD"], "within20": config["holdout_within_20pct"],
            "comparison_counts": comparison_counts(), "market_zip_codes": market_zip_codes(), "market_counts": market_counts()}


# Show transaction sample coverage separately from comparison-example coverage.
@lru_cache(maxsize=1)
def market_counts():
    counts = {}
    for sale in records("market_sales.csv"):
        code = sale["zip_code"]
        if code not in market_zip_codes():
            continue
        counts[code] = counts.get(code, 0) + 1
    return counts


# Restrict website choices to ZIPs represented in the official Chicago map.
@lru_cache(maxsize=1)
def market_zip_codes():
    # Server assets are bundled independently from the public website files.
    codes = json.loads((ASSETS / "chicago-zip-codes.json").read_text(encoding="utf-8"))
    return sorted(set(codes))


# Prediction inputs must also be categories supported by the existing model.
def supported_chicago_zips():
    return sorted(set(settings()["zip_codes"]) & set(market_zip_codes()))


def validate_subject_zip(details):
    if str(details.get("ZIP Code", "")) not in supported_chicago_zips():
        raise ValueError("Choose a supported Chicago ZIP from the list.")


# Use complete, finite measurements for fair comparison ranking.
@lru_cache(maxsize=1)
def comparison_records():
    eligible = []
    for sale in records("comparables.csv"):
        try:
            values = [float(sale[key]) for key in
                      ("sale_price", "char_bldg_sf", "char_beds", "char_fbath")]
            code = sale["zip_code"]
            if (len(code) == 5 and code.isascii() and code.isdigit()
                    and all(math.isfinite(value) for value in values)
                    and values[0] > 0 and values[1] > 0
                    and values[2] >= 0 and values[3] >= 0):
                eligible.append(sale)
        except (ValueError, TypeError):
            continue
    return eligible


# Summarize historical-example coverage for ZIP map tooltips.
@lru_cache(maxsize=1)
def comparison_counts():
    counts = {}
    for sale in comparison_records():
        code = sale["zip_code"]
        if code not in market_zip_codes():
            continue
        counts[code] = counts.get(code, 0) + 1
    return counts


# Compare another ZIP against the entered home without recalculating its estimate.
def compare_sales(payload):
    details = payload.get("details")
    if not isinstance(details, dict):
        raise ValueError("Enter a home before exploring comparison sales.")
    details = dict(details)
    validate_subject_zip(details)
    details["Valuation Date"] = today()
    original_estimate = predict_price(details, ASSETS)
    code = str(payload.get("zip", ""))
    if code not in market_zip_codes():
        raise ValueError("Choose a Chicago ZIP from the list.")
    matches = [sale for sale in comparison_records() if sale["zip_code"] == code]
    area = float(details["Building Area (sq ft)"])

    def similarity(sale):
        return (abs(float(sale["char_bldg_sf"]) - area) / area
                + 0.15 * abs(float(sale["char_beds"]) - float(details["Bedrooms"]))
                + 0.15 * abs(float(sale["char_fbath"]) - float(details["Full Bathrooms"])))

    matches.sort(key=lambda sale: sale["sale_date"], reverse=True)
    matches.sort(key=similarity)
    selected = matches[:5]
    return {
        "zip": code, "original_zip": details["ZIP Code"],
        "estimate": original_estimate, "available": len(matches), "sales": selected,
        "median": statistics.median([float(sale["sale_price"]) for sale in selected]) if selected else None,
    }


def estimate(details):
    if not isinstance(details, dict):
        raise ValueError("Enter a property using the estimate form.")
    details = dict(details)
    validate_subject_zip(details)
    details["Valuation Date"] = today()
    price = predict_price(details, ASSETS)
    neighborhood = details.get("Neighborhood Code", "")
    matches = [r for r in records("comparables.csv") if r["zip_code"] == details["ZIP Code"]
               and (not neighborhood or r["nbhd"] == neighborhood)]
    matches.sort(key=lambda r: abs(float(r["char_bldg_sf"]) - float(details["Building Area (sq ft)"])))
    return {"price": price, "details": details, "comparables": matches[:3], "model": settings()["model"]}


def market(zip_code=""):
    if zip_code and zip_code not in market_zip_codes():
        raise ValueError("Select a supported ZIP.")
    rows = [r for r in records("market_sales.csv") if r["zip_code"] in market_zip_codes() and (not zip_code or r["zip_code"] == zip_code)]
    groups = {}
    for row in rows:
        groups.setdefault(row["sale_date"][:7], []).append(float(row["sale_price"]))
    months = [{"month": month, "count": len(prices), "median": statistics.median(prices)}
              for month, prices in sorted(groups.items())]
    # Compare the same calendar window in the two latest available years.
    end = max((r["sale_date"][:10] for r in records("market_sales.csv")), default="2026-08-11")
    year = int(end[:4])
    periods = []
    for y in (year - 1, year):
        cutoff = str(y) + end[4:]
        prices = [float(r["sale_price"]) for r in rows if str(y) + "-01-01" <= r["sale_date"][:10] <= cutoff]
        periods.append({"year": y, "end": cutoff, "count": len(prices),
                        "median": statistics.median(prices) if prices else None})
    return {"count": len(rows), "median": statistics.median([float(r["sale_price"]) for r in rows]) if rows else None,
            "months": months, "periods": periods}


class handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        body = json.dumps(payload, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        try:
            if query.get("view", [""])[0] == "market":
                self.reply(200, market(query.get("zip", [""])[0]))
            else:
                self.reply(200, metadata())
        except ValueError as error:
            self.reply(400, {"error": str(error)})
        except Exception:
            logging.exception("Property API metadata/market request failed")
            self.reply(500, {"error": "The data could not be loaded. Please try again."})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16384:
                self.reply(413, {"error": "Please submit only the property form."})
                return
            payload = json.loads(self.rfile.read(length))
            if isinstance(payload, dict) and payload.get("view") == "comparisons":
                self.reply(200, compare_sales(payload))
            else:
                self.reply(200, estimate(payload))
        except (ValueError, TypeError, KeyError, OverflowError) as error:
            self.reply(400, {"error": str(error) if isinstance(error, ValueError) else "Check that all property fields contain valid numbers."})
        except Exception:
            logging.exception("Property API prediction request failed")
            self.reply(500, {"error": "The estimate is temporarily unavailable. Please try again."})
