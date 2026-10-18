#!/usr/bin/env python3
"""Safety-aware walking routes around USC.

Every street segment gets a cost = length x a safety factor built from:
  1. USC DPS crime alerts (alerts.json), geocoded and weighted by severity, recency and
     how close the incident's time of day is to the time you're walking
  2. Live foot traffic: LA Metro Bike Share dock activity (free GBFS feed) and, if the
     BESTTIME_API_KEY env var is set, BestTime live venue busyness; blended over an
     hourly baseline by street type (busy, populated streets are preferred)
  3. Darkness (sun position at the requested time) and street lighting (OSM lit=*)
Dijkstra then finds both the shortest and the safest path over the OpenStreetMap walk network.

Usage:
    python3 safe_route.py route --from "USC Village" --to "28th Street & Orchard Avenue"
    python3 safe_route.py route --from 34.0259,-118.2852 --to "Adams & Hoover" --time 2026-10-17T23:00
    python3 safe_route.py watch      # sample bike share every 2 min to build live activity history
    python3 safe_route.py geocode    # geocode alerts.json -> alerts_geocoded.json

Uses only the Python standard library.
"""

import argparse
import difflib
import heapq
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
LA = ZoneInfo("America/Los_Angeles")
UA = "usc-safe-route/1.0 (Trojan Hacks)"

# South, West, North, East: USC University Park campus plus surrounding neighborhoods.
BBOX = (34.005, -118.305, 34.045, -118.262)
WALK_SPEED = 1.3  # m/s

# Safety factor weights: cost = length * (1 + safety * (W_RISK*risk + W_DARK*dark + W_QUIET*(1 - busy)
#                                  + W_UNLIT*(1 - lighting) + W_OUTSIDE*outside_patrol
#                                  + W_ALLEY on alleys/driveways/parking aisles, which are isolated))
W_RISK, W_DARK, W_QUIET, W_ALLEY = 4.0, 1.0, 1.0, 1.0
W_UNLIT, W_OUTSIDE = 1.5, 0.5
ISOLATED_SERVICE = ("alley", "driveway", "parking_aisle")

# LAPD crime types -> street-safety severity (0..4). Burglary/theft are weaker signals for a walker;
# violent, armed and sexual crimes are strongest. Unknown types fall back to 1.0.
LAPD_SEVERITY = {
    "Homicide": 4.0, "Rape": 3.5, "Attempted rape": 3.0, "Kidnapping": 3.0,
    "Aggravated assault": 2.5, "Robbery": 2.5, "Attempted robbery": 2.0,
    "Fondling": 2.0, "Purse snatching": 2.0, "Pickpocketing": 1.5,
    "Simple assault/battery": 1.8, "Threats/intimidation": 1.4,
    "Shots fired": 2.5, "Weapon laws violation": 2.0, "Stalking": 1.6,
    "Human trafficking": 2.5,
}
# DPS alerts are USC-specific and officially warned-about -> weigh them 2x.
DPS_WEIGHT = 2.0

OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
GBFS = "https://gbfs.bcycle.com/1/bcycle_lametro"
BESTTIME = "https://besttime.app/api/v1"

# Venues polled for BestTime live busyness (only when BESTTIME_API_KEY is set).
BESTTIME_VENUES = [
    ("Trader Joe's", "3131 S Hoover St, Los Angeles, CA 90089"),
    ("Target", "3131 S Hoover St, Los Angeles, CA 90089"),
    ("CVS Pharmacy", "3335 S Figueroa St, Los Angeles, CA 90007"),
    ("Wingstop", "3584 S Figueroa St, Los Angeles, CA 90007"),
    ("Taco Bell", "2722 S Figueroa St, Los Angeles, CA 90007"),
    ("Jack in the Box", "2921 S Figueroa St, Los Angeles, CA 90007"),
    ("Ralphs", "2600 S Vermont Ave, Los Angeles, CA 90007"),
    ("Smart & Final", "3607 S Vermont Ave, Los Angeles, CA 90007"),
]

# Typical pedestrian activity by hour (0-23), 0..1, for a weekday near campus.
HOURLY = [0.10, 0.06, 0.04, 0.03, 0.03, 0.05, 0.12, 0.30, 0.55, 0.65, 0.70, 0.75,
          0.85, 0.85, 0.80, 0.80, 0.85, 0.85, 0.75, 0.60, 0.45, 0.35, 0.25, 0.15]
# How busy each OSM highway class is relative to that profile.
CLASS_BUSY = {"primary": 0.95, "secondary": 0.9, "trunk": 0.7, "tertiary": 0.75, "pedestrian": 1.0,
              "footway": 0.75, "primary_link": 0.7, "secondary_link": 0.6, "tertiary_link": 0.6,
              "residential": 0.45, "living_street": 0.45, "unclassified": 0.5, "service": 0.3,
              "path": 0.4, "steps": 0.4, "cycleway": 0.4, "track": 0.15}
# How exposed an unlit segment is at night when OSM has no lit=* tag.
UNLIT_DEFAULT = {"primary": 0.4, "secondary": 0.4, "trunk": 0.4, "tertiary": 0.5, "residential": 0.6,
                 "pedestrian": 0.5, "footway": 0.7, "path": 0.8, "steps": 0.8, "service": 0.8, "track": 1.0}

STREET_TYPES = {"street": "street", "st": "street", "avenue": "avenue", "ave": "avenue", "av": "avenue",
                "boulevard": "boulevard", "blvd": "boulevard", "bl": "boulevard", "place": "place",
                "pl": "place", "drive": "drive", "dr": "drive", "way": "way", "parkway": "parkway",
                "pkwy": "parkway", "road": "road", "rd": "road", "court": "court", "ct": "court",
                "lane": "lane", "ln": "lane", "terrace": "terrace", "walk": "walk"}
DIRECTIONS = {"n", "s", "e", "w", "north", "south", "east", "west"}
# Street names that are also everyday words; only matched when followed by a street type.
VAGUE = {"university", "village", "grand", "hope", "union", "park", "metro", "station", "campus",
         "royal", "valley", "the", "la"} | DIRECTIONS
ALIASES = {"saint": "st", "expo": "exposition"}


def alias(tok: str) -> str:
    return ALIASES.get(tok, tok)
ADDRESS = re.compile(
    r"\b(\d{3,5})(\s*block)?,?\s*(?:of\s+)?(?:(?:[nsew]\.?|north|south|east|west)\s+)?"
    r"((?:\d+(?:st|nd|rd|th)|[a-z]+(?:\s[a-z]+)?)\s+(?:street|st|avenue|ave|boulevard|blvd|place|pl"
    r"|drive|dr|way|parkway))\b", re.I)


# ---------------------------------------------------------------- helpers

def http_json(url, params=None, post=False, timeout=60):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, data=b"" if post else None, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def cache_file(name):
    os.makedirs(CACHE, exist_ok=True)
    return os.path.join(CACHE, name)


def load_cache(name, default):
    try:
        with open(cache_file(name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_cache(name, obj):
    with open(cache_file(name), "w", encoding="utf-8") as f:
        json.dump(obj, f)


def dist_m(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    dx = math.radians(b[1] - a[1]) * math.cos(lat) * 6371000
    dy = math.radians(b[0] - a[0]) * 6371000
    return math.hypot(dx, dy)


def in_bbox(p):
    return BBOX[0] <= p[0] <= BBOX[2] and BBOX[1] <= p[1] <= BBOX[3]


def log(msg):
    print(msg, file=sys.stderr)


class Grid:
    """Buckets points into square cells (metres) for fast neighbourhood lookups."""

    def __init__(self, cell=150):
        self.dlat = cell / 111320
        self.dlon = cell / (111320 * math.cos(math.radians(34.02)))
        self.cells = {}

    def _key(self, p):
        return int(p[0] // self.dlat), int(p[1] // self.dlon)

    def add(self, p, item):
        self.cells.setdefault(self._key(p), []).append(item)

    def near(self, p, r=1):
        i, j = self._key(p)
        for di in range(-r, r + 1):
            for dj in range(-r, r + 1):
                yield from self.cells.get((i + di, j + dj), ())


def split_street(name):
    """'West 28th Street' -> ('28th', 'street'); 'Jefferson Bl.' -> ('jefferson', 'boulevard')."""
    toks = [alias(t) for t in re.findall(r"[a-z0-9]+", name.lower())]
    while len(toks) > 1 and (toks[0] in DIRECTIONS or toks[0] == "usc"):
        toks = toks[1:]
    typ = None
    if len(toks) > 1 and toks[-1] in STREET_TYPES:
        typ = STREET_TYPES[toks.pop()]
    return " ".join(toks), typ


# ---------------------------------------------------------------- walk network

class WalkGraph:
    def __init__(self, osm):
        self.nodes, self.adj, self.edges, self.streets = {}, {}, [], {}
        for el in osm["elements"]:
            if el["type"] == "node":
                self.nodes[el["id"]] = (el["lat"], el["lon"])
        for el in osm["elements"]:
            if el["type"] != "way":
                continue
            tags = el.get("tags", {})
            ids = [n for n in el["nodes"] if n in self.nodes]
            name = tags.get("name")
            if name:
                self.streets.setdefault(split_street(name), set()).update(ids)
            info = {"hw": tags["highway"], "service": tags.get("service"), "lit": tags.get("lit"),
                    "name": name or ("sidewalk" if tags.get("footway") == "sidewalk" else None)}
            for u, v in zip(ids, ids[1:]):
                e = len(self.edges)
                self.edges.append({"u": u, "v": v, "len": dist_m(self.nodes[u], self.nodes[v]), **info})
                self.adj.setdefault(u, []).append((v, e))
                self.adj.setdefault(v, []).append((u, e))
        self.main = self._largest_component()
        self.node_grid = Grid(100)
        for n in self.main:
            self.node_grid.add(self.nodes[n], n)
        self.cores = {c for c, _ in self.streets}
        self.road_grid = Grid(60)
        for i, e in enumerate(self.edges):
            if e["name"] and e["hw"] not in ("footway", "path", "service", "steps"):
                self.road_grid.add(self.midpoint(i), i)

    def midpoint(self, e):
        (a, b), (c, d) = self.nodes[self.edges[e]["u"]], self.nodes[self.edges[e]["v"]]
        return (a + c) / 2, (b + d) / 2

    def label(self, e):
        """Human-readable name for an edge; unnamed sidewalks/alleys borrow the nearest street's name."""
        edge = self.edges[e]
        if edge["name"] and edge["name"] != "sidewalk":
            return edge["name"]
        m = self.midpoint(e)
        near = min(self.road_grid.near(m), key=lambda r: dist_m(m, self.midpoint(r)), default=None)
        street = self.edges[near]["name"] if near is not None and dist_m(m, self.midpoint(near)) < 45 else None
        if edge["service"] == "alley" or edge["hw"] == "service":
            return f"alley near {street}" if street else "alley / service road"
        if street:
            return f"sidewalk along {street}" if edge["hw"] == "footway" else street
        return "campus walkway" if edge["hw"] in ("footway", "pedestrian", "path") else "unnamed path"

    def _largest_component(self):
        seen, best = set(), set()
        for start in self.adj:
            if start in seen:
                continue
            comp, stack = {start}, [start]
            while stack:
                for v, _ in self.adj[stack.pop()]:
                    if v not in comp:
                        comp.add(v)
                        stack.append(v)
            seen |= comp
            best = max(best, comp, key=len)
        return best

    def snap(self, p):
        for r in (1, 3, 8):
            cands = list(self.node_grid.near(p, r))
            if cands:
                return min(cands, key=lambda n: dist_m(p, self.nodes[n]))
        return min(self.main, key=lambda n: dist_m(p, self.nodes[n]))

    def street_nodes(self, core, typ):
        if (core, typ) in self.streets:
            return self.streets[(core, typ)]
        if typ is None and (core, "street") in self.streets:
            return self.streets[(core, "street")]
        return set().union(*[ns for (c, _), ns in self.streets.items() if c == core])

    def find_streets(self, text):
        """Street names mentioned in free text, in order, as (core, type) pairs."""
        toks = [alias(t) for t in re.findall(r"[a-z0-9]+", re.sub(r"\b1/2\b", " ", text.lower()))]
        found, i = [], 0
        while i < len(toks):
            step = 1
            nxt = toks[i + 1] if i + 1 < len(toks) else None
            if toks[i] not in self.cores and nxt in STREET_TYPES and len(toks[i]) >= 5:
                close = difflib.get_close_matches(toks[i], self.cores, n=1, cutoff=0.85)  # typos
                toks[i] = close[0] if close and " " not in close[0] else toks[i]
            for n in (3, 2, 1):
                core = " ".join(toks[i:i + n])
                if i + n > len(toks) or core not in self.cores or core.isdigit():
                    continue
                typ = STREET_TYPES.get(toks[i + n]) if i + n < len(toks) else None
                if typ or core not in VAGUE:
                    if core not in [c for c, _ in found]:
                        found.append((core, typ))
                    step = n + (1 if typ else 0)
                    break
            i += step
        return found

    def intersection(self, a, b):
        na, nb = self.street_nodes(*a), self.street_nodes(*b)
        common = [self.nodes[n] for n in na & nb]
        if common:
            pts = [p for p in common if dist_m(p, common[0]) < 120]
            return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        best = min(((dist_m(self.nodes[x], self.nodes[y]), x, y) for x in na for y in nb), default=None)
        if best and best[0] < 80:
            p, q = self.nodes[best[1]], self.nodes[best[2]]
            return (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        return None


def load_graph(refresh=False):
    osm = None if refresh else load_cache("osm_walk.json", None)
    if osm is None:
        s, w, n, e = BBOX
        query = (f'[out:json][timeout:120];way["highway"]["highway"!~"^(motorway|motorway_link|trunk_link|'
                 f'construction|proposed|raceway|bus_guideway|platform|elevator|abandoned)$"]'
                 f'["foot"!~"^(no|private)$"]["access"!~"^(private|no)$"]({s},{w},{n},{e});(._;>;);out body;')
        log("Downloading OpenStreetMap walk network (one time)...")
        for attempt, server in enumerate(OVERPASS * 2):
            try:
                req = urllib.request.Request(server, data=urllib.parse.urlencode({"data": query}).encode(),
                                             headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=180) as resp:
                    osm = json.load(resp)
                break
            except OSError as err:  # public Overpass servers are often overloaded (429/502/504)
                log(f"  {server} failed ({err}), retrying...")
                time.sleep(2 + 3 * attempt)
        if osm is None:
            sys.exit("Could not download the OSM walk network; try again in a minute.")
        save_cache("osm_walk.json", osm)
    return WalkGraph(osm)


# ---------------------------------------------------------------- geocoding

def census_geocode(address):
    r = http_json(CENSUS, {"address": f"{address}, Los Angeles, CA", "benchmark": "Public_AR_Current",
                           "format": "json"}, timeout=30)
    matches = r["result"]["addressMatches"]
    if matches:
        c = matches[0]["coordinates"]
        return c["y"], c["x"]
    return None


_last_nominatim = [0.0]


def nominatim_geocode(text):
    wait = 1.1 - (time.time() - _last_nominatim[0])  # usage policy: max 1 request/second
    if wait > 0:
        time.sleep(wait)
    _last_nominatim[0] = time.time()
    s, w, n, e = BBOX
    r = http_json(NOMINATIM, {"q": text, "format": "json", "limit": 1, "viewbox": f"{w},{n},{e},{s}",
                              "bounded": 1}, timeout=30)
    return (float(r[0]["lat"]), float(r[0]["lon"])) if r else None


def clean_place(text):
    t = re.sub(r"\(.*?\)", " ", text)
    t = re.sub(r"\b(off|on)[- ]campus\b,?", " ", t, flags=re.I)
    t = re.split(r"[;.](\s|$)", t)[0]
    return re.sub(r"\s+", " ", t).strip(" ,")


def geocode(text, graph, cache):
    """Location text -> [lat, lon, method] (or None), trying address, intersection, then place name."""
    if text in cache:
        return cache[text]
    result = None
    t = re.sub(r"\b1/2\b", " ", text)
    try:
        m = ADDRESS.search(t)
        if m:
            num = int(m.group(1)) + (50 if m.group(2) else 0)  # middle of the block
            p = census_geocode(f"{num} {m.group(3)}")
            if p and in_bbox(p):
                result = [p[0], p[1], "block" if m.group(2) else "address"]
        if not result:
            streets = graph.find_streets(t)
            if len(streets) >= 2:
                p = graph.intersection(streets[0], streets[1])
                if p:
                    result = [p[0], p[1], "intersection"]
        if not result:
            p = nominatim_geocode(clean_place(t) + ", Los Angeles, CA")
            if p and in_bbox(p):
                result = [p[0], p[1], "place"]
    except OSError as err:
        log(f"  geocode failed for {text!r}: {err}")
        return None  # not cached, retried next run
    cache[text] = result
    return result


def severity(alert):
    o = alert["offense"].lower()
    if any(k in o for k in ("murder", "rape", "sexual assault", "aggravated", "deadly", "firearm",
                            "armed", "brandish")):
        s = 3.0
    elif "robbery" in o:
        s = 2.0 if "attempt" in o else 2.5
    elif any(k in o for k in ("sexual", "lewd", "battery", "assault", "hate")):
        s = 2.0
    elif "theft" in o:
        s = 1.2
    elif "burglary" in o:
        s = 0.6  # happens indoors; weak signal for street safety
    else:
        s = 1.0
    weapons = [x.get("Weapon", "") for x in alert.get("suspects", [])]
    if any(w and w.lower() not in ("none", "unknown", "n/a", "no") for w in weapons):
        s += 0.5
    return s


def load_incidents(graph):
    with open(os.path.join(HERE, "alerts.json"), encoding="utf-8") as f:
        alerts = json.load(f)
    cache = load_cache("geocode.json", {})
    todo = [a for a in alerts if a.get("location") and a["location"] not in cache]
    if todo:
        log(f"Geocoding {len(todo)} alert locations (cached afterwards)...")
    incidents = []
    for a in alerts:
        if not a.get("location"):
            continue
        g = geocode(a["location"], graph, cache)
        if not g:
            continue
        when = a.get("occurred_at") or a["posted_at"][:10]
        incidents.append({"lat": g[0], "lon": g[1], "method": g[2], "offense": a["offense"],
                          "severity": severity(a) * DPS_WEIGHT, "occurred_at": when,
                          "location": a["location"], "url": a["url"], "source": "DPS"})
    save_cache("geocode.json", cache)
    return incidents


def load_lapd_crimes(path=None):
    """Read usc_crimes_location_time_type.csv -> list of incidents in the same shape as DPS alerts.

    Only rows inside BBOX are kept; types are mapped through LAPD_SEVERITY.
    """
    import csv
    path = path or os.path.join(HERE, "usc_crimes_location_time_type.csv")
    if not os.path.exists(path):
        log(f"  LAPD crime file not found at {path}; skipping that layer.")
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                lat, lon = float(r["lat"]), float(r["lon"])
            except (ValueError, KeyError):
                continue
            if not in_bbox((lat, lon)):
                continue
            when = f"{r['date']}T{r['time']}:00" if r.get("time") and r["time"] != "00:00" else r["date"]
            out.append({"lat": lat, "lon": lon, "offense": r.get("type", "Crime"),
                        "severity": LAPD_SEVERITY.get(r.get("type", ""), 1.0),
                        "occurred_at": when, "location": r.get("street", ""),
                        "url": "", "source": "LAPD"})
    return out


def load_streetlights(path=None):
    """Read streetlights.csv -> Grid of (lat, lon, watts). Empty Grid if the file is missing."""
    import csv
    path = path or os.path.join(HERE, "streetlights.csv")
    grid = Grid(80)  # 80 m cells: a typical city block in LA
    if not os.path.exists(path):
        log(f"  Streetlights file not found at {path}; run `python3 fetch_streetlights.py` once.")
        return grid, 0
    n = 0
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                lat, lon, watts = float(r["lat"]), float(r["lon"]), float(r["watts"] or 55)
            except (ValueError, KeyError):
                continue
            grid.add((lat, lon), (lat, lon, max(watts, 20)))  # a dim lamp still helps a bit
            n += 1
    return grid, n


def load_patrol_zone(path=None):
    """Read patrol_zone.json (GeoJSON FeatureCollection) -> list of outer-ring polygons [[(lat,lon)...]]."""
    path = path or os.path.join(HERE, "patrol_zone.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        gj = json.load(f)
    polys = []
    for feat in gj.get("features", []):
        geom = feat.get("geometry", {})
        rings = geom.get("coordinates", [])
        if geom.get("type") == "Polygon" and rings:
            polys.append([(lat, lon) for lon, lat in rings[0]])  # GeoJSON is [lon, lat]
        elif geom.get("type") == "MultiPolygon":
            for poly in rings:
                if poly:
                    polys.append([(lat, lon) for lon, lat in poly[0]])
    return polys


def point_in_polygon(point, polygon):
    """Ray-casting test. `polygon` is a list of (lat, lon) pairs."""
    lat, lon = point
    inside, n = False, len(polygon)
    for i in range(n):
        a_lat, a_lon = polygon[i]
        b_lat, b_lon = polygon[(i + 1) % n]
        if (a_lat > lat) != (b_lat > lat):
            x = a_lon + (lat - a_lat) * (b_lon - a_lon) / (b_lat - a_lat)
            if lon < x:
                inside = not inside
    return inside


def point_in_any(point, polygons):
    return any(point_in_polygon(point, p) for p in polygons)


# ---------------------------------------------------------------- live foot traffic

def bike_stations():
    info = load_cache("bike_stations.json", None)
    if not info or time.time() - info["fetched"] > 86400:
        stations = http_json(f"{GBFS}/station_information.json")["data"]["stations"]
        info = {"fetched": time.time(), "stations": {
            s["station_id"]: {"name": s["name"].strip(), "lat": s["lat"], "lon": s["lon"]}
            for s in stations if in_bbox((s["lat"], s["lon"]))}}
        save_cache("bike_stations.json", info)
    return info["stations"]


def bike_sample():
    """Record one snapshot of bikes available per station near USC."""
    stations = bike_stations()
    status = http_json(f"{GBFS}/station_status.json")["data"]["stations"]
    snap = {"t": time.time(), "bikes": {s["station_id"]: s["num_bikes_available"]
                                        for s in status if s["station_id"] in stations}}
    path = cache_file("bike_snapshots.jsonl")
    keep = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            keep = [line for line in f if json.loads(line)["t"] > snap["t"] - 6 * 3600]
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(keep + [json.dumps(snap) + "\n"])
    return snap


def bike_activity(window=5400):
    """Bike checkouts+returns per hour at each station over the last `window` seconds -> signals."""
    path = cache_file("bike_snapshots.jsonl")
    if not os.path.exists(path):
        return [], 0
    with open(path, encoding="utf-8") as f:
        snaps = [s for s in map(json.loads, f) if s["t"] > time.time() - window]
    span = snaps[-1]["t"] - snaps[0]["t"] if snaps else 0
    if span < 240:
        return [], span
    stations, signals = bike_stations(), []
    for sid, st in stations.items():
        counts = [s["bikes"][sid] for s in snaps if sid in s["bikes"]]
        moves = sum(abs(b - a) for a, b in zip(counts, counts[1:]))
        rate = moves / (span / 3600)
        signals.append({"lat": st["lat"], "lon": st["lon"], "value": min(1.0, rate / 8), "conf": 0.5,
                        "source": "bikeshare", "name": st["name"], "detail": f"{rate:.1f} dock moves/hr"})
    return signals, span


def besttime_signals(key):
    venues, signals = load_cache("besttime_venues.json", {}), []
    for name, addr in BESTTIME_VENUES:
        try:
            v = venues.get(f"{name}|{addr}")
            if not v:
                r = http_json(f"{BESTTIME}/forecasts", {"api_key_private": key, "venue_name": name,
                                                       "venue_address": addr}, post=True)
                if r.get("status") != "OK":
                    log(f"  BestTime: no forecast for {name}: {r.get('message')}")
                    continue
                vi = r["venue_info"]
                v = {"id": vi["venue_id"], "lat": vi["venue_lat"], "lon": vi["venue_lon"]}
                venues[f"{name}|{addr}"] = v
                save_cache("besttime_venues.json", venues)
            r = http_json(f"{BESTTIME}/forecasts/live", {"api_key_private": key, "venue_id": v["id"]},
                          post=True)
            a = r.get("analysis", {})
            live = bool(a.get("venue_live_busyness_available"))
            val = a.get("venue_live_busyness") if live else a.get("venue_forecasted_busyness")
            if val is None:
                continue
            signals.append({"lat": v["lat"], "lon": v["lon"], "value": max(0, min(100, val)) / 100,
                            "conf": 1.0 if live else 0.6, "source": "besttime", "name": name,
                            "detail": f"{val}% busy ({'live' if live else 'forecast'})"})
        except (OSError, ValueError, KeyError) as err:
            log(f"  BestTime failed for {name}: {err}")
    return signals


# ---------------------------------------------------------------- edge scoring

def solar_elevation(when):
    """Sun elevation in degrees at USC for an aware datetime (NOAA approximation)."""
    utc = when.astimezone(ZoneInfo("UTC"))
    hour = utc.hour + utc.minute / 60
    g = 2 * math.pi / 365 * (utc.timetuple().tm_yday - 1 + (hour - 12) / 24)
    eqtime = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                       - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    lat, lon = math.radians(34.0224), -118.2851
    ha = math.radians((hour * 60 + eqtime + 4 * lon) / 4 - 180)
    cos_zen = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(ha)
    return 90 - math.degrees(math.acos(max(-1, min(1, cos_zen))))


def incident_weight(inc, when):
    try:
        t = datetime.fromisoformat(inc["occurred_at"]).replace(tzinfo=LA)
    except ValueError:
        return 0
    age = (when - t).days
    if age < 0:
        return 0  # hadn't happened yet at the requested time
    recency = max(0.15, 0.5 ** (age / 365))
    if "T" in inc["occurred_at"]:
        dh = abs(t.hour + t.minute / 60 - (when.hour + when.minute / 60))
        dh = min(dh, 24 - dh)
        tod = 0.35 + 0.65 * math.exp(-dh * dh / 18)  # similar time of day matters most
    else:
        tod = 0.6
    return inc["severity"] * recency * tod


def score_edges(graph, incidents, when, signals, lights=None, patrol=None):
    """Per-edge arrays: risk, darkness, busyness, lighting (0..1), outside_patrol (0/1).

    `lights` is the Grid from load_streetlights(); `patrol` is the polygon list from load_patrol_zone().
    """
    mids = [((graph.nodes[e["u"]][0] + graph.nodes[e["v"]][0]) / 2,
             (graph.nodes[e["u"]][1] + graph.nodes[e["v"]][1]) / 2) for e in graph.edges]

    grid = Grid(150)
    for inc in incidents:
        w = incident_weight(inc, when)
        if w > 0:
            grid.add((inc["lat"], inc["lon"]), (inc["lat"], inc["lon"], w))
    raw = []
    for m in mids:
        r = 0.0
        for lat, lon, w in grid.near(m, 2):
            d = dist_m(m, (lat, lon))
            r += w * math.exp(-d * d / (2 * 70 * 70))
        raw.append(r)
    pos = sorted(r for r in raw if r > 0.01)
    scale = pos[int(len(pos) * 0.95)] if pos else 1
    risk = [min(1.5, r / scale) for r in raw]

    darkness = max(0.0, min(1.0, (3 - solar_elevation(when)) / 9))
    # Lighting: sum streetlight watts within 40 m of the edge midpoint, Gaussian weighted.
    # Normalise so the top 10% of edges are ~1.0 and most residential edges land around 0.3-0.6.
    light_watts = []
    if lights:
        for m in mids:
            w = 0.0
            for lat, lon, watts in lights.near(m, 1):
                d = dist_m(m, (lat, lon))
                if d < 60:
                    w += watts * math.exp(-d * d / (2 * 25 * 25))
            light_watts.append(w)
        lit_scale = sorted(light_watts)[int(len(light_watts) * 0.90)] or 1.0
        lighting = [min(1.0, w / lit_scale) for w in light_watts]
    else:
        lighting = [0.0] * len(graph.edges)

    dark = []
    for i, e in enumerate(graph.edges):
        # OSM `lit=*` tag takes precedence: a street tagged "yes" is treated as well-lit regardless of poles.
        lit_tag = {"yes": 0.25, "24/7": 0.25, "automatic": 0.25, "no": 1.0}.get(e["lit"])
        if lit_tag is not None:
            dark.append(darkness * lit_tag)
        else:
            # Blend the streetlight signal into darkness: well-lit (lighting=1) halves exposure.
            lit_default = 1.0 if e["service"] == "alley" else UNLIT_DEFAULT.get(e["hw"], 0.6)
            dark.append(darkness * lit_default * (1 - 0.6 * lighting[i]))

    h = when.hour + when.minute / 60
    profile = HOURLY[int(h) % 24] + (HOURLY[(int(h) + 1) % 24] - HOURLY[int(h) % 24]) * (h - int(h))
    if when.weekday() >= 5 and 4 <= when.hour < 19:
        profile *= 0.75
    busy = []
    for e in graph.edges:
        f = 0.2 if e["service"] in ISOLATED_SERVICE else CLASS_BUSY.get(e["hw"], 0.5)
        busy.append(f * profile)

    if signals:
        sgrid = Grid(150)
        for s in signals:
            sgrid.add((s["lat"], s["lon"]), s)
        for i, m in enumerate(mids):
            num = den = 0.0
            for s in sgrid.near(m, 2):
                d = dist_m(m, (s["lat"], s["lon"]))
                k = s["conf"] * math.exp(-d * d / (2 * 150 * 150))
                num, den = num + k * s["value"], den + k
            if den > 0.02:
                a = min(1.0, den)
                busy[i] = (1 - a) * busy[i] + a * num / den

    outside = [0] * len(graph.edges)
    if patrol:
        outside = [0 if point_in_any(m, patrol) else 1 for m in mids]

    return {"risk": risk, "dark": dark, "busy": busy, "lighting": lighting,
            "outside": outside, "darkness": darkness}


# ---------------------------------------------------------------- routing

def dijkstra(graph, src, dst, cost):
    best, prev, heap = {src: 0.0}, {}, [(0.0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == dst:
            break
        if d > best[u]:
            continue
        for v, e in graph.adj[u]:
            nd = d + cost[e]
            if nd < best.get(v, math.inf):
                best[v], prev[v] = nd, (u, e)
                heapq.heappush(heap, (nd, v))
    if dst not in prev and src != dst:
        return None
    nodes, edges, n = [dst], [], dst
    while n != src:
        n, e = prev[n]
        nodes.append(n)
        edges.append(e)
    return nodes[::-1], edges[::-1]


def summarize(graph, path, scored, incidents, when):
    nodes, edges = path
    length = sum(graph.edges[e]["len"] for e in edges) or 1
    avg = lambda xs: sum(xs[e] * graph.edges[e]["len"] for e in edges) / length
    pts = [graph.nodes[n] for n in nodes]
    route_grid = Grid(100)
    for p in pts:
        route_grid.add(p, p)
    # Count DPS alerts specifically (they're the student-facing warnings).
    near_dps = [i for i in incidents if i.get("source") == "DPS" and incident_weight(i, when) > 0
                and (when - datetime.fromisoformat(i["occurred_at"]).replace(tzinfo=LA)).days <= 730
                and any(dist_m((i["lat"], i["lon"]), p) < 60 for p in route_grid.near((i["lat"], i["lon"])))]
    # Count LAPD incidents in the last year within 40 m -- a denser-but-noisier signal.
    near_lapd = [i for i in incidents if i.get("source") == "LAPD" and incident_weight(i, when) > 0
                 and (when - datetime.fromisoformat(i["occurred_at"]).replace(tzinfo=LA)).days <= 365
                 and any(dist_m((i["lat"], i["lon"]), p) < 40 for p in route_grid.near((i["lat"], i["lon"])))]
    steps = []
    for e in edges:
        name = graph.label(e)
        if steps and steps[-1][0] == name:
            steps[-1][1] += graph.edges[e]["len"]
        elif steps and graph.edges[e]["len"] < 15 and steps[-1][1] >= 15:
            steps[-1][1] += graph.edges[e]["len"]  # fold short crossings/connectors into the current step
        else:
            steps.append([name, graph.edges[e]["len"]])
    patrol_coverage = 1 - avg(scored["outside"])
    return {"length_m": round(length), "minutes": round(length / WALK_SPEED / 60, 1),
            "risk": round(avg(scored["risk"]), 3), "dark": round(avg(scored["dark"]), 3),
            "busy": round(avg(scored["busy"]), 3), "lighting": round(avg(scored["lighting"]), 3),
            "patrol_coverage": round(patrol_coverage, 3),
            "incidents_2y_within_60m": len(near_dps),
            "lapd_1y_within_40m": len(near_lapd),
            "coords": [[round(p[0], 6), round(p[1], 6)] for p in pts],
            "steps": [[n, round(m)] for n, m in steps if m >= 15]}


def generate_reasons(rec, fast):
    """Produce 2-4 short bullet points comparing the recommended route against the fastest."""
    reasons = []
    # Patrol coverage: only mention if there's a meaningful gap.
    if rec["patrol_coverage"] - fast["patrol_coverage"] >= 0.08:
        reasons.append(f"Stays inside USC's DPS patrol area for {rec['patrol_coverage'] * 100:.0f}% "
                       f"of the route (fastest: {fast['patrol_coverage'] * 100:.0f}%).")
    # Lighting
    if rec["lighting"] >= 0.1 and rec["lighting"] / max(fast["lighting"], 0.05) >= 1.2:
        reasons.append(f"Streetlights are {rec['lighting'] / max(fast['lighting'], 0.05):.1f}× denser "
                       "along this route.")
    # Crime risk
    if fast["risk"] - rec["risk"] >= 0.05:
        reasons.append(f"Avoids higher-crime segments (crime risk {rec['risk']} vs {fast['risk']}).")
    # DPS alerts specifically
    if fast["incidents_2y_within_60m"] - rec["incidents_2y_within_60m"] >= 1:
        reasons.append(f"Passes {rec['incidents_2y_within_60m']} DPS alert hotspots vs "
                       f"{fast['incidents_2y_within_60m']} on the fastest route.")
    elif rec["incidents_2y_within_60m"] == 0:
        reasons.append("No DPS alerts within 60 m along this route in the last 2 years.")
    # Darkness exposure (only when it's actually dark)
    if rec["dark"] > 0.05 and fast["dark"] - rec["dark"] >= 0.08:
        reasons.append("Keeps you on better-lit streets after dark.")
    # Busyness
    if rec["busy"] - fast["busy"] >= 0.1:
        reasons.append("Routes you through more active streets right now.")
    # Trade-off: how much longer vs the fastest
    extra = rec["minutes"] - fast["minutes"]
    if extra >= 0.5:
        reasons.append(f"Adds {extra:.1f} min vs. the fastest route.")
    elif rec["length_m"] == fast["length_m"]:
        reasons.append("Same length as the fastest route.")
    return reasons[:4]


def resolve_place(text, graph, cache):
    m = re.fullmatch(r"\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*", text)
    if m:
        return float(m.group(1)), float(m.group(2))
    streets = graph.find_streets(text)
    if len(streets) >= 2 and re.search(r"&|\band\b|\bat\b|/", text, re.I):
        p = graph.intersection(streets[0], streets[1])
        if p:
            return p
    p = geocode(text, graph, cache)
    if not p:
        sys.exit(f"Could not find {text!r} near USC. Try 'lat,lon' or 'Street A & Street B'.")
    return p[0], p[1]


# ---------------------------------------------------------------- map output

MAP_TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>USC Safe Route</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
:root { --bg:#fafaf9; --panel:#ffffff; --text:#1c1917; --muted:#57534e; --border:#e7e5e4;
        --safe:#15803d; --short:#78716c; --risk:#dc2626; --live:#2563eb; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
        --bg:#0c0a09; --panel:#1c1917; --text:#f5f5f4; --muted:#a8a29e; --border:#44403c;
        --safe:#4ade80; --short:#a8a29e; --risk:#f87171; --live:#60a5fa; } }
:root[data-theme="dark"] { --bg:#0c0a09; --panel:#1c1917; --text:#f5f5f4; --muted:#a8a29e; --border:#44403c;
        --safe:#4ade80; --short:#a8a29e; --risk:#f87171; --live:#60a5fa; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:14px/1.45 system-ui,-apple-system,sans-serif;
       display:grid; grid-template-columns:340px 1fr; height:100vh; }
#panel { padding:16px; overflow:auto; background:var(--panel); border-right:1px solid var(--border); }
#map { height:100vh; }
h1 { font-size:18px; margin:0 0 4px; } .muted { color:var(--muted); font-size:12px; }
.card { border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin:12px 0; }
.card h2 { font-size:14px; margin:0 0 6px; display:flex; align-items:center; gap:8px; }
.swatch { width:18px; height:4px; border-radius:2px; display:inline-block; }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
td { padding:2px 0; } td:last-child { text-align:right; }
ol { padding-left:18px; margin:6px 0 0; }
.tiles-dark { filter:invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
@media (max-width:700px) { body { grid-template-columns:1fr; grid-template-rows:auto 60vh; height:auto; }
  #panel { border-right:0; border-bottom:1px solid var(--border); } #map { height:60vh; } }
</style></head><body>
<div id="panel">
  <h1>USC Safe Route</h1>
  <div class="muted" id="meta"></div>
  <div class="card"><h2>Why this route?</h2><ul id="reasons"></ul></div>
  <div class="card"><h2><span class="swatch" style="background:var(--safe)"></span>Recommended</h2><table id="rec"></table></div>
  <div class="card"><h2><span class="swatch" style="background:var(--short)"></span>Fastest</h2><table id="fast"></table></div>
  <div class="card"><h2>Directions</h2><ol id="steps"></ol></div>
  <div class="muted">Red circles: DPS alerts (size = current weight). Blue: live foot-traffic signals.
  Risk 0-1.5 relative to the area's hotspots; lighting and busy 0-1.</div>
</div>
<div id="map"></div>
<script>
const D = /*DATA*/;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
document.getElementById('meta').textContent =
  `${D.from_label} → ${D.to_label} · ${D.time} · darkness ${D.darkness} · live: ${D.live}`;
for (const r of D.reasons) {
  const li = document.createElement('li'); li.textContent = r;
  document.getElementById('reasons').appendChild(li);
}
const rows = r => `<tr><td>Distance</td><td>${r.length_m} m (${r.minutes} min)</td></tr>
  <tr><td>Avg crime risk</td><td>${r.risk}</td></tr><tr><td>Avg darkness exposure</td><td>${r.dark}</td></tr>
  <tr><td>Avg lighting</td><td>${r.lighting}</td></tr>
  <tr><td>DPS patrol coverage</td><td>${(r.patrol_coverage*100).toFixed(0)}%</td></tr>
  <tr><td>Avg busyness</td><td>${r.busy}</td></tr>
  <tr><td>DPS alerts ≤60 m (2 yrs)</td><td>${r.incidents_2y_within_60m}</td></tr>`;
document.getElementById('rec').innerHTML = rows(D.recommended);
document.getElementById('fast').innerHTML = rows(D.fastest);
for (const [n, m] of D.recommended.steps) {
  const li = document.createElement('li'); li.textContent = `${n} — ${m} m`;
  document.getElementById('steps').appendChild(li);
}
const map = L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap contributors', maxZoom: 19, className: dark ? 'tiles-dark' : '' }).addTo(map);
for (const i of D.incidents) {
  const src = i.source || 'DPS';
  L.circle([i.lat, i.lon], { radius: 10 + 30 * i.w, color: css('--risk'),
      weight: src==='DPS' ? 2 : 1, fillOpacity: src==='DPS' ? 0.3 : 0.12 })
    .bindPopup(`<b>${i.offense}</b> (${src})<br>${i.occurred_at}<br>${i.location}`
      + (i.url ? `<br><a href="${i.url}" target="_blank">DPS alert</a>` : ''))
    .addTo(map);
}
for (const s of D.signals) {
  L.circleMarker([s.lat, s.lon], { radius: 4 + 8 * s.value, color: css('--live'), weight: 2, fillOpacity: 0.4 })
    .bindPopup(`<b>${s.name}</b><br>${s.source}: ${s.detail}`).addTo(map);
}
L.polyline(D.fastest.coords, { color: css('--short'), weight: 4, dashArray: '6 8' }).addTo(map);
L.polyline(D.recommended.coords, { color: css('--safe'), weight: 6 }).addTo(map);
L.marker(D.recommended.coords[0]).bindPopup('Start').addTo(map);
L.marker(D.recommended.coords.at(-1)).bindPopup('End').addTo(map);
map.fitBounds(L.latLngBounds([...D.recommended.coords, ...D.fastest.coords]).pad(0.15));
</script></body></html>
"""


def write_map(path, data):
    with open(path, "w", encoding="utf-8") as f:
        f.write(MAP_TEMPLATE.replace("/*DATA*/", json.dumps(data).replace("</", "<\\/")))


# ---------------------------------------------------------------- commands

class RouteEngine:
    """Loads graph + incidents + lighting + patrol once; computes recommended + fastest routes.

    All heavy loading happens in __init__ so a long-running server (safety_server.py) can call
    .route() per request with minimal latency.
    """

    def __init__(self, refresh_map=False):
        self.graph = load_graph(refresh_map)
        self.dps = load_incidents(self.graph)
        self.lapd = load_lapd_crimes()
        self.incidents = self.dps + self.lapd
        self.lights, self.light_count = load_streetlights()
        self.patrol = load_patrol_zone()
        self.geocode_cache = load_cache("geocode.json", {})
        self.sources = self._sources()
        log(f"RouteEngine ready: {len(self.graph.edges)} edges, "
            f"{len(self.dps)} DPS + {len(self.lapd)} LAPD incidents, "
            f"{self.light_count} streetlights, {len(self.patrol)} patrol polygons.")

    def _sources(self):
        srcs = []
        if self.dps:
            latest = max((i["occurred_at"] for i in self.dps), default="")[:10]
            srcs.append({"name": "USC DPS Crime Alerts", "updated": latest or "unknown",
                         "url": "https://dps.usc.edu/alerts/"})
        if self.lapd:
            latest = max((i["occurred_at"] for i in self.lapd), default="")[:10]
            srcs.append({"name": "LAPD incidents (local extract)", "updated": latest or "unknown",
                         "url": "https://data.lacity.org/"})
        if self.light_count:
            srcs.append({"name": "LA City streetlights", "updated": "2026-03-10",
                         "url": "https://data.lacity.org/d/twzm-wihy"})
        srcs.append({"name": "OpenStreetMap walk network", "updated": "cached",
                     "url": "https://www.openstreetmap.org/copyright"})
        return srcs

    def live_signals(self, when):
        """Pull live foot-traffic signals if the requested time is within an hour of now."""
        now = datetime.now(LA)
        signals, live = [], []
        if abs((when - now).total_seconds()) >= 3600:
            return signals, ["off (time not now)"]
        try:
            bike_sample()
            bikes, span = bike_activity()
            signals += bikes
            live.append(f"bike share ({span / 60:.0f} min of history)" if bikes
                        else "bike share (no history yet: run `watch`)")
        except OSError as err:
            log(f"  Bike share unavailable: {err}")
            live.append("bike share (unavailable)")
        if os.environ.get("BESTTIME_API_KEY"):
            bt = besttime_signals(os.environ["BESTTIME_API_KEY"])
            signals += bt
            live.append(f"BestTime ({len(bt)} venues)")
        return signals, live

    def resolve(self, text):
        p = resolve_place(text, self.graph, self.geocode_cache)
        save_cache("geocode.json", self.geocode_cache)
        return p

    def geocode_text(self, text, limit=5):
        """Autocomplete-style forward geocoding -> list of {label, lat, lon, kind}."""
        results = []
        # 1. "lat,lon" literal
        m = re.fullmatch(r"\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*", text)
        if m:
            return [{"label": f"{m.group(1)}, {m.group(2)}", "lat": float(m.group(1)),
                     "lon": float(m.group(2)), "kind": "coords"}]
        # 2. "Street A & Street B"
        streets = self.graph.find_streets(text)
        if len(streets) >= 2 and re.search(r"&|\band\b|\bat\b|/", text, re.I):
            p = self.graph.intersection(streets[0], streets[1])
            if p:
                results.append({"label": f"{streets[0][0].title()} & {streets[1][0].title()}",
                                "lat": p[0], "lon": p[1], "kind": "intersection"})
        # 3. Full geocoder (address / Nominatim). Reuses the cache so repeated typing is fast.
        try:
            g = geocode(text, self.graph, self.geocode_cache)
            if g and not any(abs(r["lat"] - g[0]) < 1e-5 and abs(r["lon"] - g[1]) < 1e-5 for r in results):
                results.append({"label": text, "lat": g[0], "lon": g[1], "kind": g[2]})
        except OSError:
            pass
        return results[:limit]

    def route(self, src, dst, when, safety=1.0, signals=None):
        """src, dst: (lat, lon). when: aware datetime. Returns a dict ready to send over JSON."""
        if signals is None:
            signals, _ = self.live_signals(when)
        scored = score_edges(self.graph, self.incidents, when, signals, self.lights, self.patrol)
        s = safety
        edges = self.graph.edges
        safe_cost = [e["len"] * (1 + s * (W_RISK * scored["risk"][i]
                                         + W_DARK * scored["dark"][i]
                                         + W_QUIET * (1 - scored["busy"][i])
                                         + W_UNLIT * (1 - scored["lighting"][i])
                                         + W_OUTSIDE * scored["outside"][i]
                                         + (W_ALLEY if e["service"] in ISOLATED_SERVICE else 0)))
                     for i, e in enumerate(edges)]
        short_cost = [e["len"] for e in edges]
        src_n, dst_n = self.graph.snap(src), self.graph.snap(dst)
        if src_n == dst_n:
            return None
        fastest = dijkstra(self.graph, src_n, dst_n, short_cost)
        safest = dijkstra(self.graph, src_n, dst_n, safe_cost)
        if not fastest or not safest:
            return None
        rec = summarize(self.graph, safest, scored, self.incidents, when)
        fast = summarize(self.graph, fastest, scored, self.incidents, when)
        return {"recommended": rec, "fastest": fast,
                "reasons": generate_reasons(rec, fast),
                "darkness": round(scored["darkness"], 2),
                "signals": signals,
                "sources": self.sources,
                "disclaimer": ("This route is informational and does not guarantee safety. "
                               "Trust your instincts, stay aware of your surroundings, "
                               "and call USC DPS at 213-740-4321 or 911 if you feel unsafe.")}


def cmd_route(args):
    now = datetime.now(LA)
    when = datetime.fromisoformat(args.time).replace(tzinfo=LA) if args.time else now
    engine = RouteEngine(args.refresh_map)
    signals, live = ([], ["off"]) if args.no_live else engine.live_signals(when)
    a, b = engine.resolve(args.src), engine.resolve(args.dst)
    result = engine.route(a, b, when, safety=args.safety, signals=signals)
    if not result:
        sys.exit("No walking path found between those points.")
    rec, fast = result["recommended"], result["fastest"]

    print(f"\n{args.src} -> {args.dst}   [{when:%a %Y-%m-%d %H:%M}, "
          f"darkness {result['darkness']}, live: {', '.join(live)}]")
    print(f"Start {a[0]:.5f},{a[1]:.5f}  End {b[0]:.5f},{b[1]:.5f}")
    print(f"Loaded {len(engine.dps)} DPS + {len(engine.lapd)} LAPD, "
          f"{engine.light_count} lights, {len(signals)} live signals.\n")
    hdr = f"{'':12}{'dist':>8}{'min':>7}{'risk':>7}{'dark':>7}{'busy':>7}{'light':>7}{'patrol':>8}{'DPS<60':>8}"
    print(hdr)
    for name, r in (("fastest", fast), ("recommended", rec)):
        print(f"{name:12}{r['length_m']:>6}m{r['minutes']:>7}{r['risk']:>7}{r['dark']:>7}"
              f"{r['busy']:>7}{r['lighting']:>7}{r['patrol_coverage']:>8}{r['incidents_2y_within_60m']:>8}")
    print("\nWhy this route?")
    for reason in result["reasons"]:
        print(f"  - {reason}")
    print("\nDirections:")
    for name, m in rec["steps"]:
        print(f"  - {name}: {m} m")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        print(f"\nRoute JSON -> {args.json}")
    if args.map:
        incs = [{**i, "w": round(min(1.0, incident_weight(i, when) / 3), 3)} for i in engine.incidents]
        incs = [i for i in incs if i["w"] > 0.02]
        write_map(args.map, {"recommended": rec, "fastest": fast, "reasons": result["reasons"],
                             "time": when.strftime("%a %Y-%m-%d %H:%M"), "darkness": result["darkness"],
                             "live": ", ".join(live), "from_label": args.src, "to_label": args.dst,
                             "incidents": incs, "signals": signals})
        print(f"Map -> {args.map}")


def cmd_watch(args):
    log(f"Sampling bike share every {args.interval}s (Ctrl+C to stop)...")
    while True:
        try:
            snap = bike_sample()
            _, span = bike_activity()
            log(f"{datetime.now(LA):%H:%M:%S} {len(snap['bikes'])} stations, {span / 60:.0f} min of history")
        except OSError as err:
            log(f"sample failed: {err}")
        time.sleep(args.interval)


def cmd_geocode(args):
    graph = load_graph()
    incidents = load_incidents(graph)
    out = os.path.join(HERE, "alerts_geocoded.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(incidents, f, indent=2, ensure_ascii=False)
    methods = {}
    for i in incidents:
        methods[i["method"]] = methods.get(i["method"], 0) + 1
    log(f"Saved {len(incidents)} geocoded alerts to {out} ({methods})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("route", help="shortest vs safest walking route")
    r.add_argument("--from", dest="src", required=True, help="'lat,lon', 'Street & Street', or a place name")
    r.add_argument("--to", dest="dst", required=True)
    r.add_argument("--time", help="local time, e.g. 2026-10-17T23:00 (default: now; live data only near now)")
    r.add_argument("--safety", type=float, default=1.0, help="0 = shortest only, higher = avoid risk more")
    r.add_argument("--map", default=os.path.join(HERE, "route_map.html"), help="HTML map output ('' to skip)")
    r.add_argument("--json", help="write route details as JSON")
    r.add_argument("--no-live", action="store_true", help="skip live foot-traffic feeds")
    r.add_argument("--refresh-map", action="store_true", help="re-download the OSM walk network")
    r.set_defaults(func=cmd_route)
    w = sub.add_parser("watch", help="sample bike share periodically to build live activity history")
    w.add_argument("--interval", type=int, default=120)
    w.set_defaults(func=cmd_watch)
    sub.add_parser("geocode", help="geocode alerts.json -> alerts_geocoded.json").set_defaults(func=cmd_geocode)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
