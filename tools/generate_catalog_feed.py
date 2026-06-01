#!/usr/bin/env python3
"""
Generate the five CSV catalog feeds for Marketing Cloud Personalization (MCP):

    catalog/articles.csv      →  Item Type `Article`       (career experiences)
    catalog/blogs.csv         →  Item Type `Blog`          (native Blog Post)
    catalog/topics.csv        →  Item Type `Topics`        (custom, ~10 items)
    catalog/technologies.csv  →  Item Type `Technologies`  (custom, ~100 items)
    catalog/tags.csv          →  Item Type `Tags`          (custom, ~170 items)

Why FIVE Item Types and not attributes?
---------------------------------------
We migrated through three architectures before landing here:

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

  v3 (current) →  promote `topics`, `technologies`, and `tags` to
         their own Item Types and connect them to Article/Blog via
         `relatedCatalogObjects` (the MCP-native relational primitive).
         Recipes can now filter by membership in a related catalog
         object set, which is a first-class graph query — robust and
         no longer fooled by string equality on a MultiString.

Recipes become:
  - "Related Career Experiences" : restrictItemType("Article") with
    an Include Rule filtering on related Topics/Technologies
  - "Related Blog Articles"      : restrictItemType("Blog") with an
    Include Rule filtering on related Topics

Schemas
-------

`articles.csv` (Item Type `Article`, ~28 career rows):

    id, catalogObjectType,
    attribute:name, attribute:url, attribute:description,
    attribute:company, attribute:startDate, attribute:endDate,
    attribute:location, attribute:industry, attribute:seniority,
    attribute:published,
    relatedCatalogObject:Topics,
    relatedCatalogObject:Technologies,
    relatedCatalogObject:Tags

`blogs.csv` (Item Type `Blog`, ~25 blog rows):

    id, catalogObjectType,
    attribute:name, attribute:url, attribute:description,
    attribute:publishedDate,
    relatedCatalogObject:Topics,
    relatedCatalogObject:Tags

`topics.csv` (Item Type `Topics`, sourced from `_data/topics.yml`):

    id, catalogObjectType, attribute:name

`technologies.csv` (Item Type `Technologies`, sourced from career
front matter):

    id, catalogObjectType, attribute:name

`tags.csv` (Item Type `Tags`, sourced from BOTH career and blog
front matter):

    id, catalogObjectType, attribute:name

Conventions
-----------
* `id`                : `<YYYYMM>-<slug>` for Article/Blog. Slug for
                        Topics/Technologies/Tags. Must match what the
                        sitemap sends in `data-article-id` (Article/
                        Blog) and in `relatedCatalogObjects.<Type>`
                        (Topics/Technologies/Tags) so beacon-driven
                        and feed-driven items reconcile.
* `catalogObjectType` : Required by `CatalogObjectETL`. The Item Type
                        is the discriminator — feeds are leaf-typed,
                        so no Jackson `type` discriminator is needed.
* `attribute:name`    : NO prefix. The Item Type already discriminates.
* `attribute:published`     : System Date on Article. Career start date.
* `attribute:publishedDate` : System Date on Blog (per MCP docs).
* `relatedCatalogObject:<Type>` : pipe-separated IDs that already exist
                        in the referenced Item Type. The ETL REJECTS
                        rows referencing unknown IDs, so load the
                        Topics/Technologies/Tags feeds BEFORE the
                        Article/Blog feeds. Same convention as the
                        built-in `categories` column.

Migration order (read the README — this matters!)
-------------------------------------------------
  1. Create the Item Types in MCP UI: `Topics`, `Technologies`, `Tags`
     (no custom attributes — `id` and `name` are the system fields)
  2. Upload `topics.csv`, `technologies.csv`, `tags.csv` (creates items)
  3. Upload `articles.csv`, `blogs.csv` (creates the relations)
  4. Paste `mcp/sitemap.js` into MCP UI → Save → Execute → Publish

Skipping step 2 will make every row in step 3 fail with "Related
catalog object not found" and the feed will reject the entire batch.

Usage
-----
    python3 tools/generate_catalog_feed.py

Run from the repo root. Requires PyYAML (`pip install pyyaml`).

Upload each CSV via MCP UI → Feeds Dashboard → Catalog Object ETL.
Production filename pattern MUST start with `catalog-object-`
(e.g. `catalog-object-technologies-YYYYMMDD.csv`).
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
    "relatedCatalogObject:Topics",
    "relatedCatalogObject:Technologies",
    "relatedCatalogObject:Tags",
]

BLOGS_FIELDNAMES = [
    "id",
    "catalogObjectType",
    "attribute:name",
    "attribute:url",
    "attribute:description",
    "attribute:publishedDate",
    "relatedCatalogObject:Topics",
    "relatedCatalogObject:Tags",
]

REFERENCE_FIELDNAMES = [
    "id",
    "catalogObjectType",
    "attribute:name",
]

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
        "attribute:description": description,
        "attribute:company": fm.get("company", "") or "",
        "attribute:startDate": start_date,
        "attribute:endDate": normalize_end_date(fm.get("end")),
        "attribute:location": fm.get("location", "") or "",
        "attribute:industry": fm.get("industry", "") or "",
        "attribute:seniority": fm.get("seniority", "") or "",
        "attribute:published": start_date,
        "relatedCatalogObject:Topics": pipe(list_field(fm, "topics")),
        "relatedCatalogObject:Technologies": pipe(list_field(fm, "technologies")),
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
        "attribute:description": description,
        "attribute:publishedDate": publish_date,
        "relatedCatalogObject:Topics": pipe(list_field(fm, "topics")),
        "relatedCatalogObject:Tags": pipe(list_field(fm, "tags")),
    }


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
        }
        for key, label in raw.items()
    ]


def build_reference_rows(
    ids: set[str], object_type: str
) -> list[dict]:
    """Build a Topics/Technologies/Tags CSV row set.

    Sorted for stable diffs. `humanize_slug` provides the default
    label, overridable per slug via `NAME_OVERRIDES`.
    """
    return [
        {
            "id": slug,
            "catalogObjectType": object_type,
            "attribute:name": humanize_slug(slug),
        }
        for slug in sorted(ids)
    ]


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
    technologies_seen: set[str] = set()
    tags_seen: set[str] = set()

    for path in sorted(CAREER_DIR.glob("*.md")):
        fm, body = parse_post(path)
        if fm is None:
            continue
        row = build_row_career(path, fm, body or "")
        if row:
            article_rows.append(row)
            technologies_seen.update(list_field(fm, "technologies"))
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
    technologies_rows = build_reference_rows(technologies_seen, "Technologies")
    tags_rows = build_reference_rows(tags_seen, "Tags")

    write_csv(ARTICLES_OUT, ARTICLES_FIELDNAMES, article_rows)
    write_csv(BLOGS_OUT, BLOGS_FIELDNAMES, blog_rows)
    write_csv(TOPICS_OUT, REFERENCE_FIELDNAMES, topics_rows)
    write_csv(TECHNOLOGIES_OUT, REFERENCE_FIELDNAMES, technologies_rows)
    write_csv(TAGS_OUT, REFERENCE_FIELDNAMES, tags_rows)

    rel = lambda p: p.relative_to(REPO_ROOT)
    print(f"Generated {rel(ARTICLES_OUT)}     ({len(article_rows)} career rows)")
    print(f"Generated {rel(BLOGS_OUT)}        ({len(blog_rows)} blog rows)")
    print(f"Generated {rel(TOPICS_OUT)}       ({len(topics_rows)} topic items)")
    print(f"Generated {rel(TECHNOLOGIES_OUT)} ({len(technologies_rows)} technology items)")
    print(f"Generated {rel(TAGS_OUT)}         ({len(tags_rows)} tag items)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
