# Practical Supply Chain Planning — Website

Static marketing site for [practicalsupplychainplanning.com](https://practicalsupplychainplanning.com).

## Brand assets

Place files in `assets/brand/`:

| File | Purpose |
|------|---------|
| `logo.png` | Header logo |
| `daniel-hampton.jpg` | About page profile photo |

Colour palette PDFs stay in `assets/brand/` for reference. Update hex values in
[`assets/variables.css`](assets/variables.css) to match your brand guides.

## Git

Initialize the repository (run once):

```powershell
cd "C:\Users\hampt\OneDrive\Documents\Planning Software Development\Website"
git init
```

No initial commit is included unless you request one.

## Preview locally

Use a local HTTP server (recommended — avoids broken paths for `/about/`):

```powershell
cd "C:\Users\hampt\OneDrive\Documents\Planning Software Development\Website"
python -m http.server 8080
```

Then open:

- http://localhost:8080/
- http://localhost:8080/about/
- http://localhost:8080/learn/safety-stock-simulator/

Stop the server with `Ctrl+C`.

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub repository.
2. In Cloudflare: **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repository.
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
5. Deploy. You will get a `*.pages.dev` URL for staging.
6. When your domain transfer completes: **Custom domains** → add `practicalsupplychainplanning.com`.
7. Add `www.practicalsupplychainplanning.com` as a **second custom domain** on the same Pages project. Do not CNAME `www` to the apex by hand. A proxied `www` record that is not bound to Pages returns Cloudflare **522**. After the domain is Active, `functions/_middleware.js` 301s `www` to `https://practicalsupplychainplanning.com`.

No build step is required — Cloudflare serves the static files directly. Pages Functions in `functions/` compile on deploy.

## Structure

```text
Website/
├── index.html              # Fallback link to /about/ (production uses HTTP 301)
├── _redirects              # `/` → `/about/` 301 for Cloudflare Pages
├── functions/_middleware.js  # www → apex and `/` → `/about/` HTTP 301s
├── about/index.html        # About page
├── learn/                  # Educational pages (safety stock simulator)
├── blog/                   # Blog index, article pages, publisher templates
├── robots.txt              # Allow crawling; points at the XML sitemap
├── sitemap.xml             # Public pages derived from static files + blog manifest
├── 404.html                # Custom 404; also disables Cloudflare Pages SPA fallback
├── scripts/
│   ├── verify_indexing.py  # Generate sitemap.xml; verify indexing + canonicals
│   ├── verify_redirects.mjs # Check www → apex and `/` → `/about/` 301 logic
│   └── verify_simulator.js # Smoke-check scenario data and Monte Carlo engine
├── assets/
│   ├── brand/              # Logo, photo, colour PDFs
│   ├── variables.css       # Brand colour tokens
│   └── styles.css          # Shared styles
└── README.md
```

## Search indexing files

`robots.txt` and `sitemap.xml` are real static files at the site root. Do not rely
on Cloudflare to invent them — without those files, Pages serves `/index.html`
for unmatched paths (SPA fallback), which then 301s to `/about/`.

The top-level `404.html` is required for the same reason: it switches Pages from
SPA fallback to a genuine HTTP 404 for missing URLs.

Regenerate and check the sitemap after publishing or removing a blog article:

```powershell
python scripts/verify_indexing.py --write
python scripts/verify_indexing.py
```

`sitemap.xml` lists `/`, `/about/`, `/blog/`, `/learn/safety-stock-simulator/`,
and each published article that exists as `blog/<slug>/index.html` (from
`blog/.posts.manifest.json`). Knowledge OS BlogPublisher does not update the
sitemap from this repo; regenerating it is companion work on each publish.

Check the safety stock simulator after changing scenario data or the engine:

```powershell
python scripts/verify_indexing.py --write
python scripts/verify_indexing.py
node scripts/verify_simulator.js
```

## Next pages (planned)

- `/product/` — Supply Planning application
- `/pricing/` — Monthly license
- `/l/*` — Campaign landing pages for cold email tests
