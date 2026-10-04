/**
 * Website results email. Any page that posts a checked summary can reuse this.
 * RESULTS_EMAIL must be the string "on" or the send route stays closed.
 * EMAIL_DB stores consent, the do-not-email list, and rate limits.
 * Unsubscribe and bounce handling stay available when their own secrets are set,
 * even if RESULTS_EMAIL is not "on".
 * Secrets are read from the Pages environment. None are written here.
 * The summary used to build an email is not stored.
 */

import site from "../../src/_data/site.js";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS consent (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip TEXT NOT NULL,
  form_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  wording_version TEXT NOT NULL,
  wording_text TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  results_box INTEGER NOT NULL,
  articles_box INTEGER NOT NULL,
  resend_message_id TEXT,
  unsubscribe_token TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS consent_email_created ON consent (email, created_at);
CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resend_event_id TEXT
);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_hits_email_created ON rate_hits (email, created_at);
CREATE INDEX IF NOT EXISTS rate_hits_ip_created ON rate_hits (ip, created_at);
`;

export const WORDING_VERSION = "sim-results-v1";
export const REQUIRED_WORDING =
  "Email me the results of the scenario I ran. This is a one-off email.";
export const OPTIONAL_WORDING =
  "Also send me new articles from Practical Supply Chain Planning. Unsubscribe any time.";
export const SUCCESS_MESSAGE = "Sent. Check your inbox (and spam folder).";
export const SUBJECT = "Your Safety Stock Simulator results: the scenario you ran";
export const FROM_ADDRESS =
  "Daniel at Practical Supply Chain Planning <hello@news.practicalsupplychainplanning.com>";
export const REPLY_TO = "support@practicalsupplychainplanning.com";
export const DISCLAIMER =
  "These numbers come from a teaching simulation of the scenario you ran. They are not a forecast, a recommendation or advice for your business.";
export const UNAVAILABLE = "This form is not available yet.";
export const IP_LIMIT = 5;
export const EMAIL_LIMIT = 3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_BODY = 450000;
const MAX_CHART_BYTES = 400 * 1024;
const WEBHOOK_MAX = 100000;
const SITE = "https://practicalsupplychainplanning.com";

const METRIC_FIELDS = [
  ["oosWeeks", "Out-of-stock weeks", "count"],
  ["csl", "Customer service level", "percent"],
  ["inventoryTurns", "Inventory turns", "turns"],
  ["averageWc", "Average working capital", "money"],
  ["annualGp", "Annual gross profit", "money"],
  ["safetyStock", "Safety stock", "count"],
];

export function sendingEnabled(env) {
  return Boolean(env && env.RESULTS_EMAIL === "on");
}

export async function ensureSchema(db) {
  const statements = SCHEMA_SQL.split(";")
    .map(function (part) {
      return part.trim();
    })
    .filter(Boolean);
  for (let i = 0; i < statements.length; i += 1) {
    await db.prepare(statements[i]).run();
  }
}

export async function handleResultsEmail(request, env, deps) {
  const tools = deps || defaultDeps();
  try {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: UNAVAILABLE });
    }
    if (!sendingEnabled(env)) {
      return json(404, { ok: false, error: UNAVAILABLE });
    }
    if (!originAllowed(request)) {
      return json(403, { ok: false, error: "Check the form and try again." });
    }
    if (
      !env.EMAIL_DB ||
      !env.TURNSTILE_SECRET_KEY ||
      !env.RESEND_API_KEY ||
      !env.UNSUBSCRIBE_SIGNING_KEY
    ) {
      return json(503, { ok: false, error: UNAVAILABLE });
    }
    const raw = await readBody(request, MAX_BODY);
    const body = parseJson(raw);
    if (honeypotFilled(body)) {
      return json(200, { ok: true, message: SUCCESS_MESSAGE });
    }
    const submission = validateSubmission(body);
    const ip = clientIp(request);
    if (!ip) {
      throw new HttpError(400, "Check the form and try again.");
    }
    await verifyTurnstile(tools.fetch, env.TURNSTILE_SECRET_KEY, submission.turnstileToken, ip);
    const now = new Date(tools.now());
    const createdAt = now.toISOString();
    await ensureSchema(env.EMAIL_DB);
    await prune(env.EMAIL_DB, now);
    await run(
      env.EMAIL_DB,
      "INSERT INTO rate_hits (email, ip, created_at) VALUES (?, ?, ?)",
      [submission.email, ip, createdAt]
    );
    const ipCount = await countSince(
      env.EMAIL_DB,
      "SELECT COUNT(*) AS n FROM rate_hits WHERE ip = ? AND created_at > ?",
      [ip, new Date(now.getTime() - HOUR_MS).toISOString()]
    );
    const emailCount = await countSince(
      env.EMAIL_DB,
      "SELECT COUNT(*) AS n FROM rate_hits WHERE email = ? AND created_at > ?",
      [submission.email, new Date(now.getTime() - DAY_MS).toISOString()]
    );
    if (ipCount > IP_LIMIT || emailCount > EMAIL_LIMIT) {
      throw new HttpError(429, "That address or network has sent several of these already. Try again later.");
    }
    const blocked = await first(
      env.EMAIL_DB,
      "SELECT reason FROM suppression WHERE email = ?",
      [submission.email]
    );
    if (blocked) {
      throw new HttpError(
        403,
        "This address is unsubscribed. Email support@practicalsupplychainplanning.com if you want results again."
      );
    }
    const token = tools.randomToken();
    const message = await buildMessage(submission, token, env.UNSUBSCRIBE_SIGNING_KEY);
    assertCleanCopy(message.text);
    const sent = await sendEmail(tools.fetch, env.RESEND_API_KEY, message);
    const consentId = tools.randomToken();
    await run(
      env.EMAIL_DB,
      `INSERT INTO consent (
        id, email, created_at, ip, form_id, page_url, wording_version, wording_text,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        results_box, articles_box, resend_message_id, unsubscribe_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consentId,
        submission.email,
        createdAt,
        ip,
        submission.formId,
        submission.pageUrl,
        WORDING_VERSION,
        REQUIRED_WORDING + "\n" + OPTIONAL_WORDING,
        submission.utm.source,
        submission.utm.medium,
        submission.utm.campaign,
        submission.utm.term,
        submission.utm.content,
        1,
        submission.articles ? 1 : 0,
        sent.id,
        token,
      ]
    );
    if (submission.articles && env.RESEND_ARTICLES_AUDIENCE_ID) {
      await addArticlesContact(tools.fetch, env, submission.email);
    }
    return json(200, { ok: true, message: SUCCESS_MESSAGE });
  } catch (err) {
    if (err instanceof HttpError) {
      return json(err.status, { ok: false, error: err.message });
    }
    return json(500, { ok: false, error: "We couldn't send that. Try again in a minute." });
  }
}

export async function handleResendWebhook(request, env, deps) {
  const tools = deps || defaultDeps();
  try {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: UNAVAILABLE });
    }
    if (!env || !env.RESEND_WEBHOOK_SECRET) {
      return json(404, { ok: false, error: UNAVAILABLE });
    }
    const raw = await readBody(request, WEBHOOK_MAX);
    const id = request.headers.get("svix-id") || "";
    const timestamp = request.headers.get("svix-timestamp") || "";
    const signature = request.headers.get("svix-signature") || "";
    const valid = await verifyWebhookSignature({
      secret: env.RESEND_WEBHOOK_SECRET,
      id: id,
      timestamp: timestamp,
      signature: signature,
      body: raw,
      nowMs: tools.now(),
    });
    if (!valid) {
      return json(400, { ok: false });
    }
    if (!env.EMAIL_DB) {
      return json(503, { ok: false, error: UNAVAILABLE });
    }
    await ensureSchema(env.EMAIL_DB);
    const payload = parseJson(raw);
    const createdAt = new Date(tools.now()).toISOString();
    try {
      await run(
        env.EMAIL_DB,
        "INSERT INTO webhook_events (event_id, created_at) VALUES (?, ?)",
        [id, createdAt]
      );
    } catch (err) {
      if (isUniqueError(err)) {
        return json(200, { ok: true });
      }
      throw err;
    }
    await applyWebhook(env.EMAIL_DB, payload, id, createdAt);
    return json(200, { ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return json(err.status, { ok: false });
    }
    return json(500, { ok: false });
  }
}

export async function handleUnsubscribe(request, env, deps) {
  const tools = deps || defaultDeps();
  if (request.method !== "GET" && request.method !== "POST") {
    return html(405, "This unsubscribe link is not valid.");
  }
  if (!env || !env.EMAIL_DB || !env.UNSUBSCRIBE_SIGNING_KEY) {
    return html(200, "Unsubscribe is not available yet.");
  }
  try {
    const raw = request.method === "POST" ? await readBody(request, 2000) : "";
    await ensureSchema(env.EMAIL_DB);
    const token = new URL(request.url).searchParams.get("t") || "";
    const id = await unsubscribeId(
      token,
      env.UNSUBSCRIBE_SIGNING_KEY,
      env.UNSUBSCRIBE_SIGNING_KEY_PREVIOUS
    );
    if (!id) {
      return html(200, "This unsubscribe link is not valid.");
    }
    const row = await first(
      env.EMAIL_DB,
      "SELECT email FROM consent WHERE unsubscribe_token = ?",
      [id]
    );
    if (!row || !row.email) {
      return html(200, "This unsubscribe link is not valid.");
    }
    if (request.method !== "POST" || (!isOneClick(raw) && !isConfirmPost(raw))) {
      return confirmPage(request.url);
    }
    const createdAt = new Date(tools.now()).toISOString();
    await suppress(env.EMAIL_DB, row.email, "unsubscribe", "link:" + id, createdAt);
    await removeArticlesContact(tools.fetch, env, row.email);
    return html(200, "You are unsubscribed. We will not email this address again.");
  } catch (err) {
    return html(500, "This unsubscribe link is not valid.");
  }
}

export async function verifyWebhookSignature(input) {
  if (!input.id || !input.timestamp || !input.signature || input.body == null) {
    return false;
  }
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) {
    return false;
  }
  const nowSec = Math.floor(Number(input.nowMs) / 1000);
  if (Math.abs(nowSec - ts) > 300) {
    return false;
  }
  let expected;
  try {
    expected = await hmacSha256(input.secret, input.id + "." + input.timestamp + "." + input.body);
  } catch (err) {
    return false;
  }
  const parts = String(input.signature).split(" ");
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const value = part.indexOf(",") === -1 ? part : part.slice(part.indexOf(",") + 1);
    if (safeEqual(value, expected)) {
      return true;
    }
  }
  return false;
}

export async function signWebhook(secret, id, timestamp, body) {
  const mac = await hmacSha256(secret, id + "." + timestamp + "." + body);
  return "v1," + mac;
}

const CHART_LINE = "Chart: ending stock and safety stock across 52 weeks.";

// Own-data One year sends one chart per SKU, in SKU order. Those pictures sit
// under that SKU. Any other count keeps the chart list, with its titles, at the end.
function chartsPairedWithSkus(summary) {
  return (
    summary.kind === "own-data" &&
    Array.isArray(summary.skus) &&
    Array.isArray(summary.charts) &&
    summary.charts.length > 0 &&
    summary.charts.length === summary.skus.length
  );
}

function chartImageTag(index) {
  return (
    "<img src=\"cid:chart" +
    (index + 1) +
    "\" alt=\"Chart of ending stock and safety stock across 52 weeks.\" width=\"640\">"
  );
}

export async function buildMessage(submission, token, signingKey) {
  const summary = submission.summary;
  const unsub = await unsubscribeUrl(token, signingKey);
  const pairedCharts = chartsPairedWithSkus(summary);
  const blocks = [];
  blocks.push("Mode: " + (summary.mode === "monte-carlo" ? "Monte Carlo (fifty years)" : "One year"));
  blocks.push("Seed: " + String(summary.seed));
  blocks.push("");
  blocks.push("Settings used");
  summary.settings.forEach(function (row) {
    blocks.push(row.label + ": " + row.value);
  });
  if (summary.kind !== "own-data") {
    blocks.push("");
    blocks.push("Key numbers");
    metricLines(summary.metrics).forEach(function (line) {
      blocks.push(line);
    });
    if (summary.metrics.turnsNote) {
      blocks.push(summary.metrics.turnsNote);
    }
  }
  if (summary.kind === "own-data") {
    blocks.push("");
    blocks.push("Per SKU");
    summary.skus.forEach(function (sku) {
      blocks.push(sku.label);
      metricLines(sku.metrics).forEach(function (line) {
        blocks.push("  " + line);
      });
      if (pairedCharts) {
        blocks.push(CHART_LINE);
      }
    });
    if (summary.totals) {
      blocks.push(
        "Total average working capital: " + formatMetric(summary.totals.averageWc, "money")
      );
      blocks.push("Total annual gross profit: " + formatMetric(summary.totals.annualGp, "money"));
    }
  }
  blocks.push("");
  summary.commentary.forEach(function (line) {
    blocks.push(line);
  });
  if (!pairedCharts && summary.mode === "year" && summary.charts.length) {
    blocks.push("");
    blocks.push(CHART_LINE);
    summary.charts.forEach(function (chart) {
      if (chart.title) {
        blocks.push(chart.title);
      }
    });
  }
  blocks.push("");
  blocks.push("Reopen this scenario");
  blocks.push(summary.reopenUrl);
  if (summary.kind === "own-data") {
    blocks.push("Anyone with this link can read the numbers in it.");
  }
  blocks.push("");
  blocks.push("Planning stock in a spreadsheet? Stock Planner plans by weeks of cover.");
  blocks.push(stockPlannerUrl());
  blocks.push("");
  blocks.push(
    summary.kind === "teaching"
      ? "Teaching prices are $100 sell and $70 cost. This gross profit multiplies all simulated demand by $30, including units the year could not fill."
      : "Annual gross profit counts only units actually sold."
  );
  blocks.push("");
  blocks.push(DISCLAIMER);
  blocks.push("");
  blocks.push(sellerLine());
  blocks.push("You're receiving this because you asked for the results of the scenario you ran.");
  if (submission.articles) {
    blocks.push("You also asked to hear about new articles. Unsubscribe any time.");
  }
  blocks.push("Unsubscribe: " + unsub);
  blocks.push(REPLY_TO);
  const text = blocks.join("\n");
  const html = htmlMessage(submission, token, unsub);
  assertCleanCopy(text);
  assertCleanCopy(html.replace(/<[^>]+>/g, " "));
  return {
    from: FROM_ADDRESS,
    to: [submission.email],
    reply_to: REPLY_TO,
    subject: SUBJECT,
    text: text,
    html: html,
    headers: {
      "List-Unsubscribe":
        "<mailto:" + REPLY_TO + "?subject=Unsubscribe>, <" + unsub + ">",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    attachments: summary.charts.map(function (chart, index) {
      return {
        filename: "chart-" + (index + 1) + ".png",
        content: chart.pngBase64,
        content_type: "image/png",
        content_id: "chart" + (index + 1),
      };
    }),
  };
}

function htmlMessage(submission, token, unsub) {
  const summary = submission.summary;
  const pairedCharts = chartsPairedWithSkus(summary);
  const parts = [];
  parts.push("<!DOCTYPE html><html><body style=\"font-family:Georgia,serif;color:#1c1917;\">");
  parts.push("<p>Mode: " + escapeHtml(summary.mode === "monte-carlo" ? "Monte Carlo (fifty years)" : "One year") + "<br>Seed: " + escapeHtml(String(summary.seed)) + "</p>");
  parts.push("<p><strong>Settings used</strong></p><ul>");
  summary.settings.forEach(function (row) {
    parts.push("<li>" + escapeHtml(row.label) + ": " + escapeHtml(row.value) + "</li>");
  });
  if (summary.kind !== "own-data") {
    parts.push("</ul><p><strong>Key numbers</strong></p><ul>");
    metricLines(summary.metrics).forEach(function (line) {
      parts.push("<li>" + escapeHtml(line) + "</li>");
    });
    parts.push("</ul>");
    if (summary.metrics.turnsNote) {
      parts.push("<p>" + escapeHtml(summary.metrics.turnsNote) + "</p>");
    }
  } else {
    parts.push("</ul>");
  }
  if (summary.kind === "own-data") {
    parts.push("<p><strong>Per SKU</strong></p>");
    summary.skus.forEach(function (sku, index) {
      parts.push("<p>" + escapeHtml(sku.label) + "</p><ul>");
      metricLines(sku.metrics).forEach(function (line) {
        parts.push("<li>" + escapeHtml(line) + "</li>");
      });
      parts.push("</ul>");
      if (pairedCharts) {
        parts.push(chartImageTag(index));
      }
    });
  }
  summary.commentary.forEach(function (line) {
    parts.push("<p>" + escapeHtml(line) + "</p>");
  });
  if (!pairedCharts) {
    summary.charts.forEach(function (chart, index) {
      if (chart.title) {
        parts.push("<p>" + escapeHtml(chart.title) + "</p>");
      }
      parts.push(chartImageTag(index));
    });
  }
  parts.push(
    "<p><a href=\"" +
      escapeHtml(summary.reopenUrl) +
      "\">Reopen this scenario</a></p>"
  );
  if (summary.kind === "own-data") {
    parts.push("<p>Anyone with this link can read the numbers in it.</p>");
  }
  parts.push(
    "<p>Planning stock in a spreadsheet? <a href=\"" +
      escapeHtml(stockPlannerUrl()) +
      "\">Stock Planner</a> plans by weeks of cover.</p>"
  );
  parts.push("<p>" + escapeHtml(DISCLAIMER) + "</p>");
  parts.push(
    "<p>" +
      escapeHtml(sellerLine()) +
      "<br>You're receiving this because you asked for the results of the scenario you ran."
  );
  if (submission.articles) {
    parts.push("<br>You also asked to hear about new articles. Unsubscribe any time.");
  }
  parts.push(
    "<br><a href=\"" +
      escapeHtml(unsub) +
      "\">Unsubscribe</a><br><a href=\"mailto:" +
      REPLY_TO +
      "\">" +
      REPLY_TO +
      "</a></p></body></html>"
  );
  return parts.join("");
}

function metricLines(metrics) {
  return METRIC_FIELDS.map(function (field) {
    const medianOnly = field[0] === "annualGp";
    return field[1] + ": " + formatMetric(metrics[field[0]], field[2], medianOnly);
  });
}

function formatMetric(value, kind, medianOnly) {
  if (value && typeof value === "object") {
    if (medianOnly || value.p10 == null || value.p90 == null) {
      return "Median " + formatPoint(value.median, kind);
    }
    return (
      "Median " +
      formatPoint(value.median, kind) +
      " (P10 " +
      formatPoint(value.p10, kind) +
      "–P90 " +
      formatPoint(value.p90, kind) +
      ")"
    );
  }
  return formatPoint(value, kind);
}

function formatPoint(value, kind) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "N/A";
  }
  const n = Number(value);
  if (kind === "turns") {
    return n.toFixed(2);
  }
  if (kind === "percent") {
    return n.toFixed(1) + "%";
  }
  if (kind === "money") {
    const rounded = Math.round(n);
    const sign = rounded < 0 ? "-" : "";
    return sign + "$" + Math.abs(rounded).toLocaleString("en-US");
  }
  if (Math.abs(n - Math.round(n)) < 1e-9) {
    return String(Math.round(n));
  }
  return n.toFixed(1);
}

function stockPlannerUrl() {
  return (
    SITE +
    "/buy/?utm_source=results-email&utm_medium=email&utm_campaign=" +
    WORDING_VERSION
  );
}

function validateSubmission(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Check the form and try again.");
  }
  onlyKeys(body, [
    "email",
    "resultsConsent",
    "articlesConsent",
    "company",
    "turnstileToken",
    "pageUrl",
    "utm",
    "wordingVersion",
    "wordingText",
    "formId",
    "summary",
  ]);
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (body.resultsConsent !== true) {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (body.wordingVersion !== WORDING_VERSION) {
    throw new HttpError(400, "Check the form and try again.");
  }
  const wording = body.wordingText;
  if (!wording || wording.required !== REQUIRED_WORDING || wording.optional !== OPTIONAL_WORDING) {
    throw new HttpError(400, "Check the form and try again.");
  }
  // A later results page adds its form id here. The check, the record, and the do-not-email list stay shared.
  if (body.formId !== "safety-stock-simulator" && body.formId !== "own-data-simulator") {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (typeof body.turnstileToken !== "string" || body.turnstileToken.length < 8 || body.turnstileToken.length > 2048) {
    throw new HttpError(400, "The check failed. Refresh the page and try again.");
  }
  const pageUrl = cleanPageUrl(body.pageUrl, body.formId);
  const summary = validateSummary(body.summary, email);
  if (body.formId === "own-data-simulator" && summary.kind !== "own-data") {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (body.formId === "safety-stock-simulator" && summary.kind !== "teaching") {
    throw new HttpError(400, "Check the form and try again.");
  }
  return {
    email: email,
    articles: body.articlesConsent === true,
    turnstileToken: body.turnstileToken,
    formId: body.formId,
    pageUrl: pageUrl,
    utm: cleanUtm(body.utm),
    summary: summary,
  };
}

function validateSummary(summary, email) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new HttpError(400, "Check the form and try again.");
  }
  onlyKeys(summary, ["kind", "mode", "seed", "settings", "metrics", "commentary", "skus", "totals", "reopenUrl", "charts"]);
  if (summary.kind !== "teaching" && summary.kind !== "own-data") {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (summary.mode !== "year" && summary.mode !== "monte-carlo") {
    throw new HttpError(400, "Check the form and try again.");
  }
  const seed = Number(summary.seed);
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) {
    throw new HttpError(400, "Check the form and try again.");
  }
  const settings = settingRows(summary.settings);
  const metrics = validateMetrics(summary.metrics);
  const commentary = validateCommentary(summary.commentary);
  let skus = null;
  let totals = null;
  if (summary.kind === "own-data") {
    if (!Array.isArray(summary.skus) || summary.skus.length < 1 || summary.skus.length > 10) {
      throw new HttpError(400, "Check the form and try again.");
    }
    skus = summary.skus.map(function (sku) {
      onlyKeys(sku, ["label", "settings", "metrics"]);
      return {
        label: shortText(sku.label, 40),
        settings: settingRows(sku.settings),
        metrics: validateMetrics(sku.metrics),
      };
    });
    if (summary.totals) {
      onlyKeys(summary.totals, ["averageWc", "annualGp"]);
      totals = {
        averageWc: plainNumber(summary.totals.averageWc),
        annualGp: plainNumber(summary.totals.annualGp),
      };
    }
  } else if (summary.skus != null || summary.totals != null) {
    throw new HttpError(400, "Check the form and try again.");
  }
  const charts = validateCharts(summary.charts, summary.mode, summary.kind);
  const reopenUrl = validateReopen(summary.reopenUrl, summary.kind, email);
  return {
    kind: summary.kind,
    mode: summary.mode,
    seed: seed,
    settings: settings,
    metrics: metrics,
    commentary: commentary,
    skus: skus,
    totals: totals,
    charts: charts,
    reopenUrl: reopenUrl,
  };
}

function validateMetrics(metrics) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    throw new HttpError(400, "Check the form and try again.");
  }
  onlyKeys(metrics, ["oosWeeks", "csl", "inventoryTurns", "averageWc", "annualGp", "safetyStock", "turnsNote"]);
  const out = {};
  METRIC_FIELDS.forEach(function (field) {
    out[field[0]] = metricValue(metrics[field[0]]);
  });
  if (metrics.turnsNote != null) {
    out.turnsNote = shortText(metrics.turnsNote, 200);
  }
  return out;
}

function metricValue(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "number") {
    return plainNumber(value);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    onlyKeys(value, ["median", "p10", "p90"]);
    const band = { median: plainNumber(value.median) };
    if (value.p10 != null) {
      band.p10 = plainNumber(value.p10);
    }
    if (value.p90 != null) {
      band.p90 = plainNumber(value.p90);
    }
    return band;
  }
  throw new HttpError(400, "Check the form and try again.");
}

function validateCommentary(lines) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 3) {
    throw new HttpError(400, "Check the form and try again.");
  }
  return lines.map(function (line) {
    const text = shortText(line, 400);
    if (text.indexOf("In the scenario you ran") !== 0) {
      throw new HttpError(400, "Check the form and try again.");
    }
    return text;
  });
}

function validateCharts(charts, mode, kind) {
  if (mode !== "year") {
    if (charts != null && !(Array.isArray(charts) && charts.length === 0)) {
      throw new HttpError(400, "Check the form and try again.");
    }
    return [];
  }
  if (!Array.isArray(charts) || charts.length < 1) {
    throw new HttpError(400, "Check the form and try again.");
  }
  const max = kind === "own-data" ? 10 : 1;
  if (charts.length > max) {
    throw new HttpError(400, "Check the form and try again.");
  }
  let total = 0;
  return charts.map(function (chart) {
    onlyKeys(chart, ["title", "pngBase64"]);
    const png = String(chart.pngBase64 || "").replace(/\s/g, "");
    const bytes = decodeBase64(png);
    if (!bytes || bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      throw new HttpError(400, "Check the form and try again.");
    }
    total += bytes.length;
    if (total > MAX_CHART_BYTES) {
      throw new HttpError(400, "Check the form and try again.");
    }
    return {
      title: chart.title ? shortText(chart.title, 80) : "",
      pngBase64: png,
    };
  });
}

function validateReopen(value, kind, email) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch (err) {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (url.protocol !== "https:" || url.hostname !== "practicalsupplychainplanning.com") {
    throw new HttpError(400, "Check the form and try again.");
  }
  const expected =
    kind === "own-data"
      ? "/learn/safety-stock-simulator/own-data/"
      : "/learn/safety-stock-simulator/";
  if (url.pathname !== expected) {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (url.searchParams.get("utm_source") !== "results-email") {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (url.searchParams.get("utm_medium") !== "email") {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (url.searchParams.get("utm_campaign") !== WORDING_VERSION) {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (url.href.toLowerCase().indexOf(email) !== -1 || url.href.indexOf("@") !== -1) {
    throw new HttpError(400, "Check the form and try again.");
  }
  return url.href;
}

function settingRows(value) {
  if (!Array.isArray(value) || value.length > 40) {
    throw new HttpError(400, "Check the form and try again.");
  }
  return value.map(function (row) {
    onlyKeys(row, ["label", "value"]);
    return { label: shortText(row.label, 80), value: shortText(row.value, 200) };
  });
}

function cleanPageUrl(value, formId) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch (err) {
    throw new HttpError(400, "Check the form and try again.");
  }
  if (url.protocol !== "https:" || !hostAllowed(url.hostname)) {
    throw new HttpError(400, "Check the form and try again.");
  }
  const expected =
    formId === "own-data-simulator"
      ? "/learn/safety-stock-simulator/own-data/"
      : "/learn/safety-stock-simulator/";
  if (url.pathname !== expected) {
    throw new HttpError(400, "Check the form and try again.");
  }
  url.hash = "";
  const drop = [];
  url.searchParams.forEach(function (paramValue, key) {
    if (key.toLowerCase() === "email" || String(paramValue).indexOf("@") !== -1) {
      drop.push(key);
    }
  });
  drop.forEach(function (key) {
    url.searchParams.delete(key);
  });
  const page = url.pathname + url.search;
  if (page.length > 2000) {
    throw new HttpError(400, "Check the form and try again.");
  }
  return page;
}

function cleanUtm(value) {
  const source = value && typeof value === "object" ? value : {};
  onlyKeys(source, ["source", "medium", "campaign", "term", "content"]);
  function pick(key) {
    if (source[key] == null || source[key] === "") {
      return null;
    }
    return shortText(source[key], 120);
  }
  return {
    source: pick("source"),
    medium: pick("medium"),
    campaign: pick("campaign"),
    term: pick("term"),
    content: pick("content"),
  };
}

function honeypotFilled(body) {
  if (!body || typeof body !== "object") {
    return false;
  }
  return typeof body.company === "string" && body.company.trim() !== "";
}

function clientIp(request) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) {
    return "";
  }
  const trimmed = ip.trim();
  if (!trimmed || trimmed.length > 80 || trimmed.indexOf("@") !== -1) {
    return "";
  }
  return trimmed;
}

export function sellerLineText(abn) {
  const base = site.name + " (Daniel Hampton, sole trader)";
  if (abn && abn !== "[ABN]") {
    return base + ", ABN " + abn;
  }
  return base;
}

function sellerLine() {
  return sellerLineText(site.abn);
}

function originAllowed(request) {
  const origin = request.headers.get("origin");
  // A missing Origin is refused. Browsers send Origin on this POST.
  if (!origin) {
    return false;
  }
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && hostAllowed(url.hostname);
  } catch (err) {
    return false;
  }
}

function hostAllowed(hostname) {
  return (
    hostname === "practicalsupplychainplanning.com" ||
    hostname === "www.practicalsupplychainplanning.com" ||
    hostname.endsWith(".practicalsupplychainplanning-website.pages.dev")
  );
}

function turnstileHostnameAllowed(hostname) {
  return (
    hostname === "practicalsupplychainplanning.com" ||
    hostname === "www.practicalsupplychainplanning.com"
  );
}

async function verifyTurnstile(fetchImpl, secret, token, ip) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  body.set("remoteip", ip);
  const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: body,
  });
  const data = await response.json();
  const hostname = data && typeof data.hostname === "string" ? data.hostname : "";
  const errorCodes = data && Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
  if (!data || data.success !== true || !turnstileHostnameAllowed(hostname)) {
    console.log(
      JSON.stringify({
        source: "turnstile-siteverify",
        hostname: hostname,
        errorCodes: errorCodes,
      })
    );
    throw new HttpError(400, "The check failed. Refresh the page and try again.");
  }
}

async function sendEmail(fetchImpl, apiKey, message) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: "Bearer " + apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new HttpError(502, "We couldn't send that. Try again in a minute.");
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new HttpError(502, "We couldn't send that. Try again in a minute.");
  }
  if (!data || typeof data.id !== "string" || !data.id) {
    throw new HttpError(502, "We couldn't send that. Try again in a minute.");
  }
  return data;
}

export async function signUnsubscribeToken(id, signingKey) {
  const sig = await hmacHex(signingKey, id);
  return id + "." + sig;
}

async function unsubscribeUrl(token, signingKey) {
  const signed = await signUnsubscribeToken(token, signingKey);
  return SITE + "/unsubscribe/?t=" + encodeURIComponent(signed);
}

async function unsubscribeId(token, signingKey, previousKey) {
  if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)) {
    return "";
  }
  const id = token.slice(0, 64);
  const sig = token.slice(65);
  if (await signatureMatches(signingKey, id, sig)) {
    return id;
  }
  if (previousKey && (await signatureMatches(previousKey, id, sig))) {
    return id;
  }
  return "";
}

async function signatureMatches(key, id, sig) {
  try {
    return safeEqual(sig, await hmacHex(key, id));
  } catch (err) {
    return false;
  }
}

function isOneClick(raw) {
  return String(raw || "").trim() === "List-Unsubscribe=One-Click";
}

function isConfirmPost(raw) {
  return new URLSearchParams(String(raw || "")).get("confirm") === "unsubscribe";
}

function confirmPage(action) {
  const page =
    "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>Confirm unsubscribe</title></head><body>" +
    "<p>Confirm you want to unsubscribe. We will not email this address again after you press the button.</p>" +
    "<form method=\"post\" action=\"" +
    escapeHtml(action) +
    "\"><button type=\"submit\" name=\"confirm\" value=\"unsubscribe\">Unsubscribe</button></form></body></html>";
  return new Response(page, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function addArticlesContact(fetchImpl, env, email) {
  try {
    const response = await fetchImpl("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        authorization: "Bearer " + env.RESEND_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        unsubscribed: false,
        segments: [{ id: env.RESEND_ARTICLES_AUDIENCE_ID }],
      }),
    });
    await response.text();
  } catch (err) {
    // The results email already went out. A missed audience add is not shown to the reader.
  }
}

async function removeArticlesContact(fetchImpl, env, email) {
  if (!env.RESEND_API_KEY || !env.RESEND_ARTICLES_AUDIENCE_ID) {
    return;
  }
  const url =
    "https://api.resend.com/contacts/" +
    encodeURIComponent(email).replace(/%40/g, "@") +
    "/segments/" +
    encodeURIComponent(env.RESEND_ARTICLES_AUDIENCE_ID);
  try {
    const response = await fetchImpl(url, {
      method: "DELETE",
      headers: {
        authorization: "Bearer " + env.RESEND_API_KEY,
      },
    });
    if (response && response.text) {
      await response.text();
    }
  } catch (err) {
    // The do-not-email row is already stored. Pressing the button again tries the segment removal once more.
  }
}

async function applyWebhook(db, payload, eventId, createdAt) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const type = payload.type;
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  if (type === "email.bounced") {
    const bounceType = data.bounce && data.bounce.type ? String(data.bounce.type) : "Permanent";
    if (bounceType === "Temporary" || bounceType === "Transient") {
      return;
    }
    await suppressEach(db, recipientEmails(data), "bounce", eventId, createdAt);
    return;
  }
  if (type === "email.complained") {
    await suppressEach(db, recipientEmails(data), "complaint", eventId, createdAt);
    return;
  }
  if (type === "email.suppressed" || type === "suppression.added") {
    const reason = /complaint/i.test(String(data.reason || "")) ? "complaint" : "bounce";
    await suppressEach(db, recipientEmails(data), reason, eventId, createdAt);
    return;
  }
  if (type === "contact.updated" && data.unsubscribed === true) {
    await suppressEach(db, recipientEmails(data), "unsubscribe", eventId, createdAt);
  }
}

async function suppressEach(db, emails, reason, eventId, createdAt) {
  for (let i = 0; i < emails.length; i += 1) {
    await suppress(db, emails[i], reason, eventId, createdAt);
  }
}

async function suppress(db, email, reason, eventId, createdAt) {
  await run(
    db,
    "INSERT OR IGNORE INTO suppression (email, reason, created_at, resend_event_id) VALUES (?, ?, ?, ?)",
    [email, reason, createdAt, eventId]
  );
}

function recipientEmails(data) {
  const found = [];
  if (typeof data.email === "string") {
    found.push(data.email);
  }
  if (Array.isArray(data.to)) {
    data.to.forEach(function (item) {
      found.push(item);
    });
  }
  const unique = [];
  found.forEach(function (item) {
    const email = normalizeEmail(item);
    if (email && unique.indexOf(email) === -1) {
      unique.push(email);
    }
  });
  return unique;
}

async function prune(db, now) {
  const rateCutoff = new Date(now.getTime() - 48 * HOUR_MS).toISOString();
  const consentCutoff = new Date(now.getTime());
  consentCutoff.setUTCMonth(consentCutoff.getUTCMonth() - 24);
  await run(db, "DELETE FROM rate_hits WHERE created_at <= ?", [rateCutoff]);
  await run(db, "DELETE FROM consent WHERE created_at <= ?", [consentCutoff.toISOString()]);
}

async function countSince(db, sql, params) {
  const row = await first(db, sql, params);
  return row && row.n != null ? Number(row.n) : 0;
}

async function first(db, sql, params) {
  const statement = db.prepare(sql);
  if (params && params.length) {
    return statement.bind.apply(statement, params).first();
  }
  return statement.first();
}

async function run(db, sql, params) {
  const statement = db.prepare(sql);
  if (params && params.length) {
    return statement.bind.apply(statement, params).run();
  }
  return statement.run();
}

function assertCleanCopy(text) {
  if (/your business should/i.test(text) || /\brecommended\b/i.test(text)) {
    throw new HttpError(400, "Check the form and try again.");
  }
}

function onlyKeys(obj, allowed) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new HttpError(400, "Check the form and try again.");
  }
  Object.keys(obj).forEach(function (key) {
    if (allowed.indexOf(key) === -1) {
      throw new HttpError(400, "Check the form and try again.");
    }
  });
}

function shortText(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) {
    throw new HttpError(400, "Check the form and try again.");
  }
  return text;
}

function plainNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, "Check the form and try again.");
  }
  return n;
}

function normalizeEmail(value) {
  const email = String(value == null ? "" : value).trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "";
  }
  return email;
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new HttpError(400, "Check the form and try again.");
  }
}

async function readBody(request, max) {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > max) {
    throw new HttpError(413, "Check the form and try again.");
  }
  const text = await request.text();
  if (text.length > max) {
    throw new HttpError(413, "Check the form and try again.");
  }
  return text;
}

function decodeBase64(value) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isUniqueError(err) {
  return /unique/i.test(String(err && err.message));
}

async function hmacHex(secret, content) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(content)));
  const bytes = new Uint8Array(mac);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function hmacSha256(secret, content) {
  const rawSecret = secretBytes(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    rawSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  const bytes = new Uint8Array(mac);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function secretBytes(secret) {
  const text = String(secret || "");
  if (text.indexOf("whsec_") !== 0) {
    throw new Error("bad secret");
  }
  const binary = atob(text.slice("whsec_".length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function safeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function defaultDeps() {
  return {
    fetch: function (url, options) {
      return fetch(url, options);
    },
    now: function () {
      return Date.now();
    },
    randomToken: function () {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      let hex = "";
      for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i].toString(16).padStart(2, "0");
      }
      return hex;
    },
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function html(status, message) {
  const safe = escapeHtml(message);
  const page =
    "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>" +
    safe +
    "</title></head><body><p>" +
    safe +
    "</p></body></html>";
  return new Response(page, {
    status: status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
