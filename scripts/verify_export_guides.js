/**
 * Public export guides: cleaned HTML, PDF downloads, and the approved wording.
 * Run after `npm run build`.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { buildGuidePages, PDF_DIR } = require("./export-guide-render");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "_site");
const TAG_RE = /\[(?:T|V|U)\b[^\]]*\]/;
const CAVEAT = "checked against the vendor";
const EMPTY_FILE = "header row only, when none are open";
const SOH_ZERO = "Stock on hand with nothing in the warehouse is a row with quantity 0";
const LOAD_DATA = "Open <strong>Load Data</strong>, then open <strong>Templates</strong>";
const CSV_ONLY = "Practical Stock Planner imports CSV only.";
const UTF8 = "Save it as UTF-8 or UTF-8 with BOM";

const BANNED = [
  /not yet checked/i,
  /test login/i,
  /test drive/i,
  /test site/i,
  /delete that row/i,
  /reorder point/i,
  /\bROP\b/,
  /min\/max/i,
  /min-max/i,
  /"empty" Open_/,
  /At least one data row\. No open/,
];

const pages = buildGuidePages();
assert.strictEqual(pages.length, 18, "expected the index and 17 guides");

const index = pages.find((page) => page.id === "index");
assert.ok(index, "index page missing");
assert.ok(index.prepared.includes(EMPTY_FILE), "index is missing the empty-file rule");
assert.ok(index.prepared.includes(SOH_ZERO), "index is missing the stock-on-hand zero rule");
assert.ok(index.prepared.includes("Open **Load Data**, then open **Templates**"), "index templates wording");
assert.ok(index.prepared.includes("[Shopify](/guides/getting-your-data-in/shopify-products/)"), "index product links");
assert.ok(index.prepared.includes("[Excel templates](/guides/getting-your-data-in/excel-templates/)"), "index Excel link");
assert.ok(!index.prepared.includes("Excel_Type_Into_Templates"), "index still names the Excel file instead of linking");
assert.ok(index.prepared.includes("MYOB guides are on the way"), "MYOB note missing");
assert.ok(!index.prepared.includes("](/guides/getting-your-data-in/myob"), "MYOB must not be a page");
assert.ok(!index.prepared.includes("Time-phased inventory planning"), "subtitle still says inventory");
assert.ok(index.prepared.includes("Time-phased stock planning"), "subtitle should say stock");

for (const page of pages) {
  assert.ok(!TAG_RE.test(page.prepared), `${page.id} still has a verification mark in the public markdown`);
  for (const banned of BANNED) {
    assert.ok(!banned.test(page.prepared), `${page.id} public text matches ${banned}`);
    assert.ok(!banned.test(page.html), `${page.id} HTML matches ${banned}`);
  }
  assert.ok(!page.prepared.includes("**Tags"), `${page.id} still explains the verification marks`);
  assert.ok(!page.html.includes("[T]"), `${page.id} HTML still shows [T]`);
  assert.ok(!page.html.includes("[V]"), `${page.id} HTML still shows [V]`);
  assert.ok(!page.html.includes("[U]"), `${page.id} HTML still shows [U]`);
  assert.ok(page.html.includes('class="page-title"'), `${page.id} is missing its heading`);
  assert.strictEqual((page.html.match(/<h1\b/g) || []).length, 1, `${page.id} should have one h1 in the body`);
  assert.ok(page.html.includes("support-email"), `${page.id} support email is not a mail link`);
  if (page.id !== "index") {
    assert.ok(
      page.prepared.includes("Open **Load Data**, then open **Templates**") ||
        page.source === "00_Index.md",
      `${page.id} is missing the Load Data / Templates wording`
    );
  }
  const built = path.join(SITE, page.permalink.replace(/^\//, ""), "index.html");
  assert.ok(fs.existsSync(built), `built page missing: ${page.permalink}`);
  const html = fs.readFileSync(built, "utf8");
  assert.ok(html.includes(`<title>${page.title}</title>`), `${page.id} title tag`);
  assert.ok(html.includes(CAVEAT), `${page.id} is missing the caveat`);
  assert.ok(html.includes(`href="${page.pdfHref}"`), `${page.id} PDF link`);
  assert.ok(html.includes(`download="${page.pdf}"`), `${page.id} PDF download name`);
  assert.ok(!TAG_RE.test(html), `${page.id} built HTML still has a verification mark`);
  const pdf = path.join(SITE, "guides", "getting-your-data-in", "files", page.pdf);
  assert.ok(fs.existsSync(pdf), `PDF was not copied: ${page.pdf}`);
  const size = fs.statSync(pdf).size;
  assert.ok(size > 1000, `${page.pdf} looks empty`);
  assert.strictEqual(size, fs.statSync(path.join(PDF_DIR, page.pdf)).size, `${page.pdf} size changed`);
}

const xero = pages.find((page) => page.id === "xero-stock-on-hand");
assert.ok(xero.prepared.includes(CSV_ONLY), "Xero stock guide is missing the CSV-only message");
assert.ok(xero.prepared.includes(UTF8), "Xero stock guide is missing the UTF-8 message");
assert.ok(xero.html.includes(LOAD_DATA), "Xero stock guide templates wording did not render");

const typing = pages.find((page) => page.id === "excel-templates");
assert.ok(typing.prepared.includes(EMPTY_FILE), "Excel templates guide is missing the empty-file rule");
assert.ok(
  typing.prepared.includes("[Excel buying-terms guide](/guides/getting-your-data-in/excel-buying-terms/)"),
  "Excel templates guide should link to buying terms"
);

const welcome = fs.readFileSync(path.join(SITE, "welcome", "index.html"), "utf8");
assert.ok(welcome.includes("Getting your data ready"), "welcome heading");
assert.ok(welcome.includes("Upload your CSV files."), "welcome step 2");
assert.ok(!welcome.includes("paste them in"), "welcome still says paste them in");
assert.ok(
  welcome.includes('href="/guides/getting-your-data-in/">Getting your data in</a>'),
  "welcome link"
);

const product = fs.readFileSync(
  path.join(SITE, "products", "practical-stock-planner", "index.html"),
  "utf8"
);
assert.ok(
  product.includes('href="/guides/getting-your-data-in/">Getting your data in</a>'),
  "product page link"
);

const faq = fs.readFileSync(path.join(SITE, "faq", "index.html"), "utf8");
assert.ok(faq.includes('href="/guides/getting-your-data-in/"'), "FAQ link");

console.log("export guides ok");
