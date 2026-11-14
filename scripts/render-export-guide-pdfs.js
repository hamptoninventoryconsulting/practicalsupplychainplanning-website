/**
 * Write each guide PDF from the same public wording as the HTML page.
 * Run: node scripts/render-export-guide-pdfs.js
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildGuidePages, PDF_DIR } = require("./export-guide-render");

const CHROME = process.env.CHROME_PATH || "/opt/google/chrome/chrome";

function caveat(note) {
  if (note === "index") {
    return "Some steps in these guides were checked against the vendor’s help pages, not in a live account. If a screen looks different, email support@practicalsupplychainplanning.com.";
  }
  return "Some steps were checked against the vendor’s help pages, not in a live account. If a screen looks different, email support@practicalsupplychainplanning.com.";
}

function pageHtml(page) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${page.title}</title>
  <style>
    body { font-family: sans-serif; font-size: 11pt; line-height: 1.45; margin: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; text-align: left; }
    code { font-size: 0.9em; }
    blockquote { margin-left: 0; padding-left: 12px; border-left: 3px solid #ccc; }
  </style>
</head>
<body>
${page.html}
<p><strong>Note.</strong> ${caveat(page.note)}</p>
</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(CHROME)) {
    throw new Error("Chrome is not at " + CHROME);
  }
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pscp-guide-pdf-"));
  for (const page of buildGuidePages()) {
    const htmlPath = path.join(tmp, page.pdf + ".html");
    const out = path.join(PDF_DIR, page.pdf);
    fs.writeFileSync(htmlPath, pageHtml(page));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pscp-guide-chrome-"));
    const result = spawnSync(
      CHROME,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--no-pdf-header-footer",
        "--user-data-dir=" + profile,
        "--print-to-pdf=" + out,
        "file://" + htmlPath,
      ],
      { encoding: "utf8", timeout: 30000 }
    );
    if (result.status !== 0 || !fs.existsSync(out)) {
      throw new Error(
        "PDF failed for " + page.pdf + "\n" + (result.stderr || result.stdout || "")
      );
    }
    console.log(page.pdf, fs.statSync(out).size);
  }
}

main();
