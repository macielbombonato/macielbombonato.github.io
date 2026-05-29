#!/usr/bin/env python3
"""
Generate the two CSV catalog feeds for Marketing Cloud Personalization (MCP):

    catalog/articles.csv   →  Item Type `Article`  (career experiences only)
    catalog/blogs.csv      →  Item Type `Blog`     (native MCP Blog Post type)

Why two feeds (and two Item Types)?
-----------------------------------
We used to ship a single `articles.csv` with `catalogObjectType=Article` for
both career and blog rows, differentiated by the polymorphic `categories`
column (`career` vs `blog`). That collapsed everything onto one Item Type
and forced every Recipe to carry an `Include Rule: Category = …` filter —
which behaved unreliably on behavioral algorithms (Item Affinity falls back
to a popularity bucket that ignores Include Rules, so blog Recipes ended
up returning career items).

MCP ships a native Item Type called `Blog` (`EVGBlog`) with first-class
System attributes for blog posts (`publishedDate`, `subtitle`,
`modifiedTime`, `tags` typed as `Author`/`Keyword`) and built-in Recipe
hooks (`tools.global.blogs`, `tools.global.authors`). We now:

  * Career → keep `Article` (no native equivalent), drop the redundant
    `categories=career` column, drop the `[Carreira]` prefix from `name`.
  * Blog   → use the native `Blog` Item Type, drop `[Blog]` prefix, no
    `categories` column, use the Blog-native `publishedDate` System attr.

The Recipe `Related Blog Articles` then becomes just
`restrictItemType("Blog")` with no Include Rule, and `Related Career
Experiences` becomes just `restrictItemType("Article")` with no Include
Rule. The Item Type alone is the discriminator.

Schemas
-------

`articles.csv` (Item Type `Article`, 28 career rows):

    id, catalogObjectType,
    attribute:name, attribute:url, attribute:description,
    attribute:company, attribute:startDate, attribute:endDate,
    attribute:location, attribute:industry, attribute:seniority,
    attribute:published, attribute:topics, attribute:technologies

`blogs.csv` (Item Type `Blog`, 25 blog rows):

    id, catalogObjectType,
    attribute:name, attribute:url, attribute:description,
    attribute:publishedDate, attribute:topics

Conventions
-----------
* `id`                : `<YYYYMM>-<slug>` (must match the value our
                        sitemap.js sends in `data-article-id`, so beacon-
                        driven views and feed-driven items reconcile on
                        the same key).
* `catalogObjectType` : Required by `CatalogObjectETL`. `Article` for
                        career rows, `Blog` for blog rows.
* `attribute:name`    : NO prefix. The Item Type already discriminates.
* `attribute:published`     : System Date attribute on Article. Career
                              start date.
* `attribute:publishedDate` : System Date attribute on Blog (per MCP
                              docs: "`publishedDate` must be exclusively
                              used for articles and blogs"). Post date.
* `attribute:topics`        : MultiString — pipe-separated
                              (`marketing-tech|consulting`). The ONLY
                              custom attribute we register on the native
                              `Blog` Item Type.
* `attribute:technologies`  : Article-only — plain String, comma-separated
                              so the value is stored as a single literal
                              string matching the beacon shape.
* `attribute:description`   : front matter `description:` if present,
                              otherwise the first ~200 characters of
                              stripped body content.

Usage
-----
    python3 tools/generate_catalog_feed.py

Run from the repo root. Requires PyYAML (`pip install pyyaml`).

Upload each CSV via MCP UI → Feeds Dashboard → Catalog Object ETL. The
production filename pattern MUST start with `catalog-object-` (e.g.
`catalog-object-articles-YYYYMMDD.csv`) to match the production regex;
the Gear Editor /testing/ path is dry-run only and never persists.
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
ARTICLES_OUT = REPO_ROOT / "catalog" / "articles.csv"
BLOGS_OUT = REPO_ROOT / "catalog" / "blogs.csv"

SITE_URL = "https://www.bombonato.net"

FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
FILENAME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$")


ARTICLES_FIELDNAMES = [
    "id",
    "catalogObjectType",
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

BLOGS_FIELDNAMES = [
    "id",
    "catalogObjectType",
    "attribute:name",
    "attribute:url",
    "attribute:description",
    "attribute:publishedDate",
    "attribute:topics",
]


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
        "attribute:name": fm.get("title", "") or "",
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
        "catalogObjectType": "Blog",
        "attribute:name": fm.get("title", "") or "",
        "attribute:url": url,
        "attribute:description": description,
        "attribute:publishedDate": publish_date,
        "attribute:topics": joined_list(fm, "topics", sep="|"),
    }


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=fieldnames,
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    article_rows: list[dict] = []
    blog_rows: list[dict] = []

    for path in sorted(CAREER_DIR.glob("*.md")):
        fm, body = parse_post(path)
        if fm is None:
            continue
        row = build_row_career(path, fm, body or "")
        if row:
            article_rows.append(row)

    for path in sorted(BLOG_DIR.glob("*.md")):
        fm, body = parse_post(path)
        if fm is None:
            continue
        row = build_row_blog(path, fm, body or "")
        if row:
            blog_rows.append(row)

    write_csv(ARTICLES_OUT, ARTICLES_FIELDNAMES, article_rows)
    write_csv(BLOGS_OUT, BLOGS_FIELDNAMES, blog_rows)

    print(
        f"Generated {ARTICLES_OUT.relative_to(REPO_ROOT)} "
        f"with {len(article_rows)} career rows."
    )
    print(
        f"Generated {BLOGS_OUT.relative_to(REPO_ROOT)} "
        f"with {len(blog_rows)} blog rows."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
