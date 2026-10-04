#!/usr/bin/env python3
"""Verify robots.txt / sitemap.xml and page basics for the Eleventy build.

Cloudflare Pages serves unmatched paths as /index.html (SPA fallback) unless a
top-level 404.html exists. Crawler files must therefore be real files in the
build output, and the sitemap must list pages that exist in `_site`.

The sitemap is owned by Eleventy (`src/sitemap.njk`). This script checks the
built files; it does not write `sitemap.xml`.

`/welcome/` is the post-purchase page. It must be noindex and must not appear
in the sitemap or in site menus. `/products/`,
`/products/practical-stock-planner/`, `/terms/`, `/refunds/`, `/privacy/`
and `/contact/` are public pages: they are in the sitemap and are not noindex.

`/buy/` and `/pricing/` are retired. Each 301s straight to
`/products/practical-stock-planner/`. Paddle.js loads on that product page
only. `/welcome/` must stay free of Paddle.js.

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
WELCOME_PATH = SITE / "welcome" / "index.html"
WELCOME_LOC = f"{SITE_ORIGIN}/welcome/"
BUY_PATH = SITE / "buy" / "index.html"
BUY_LOC = f"{SITE_ORIGIN}/buy/"
PADDLE_DATA_PATH = ROOT / "src" / "_data" / "paddle.js"
PADDLE_JS_URL = "https://cdn.paddle.com/paddle/v2/paddle.js"
POLICY_PAGES = (
    ("products/index.html", f"{SITE_ORIGIN}/products/"),
    ("products/practical-stock-planner/index.html", f"{SITE_ORIGIN}/products/practical-stock-planner/"),
    ("terms/index.html", f"{SITE_ORIGIN}/terms/"),
    ("refunds/index.html", f"{SITE_ORIGIN}/refunds/"),
    ("privacy/index.html", f"{SITE_ORIGIN}/privacy/"),
    ("contact/index.html", f"{SITE_ORIGIN}/contact/"),
)
NOINDEX_RE = re.compile(
    r'<meta\s+name=["\']robots["\']\s+content=["\'][^"\']*\bnoindex\b',
    re.I,
)
EXPORT_GUIDES_PATH = ROOT / "src" / "_data" / "exportGuides.js"
EXPORT_GUIDE_RE = re.compile(
    r'label:\s*(["\'])(?P<label>.*?)\1\s*,\s*href:\s*(["\'])(?P<href>.*?)\3',
    re.S,
)
REQUIRED_EXPORT_GUIDES = (
    "Export your data from Shopify",
    "Export your data from Xero",
)
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
    "/learn/",
    "/learn/safety-stock-simulator/",
    "/learn/safety-stock-simulator/own-data/",
    "/products/",
    "/products/practical-stock-planner/",
    "/terms/",
    "/refunds/",
    "/privacy/",
    "/contact/",
)

CANONICAL_PAGES = (
    ("index.html", f"{SITE_ORIGIN}/"),
    ("about/index.html", f"{SITE_ORIGIN}/about/"),
    ("blog/index.html", f"{SITE_ORIGIN}/blog/"),
    ("learn/index.html", f"{SITE_ORIGIN}/learn/"),
    ("learn/safety-stock-simulator/index.html", f"{SITE_ORIGIN}/learn/safety-stock-simulator/"),
    (
        "learn/safety-stock-simulator/own-data/index.html",
        f"{SITE_ORIGIN}/learn/safety-stock-simulator/own-data/",
    ),
    ("products/index.html", f"{SITE_ORIGIN}/products/"),
    ("products/practical-stock-planner/index.html", f"{SITE_ORIGIN}/products/practical-stock-planner/"),
    ("terms/index.html", f"{SITE_ORIGIN}/terms/"),
    ("refunds/index.html", f"{SITE_ORIGIN}/refunds/"),
    ("privacy/index.html", f"{SITE_ORIGIN}/privacy/"),
    ("contact/index.html", f"{SITE_ORIGIN}/contact/"),
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
                "title": (data.get("title") or "").strip(),
                "summary": (data.get("summary") or data.get("description") or "").strip(),
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


HOME_TO_ABOUT_RE = re.compile(
    r"^/(?:index\.html)?\s+/about/\s+301\s*$",
    re.M,
)
HOME_COPY = (
    "Practical stock and supply planning",
    "Straight-logic planning for product businesses that buy in stock with lead times.",
    "See pricing and start your free trial",
    "Try the Safety Stock Simulator",
    "Read the blog",
    "Learn by doing",
    "Free tools that show how stock planning works, using clear numbers instead of jargon.",
    "See how demand swings and lead times change the stock you need to hold.",
    "Open the simulator",
    "Run the same calculation on up to 10 of your own items and get the results by email.",
    "Try it with your data",
    "See all learning tools",
    "Latest articles",
    "Plain-English articles on planning stock and supply, each built around one idea.",
    "Read the article",
    "All articles",
    "Planning software for businesses that have outgrown reorder points and spreadsheets. Practical Stock Planner is time-phased MRP. It projects your stock period by period from your inventory data, open purchase orders and forecast, then tells you what to order and when.",
    "Plans period by period, not with a single reorder point",
    "Works from your current stock, open POs and forecast",
    "Imports from Excel (.xlsx) or CSV",
    "Runs on Windows. 14-day free trial, sold worldwide.",
    "Coming soon.",
    "Built by a working planner",
    "I'm Daniel Hampton. I've spent my career planning stock and supply for manufacturing, wholesale, retail and distribution businesses. Practical Supply Chain Planning shares the straightforward methods that work, without the complexity of big ERP systems.",
    "More about me",
)


def verify_homepage_routing(errors: list[str], posts: list[dict]) -> None:
    index_html = SITE / "index.html"
    if not index_html.is_file():
        fail("index.html is missing from _site", errors)
    else:
        text = index_html.read_text(encoding="utf-8")
        if REFRESH_RE.search(text):
            fail("index.html must not use a meta-refresh", errors)
        match = CANONICAL_RE.search(text)
        if not match or match.group(1) != f"{SITE_ORIGIN}/":
            found = match.group(1) if match else None
            fail(
                f"index.html canonical must be {SITE_ORIGIN}/, found {found!r}",
                errors,
            )
        if "<title>Stock &amp; Supply Planning | Practical Supply Chain Planning</title>" not in text:
            fail("index.html title must be the approved home title", errors)
        if (
            '<meta name="description" content="Practical stock and supply planning for businesses that buy in stock. Free learning tools, plain-English articles and Practical Stock Planner."'
            not in text
        ):
            fail("index.html meta description must be the approved home description", errors)
        h1_count = len(H1_RE.findall(text))
        if h1_count != 1:
            fail(f"index.html has {h1_count} h1 elements; expected exactly one", errors)
        if "<h1 class=\"page-title\">Practical stock and supply planning</h1>" not in text:
            fail("index.html h1 must be Practical stock and supply planning", errors)
        if 'class="site-nav__link site-nav__link--active" href="/" aria-current="page"' not in text:
            fail("index.html must mark the Home nav link as the current page", errors)
        if 'href="/about/" aria-current="page"' in text:
            fail("index.html must not mark About as the current page", errors)
        for phrase in HOME_COPY:
            if phrase not in text:
                fail(f"index.html is missing approved copy: {phrase}", errors)
        if 'href="/learn/safety-stock-simulator/"' not in text:
            fail("index.html must link to the Safety Stock Simulator", errors)
        if 'href="/learn/safety-stock-simulator/own-data/"' not in text:
            fail("index.html must link to the own-data Safety Stock Simulator", errors)
        if 'href="/learn/"' not in text:
            fail("index.html must link to /learn/", errors)
        if 'href="/blog/"' not in text:
            fail("index.html must link to /blog/", errors)
        if 'href="/about/"' not in text:
            fail("index.html must link to /about/", errors)
        if 'href="/products/practical-stock-planner/"' not in text:
            fail("index.html must link to the Practical Stock Planner page", errors)
        if 'href="/pricing/"' in text or 'href="/pricing"' in text:
            fail("index.html must not link to /pricing/", errors)
        if re.search(r"\bimporters\b", text, re.I) or re.search(r"small businesses", text, re.I):
            fail("index.html must not say importers or small businesses", errors)
        post_links = re.findall(r'href="(/blog/[^"]+/)"', text)
        expected_posts = [post["path"] for post in posts[:3]]
        if post_links != expected_posts:
            fail(
                f"index.html latest articles are {post_links!r}, expected {expected_posts!r}",
                errors,
            )
        for post in posts[:3]:
            if post["title"] not in text:
                fail(f"index.html is missing latest article title: {post['title']}", errors)
            summary = post["summary"].replace("&", "&amp;")
            if summary not in text:
                fail(f"index.html is missing latest article summary: {post['summary']}", errors)
        if re.search(r"<a\b[^>]*>\s*Coming soon\.", text):
            fail("Coming soon. on the home page must be plain text, not a link", errors)
        allowed_button = '<button class="sim-button" type="submit">Keep me posted</button>'
        buttons = re.findall(r"<button\b[^>]*>[\s\S]*?</button>", text, re.I)
        if buttons != [allowed_button]:
            fail(
                "index.html may only include the Let's keep in touch submit button, found "
                + repr(buttons),
                errors,
            )
        if 'href="/buy/"' in text or 'href="/buy"' in text:
            fail("index.html must not link to /buy/", errors)
        if re.search(
            r"\b\d+\s+[A-Za-z][^,<]{0,40}\b(?:Street|St|Road|Rd|Avenue|Ave)\b",
            text,
        ):
            fail("index.html must not show a street address", errors)

    if not REDIRECTS_SOURCE.is_file():
        fail("_redirects is missing; Cloudflare Pages copies it into the build", errors)
    else:
        text = REDIRECTS_SOURCE.read_text(encoding="utf-8")
        if HOME_TO_ABOUT_RE.search(text):
            fail("_redirects must not redirect / or /index.html to /about/", errors)
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
            "functions/_middleware.js is missing; the www → apex HTTP 301 "
            "is implemented there",
            errors,
        )
        return
    text = MIDDLEWARE_PATH.read_text(encoding="utf-8")
    if "www.${APEX_HOST}" not in text:
        fail("functions/_middleware.js must redirect the www hostname", errors)
    if re.search(r"""pathname\s*=\s*["']/about/["']""", text):
        fail("functions/_middleware.js must not redirect the homepage to /about/", errors)


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


def export_guides() -> list[dict]:
    if not EXPORT_GUIDES_PATH.is_file():
        raise FileNotFoundError("src/_data/exportGuides.js is missing")
    text = EXPORT_GUIDES_PATH.read_text(encoding="utf-8")
    guides = [
        {"label": match.group("label").strip(), "href": match.group("href").strip()}
        for match in EXPORT_GUIDE_RE.finditer(text)
    ]
    labels = [guide["label"] for guide in guides]
    if labels != list(REQUIRED_EXPORT_GUIDES):
        raise ValueError(
            "src/_data/exportGuides.js must list Shopify then Xero, "
            f"with labels {list(REQUIRED_EXPORT_GUIDES)!r}"
        )
    return guides


SMARTSCREEN_COPY = (
    "Windows SmartScreen may show",
    "Windows protected your PC",
    "Unknown publisher",
    "because Practical Stock Planner isn&rsquo;t code-signed yet",
    "More info",
    "Run anyway",
    "The download comes only from practicalsupplychainplanning.com.",
    "Code signing is planned.",
)


def verify_welcome(errors: list[str]) -> None:
    if not WELCOME_PATH.is_file():
        fail("/welcome/ was not built; expected _site/welcome/index.html", errors)
        return

    text = WELCOME_PATH.read_text(encoding="utf-8")
    if not NOINDEX_RE.search(text):
        fail("/welcome/ must include a noindex robots meta tag", errors)
    if "site-nav" in text:
        fail("/welcome/ must not include the site menu", errors)
    if "cdn.paddle.com" in text or re.search(r"<script\b[^>]*paddle\.js", text, re.I):
        fail("/welcome/ must not load Paddle.js", errors)
    if "_ptxn" in text or "localStorage" in text or "sessionStorage" in text:
        fail("/welcome/ must not display or store checkout query parameters", errors)
    if "history.replaceState" not in text:
        fail(
            "/welcome/ must drop checkout query parameters from the address bar "
            "without reading or storing them",
            errors,
        )
    if not re.search(r"<button\b[^>]*\bdisabled\b", text, re.I):
        fail("/welcome/ download control must be a disabled button", errors)
    if re.search(
        r"<a\b[^>]*>[^<]*Download Practical Stock Planner",
        text,
        re.I,
    ):
        fail("/welcome/ download must not be a link", errors)
    if re.search(r'href=["\'][^"\']+\.(?:exe|msi|zip)["\']', text, re.I):
        fail("/welcome/ must not link to a download file", errors)
    if "Coming soon." not in text:
        fail("/welcome/ download must say it is coming soon", errors)
    if "The download will be available here shortly" not in text:
        fail("/welcome/ must say the download will be available shortly", errors)
    if "also email you the link" not in text:
        fail("/welcome/ must say the download link will also be emailed", errors)
    if "Placeholder" in text or "not published yet" in text or "not available to download yet" in text:
        fail("/welcome/ still contains draft placeholder text", errors)
    if re.search(r"14[\s-]days", text, re.I):
        fail(
            "/welcome/ must not state the refund window; that belongs on /refunds/ "
            "when the policy is published",
            errors,
        )
    if "Refund details are on our" not in text or 'href="/refunds/"' not in text:
        fail("/welcome/ must point to the /refunds/ page without restating the policy", errors)
    stylesheet = (ROOT / "assets" / "styles.css").read_text(encoding="utf-8")
    if not re.search(
        r"\.support-email\s*\{[^}]*overflow-wrap:\s*anywhere",
        stylesheet,
    ):
        fail("assets/styles.css must set overflow-wrap: anywhere on .support-email", errors)
    for relative in ("welcome/index.html",) + tuple(path for path, _loc in POLICY_PAGES):
        page = (SITE / relative).read_text(encoding="utf-8")
        for match in re.finditer(
            r"<(\w+)\b([^>]*)>[^<]*support@practicalsupplychainplanning\.com[^<]*</\1>",
            page,
        ):
            if "support-email" not in match.group(2):
                fail(
                    f"{relative} shows the support email without the support-email class",
                    errors,
                )
    guides = export_guides()
    published = [guide for guide in guides if guide["href"]]
    if published:
        if "Getting your data ready" not in text:
            fail("/welcome/ is missing the Getting your data ready section", errors)
    else:
        if "Getting your data ready" in text or "Guide coming soon." in text:
            fail("/welcome/ must hide export guides until they have a URL", errors)
        if "step-by-step guide" in text:
            fail("/welcome/ must not mention an unpublished step-by-step guide", errors)
    if re.search(r"""href=["'](?:|#)["']""", text):
        fail("/welcome/ must not include an empty or hash href", errors)
    for guide in guides:
        label = re.escape(guide["label"])
        linked = re.search(rf"<a\b[^>]*>\s*{label}\s*</a>", text, re.I)
        if guide["href"]:
            expected = (
                rf'<a\b[^>]*\bhref="{re.escape(guide["href"])}"[^>]*>\s*{label}\s*</a>'
            )
            if not re.search(expected, text):
                fail(
                    f"/welcome/ must link {guide['label']!r} to {guide['href']!r}",
                    errors,
                )
        elif linked or guide["label"] in text:
            fail(
                f"/welcome/ must not show {guide['label']!r} until its href is set",
                errors,
            )
    if "[CHECK]" in text or "[PLACEHOLDER]" in text:
        fail("/welcome/ still contains raw [CHECK] or [PLACEHOLDER] draft markers", errors)
    if text.lower().count("<h1") != 1:
        fail("/welcome/ must have exactly one h1", errors)

    sitemap = ""
    if SITEMAP_PATH.is_file():
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
    if WELCOME_LOC in sitemap or "/welcome/" in sitemap:
        fail("/welcome/ must not appear in sitemap.xml", errors)

    for relative in (
        "src/_includes/partials/header.njk",
        "src/_includes/partials/footer.njk",
    ):
        source = (ROOT / relative).read_text(encoding="utf-8")
        if "/welcome/" in source:
            fail(f"/welcome/ is linked from the site menu in {relative}", errors)

    for path in sorted(SITE.rglob("*.html")):
        if path.resolve() == WELCOME_PATH.resolve():
            continue
        page = path.read_text(encoding="utf-8")
        if 'href="/welcome/"' in page or 'href="/welcome"' in page:
            fail(
                f"/welcome/ is linked from {path.relative_to(SITE).as_posix()}",
                errors,
            )

    if "payment went through" in text.lower():
        fail("/welcome/ must not say the payment went through", errors)
    if "14-day free trial has started" not in text:
        fail("/welcome/ must say the 14-day free trial has started", errors)
    if "be charged until it ends" not in text:
        fail("/welcome/ must say nothing is charged until the trial ends", errors)
    if "Unblock" in text:
        fail("/welcome/ must not mention the Unblock flag", errors)
    for phrase in SMARTSCREEN_COPY:
        if phrase not in text:
            fail(f"/welcome/ is missing the SmartScreen note: {phrase}", errors)


def paddle_placeholders_block_checkout() -> bool:
    if not PADDLE_DATA_PATH.is_file():
        return True
    text = PADDLE_DATA_PATH.read_text(encoding="utf-8")
    token = re.search(r"clientToken:\s*(['\"])(?P<value>.*?)\1", text)
    price = re.search(
        r"default:\s*\{[^}]*priceId:\s*(['\"])(?P<value>.*?)\1",
        text,
        re.S,
    )
    token_value = token.group("value") if token else ""
    price_value = price.group("value") if price else ""
    return "REPLACE_ME" in token_value or "REPLACE_ME" in price_value or not token_value or not price_value


def verify_sales_script_cache(errors: list[str]) -> None:
    """Sales-page scripts share site.cssVersion, same as the stylesheets."""
    version = css_version()
    for relative in ("welcome/index.html",):
        path = SITE / relative
        if not path.is_file():
            continue
        page = path.read_text(encoding="utf-8")
        for src in re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', page, re.I):
            if not src.startswith("/assets/"):
                continue
            if f"?v={version}" not in src:
                fail(
                    f"{relative} must cache-bust {src} with ?v={version}",
                    errors,
                )


PRODUCT_PAGE = SITE / "products" / "practical-stock-planner" / "index.html"
PRODUCT_PATH = "/products/practical-stock-planner/"


def verify_buy(errors: list[str]) -> None:
    """Old checkout URLs 301 straight to the product page."""
    if BUY_PATH.is_file():
        fail("/buy/ must not be built; it 301s to the product page", errors)
    if (SITE / "pricing" / "index.html").is_file():
        fail("/pricing/ must not be built; it 301s to the product page", errors)
    if (ROOT / "src" / "buy.njk").exists():
        fail("src/buy.njk must be removed; /buy/ redirects to the product page", errors)
    if (ROOT / "src" / "pricing.njk").exists():
        fail("src/pricing.njk must be removed; /pricing/ redirects to the product page", errors)
    if (ROOT / "assets" / "buy-checkout.js").exists():
        fail("assets/buy-checkout.js must be removed with the old checkout page", errors)
    verify_sales_script_cache(errors)

    redirects = ""
    if REDIRECTS_SOURCE.is_file():
        redirects = REDIRECTS_SOURCE.read_text(encoding="utf-8")
    for rule in (
        f"/buy {PRODUCT_PATH} 301",
        f"/buy/ {PRODUCT_PATH} 301",
        f"/buy/index.html {PRODUCT_PATH} 301",
        f"/pricing {PRODUCT_PATH} 301",
        f"/pricing/ {PRODUCT_PATH} 301",
        f"/pricing/index.html {PRODUCT_PATH} 301",
    ):
        if rule not in redirects:
            fail(f"_redirects must 301 {rule}", errors)

    middleware = ""
    if MIDDLEWARE_PATH.is_file():
        middleware = MIDDLEWARE_PATH.read_text(encoding="utf-8")
    if f'const PRODUCT_PATH = "{PRODUCT_PATH}";' not in middleware:
        fail("functions/_middleware.js must redirect old checkout URLs to the product page", errors)
    if 'url.pathname = "/pricing/"' in middleware:
        fail("functions/_middleware.js must not send /buy/ via /pricing/", errors)

    if not PADDLE_DATA_PATH.is_file():
        fail("src/_data/paddle.js is missing", errors)
    else:
        source = PADDLE_DATA_PATH.read_text(encoding="utf-8")
        if 'environment: "sandbox"' not in source and "environment: 'sandbox'" not in source:
            fail("src/_data/paddle.js must set environment to sandbox", errors)
        if "https://practicalsupplychainplanning.com/welcome/" not in source:
            fail("src/_data/paddle.js must set successUrl to the absolute /welcome/ URL", errors)

    email_logic = ROOT / "functions" / "email" / "logic.mjs"
    if email_logic.is_file():
        email_text = email_logic.read_text(encoding="utf-8")
        if "/buy/" in email_text or "/pricing/" in email_text:
            fail("results email must link to the product page, not /buy/ or /pricing/", errors)
        if "/products/practical-stock-planner/" not in email_text:
            fail("results email must link to /products/practical-stock-planner/", errors)

    sitemap = ""
    if SITEMAP_PATH.is_file():
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
    if BUY_LOC in sitemap or "/buy/" in sitemap:
        fail("/buy/ must not appear in sitemap.xml", errors)
    if f"{SITE_ORIGIN}/pricing/" in sitemap or "/pricing/" in sitemap:
        fail("/pricing/ must not appear in sitemap.xml", errors)

    for relative in (
        "src/_includes/partials/header.njk",
        "src/_includes/partials/footer.njk",
    ):
        menu = (ROOT / relative).read_text(encoding="utf-8")
        if "/buy/" in menu or "/pricing/" in menu:
            fail(f"/buy/ or /pricing/ is linked from the site menu in {relative}", errors)

    for path in sorted(SITE.rglob("*.html")):
        page = path.read_text(encoding="utf-8")
        relative = path.relative_to(SITE).as_posix()
        if path.resolve() == PRODUCT_PAGE.resolve():
            if 'href="/buy/"' in page or 'href="/buy"' in page:
                fail("the product page must not link to /buy/", errors)
            if 'href="/pricing/"' in page or 'href="/pricing"' in page:
                fail("the product page must not link to /pricing/", errors)
            continue
        if "cdn.paddle.com" in page or re.search(r"<script\b[^>]*paddle\.js", page, re.I):
            fail(f"Paddle.js must load only on the product page, found in {relative}", errors)
        if 'href="/buy/"' in page or 'href="/buy"' in page:
            fail(f"/buy/ is linked from {relative}", errors)
        if 'href="/pricing/"' in page or 'href="/pricing"' in page:
            fail(f"/pricing/ is linked from {relative}", errors)


SELLER_PHRASE = "Practical Supply Chain Planning (Daniel Hampton, sole trader)"
ABN_PLACEHOLDER = "[ABN]"


def site_abn() -> str:
    text = SITE_DATA_PATH.read_text(encoding="utf-8")
    match = re.search(r"abn:\s*(['\"])(?P<value>.*?)\1", text)
    if not match:
        raise ValueError("src/_data/site.js is missing abn")
    return match.group("value")


POLICY_FOOTER_HREFS = (
    'href="/products/"',
    'href="/terms/"',
    'href="/refunds/"',
    'href="/privacy/"',
    'href="/contact/"',
)
PADDLE_RESELLER_SENTENCES = (
    "Our order process is conducted by our online reseller Paddle.com.",
    "Paddle.com is the Merchant of Record for all our orders.",
    "Paddle provides all customer service inquiries and handles returns.",
)


def verify_policy_pages(errors: list[str]) -> None:
    sitemap = ""
    if SITEMAP_PATH.is_file():
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
    for relative, loc in POLICY_PAGES:
        path = SITE / relative
        if not path.is_file():
            fail(f"policy page is missing from _site: {relative}", errors)
            continue
        page = path.read_text(encoding="utf-8")
        if NOINDEX_RE.search(page):
            fail(f"{relative} must not be noindex", errors)
        if loc not in sitemap:
            fail(f"{loc} must appear in sitemap.xml", errors)
        if 'href="/welcome/"' in page or 'href="/welcome"' in page:
            fail(f"{relative} must not link to /welcome/", errors)
        if "[DECISION" in page or "[CHECK" in page or "[PLACEHOLDER]" in page:
            fail(f"{relative} still contains a draft marker", errors)
        if re.search(r"\bimporters\b", page, re.I) or re.search(r"small businesses", page, re.I):
            fail(f"{relative} must not say importers or small businesses", errors)
        if re.search(r"week by week", page, re.I):
            fail(f"{relative} must say period by period, not week by week", errors)
        if re.search(
            r"\b\d+\s+[A-Za-z][^,<]{0,40}\b(?:Street|St|Road|Rd|Avenue|Ave)\b",
            page,
        ):
            fail(f"{relative} must not show a street address", errors)
        if page.lower().count("<h1") != 1:
            fail(f"{relative} must have exactly one h1", errors)

    pricing_path = PRODUCT_PAGE
    if pricing_path.is_file():
        pricing = pricing_path.read_text(encoding="utf-8")
        consent_at = pricing.find("By starting your trial you agree")
        button_at = pricing.find('id="trial-button"')
        if consent_at < 0 or button_at < 0 or consent_at > button_at:
            fail("the trial consent sentence must sit above the trial button", errors)
        elif re.search(r"<h[1-6]\b", pricing[consent_at:button_at], re.I):
            fail("nothing but the consent sentence should sit above the trial button", errors)
        if PADDLE_JS_URL not in pricing:
            fail("the product page must load Paddle.js v2 from cdn.paddle.com", errors)
        checkout_src = f"/assets/pricing-checkout.js?v={css_version()}"
        if checkout_src not in pricing:
            fail(f"the product page must cache-bust the checkout script as {checkout_src}", errors)
        if "https://practicalsupplychainplanning.com/welcome/" not in pricing:
            fail("the product page must set the Paddle success URL to /welcome/", errors)
        for phrase in (
            "Practical Stock Planner",
            "US$49 per month, including any applicable tax",
            "A$75 per month including GST",
            "Windows 10 or 11, 64-bit",
            "7 days from the first failed payment",
            "buy a second subscription",
            "2 business days (Brisbane time)",
            "period by period",
        ):
            if phrase not in pricing:
                fail(f"the product page is missing approved copy: {phrase}", errors)
        if re.search(r"launch deal|launch offer", pricing, re.I):
            fail("the product page must not mention a launch deal", errors)
        if "Unblock" in pricing:
            fail("the product page must not mention the Unblock flag", errors)
        if "Will Windows warn me when I install it?" not in pricing:
            fail("the product page is missing the SmartScreen question", errors)
        for phrase in SMARTSCREEN_COPY:
            if phrase not in pricing:
                fail(f"the product page is missing the SmartScreen note: {phrase}", errors)
        if not paddle_placeholders_block_checkout():
            if not re.search(r'id="trial-note"[^>]*\bhidden\b', pricing):
                fail("the product page must hide the unconfigured note when Paddle config is set", errors)
        elif "Checkout is not available on this page yet." not in pricing:
            fail("the product page must say checkout is not available while placeholders remain", errors)

    checkout_js = ROOT / "assets" / "pricing-checkout.js"
    if not checkout_js.is_file():
        fail("assets/pricing-checkout.js is missing", errors)
    else:
        script = checkout_js.read_text(encoding="utf-8")
        if "quantity: 1" not in script:
            fail("pricing checkout must open Paddle with quantity 1", errors)
        if "discountId" in script:
            fail("pricing checkout must not apply a Paddle discount", errors)
        for snippet in (
            "Paddle.Initialize",
            "Paddle.Checkout.open",
            'displayMode: "overlay"',
            "successUrl: config.successUrl",
            "campaigns.default",
        ):
            if snippet not in script:
                fail(f"assets/pricing-checkout.js is missing {snippet}", errors)

    products_home = SITE / "products" / "index.html"
    if products_home.is_file():
        catalog = products_home.read_text(encoding="utf-8")
        for phrase in (
            "Practical Stock Planner",
            "Plan stock period by period and see what to order and when.",
            "From US$49/month",
            "14-day free trial",
            'href="/products/practical-stock-planner/"',
            'href="/products/" aria-current="page"',
            'alt="Practical Stock Planner logo"',
            'class="product-card__logo"',
            'src="/assets/brand/favicon.png"',
        ):
            if phrase not in catalog:
                fail(f"/products/ is missing {phrase}", errors)
        if "cdn.paddle.com" in catalog:
            fail("/products/ must not load Paddle.js", errors)

    terms_path = SITE / "terms" / "index.html"
    if terms_path.is_file():
        terms = terms_path.read_text(encoding="utf-8")
        for sentence in PADDLE_RESELLER_SENTENCES:
            if sentence not in terms:
                fail(f"/terms/ is missing Paddle's required sentence: {sentence}", errors)
        for phrase in (
            "7 days from the first failed payment",
            "the cancel date wins",
            "at least 30 days before your next payment",
            "at least 30 days",
            "2 business days (Brisbane time)",
            "14-day free trial",
            "Windows 10 or 11, 64-bit",
            "Daniel Hampton",
            "56 757 743 802",
            "Queensland, Australia",
        ):
            if phrase not in terms:
                fail(f"/terms/ is missing approved copy: {phrase}", errors)
        if re.search(r"launch deal|launch offer", terms, re.I):
            fail("/terms/ must not mention a launch deal", errors)

    refunds_path = SITE / "refunds" / "index.html"
    if refunds_path.is_file():
        refunds = refunds_path.read_text(encoding="utf-8")
        for sentence in PADDLE_RESELLER_SENTENCES:
            if sentence not in refunds:
                fail(f"/refunds/ is missing Paddle's required sentence: {sentence}", errors)
        if "within 14 days of any payment" not in refunds:
            fail("/refunds/ must promise 14 days from any payment", errors)

    privacy_path = SITE / "privacy" / "index.html"
    if privacy_path.is_file():
        privacy = privacy_path.read_text(encoding="utf-8")
        for phrase in (
            "for 24 months",
            "which page you used",
            "Articles list",
            "do-not-email list",
            "We do not keep your SKU names",
            "reply",
            "for 7 years after",
            "Support emails and voicemails: 2 years",
            "United States (San Francisco)",
            "Tokyo, Japan",
            "Cloudflare D1",
            "Questions:",
        ):
            if phrase not in privacy:
                fail(f"/privacy/ is missing approved copy: {phrase}", errors)
        if not re.search(
            r"Questions:\s*<a class=\"support-email\" href=\"mailto:support@practicalsupplychainplanning.com\">support@practicalsupplychainplanning.com</a>",
            privacy,
        ):
            fail("/privacy/ must keep the Questions: support@ closing line", errors)

    contact_path = SITE / "contact" / "index.html"
    if contact_path.is_file():
        contact = contact_path.read_text(encoding="utf-8")
        for phrase in (
            "Complaints",
            "2 business days",
            "Queensland, Australia",
            "56 757 743 802",
            "+61 2 8317 3359",
            "(02) 8317 3359",
        ):
            if phrase not in contact:
                fail(f"/contact/ is missing approved copy: {phrase}", errors)
        if PADDLE_RESELLER_SENTENCES[0] not in contact or PADDLE_RESELLER_SENTENCES[1] not in contact:
            fail("/contact/ is missing the Paddle reseller sentences", errors)

    for relative in (
        "src/_includes/partials/header.njk",
        "src/_includes/partials/footer.njk",
        "src/_includes/layouts/sales.njk",
    ):
        source = (ROOT / relative).read_text(encoding="utf-8")
        needed = POLICY_FOOTER_HREFS
        if relative.endswith("header.njk"):
            needed = ('href="/products/"', 'href="/contact/"')
        for href in needed:
            if href not in source:
                fail(f"{relative} is missing {href}", errors)

    for relative in (
        "index.html",
        "about/index.html",
        "welcome/index.html",
        "products/index.html",
        "products/practical-stock-planner/index.html",
    ):
        path = SITE / relative
        if not path.is_file():
            continue
        page = path.read_text(encoding="utf-8")
        for href in POLICY_FOOTER_HREFS:
            if href not in page:
                fail(f"{relative} footer is missing {href}", errors)


def verify_seller(errors: list[str]) -> None:
    abn = site_abn()
    html_files = sorted(SITE.rglob("*.html"))
    if not html_files:
        fail("no HTML files were built into _site", errors)
        return
    for path in html_files:
        page = path.read_text(encoding="utf-8")
        relative = path.relative_to(SITE).as_posix()
        if ABN_PLACEHOLDER in page:
            fail(f"{relative} renders the ABN placeholder", errors)
        if abn == ABN_PLACEHOLDER and re.search(r"\bABN\b", page):
            fail(f"{relative} shows an ABN before one is set", errors)
    for relative in (
        "products/index.html",
        "products/practical-stock-planner/index.html",
        "terms/index.html",
        "refunds/index.html",
        "privacy/index.html",
        "contact/index.html",
        "about/index.html",
        "welcome/index.html",
    ):
        page = (SITE / relative).read_text(encoding="utf-8")
        if SELLER_PHRASE not in page:
            fail(f"{relative} is missing the seller name", errors)


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
        verify_welcome(errors)
        verify_buy(errors)
        verify_policy_pages(errors)
        verify_homepage_routing(errors, posts)
        verify_canonicals(errors, posts)
        verify_stylesheet_version(errors, version)
        verify_listing_fix(errors, posts)
        verify_simulator_assets(errors)
        verify_seller(errors)
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
