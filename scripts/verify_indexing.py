#!/usr/bin/env python3
"""Verify robots.txt / sitemap.xml and page basics for the Eleventy build.

Cloudflare Pages serves unmatched paths as /index.html (SPA fallback) unless a
top-level 404.html exists. Crawler files must therefore be real files in the
build output, and the sitemap must list pages that exist in `_site`.

The sitemap is owned by Eleventy (`src/sitemap.njk`). This script checks the
built files; it does not write `sitemap.xml`.

Usage:
  npm run build
  python3 scripts/verify_indexing.py
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "_site"
SITE_ORIGIN = "https://practicalsupplychainplanning.com"
SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
SITEMAP_PATH = SITE / "sitemap.xml"
ROBOTS_PATH = SITE / "robots.txt"
POSTS_DIR = ROOT / "src" / "blog" / "posts"
NOT_FOUND_PATH = SITE / "404.html"
REDIRECTS_SOURCE = ROOT / "_redirects"
REDIRECTS_BUILT = SITE / "_redirects"
MIDDLEWARE_PATH = ROOT / "functions" / "_middleware.js"
SITE_DATA_PATH = ROOT / "src" / "_data" / "site.js"
CANONICAL_RE = re.compile(
    r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']',
    re.I,
)
REFRESH_RE = re.compile(r'<meta\s+http-equiv=["\']refresh["\']', re.I)
CSS_RE = re.compile(r'/assets/styles\.css\?v=([^"\']+)')
H1_RE = re.compile(r"<h1\b", re.I)

CORE_PAGES = (
    "/",
    "/about/",
    "/blog/",
    "/learn/safety-stock-simulator/",
)

CANONICAL_PAGES = (
    ("about/index.html", f"{SITE_ORIGIN}/about/"),
    ("blog/index.html", f"{SITE_ORIGIN}/blog/"),
    ("learn/safety-stock-simulator/index.html", f"{SITE_ORIGIN}/learn/safety-stock-simulator/"),
)

LEGACY_PATHS = (
    "about/index.html",
    "404.html",
    "index.html",
    "sitemap.xml",
    "blog/index.html",
    "blog/index.template.html",
    "blog/article.template.html",
    "blog/.posts.manifest.json",
    "learn/safety-stock-simulator/index.html",
)


def public_file_for_path(url_path: str) -> Path:
    if url_path == "/":
        return SITE / "index.html"
    relative = url_path.strip("/")
    return SITE / relative / "index.html"


def parse_published_date(value: str) -> str:
    text = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised published_datetime: {value!r}")


def css_version() -> str:
    text = SITE_DATA_PATH.read_text(encoding="utf-8")
    match = re.search(r'cssVersion:\s*"([^"]+)"', text)
    if not match:
        raise ValueError("src/_data/site.js is missing cssVersion")
    return match.group(1)


def content_posts() -> list[dict]:
    if not POSTS_DIR.is_dir():
        raise FileNotFoundError(f"missing article content directory: {POSTS_DIR}")
    posts = []
    for path in sorted(POSTS_DIR.glob("*.html")):
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---json\n"):
            raise ValueError(f"{path.relative_to(ROOT)} must start with JSON front matter")
        end = text.find("\n---\n", len("---json\n"))
        if end == -1:
            raise ValueError(f"{path.relative_to(ROOT)} is missing a closing front matter marker")
        data = json.loads(text[len("---json\n") : end])
        published = data.get("published_datetime")
        if not published:
            raise ValueError(f"{path.name} is missing published_datetime")
        posts.append(
            {
                "slug": path.stem,
                "path": f"/blog/{path.stem}/",
                "published_datetime": published,
                "lastmod": parse_published_date(published),
                "author": (data.get("author") or "").strip(),
                "reading_time": (data.get("reading_time") or "").strip(),
            }
        )
    posts.sort(key=lambda post: post["published_datetime"], reverse=True)
    return posts


def expected_urls(posts: list[dict]) -> list[dict]:
    urls = [{"loc": f"{SITE_ORIGIN}{path}"} for path in CORE_PAGES]
    for post in posts:
        urls.append(
            {
                "loc": f"{SITE_ORIGIN}{post['path']}",
                "lastmod": post["lastmod"],
            }
        )
    return urls


def fail(message: str, errors: list[str]) -> None:
    errors.append(message)


def require_build(errors: list[str]) -> bool:
    if SITE.is_dir() and (SITE / "index.html").is_file():
        return True
    fail("built site is missing; run `npm run build` before this check", errors)
    return False


def verify_legacy_sources(errors: list[str]) -> None:
    for relative in LEGACY_PATHS:
        if (ROOT / relative).exists():
            fail(
                f"legacy source still present at {relative}; production HTML comes from Eleventy",
                errors,
            )
    leftover = sorted((ROOT / "blog").glob("*/index.html"))
    for path in leftover:
        fail(
            f"legacy article HTML still present: {path.relative_to(ROOT)}",
            errors,
        )


def verify_robots(errors: list[str]) -> None:
    if not ROBOTS_PATH.is_file():
        fail("robots.txt is missing from _site", errors)
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
            "404.html is missing from _site; Cloudflare Pages will SPA-fallback "
            "missing paths to /index.html",
            errors,
        )
        return
    text = NOT_FOUND_PATH.read_text(encoding="utf-8")
    if "noindex" not in text.lower():
        fail("404.html should include a noindex robots directive", errors)
    if (SITE / "404" / "index.html").is_file():
        fail("404 was emitted as a directory index; it must be _site/404.html", errors)


def parse_sitemap(errors: list[str]) -> list[dict]:
    if not SITEMAP_PATH.is_file():
        fail("sitemap.xml is missing from _site", errors)
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
        if lastmod_el is not None and (lastmod_el.text or "").strip():
            entry["lastmod"] = lastmod_el.text.strip()
        urls.append(entry)
    return urls


def verify_homepage_routing(errors: list[str]) -> None:
    index_html = SITE / "index.html"
    if not index_html.is_file():
        fail("index.html is missing from _site", errors)
    else:
        text = index_html.read_text(encoding="utf-8")
        if REFRESH_RE.search(text):
            fail("index.html still uses a meta-refresh; use HTTP 301 to /about/", errors)
        match = CANONICAL_RE.search(text)
        if match and match.group(1) != f"{SITE_ORIGIN}/about/":
            fail(
                "index.html canonical must be the absolute /about/ URL on the apex host",
                errors,
            )

    if not REDIRECTS_SOURCE.is_file():
        fail("_redirects is missing; Cloudflare Pages needs it for / → /about/ 301", errors)
    else:
        text = REDIRECTS_SOURCE.read_text(encoding="utf-8")
        if not re.search(r"^/\s+/about/\s+301\s*$", text, re.M):
            fail("_redirects must contain `/ /about/ 301`", errors)
        if not REDIRECTS_BUILT.is_file():
            fail("_redirects was not copied into _site", errors)
        elif REDIRECTS_BUILT.read_text(encoding="utf-8") != text:
            fail("_site/_redirects does not match the project _redirects file", errors)

    if (SITE / "functions").exists():
        fail(
            "functions/ was copied into _site; Cloudflare Pages Functions must stay "
            "at the project root, beside the output directory",
            errors,
        )

    if not MIDDLEWARE_PATH.is_file():
        fail(
            "functions/_middleware.js is missing; www → apex and / → /about/ "
            "HTTP 301s are implemented there",
            errors,
        )
        return
    text = MIDDLEWARE_PATH.read_text(encoding="utf-8")
    if "www.${APEX_HOST}" not in text:
        fail("functions/_middleware.js must redirect the www hostname", errors)
    if "/about/" not in text:
        fail("functions/_middleware.js must redirect `/` to `/about/`", errors)


def verify_canonicals(errors: list[str], posts: list[dict]) -> None:
    for relative, expected in CANONICAL_PAGES:
        path = SITE / relative
        if not path.is_file():
            fail(f"missing built page for canonical check: {relative}", errors)
            continue
        text = path.read_text(encoding="utf-8")
        match = CANONICAL_RE.search(text)
        if not match:
            fail(f"{relative} is missing a rel=canonical tag", errors)
            continue
        if match.group(1) != expected:
            fail(
                f"{relative} canonical is {match.group(1)!r}, expected {expected!r}",
                errors,
            )

    for post in posts:
        relative = f"blog/{post['slug']}/index.html"
        path = SITE / relative
        expected = f"{SITE_ORIGIN}{post['path']}"
        if not path.is_file():
            fail(f"missing built article: {relative}", errors)
            continue
        text = path.read_text(encoding="utf-8")
        match = CANONICAL_RE.search(text)
        if not match:
            fail(f"{relative} is missing a rel=canonical tag", errors)
            continue
        href = match.group(1)
        if href != expected:
            fail(f"{relative} canonical is {href!r}, expected {expected!r}", errors)
        h1_count = len(H1_RE.findall(text))
        if h1_count != 1:
            fail(f"{relative} has {h1_count} h1 elements; expected exactly one", errors)


def verify_stylesheet_version(errors: list[str], version: str) -> None:
    expected = f"/assets/styles.css?v={version}"
    html_files = sorted(SITE.rglob("*.html"))
    if not html_files:
        fail("no HTML files were built into _site", errors)
        return
    for path in html_files:
        relative = path.relative_to(SITE).as_posix()
        if relative == "index.html":
            continue
        text = path.read_text(encoding="utf-8")
        found = CSS_RE.findall(text)
        if found != [version]:
            fail(
                f"{relative} stylesheet reference is {found!r}; expected one {expected}",
                errors,
            )


def verify_sitemap(errors: list[str], posts: list[dict]) -> None:
    expected = expected_urls(posts)
    committed = parse_sitemap(errors)
    if not committed:
        return

    committed_locs = [entry["loc"] for entry in committed]
    if len(committed_locs) != len(set(committed_locs)):
        fail("sitemap.xml contains duplicate loc values", errors)

    if [entry["loc"] for entry in committed] != [entry["loc"] for entry in expected]:
        fail(
            "sitemap.xml URLs do not match the public page list "
            "(core pages, simulator, then articles newest first)",
            errors,
        )

    expected_by_loc = {entry["loc"]: entry for entry in expected}
    for entry in committed:
        loc = entry["loc"]
        if not loc.startswith(f"{SITE_ORIGIN}/"):
            fail(f"sitemap loc is not on the canonical host: {loc}", errors)
            continue
        url_path = loc[len(SITE_ORIGIN) :]
        page = public_file_for_path(url_path)
        if not page.is_file():
            fail(f"sitemap loc has no built page file: {loc} (expected {page})", errors)
        wanted = expected_by_loc.get(loc)
        if wanted is None:
            fail(f"sitemap loc is not a public indexable page: {loc}", errors)
            continue
        if wanted.get("lastmod") != entry.get("lastmod"):
            fail(
                f"{loc} lastmod is {entry.get('lastmod')!r}, expected {wanted.get('lastmod')!r}",
                errors,
            )

    simulator = f"{SITE_ORIGIN}/learn/safety-stock-simulator/"
    if simulator not in committed_locs:
        fail(f"sitemap is missing {simulator}", errors)


def verify_listing_fix(errors: list[str], posts: list[dict]) -> None:
    lot = next(
        (post for post in posts if post["slug"] == "how-lot-size-affects-stock-turnover"),
        None,
    )
    if lot is None:
        fail("lot-size article content file is missing", errors)
        return
    if not lot["author"] or not lot["reading_time"]:
        fail(
            "how-lot-size-affects-stock-turnover content is missing author or reading_time",
            errors,
        )

    listing = SITE / "blog" / "index.html"
    if not listing.is_file():
        return
    text = listing.read_text(encoding="utf-8")
    if "/blog/how-lot-size-affects-stock-turnover/" not in text:
        fail("blog listing is missing the lot-size article", errors)
    if "5 min read" not in text or "Daniel Hampton" not in text:
        fail(
            "blog listing should show the lot-size reading time and author from the article page",
            errors,
        )

    manifest_path = SITE / "blog" / ".posts.manifest.json"
    if not manifest_path.is_file():
        fail(
            "built /blog/.posts.manifest.json is missing; assets/blog.js still fetches it",
            errors,
        )
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    slugs = [post.get("slug") for post in manifest.get("posts", [])]
    expected_slugs = [post["slug"] for post in posts]
    if slugs != expected_slugs:
        fail("generated posts manifest slug order does not match the article collection", errors)
    lot_manifest = next(
        (post for post in manifest.get("posts", []) if post.get("slug") == lot["slug"]),
        {},
    )
    if not lot_manifest.get("author") or not lot_manifest.get("reading_time"):
        fail("generated posts manifest is missing lot-size author or reading_time", errors)


def verify_simulator_assets(errors: list[str]) -> None:
    scenarios = SITE / "learn" / "safety-stock-simulator" / "scenarios.json"
    if not scenarios.is_file():
        fail("scenarios.json was not copied into _site", errors)


def main() -> int:
    errors: list[str] = []
    verify_legacy_sources(errors)
    if not require_build(errors):
        print("Indexing file checks failed:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        return 1

    try:
        posts = content_posts()
        version = css_version()
        verify_robots(errors)
        verify_404(errors)
        verify_sitemap(errors, posts)
        verify_homepage_routing(errors)
        verify_canonicals(errors, posts)
        verify_stylesheet_version(errors, version)
        verify_listing_fix(errors, posts)
        verify_simulator_assets(errors)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        fail(str(exc), errors)
    if errors:
        print("Indexing file checks failed:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        return 1
    print(f"Indexing files OK ({len(expected_urls(posts))} sitemap URLs).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
