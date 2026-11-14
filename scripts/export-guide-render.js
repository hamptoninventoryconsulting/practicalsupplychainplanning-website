/**
 * Turn the supplied export-guide markdown into public HTML.
 * Verification marks stay in the PDF files. They are removed here.
 */
const fs = require("fs");
const path = require("path");
const MarkdownIt = require("markdown-it");

const ROOT = path.join(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "content", "export-guides");
const PDF_DIR = path.join(SOURCE_DIR, "pdf");
const SECTION = "/guides/getting-your-data-in/";
const PDF_HREF_DIR = `${SECTION}files/`;

const FILES_NEEDED =
  "**All 7 files are needed.** Open sales orders and open supply may be a header row only, when none are open. The other five files need at least one data row. Stock on hand with nothing in the warehouse is a row with quantity 0. Anything else you cannot fill in: email support@practicalsupplychainplanning.com.";

const UPLOAD_FAILURE =
  '**If the upload is refused:** a workbook or other non-CSV file gets “Couldn\'t use” followed by the file name, then “Please upload a CSV file. Practical Stock Planner imports CSV only.” Save it with *File › Save As › CSV UTF-8 (Comma delimited)* and upload the `.csv`. A file that is not UTF-8 gets “Couldn\'t read” followed by the file name, then “Save it as UTF-8 or UTF-8 with BOM and try again. In your spreadsheet, choose Save As > CSV UTF-8.” Save it again as CSV UTF-8 and upload the `.csv`.';

const TEMPLATES_FROM =
  "from the Practical Stock Planner sidebar (*📥 Templates*)";
const TEMPLATES_TO =
  "from Practical Stock Planner. Open **Load Data**, then open **Templates** in the sidebar";

const ROW_SYSTEMS = {
  "SKU Details": [
    ["Shopify", "shopify-products"],
    ["WooCommerce", "woocommerce-products"],
    ["Xero", "xero-products"],
    ["QuickBooks", "quickbooks-products"],
    ["Excel", "excel-templates"],
  ],
  SOH: [
    ["Shopify", "shopify-stock-on-hand"],
    ["WooCommerce", "woocommerce-stock-on-hand"],
    ["Xero", "xero-stock-on-hand"],
    ["QuickBooks", "quickbooks-stock-on-hand"],
    ["Excel", "excel-templates"],
  ],
  Open_SO: [
    ["Shopify", "shopify-open-sales-orders"],
    ["WooCommerce", "woocommerce-open-sales-orders"],
    ["Excel", "excel-templates"],
  ],
  Open_Supply: [
    ["Xero", "xero-open-purchase-orders"],
    ["QuickBooks", "quickbooks-open-purchase-orders"],
    ["Excel", "excel-templates"],
  ],
  Supplier_Details: [
    ["Xero", "xero-suppliers"],
    ["QuickBooks", "quickbooks-suppliers"],
    ["Excel", "excel-templates"],
  ],
  SKU_Supplier_Details: [["Excel", "excel-buying-terms"]],
  Forecast: [["Excel", "excel-forecast"]],
};

const CROSS_LINKS = [
  ["*Excel – SKU_Supplier_Details* guide", "excel-buying-terms", "Excel buying-terms guide"],
  ["*Excel – Forecast* guide", "excel-forecast", "Excel forecast guide"],
  ["Shopify Open_SO guide", "shopify-open-sales-orders", "Shopify open sales orders guide"],
  ["Shopify SOH guide", "shopify-stock-on-hand", "Shopify stock on hand guide"],
  ["WooCommerce SKU Details guide", "woocommerce-products", "WooCommerce products guide"],
  ["WooCommerce SOH guide", "woocommerce-stock-on-hand", "WooCommerce stock on hand guide"],
  ["QuickBooks SKU Details guide", "quickbooks-products", "QuickBooks products guide"],
  ["QuickBooks SOH guide", "quickbooks-stock-on-hand", "QuickBooks stock on hand guide"],
  ["Xero SOH guide", "xero-stock-on-hand", "Xero stock on hand guide"],
  ["Excel_SKU_Supplier_Details", "excel-buying-terms", "Excel buying terms"],
  ["Excel_Forecast", "excel-forecast", "Excel forecast"],
  ["Excel_Type_Into_Templates", "excel-templates", "Excel templates"],
];

function guideHref(slug) {
  return `${SECTION}${slug}/`;
}

function markdownLink(label, slug) {
  return `[${label}](${guideHref(slug)})`;
}

function stripVerificationTags(markdown) {
  let text = markdown.replace(/^\*\*Tags\b[^\n]*\n?/gm, "");
  text = text.replace(/^\*\*Checked:\*\*[^\n]*\n?/gm, "");
  text = text.replace(
    /^Excel tips are general Excel and are not tagged\. If a ([A-Za-z]+) label differs slightly, pick the closest match\.\n?/gm,
    "If a $1 label differs slightly, pick the closest match.\n"
  );
  text = text.replace(
    /\[(?:T|V|U)\s*[–—-]\s*(?:article\s+)?\[([^\]]+)\]\((https?:[^)\s]+)\)\]/g,
    "[$1]($2)"
  );
  text = text.replace(/\[(?:T|V|U)\b[^\]]*\]/g, "");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\s+([.,;:])/g, "$1");
  text = text.replace(/\(\s+/g, "(");
  text = text.replace(/\s+\)/g, ")");
  return text;
}

function applySharedWording(markdown) {
  let text = markdown.replaceAll(
    "Time-phased inventory planning",
    "Time-phased stock planning"
  );
  text = text.replaceAll(TEMPLATES_FROM, TEMPLATES_TO);
  text = text.replaceAll(
    '**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.',
    UPLOAD_FAILURE
  );
  text = text.replaceAll(
    '**Upload refused?** The message *"Please upload a CSV file... Save As CSV UTF-8"* means the file is an Excel workbook (`.xlsx`). Save it with *File › Save As › CSV UTF-8 (Comma delimited)* and upload the `.csv`.',
    UPLOAD_FAILURE
  );
  text = text.replaceAll(
    "**All 7 files are needed**, each with at least one data row. Nothing to enter? Contact support@practicalsupplychainplanning.com.",
    FILES_NEEDED
  );
  text = text.replaceAll(
    "**All 7 files are needed**, and each needs at least one data row. Nothing to enter in a file? Contact support@practicalsupplychainplanning.com.",
    FILES_NEEDED
  );
  return text;
}

function linkKnownGuides(markdown) {
  let text = markdown;
  for (const [phrase, slug, label] of CROSS_LINKS) {
    text = text.replaceAll(phrase, markdownLink(label, slug));
  }
  return text;
}

function linkIndex(markdown) {
  let text = markdown.replace(
    /^\| (\d+) \| \*\*([^*|]+)\*\* \| ([^|\n]+) \| ([^|\n]+) \| ([^|\n]+) \|$/gm,
    (full, num, file, type, holds, guides) => {
      const systems = ROW_SYSTEMS[file.trim()];
      if (!systems) {
        return full;
      }
      const linked = systems
        .map((pair, index) => {
          const label = index === systems.length - 1 && systems.length > 1
            ? `or ${markdownLink(pair[0], pair[1])}`
            : markdownLink(pair[0], pair[1]);
          return label;
        })
        .join(" · ");
      return `| ${num} | **${file.trim()}** | ${type.trim()} | ${holds.trim()} | ${linked} |`;
    }
  );
  text = text.replace(
    "use their SOH guide only if you track stock there",
    `use the ${markdownLink("Xero stock on hand guide", "xero-stock-on-hand")} or the ${markdownLink("QuickBooks stock on hand guide", "quickbooks-stock-on-hand")} only if you track stock there`
  );
  return text;
}

function prepareMarkdown(sourceName, markdown) {
  let text = String(markdown || "").replace(/\r\n/g, "\n");
  text = stripVerificationTags(text);
  text = applySharedWording(text);
  if (sourceName === "00_Index.md") {
    text = linkIndex(text);
  }
  text = linkKnownGuides(text);
  text = text.replace(/^- \[ \]/gm, "- ☐");
  return text;
}

function isSeparatorRow(line) {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function splitRow(line) {
  let inner = line.trim();
  if (inner.startsWith("|")) {
    inner = inner.slice(1);
  }
  if (inner.endsWith("|")) {
    inner = inner.slice(0, -1);
  }
  return inner.split("|").map((cell) => cell.trim());
}

function renderTable(md, lines) {
  const rows = lines.filter((line) => line.trim());
  const sepIndex = rows.findIndex(isSeparatorRow);
  const header = sepIndex === 1 ? splitRow(rows[0]) : null;
  const body = rows
    .slice(sepIndex === 1 ? 2 : 0)
    .filter((line) => !isSeparatorRow(line))
    .map(splitRow);
  const width = Math.max(
    header ? header.length : 0,
    ...body.map((row) => row.length),
    1
  );
  const pad = (row) => {
    const next = row.slice();
    while (next.length < width) {
      next.push("");
    }
    return next;
  };
  let html = '<div class="content-table-scroll"><table class="content-table">';
  if (header) {
    html += "<thead><tr>";
    for (const cell of pad(header)) {
      html += `<th>${md.renderInline(cell)}</th>`;
    }
    html += "</tr></thead>";
  }
  html += "<tbody>";
  for (const row of body) {
    html += "<tr>";
    for (const cell of pad(row)) {
      html += `<td>${md.renderInline(cell)}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table></div>";
  return html;
}

function renderMarkdown(markdown) {
  const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
  const lines = String(markdown || "").split("\n");
  const parts = [];
  let prose = [];
  let table = [];

  function flushProse() {
    if (!prose.length) {
      return;
    }
    const rendered = md.render(prose.join("\n")).trim();
    if (rendered) {
      parts.push(rendered);
    }
    prose = [];
  }

  function flushTable() {
    if (!table.length) {
      return;
    }
    parts.push(renderTable(md, table));
    table = [];
  }

  for (const line of lines) {
    if (/^\s*\|/.test(line)) {
      flushProse();
      table.push(line);
    } else {
      flushTable();
      prose.push(line);
    }
  }
  flushProse();
  flushTable();
  return parts.join("\n");
}

function finishHtml(html) {
  let page = html.replace("<h1>", '<h1 class="page-title">');
  page = page.replace(
    /<p><em>(Practical Stock Planner[\s\S]*?)<\/em><\/p>/,
    "<p class=\"tagline\">$1</p>"
  );
  page = page.replaceAll(
    "support@practicalsupplychainplanning.com",
    '<a class="support-email" href="mailto:support@practicalsupplychainplanning.com">support@practicalsupplychainplanning.com</a>'
  );
  return page;
}

function loadCatalog() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "src", "_data", "exportGuideCatalog.json"), "utf8")
  );
}

function buildGuidePages() {
  const catalog = loadCatalog();
  return catalog.map((entry) => {
    const sourcePath = path.join(SOURCE_DIR, entry.source);
    const pdfPath = path.join(PDF_DIR, entry.pdf);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing export guide markdown: ${entry.source}`);
    }
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Missing export guide PDF: ${entry.pdf}`);
    }
    const prepared = prepareMarkdown(entry.source, fs.readFileSync(sourcePath, "utf8"));
    const permalink = entry.slug ? `${SECTION}${entry.slug}/` : SECTION;
    return {
      id: entry.id,
      slug: entry.slug,
      source: entry.source,
      pdf: entry.pdf,
      title: entry.title,
      description: entry.description,
      note: entry.note,
      permalink,
      pdfHref: `${PDF_HREF_DIR}${entry.pdf}`,
      html: finishHtml(renderMarkdown(prepared)),
      prepared,
    };
  });
}

module.exports = {
  SECTION,
  PDF_DIR,
  PDF_HREF_DIR,
  buildGuidePages,
  prepareMarkdown,
  stripVerificationTags,
};
