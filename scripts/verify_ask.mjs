/**
 * Scripted checks for the FAQ question form.
 * Uses an in-memory database and a stand-in for Resend and Turnstile.
 * No live key and no network call.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import faqItems from "../scripts/faq-items.js";
import faqPage from "../src/faq.11tydata.js";
import {
  ASK_SUCCESS,
  ASK_TOPICS,
  EMAIL_LIMIT,
  FROM_ADDRESS,
  IP_LIMIT,
  REPLY_TO,
  SCHEMA_SQL,
  handleAsk,
  handleResendWebhook,
  signWebhook,
} from "../functions/email/logic.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const NOW = Date.parse("2026-11-12T02:00:00.000Z");
const SECRET = "whsec_" + Buffer.from("ask-form-webhook-test").toString("base64");
const QUESTION = "Where did my licence key go?\n\nIt was not in the inbox.";
const ASKER = "buyer@example.com";

const schemaFile = fs.readFileSync(path.join(ROOT, "schema", "website-emails.sql"), "utf8");
assert.ok(schemaFile.includes("CREATE TABLE IF NOT EXISTS ask_hits"));
assert.ok(SCHEMA_SQL.includes("CREATE TABLE IF NOT EXISTS ask_hits"));
assert.match(schemaFile, /The question[\s\S]*is not written here/);

const wrangler = fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
assert.strictEqual((wrangler.match(/ASK_QUESTIONS = "on"/g) || []).length, 3);
assert.doesNotMatch(wrangler, /RESEND_API_KEY\s*=|TURNSTILE_SECRET_KEY\s*=/);

const askSource = fs.readFileSync(path.join(ROOT, "assets", "ask-question.js"), "utf8");
assert.match(askSource, /fetch\("\/api\/ask"/);
assert.doesNotMatch(askSource, /api\.resend|RESEND|fbq\(|notifyMetaLead|mailto:/);

const page = fs.readFileSync(path.join(ROOT, "src", "faq.njk"), "utf8");
assert.match(page, /askForm\.topics/);
assert.strictEqual(ASK_TOPICS.length, 5);
assert.match(page, /id="ask-question"/);
assert.match(page, /name="company"/);
assert.match(page, /askForm\.success/);
assert.match(ASK_SUCCESS, /2 business days/);

const privacy = fs.readFileSync(path.join(ROOT, "src", "privacy.njk"), "utf8");
assert.match(privacy, /Last updated: 12 November 2026/);
assert.match(
  privacy,
  /If you use the question form on the FAQ page, we send that message to our support inbox\./
);
assert.match(privacy, /we do not add you to a mailing list/);

const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "_data", "faq.json"), "utf8"));
assert.strictEqual(faqItems.publishedFaqItems(shipped).length, 0);
assert.deepStrictEqual(faqItems.plainParagraphs("One line.\n\nTwo\nlines."), ["One line.", "Two lines."]);

const blankSchema = faqPage.eleventyComputed.schemaJson({
  faq: [
    { question: "", answer: "" },
    { question: "  ", answer: "skipped" },
    { question: "Only a question", answer: "   " },
  ],
});
assert.strictEqual(blankSchema, "");

const filledSchema = faqPage.eleventyComputed.schemaJson({
  faq: [
    { question: "  How do I move a licence? ", answer: "Email us.\n\nSee <script>." },
    { question: "", answer: "hidden" },
  ],
});
assert.match(filledSchema, /"@type": "FAQPage"/);
assert.match(filledSchema, /How do I move a licence\?/);
assert.doesNotMatch(filledSchema, /<script>/);
assert.match(filledSchema, /\\u003cscript/);
assert.doesNotMatch(filledSchema, /hidden/);

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

function liveEnv(db, extra) {
  return Object.assign(
    {
      ASK_QUESTIONS: "on",
      EMAIL_DB: db,
      TURNSTILE_SECRET_KEY: "turnstile-test",
      RESEND_API_KEY: "re_test_not_live",
      RESEND_WEBHOOK_SECRET: SECRET,
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
    randomToken: function () {
      return "b".repeat(64);
    },
  };
}

function okFetch() {
  const calls = [];
  const fetchImpl = async function (url, options) {
    calls.push({
      url: String(url),
      method: options && options.method,
      body: options && options.body,
    });
    if (String(url).includes("siteverify")) {
      return jsonResponse(200, {
        success: true,
        hostname: "practicalsupplychainplanning.com",
        "error-codes": [],
      });
    }
    if (String(url).includes("api.resend.com/emails")) {
      return jsonResponse(200, { id: "msg_ask_test" });
    }
    throw new Error("unexpected fetch " + url);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function emailCalls(fetchImpl) {
  return fetchImpl.calls.filter(function (call) {
    return call.url.includes("api.resend.com/emails");
  });
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
  return new Request("https://practicalsupplychainplanning.com/api/ask", {
    method: "POST",
    headers: merged,
    body: JSON.stringify(body),
  });
}

function askBody(overrides) {
  return Object.assign(
    {
      email: ASKER,
      topic: "Licence or trial",
      question: QUESTION,
      company: "",
      turnstileToken: "token-ok-1234",
      pageUrl: "https://practicalsupplychainplanning.com/faq/?email=secret@example.com&utm_source=ad",
    },
    overrides || {}
  );
}

function storedText(sqlite) {
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  return tables
    .map(function (table) {
      return JSON.stringify(sqlite.prepare("SELECT * FROM " + table.name).all());
    })
    .join("\n");
}

const honeypotDb = openDb();
const honeypotFetch = okFetch();
const honeypot = await handleAsk(
  post(askBody({ company: "Acme", question: "" })),
  liveEnv(honeypotDb.db),
  deps(honeypotFetch)
);
assert.strictEqual(honeypot.status, 200);
assert.deepStrictEqual(await honeypot.json(), { ok: true, message: ASK_SUCCESS });
assert.strictEqual(honeypotFetch.calls.length, 0);
assert.strictEqual(honeypotDb.sqlite.prepare("SELECT COUNT(*) AS n FROM ask_hits").get().n, 0);

const badOrigin = await handleAsk(
  post(askBody(), { origin: "https://evil.example" }),
  liveEnv(openDb().db),
  deps(okFetch())
);
assert.strictEqual(badOrigin.status, 403);

const missingOrigin = await handleAsk(
  post(askBody(), { origin: null }),
  liveEnv(openDb().db),
  deps(okFetch())
);
assert.strictEqual(missingOrigin.status, 403);

const get = await handleAsk(
  new Request("https://practicalsupplychainplanning.com/api/ask", { method: "GET" }),
  liveEnv(openDb().db),
  deps(okFetch())
);
assert.strictEqual(get.status, 405);

const closedFetch = okFetch();
const closed = await handleAsk(
  post(askBody()),
  liveEnv(openDb().db, { ASK_QUESTIONS: "off" }),
  deps(closedFetch)
);
assert.strictEqual(closed.status, 404);
assert.strictEqual(closedFetch.calls.length, 0);

const noKey = await handleAsk(
  post(askBody()),
  liveEnv(openDb().db, { RESEND_API_KEY: "" }),
  deps(okFetch())
);
assert.strictEqual(noKey.status, 503);

const extraFetch = okFetch();
const extra = await handleAsk(
  post(askBody({ to: "other@example.com" })),
  liveEnv(openDb().db),
  deps(extraFetch)
);
assert.strictEqual(extra.status, 400);
assert.strictEqual(emailCalls(extraFetch).length, 0);

const shortToken = await handleAsk(
  post(askBody({ turnstileToken: "short" })),
  liveEnv(openDb().db),
  deps(okFetch())
);
assert.strictEqual(shortToken.status, 400);

const badTopic = await handleAsk(
  post(askBody({ topic: "Something else\nBcc: spam@example.com" })),
  liveEnv(openDb().db),
  deps(okFetch())
);
assert.strictEqual(badTopic.status, 400);

const sentDb = openDb();
const sentFetch = okFetch();
const sent = await handleAsk(post(askBody()), liveEnv(sentDb.db), deps(sentFetch));
assert.strictEqual(sent.status, 200);
assert.deepStrictEqual(await sent.json(), { ok: true, message: ASK_SUCCESS });
assert.strictEqual(emailCalls(sentFetch).length, 1);
assert.strictEqual(sentFetch.calls.length, 2);
const emailBody = JSON.parse(emailCalls(sentFetch)[0].body);
assert.strictEqual(emailBody.from, FROM_ADDRESS);
assert.deepStrictEqual(emailBody.to, [REPLY_TO]);
assert.strictEqual(emailBody.reply_to, ASKER);
assert.strictEqual(emailBody.subject, "FAQ question: Licence or trial");
assert.strictEqual(emailBody.html, undefined);
assert.strictEqual(emailBody.headers, undefined);
assert.match(emailBody.text, /Name: not given/);
assert.match(emailBody.text, /Email: buyer@example.com/);
assert.match(emailBody.text, /Page: \/faq\/\?utm_source=ad/);
assert.doesNotMatch(emailBody.text, /secret@example.com/);
assert.match(emailBody.text, /Where did my licence key go\?/);
assert.doesNotMatch(emailBody.text, /List-Unsubscribe/);
const stored = storedText(sentDb.sqlite);
assert.ok(!stored.includes("Where did my licence key go"));
assert.ok(!stored.includes("Licence or trial"));
assert.strictEqual(sentDb.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);
assert.strictEqual(sentDb.sqlite.prepare("SELECT COUNT(*) AS n FROM rate_hits").get().n, 0);
const hit = sentDb.sqlite.prepare("SELECT email, ip FROM ask_hits").get();
assert.strictEqual(hit.email, ASKER);
assert.strictEqual(hit.ip, "203.0.113.8");

const named = await handleAsk(
  post(askBody({ name: "  Pat\nBuyer  ", email: "Pat.Buyer@Example.com" })),
  liveEnv(openDb().db),
  deps(okFetch())
);
assert.strictEqual(named.status, 200);

const namedFetch = okFetch();
await handleAsk(
  post(askBody({ name: "Pat Buyer" })),
  liveEnv(openDb().db),
  deps(namedFetch)
);
assert.match(JSON.parse(emailCalls(namedFetch)[0].body).text, /Name: Pat Buyer/);
assert.strictEqual(JSON.parse(emailCalls(namedFetch)[0].body).reply_to, ASKER);

const blockedDb = openDb();
blockedDb.sqlite
  .prepare("INSERT INTO suppression (email, reason, created_at, resend_event_id) VALUES (?, ?, ?, ?)")
  .run(ASKER, "unsubscribe", "2026-11-01T00:00:00.000Z", "evt_old");
const blockedFetch = okFetch();
const blocked = await handleAsk(post(askBody()), liveEnv(blockedDb.db), deps(blockedFetch));
assert.strictEqual(blocked.status, 200);
assert.strictEqual(emailCalls(blockedFetch).length, 1);
assert.strictEqual(
  blockedDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get(ASKER).reason,
  "unsubscribe"
);

const sharedDb = openDb();
for (let i = 0; i < 8; i += 1) {
  sharedDb.sqlite
    .prepare("INSERT INTO rate_hits (email, ip, created_at) VALUES (?, ?, ?)")
    .run(ASKER, "203.0.113.8", "2026-11-12T01:00:00.000Z");
}
const sharedFetch = okFetch();
const shared = await handleAsk(post(askBody()), liveEnv(sharedDb.db), deps(sharedFetch));
assert.strictEqual(shared.status, 200);
assert.strictEqual(emailCalls(sharedFetch).length, 1);

const ipDb = openDb();
const ipFetch = okFetch();
for (let i = 0; i < IP_LIMIT; i += 1) {
  const response = await handleAsk(
    post(askBody({ email: "ip" + i + "@example.com" }), { "CF-Connecting-IP": "203.0.113.9" }),
    liveEnv(ipDb.db),
    deps(ipFetch)
  );
  assert.strictEqual(response.status, 200, "ip send " + i);
}
const ipBlocked = await handleAsk(
  post(askBody({ email: "ip-extra@example.com" }), { "CF-Connecting-IP": "203.0.113.9" }),
  liveEnv(ipDb.db),
  deps(ipFetch)
);
assert.strictEqual(ipBlocked.status, 429);
assert.strictEqual(emailCalls(ipFetch).length, IP_LIMIT);

const emailDb = openDb();
const emailFetch = okFetch();
for (let i = 0; i < EMAIL_LIMIT; i += 1) {
  const response = await handleAsk(
    post(askBody(), { "CF-Connecting-IP": "198.51.100." + i }),
    liveEnv(emailDb.db),
    deps(emailFetch)
  );
  assert.strictEqual(response.status, 200, "email send " + i);
}
const emailBlocked = await handleAsk(
  post(askBody(), { "CF-Connecting-IP": "198.51.100.40" }),
  liveEnv(emailDb.db),
  deps(emailFetch)
);
assert.strictEqual(emailBlocked.status, 429);
assert.strictEqual(emailCalls(emailFetch).length, EMAIL_LIMIT);

async function webhook(db, type, data) {
  const body = JSON.stringify({ type: type, data: data });
  const timestamp = String(Math.floor(NOW / 1000));
  const id = "evt_ask_" + type + "_" + Math.random().toString(16).slice(2);
  const signature = await signWebhook(SECRET, id, timestamp, body);
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
    liveEnv(db, null),
    deps(okFetch())
  );
  assert.strictEqual(response.status, 200);
}

const hookDb = openDb();
await webhook(hookDb.db, "email.bounced", {
  to: [REPLY_TO],
  bounce: { type: "Permanent" },
});
await webhook(hookDb.db, "email.complained", { to: ["Support@practicalsupplychainplanning.com"] });
assert.strictEqual(hookDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 0);
await webhook(hookDb.db, "email.bounced", {
  to: [REPLY_TO, "other-buyer@example.com"],
  bounce: { type: "Permanent" },
});
assert.strictEqual(hookDb.sqlite.prepare("SELECT COUNT(*) AS n FROM suppression").get().n, 1);
assert.strictEqual(
  hookDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("other-buyer@example.com").reason,
  "bounce"
);
assert.strictEqual(
  hookDb.sqlite.prepare("SELECT email FROM suppression WHERE email = ?").get(REPLY_TO),
  undefined
);

const built = path.join(ROOT, "_site", "faq", "index.html");
assert.ok(fs.existsSync(built), "Built /faq/ is missing. Run npm run build first.");
const html = fs.readFileSync(built, "utf8");
assert.doesNotMatch(html, /FAQPage/);
assert.match(html, /Ask a question/);
assert.match(html, /Send question/);
ASK_TOPICS.forEach(function (topic) {
  assert.ok(html.includes(topic), "built page missing " + topic);
});
assert.doesNotMatch(html, /href="\/start\//);

console.log("FAQ ask form OK.");
