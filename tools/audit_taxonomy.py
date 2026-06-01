#!/usr/bin/env python3
"""
Audit topics / technologies / tags across career and blog posts.

The MCP v3 architecture wants a **unified vocabulary**: a slug used as
a `topic` on a career post should ALSO be a `topic` on a blog post
(not a `tag`), and `python` should never be a `topic` here and a `tag`
there. This script surfaces three classes of inconsistency:

  1. CROSS-FIELD COLLISIONS
     The same slug appears in different fields. Example:
         python  →  tag in career, topic in blog
     These break the "topics are topics everywhere" contract and
     usually force the Recipe to do String-attribute comparison
     across split data instead of relational lookups.

  2. NEAR-DUPLICATES (within the same field)
     Slugs that almost certainly mean the same thing but were
     entered differently. Example:
         micro-services  vs  microservices
         node-js         vs  nodejs
     The MCP catalog treats them as different items and the
     Recipe never matches them together.

  3. ASYMMETRY (informational)
     Slugs that only appear on career or only on blog. Not
     necessarily a bug — career and blog naturally cover
     different ground — but it helps you spot a topic you
     forgot to retro-fit on the blog side after introducing
     it on career, and vice-versa.

Usage:
    python3 tools/audit_taxonomy.py            # full report
    python3 tools/audit_taxonomy.py --json     # machine-readable
    python3 tools/audit_taxonomy.py --collisions-only

Exit code is non-zero ONLY when cross-field collisions exist (1).
Near-duplicates are surfaced as warnings — they often include
legitimate variants (e.g. `windows` and `windows-98` aren't the
same thing), so failing on them would force a noisy allowlist.
Wire collisions into CI when you want a vocabulary lint.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from difflib import SequenceMatcher
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

FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

FIELDS = ("topics", "technologies", "tags")
SOURCES = ("career", "blog")

# Two slugs are flagged as near-duplicates when their similarity is
# at or above this threshold AFTER aggressive normalization. 0.86 is
# the empirical sweet spot — high enough to catch `micro-services` /
# `microservices`, low enough to skip unrelated short words.
NEAR_DUP_RATIO = 0.86


def parse_front_matter(path: Path) -> dict | None:
    """Return the YAML front-matter dict, or None if missing/invalid."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        sys.stderr.write(f"Cannot read {path} (non-UTF8)\n")
        return None
    match = FRONT_MATTER_RE.match(text)
    if not match:
        return None
    try:
        return yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError as exc:
        sys.stderr.write(f"YAML error in {path.name}: {exc}\n")
        return None


def coerce_list(value) -> list[str]:
    """Tolerate list[str], CSV string, or None. Return normalized list."""
    if not value:
        return []
    if isinstance(value, str):
        items = [v.strip() for v in value.split(",")]
    else:
        items = [str(v).strip() for v in value]
    return [v for v in items if v]


def normalize_for_compare(slug: str) -> str:
    """Aggressive normalization for near-dup detection.

    Drops dashes/dots/underscores and lowercases. Keeps the original
    slug as-is in the report; this is only used as a comparison key.
    """
    return re.sub(r"[-_.\s]+", "", slug.lower())


def collect() -> dict:
    """Walk both content trees and bucket every slug by (source, field).

    Returns a structure that maps:
        result["index"][slug][field][source] = sorted list of post ids
    """
    index: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

    def ingest(source: str, directory: Path) -> None:
        if not directory.exists():
            return
        for path in sorted(directory.glob("*.md")):
            fm = parse_front_matter(path)
            if fm is None:
                continue
            post_id = path.stem
            for field in FIELDS:
                for slug in coerce_list(fm.get(field)):
                    index[slug][field][source].append(post_id)

    ingest("career", CAREER_DIR)
    ingest("blog", BLOG_DIR)
    return {"index": index}


def find_cross_field_collisions(index: dict) -> list[dict]:
    """A slug used in two or more different FIELDS is a collision."""
    out: list[dict] = []
    for slug, by_field in index.items():
        fields_used = sorted(by_field.keys())
        if len(fields_used) >= 2:
            out.append(
                {
                    "slug": slug,
                    "fields": fields_used,
                    "occurrences": {
                        field: {
                            source: sorted(posts)
                            for source, posts in by_source.items()
                        }
                        for field, by_source in by_field.items()
                    },
                }
            )
    return sorted(out, key=lambda x: x["slug"])


def find_near_duplicates(index: dict) -> list[dict]:
    """Within each FIELD, group slugs that normalize to the same key
    OR have similarity ratio >= NEAR_DUP_RATIO. Reports clusters of 2+.
    """
    out: list[dict] = []

    by_field: dict[str, list[str]] = defaultdict(list)
    for slug, fields in index.items():
        for field in fields:
            by_field[field].append(slug)

    for field, slugs in by_field.items():
        slugs = sorted(set(slugs))
        keys: dict[str, list[str]] = defaultdict(list)
        for slug in slugs:
            keys[normalize_for_compare(slug)].append(slug)

        seen: set[frozenset[str]] = set()
        for key, members in keys.items():
            if len(members) >= 2:
                cluster = frozenset(members)
                if cluster not in seen:
                    seen.add(cluster)
                    out.append(
                        {
                            "field": field,
                            "kind": "same-normalized-key",
                            "key": key,
                            "members": sorted(members),
                        }
                    )

        normalized = [(slug, normalize_for_compare(slug)) for slug in slugs]
        for i in range(len(normalized)):
            slug_a, norm_a = normalized[i]
            for j in range(i + 1, len(normalized)):
                slug_b, norm_b = normalized[j]
                if norm_a == norm_b:
                    continue
                ratio = SequenceMatcher(None, norm_a, norm_b).ratio()
                if ratio >= NEAR_DUP_RATIO and min(len(norm_a), len(norm_b)) >= 4:
                    cluster = frozenset((slug_a, slug_b))
                    if cluster not in seen:
                        seen.add(cluster)
                        out.append(
                            {
                                "field": field,
                                "kind": "high-similarity",
                                "ratio": round(ratio, 3),
                                "members": sorted([slug_a, slug_b]),
                            }
                        )
    return sorted(
        out,
        key=lambda x: (x["field"], x.get("key", ""), tuple(x["members"])),
    )


def find_asymmetry(index: dict) -> dict:
    """For each FIELD, partition slugs into career-only / blog-only / both."""
    by_field: dict[str, dict] = {
        field: {"career_only": [], "blog_only": [], "both": []}
        for field in FIELDS
    }
    for slug, fields in index.items():
        for field, by_source in fields.items():
            in_career = "career" in by_source
            in_blog = "blog" in by_source
            if in_career and in_blog:
                by_field[field]["both"].append(slug)
            elif in_career:
                by_field[field]["career_only"].append(slug)
            elif in_blog:
                by_field[field]["blog_only"].append(slug)
    for field in FIELDS:
        for bucket in by_field[field]:
            by_field[field][bucket].sort()
    return by_field


def section(title: str, char: str = "─") -> str:
    return f"\n{title}\n{char * len(title)}"


def format_text(report: dict, *, collisions_only: bool) -> str:
    lines: list[str] = []
    counts = report["counts"]

    lines.append(section("Vocabulary audit summary", "═"))
    lines.append(
        f"  Career posts scanned: {counts['career_posts']}    "
        f"Blog posts scanned: {counts['blog_posts']}"
    )
    lines.append(
        f"  Unique slugs (any field): {counts['unique_slugs']}    "
        f"Collisions: {len(report['cross_field_collisions'])}    "
        f"Near-duplicate clusters: {len(report['near_duplicates'])}"
    )

    lines.append(section("1. Cross-field collisions (same slug in different fields)"))
    if not report["cross_field_collisions"]:
        lines.append("  none ✓")
    else:
        for hit in report["cross_field_collisions"]:
            lines.append(f"  • {hit['slug']!r}  → fields: {', '.join(hit['fields'])}")
            for field, sources in hit["occurrences"].items():
                for source, posts in sources.items():
                    sample = ", ".join(posts[:3])
                    more = f" (+{len(posts) - 3} more)" if len(posts) > 3 else ""
                    lines.append(
                        f"      [{field}/{source}] {len(posts)} post(s): "
                        f"{sample}{more}"
                    )

    if collisions_only:
        return "\n".join(lines) + "\n"

    lines.append(
        section("2. Near-duplicates within the same field (likely the same thing)")
    )
    if not report["near_duplicates"]:
        lines.append("  none ✓")
    else:
        for cluster in report["near_duplicates"]:
            if cluster["kind"] == "same-normalized-key":
                detail = f"normalize→{cluster['key']!r}"
            else:
                detail = f"similarity={cluster['ratio']}"
            lines.append(
                f"  • [{cluster['field']}] {', '.join(repr(m) for m in cluster['members'])}"
                f"  ({detail})"
            )

    lines.append(section("3. Asymmetry per field (informational)"))
    for field in FIELDS:
        bucket = report["asymmetry"][field]
        lines.append(
            f"  [{field}]  both={len(bucket['both'])}  "
            f"career_only={len(bucket['career_only'])}  "
            f"blog_only={len(bucket['blog_only'])}"
        )
        if bucket["career_only"]:
            preview = ", ".join(bucket["career_only"][:8])
            more = (
                f" (+{len(bucket['career_only']) - 8} more)"
                if len(bucket["career_only"]) > 8
                else ""
            )
            lines.append(f"      career_only: {preview}{more}")
        if bucket["blog_only"]:
            preview = ", ".join(bucket["blog_only"][:8])
            more = (
                f" (+{len(bucket['blog_only']) - 8} more)"
                if len(bucket["blog_only"]) > 8
                else ""
            )
            lines.append(f"      blog_only:   {preview}{more}")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON instead of the text report.",
    )
    parser.add_argument(
        "--collisions-only",
        action="store_true",
        help="Skip near-duplicates and asymmetry sections (text mode).",
    )
    args = parser.parse_args()

    data = collect()
    index = data["index"]

    career_posts = (
        sum(1 for _ in CAREER_DIR.glob("*.md")) if CAREER_DIR.exists() else 0
    )
    blog_posts = sum(1 for _ in BLOG_DIR.glob("*.md")) if BLOG_DIR.exists() else 0

    report = {
        "counts": {
            "career_posts": career_posts,
            "blog_posts": blog_posts,
            "unique_slugs": len(index),
        },
        "cross_field_collisions": find_cross_field_collisions(index),
        "near_duplicates": find_near_duplicates(index),
        "asymmetry": find_asymmetry(index),
    }

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(format_text(report, collisions_only=args.collisions_only))

    return 1 if report["cross_field_collisions"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
