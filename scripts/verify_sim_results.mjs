/**
 * Scripted checks for the results-email send path.
 * Uses an in-memory database and a stand-in for Resend and Turnstile.
 * No live key and no network call.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import site from "../src/_data/site.js";
import {
  DISCLAIMER,
  EMAIL_LIMIT,
  IP_LIMIT,
  SCHEMA_SQL,
  SUBJECT,
  SUCCESS_MESSAGE,
  WORDING_VERSION,
  handleResendWebhook,
  handleResultsEmail,
  handleUnsubscribe,
  sellerLineText,
  signUnsubscribeToken,
  signWebhook,
} from "../functions/email/logic.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const SECRET = "whsec_" + Buffer.from("super-secret-webhook-key").toString("base64");

const schemaFile = fs.readFileSync(path.join(ROOT, "schema", "website-emails.sql"), "utf8");
["consent", "suppression", "webhook_events", "rate_hits"].forEach(function (name) {
  assert.ok(schemaFile.includes("CREATE TABLE IF NOT EXISTS " + name), name);
  assert.ok(SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS " + name), name);
});

const wrangler = fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
assert.match(wrangler, /binding = "EMAIL_DB"/);
assert.match(wrangler, /database_name = "website-emails"/);
assert.match(wrangler, /database_id = "e356b3c9-a1b8-4a2e-b236-8bf7bea2137d"/);
assert.match(wrangler, /\[vars\]\s+RESULTS_EMAIL = "on"/);
assert.match(wrangler, /\[env\.production\.vars\]\s+RESULTS_EMAIL = "on"/);
assert.match(wrangler, /\[env\.preview\.vars\]\s+RESULTS_EMAIL = "on"/);
assert.doesNotMatch(wrangler, /RESEND_API_KEY\s*=|TURNSTILE_SECRET_KEY\s*=|whsec_|UNSUBSCRIBE_SIGNING_KEY\s*=|SIM_RESULTS_/);
assert.doesNotMatch(wrangler, /resend\._domainkey|send\.news/);
assert.match(wrangler, /^name = "practicalsupplychainplanning-website"$/m);
assert.match(wrangler, /^compatibility_date = "2026-09-18"$/m);
assert.match(wrangler, /^pages_build_output_dir = "_site"$/m);

["assets/safety-stock-simulator.js", "assets/own-data-simulator.js"].forEach(function (file) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  assert.doesNotMatch(source, /\/api\/results-email|api\.resend|TURNSTILE/);
});

const privacy = fs.readFileSync(path.join(ROOT, "src", "privacy.njk"), "utf8");
assert.match(
  privacy,
  /If you ask a page on this website to email you the results, we send one email to the address you typed\./
);
assert.match(privacy, /for 24 months/);
assert.match(privacy, /which page you used/);
assert.doesNotMatch(privacy, /not published on this site yet/);

function adapter(sqlite) {
  return {
    prepare(sql) {
      const state = { params: [] };
      return {
        bind() {
          state.params = Array.from(arguments);
          return this;
        },
        async run() {
          sqlite.prepare(sql).run(...state.params);
          return { success: true };
        },
        async first() {
          const row = sqlite.prepare(sql).get(...state.params);
          return row === undefined ? null : row;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...state.params) };
        },
      };
    },
  };
}

function openDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return { sqlite: sqlite, db: adapter(sqlite) };
}

let tokenCount = 0;
function nextToken() {
  tokenCount += 1;
  return tokenCount.toString(16).padStart(64, "a");
}

function jsonResponse(status, obj) {
  const raw = JSON.stringify(obj);
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: async function () {
      return raw;
    },
    json: async function () {
      return obj;
    },
  };
}

function liveEnv(db, fetchImpl, extra) {
  return Object.assign(
    {
      RESULTS_EMAIL: "on",
      EMAIL_DB: db,
      TURNSTILE_SECRET_KEY: "turnstile-test",
      RESEND_API_KEY: "re_test_not_live",
      RESEND_ARTICLES_AUDIENCE_ID: "aud_articles",
      RESEND_WEBHOOK_SECRET: SECRET,
      UNSUBSCRIBE_SIGNING_KEY: "test-unsubscribe-signing-key",
    },
    extra || {}
  );
}

function deps(fetchImpl) {
  return {
    fetch: fetchImpl,
    now: function () {
      return NOW;
    },
    randomToken: nextToken,
  };
}

function okFetch() {
  const calls = [];
  const fetchImpl = async function (url, options) {
    calls.push({ url: String(url), method: options && options.method, body: options && options.body });
    if (String(url).includes("siteverify")) {
      return jsonResponse(200, { success: true });
    }
    if (String(url).includes("/emails")) {
      return jsonResponse(200, { id: "msg_test_1" });
    }
    if (String(url).includes("/contacts")) {
      return jsonResponse(200, { id: "con_test_1" });
    }
    throw new Error("unexpected fetch " + url);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function post(body, headers) {
  const merged = Object.assign(
    {
      "content-type": "application/json",
      origin: "https://practicalsupplychainplanning.com",
      "CF-Connecting-IP": "203.0.113.8",
    },
    headers || {}
  );
  Object.keys(merged).forEach(function (key) {
    if (merged[key] == null) {
      delete merged[key];
    }
  });
  return new Request("https://practicalsupplychainplanning.com/api/results-email", {
    method: "POST",
    headers: merged,
    body: JSON.stringify(body),
  });
}

function payload(overrides) {
  const body = {
    email: "Reader@Example.com",
    resultsConsent: true,
    articlesConsent: false,
    company: "",
    turnstileToken: "token-ok-1234",
    pageUrl: "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/?utm_source=newsletter#d=secret",
    utm: { source: "newsletter", medium: "web", campaign: "spring", term: null, content: null },
    wordingVersion: WORDING_VERSION,
    wordingText: {
      required: "Email me the results of the scenario I ran. This is a one-off email.",
      optional: "Also send me new articles from Practical Supply Chain Planning. Unsubscribe any time.",
    },
    formId: "safety-stock-simulator",
    summary: {
      kind: "teaching",
      mode: "year",
      seed: 4242,
      settings: [{ label: "Demand pattern", value: "Seasonal" }],
      metrics: {
        oosWeeks: 2,
        csl: 96.2,
        inventoryTurns: 8.5,
        averageWc: 1200,
        annualGp: 3000,
        safetyStock: 20,
      },
      commentary: ["In the scenario you ran, change one setting at a time to see what drives service and cash."],
      reopenUrl:
        "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/?m=year&s=4242&run=1&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1",
      charts: [{ title: "One year", pngBase64: TINY_PNG }],
    },
  };
  return Object.assign(body, overrides || {});
}

async function send(db, body, headers, fetchImpl, envExtra) {
  const net = fetchImpl || okFetch();
  const response = await handleResultsEmail(
    post(body, headers),
    liveEnv(db, net, envExtra),
    deps(net)
  );
  const json = await response.json();
  return { status: response.status, json: json, calls: net.calls };
}

const missingKey = await handleResultsEmail(
  post(payload()),
  { RESULTS_EMAIL: "on" },
  deps(async function () {
    throw new Error("network");
  })
);
assert.strictEqual(missingKey.status, 503);

const missingSign = await handleResultsEmail(
  post(payload({ email: "unsigned@example.com" })),
  liveEnv(openDb().db, null, { UNSUBSCRIBE_SIGNING_KEY: "" }),
  deps(async function () {
    throw new Error("network");
  })
);
assert.strictEqual(missingSign.status, 503);

const closed = await handleResultsEmail(
  post(payload()),
  { RESULTS_EMAIL: "off" },
  deps(async function () {
    throw new Error("network");
  })
);
assert.strictEqual(closed.status, 404);
assert.strictEqual((await closed.json()).error, "This form is not available yet.");

const opened = openDb();
const honeypot = await send(opened.db, payload({ company: "filled by a bot" }));
assert.strictEqual(honeypot.status, 200);
assert.strictEqual(honeypot.json.message, SUCCESS_MESSAGE);
assert.strictEqual(honeypot.calls.length, 0);
assert.strictEqual(opened.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);

const badOrigin = await send(opened.db, payload(), { origin: "https://evil.example" });
assert.strictEqual(badOrigin.status, 403);
assert.strictEqual(badOrigin.json.error, "Check the form and try again.");
assert.strictEqual(badOrigin.calls.length, 0);

const missingOrigin = await send(opened.db, payload(), { origin: null });
assert.strictEqual(missingOrigin.status, 403);
assert.strictEqual(missingOrigin.json.error, badOrigin.json.error);
assert.strictEqual(missingOrigin.calls.length, 0);

const firstSend = await send(opened.db, payload());
assert.strictEqual(firstSend.status, 200, JSON.stringify(firstSend.json));
assert.strictEqual(firstSend.json.message, SUCCESS_MESSAGE);
const emailCall = firstSend.calls.find(function (call) {
  return call.url.includes("/emails");
});
assert.ok(emailCall, "Resend send was requested");
const emailBody = JSON.parse(String(emailCall.body));
assert.strictEqual(emailBody.subject, SUBJECT);
assert.strictEqual(emailBody.to[0], "reader@example.com");
assert.strictEqual(
  emailBody.from,
  "Daniel at Practical Supply Chain Planning <hello@news.practicalsupplychainplanning.com>"
);
assert.strictEqual(emailBody.reply_to, "support@practicalsupplychainplanning.com");
assert.match(emailBody.headers["List-Unsubscribe"], /mailto:support@practicalsupplychainplanning.com\?subject=Unsubscribe/);
assert.match(emailBody.headers["List-Unsubscribe"], /https:\/\/practicalsupplychainplanning.com\/unsubscribe\/\?t=[a-f0-9]{64}\.[a-f0-9]{64}/);
assert.strictEqual(emailBody.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
assert.ok(!emailBody.headers["List-Unsubscribe"].includes("reader@example.com"));
assert.match(emailBody.text, /Unsubscribe: https:\/\/practicalsupplychainplanning.com\/unsubscribe\/\?t=[a-f0-9]{64}\.[a-f0-9]{64}/);
assert.match(emailBody.html, /<a href="https:\/\/practicalsupplychainplanning.com\/unsubscribe\/\?t=[a-f0-9]{64}\.[a-f0-9]{64}">Unsubscribe<\/a>/);
assert.match(emailBody.text, new RegExp(DISCLAIMER.replace(/[.]/g, "\\.")));
assert.match(emailBody.text, /Seed: 4242/);
assert.match(emailBody.text, /Stock Planner plans by weeks of cover/);
const sellerLine = sellerLineText(site.abn);
assert.ok(sellerLine.includes("ABN " + site.abn));
assert.ok(emailBody.text.includes(sellerLine));
assert.ok(emailBody.html.includes(sellerLine));
const bareSeller = "Practical Supply Chain Planning (Daniel Hampton, sole trader)";
assert.strictEqual(sellerLineText(undefined), bareSeller);
assert.strictEqual(sellerLineText(""), bareSeller);
assert.strictEqual(sellerLineText("[ABN]"), bareSeller);
assert.ok(!sellerLineText("[ABN]").includes("ABN"));
const logicSource = fs.readFileSync(path.join(ROOT, "functions", "email", "logic.mjs"), "utf8");
assert.doesNotMatch(logicSource, /SIM_RESULTS_/);
assert.ok(logicSource.includes("site.abn"));
assert.ok(!logicSource.includes(site.abn));
assert.match(emailBody.html, /cid:chart1/);
assert.strictEqual(emailBody.attachments[0].content_id, "chart1");
assert.doesNotMatch(emailBody.text, /your business should|\brecommended\b/i);
const row = opened.sqlite.prepare("SELECT * FROM consent").get();
assert.strictEqual(row.email, "reader@example.com");
assert.strictEqual(row.results_box, 1);
assert.strictEqual(row.articles_box, 0);
assert.strictEqual(row.resend_message_id, "msg_test_1");
assert.strictEqual(row.wording_version, WORDING_VERSION);
assert.strictEqual(row.utm_source, "newsletter");
assert.strictEqual(row.page_url, "/learn/safety-stock-simulator/?utm_source=newsletter");
assert.ok(!row.page_url.includes("#"));
assert.ok(!JSON.stringify(row).includes("iVBORw"));
assert.ok(!JSON.stringify(row).includes("Seasonal"));
assert.strictEqual(firstSend.calls.some(function (call) { return call.url.includes("/contacts"); }), false);

const columns = opened.sqlite.prepare("PRAGMA table_info(consent)").all().map(function (col) {
  return col.name;
});
["weeks", "sku", "chart", "fragment", "commentary"].forEach(function (name) {
  assert.ok(!columns.includes(name), name);
});

const articlesDb = openDb();
const articles = await send(
  articlesDb.db,
  payload({
    email: "articles@example.com",
    articlesConsent: true,
    "CF-Connecting-IP": undefined,
  }),
  { "CF-Connecting-IP": "203.0.113.9" }
);
assert.strictEqual(articles.status, 200, JSON.stringify(articles.json));
const contactCall = articles.calls.find(function (call) {
  return call.url === "https://api.resend.com/contacts";
});
assert.ok(contactCall);
const contactBody = JSON.parse(String(contactCall.body));
assert.strictEqual(contactBody.email, "articles@example.com");
assert.strictEqual(contactBody.unsubscribed, false);
assert.deepStrictEqual(contactBody.segments, [{ id: "aud_articles" }]);
assert.match(articles.calls.find(function (call) { return call.url.includes("/emails"); }).body, /new articles/);
const articlesMail = JSON.parse(articles.calls.find(function (call) { return call.url.includes("/emails"); }).body);
assert.match(articlesMail.text, /Unsubscribe: https:\/\/practicalsupplychainplanning\.com\/unsubscribe\/\?t=/);
assert.match(articlesMail.html, />Unsubscribe<\/a>/);
assert.match(articlesMail.headers["List-Unsubscribe"], /<https:\/\/practicalsupplychainplanning\.com\/unsubscribe\/\?t=/);
assert.strictEqual(articlesMail.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

const failContact = okFetch();
const original = failContact;
const wrapped = async function (url, options) {
  if (String(url).includes("/contacts")) {
    throw new Error("audience down");
  }
  return original(url, options);
};
wrapped.calls = original.calls;
const contactFail = await handleResultsEmail(
  post(payload({ email: "still-sent@example.com", articlesConsent: true }), { "CF-Connecting-IP": "203.0.113.10" }),
  liveEnv(openDb().db),
  deps(wrapped)
);
assert.strictEqual(contactFail.status, 200);

const contactDown = async function (url, options) {
  if (String(url).includes("/contacts")) {
    return jsonResponse(500, { message: "audience down" });
  }
  if (String(url).includes("siteverify")) {
    return jsonResponse(200, { success: true });
  }
  if (String(url).includes("/emails")) {
    return jsonResponse(200, { id: "msg_test_1" });
  }
  throw new Error("unexpected fetch " + url);
};
const contactHttp = openDb();
const contactHttpFail = await handleResultsEmail(
  post(payload({ email: "contact-http@example.com", articlesConsent: true }), { "CF-Connecting-IP": "203.0.113.11" }),
  liveEnv(contactHttp.db),
  deps(contactDown)
);
assert.strictEqual(contactHttpFail.status, 200, JSON.stringify(await contactHttpFail.json()));
assert.strictEqual(contactHttp.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 1);

const sendDown = async function (url) {
  if (String(url).includes("/emails")) {
    return jsonResponse(502, { message: "resend down" });
  }
  if (String(url).includes("siteverify")) {
    return jsonResponse(200, { success: true });
  }
  throw new Error("should not continue");
};
const sendFail = openDb();
const sendHttpFail = await handleResultsEmail(
  post(payload({ email: "send-http@example.com" }), { "CF-Connecting-IP": "203.0.113.12" }),
  liveEnv(sendFail.db),
  deps(sendDown)
);
assert.strictEqual(sendHttpFail.status, 502);
assert.strictEqual(sendFail.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);

const sendGarbage = async function (url) {
  if (String(url).includes("/emails")) {
    return {
      ok: true,
      status: 200,
      text: async function () {
        return "not-json";
      },
      json: async function () {
        throw new Error("not json");
      },
    };
  }
  if (String(url).includes("siteverify")) {
    return jsonResponse(200, { success: true });
  }
  throw new Error("should not continue");
};
const garbageDb = openDb();
const garbageSend = await handleResultsEmail(
  post(payload({ email: "send-garbage@example.com" }), { "CF-Connecting-IP": "203.0.113.13" }),
  liveEnv(garbageDb.db),
  deps(sendGarbage)
);
assert.strictEqual(garbageSend.status, 502);
assert.strictEqual(garbageDb.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);

const rejected = openDb();
const turnstileNo = async function (url) {
  if (String(url).includes("siteverify")) {
    return jsonResponse(200, { success: false });
  }
  throw new Error("should not send");
};
const failedCheck = await handleResultsEmail(
  post(payload({ email: "nope@example.com" })),
  liveEnv(rejected.db),
  deps(turnstileNo)
);
assert.strictEqual(failedCheck.status, 400);
assert.match((await failedCheck.json()).error, /Refresh the page/);
assert.strictEqual(rejected.sqlite.prepare("SELECT COUNT(*) AS n FROM rate_hits").get().n, 0);

const limited = openDb();
for (let i = 0; i < IP_LIMIT; i += 1) {
  const result = await send(
    limited.db,
    payload({ email: "ip" + i + "@example.com" }),
    { "CF-Connecting-IP": "198.51.100.20" }
  );
  assert.strictEqual(result.status, 200, "ip send " + i + " " + JSON.stringify(result.json));
}
const blockedIp = await send(
  limited.db,
  payload({ email: "ip-extra@example.com" }),
  { "CF-Connecting-IP": "198.51.100.20" }
);
assert.strictEqual(blockedIp.status, 429);
assert.match(blockedIp.json.error, /Try again later/);
assert.ok(!blockedIp.json.error.includes("IP"));
assert.strictEqual(
  blockedIp.calls.filter(function (call) { return call.url.includes("/emails"); }).length,
  0
);

const perAddress = openDb();
for (let i = 0; i < EMAIL_LIMIT; i += 1) {
  const result = await send(
    perAddress.db,
    payload({ email: "same@example.com" }),
    { "CF-Connecting-IP": "198.51.100." + (30 + i) }
  );
  assert.strictEqual(result.status, 200, JSON.stringify(result.json));
}
const blockedAddress = await send(
  perAddress.db,
  payload({ email: "same@example.com" }),
  { "CF-Connecting-IP": "198.51.100.80" }
);
assert.strictEqual(blockedAddress.status, 429);

const suppressedDb = openDb();
suppressedDb.sqlite
  .prepare("INSERT INTO suppression (email, reason, created_at, resend_event_id) VALUES (?, ?, ?, ?)")
  .run("blocked@example.com", "unsubscribe", "2026-01-01T00:00:00.000Z", "earlier");
const suppressed = await send(
  suppressedDb.db,
  payload({ email: "blocked@example.com" }),
  { "CF-Connecting-IP": "203.0.113.50" }
);
assert.strictEqual(suppressed.status, 403);
assert.match(suppressed.json.error, /unsubscribed/);
assert.strictEqual(suppressed.calls.some(function (call) { return call.url.includes("/emails"); }), false);

const badCopy = await send(
  openDb().db,
  payload({
    summary: Object.assign({}, payload().summary, {
      commentary: ["In the scenario you ran, your business should order more."],
    }),
  }),
  { "CF-Connecting-IP": "203.0.113.60" }
);
assert.strictEqual(badCopy.status, 400);

const withWeeks = payload();
withWeeks.summary.weeks = [{ endingSoh: 1 }];
const rejectedWeeks = await send(openDb().db, withWeeks, { "CF-Connecting-IP": "203.0.113.61" });
assert.strictEqual(rejectedWeeks.status, 400);

const mc = payload();
mc.summary.mode = "monte-carlo";
mc.summary.charts = [];
mc.summary.metrics = {
  oosWeeks: { median: 1, p10: 0, p90: 4 },
  csl: { median: 98, p10: 90, p90: 100 },
  inventoryTurns: { median: 6, p10: 4, p90: 9 },
  averageWc: { median: 1000, p10: 500, p90: 1500 },
  annualGp: { median: 3000 },
  safetyStock: 20,
};
mc.summary.reopenUrl =
  "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/?m=mc&s=4242&run=1&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1";
const mcSend = await send(openDb().db, mc, { "CF-Connecting-IP": "203.0.113.62" });
assert.strictEqual(mcSend.status, 200, JSON.stringify(mcSend.json));
const mcText = JSON.parse(mcSend.calls.find(function (call) { return call.url.includes("/emails"); }).body).text;
assert.match(mcText, /Median 1 \(P10 0–P90 4\)/);
assert.match(mcText, /Median \$3,000/);
assert.doesNotMatch(mcText, /Chart:/);

const own = payload({
  email: "sku@example.com",
  formId: "own-data-simulator",
  pageUrl: "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/own-data/?email=sku@example.com",
});
own.summary.kind = "own-data";
own.summary.settings = [{ label: "Delivery variability", value: "small" }];
own.summary.skus = [
  {
    label: "Widget",
    settings: [{ label: "Weekly forecast", value: "40" }],
    metrics: own.summary.metrics,
  },
];
own.summary.reopenUrl =
  "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/own-data/?m=year&run=1&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1#d=abc";
const ownDb = openDb();
const ownSend = await send(ownDb.db, own, { "CF-Connecting-IP": "203.0.113.70" });
assert.strictEqual(ownSend.status, 200, JSON.stringify(ownSend.json));
const stored = JSON.stringify(ownDb.sqlite.prepare("SELECT * FROM consent").all());
assert.ok(!stored.includes("Widget"));
assert.ok(!stored.includes("#d="));
assert.ok(!stored.includes("sku@example.com?"));
const ownPage = ownDb.sqlite.prepare("SELECT page_url FROM consent").get().page_url;
assert.strictEqual(ownPage, "/learn/safety-stock-simulator/own-data/");

async function webhook(db, type, data, options) {
  const body = JSON.stringify({ type: type, data: data });
  const timestamp = String(Math.floor(NOW / 1000) + ((options && options.skew) || 0));
  const id = (options && options.id) || "evt_" + type + "_" + Math.random().toString(16).slice(2);
  const signature = options && options.signature !== undefined
    ? options.signature
    : await signWebhook(SECRET, id, timestamp, body);
  const response = await handleResendWebhook(
    new Request("https://practicalsupplychainplanning.com/api/resend-webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      },
      body: body,
    }),
    liveEnv(db, null, options && options.env),
    deps(okFetch())
  );
  return { status: response.status, json: await response.json(), id: id };
}

const hookDb = openDb();
const unsigned = await webhook(hookDb.db, "email.bounced", { to: ["bounced@resend.dev"], bounce: { type: "Permanent" } }, { signature: "v1,aaaaaaaa" });
assert.strictEqual(unsigned.status, 400);
assert.strictEqual(hookDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);

const bounce = await webhook(hookDb.db, "email.bounced", {
  to: ["bounced@resend.dev"],
  bounce: { type: "Permanent", message: "550 user unknown" },
});
assert.strictEqual(bounce.status, 200);
assert.strictEqual(
  hookDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("bounced@resend.dev").reason,
  "bounce"
);
const again = await webhook(hookDb.db, "email.bounced", { to: ["bounced@resend.dev"], bounce: { type: "Permanent" } }, { id: bounce.id });
assert.strictEqual(again.status, 200);
assert.strictEqual(hookDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 1);

const soft = await webhook(hookDb.db, "email.bounced", {
  to: ["full@example.com"],
  bounce: { type: "Temporary", message: "mailbox full" },
});
assert.strictEqual(soft.status, 200);
assert.strictEqual(hookDb.sqlite.prepare("SELECT email FROM suppression WHERE email = ?").get("full@example.com"), undefined);

const complaint = await webhook(hookDb.db, "email.complained", { to: ["complained@resend.dev"] });
assert.strictEqual(complaint.status, 200);
assert.strictEqual(
  hookDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("complained@resend.dev").reason,
  "complaint"
);

const stale = await webhook(
  hookDb.db,
  "email.complained",
  { to: ["late@example.com"] },
  { skew: -3600 }
);
assert.strictEqual(stale.status, 400);

const noSecretDb = openDb();
const noSecret = await handleResendWebhook(
  new Request("https://practicalsupplychainplanning.com/api/resend-webhook", { method: "POST", body: "{}" }),
  liveEnv(noSecretDb.db, null, { RESEND_WEBHOOK_SECRET: "" })
);
assert.strictEqual(noSecret.status, 404);
assert.strictEqual(noSecretDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);

const offNoSecretDb = openDb();
const offNoSecret = await handleResendWebhook(
  new Request("https://practicalsupplychainplanning.com/api/resend-webhook", { method: "POST", body: "{}" }),
  { RESULTS_EMAIL: "off", EMAIL_DB: offNoSecretDb.db }
);
assert.strictEqual(offNoSecret.status, 404);
assert.strictEqual(offNoSecretDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);

const offHookDb = openDb();
const offHook = await webhook(
  offHookDb.db,
  "email.complained",
  { to: ["offhook@example.com"] },
  { env: { RESULTS_EMAIL: "off" } }
);
assert.strictEqual(offHook.status, 200);
assert.strictEqual(
  offHookDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("offhook@example.com").reason,
  "complaint"
);

const audienceOff = await webhook(hookDb.db, "contact.updated", {
  email: "still-on@example.com",
  unsubscribed: false,
});
assert.strictEqual(audienceOff.status, 200);
assert.strictEqual(
  hookDb.sqlite.prepare("SELECT email FROM suppression WHERE email = ?").get("still-on@example.com"),
  undefined
);
const audienceUnsub = await webhook(hookDb.db, "contact.updated", {
  email: "Audience@Example.com",
  unsubscribed: true,
});
assert.strictEqual(audienceUnsub.status, 200);
assert.strictEqual(
  hookDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("audience@example.com").reason,
  "unsubscribe"
);

function emailLink(message) {
  const match = String(message.text).match(
    /https:\/\/practicalsupplychainplanning\.com\/unsubscribe\/\?t=[a-f0-9]{64}\.[a-f0-9]{64}/
  );
  assert.ok(match, "email is missing the unsubscribe link");
  return match[0];
}

const unsubDb = openDb();
const seeded = await send(unsubDb.db, payload({ email: "leave@example.com" }), { "CF-Connecting-IP": "203.0.113.90" });
assert.strictEqual(seeded.status, 200, JSON.stringify(seeded.json));
const seededMail = JSON.parse(seeded.calls.find(function (call) { return call.url.includes("/emails"); }).body);
const link = emailLink(seededMail);
const storedId = unsubDb.sqlite.prepare("SELECT unsubscribe_token FROM consent").get().unsubscribe_token;
assert.strictEqual(new URL(link).searchParams.get("t").slice(0, 64), storedId);
const page = await handleUnsubscribe(
  new Request(link),
  liveEnv(unsubDb.db),
  deps(okFetch())
);
const html = await page.text();
assert.strictEqual(page.status, 200);
assert.match(html, /Confirm you want to unsubscribe/);
assert.match(html, /<button[^>]*>Unsubscribe<\/button>/);
assert.doesNotMatch(html, /You are unsubscribed/);
assert.match(html, /noindex/);
assert.ok(!html.includes("leave@example.com"));
assert.strictEqual(unsubDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);
const scanned = await handleUnsubscribe(
  new Request(link, { method: "POST", body: "" }),
  liveEnv(unsubDb.db),
  deps(okFetch())
);
assert.match(await scanned.text(), /Confirm you want to unsubscribe/);
assert.strictEqual(unsubDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);
const confirmFetch = okFetch();
const confirmed = await handleUnsubscribe(
  new Request(link, { method: "POST", body: "confirm=unsubscribe" }),
  liveEnv(unsubDb.db),
  deps(confirmFetch)
);
assert.match(await confirmed.text(), /You are unsubscribed/);
assert.strictEqual(
  unsubDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("leave@example.com").reason,
  "unsubscribe"
);
const removed = confirmFetch.calls.find(function (call) {
  return call.method === "DELETE" && call.url === "https://api.resend.com/contacts/leave@example.com/segments/aud_articles";
});
assert.ok(removed, JSON.stringify(confirmFetch.calls));
const confirmedAgain = await handleUnsubscribe(
  new Request(link, { method: "POST", body: "confirm=unsubscribe" }),
  liveEnv(unsubDb.db),
  deps(okFetch())
);
assert.match(await confirmedAgain.text(), /You are unsubscribed/);
assert.strictEqual(unsubDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 1);
const after = await send(unsubDb.db, payload({ email: "leave@example.com" }), { "CF-Connecting-IP": "203.0.113.91" });
assert.strictEqual(after.status, 403);

const offClickDb = openDb();
const offSeed = await send(offClickDb.db, payload({ email: "offclick@example.com" }), { "CF-Connecting-IP": "203.0.113.93" });
assert.strictEqual(offSeed.status, 200, JSON.stringify(offSeed.json));
const offMail = JSON.parse(offSeed.calls.find(function (call) { return call.url.includes("/emails"); }).body);
const offLink = emailLink(offMail);
const offPage = await handleUnsubscribe(
  new Request(offLink),
  liveEnv(offClickDb.db, null, { RESULTS_EMAIL: "off" }),
  deps(okFetch())
);
assert.match(await offPage.text(), /Confirm you want to unsubscribe/);
assert.strictEqual(offClickDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);
const offClick = await handleUnsubscribe(
  new Request(offLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(offClickDb.db, null, { RESULTS_EMAIL: "off" }),
  deps(okFetch())
);
assert.match(await offClick.text(), /You are unsubscribed/);
assert.strictEqual(
  offClickDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("offclick@example.com").reason,
  "unsubscribe"
);

const offNoKey = await handleUnsubscribe(
  new Request(offLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  { RESULTS_EMAIL: "off", EMAIL_DB: openDb().db }
);
assert.match(await offNoKey.text(), /not available yet/);

const onNoKeyDb = openDb();
const onNoKey = await handleUnsubscribe(
  new Request(offLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(onNoKeyDb.db, null, { UNSUBSCRIBE_SIGNING_KEY: "" })
);
assert.match(await onNoKey.text(), /not available yet/);
assert.strictEqual(onNoKeyDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);

const oneClickDb = openDb();
const seededClick = await send(oneClickDb.db, payload({ email: "click@example.com" }), { "CF-Connecting-IP": "203.0.113.92" });
assert.strictEqual(seededClick.status, 200);
const clickMail = JSON.parse(seededClick.calls.find(function (call) { return call.url.includes("/emails"); }).body);
const clickLink = emailLink(clickMail);
const clickFetch = okFetch();
const oneClick = await handleUnsubscribe(
  new Request(clickLink, {
    method: "POST",
    body: "List-Unsubscribe=One-Click",
  }),
  liveEnv(oneClickDb.db),
  deps(clickFetch)
);
assert.match(await oneClick.text(), /You are unsubscribed/);
assert.ok(clickFetch.calls.some(function (call) {
  return call.method === "DELETE" && call.url.includes("/segments/aud_articles");
}));
const oneClickAgain = await handleUnsubscribe(
  new Request(clickLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(oneClickDb.db),
  deps(okFetch())
);
assert.match(await oneClickAgain.text(), /You are unsubscribed/);
assert.strictEqual(oneClickDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 1);

const tampered = clickLink.slice(0, -1) + (clickLink.endsWith("0") ? "1" : "0");
const badSig = await handleUnsubscribe(
  new Request(tampered, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(oneClickDb.db),
  deps(okFetch())
);
assert.match(await badSig.text(), /not valid/);

const missing = await handleUnsubscribe(
  new Request("https://practicalsupplychainplanning.com/unsubscribe/?t=" + "ab".repeat(32) + "." + "cd".repeat(32)),
  liveEnv(openDb().db),
  deps(okFetch())
);
assert.match(await missing.text(), /not valid/);

const unavailable = await handleUnsubscribe(
  new Request("https://practicalsupplychainplanning.com/unsubscribe/?t=" + "ab".repeat(32)),
  {}
);
assert.match(await unavailable.text(), /not available yet/);

const bareId = "ab".repeat(32);
const noDot = await handleUnsubscribe(
  new Request("https://practicalsupplychainplanning.com/unsubscribe/?t=" + bareId, {
    method: "POST",
    body: "List-Unsubscribe=One-Click",
  }),
  liveEnv(openDb().db),
  deps(okFetch())
);
assert.match(await noDot.text(), /not valid/);

const upperLink = clickLink.slice(0, clickLink.indexOf("?t=") + 3) + new URL(clickLink).searchParams.get("t").toUpperCase();
const upperSig = await handleUnsubscribe(
  new Request(upperLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(oneClickDb.db),
  deps(okFetch())
);
assert.match(await upperSig.text(), /not valid/);

const previousKey = "previous-unsubscribe-signing-key";
const rotateDb = openDb();
const rotateSend = await send(rotateDb.db, payload({ email: "rotate@example.com" }), { "CF-Connecting-IP": "203.0.113.94" });
assert.strictEqual(rotateSend.status, 200, JSON.stringify(rotateSend.json));
const rotateId = rotateDb.sqlite.prepare("SELECT unsubscribe_token FROM consent").get().unsubscribe_token;
const oldSigned = await signUnsubscribeToken(rotateId, previousKey);
const oldLink = "https://practicalsupplychainplanning.com/unsubscribe/?t=" + oldSigned;
const rejectedOld = await handleUnsubscribe(
  new Request(oldLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(rotateDb.db),
  deps(okFetch())
);
assert.match(await rejectedOld.text(), /not valid/);
assert.strictEqual(rotateDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);
const acceptedOld = await handleUnsubscribe(
  new Request(oldLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(rotateDb.db, null, { UNSUBSCRIBE_SIGNING_KEY_PREVIOUS: previousKey }),
  deps(okFetch())
);
assert.match(await acceptedOld.text(), /You are unsubscribed/);
assert.strictEqual(
  rotateDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("rotate@example.com").reason,
  "unsubscribe"
);

const currentStill = openDb();
const currentSend = await send(currentStill.db, payload({ email: "current@example.com" }), { "CF-Connecting-IP": "203.0.113.95" });
const currentLink = emailLink(JSON.parse(currentSend.calls.find(function (call) { return call.url.includes("/emails"); }).body));
const currentOk = await handleUnsubscribe(
  new Request(currentLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(currentStill.db, null, { UNSUBSCRIBE_SIGNING_KEY_PREVIOUS: previousKey }),
  deps(okFetch())
);
assert.match(await currentOk.text(), /You are unsubscribed/);

const dropDb = openDb();
const dropSend = await send(dropDb.db, payload({ email: "drop@example.com" }), { "CF-Connecting-IP": "203.0.113.96" });
const dropLink = emailLink(JSON.parse(dropSend.calls.find(function (call) { return call.url.includes("/emails"); }).body));
const dropThrow = await handleUnsubscribe(
  new Request(dropLink, { method: "POST", body: "List-Unsubscribe=One-Click" }),
  liveEnv(dropDb.db),
  deps(async function () {
    throw new Error("resend down");
  })
);
assert.match(await dropThrow.text(), /You are unsubscribed/);
assert.strictEqual(
  dropDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("drop@example.com").reason,
  "unsubscribe"
);

const dropHttpDb = openDb();
const dropHttpSend = await send(dropHttpDb.db, payload({ email: "drophttp@example.com" }), { "CF-Connecting-IP": "203.0.113.97" });
const dropHttpLink = emailLink(JSON.parse(dropHttpSend.calls.find(function (call) { return call.url.includes("/emails"); }).body));
const dropHttp = await handleUnsubscribe(
  new Request(dropHttpLink, { method: "POST", body: "confirm=unsubscribe" }),
  liveEnv(dropHttpDb.db),
  deps(async function (url) {
    if (String(url).includes("/segments/")) {
      return jsonResponse(500, { message: "segment down" });
    }
    return jsonResponse(200, { ok: true });
  })
);
assert.match(await dropHttp.text(), /You are unsubscribed/);
assert.strictEqual(
  dropHttpDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("drophttp@example.com").reason,
  "unsubscribe"
);

console.log("Simulator results email checks OK.");
