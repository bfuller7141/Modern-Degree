#!/usr/bin/env python3
"""
Import Google Business Profile reviews into src/content/reviews/*.md.

This script uses the official Google Business Profile API (v4):
GET https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/reviews
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple


STAR_MAP = {
    "ONE": 1,
    "TWO": 2,
    "THREE": 3,
    "FOUR": 4,
    "FIVE": 5,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Google reviews and add missing ones as markdown files."
    )
    parser.add_argument(
        "--parent",
        default=os.environ.get("GBP_PARENT", ""),
        help="Google Business Profile parent path, e.g. accounts/123456/locations/987654",
    )
    parser.add_argument(
        "--access-token",
        default=os.environ.get("GOOGLE_ACCESS_TOKEN", ""),
        help="OAuth access token with business.manage scope (or set GOOGLE_ACCESS_TOKEN).",
    )
    parser.add_argument(
        "--out-dir",
        default="src/content/reviews",
        help="Directory where .md review files are written.",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=50,
        help="API page size (max 50).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be added without writing files.",
    )
    return parser.parse_args()


def normalize(s: str) -> str:
    return " ".join(s.strip().lower().split())


def slugify(s: str) -> str:
    ascii_s = (
        unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_s).strip("-")
    return slug or "review"


def yaml_quote(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def parse_existing_review_keys(out_dir: Path) -> Set[Tuple[str, str]]:
    keys: Set[Tuple[str, str]] = set()
    if not out_dir.exists():
        return keys

    frontmatter_re = re.compile(r"^---\s*\n(.*?)\n---", re.DOTALL)
    author_re = re.compile(r'^author:\s*"(.*)"\s*$', re.MULTILINE)
    text_re = re.compile(r"^text:\s*\|\s*\n((?:[ \t].*\n?)*)", re.MULTILINE)

    for path in out_dir.glob("*.md"):
        raw = path.read_text(encoding="utf-8", errors="ignore")
        m = frontmatter_re.search(raw)
        if not m:
            continue
        fm = m.group(1)
        author_m = author_re.search(fm)
        text_m = text_re.search(fm)
        if not author_m or not text_m:
            continue

        author = author_m.group(1).strip()
        text_block = text_m.group(1)
        text_lines = []
        for line in text_block.splitlines():
            text_lines.append(line[2:] if line.startswith("  ") else line.lstrip())
        text = "\n".join(text_lines).strip()

        if author and text:
            keys.add((normalize(author), normalize(text)))

    return keys


def api_get(url: str, access_token: str) -> Dict:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def fetch_all_reviews(parent: str, access_token: str, page_size: int) -> List[Dict]:
    reviews: List[Dict] = []
    page_token = ""
    base_url = f"https://mybusiness.googleapis.com/v4/{parent}/reviews"

    while True:
        params = {
            "pageSize": str(min(max(page_size, 1), 50)),
            "orderBy": "updateTime desc",
        }
        if page_token:
            params["pageToken"] = page_token

        url = f"{base_url}?{urllib.parse.urlencode(params)}"
        payload = api_get(url, access_token)
        reviews.extend(payload.get("reviews", []))
        page_token = payload.get("nextPageToken", "")
        if not page_token:
            break

    return reviews


def rating_to_int(star_rating: str) -> int:
    if not star_rating:
        return 5
    if star_rating.isdigit():
        return max(1, min(5, int(star_rating)))
    return STAR_MAP.get(star_rating.upper(), 5)


def review_date(review: Dict) -> str:
    for key in ("createTime", "updateTime"):
        value = review.get(key)
        if value and len(value) >= 10:
            return value[:10]
    return dt.date.today().isoformat()


def build_markdown(author: str, rating: int, date: str, text: str) -> str:
    indented_text = "\n".join(f"  {line}" if line else "  " for line in text.splitlines())
    return (
        "---\n"
        f'author: "{yaml_quote(author)}"\n'
        f"rating: {rating}\n"
        f'date: "{date}"\n'
        "text: |\n"
        f"{indented_text}\n"
        "---\n"
    )


def unique_file_path(out_dir: Path, author: str, review_id: str, text: str) -> Path:
    slug = slugify(author)
    digest = hashlib.sha1(f"{review_id}|{text}".encode("utf-8")).hexdigest()[:8]
    candidate = out_dir / f"{slug}-{digest}.md"
    if not candidate.exists():
        return candidate

    i = 2
    while True:
        candidate = out_dir / f"{slug}-{digest}-{i}.md"
        if not candidate.exists():
            return candidate
        i += 1


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out_dir)

    if not args.parent:
        print("Missing --parent (or GBP_PARENT env var).", file=sys.stderr)
        return 2
    if not args.access_token:
        print("Missing --access-token (or GOOGLE_ACCESS_TOKEN env var).", file=sys.stderr)
        return 2

    out_dir.mkdir(parents=True, exist_ok=True)
    existing_keys = parse_existing_review_keys(out_dir)

    try:
        reviews = fetch_all_reviews(args.parent, args.access_token, args.page_size)
    except Exception as exc:
        print(f"Failed to fetch reviews: {exc}", file=sys.stderr)
        return 1

    added = 0
    skipped = 0

    for review in reviews:
        author = (review.get("reviewer") or {}).get("displayName", "").strip() or "Google Reviewer"
        text = (review.get("comment") or "").strip()
        if not text:
            skipped += 1
            continue

        key = (normalize(author), normalize(text))
        if key in existing_keys:
            skipped += 1
            continue

        rating = rating_to_int(str(review.get("starRating", "")))
        date = review_date(review)
        review_id = str(review.get("reviewId", ""))
        md = build_markdown(author, rating, date, text)
        path = unique_file_path(out_dir, author, review_id, text)

        if args.dry_run:
            print(f"[DRY RUN] Would add: {path}")
        else:
            path.write_text(md, encoding="utf-8")
            print(f"Added: {path}")

        existing_keys.add(key)
        added += 1

    print(f"Done. Added {added} new review file(s), skipped {skipped}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

