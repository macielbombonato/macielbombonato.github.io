#!/usr/bin/env python3
"""
Collapse `technologies` into `tags` in every career post front-matter.

This is the v3 → v4 catalog migration, executed once. It does two
things to every `career/_posts/*.md` file:

  (a) MERGE technologies INTO tags. Anything in `technologies:` is
      union-merged into `tags:` (case-sensitive, order-preserving).
      After the merge the `technologies:` line is REMOVED entirely.
      Goal: a single flat vocabulary for free-form labels.

  (b) DEDUPE tags vs topics. The 5 slugs that double as `topics`
      AND `tags` on the same post are dropped from `tags:` (they
      stay in `topics:`). This is the audit_taxonomy.py "Padrão 1"
      cleanup. Without this step the related-items recipe would
      score those posts twice for the same concept.

The script is IDEMPOTENT: running it twice on already-migrated posts
is a no-op. Posts that never had `technologies:` are still scanned
for the topic-vs-tag dedupe (step b).

Dry-run by default. Pass --apply to actually write.

Usage:
    python3 tools/migrate_technologies_to_tags.py            # dry-run
    python3 tools/migrate_technologies_to_tags.py --apply    # write
    python3 tools/migrate_technologies_to_tags.py --verbose  # full diff

Why text-based (not YAML round-trip):
    PyYAML's emit loses inline array syntax (`tags: [a, b]` becomes
    block style) and strips comments. ruamel.yaml would round-trip
    properly but adds a dependency. Since the front-matter format
    in this repo is uniform (one inline array per field), a focused
    line-based rewrite preserves the file byte-for-byte except for
    the two targeted lines. Posts that violate the assumed format
    raise a hard error rather than silently rewriting them.
"""

from __future__ import annotations

import argparse
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

# Posts to process. Career has both jobs (drop `technologies:` and
# de-duplicate `tags` against `topics`); blog never had a
# `technologies:` field so only the dedupe step runs there.
POST_DIRS = [CAREER_DIR, BLOG_DIR]

FRONT_MATTER_RE = re.compile(r"^(---\s*\n)(.*?)(\n---\s*\n)", re.DOTALL)
INLINE_LIST_RE = re.compile(
    r"^(?P<indent>\s*)(?P<key>tags|technologies|topics)\s*:\s*\[(?P<items>[^\]]*)\]\s*$"
)


class FormatError(Exception):
    """Raised when a post has a YAML shape this script can't safely rewrite."""


def parse_front_matter(text: str) -> tuple[dict, str, str, str]:
    """Return (fm_dict, header, fm_body_raw, footer).

    Splits the file so we can edit `fm_body_raw` as plain text while
    keeping byte-perfect headers/footers and post body.
    """
    match = FRONT_MATTER_RE.match(text)
    if not match:
        raise FormatError("missing or malformed YAML front-matter")
    header, fm_body, footer = match.group(1), match.group(2), match.group(3)
    rest = text[match.end():]
    try:
        fm = yaml.safe_load(fm_body) or {}
    except yaml.YAMLError as exc:
        raise FormatError(f"YAML parse error: {exc}")
    return fm, header, fm_body, footer + rest


def coerce_list(value) -> list[str]:
    """List|CSV-string|None → list[str], stripped and de-empty-ed."""
    if not value:
        return []
    if isinstance(value, str):
        items = [v.strip() for v in value.split(",")]
    else:
        items = [str(v).strip() for v in value]
    return [v for v in items if v]


def dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def compute_new_tags(
    existing_tags: list[str],
    existing_tech: list[str],
    existing_topics: list[str],
) -> tuple[list[str], list[str], list[str]]:
    """Return (new_tags, added_from_tech, removed_because_topic).

    Merge order: existing tags first (preserves their order),
    then anything from technologies that isn't already there.
    Finally drop anything that's also in topics.
    """
    topic_set = set(existing_topics)
    merged = dedupe_preserve_order(existing_tags + existing_tech)
    new_tags = [t for t in merged if t not in topic_set]

    existing_tags_set = set(existing_tags)
    existing_tech_set = set(existing_tech)
    added_from_tech = [
        t for t in existing_tech if t not in existing_tags_set and t not in topic_set
    ]
    removed_because_topic = [
        t for t in existing_tags if t in topic_set and t not in existing_tech_set
    ]
    return new_tags, added_from_tech, removed_because_topic


def format_inline_list(items: list[str]) -> str:
    """Mirror the existing inline style: `[a, b, c]` (single-space comma)."""
    return "[" + ", ".join(items) + "]"


def rewrite_front_matter(fm_body: str, new_tags: list[str]) -> str:
    """Return a new front-matter body with:
       - `tags:` replaced (inline list, new value)
       - `technologies:` line removed entirely
       Everything else stays byte-identical.

    Raises FormatError if the post uses YAML block style for these
    keys — we don't try to rewrite those (too risky); the human
    needs to manually convert to inline first.
    """
    new_lines: list[str] = []
    saw_tags = False
    for line in fm_body.split("\n"):
        match = INLINE_LIST_RE.match(line)
        if not match:
            if re.match(r"^\s*(tags|technologies)\s*:\s*$", line):
                raise FormatError(
                    "block-style YAML list for tags/technologies "
                    "is not supported — convert to inline `[a, b]` first"
                )
            new_lines.append(line)
            continue
        key = match.group("key")
        if key == "tags":
            indent = match.group("indent")
            new_lines.append(f"{indent}tags: {format_inline_list(new_tags)}")
            saw_tags = True
        elif key == "technologies":
            continue
        else:
            new_lines.append(line)

    if not saw_tags and new_tags:
        new_lines.insert(
            len(new_lines), f"tags: {format_inline_list(new_tags)}"
        )

    return "\n".join(new_lines)


def process_post(path: Path, *, apply: bool, verbose: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    try:
        fm, header, fm_body, footer = parse_front_matter(text)
    except FormatError as exc:
        return {
            "path": path,
            "status": "error",
            "error": str(exc),
        }

    existing_tags = coerce_list(fm.get("tags"))
    existing_tech = coerce_list(fm.get("technologies"))
    existing_topics = coerce_list(fm.get("topics"))

    new_tags, added_from_tech, removed_because_topic = compute_new_tags(
        existing_tags, existing_tech, existing_topics
    )

    has_tech_line = "technologies" in fm
    tags_changed = new_tags != existing_tags

    if not has_tech_line and not tags_changed:
        return {"path": path, "status": "skip", "reason": "already-migrated"}

    try:
        new_fm_body = rewrite_front_matter(fm_body, new_tags)
    except FormatError as exc:
        return {"path": path, "status": "error", "error": str(exc)}

    new_text = header + new_fm_body + footer

    if new_text == text:
        return {"path": path, "status": "skip", "reason": "noop"}

    if apply:
        path.write_text(new_text, encoding="utf-8")

    return {
        "path": path,
        "status": "applied" if apply else "would-apply",
        "added_from_tech": added_from_tech,
        "removed_because_topic": removed_because_topic,
        "dropped_technologies_field": has_tech_line,
        "old_tags": existing_tags,
        "new_tags": new_tags,
        "verbose": verbose,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to disk. Without this flag, runs as dry-run.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print before/after tags for each changed post.",
    )
    args = parser.parse_args()

    posts: list[Path] = []
    for directory in POST_DIRS:
        if directory.exists():
            posts.extend(sorted(directory.glob("*.md")))
    if not posts:
        print(f"No posts found under {[str(d) for d in POST_DIRS]}. Nothing to do.")
        return 0

    results = [process_post(p, apply=args.apply, verbose=args.verbose) for p in posts]

    counts = {
        "applied": 0,
        "would-apply": 0,
        "skip": 0,
        "error": 0,
    }
    for r in results:
        counts[r["status"]] += 1

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"\n=== {mode} — migrate_technologies_to_tags ===\n")

    for r in results:
        rel = r["path"].relative_to(REPO_ROOT)
        if r["status"] == "error":
            print(f"  ✗ {rel}   ERROR: {r['error']}")
        elif r["status"] == "skip":
            if args.verbose:
                print(f"  · {rel}   skip ({r['reason']})")
        else:
            arrow = "→" if not args.apply else "✓"
            tech_note = (
                "+drop technologies"
                if r["dropped_technologies_field"]
                else ""
            )
            added = (
                f"+from-tech: {', '.join(r['added_from_tech'])}"
                if r["added_from_tech"]
                else ""
            )
            removed = (
                f"-was-topic: {', '.join(r['removed_because_topic'])}"
                if r["removed_because_topic"]
                else ""
            )
            detail_parts = [p for p in (tech_note, added, removed) if p]
            detail = "  ".join(detail_parts) if detail_parts else "(tags reorder)"
            print(f"  {arrow} {rel}   {detail}")
            if args.verbose:
                print(f"      before tags: {r['old_tags']}")
                print(f"      after  tags: {r['new_tags']}")

    print()
    print(
        f"Summary: {counts['applied']} applied, "
        f"{counts['would-apply']} would-apply, "
        f"{counts['skip']} skipped, "
        f"{counts['error']} errors"
    )
    if counts["error"]:
        return 1
    if not args.apply and counts["would-apply"]:
        print("\nDry-run only. Re-run with --apply to write changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
