#!/usr/bin/env python3
"""
Generate the four CSV catalog feeds for Marketing Cloud Personalization (MCP):

    catalog/articles.csv      →  Item Type `Article`  (career experiences)
    catalog/blogs.csv         →  Item Type `Blog`     (native Blog Post)
    catalog/topics.csv        →  Item Type `Topics`   (custom, curated taxonomy)
    catalog/tags.csv          →  Item Type `Tags`     (custom, free-form labels)

`catalog/technologies.csv` is ALSO emitted by this script but in
DRAIN-ONLY mode: every previously-known Technologies id is written
back as `archived=true`. This is how we retire the `Technologies`
Item Type in v4 — upload the file once, the MCP UI archives all
items, then the Item Type can be deleted manually.

Why FOUR (was FIVE) Item Types and not attributes?
--------------------------------------------------
We migrated through four architectures before landing here:

  v1  →  one `Article` Item Type, blog vs career discriminated by the
         polymorphic `categories` column. Behavioral Recipes (Item
         Affinity / Recently Viewed) silently bypass Include Rules
         when falling back to the popularity bucket, so the "Related
         Blog Articles" Recipe kept returning career items.

  v2  →  split into two Item Types (`Article` for career + native
         `Blog`). Resolved the Item Type mismatch but `topics` and
         `technologies` were still String/MultiString attributes,
         which means "more by this Topic" Recipes had to do string
         comparison on attribute values — fragile, no first-class
         relational filter.

  v3  →  promote `topics`, `technologies`, and `tags` to their own
         Item Types connected to Article/Blog via
         `relatedCatalogObjects`. The audit_taxonomy.py tool then
         showed 22 cross-field collisions between `technologies`
         (career-only) and `tags` (career+blog) — the same slug
         (`java`, `aws`, `docker` …) was a tech on career posts
         and a tag on blog posts. That split a single concept
         across two Item Types and prevented Recipes from
         scoring blog↔career affinity correctly.

  v4 (current) →  collapse `technologies` into `tags`. The catalog
         now has FOUR Item Types — one flat free-form vocabulary
         (`Tags`) for both content types, plus the curated `Topics`
         set. `technologies.csv` is drained (all archived=true)
         and the Item Type is retired from MCP. The v3 split is
         documented as anti-pattern in AGENTS.md.

Recipes become:
  - "Related Career Experiences" : restrictItemType("Article") with
    an Include Rule filtering on related Topics/Tags
  - "Related Blog Articles"      : restrictItemType("Blog") with an
    Include Rule filtering on related Topics

Lifecycle archive (the IMPORTANT new behavior)
-----------------------------------------------
The generator now diffs against the PREVIOUS run of each CSV. Any
id that was present last time but is absent now (post deleted,
topic removed from `_data/topics.yml`, slug dropped from front
matter) is re-emitted with `attribute:archived=true`. The MCP ETL
then archives that item on the next upload — no more manual
archiving in the MCP UI to clean up after the source data shrinks.

The current set of active ids stays at `attribute:archived=false`.
This intentionally REACTIVATES any item that may have been manually
archived in the MCP UI but still exists in the source — the feed is
the source of truth.

To intentionally retire an item permanently:
  1. Remove it from source (post file, _data/topics.yml, etc.)
  2. Run this script — lifecycle archive emits the row as archived
  3. Upload the CSV — MCP archives the item
  4. (optional) delete the row from the CSV on the run after that

Schemas
-------
`articles.csv` (Item Type `Article`, career rows):

    id, catalogObjectType,
    attribute:name, attribute:url, attribute:imageUrl, attribute:description,
    attribute:company, attribute:startDate, attribute:endDate,
    attribute:location, attribute:industry, attribute:seniority,
    attribute:published, attribute:archived,
    relatedCatalogObject:Topics,
    relatedCatalogObject:Tags

`blogs.csv` (Item Type `Blog`, blog rows):

    id, catalogObjectType,
    attribute:name, attribute:url, attribute:imageUrl, attribute:description,
    attribute:date, attribute:archived,
    relatedCatalogObject:Topics,
    relatedCatalogObject:Tags

`topics.csv` (Item Type `Topics`, sourced from `_data/topics.yml`),
`tags.csv` (Item Type `Tags`, sourced from career + blog `tags:`),
`technologies.csv` (Item Type `Technologies`, drain-only):

    id, catalogObjectType, attribute:name, attribute:archived

Conventions
-----------
* `id`                : `<YYYYMM>-<slug>` for Article/Blog. Slug for
                        Topics/Tags/Technologies. Must match what the
                        sitemap sends in `data-article-id` (Article/
                        Blog) and in `relatedCatalogObjects.<Type>`
                        (Topics/Tags) so beacon-driven and feed-
                        driven items reconcile.
* `catalogObjectType` : Required by `CatalogObjectETL`. The Item Type
                        is the discriminator — feeds are leaf-typed,
                        so no Jackson `type` discriminator is needed.
* `attribute:name`    : NO prefix. The Item Type already discriminates.
* `attribute:published`     : System Date on Article. Career start date.
* `attribute:date`          : System Date on Blog (per the current
                              Blog Item Type config in this dataset).
* `attribute:archived`      : System Boolean — `false` for active rows;
                              `true` for rows the lifecycle archive
                              reincarnated for soft-deletion.
* `relatedCatalogObject:<Type>` : pipe-separated IDs that already exist
                        in the referenced Item Type. The ETL REJECTS
                        rows referencing unknown IDs, so load the
                        Topics/Tags feeds BEFORE the Article/Blog
                        feeds. Same convention as the built-in
                        `categories` column.

Migration order (read the README — this matters!)
-------------------------------------------------
  1. (v4 one-time): create Item Types `Topics`, `Tags` in MCP UI
     if not already present. `Technologies` was already in MCP
     since v3 — keep it for the drain upload below.
  2. Upload `topics.csv`, `tags.csv` (creates / reactivates items)
  3. Upload `articles.csv`, `blogs.csv` (creates the relations)
  4. Upload `technologies.csv` ONCE — this is the drain feed; every
     row is `archived=true`. After ingest, manually delete the
     `Technologies` Item Type from MCP UI (Settings → Catalog →
     Item Types). Subsequent runs still emit the file but you can
     skip the upload — content is identical (all archived).
  5. Paste `mcp/sitemap.js` into MCP UI → Save → Execute → Publish

Skipping step 2 will make every row in step 3 fail with "Related
catalog object not found" and the feed will reject the entire batch.

Usage
-----
    python3 tools/generate_catalog_feed.py

Run from the repo root. Requires PyYAML (`pip install pyyaml`).

Upload each CSV via MCP UI → Feeds Dashboard → Catalog Object ETL.
Production filename pattern MUST start with `catalog-object-`
(e.g. `catalog-object-tags-YYYYMMDD.csv`).
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
TOPICS_YML = REPO_ROOT / "_data" / "topics.yml"

ARTICLES_OUT = REPO_ROOT / "catalog" / "articles.csv"
BLOGS_OUT = REPO_ROOT / "catalog" / "blogs.csv"
TOPICS_OUT = REPO_ROOT / "catalog" / "topics.csv"
TECHNOLOGIES_OUT = REPO_ROOT / "catalog" / "technologies.csv"
TAGS_OUT = REPO_ROOT / "catalog" / "tags.csv"

SITE_URL = "https://www.bombonato.net"

# Absolute fallback logo, mirrors `site.default_logo` resolved against
# `site.url` (see _config.yml). Used for `attribute:imageUrl` whenever a
# post has no `logo:` front-matter URL, so MCP always stores an absolute,
# resolvable image. Keep in sync with FALLBACK_LOGO in
# assets/js/mcp-related-renderer.js and `data-article-image` in the layouts.
DEFAULT_LOGO_URL = f"{SITE_URL}/assets/img/logo-fallback.svg"

FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
FILENAME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$")


ARTICLES_FIELDNAMES = [
    "id",
    "catalogObjectType",
    "attribute:name",
    "attribute:url",
    "attribute:imageUrl",
    "attribute:description",
    "attribute:company",
    "attribute:startDate",
    "attribute:endDate",
    "attribute:location",
    "attribute:industry",
    "attribute:seniority",
    "attribute:published",
    "attribute:archived",
    "relatedCatalogObject:Topics",
    "relatedCatalogObject:Tags",
]

BLOGS_FIELDNAMES = [
    "id",
    "catalogObjectType",
    "attribute:name",
    "attribute:url",
    "attribute:imageUrl",
    "attribute:description",
    "attribute:date",
    "attribute:archived",
    "relatedCatalogObject:Topics",
    "relatedCatalogObject:Tags",
]

REFERENCE_FIELDNAMES = [
    "id",
    "catalogObjectType",
    "attribute:name",
    "attribute:archived",
]

# Active rows are emitted as `archived=false`. Sending the value
# explicitly (instead of leaving the column out) is intentional: it
# REACTIVATES any item that may have been manually archived in the
# MCP Catalog UI in the past. The feed is the source of truth.
ARCHIVED_FALSE = "false"

# Lifecycle-archive rows are emitted as `archived=true`. The generator
# diffs against the previous CSV and re-emits as archived any id that
# was active last time but is absent now (post deleted, topic removed
# from _data/topics.yml, slug dropped from front matter, etc.). The
# MCP ETL then archives the item — no need to touch the MCP UI.
ARCHIVED_TRUE = "true"

# Slugs whose auto-humanized label looks wrong. Override to the
# canonical industry spelling. Anything NOT in this map gets
# `humanize_slug()` applied (capitalize words, replace `-` with space).
NAME_OVERRIDES = {
    # ── Java family ─────────────────────────────────────────────
    "j2ee": "Java EE",
    "j2se": "Java SE",
    "javaee": "Java EE",
    "jdbc": "JDBC",
    "jboss": "JBoss",
    "ejb": "EJB",
    "jms": "JMS",
    "jpa": "JPA",
    "jsf": "JSF",
    "jsp": "JSP",
    "jstl": "JSTL",
    "jython": "Jython",
    "java-web-start": "Java Web Start",
    # ── .NET / Microsoft ────────────────────────────────────────
    "dotnet": ".NET",
    "office": "Microsoft Office",
    "ms-project": "MS Project",
    "windows": "Windows",
    "windows-98": "Windows 98",
    "excel": "Excel",
    "dotnet-to-java": ".NET to Java",
    # ── AWS ─────────────────────────────────────────────────────
    "aws": "AWS",
    "ec2": "Amazon EC2",
    "s3": "Amazon S3",
    "rds": "Amazon RDS",
    "ecs": "Amazon ECS",
    "elastic-beanstalk": "Elastic Beanstalk",
    # ── Salesforce ──────────────────────────────────────────────
    "salesforce": "Salesforce",
    "marketing-cloud": "Marketing Cloud",
    "marketing-cloud-personalization": "Marketing Cloud Personalization",
    "data-cloud": "Data Cloud",
    "agentforce": "Agentforce",
    # ── SAP / ERP / commerce ────────────────────────────────────
    "sap-commerce": "SAP Commerce",
    "hybris": "Hybris",
    "oracle": "Oracle",
    "oracle-forms": "Oracle Forms",
    "oracle-reports": "Oracle Reports",
    "plsql": "PL/SQL",
    "mysql": "MySQL",
    # ── Frameworks ──────────────────────────────────────────────
    "spring": "Spring",
    "spring-boot": "Spring Boot",
    "spring-mvc": "Spring MVC",
    "spring-batch": "Spring Batch",
    "spring-config-server": "Spring Cloud Config",
    "spring-data": "Spring Data",
    "spring-security": "Spring Security",
    "doctrine": "Doctrine",
    "symfony": "Symfony",
    "struts": "Struts",
    "swing": "Swing",
    "awt": "AWT",
    "jquery": "jQuery",
    "javascript": "JavaScript",
    "nodejs": "Node.js",
    "bootstrap": "Bootstrap",
    "html": "HTML",
    "css": "CSS",
    "xmlbeans": "XMLBeans",
    "rmi": "RMI",
    "dwr": "DWR",
    "servlets": "Servlets",
    "wsad": "WSAD",
    "rad": "IBM RAD",
    "websphere": "WebSphere",
    "ibm-mq": "IBM MQ",
    "mq-series": "IBM MQ Series",
    "itext": "iText",
    "tomcat": "Apache Tomcat",
    "composer": "Composer",
    "php": "PHP",
    "python": "Python",
    "java": "Java",
    # ── Mobile / clients ────────────────────────────────────────
    "ios": "iOS",
    "android": "Android",
    "pos": "POS",
    # ── DevOps / CI / Cloud ─────────────────────────────────────
    "docker": "Docker",
    "jenkins": "Jenkins",
    "teamcity": "TeamCity",
    "bitbucket": "Bitbucket",
    "jira": "Jira",
    "sonarqube": "SonarQube",
    "udeploy": "uDeploy",
    "azure": "Azure",
    "azure-devops": "Azure DevOps",
    "kyma": "Kyma",
    # ── Modeling / docs ─────────────────────────────────────────
    "uml": "UML",
    "bpmn": "BPMN",
    "jude": "JUDE",
    "bizagi": "Bizagi",
    "enterprise-architect": "Enterprise Architect",
    "eclipse": "Eclipse",
    # ── Other ───────────────────────────────────────────────────
    "ai": "AI",
    "scrum": "Scrum",
    "liferay": "Liferay",
    "elastic": "Elastic",
    "micro-services": "Microservices",
    "video-conference": "Video Conference",
    "internet": "Internet",
    "foundation": "Foundation",
    "computer-basics": "Computer Basics",
    "second-level-support": "Second-Level Support",
    "tech-lead": "Tech Lead",
    "project-management": "Project Management",
    "vendor-management": "Vendor Management",
    "software-factory": "Software Factory",
    "legacy-systems": "Legacy Systems",
    "data-extraction": "Data Extraction",
    "technical-education": "Technical Education",
    "e-learning": "E-Learning",
    "email-marketing": "Email Marketing",
    "open-source": "Open Source",
    "back-office": "Back Office",
    "backoffice": "Backoffice",
    "public-sector": "Public Sector",
    "loyalty-program": "Loyalty Program",
    "ibm": "IBM",
}


def humanize_slug(slug: str) -> str:
    """Convert a kebab-case slug to a Title-Cased label.

    Used as the default when a slug is NOT in `NAME_OVERRIDES`.
    `marketing-tech` → `Marketing Tech`, `tooling` → `Tooling`.
    """
    if slug in NAME_OVERRIDES:
        return NAME_OVERRIDES[slug]
    return " ".join(word.capitalize() for word in slug.split("-"))


def parse_post(path: Path) -> tuple[dict | None, str | None]:
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


def extract_id_and_url(path: Path) -> tuple[str | None, str | None]:
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


def list_field(fm: dict, key: str) -> list[str]:
    """Read a list-typed front-matter field, normalizing to list[str].

    Tolerates the field being absent, a YAML list, or a CSV string.
    """
    values = fm.get(key) or []
    if isinstance(values, str):
        values = [v.strip() for v in values.split(",") if v.strip()]
    return [str(v).strip() for v in values if str(v).strip()]


def pipe(values: list[str]) -> str:
    """Join references for a `relatedCatalogObject:*` CSV column.

    MCP's CatalogObjectETL expects pipe `|` as the separator for
    related-catalog-object reference lists, regardless of how many
    references each row carries (0, 1, or N — same separator).
    """
    return "|".join(values)


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
    assert match  # FILENAME_RE already matched in extract_id_and_url
    year, month, day, _ = match.groups()
    start_date = f"{year}-{month}-{day}"

    description = fm.get("description") or strip_to_description(body)

    return {
        "id": item_id,
        "catalogObjectType": "Article",
        "attribute:name": fm.get("title", "") or "",
        "attribute:url": url,
        "attribute:imageUrl": fm.get("logo") or DEFAULT_LOGO_URL,
        "attribute:description": description,
        "attribute:company": fm.get("company", "") or "",
        "attribute:startDate": start_date,
        "attribute:endDate": normalize_end_date(fm.get("end")),
        "attribute:location": fm.get("location", "") or "",
        "attribute:industry": fm.get("industry", "") or "",
        "attribute:seniority": fm.get("seniority", "") or "",
        "attribute:published": start_date,
        "attribute:archived": ARCHIVED_FALSE,
        "relatedCatalogObject:Topics": pipe(list_field(fm, "topics")),
        "relatedCatalogObject:Tags": pipe(list_field(fm, "tags")),
    }


def build_row_blog(path: Path, fm: dict, body: str) -> dict | None:
    item_id, url = extract_id_and_url(path)
    if not item_id:
        return None

    match = FILENAME_RE.match(path.name)
    assert match
    year, month, day, _ = match.groups()
    publish_date = f"{year}-{month}-{day}"

    description = fm.get("description") or strip_to_description(body)

    return {
        "id": item_id,
        "catalogObjectType": "Blog",
        "attribute:name": fm.get("title", "") or "",
        "attribute:url": url,
        "attribute:imageUrl": fm.get("logo") or DEFAULT_LOGO_URL,
        "attribute:description": description,
        "attribute:date": publish_date,
        "attribute:archived": ARCHIVED_FALSE,
        "relatedCatalogObject:Topics": pipe(list_field(fm, "topics")),
        "relatedCatalogObject:Tags": pipe(list_field(fm, "tags")),
    }


def read_existing_ids(path: Path) -> set[str]:
    """Read the `id` column of an existing CSV. Returns an empty set
    when the file does not exist yet (first run on this dataset).

    Used by the lifecycle-archive layer to compute the set of items
    that were active in the previous generation and need to be
    re-emitted as `archived=true` because they no longer exist in
    the source.
    """
    if not path.exists():
        return set()
    with path.open(encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        return {row["id"] for row in reader if row.get("id")}


def with_lifecycle_archive(
    active_rows: list[dict],
    csv_path: Path,
    archived_row_for,
) -> list[dict]:
    """Append archive-true rows for every id that disappeared since
    the previous run of this CSV.

    `archived_row_for(slug)` is a callable that knows how to build
    a minimal valid row for a given slug — required because Article
    and Blog rows need different placeholder columns than reference
    Item Types (Topics/Tags/Technologies).
    """
    active_ids = {row["id"] for row in active_rows}
    previous_ids = read_existing_ids(csv_path)
    archived_ids = previous_ids - active_ids
    if not archived_ids:
        return active_rows
    archived_rows = [archived_row_for(slug) for slug in sorted(archived_ids)]
    return active_rows + archived_rows


def empty_article_row(slug: str) -> dict:
    """Placeholder Article row for lifecycle archive."""
    return {
        "id": slug,
        "catalogObjectType": "Article",
        "attribute:name": "",
        "attribute:url": "",
        "attribute:imageUrl": "",
        "attribute:description": "",
        "attribute:company": "",
        "attribute:startDate": "",
        "attribute:endDate": "",
        "attribute:location": "",
        "attribute:industry": "",
        "attribute:seniority": "",
        "attribute:published": "",
        "attribute:archived": ARCHIVED_TRUE,
        "relatedCatalogObject:Topics": "",
        "relatedCatalogObject:Tags": "",
    }


def empty_blog_row(slug: str) -> dict:
    """Placeholder Blog row for lifecycle archive."""
    return {
        "id": slug,
        "catalogObjectType": "Blog",
        "attribute:name": "",
        "attribute:url": "",
        "attribute:imageUrl": "",
        "attribute:description": "",
        "attribute:date": "",
        "attribute:archived": ARCHIVED_TRUE,
        "relatedCatalogObject:Topics": "",
        "relatedCatalogObject:Tags": "",
    }


def empty_reference_row(object_type: str):
    """Build an empty-row factory for a reference Item Type.

    Returns a function `slug -> row` because each Item Type needs
    its own `catalogObjectType` baked in, and `humanize_slug` is
    used to give the archived row a sensible display name (handy
    when browsing the MCP catalog during cleanup).
    """
    def _factory(slug: str) -> dict:
        return {
            "id": slug,
            "catalogObjectType": object_type,
            "attribute:name": humanize_slug(slug),
            "attribute:archived": ARCHIVED_TRUE,
        }
    return _factory


def load_topics_from_yaml() -> list[dict]:
    """Load curated topic taxonomy from `_data/topics.yml`.

    Uses the YAML-supplied PT-BR label as `attribute:name` so the
    MCP catalog displays the friendly label (e.g. "Arquitetura"
    instead of "architecture"). The id keeps the slug so it
    matches what the beacon sends and what the article/blog feeds
    reference.
    """
    if not TOPICS_YML.exists():
        sys.stderr.write(f"Missing {TOPICS_YML} — cannot build topics feed.\n")
        return []
    data = yaml.safe_load(TOPICS_YML.read_text(encoding="utf-8")) or {}
    raw = data.get("topics") or {}
    return [
        {
            "id": key,
            "catalogObjectType": "Topics",
            "attribute:name": label,
            "attribute:archived": ARCHIVED_FALSE,
        }
        for key, label in raw.items()
    ]


def build_reference_rows(
    ids: set[str], object_type: str
) -> list[dict]:
    """Build a Topics/Tags CSV row set for ACTIVE items only.

    Sorted for stable diffs. `humanize_slug` provides the default
    label, overridable per slug via `NAME_OVERRIDES`. Lifecycle
    archive (with_lifecycle_archive) appends archived rows on top.
    """
    return [
        {
            "id": slug,
            "catalogObjectType": object_type,
            "attribute:name": humanize_slug(slug),
            "attribute:archived": ARCHIVED_FALSE,
        }
        for slug in sorted(ids)
    ]


def build_technologies_drain_rows() -> list[dict]:
    """v3→v4 transition: re-emit every Technologies id from the
    previous run as `archived=true`. Once this file is uploaded
    once to MCP and the Item Type is manually deleted from the UI,
    subsequent generations still produce the same file (idempotent)
    but the upload becomes a no-op.

    Returns [] on a brand-new dataset that never had a Technologies
    Item Type — nothing to drain.
    """
    previous_ids = read_existing_ids(TECHNOLOGIES_OUT)
    if not previous_ids:
        return []
    factory = empty_reference_row("Technologies")
    return [factory(slug) for slug in sorted(previous_ids)]


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
    tags_seen: set[str] = set()

    for path in sorted(CAREER_DIR.glob("*.md")):
        fm, body = parse_post(path)
        if fm is None:
            continue
        row = build_row_career(path, fm, body or "")
        if row:
            article_rows.append(row)
            tags_seen.update(list_field(fm, "tags"))

    for path in sorted(BLOG_DIR.glob("*.md")):
        fm, body = parse_post(path)
        if fm is None:
            continue
        row = build_row_blog(path, fm, body or "")
        if row:
            blog_rows.append(row)
            tags_seen.update(list_field(fm, "tags"))

    topics_rows = load_topics_from_yaml()
    tags_rows = build_reference_rows(tags_seen, "Tags")

    article_rows = with_lifecycle_archive(
        article_rows, ARTICLES_OUT, empty_article_row,
    )
    blog_rows = with_lifecycle_archive(
        blog_rows, BLOGS_OUT, empty_blog_row,
    )
    topics_rows = with_lifecycle_archive(
        topics_rows, TOPICS_OUT, empty_reference_row("Topics"),
    )
    tags_rows = with_lifecycle_archive(
        tags_rows, TAGS_OUT, empty_reference_row("Tags"),
    )
    technologies_rows = build_technologies_drain_rows()

    write_csv(ARTICLES_OUT, ARTICLES_FIELDNAMES, article_rows)
    write_csv(BLOGS_OUT, BLOGS_FIELDNAMES, blog_rows)
    write_csv(TOPICS_OUT, REFERENCE_FIELDNAMES, topics_rows)
    write_csv(TAGS_OUT, REFERENCE_FIELDNAMES, tags_rows)
    write_csv(TECHNOLOGIES_OUT, REFERENCE_FIELDNAMES, technologies_rows)

    def summarize(rows: list[dict]) -> str:
        active = sum(1 for r in rows if r.get("attribute:archived") == ARCHIVED_FALSE)
        archived = sum(1 for r in rows if r.get("attribute:archived") == ARCHIVED_TRUE)
        return f"{len(rows)} rows ({active} active, {archived} archived)"

    rel = lambda p: p.relative_to(REPO_ROOT)
    print(f"Generated {rel(ARTICLES_OUT)}      {summarize(article_rows)}")
    print(f"Generated {rel(BLOGS_OUT)}         {summarize(blog_rows)}")
    print(f"Generated {rel(TOPICS_OUT)}        {summarize(topics_rows)}")
    print(f"Generated {rel(TAGS_OUT)}          {summarize(tags_rows)}")
    print(f"Generated {rel(TECHNOLOGIES_OUT)}  {summarize(technologies_rows)} [DRAIN]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
