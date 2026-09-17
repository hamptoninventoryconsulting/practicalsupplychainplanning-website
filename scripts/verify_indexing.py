#!/usr/bin/env python3
"""Generate and verify robots.txt / sitemap.xml for this static site.

Cloudflare Pages serves unmatched paths as /index.html (SPA fallback) unless a
top-level 404.html exists. crawler files must therefore be real static assets,
and the sitemap must list pages that actually exist in the repo.

Usage:
  python3 scripts/verify_indexing.py           # check committed files
  python3 scripts/verify_indexing.py --write   # regenerate sitemap.xml, then check
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_ORIGIN = "https://practicalsupplychainplanning.com"
SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
SITEMAP_PATH = ROOT / "sitemap.xml"
ROBOTS_PATH = ROOT / "robots.txt"
MANIFEST_PATH = ROOT / "blog" / ".posts.manifest.json"
NOT_FOUND_PATH = ROOT / "404.html"

CORE_PAGES = (
    "/",
    "/about/",
    "/blog/",
)


def public_file_for_path(url_path: str) -> Path:
    if url_path == "/":
        return ROOT / "index.html"
    relative = url_path.strip("/")
    return ROOT / relative / "index.html"


def parse_published_date(value: str) -> str:
    text = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised published_datetime: {value!r}")


def published_posts() -> list[dict]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    posts = []
    missing = []
    for post in manifest.get("posts", []):
        slug = post.get("slug")
        if not slug:
            continue
        article = ROOT / "blog" / slug / "index.html"
        if not article.is_file():
            missing.append(slug)
            continue
        posts.append(
            {
                "path": f"/blog/{slug}/",
                "lastmod": parse_published_date(post["published_datetime"]),
            }
        )
    if missing:
        raise FileNotFoundError(
            "blog/.posts.manifest.json lists slugs with no article file: "
            + ", ".join(missing)
        )
    return posts


def expected_urls() -> list[dict]:
    urls = [{"loc": f"{SITE_ORIGIN}{path}"} for path in CORE_PAGES]
    for post in published_posts():
        urls.append(
            {
                "loc": f"{SITE_ORIGIN}{post['path']}",
                "lastmod": post["lastmod"],
            }
        )
    return urls


def render_sitemap(urls: list[dict]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<urlset xmlns="{SITEMAP_NS}">',
    ]
    for entry in urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{entry['loc']}</loc>")
        if entry.get("lastmod"):
            lines.append(f"    <lastmod>{entry['lastmod']}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    lines.append("")
    return "\n".join(lines)


def write_sitemap() -> None:
    SITEMAP_PATH.write_text(render_sitemap(expected_urls()), encoding="utf-8")


def fail(message: str, errors: list[str]) -> None:
    errors.append(message)


def verify_robots(errors: list[str]) -> None:
    if not ROBOTS_PATH.is_file():
        fail("robots.txt is missing from the site root", errors)
        return
    text = ROBOTS_PATH.read_text(encoding="utf-8")
    if "<html" in text.lower():
        fail("robots.txt looks like HTML, not a robots file", errors)
    if "Disallow: /" in text and "Allow: /" not in text:
        fail("robots.txt disallows crawling the whole site", errors)
    sitemap_line = f"Sitemap: {SITE_ORIGIN}/sitemap.xml"
    if sitemap_line not in text:
        fail(f"robots.txt must contain `{sitemap_line}`", errors)


def verify_404(errors: list[str]) -> None:
    if not NOT_FOUND_PATH.is_file():
        fail(
            "404.html is missing; Cloudflare Pages will SPA-fallback missing "
            "paths to /index.html",
            errors,
        )
        return
    text = NOT_FOUND_PATH.read_text(encoding="utf-8")
    if "noindex" not in text.lower():
        fail("404.html should include a noindex robots directive", errors)


def parse_committed_sitemap(errors: list[str]) -> list[dict]:
    if not SITEMAP_PATH.is_file():
        fail("sitemap.xml is missing from the site root", errors)
        return []
    text = SITEMAP_PATH.read_text(encoding="utf-8")
    if "<html" in text.lower():
        fail("sitemap.xml looks like HTML, not XML", errors)
        return []
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        fail(f"sitemap.xml is not well-formed XML: {exc}", errors)
        return []
    if root.tag != f"{{{SITEMAP_NS}}}urlset":
        fail("sitemap.xml root element must be urlset in the sitemaps.org namespace", errors)
        return []
    urls = []
    for url_el in root.findall(f"{{{SITEMAP_NS}}}url"):
        loc_el = url_el.find(f"{{{SITEMAP_NS}}}loc")
        lastmod_el = url_el.find(f"{{{SITEMAP_NS}}}lastmod")
        if loc_el is None or not (loc_el.text or "").strip():
            fail("sitemap.xml contains a url entry without loc", errors)
            continue
        entry = {"loc": loc_el.text.strip()}
        if lastmod_el is not None and lastmod_el.text:
            entry["lastmod"] = lastmod_el.text.strip()
        urls.append(entry)
    return urls


def verify_sitemap(errors: list[str]) -> None:
    expected = expected_urls()
    expected_by_loc = {entry["loc"]: entry for entry in expected}
    committed = parse_committed_sitemap(errors)
    if not committed:
        return

    generated = render_sitemap(expected)
    actual = SITEMAP_PATH.read_text(encoding="utf-8")
    if actual != generated:
        fail(
            "sitemap.xml is out of date; run `python3 scripts/verify_indexing.py --write`",
            errors,
        )

    committed_locs = [entry["loc"] for entry in committed]
    if len(committed_locs) != len(set(committed_locs)):
        fail("sitemap.xml contains duplicate loc values", errors)

    for loc in committed_locs:
        if not loc.startswith(f"{SITE_ORIGIN}/"):
            fail(f"sitemap loc is not on the canonical host: {loc}", errors)
            continue
        url_path = loc[len(SITE_ORIGIN) :]
        page = public_file_for_path(url_path)
        if not page.is_file():
            fail(f"sitemap loc has no static page file: {loc} (expected {page})", errors)
        if loc not in expected_by_loc:
            fail(f"sitemap loc is not a public indexable page: {loc}", errors)

    for loc in expected_by_loc:
        if loc not in committed_locs:
            fail(f"sitemap is missing public page {loc}", errors)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="Regenerate sitemap.xml from the blog manifest and static pages",
    )
    args = parser.parse_args()
    if args.write:
        write_sitemap()
        print(f"Wrote {SITEMAP_PATH.relative_to(ROOT)}")

    errors: list[str] = []
    try:
        verify_robots(errors)
        verify_404(errors)
        verify_sitemap(errors)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        fail(str(exc), errors)
    if errors:
        print("Indexing file checks failed:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        return 1
    url_count = len(expected_urls())
    print(f"Indexing files OK ({url_count} sitemap URLs).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
