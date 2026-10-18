#!/usr/bin/env python3
"""Fetch LA City streetlights inside the USC bounding box and save them as CSV.

Uses the public Socrata dataset at data.lacity.org/resource/twzm-wihy.json
(no key required). Writes `streetlights.csv` with columns:
    lat, lon, lamps, watts, pole

`watts` is the summed wattage parsed out of the per-lamp fields (lampa..lampf),
used later to weight how bright each pole is.

Usage:
    python3 fetch_streetlights.py             # -> streetlights.csv
    python3 fetch_streetlights.py --out foo.csv
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

# Match the bbox safe_route.py uses so every point we keep is routable.
BBOX = (34.005, -118.305, 34.045, -118.262)
URL = "https://data.lacity.org/resource/twzm-wihy.json"
UA = "usc-safe-route/1.0"
PAGE = 1000
WATT = re.compile(r"(\d+(?:\.\d+)?)\s*W", re.I)


def parse_watts(row):
    """Sum the wattage listed across lampa..lampf; defaults to 55 W per lamp without a number."""
    total = 0.0
    for key in ("lampa", "lampb", "lampc", "lampd", "lampe", "lampf"):
        val = row.get(key) or ""
        if not val.strip():
            continue
        m = WATT.search(val)
        total += float(m.group(1)) if m else 55.0
    return total


def fetch_page(offset):
    s, w, n, e = BBOX
    params = {
        "$where": f"within_box(the_geom, {n}, {w}, {s}, {e})",
        "$select": "the_geom, lampa, lampb, lampc, lampd, lampe, lampf, postdesc, status",
        "$limit": PAGE,
        "$offset": offset,
        "$order": "slid",
    }
    req = urllib.request.Request(URL + "?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except OSError as err:
            if attempt == 2:
                raise
            print(f"  retry {attempt + 1}: {err}", file=sys.stderr)
            time.sleep(2 + attempt)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                   "streetlights.csv"))
    args = ap.parse_args()

    rows, offset, kept, skipped = [], 0, 0, 0
    while True:
        page = fetch_page(offset)
        if not page:
            break
        for r in page:
            geom = r.get("the_geom") or {}
            coords = geom.get("coordinates") or []
            if len(coords) != 2:
                skipped += 1
                continue
            lon, lat = coords
            if (r.get("status") or "").lower() in ("removed", "proposed", "cancelled"):
                skipped += 1
                continue
            rows.append({"lat": round(lat, 6), "lon": round(lon, 6),
                         "watts": round(parse_watts(r), 1),
                         "lamps": sum(1 for k in ("lampa", "lampb", "lampc", "lampd", "lampe", "lampf")
                                      if (r.get(k) or "").strip()),
                         "pole": (r.get("postdesc") or "").strip()})
            kept += 1
        print(f"  fetched {offset + len(page):>5}  kept {kept:>5}  (skipped {skipped})", file=sys.stderr)
        if len(page) < PAGE:
            break
        offset += PAGE

    with open(args.out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["lat", "lon", "watts", "lamps", "pole"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} streetlights to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
