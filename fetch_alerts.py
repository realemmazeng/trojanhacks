#!/usr/bin/env python3
"""Fetch USC DPS crime alerts from the WordPress REST API and save them as clean JSON.

Usage:
    python3 fetch_alerts.py                # all alerts -> alerts.json
    python3 fetch_alerts.py --page 5       # one website page (10 alerts), like /crime-alerts/page/5/
    python3 fetch_alerts.py -o out.json    # choose the output file

Uses only the Python standard library.
"""

import argparse
import html
import json
import re
import sys
import urllib.request
from datetime import datetime
from html.parser import HTMLParser

API = "https://dps.usc.edu/wp-json/wp/v2/posts"
CRIME_ALERTS_CATEGORY = 5
FIELDS = "id,date,title,link,content"

# Labels used for the main fields across the different post formats over the years.
FIELD_LABELS = {
    "description": ["incident description"],
    "offense": ["reported offense", "offense"],
    "date_time": ["date & time of occurrence", "time & date of incident", "date & time of incident",
                  "date and time of occurrence", "date & time"],
    "location": ["location"],
    "report_number": ["report number", "dr number", "case number"],
    "vehicle": ["vehicle description", "suspect vehicle"],
}
SUSPECT_HEADER = re.compile(r"^(suspect(s)?( \d+)?|second suspect|first suspect)( description)?\b", re.I)
SUSPECT_KEYS = {"age", "eye color", "hair color", "height", "race", "sex", "weight",
                "additional description", "weapon", "clothing", "build", "gender"}

# Every alert ends with the same safety boilerplate; everything from here on is dropped.
BOILERPLATE = re.compile(
    r"^(if you are in immediate danger|please note that race|if you have (any questions or )?information"
    r"|the purpose of this warning|usc department of public safety recommendations|trojansalert"
    r"|resources\b|department of public safety \(dps\) at|reference:)",
    re.I,
)

BLOCK_TAGS = {"p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "figure", "table", "tbody"}


class AlertHTML(HTMLParser):
    """Turns post HTML into text lines; each table row becomes 'Key: value' and each table is a suspect."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines, self.tables = [], []
        self._buf, self._cells, self._row = [], None, None
        self._in_table = False

    def _flush(self):
        text = re.sub(r"\s+", " ", "".join(self._buf)).strip()
        if text:
            self.lines.append(text)
        self._buf = []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._flush()
            self._in_table = True
            self.tables.append({})
        elif self._in_table and tag == "tr":
            self._row = []
        elif self._in_table and tag in ("td", "th"):
            self._cells = []
        elif tag == "br":
            self._buf.append("\n") if not self._in_table else None
            self._flush()
        elif tag in BLOCK_TAGS and not self._in_table:
            self._flush()

    def handle_endtag(self, tag):
        if self._in_table and tag in ("td", "th") and self._cells is not None:
            self._row.append(re.sub(r"\s+", " ", "".join(self._cells)).strip())
            self._cells = None
        elif self._in_table and tag == "tr" and self._row is not None:
            if len(self._row) >= 2 and self._row[0]:
                key = self._row[0].rstrip(":").strip()
                self.tables[-1][key] = self._row[1]
            elif len(self._row) == 1 and ":" in self._row[0]:
                key, _, val = self._row[0].partition(":")
                self.tables[-1][key.strip()] = val.strip()
            self._row = None
        elif tag == "table":
            self._in_table = False
            if not self.tables[-1]:
                self.tables.pop()
        elif tag in BLOCK_TAGS and not self._in_table:
            self._flush()

    def handle_data(self, data):
        if self._cells is not None:
            self._cells.append(data)
        elif not self._in_table:
            self._buf.append(data)

    def close(self):
        super().close()
        self._flush()


def match_label(line):
    """Return (field, value) if the line starts with a known label, else None."""
    low = line.lower()
    for field, labels in FIELD_LABELS.items():
        for label in labels:
            if low.startswith(label):
                rest = line[len(label):]
                if rest[:1] in ("", ":", " ") or rest.lstrip().startswith(":"):
                    return field, rest.lstrip(" : ").strip()
    return None


MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def parse_datetime(text):
    """Best-effort ISO timestamp from strings like '10/29/2025 8:05 p.m.'."""
    if not text:
        return None
    t = text.lower().replace("a.m.", "am").replace("p.m.", "pm").replace(".", "")
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", t)
    named = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", t)
    if m:
        month, day, year = (int(x) for x in m.groups())
    elif named:
        month = MONTHS.index(named.group(1)) + 1
        day, year = int(named.group(2)), int(named.group(3))
    else:
        return None
    year += 2000 if year < 100 else 0
    tm = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", t)
    try:
        if tm:
            hour, minute = int(tm.group(1)) % 12, int(tm.group(2) or 0)
            hour += 12 if tm.group(3) == "pm" else 0
            return datetime(year, month, day, hour, minute).isoformat()
        return datetime(year, month, day).date().isoformat()
    except ValueError:
        return None


def parse_alert(post):
    parser = AlertHTML()
    parser.feed(post["content"]["rendered"])
    parser.close()

    lines = []
    for line in parser.lines:
        if BOILERPLATE.match(line):
            break
        lines.append(line)

    fields = {f: None for f in FIELD_LABELS}
    suspects = [dict(t) for t in parser.tables]
    inline_suspect, current, untagged = {}, None, []

    for line in lines:
        hit = match_label(line)
        if hit:
            current, value = hit
            if value:
                fields[current] = value if not fields[current] else f"{fields[current]} {value}"
            continue
        if SUSPECT_HEADER.match(line) and len(line) < 80:
            current = "suspect"
            if inline_suspect:
                suspects.append(inline_suspect)
                inline_suspect = {}
            continue
        key, sep, val = line.partition(":")
        if sep and key.strip().lower() in SUSPECT_KEYS:
            inline_suspect[key.strip()] = val.strip()
            current = "suspect"
            continue
        if current in fields and not fields[current]:
            fields[current] = line  # value was on the line after its heading
            continue
        if current is None or current == "description":
            untagged.append(line)
        elif current == "suspect" and inline_suspect:
            inline_suspect.setdefault("Additional Description", line)

    if inline_suspect:
        suspects.append(inline_suspect)
    if not fields["description"] and untagged:
        fields["description"] = " ".join(untagged)  # older posts: free-text paragraphs only
    elif fields["description"] and untagged and current == "description":
        fields["description"] += " " + " ".join(untagged)

    if not fields["report_number"]:
        case = re.search(r"case\s*#\s*(\d{5,})", " ".join(lines), re.I)
        fields["report_number"] = case.group(1) if case else None

    title = html.unescape(post["title"]["rendered"]).strip()
    return {
        "id": post["id"],
        "title": title,
        "offense": fields["offense"] or title,
        "posted_at": post["date"],
        "occurred": fields["date_time"],
        "occurred_at": parse_datetime(fields["date_time"]),
        "location": fields["location"],
        "report_number": fields["report_number"],
        "description": fields["description"],
        "vehicle": fields["vehicle"],
        "suspects": suspects,
        "url": post["link"],
        "text": "\n".join(lines),
    }


def fetch(page, per_page):
    url = f"{API}?categories={CRIME_ALERTS_CATEGORY}&per_page={per_page}&page={page}&_fields={FIELDS}"
    req = urllib.request.Request(url, headers={"User-Agent": "usc-crime-alerts/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp), int(resp.headers.get("X-WP-TotalPages", 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--page", type=int, help="fetch only this website page (10 alerts per page)")
    ap.add_argument("-o", "--output", default="alerts.json")
    args = ap.parse_args()

    if args.page:
        posts, _ = fetch(args.page, 10)
    else:
        posts, total_pages = fetch(1, 100)
        for page in range(2, total_pages + 1):
            posts += fetch(page, 100)[0]

    alerts = [parse_alert(p) for p in posts]
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(alerts, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(alerts)} alerts to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
