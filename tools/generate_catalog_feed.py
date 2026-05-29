#!/usr/bin/env python3
"""
Generate a CSV catalog feed for Marketing Cloud Personalization (MCP).

Reads all career and blog markdown posts, extracts front matter + the first
paragraphs of body content, and emits a CSV at `catalog/articles.csv` shaped
for MCP's Catalog Object ETL (`CatalogObjectETL.ts`).

Output schema (one row per Article):

    id, catalogObjectType, categories,
    attribute:name, attribute:url, attribute:description,
    attribute:company, attribute:startDate, attribute:endDate,
    attribute:location, attribute:industry, attribute:seniority,
    attribute:published, attribute:topics, attribute:technologies

Conventions
-----------
* `id`                : `<YYYYMM>-<slug>` (must match the value our sitemap.js
                        sends in `data-article-id`, so beacon-driven views and
                        feed-driven items reconcile on the same key).
* `catalogObjectType` : Required by `CatalogObjectETL`. Always `Article` — we
                        use a single Item Type for both career and blog and
                        let `categories` differentiate them.
* `categories`        : Single value, `career` or `blog`. Built-in MultiString
                        relation that links the Article to a Category catalog
                        object. Pipe-separated when multi-valued.
* `attribute:topics`  : MultiString — pipe-separated (`marketing-tech|consulting`).
* `attribute:technologies`: String (CSV format inside the field) — comma-separated
                            so the value is stored as a single literal string,
                            matching the way the beacon sends it.
* `attribute:published`: System Date attribute (mapped from post date). We do
                         NOT emit `attribute:publishDate` or `attribute:author`
                         because they are not registered on the Article Item
                         Type — the ETL would reject the whole row.
* `attribute:description`: front matter `description:` if present, otherwise
                           the first ~200 characters of stripped body content.

Usage
-----
    python3 tools/generate_catalog_feed.py

Run from the repo root. Requires PyYAML (`pip install pyyaml`).

Upload the resulting CSV via MCP UI → Feeds Dashboard → Catalog Object ETL.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write(
        "Missing dependency: pyyaml. Run `pip install pyyaml` and retry.\n"
    )
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent
CAREER_DIR = REPO_ROOT / "career" / "_posts"
BLOG_DIR = REPO_ROOT / "blog" / "_posts"
OUTPUT = REPO_ROOT / "catalog" / "articles.csv"

SITE_URL = "https://www.bombonato.net"

FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
FILENAME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$")


def parse_post(path: Path) -> tuple[dict, str] | tuple[None, None]:
    """Return (front_matter_dict, body) or (None, None) if malformed."""
    text = path.read_text(encoding="utf-8")
    match = FRONT_MATTER_RE.match(text)
    if not match:
        return None, None
    fm_raw, body = match.group(1), match.group(2)
    try:
        fm = yaml.safe_load(fm_raw) or {}
    except yaml.YAMLError as exc:
        sys.stderr.write(f"YAML error in {path.name}: {exc}\n")
        return None, None
    return fm, body


def extract_id_and_url(path: Path) -> tuple[str, str] | tuple[None, None]:
    match = FILENAME_RE.match(path.name)
    if not match:
        return None, None
    year, month, _day, slug = match.groups()
    item_id = f"{year}{month}-{slug}"
    url = f"{SITE_URL}/{year}/{month}/{slug}/"
    return item_id, url


def strip_to_description(body: str, max_len: int = 200) -> str:
    """Crude markdown→text → truncate. Good enough for catalog descriptions."""
    text = re.sub(r"```.*?```", " ", body, flags=re.DOTALL)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[#*_>~\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        text = text[:max_len].rstrip() + "..."
    return text


def joined_list(fm: dict, key: str, sep: str = "|") -> str:
    """Join a list-typed front-matter field with the given separator.

    MultiString attributes use pipe `|`; plain String attributes that happen
    to carry CSV-style values (e.g. `technologies`) use comma `,`.
    """
    values = fm.get(key) or []
    if isinstance(values, str):
        values = [v.strip() for v in values.split(",") if v.strip()]
    return sep.join(str(v) for v in values)


def normalize_end_date(value) -> str:
    """Accept date object, ISO string, or empty. Return YYYY-MM-DD or ''."""
    if not value:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def build_row_career(path: Path, fm: dict, body: str) -> dict | None:
    item_id, url = extract_id_and_url(path)
    if not item_id:
        return None

    match = FILENAME_RE.match(path.name)
    year, month, day, _ = match.groups()
    start_date = f"{year}-{month}-{day}"

    description = fm.get("description") or strip_to_description(body)

    return {
        "id": item_id,
        "catalogObjectType": "Article",
        "categories": "career",
        "attribute:name": f"[Carreira] {fm.get('title', '')}",
        "attribute:url": url,
        "attribute:description": description,
        "attribute:company": fm.get("company", "") or "",
        "attribute:startDate": start_date,
        "attribute:endDate": normalize_end_date(fm.get("end")),
        "attribute:location": fm.get("location", "") or "",
        "attribute:industry": fm.get("industry", "") or "",
        "attribute:seniority": fm.get("seniority", "") or "",
        "attribute:published": start_date,
        "attribute:topics": joined_list(fm, "topics", sep="|"),
        "attribute:technologies": joined_list(fm, "technologies", sep=","),
    }


def build_row_blog(path: Path, fm: dict, body: str) -> dict | None:
    item_id, url = extract_id_and_url(path)
    if not item_id:
        return None

    match = FILENAME_RE.match(path.name)
    year, month, day, _ = match.groups()
    publish_date = f"{year}-{month}-{day}"

    description = fm.get("description") or strip_to_description(body)

    return {
        "id": item_id,
        "catalogObjectType": "Article",
        "categories": "blog",
        "attribute:name": f"[Blog] {fm.get('title', '')}",
        "attribute:url": url,
        "attribute:description": description,
        "attribute:company": "",
        "attribute:startDate": "",
        "attribute:endDate": "",
        "attribute:location": "",
        "attribute:industry": "",
        "attribute:seniority": "",
        "attribute:published": publish_date,
        "attribute:topics": joined_list(fm, "topics", sep="|"),
        "attribute:technologies": "",
    }


FIELDNAMES = [
    "id",
    "catalogObjectType",
    "categories",
    "attribute:name",
    "attribute:url",
    "attribute:description",
    "attribute:company",
    "attribute:startDate",
    "attribute:endDate",
    "attribute:location",
    "attribute:industry",
    "attribute:seniority",
    "attribute:published",
    "attribute:topics",
    "attribute:technologies",
]


def main() -> int:
    rows: list[dict] = []

    for path in sorted(CAREER_DIR.glob("*.md")):
        fm, body = parse_post(path)
        if fm is None:
            continue
        row = build_row_career(path, fm, body or "")
        if row:
            rows.append(row)

    for path in sorted(BLOG_DIR.glob("*.md")):
        fm, body = parse_post(path)
        if fm is None:
            continue
        row = build_row_blog(path, fm, body or "")
        if row:
            rows.append(row)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=FIELDNAMES,
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        writer.writerows(rows)

    career_count = sum(1 for r in rows if r["categories"] == "career")
    blog_count = sum(1 for r in rows if r["categories"] == "blog")

    print(
        f"Generated {OUTPUT.relative_to(REPO_ROOT)} "
        f"with {len(rows)} items "
        f"({career_count} career, {blog_count} blog)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
