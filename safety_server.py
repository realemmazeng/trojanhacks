#!/usr/bin/env python3
"""HTTP server for Safety Path.

Wraps RouteEngine (safe_route.py) and serves the app UI:
  - frontend/dist/ (the React app, built with `cd frontend && npm run build`) when it exists,
  - otherwise the older single-page app in static/.

Endpoints:
    POST /path                -> recommended + fastest path (frontend/docs/API_CONTRACT.md)
    GET  /api/geocode?q=...   -> list of {label, lat, lon, kind}
    GET  /api/route?from=...&to=...&time=...&safety=... -> detailed route payload (CLI-style)
    GET  /api/health          -> {ok, edges, dps, lapd, lights, ui}
    GET  /<anything else>     -> UI files; unknown paths fall back to index.html (SPA routing)

Usage:
    python3 safety_server.py                      # 127.0.0.1:8000
    python3 safety_server.py --host 0.0.0.0 --port 8000
"""

import argparse
import json
import os
import re
import sys
import traceback
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import safe_route as sr  # noqa: E402

STATIC_DIR = os.path.join(HERE, "static")
DIST_DIR = os.path.join(HERE, "frontend", "dist")
# Legacy UI only: files served at the site root (service workers need a top-level scope).
ROOT_ALIASES = {"/sw.js": "sw.js", "/manifest.webmanifest": "manifest.webmanifest",
                "/favicon.ico": "icon-192.png", "/apple-touch-icon.png": "icon-192.png"}
MAX_BODY = 16 * 1024
CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                 ".js": "application/javascript; charset=utf-8", ".json": "application/json",
                 ".webmanifest": "application/manifest+json", ".png": "image/png",
                 ".svg": "image/svg+xml", ".ico": "image/x-icon", ".map": "application/json",
                 ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"}


def react_built():
    return os.path.isfile(os.path.join(DIST_DIR, "index.html"))


def parse_latlon_or_text(s):
    """'34.02,-118.28' -> (34.02, -118.28); otherwise returns the trimmed string."""
    m = re.fullmatch(r"\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*", s or "")
    return (float(m.group(1)), float(m.group(2))) if m else (s or "").strip()


class Handler(BaseHTTPRequestHandler):
    engine: sr.RouteEngine  # set by main()
    server_version = "SafetyPath/1.0"

    def log_message(self, format, *args):  # noqa: A002 (name matches BaseHTTPRequestHandler)
        # Keep access logs on stderr but trim: HTTP server noise clutters the demo terminal.
        sys.stderr.write(f"{self.address_string()} {format % args}\n")

    def _send(self, status, body, content_type="application/json", extra_headers=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")  # harmless; everything is read-only
        # Short-ish cache for static files so demo iterations show up fast; API never caches.
        extra_headers = extra_headers or {}
        if "Cache-Control" not in extra_headers:
            self.send_header("Cache-Control", "no-store" if content_type.startswith("application/json")
                             else "public, max-age=30, must-revalidate")
        for k, v in extra_headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, msg):
        self._send(status, {"error": msg})

    def _serve_file(self, rel_path, base=STATIC_DIR):
        safe = os.path.normpath(os.path.join(base, rel_path))
        if not safe.startswith(base + os.sep) or not os.path.isfile(safe):
            return self._error(404, f"not found: {rel_path}")
        ext = os.path.splitext(safe)[1].lower()
        ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
        with open(safe, "rb") as f:
            body = f.read()
        extra = {"Service-Worker-Allowed": "/"} if rel_path == "sw.js" else {}
        if base == DIST_DIR:
            # Vite fingerprints /assets/*, so those can be cached forever; everything else revalidates.
            extra["Cache-Control"] = ("public, max-age=31536000, immutable" if rel_path.startswith("assets/")
                                      else "no-cache")
        return self._send(200, body, ctype, extra)

    def _serve_ui(self, path):
        """React build if present (with SPA fallback to index.html), else the legacy static/ UI."""
        if react_built():
            rel = path.lstrip("/") or "index.html"
            if os.path.isfile(os.path.join(DIST_DIR, rel)):
                return self._serve_file(rel, DIST_DIR)
            if "." in os.path.basename(rel):
                return self._error(404, f"not found: {path}")
            return self._serve_file("index.html", DIST_DIR)
        if path == "/":
            return self._serve_file("index.html")
        if path in ROOT_ALIASES:
            return self._serve_file(ROOT_ALIASES[path])
        if path.startswith("/static/"):
            return self._serve_file(path[len("/static/"):])
        return self._error(404, f"no route for {path}")

    def do_GET(self):
        try:
            url = urllib.parse.urlparse(self.path)
            path, qs = url.path, urllib.parse.parse_qs(url.query)
            if path == "/api/health":
                e = self.engine
                return self._send(200, {"ok": True, "edges": len(e.graph.edges),
                                         "dps": len(e.dps), "lapd": len(e.lapd),
                                         "lights": e.light_count, "patrol_polys": len(e.patrol),
                                         "ui": "react" if react_built() else "legacy"})
            if path == "/api/geocode":
                q = (qs.get("q") or [""])[0].strip()
                if not q:
                    return self._send(200, [])
                limit = int((qs.get("limit") or ["5"])[0])
                return self._send(200, self.engine.geocode_text(q, limit=limit))
            if path == "/api/route":
                return self._route(qs)
            if path.startswith("/api/") or path == "/path":
                return self._error(404 if path != "/path" else 405, f"no route for GET {path}")
            return self._serve_ui(path)
        except Exception as err:  # keep the server alive; show the stack in the log
            traceback.print_exc()
            self._error(500, f"{type(err).__name__}: {err}")

    def do_POST(self):
        try:
            path = urllib.parse.urlparse(self.path).path
            if path != "/path":
                return self._error(404, f"no route for POST {path}")
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                return self._error(400, "Expected a JSON body.")
            try:
                req = json.loads(self.rfile.read(length))
                origin = (float(req["origin"]["lat"]), float(req["origin"]["lng"]))
                dest = (float(req["destination"]["lat"]), float(req["destination"]["lng"]))
            except (ValueError, KeyError, TypeError):
                return self._error(400, "Body must have origin {lat, lng} and destination {lat, lng}.")
            depart = req.get("depart_at")
            try:
                when = (datetime.fromisoformat(depart).replace(tzinfo=sr.LA) if depart
                        else datetime.now(sr.LA))
            except (ValueError, TypeError):
                return self._error(400, f"Bad depart_at: {depart!r}, expected e.g. 2026-10-17T21:40.")
            for label, p in (("Your starting point", origin), ("That destination", dest)):
                if not sr.in_service_area(p):
                    return self._error(422, f"{label} is outside the area Safety Path covers "
                                            "(W Adams–W Jefferson, S Vermont–S Figueroa).")
            result = sr.path_response(self.engine, origin, dest, when)
            if result is None:
                return self._error(422, "Start and destination are too close together, "
                                        "or no walking path connects them.")
            return self._send(200, result)
        except Exception as err:
            traceback.print_exc()
            self._error(500, f"{type(err).__name__}: {err}")

    def do_OPTIONS(self):  # CORS preflight for anyone embedding the API
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _route(self, qs):
        src_q = (qs.get("from") or [""])[0]
        dst_q = (qs.get("to") or [""])[0]
        if not src_q or not dst_q:
            return self._error(400, "Missing `from` or `to` query parameter.")
        time_q = (qs.get("time") or [""])[0]
        try:
            when = datetime.fromisoformat(time_q).replace(tzinfo=sr.LA) if time_q \
                   else datetime.now(sr.LA)
        except ValueError:
            return self._error(400, f"Bad `time`: {time_q!r}, expected ISO 8601.")
        try:
            safety = float((qs.get("safety") or ["1"])[0])
        except ValueError:
            return self._error(400, "Bad `safety`, expected a number.")
        try:
            a = parse_latlon_or_text(src_q)
            if isinstance(a, str):
                a = self.engine.resolve(a)
            b = parse_latlon_or_text(dst_q)
            if isinstance(b, str):
                b = self.engine.resolve(b)
        except SystemExit as err:   # resolve_place calls sys.exit on failure
            return self._error(400, str(err))

        result = self.engine.route(a, b, when, safety=safety)
        if result is None:
            return self._error(422, "Could not find a walking path between those points.")
        # Attach the resolved coordinates and the requested-time echo so the UI can show them.
        result["from"] = {"query": src_q, "lat": a[0], "lon": a[1]}
        result["to"] = {"query": dst_q, "lat": b[0], "lon": b[1]}
        result["time"] = when.isoformat()
        return self._send(200, result)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--refresh-map", action="store_true", help="re-download the OSM walk network")
    args = ap.parse_args()

    engine = sr.RouteEngine(refresh_map=args.refresh_map)
    Handler.engine = engine
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"\n  Safety Path listening on http://{args.host}:{args.port}", file=sys.stderr)
    print(f"  (open http://127.0.0.1:{args.port} in a browser)\n", file=sys.stderr)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", file=sys.stderr)
        srv.server_close()


if __name__ == "__main__":
    main()
