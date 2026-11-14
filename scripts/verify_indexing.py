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
only while `checkoutOpen` is true. While it is false, that page does not load
Paddle and `/welcome/` 302s to the product page. `/welcome/` must stay free
of Paddle.js.

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
REQUIRED_EXPORT_GUIDES = ("Getting your data in",)
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
    "/learn/starter-forecast/",
    "/learn/difot-calculator/",
    "/learn/glossary/",
    "/products/",
    "/products/practical-stock-planner/",
    "/terms/",
    "/refunds/",
    "/privacy/",
    "/contact/",
    "/faq/",
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
    ("learn/starter-forecast/index.html", f"{SITE_ORIGIN}/learn/starter-forecast/"),
    ("learn/difot-calculator/index.html", f"{SITE_ORIGIN}/learn/difot-calculator/"),
    ("learn/glossary/index.html", f"{SITE_ORIGIN}/learn/glossary/"),
    ("products/index.html", f"{SITE_ORIGIN}/products/"),
    ("products/practical-stock-planner/index.html", f"{SITE_ORIGIN}/products/practical-stock-planner/"),
    ("terms/index.html", f"{SITE_ORIGIN}/terms/"),
    ("refunds/index.html", f"{SITE_ORIGIN}/refunds/"),
    ("privacy/index.html", f"{SITE_ORIGIN}/privacy/"),
    ("contact/index.html", f"{SITE_ORIGIN}/contact/"),
    ("faq/index.html", f"{SITE_ORIGIN}/faq/"),
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


def guide_urls() -> list[dict]:
    catalog_path = ROOT / "src" / "_data" / "exportGuideCatalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    urls = []
    for entry in catalog:
        slug = str(entry.get("slug") or "").strip()
        path = "/guides/getting-your-data-in/" if not slug else f"/guides/getting-your-data-in/{slug}/"
        urls.append({"loc": f"{SITE_ORIGIN}{path}"})
    return urls


def expected_urls(posts: list[dict]) -> list[dict]:
    urls = [{"loc": f"{SITE_ORIGIN}{path}"} for path in CORE_PAGES]
    urls.extend(guide_urls())
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
    "See your stock weeks ahead. No surprises.",
    "Practical planning tools and plain-English guides from a working supply chain planner.",
    "Explore the tools",
    "Start learning",
    "Built by Daniel Hampton, a working supply chain planner.",
    "Why plan ahead?",
    "Most small businesses reorder when stock drops to a set level. That only tells you what to do today.",
    "It reacts too late.",
    "With long supplier lead times, by the time stock hits the line, the shortage is already on its way.",
    "It misses what's ahead.",
    "Seasonal peaks, promotions and big customer orders don't show up in a fixed level.",
    "It can't see what's coming in.",
    "Orders already on their way get ignored, so you order too much or too early.",
    "Time-phased planning looks ahead instead. It projects your stock week by week from your forecast, open orders and supplier lead times, shows when you'll run short, and plans orders to arrive in time.",
    "Tools to plan ahead",
    "Start free, then plan your whole range when you're ready.",
    "Learn by doing",
    "Safety Stock Simulator",
    "Confused by safety stock? Explore how demand swings and supplier lead times change the buffer you need.",
    "Explore the simulator",
    "Own-data Safety Stock Simulator",
    "Then try the same simulator on up to 10 of your own items and get the results by email.",
    "Try it with your data",
    "Practical Stock Planner",
    "Projects your stock week by week from your stock on hand, open orders and forecast, then tells you what to order and when.",
    "For Windows.",
    "Practical Demand Planner",
    "Builds the forecast your plan looks ahead with, judging each item by its own sales pattern.",
    "Coming soon",
    "Get launch updates",
    "Learn the planning, not just the tool",
    "Plain-English guides, each built around one idea.",
    "Reorder Point vs Time-Phased Planning: Two Different Planning Questions",
    "MRP Is More Than a Stock Calculation: Why Time-Phasing Matters",
    "Forecast Bias: Finding the Direction Behind Forecast Errors",
    "All guides",
    "All articles",
    "Built by a working planner",
    "I'm Daniel Hampton. I've spent my career planning stock and supply for manufacturing, wholesale, retail and distribution businesses, and I still do it every day. Every tool here uses the same forward-planning methods I use at work, without the cost and complexity of big ERP systems.",
    "More about me",
    "Stay in the loop",
    "Get practical planning articles by email, plus launch updates for Practical Stock Planner and Practical Demand Planner.",
    "One email now and then.",
    "You're on the list. Thanks!",
)
FEATURED_POSTS = (
    "/blog/reorder-point-vs-time-phased-planning-two-different-planning-questions/",
    "/blog/mrp-is-more-than-a-stock-calculation-why-time-phasing-matters/",
    "/blog/forecast-bias-finding-the-direction-behind-forecast-errors/",
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
        if (
            "<title>Practical Supply Chain Planning | See your stock weeks ahead</title>"
            not in text
        ):
            fail("index.html title must be the approved home title", errors)
        if (
            '<meta name="description" content="Practical tools and plain-English guides from a working supply chain planner. Plan your stock week by week against your forecast, incoming orders and supplier lead times."'
            not in text
        ):
            fail("index.html meta description must be the approved home description", errors)
        if (
            'property="og:title" content="See your stock weeks ahead. No surprises."'
            not in text
        ):
            fail("index.html og:title must be the approved home social title", errors)
        if (
            'property="og:description" content="Planning tools and guides for product businesses with long supplier lead times, built by a working supply chain planner."'
            not in text
        ):
            fail("index.html og:description must be the approved home social description", errors)
        h1_count = len(H1_RE.findall(text))
        if h1_count != 1:
            fail(f"index.html has {h1_count} h1 elements; expected exactly one", errors)
        if '<h1 class="page-title">See your stock weeks ahead. No surprises.</h1>' not in text:
            fail("index.html h1 must be See your stock weeks ahead. No surprises.", errors)
        if "Practical stock and supply planning" in text or "Straight-logic planning" in text:
            fail("index.html still has the old hero", errors)
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
        if 'href="/pricing/"' in text or 'href="/pricing"' in text:
            fail("index.html must not link to /pricing/", errors)
        if re.search(r"\bimporters\b", text, re.I):
            fail("index.html must not say importers", errors)
        if re.search(r"min-max|min/max|minmax", text, re.I):
            fail("index.html must not describe min-max planning as our method", errors)
        post_links = re.findall(r'href="(/blog/[^"]+/)"', text)
        if post_links != list(FEATURED_POSTS):
            fail(
                f"index.html featured articles are {post_links!r}, expected {list(FEATURED_POSTS)!r}",
                errors,
            )
        if re.search(r"<a\b[^>]*>\s*Coming soon\s*</a>", text):
            fail("Coming soon on the home page must be a label, not a link", errors)
        allowed_button = '<button class="sim-button" type="submit">Keep me posted</button>'
        buttons = re.findall(r"<button\b[^>]*>[\s\S]*?</button>", text, re.I)
        if checkout_open():
            if buttons != [allowed_button]:
                fail(
                    "index.html may only include the signup submit button while checkout is open, found "
                    + repr(buttons),
                    errors,
                )
            if 'href="/products/practical-stock-planner/"' not in text:
                fail("index.html must link Practical Stock Planner once checkout is open", errors)
            if "Available now" not in text:
                fail("index.html must mark Practical Stock Planner available once checkout is open", errors)
        else:
            launch_button = (
                '<button type="button" class="trial-button" disabled>Available 16 Nov</button>'
            )
            if buttons != [launch_button, allowed_button]:
                fail(
                    "index.html buttons must be the closed launch control and the signup submit, found "
                    + repr(buttons),
                    errors,
                )
            if 'href="/products/practical-stock-planner/"' in text:
                fail("index.html must not link to checkout or the product page while checkout is closed", errors)
            if "Start your free trial" in text or "See pricing" in text or "14-day" in text:
                fail("index.html must not offer a trial or pricing while checkout is closed", errors)
            if "Launching 16 Nov" not in text or "Available 16 Nov" not in text:
                fail("index.html must show the 16 Nov launch status while checkout is closed", errors)
        if 'href="/products/"' not in text:
            fail("index.html footer must still link to the products list", errors)
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
            "(core pages, export guides, then articles newest first)",
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
            "src/_data/exportGuides.js must list "
            f"{list(REQUIRED_EXPORT_GUIDES)!r}"
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
    download_url = (
        "https://downloads.practicalsupplychainplanning.com/"
        "practical-stock-planner/latest/PracticalStockPlanner-Setup.exe"
    )
    download_link = re.search(
        r'<a\b([^>]*)>\s*Download Practical Stock Planner for Windows\s*</a>',
        text,
        re.I,
    )
    if not download_link:
        fail(
            "/welcome/ must link Download Practical Stock Planner for Windows "
            "to the latest installer",
            errors,
        )
    else:
        attrs = download_link.group(1)
        if f'href="{download_url}"' not in attrs:
            fail(
                "/welcome/ download must use the stable latest installer URL",
                errors,
            )
        if "sales-button" not in attrs or "sales-button--action" not in attrs:
            fail("/welcome/ download link must use the action button style", errors)
    if re.search(r"<button\b[^>]*\bdisabled\b", text, re.I):
        fail("/welcome/ download must not be a disabled placeholder button", errors)
    if re.search(r"coming soon|available shortly", text, re.I):
        fail("/welcome/ must not say the installer download is coming soon", errors)
    if "Windows 10 or 11, 64-bit, about 70 MB." not in text:
        fail(
            "/welcome/ must note Windows 10 or 11, 64-bit, about 70 MB",
            errors,
        )
    if "licence key and download link" not in text:
        fail(
            "/welcome/ must say the licence email includes the key and download link",
            errors,
        )
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
    if not re.search(
        r"\.site-address\s*\{[^}]*overflow-wrap:\s*anywhere",
        stylesheet,
    ):
        fail("assets/styles.css must set overflow-wrap: anywhere on .site-address", errors)
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


def checkout_open() -> bool:
    if not PADDLE_DATA_PATH.is_file():
        return False
    text = PADDLE_DATA_PATH.read_text(encoding="utf-8")
    return bool(re.search(r"checkoutOpen:\s*true\b", text))


def launch_date() -> str:
    text = PADDLE_DATA_PATH.read_text(encoding="utf-8")
    match = re.search(r'launchDate:\s*["\']([^"\']+)["\']', text)
    return match.group(1) if match else ""


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
        if 'environment: "live"' not in source and "environment: 'live'" not in source:
            fail("src/_data/paddle.js must set environment to live", errors)
        if "https://practicalsupplychainplanning.com/welcome/" not in source:
            fail("src/_data/paddle.js must set successUrl to the absolute /welcome/ URL", errors)
        if not re.search(r"checkoutOpen:\s*(?:true|false)\b", source):
            fail("src/_data/paddle.js must set checkoutOpen to true or false", errors)
        if not launch_date():
            fail("src/_data/paddle.js must set launchDate", errors)
        if 'foundingDiscountCode: "FOUNDING29"' not in source and "foundingDiscountCode: 'FOUNDING29'" not in source:
            fail("src/_data/paddle.js must set foundingDiscountCode to FOUNDING29", errors)
        if 'foundingDiscountCodeAud: "FOUNDINGAU"' not in source and "foundingDiscountCodeAud: 'FOUNDINGAU'" not in source:
            fail("src/_data/paddle.js must set foundingDiscountCodeAud to FOUNDINGAU", errors)
        if not re.search(r"guidedSetupOpen:\s*false\b", source):
            fail(
                "guidedSetupOpen must stay false so the page has no Guided setup buy link yet",
                errors,
            )

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
FOUNDING_QUESTIONNAIRE = (
    "A short feedback questionnaire is requested, about two weeks after you start. "
    "The founding price is not withdrawn if you don&rsquo;t fill it in. "
    "Giving a quote is optional."
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
        if checkout_open():
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
            if "Start your free trial" not in pricing:
                fail("the product page must offer Start your free trial while checkout is open", errors)
        else:
            if PADDLE_JS_URL in pricing or "pricing-checkout.js" in pricing or 'id="paddle-config"' in pricing:
                fail("the product page must not load Paddle while checkout is closed", errors)
            if "live_" in pricing or "pri_" in pricing:
                fail("the product page must not embed the Paddle token or price while checkout is closed", errors)
            available = f"Available {launch_date()}"
            if available not in pricing:
                fail(f"the product page must show a disabled {available} control", errors)
            if "Get launch updates" not in pricing or 'href="#signup"' not in pricing:
                fail("the product page must offer Get launch updates while checkout is closed", errors)
            if "From 16 Nov: how buying works" not in pricing:
                fail("the product page must date the buying steps from 16 Nov while checkout is closed", errors)
            if re.search(r"<button\b[^>]*>\s*Start your free trial\s*</button>", pricing):
                fail("the product page must not show the trial button while checkout is closed", errors)
        for phrase in (
            "Practical Stock Planner",
            "US$49 per month, including any applicable tax",
            "A$75 per month including GST",
            "US$29 per month",
            "A$45 per month including GST in Australia",
            "for the first 12 months",
            "first 20 customers",
            "31 Jan 2027",
            "A short feedback questionnaire is requested, about two weeks after you start.",
            "FOUNDING29",
            "FOUNDINGAU",
            "available from launch on 16 Nov 2026",
            "Guided setup",
            "US$199 one-off",
            "A$299 including GST in Australia",
            "2 slots a week",
            "SKU Details",
            "Supplier Details",
            "SKU Supplier Details",
            "Open Supply",
            "Lot Size (Weeks Cover)",
            "deleted within 30 days of the call",
            "within 14 days of the Guided setup payment",
            "A Guided setup booked later still has its 14-day refund counted from that payment.",
            "The founding price is not withdrawn if you don&rsquo;t fill it in.",
            "buy button for it yet",
            "Windows 10 or 11, 64-bit",
            "7 days from the first failed payment",
            "buy a second subscription",
            "2 business days (Brisbane time)",
            "period by period",
        ):
            if phrase not in pricing:
                fail(f"the product page is missing approved copy: {phrase}", errors)
        if pricing.count(FOUNDING_QUESTIONNAIRE) != 2:
            fail(
                "the product page must use the founding questionnaire sentence in the Price section and the founding-price question",
                errors,
            )
        if re.search(r"feedback\s+call", pricing, re.I):
            fail("the product page must not keep the old founding-call sentence", errors)
        if "may not be created" in pricing or "may not apply" in pricing:
            fail("the product page must not say the Australian founding code may be missing", errors)
        if "buy.paddle" in pricing or "checkout.paddle" in pricing:
            fail("the product page must not link to a Paddle buy URL", errors)
        if re.search(r"<a\b[^>]*href=[\"'][^\"']*paddle\.com[^\"']*[\"'][^>]*>\s*(?:Buy|Add Guided setup)", pricing, re.I):
            fail("the product page must not offer a Guided setup buy link", errors)
        if re.search(r"launch deal|launch offer", pricing, re.I):
            fail("the product page must not mention a launch deal", errors)
        if "Unblock" in pricing:
            fail("the product page must not mention the Unblock flag", errors)
        if "Will Windows warn me when I install it?" not in pricing:
            fail("the product page is missing the SmartScreen question", errors)
        for phrase in SMARTSCREEN_COPY:
            if phrase not in pricing:
                fail(f"the product page is missing the SmartScreen note: {phrase}", errors)
        if checkout_open():
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
            fail(
                "pricing checkout must pass foundingDiscountCode as discountCode, "
                "not a Paddle discount entity id",
                errors,
            )
        if "discountCode" not in script or "foundingDiscountCode" not in script:
            fail(
                "pricing checkout must apply foundingDiscountCode as discountCode "
                "while checkoutOpen is true",
                errors,
            )
        if "foundingDiscountCodeAud" not in script or 'currencyCode === "AUD"' not in script:
            fail(
                "pricing checkout must apply FOUNDINGAU when the checkout currency is AUD",
                errors,
            )
        if "config.checkoutOpen === true" not in script:
            fail("the founding discount must stay behind checkoutOpen", errors)
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
        catalog_phrases = [
            "Practical Stock Planner",
            "Plan stock period by period and see what to order and when.",
            "Founding price US$29/month for the first 12 months from 16 Nov 2026, for the first 20 customers or until 31 Jan 2027, then US$49/month",
            'href="/products/practical-stock-planner/"',
            'href="/products/" aria-current="page"',
            'alt="Practical Stock Planner logo"',
            'class="product-card__logo"',
            'src="/assets/brand/favicon.png"',
        ]
        if checkout_open():
            catalog_phrases.append("14-day free trial")
        else:
            catalog_phrases.append(f"Available {launch_date()}")
            catalog_phrases.append("Get launch updates")
        for phrase in catalog_phrases:
            if phrase not in catalog:
                fail(f"/products/ is missing {phrase}", errors)
        if not checkout_open() and "14-day free trial" in catalog:
            fail("/products/ must not offer the free trial while checkout is closed", errors)
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
            "US$29 per month",
            "A$45 per month including GST in Australia",
            "for the first 12 months",
            "FOUNDING29",
            "FOUNDINGAU",
            "A short feedback questionnaire is requested, about two weeks after you start.",
            "The founding price is not withdrawn if you don&rsquo;t fill it in.",
            "A Guided setup booked later still has its 14-day refund counted from that payment.",
            "deleted within 30 days of the call",
            "Daniel Hampton",
            "56 757 743 802",
            "Queensland, Australia",
        ):
            if phrase not in terms:
                fail(f"/terms/ is missing approved copy: {phrase}", errors)
        if terms.count(FOUNDING_QUESTIONNAIRE) != 1:
            fail("/terms/ must use the founding questionnaire sentence once", errors)
        if re.search(r"feedback\s+call", terms, re.I):
            fail("/terms/ must not keep the old founding-call sentence", errors)
        if "may not be created" in terms or "may not apply" in terms:
            fail("/terms/ must not say the Australian founding code may be missing", errors)
        if 'class="site-address">practicalsupplychainplanning.com' not in terms:
            fail("/terms/ must let the website address wrap at a narrow width", errors)
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
        if "A Guided setup payment is covered in the same way." not in refunds:
            fail("/refunds/ must cover a Guided setup payment on the same 14-day terms", errors)
        if "A Guided setup booked later still has its 14-day refund counted from that payment." not in refunds:
            fail("/refunds/ must count a later Guided setup refund from that payment", errors)

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
            "Guided setup exception.",
            "deleted within 30 days of the call",
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


def verify_glossary(errors: list[str]) -> None:
    """Planning glossary: public page, anchors, JSON-LD, and copy limits."""
    page_path = SITE / "learn" / "glossary" / "index.html"
    if not page_path.is_file():
        fail("/learn/glossary/ is missing from the build", errors)
        return
    text = page_path.read_text(encoding="utf-8")
    if "<title>Supply Chain Planning Glossary | Practical Supply Chain Planning</title>" not in text:
        fail("/learn/glossary/ title is not the approved SEO title", errors)
    if (
        '<meta name="description" content="Plain-English definitions of safety stock, lead time, MOQ, forecasting and more, from a working supply chain planner."'
        not in text
    ):
        fail("/learn/glossary/ meta description is not the approved text", errors)
    if '<h1 class="page-title">Planning glossary</h1>' not in text:
        fail("/learn/glossary/ h1 must be Planning glossary", errors)
    if len(H1_RE.findall(text)) != 1:
        fail("/learn/glossary/ must have exactly one h1", errors)
    if "from a working supply chain planner" not in text:
        fail("/learn/glossary/ intro must say from a working supply chain planner", errors)
    if "projects stock forward against the forecast, open orders and lead times" not in text:
        fail("/learn/glossary/ intro must use the time-phased framing", errors)
    if "Forecasting is the process of estimating future demand for a product." not in text:
        fail("/learn/glossary/ is missing the general forecast definition", errors)
    if "The forecast horizon is how far ahead the forecast runs." not in text:
        fail("/learn/glossary/ is missing the general forecast horizon definition", errors)
    if "Intermittent demand has many weeks with no sales." not in text:
        fail("/learn/glossary/ is missing the general intermittent demand definition", errors)
    if 'id="forecast-reliability"' not in text:
        fail("/learn/glossary/ must keep the forecast-reliability anchor", errors)
    if "Sales history variability" not in text:
        fail("/learn/glossary/ is missing the sales history variability term", errors)
    old_reliability = "Forecast reliability is influenced by the variability of historical demand."
    if old_reliability in text:
        fail("/learn/glossary/ still uses the old forecast reliability wording", errors)
    for phrase in (
        "26, 52, and 78 weeks",
        "how many future months will be generated",
        "weeks that sold in the last 26 weeks",
        "This simplified logic demonstrates",
        "Products exist in the SKU Master",
        "grey cell",
        "Below Safety Stock on Expedite",
    ):
        if phrase in text:
            fail(f"/learn/glossary/ still has app-specific material: {phrase}", errors)
    for phrase in (
        'id="forecast-profile"',
        'id="demand-bucket"',
        'id="trend"',
        'id="seasonality"',
        "Application Behavior",
        "How Recommended Is Decided",
        "Step 3 - Create Forecast Profile",
        "Practical Stock Planner",
        "Practical Demand Planner",
    ):
        if phrase in text:
            fail(f"/learn/glossary/ still has app-specific material: {phrase}", errors)
    for banned in (
        r"reorder point",
        r"\breorder\b",
        r"\bre-order\b",
        r"\bROP\b",
        r"min-?max",
        r"minmax",
        r"croston",
        r"\bexcel\b",
        r"option\s*[123]",
        r"4-4-5",
    ):
        if re.search(banned, text, re.I):
            fail(f"/learn/glossary/ contains banned copy: {banned}", errors)
    headings = re.findall(r'<h2 class="glossary-group__title"[^>]*>([^<]+)</h2>', text)
    if headings != ["Supply &amp; ordering", "Stock &amp; service", "Demand &amp; forecasting"]:
        fail(f"/learn/glossary/ groups are {headings!r}", errors)
    blocks = re.findall(
        r'<details class="sim-details" id="([^"]+)">\s*<summary>([^<]+)</summary>',
        text,
    )
    if len(blocks) < 20:
        fail(f"/learn/glossary/ has {len(blocks)} term expanders", errors)
    ids = [item[0] for item in blocks]
    if len(ids) != len(set(ids)):
        fail("/learn/glossary/ term ids are not unique", errors)
    for needed in ("planned-order", "mrp"):
        if needed not in ids:
            fail(f"/learn/glossary/ is missing the term anchor {needed}", errors)
    if "function openFromHash" not in text:
        fail("/learn/glossary/ must open a term when its anchor is used", errors)
    if '"@type": "DefinedTermSet"' not in text:
        fail("/learn/glossary/ is missing DefinedTermSet JSON-LD", errors)
    term_urls = re.findall(
        r'"@type": "DefinedTerm"[\s\S]*?"url": "https://practicalsupplychainplanning.com/learn/glossary/#([^"]+)"',
        text,
    )
    if term_urls != ids:
        fail("/learn/glossary/ JSON-LD terms do not match the page anchors", errors)
    if text.count("Used in:") != len(ids):
        fail("/learn/glossary/ each term needs a Used in tag", errors)
    learn = (SITE / "learn" / "index.html").read_text(encoding="utf-8")
    if learn.count('class="learn-card"') != 5:
        fail("/learn/ must show five cards, including the glossary", errors)
    if 'href="/learn/glossary/"' not in learn:
        fail("/learn/ must link to the planning glossary", errors)
    about = (SITE / "about" / "index.html").read_text(encoding="utf-8")
    if 'href="/learn/glossary/"' not in about:
        fail("/about/ must link to the planning glossary", errors)
    footer = (ROOT / "src" / "_includes" / "partials" / "footer.njk").read_text(encoding="utf-8")
    if 'href="/learn/glossary/"' not in footer:
        fail("footer must link to the planning glossary", errors)


def verify_difot_sent(errors: list[str]) -> None:
    sent = SITE / "learn" / "difot-calculator" / "sent" / "index.html"
    if not sent.is_file():
        fail("/learn/difot-calculator/sent/ is missing from the build", errors)
        return
    text = sent.read_text(encoding="utf-8")
    if not NOINDEX_RE.search(text):
        fail("/learn/difot-calculator/sent/ must be noindex", errors)
    sitemap = SITEMAP_PATH.read_text(encoding="utf-8") if SITEMAP_PATH.is_file() else ""
    if "/learn/difot-calculator/sent/" in sitemap:
        fail("/learn/difot-calculator/sent/ must not appear in sitemap.xml", errors)


def home_setting(name: str) -> str:
    text = (ROOT / "src" / "_data" / "home.js").read_text(encoding="utf-8")
    match = re.search(rf'(?m)^\s*{name}:\s*"([^"]*)"', text)
    return match.group(1) if match else ""


def verify_home_assets(errors: list[str]) -> None:
    """Empty home asset slots must not emit images or placeholder copy."""
    home = SITE / "index.html"
    if not home.is_file():
        return
    text = home.read_text(encoding="utf-8")
    slots = {
        "photoUrl": ("home-byline__photo", "home-portrait"),
        "heroChartUrl": ("home-chart", "home-card__shot"),
        "simulatorChartUrl": ("Safety Stock Simulator results chart.",),
        "linkedinUrl": ("LinkedIn", "Connect on LinkedIn"),
    }
    for key, markers in slots.items():
        value = home_setting(key)
        present = any(marker in text for marker in markers)
        if value and not present and key != "simulatorChartUrl":
            fail(f"index.html is missing the {key} asset", errors)
        if not value and present:
            fail(f"index.html shows {key} while src/_data/home.js leaves it empty", errors)
        if not value and key == "linkedinUrl" and ("LinkedIn" in text or "Connect on LinkedIn" in text):
            fail("index.html must hide LinkedIn until linkedinUrl is set", errors)
    if re.search(r"""src=["']\s*["']""", text):
        fail("index.html has an image with an empty src", errors)
    if "Photo coming" in text or "placeholder" in text.lower() or "[LinkedIn]" in text:
        fail("index.html shows placeholder copy for a missing asset", errors)


def verify_social_and_chrome(errors: list[str]) -> None:
    favicon = SITE / "favicon.ico"
    if not favicon.is_file() or favicon.stat().st_size < 16:
        fail("/favicon.ico was not built", errors)
    html_files = sorted(SITE.rglob("*.html"))
    for path in html_files:
        page = path.read_text(encoding="utf-8")
        relative = path.relative_to(SITE).as_posix()
        if "Search powered by Brave" in page or "brave.com/search" in page:
            fail(f"{relative} still credits Brave search", errors)
        if 'property="og:title"' not in page or 'name="twitter:card"' not in page:
            fail(f"{relative} is missing Open Graph or Twitter card tags", errors)
        if 'property="og:image"' not in page:
            fail(f"{relative} is missing og:image", errors)
        if re.search(r"<img\b[^>]*\balt=\"\"", page):
            fail(f"{relative} has an image with empty alt text", errors)
        if re.search(r"<img\b(?![^>]*\balt=)[^>]*>", page):
            fail(f"{relative} has an image without alt text", errors)


def resolve_internal(url_path: str) -> Path:
    relative = url_path.lstrip("/")
    if not relative:
        return SITE / "index.html"
    direct = SITE / relative
    if Path(relative).suffix:
        return direct
    return SITE / relative / "index.html"


def verify_internal_links(errors: list[str]) -> None:
    href_re = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", re.I)
    missing = []
    for path in sorted(SITE.rglob("*.html")):
        page = path.read_text(encoding="utf-8")
        relative = path.relative_to(SITE).as_posix()
        for raw in href_re.findall(page):
            if raw.startswith(("#", "mailto:", "tel:", "data:", "http://", "https://", "//")):
                continue
            url = raw.split("#", 1)[0].split("?", 1)[0]
            if not url.startswith("/"):
                continue
            target = resolve_internal(url)
            if not target.is_file():
                missing.append(f"{relative} -> {raw}")
    if missing:
        fail("broken internal links: " + "; ".join(missing[:12]), errors)


def verify_simulator_assets(errors: list[str]) -> None:
    scenarios = SITE / "learn" / "safety-stock-simulator" / "scenarios.json"
    if not scenarios.is_file():
        fail("scenarios.json was not copied into _site", errors)


START_PAGES = (
    "start/plan-ahead/index.html",
    "start/planning-guides/index.html",
)
PREEXISTING_NOINDEX = {
    "404.html": "noindex",
    "welcome/index.html": "noindex",
    "learn/safety-stock-simulator/sent/index.html": "noindex",
    "learn/starter-forecast/sent/index.html": "noindex",
    "learn/difot-calculator/sent/index.html": "noindex",
}
ROBOTS_META_RE = re.compile(
    r'<meta\s+name=["\']robots["\']\s+content=["\']([^"\']*)["\']',
    re.I,
)
START_BANNED = (
    r"reorder point",
    r"reorder-point",
    r"\bROP\b",
    r"min-?max",
    r"min/max",
    r"minmax",
    r"\bmin max\b",
    r"croston",
)


def learn_tool_hrefs() -> list[str]:
    text = (ROOT / "src" / "_data" / "learnTools.js").read_text(encoding="utf-8")
    return re.findall(r'href:\s*"([^"]+)"', text)


def verify_start_pages(errors: list[str]) -> None:
    """Pages under /start/ are hidden by path and keep their query string."""
    source_robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    built_robots = ROBOTS_PATH.read_text(encoding="utf-8") if ROBOTS_PATH.is_file() else ""
    if built_robots != source_robots:
        fail("robots.txt in _site must match the source file", errors)
    if "/start/" in source_robots:
        fail("robots.txt must not block or mention /start/", errors)

    sitemap = SITEMAP_PATH.read_text(encoding="utf-8") if SITEMAP_PATH.is_file() else ""
    if "/start/" in sitemap:
        fail("sitemap.xml must not include a /start/ URL", errors)

    for relative in (
        "src/_includes/partials/header.njk",
        "src/_includes/partials/footer.njk",
    ):
        menu = (ROOT / relative).read_text(encoding="utf-8")
        if "/start/" in menu:
            fail(f"{relative} must not link to /start/", errors)

    found_start: set[str] = set()
    for path in sorted(SITE.rglob("*.html")):
        relative = path.relative_to(SITE).as_posix()
        text = path.read_text(encoding="utf-8")
        metas = ROBOTS_META_RE.findall(text)
        under_start = relative == "start" or relative.startswith("start/")
        if under_start:
            found_start.add(relative)
            if metas != ["noindex, nofollow"]:
                fail(
                    f"{relative} must have exactly one noindex, nofollow robots meta, found {metas!r}",
                    errors,
                )
            if "history.replaceState" in text or REFRESH_RE.search(text):
                fail(f"{relative} must keep utm_ and ref in the address bar", errors)
            if re.search(r"location\.(?:replace|assign|href)\s*=", text):
                fail(f"{relative} must not send the browser to a URL that drops the query", errors)
            for banned in START_BANNED:
                if re.search(banned, text, re.I):
                    fail(f"{relative} contains banned copy: {banned}", errors)
            if "cdn.paddle.com" in text or "pricing-checkout.js" in text:
                fail(f"{relative} must not load Paddle", errors)
            if re.search(r"FOUNDING|US\$|A\$|\bpri_|\blive_", text):
                fail(f"{relative} must not add prices, tokens or discount codes", errors)
            if text.lower().count("<h1") != 1:
                fail(f"{relative} must have exactly one h1", errors)
            continue
        if any("nofollow" in value.lower() for value in metas):
            fail(f"{relative} gained a nofollow robots meta", errors)
        if relative in PREEXISTING_NOINDEX:
            if metas != [PREEXISTING_NOINDEX[relative]]:
                fail(f"{relative} robots meta changed to {metas!r}", errors)
        elif any("noindex" in value.lower() for value in metas):
            fail(f"{relative} gained a noindex robots meta", errors)
        if 'href="/start/' in text or 'href="/start"' in text:
            fail(f"{relative} links to a /start/ page", errors)

    if found_start != set(START_PAGES):
        fail(
            f"/start/ pages are {sorted(found_start)!r}, expected {list(START_PAGES)!r}",
            errors,
        )

    plan_source = (ROOT / "src" / "start" / "plan-ahead.njk").read_text(encoding="utf-8")
    guides_source = (ROOT / "src" / "start" / "planning-guides.njk").read_text(encoding="utf-8")
    for label, source in (("plan-ahead", plan_source), ("planning-guides", guides_source)):
        if re.search(r'"robots"\s*:', source):
            fail(f"/start/{label}/ must not set robots in front matter", errors)

    plan = (SITE / "start" / "plan-ahead" / "index.html").read_text(encoding="utf-8")
    for phrase in (
        "See your stock position weeks ahead, before it runs short or piles up.",
        "projects stock forward against your forecast, open orders and lead times.",
        "Reordering by gut feel or spreadsheet, and finding out too late.",
        "week by week from your forecast, open orders and lead times.",
        "Planned orders are timed to arrive before stock drops below safety stock.",
        "Small product businesses with CSV exports, for example Shopify, Xero or Cin7.",
        "Built by Daniel Hampton, a working supply chain planner.",
        "Your data stays in CSV files. No integration is needed.",
        "/images/IMG000009.webp",
        'alt="Practical Stock Planner inventory projection, with projected stock across the weeks of the plan."',
        "/assets/brand/daniel-hampton-312.png",
    ):
        if phrase not in plan:
            fail(f"/start/plan-ahead/ is missing approved copy: {phrase}", errors)
    if "paddle.checkoutOpen" not in plan_source or "Join the list" not in plan_source:
        fail("/start/plan-ahead/ must switch the sign-up CTA on checkoutOpen", errors)
    if "/products/practical-stock-planner/#price" not in plan_source or "Start your free trial" not in plan_source:
        fail("/start/plan-ahead/ must use the product trial path when checkout is open", errors)
    if checkout_open():
        if 'href="/products/practical-stock-planner/#price"' not in plan or "Start your free trial" not in plan:
            fail("/start/plan-ahead/ must show the product trial path while checkout is open", errors)
        if 'id="signup"' in plan:
            fail("/start/plan-ahead/ must not show the email sign-up while checkout is open", errors)
    else:
        if plan.count("Join the list") != 1 or 'id="signup"' not in plan or "keep-in-touch.js" not in plan:
            fail("/start/plan-ahead/ must use one email sign-up while checkout is closed", errors)
        if 'href="#signup"' in plan:
            fail("/start/plan-ahead/ must not repeat Join the list as a link above the form", errors)
        if "Start your free trial" in plan:
            fail("/start/plan-ahead/ must not show the trial path while checkout is closed", errors)

    guides = (SITE / "start" / "planning-guides" / "index.html").read_text(encoding="utf-8")
    for phrase in (
        "Practical planning guides from a working supply chain planner.",
        "projects stock forward against your forecast, open orders and lead times.",
        "New guides and tools, monthly.",
        '<a class="learn-card" href="/learn/">',
        'href="/learn/glossary/"',
        'href="/products/practical-stock-planner/"',
        "keep-in-touch.js",
        "Learn articles",
        "Free tools",
    ):
        if phrase not in guides:
            fail(f"/start/planning-guides/ is missing {phrase}", errors)
    for href in learn_tool_hrefs():
        if href == "/learn/glossary/":
            continue
        page = public_file_for_path(href)
        if not page.is_file():
            fail(f"/start/planning-guides/ must not link a missing free tool: {href}", errors)
            continue
        if f'href="{href}"' not in guides:
            fail(f"/start/planning-guides/ must link the existing free tool {href}", errors)
    if "difot" in guides.lower():
        difot_page = SITE / "learn" / "difot-calculator" / "index.html"
        if not difot_page.is_file():
            fail("/start/planning-guides/ mentions DIFOT, but that page is not built", errors)
    if 'class="home-button"' in guides:
        fail("/start/planning-guides/ should keep the Stock Planner link soft", errors)


def verify_faq_links(errors: list[str]) -> None:
    """Public FAQ page, linked from the menus and the buyer pages."""
    sources = (
        (ROOT / "src" / "_includes" / "partials" / "header.njk", "header"),
        (ROOT / "src" / "_includes" / "partials" / "footer.njk", "site footer"),
        (ROOT / "src" / "_includes" / "layouts" / "sales.njk", "sales footer"),
        (ROOT / "src" / "welcome.njk", "welcome"),
        (ROOT / "src" / "start" / "plan-ahead.njk", "plan-ahead"),
        (ROOT / "src" / "contact.njk", "contact"),
        (ROOT / "src" / "products" / "practical-stock-planner.njk", "product page"),
    )
    for path, label in sources:
        text = path.read_text(encoding="utf-8")
        if 'href="/faq/"' not in text:
            fail(f"{label} must link to /faq/", errors)
        if label in ("header", "site footer", "sales footer"):
            if text.find('href="/faq/"') > text.find('href="/contact/"'):
                fail(f"{label} FAQ link must sit before Contact", errors)
    product = (ROOT / "src" / "products" / "practical-stock-planner.njk").read_text(encoding="utf-8")
    if 'or see the <a href="/contact/">Contact page</a>.' not in product:
        fail("the product Questions block must keep its Contact sentence", errors)
    plan = (ROOT / "src" / "start" / "plan-ahead.njk").read_text(encoding="utf-8")
    if "More answers are on the" not in plan or 'href="/faq/"' not in plan:
        fail("/start/plan-ahead/ must point to the FAQ page from its Questions block", errors)
    faq_source = (ROOT / "src" / "faq.njk").read_text(encoding="utf-8")
    if 'href="/start/' in faq_source:
        fail("/faq/ must not link to /start/", errors)
    built = SITE / "faq" / "index.html"
    if not built.is_file():
        fail("/faq/ was not built", errors)
        return
    page = built.read_text(encoding="utf-8")
    if NOINDEX_RE.search(page):
        fail("/faq/ must not be noindex", errors)
    if "FAQPage" not in page:
        fail("/faq/ must emit FAQPage JSON-LD for the published questions", errors)
    for question in (
        "How do I get started?",
        "What files does it use? Does it connect to Shopify, Xero or Cin7?",
        "How does the licence work?",
        "Who takes payment, and how do I cancel?",
        "Does it run on a Mac, or only on Windows?",
        "Where does my planning data go?",
        "What is the founding-customer price?",
        "When am I charged?",
        "What does Practical Stock Planner actually do?",
        "What doesn\u2019t it do?",
        "Can I get help with setup?",
        "How do I ask a question that isn\u2019t covered here?",
    ):
        if f"<h2>{question}</h2>" not in page:
            fail(f"/faq/ is missing the question: {question}", errors)
    if (
        "In return, a short feedback questionnaire is requested about two weeks after you start. "
        "The founding price is not withdrawn if you don\u2019t fill it in. Giving a quote is optional."
    ) not in page:
        fail("/faq/ is missing the founding questionnaire answer", errors)
    if (
        "Can\u2019t see your question answered above? Send it here and Daniel will reply by email "
        "within 2 business days (Brisbane time)."
    ) not in page:
        fail("/faq/ is missing the Ask a question help text", errors)
    if "outgrown simple reorder triggers" not in page:
        fail("/faq/ is missing the approved reorder-triggers wording", errors)
    if "30\u201345 minute video call" not in page or "It is not the founding feedback questionnaire." not in page:
        fail("/faq/ must keep Guided setup separate from the founding questionnaire", errors)
    if re.search(r"feedback\s+call", page, re.I):
        fail("/faq/ must not mention a founding call", errors)
    if re.search(r"reorder-point|reorder point|min-max|min/max|minmax", page, re.I):
        fail("/faq/ must not use reorder-point or min-max wording", errors)
    for href in (
        'href="/products/practical-stock-planner/"',
        'href="/refunds/"',
        'href="/privacy/"',
        'href="/contact/"',
        'href="https://www.paddle.net" rel="noopener noreferrer" target="_blank"',
        'href="mailto:support@practicalsupplychainplanning.com"',
    ):
        if href not in page:
            fail(f"/faq/ is missing {href}", errors)
    if 'href="/start/' in page:
        fail("/faq/ must not link to /start/", errors)
    if page.lower().count("<h1") != 1:
        fail("/faq/ must have exactly one h1", errors)
    if "Ask a question" not in page or "Send question" not in page:
        fail("/faq/ must include the question form", errors)


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
        verify_home_assets(errors)
        verify_social_and_chrome(errors)
        verify_internal_links(errors)
        verify_simulator_assets(errors)
        verify_difot_sent(errors)
        verify_glossary(errors)
        verify_seller(errors)
        verify_start_pages(errors)
        verify_faq_links(errors)
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
