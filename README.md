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

No build step is required — Cloudflare serves the static files directly.

## Structure

```text
Website/
├── index.html              # Redirects to /about/
├── about/index.html        # About page
├── assets/
│   ├── brand/              # Logo, photo, colour PDFs
│   ├── variables.css       # Brand colour tokens
│   └── styles.css          # Shared styles
└── README.md
```

## Next pages (planned)

- `/product/` — Supply Planning application
- `/pricing/` — Monthly license
- `/l/*` — Campaign landing pages for cold email tests
