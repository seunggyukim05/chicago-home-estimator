"""Python prediction API. The model and data remain on the server."""
import csv
import json
import logging
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
    return {"zip_codes": config["zip_codes"], "house_classes": config["house_classes"],
            "neighborhoods": locations["zip_neighborhoods"], "today": today(),
            "mae": config["holdout_MAE_USD"], "within20": config["holdout_within_20pct"]}


def estimate(details):
    if not isinstance(details, dict):
        raise ValueError("Enter a property using the estimate form.")
    details = dict(details)
    details["Valuation Date"] = today()
    price = predict_price(details, ASSETS)
    neighborhood = details.get("Neighborhood Code", "")
    matches = [r for r in records("comparables.csv") if r["zip_code"] == details["ZIP Code"]
               and (not neighborhood or r["nbhd"] == neighborhood)]
    matches.sort(key=lambda r: abs(float(r["char_bldg_sf"]) - float(details["Building Area (sq ft)"])))
    return {"price": price, "details": details, "comparables": matches[:3], "model": settings()["model"]}


def market(zip_code=""):
    if zip_code and zip_code not in settings()["zip_codes"]:
        raise ValueError("Select a supported ZIP.")
    rows = [r for r in records("market_sales.csv") if not zip_code or r["zip_code"] == zip_code]
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
            self.reply(200, estimate(payload))
        except (ValueError, TypeError, KeyError, OverflowError) as error:
            self.reply(400, {"error": str(error) if isinstance(error, ValueError) else "Check that all property fields contain valid numbers."})
        except Exception:
            logging.exception("Property API prediction request failed")
            self.reply(500, {"error": "The estimate is temporarily unavailable. Please try again."})
