/**
 * Checks for the footer "Let's keep in touch" signup.
 * Uses an in-memory database and a stand-in for Resend and Turnstile.
 * No live key and no network call.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  BETA_WORDING,
  KEEP_IN_TOUCH_ADD_FAILED,
  KEEP_IN_TOUCH_SUCCESS,
  KEEP_IN_TOUCH_UNSUBSCRIBED,
  KEEP_IN_TOUCH_VERSION,
  KEEP_IN_TOUCH_WORDING,
  OPTIONAL_WORDING,
  REQUIRED_WORDING,
  SCHEMA_SQL,
  WORDING_VERSION,
  handleKeepInTouch,
  handleResendWebhook,
  handleResultsEmail,
  handleUnsubscribe,
  signUnsubscribeToken,
  signWebhook,
} from "../functions/email/logic.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const WEBHOOK_SECRET = "whsec_" + Buffer.from("keep-in-touch-webhook-key").toString("base64");
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PRIVACY_SENTENCE =
  "If you use Let's keep in touch, we add your email address to that same Articles list and keep a record of the request, including whether you ticked I'd be happy to beta test. We keep a beta tick until you unsubscribe or ask us to delete it. A keep-in-touch request without a beta tick is deleted after 24 months.";
const BETA_EXPORT = `
SELECT email, created_at
FROM consent
WHERE form_id = 'keep-in-touch'
  AND beta_box = 1
  AND email NOT IN (SELECT email FROM suppression)
  AND rowid = (
    SELECT rowid FROM consent AS latest
    WHERE latest.email = consent.email AND latest.form_id = 'keep-in-touch'
    ORDER BY latest.created_at DESC, latest.rowid DESC
    LIMIT 1
  )
ORDER BY created_at
`;

const schemaFile = fs.readFileSync(path.join(ROOT, "schema", "website-emails.sql"), "utf8");
assert.match(schemaFile, /beta_box INTEGER NOT NULL DEFAULT 0/);
assert.match(SCHEMA_SQL, /beta_box INTEGER NOT NULL DEFAULT 0/);

const privacy = fs.readFileSync(path.join(ROOT, "src", "privacy.njk"), "utf8");
assert.ok(privacy.includes(PRIVACY_SENTENCE));

const footer = fs.readFileSync(path.join(ROOT, "src", "_includes", "partials", "footer.njk"), "utf8");
assert.match(footer, /Let's keep in touch/);
assert.ok(footer.includes(KEEP_IN_TOUCH_WORDING));
assert.ok(footer.includes(BETA_WORDING));
assert.ok(footer.includes(KEEP_IN_TOUCH_SUCCESS));
assert.match(footer, /name="beta" type="checkbox"/);
assert.doesNotMatch(footer, /name="beta"[^>]*checked/);
assert.match(footer, /keep-in-touch\.js\?v=\{\{ site\.cssVersion \}\}/);

const sales = fs.readFileSync(path.join(ROOT, "src", "_includes", "layouts", "sales.njk"), "utf8");
assert.doesNotMatch(sales, /keep-in-touch|Let's keep in touch/);
// Welcome uses the sales layout, so it stays off the footer form.
// /buy/ is a redirect to /pricing/, which uses the normal footer.
assert.ok(!fs.existsSync(path.join(ROOT, "src", "buy.njk")));
const welcome = fs.readFileSync(path.join(ROOT, "src", "welcome.njk"), "utf8");
assert.match(welcome, /layouts\/sales\.njk/);
assert.doesNotMatch(welcome, /keep-in-touch/);

const home = fs.readFileSync(path.join(ROOT, "src", "index.njk"), "utf8");
assert.ok(
  home.includes(
    "Straight-logic planning for product businesses that buy in stock with lead times."
  )
);
assert.ok(
  home.includes(
    "Practical stock and supply planning for businesses that buy in stock. Free learning tools, plain-English articles and Practical Stock Planner."
  )
);
assert.doesNotMatch(home, /importers/);

function built(rel) {
  const file = path.join(ROOT, "_site", rel);
  assert.ok(fs.existsSync(file), "missing built page " + rel);
  return fs.readFileSync(file, "utf8");
}

const builtHome = built("index.html");
assert.match(builtHome, /id="keep-in-touch"/);
assert.ok(builtHome.includes(KEEP_IN_TOUCH_WORDING));
assert.ok(builtHome.includes(BETA_WORDING));
assert.match(builtHome, /styles\.css\?v=34/);
assert.match(builtHome, /keep-in-touch\.js\?v=34/);
assert.ok(built("privacy/index.html").includes(PRIVACY_SENTENCE));
assert.ok(!fs.existsSync(path.join(ROOT, "_site", "buy", "index.html")));
assert.doesNotMatch(built("welcome/index.html"), /id="keep-in-touch"|Let's keep in touch/);
assert.match(built("pricing/index.html"), /id="keep-in-touch"/);

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
  return tokenCount.toString(16).padStart(64, "b");
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
      EMAIL_DB: db,
      TURNSTILE_SECRET_KEY: "turnstile-test",
      RESEND_API_KEY: "re_test_not_live",
      RESEND_ARTICLES_AUDIENCE_ID: "aud_articles",
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

function scriptedFetch(route) {
  const calls = [];
  const fetchImpl = async function (url, options) {
    const call = {
      url: String(url),
      method: (options && options.method) || "GET",
      body: options && options.body,
    };
    calls.push(call);
    if (call.url.includes("siteverify")) {
      return jsonResponse(200, {
        success: true,
        hostname: "practicalsupplychainplanning.com",
        "error-codes": [],
      });
    }
    const response = await route(call);
    if (!response) {
      throw new Error("unexpected fetch " + call.method + " " + call.url);
    }
    return response;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function okFetch() {
  return scriptedFetch(async function (call) {
    if (call.method === "POST" && call.url === "https://api.resend.com/contacts") {
      return jsonResponse(200, { id: "con_test_1" });
    }
    return null;
  });
}

function post(body, headers) {
  const merged = Object.assign(
    {
      "content-type": "application/json",
      origin: "https://practicalsupplychainplanning.com",
      "CF-Connecting-IP": "203.0.113.40",
    },
    headers || {}
  );
  Object.keys(merged).forEach(function (key) {
    if (merged[key] == null) {
      delete merged[key];
    }
  });
  return new Request("https://practicalsupplychainplanning.com/api/keep-in-touch", {
    method: "POST",
    headers: merged,
    body: JSON.stringify(body),
  });
}

function payload(overrides) {
  return Object.assign(
    {
      email: "Reader@Example.com",
      betaConsent: false,
      company: "",
      turnstileToken: "token-ok-1234",
      pageUrl: "https://practicalsupplychainplanning.com/blog/example/?utm_source=footer#skip",
      utm: { source: "footer", medium: "web", campaign: "touch", term: null, content: null },
      wordingVersion: KEEP_IN_TOUCH_VERSION,
      wordingText: {
        articles: KEEP_IN_TOUCH_WORDING,
        beta: BETA_WORDING,
      },
      formId: "keep-in-touch",
    },
    overrides || {}
  );
}

async function send(db, body, headers, fetchImpl, envExtra) {
  const net = fetchImpl || okFetch();
  const response = await handleKeepInTouch(post(body, headers), liveEnv(db, envExtra), deps(net));
  const json = await response.json();
  return { status: response.status, json: json, calls: net.calls };
}

function contactCalls(calls) {
  return calls.filter(function (call) {
    return call.url.includes("/contacts");
  });
}

const closed = await send(openDb().db, payload(), {}, okFetch(), { RESEND_ARTICLES_AUDIENCE_ID: "" });
assert.strictEqual(closed.status, 503);
assert.strictEqual(closed.json.error, "This form is not available yet.");
assert.strictEqual(closed.calls.length, 0);

const honeypotDb = openDb();
const honeypot = await send(honeypotDb.db, payload({ company: "filled by a bot" }));
assert.strictEqual(honeypot.status, 200);
assert.strictEqual(honeypot.json.message, KEEP_IN_TOUCH_SUCCESS);
assert.strictEqual(honeypot.calls.length, 0);
assert.strictEqual(honeypotDb.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);

const off = openDb();
const betaOff = await send(off.db, payload({ email: "off@example.com", betaConsent: false }), {
  "CF-Connecting-IP": "203.0.113.41",
});
assert.strictEqual(betaOff.status, 200, JSON.stringify(betaOff.json));
assert.strictEqual(betaOff.json.message, KEEP_IN_TOUCH_SUCCESS);
assert.strictEqual(
  betaOff.calls.some(function (call) {
    return call.url.includes("/emails");
  }),
  false
);
const created = betaOff.calls.find(function (call) {
  return call.method === "POST" && call.url === "https://api.resend.com/contacts";
});
assert.ok(created);
const createdBody = JSON.parse(String(created.body));
assert.strictEqual(createdBody.email, "off@example.com");
assert.strictEqual(createdBody.unsubscribed, false);
assert.deepStrictEqual(createdBody.segments, [{ id: "aud_articles" }]);
const offRow = off.sqlite.prepare("SELECT * FROM consent").get();
assert.strictEqual(offRow.email, "off@example.com");
assert.strictEqual(offRow.form_id, "keep-in-touch");
assert.strictEqual(offRow.results_box, 0);
assert.strictEqual(offRow.articles_box, 1);
assert.strictEqual(offRow.beta_box, 0);
assert.strictEqual(offRow.wording_version, "keep-in-touch-v1");
assert.strictEqual(offRow.wording_text, KEEP_IN_TOUCH_WORDING + "\n" + BETA_WORDING);
assert.strictEqual(offRow.resend_message_id, null);
assert.strictEqual(offRow.page_url, "/blog/example/?utm_source=footer");
assert.strictEqual(offRow.utm_source, "footer");
assert.ok(offRow.unsubscribe_token);

const on = openDb();
const betaOn = await send(on.db, payload({ email: "on@example.com", betaConsent: true }), {
  "CF-Connecting-IP": "203.0.113.42",
});
assert.strictEqual(betaOn.status, 200, JSON.stringify(betaOn.json));
assert.strictEqual(on.sqlite.prepare("SELECT beta_box FROM consent").get().beta_box, 1);
assert.strictEqual(on.sqlite.prepare("SELECT articles_box, results_box FROM consent").get().articles_box, 1);
assert.strictEqual(on.sqlite.prepare("SELECT results_box FROM consent").get().results_box, 0);

const latest = openDb();
const firstJoin = await send(
  latest.db,
  payload({ email: "again@example.com", betaConsent: true }),
  { "CF-Connecting-IP": "203.0.113.43" }
);
assert.strictEqual(firstJoin.status, 200, JSON.stringify(firstJoin.json));
const secondJoin = await send(
  latest.db,
  payload({ email: "again@example.com", betaConsent: false }),
  { "CF-Connecting-IP": "203.0.113.44" }
);
assert.strictEqual(secondJoin.status, 200, JSON.stringify(secondJoin.json));
const stayed = await send(
  latest.db,
  payload({ email: "stay@example.com", betaConsent: true }),
  { "CF-Connecting-IP": "203.0.113.45" }
);
assert.strictEqual(stayed.status, 200, JSON.stringify(stayed.json));
const againRows = latest.sqlite.prepare(
  "SELECT beta_box FROM consent WHERE email = ? ORDER BY rowid"
).all("again@example.com");
assert.strictEqual(againRows.length, 2);
assert.strictEqual(againRows[0].beta_box, 1);
assert.strictEqual(againRows[1].beta_box, 0);
const exported = latest.sqlite.prepare(BETA_EXPORT).all();
assert.deepStrictEqual(
  exported.map(function (row) {
    return row.email;
  }),
  ["stay@example.com"]
);

const blocked = openDb();
blocked.sqlite
  .prepare("INSERT INTO suppression (email, reason, created_at, resend_event_id) VALUES (?, ?, ?, ?)")
  .run("blocked@example.com", "unsubscribe", "2026-01-01T00:00:00.000Z", "earlier");
const refused = await send(
  blocked.db,
  payload({ email: "blocked@example.com", betaConsent: true }),
  { "CF-Connecting-IP": "203.0.113.46" }
);
assert.strictEqual(refused.status, 403);
assert.strictEqual(refused.json.error, KEEP_IN_TOUCH_UNSUBSCRIBED);
assert.strictEqual(contactCalls(refused.calls).length, 0);
assert.strictEqual(blocked.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);

const failed = openDb();
const resendDown = scriptedFetch(async function (call) {
  if (call.url.includes("/contacts")) {
    return jsonResponse(500, { message: "audience down" });
  }
  return null;
});
const failedSend = await send(
  failed.db,
  payload({ email: "fail@example.com" }),
  { "CF-Connecting-IP": "203.0.113.47" },
  resendDown
);
assert.strictEqual(failedSend.status, 502);
assert.strictEqual(failedSend.json.error, KEEP_IN_TOUCH_ADD_FAILED);
assert.strictEqual(failed.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);

const thrown = openDb();
const resendThrow = scriptedFetch(async function (call) {
  if (call.url.includes("/contacts")) {
    throw new Error("network down");
  }
  return null;
});
const thrownSend = await send(
  thrown.db,
  payload({ email: "throw@example.com" }),
  { "CF-Connecting-IP": "203.0.113.48" },
  resendThrow
);
assert.strictEqual(thrownSend.status, 502);
assert.strictEqual(thrownSend.json.error, KEEP_IN_TOUCH_ADD_FAILED);
assert.strictEqual(thrown.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);

const drift = openDb();
const driftFetch = scriptedFetch(async function (call) {
  if (call.method === "POST" && call.url === "https://api.resend.com/contacts") {
    return jsonResponse(422, { message: "Contact already exists", name: "validation_error" });
  }
  if (call.method === "GET" && call.url === "https://api.resend.com/contacts/drift@example.com") {
    return jsonResponse(200, { email: "drift@example.com", unsubscribed: true });
  }
  return null;
});
const driftSend = await send(
  drift.db,
  payload({ email: "drift@example.com", betaConsent: true }),
  { "CF-Connecting-IP": "203.0.113.49" },
  driftFetch
);
assert.strictEqual(driftSend.status, 403);
assert.strictEqual(driftSend.json.error, KEEP_IN_TOUCH_UNSUBSCRIBED);
assert.strictEqual(
  driftFetch.calls.some(function (call) {
    return call.url.includes("/segments/");
  }),
  false
);
assert.strictEqual(drift.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);
assert.strictEqual(
  drift.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("drift@example.com").reason,
  "unsubscribe"
);

const existing = openDb();
const existingFetch = scriptedFetch(async function (call) {
  if (call.method === "POST" && call.url === "https://api.resend.com/contacts") {
    return jsonResponse(422, { message: "Contact already exists" });
  }
  if (call.method === "GET" && call.url === "https://api.resend.com/contacts/there@example.com") {
    return jsonResponse(200, { email: "there@example.com", unsubscribed: false });
  }
  if (
    call.method === "POST" &&
    call.url === "https://api.resend.com/contacts/there@example.com/segments/aud_articles"
  ) {
    return jsonResponse(200, { id: "aud_articles" });
  }
  return null;
});
const existingSend = await send(
  existing.db,
  payload({ email: "there@example.com" }),
  { "CF-Connecting-IP": "203.0.113.50" },
  existingFetch
);
assert.strictEqual(existingSend.status, 200, JSON.stringify(existingSend.json));
assert.strictEqual(existing.sqlite.prepare("SELECT articles_box FROM consent").get().articles_box, 1);

const already = openDb();
const alreadyFetch = scriptedFetch(async function (call) {
  if (call.method === "POST" && call.url === "https://api.resend.com/contacts") {
    return jsonResponse(409, { message: "Contact already exists" });
  }
  if (call.method === "GET") {
    return jsonResponse(200, { unsubscribed: false });
  }
  if (call.method === "POST" && call.url.includes("/segments/aud_articles")) {
    return jsonResponse(422, { message: "Contact already exists" });
  }
  return null;
});
const alreadySend = await send(
  already.db,
  payload({ email: "already@example.com", betaConsent: true }),
  { "CF-Connecting-IP": "203.0.113.51" },
  alreadyFetch
);
assert.strictEqual(alreadySend.status, 200, JSON.stringify(alreadySend.json));
assert.strictEqual(already.sqlite.prepare("SELECT beta_box FROM consent").get().beta_box, 1);

const limited = openDb();
const limitStmt = limited.sqlite.prepare(
  "INSERT INTO rate_hits (email, ip, created_at) VALUES (?, ?, ?)"
);
for (let i = 0; i < 5; i += 1) {
  limitStmt.run("other" + i + "@example.com", "203.0.113.52", "2026-10-01T11:30:00.000Z");
}
const limitedSend = await send(
  limited.db,
  payload({ email: "sixth@example.com" }),
  { "CF-Connecting-IP": "203.0.113.52" }
);
assert.strictEqual(limitedSend.status, 429);
assert.match(limitedSend.json.error, /Try again later/);
assert.strictEqual(contactCalls(limitedSend.calls).length, 0);
assert.strictEqual(limited.sqlite.prepare("SELECT COUNT(*) AS n FROM consent").get().n, 0);

const aged = openDb();
const oldConsent = aged.sqlite.prepare(
  `INSERT INTO consent (
    id, email, created_at, ip, form_id, page_url, wording_version, wording_text,
    results_box, articles_box, beta_box, unsubscribe_token
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
oldConsent.run(
  "old-beta",
  "old-beta@example.com",
  "2024-01-01T00:00:00.000Z",
  "203.0.113.1",
  "keep-in-touch",
  "/",
  KEEP_IN_TOUCH_VERSION,
  KEEP_IN_TOUCH_WORDING,
  0,
  1,
  1,
  "1".repeat(64)
);
oldConsent.run(
  "old-plain",
  "old-plain@example.com",
  "2024-01-01T00:00:00.000Z",
  "203.0.113.1",
  "keep-in-touch",
  "/",
  KEEP_IN_TOUCH_VERSION,
  KEEP_IN_TOUCH_WORDING,
  0,
  1,
  0,
  "2".repeat(64)
);
oldConsent.run(
  "old-results",
  "old-results@example.com",
  "2024-01-01T00:00:00.000Z",
  "203.0.113.1",
  "safety-stock-simulator",
  "/learn/safety-stock-simulator/",
  WORDING_VERSION,
  REQUIRED_WORDING,
  1,
  0,
  0,
  "3".repeat(64)
);
const agedSend = await send(
  aged.db,
  payload({ email: "fresh@example.com" }),
  { "CF-Connecting-IP": "203.0.113.53" }
);
assert.strictEqual(agedSend.status, 200, JSON.stringify(agedSend.json));
assert.ok(aged.sqlite.prepare("SELECT 1 FROM consent WHERE email = ?").get("old-beta@example.com"));
assert.strictEqual(
  aged.sqlite.prepare("SELECT 1 FROM consent WHERE email = ?").get("old-plain@example.com"),
  undefined
);
assert.strictEqual(
  aged.sqlite.prepare("SELECT 1 FROM consent WHERE email = ?").get("old-results@example.com"),
  undefined
);
assert.ok(aged.sqlite.prepare("SELECT 1 FROM consent WHERE email = ?").get("fresh@example.com"));

const legacy = new DatabaseSync(":memory:");
legacy.exec(`
CREATE TABLE consent (
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
`);
const legacySend = await send(
  adapter(legacy),
  payload({ email: "legacy@example.com", betaConsent: true }),
  { "CF-Connecting-IP": "203.0.113.54" }
);
assert.strictEqual(legacySend.status, 200, JSON.stringify(legacySend.json));
const legacyNames = legacy.prepare("PRAGMA table_info(consent)").all().map(function (col) {
  return col.name;
});
assert.ok(legacyNames.includes("beta_box"));
assert.strictEqual(legacy.prepare("SELECT beta_box FROM consent").get().beta_box, 1);

async function confirmUnsubscribe(db, token) {
  const signed = await signUnsubscribeToken(token, "test-unsubscribe-signing-key");
  const link = "https://practicalsupplychainplanning.com/unsubscribe/?t=" + encodeURIComponent(signed);
  const preview = await handleUnsubscribe(new Request(link), liveEnv(db), deps(okFetch()));
  assert.match(await preview.text(), /Confirm you want to unsubscribe/);
  const done = await handleUnsubscribe(
    new Request(link, { method: "POST", body: "confirm=unsubscribe" }),
    liveEnv(db),
    deps(
      scriptedFetch(async function (call) {
        if (call.method === "DELETE") {
          return jsonResponse(200, {});
        }
        return null;
      })
    )
  );
  assert.match(await done.text(), /You are unsubscribed/);
}

const unsub = openDb();
const unsubJoin = await send(
  unsub.db,
  payload({ email: "beta-keep@example.com", betaConsent: true }),
  { "CF-Connecting-IP": "203.0.113.60" }
);
assert.strictEqual(unsubJoin.status, 200, JSON.stringify(unsubJoin.json));
const unsubInsert = unsub.sqlite.prepare(
  `INSERT INTO consent (
    id, email, created_at, ip, form_id, page_url, wording_version, wording_text,
    results_box, articles_box, beta_box, unsubscribe_token
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
unsubInsert.run(
  "old-same",
  "beta-keep@example.com",
  "2024-01-01T00:00:00.000Z",
  "203.0.113.1",
  "keep-in-touch",
  "/",
  KEEP_IN_TOUCH_VERSION,
  KEEP_IN_TOUCH_WORDING,
  0,
  1,
  1,
  "c".repeat(64)
);
unsubInsert.run(
  "old-other",
  "still-beta@example.com",
  "2024-01-01T00:00:00.000Z",
  "203.0.113.1",
  "keep-in-touch",
  "/",
  KEEP_IN_TOUCH_VERSION,
  KEEP_IN_TOUCH_WORDING,
  0,
  1,
  1,
  "d".repeat(64)
);
const liveToken = unsub.sqlite
  .prepare("SELECT unsubscribe_token FROM consent WHERE id != 'old-same' AND email = ?")
  .get("beta-keep@example.com").unsubscribe_token;
const signedPreview = await signUnsubscribeToken(liveToken, "test-unsubscribe-signing-key");
const previewLink =
  "https://practicalsupplychainplanning.com/unsubscribe/?t=" + encodeURIComponent(signedPreview);
const previewOnly = await handleUnsubscribe(new Request(previewLink), liveEnv(unsub.db), deps(okFetch()));
assert.match(await previewOnly.text(), /Confirm you want to unsubscribe/);
assert.strictEqual(
  unsub.sqlite.prepare("SELECT MIN(beta_box) AS n FROM consent WHERE email = ?").get("beta-keep@example.com").n,
  1
);
await confirmUnsubscribe(unsub.db, liveToken);
const cleared = unsub.sqlite
  .prepare("SELECT beta_box, created_at FROM consent WHERE email = ? ORDER BY created_at")
  .all("beta-keep@example.com");
assert.strictEqual(cleared.length, 2);
cleared.forEach(function (row) {
  assert.strictEqual(row.beta_box, 0);
});
assert.strictEqual(
  unsub.sqlite.prepare("SELECT beta_box FROM consent WHERE email = ?").get("still-beta@example.com").beta_box,
  1
);
const pruneTrigger = await send(
  unsub.db,
  payload({ email: "prune-trigger@example.com", betaConsent: false }),
  { "CF-Connecting-IP": "203.0.113.61" }
);
assert.strictEqual(pruneTrigger.status, 200, JSON.stringify(pruneTrigger.json));
assert.strictEqual(
  unsub.sqlite.prepare("SELECT 1 FROM consent WHERE id = 'old-same'").get(),
  undefined
);
const keptRecent = unsub.sqlite
  .prepare("SELECT beta_box FROM consent WHERE email = ? AND created_at = ?")
  .get("beta-keep@example.com", "2026-10-01T12:00:00.000Z");
assert.ok(keptRecent);
assert.strictEqual(keptRecent.beta_box, 0);
assert.strictEqual(
  unsub.sqlite.prepare("SELECT beta_box FROM consent WHERE email = ?").get("still-beta@example.com").beta_box,
  1
);

async function postWebhook(db, type, data) {
  const body = JSON.stringify({ type: type, data: data });
  const timestamp = String(Math.floor(NOW / 1000));
  const id = "evt_" + type + "_" + Math.random().toString(16).slice(2);
  const signature = await signWebhook(WEBHOOK_SECRET, id, timestamp, body);
  return handleResendWebhook(
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
    liveEnv(db, { RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET }),
    deps(okFetch())
  );
}

function insertBetaRow(sqlite, id, email, token) {
  sqlite
    .prepare(
      `INSERT INTO consent (
        id, email, created_at, ip, form_id, page_url, wording_version, wording_text,
        results_box, articles_box, beta_box, unsubscribe_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      email,
      "2026-09-01T00:00:00.000Z",
      "203.0.113.1",
      "keep-in-touch",
      "/",
      KEEP_IN_TOUCH_VERSION,
      KEEP_IN_TOUCH_WORDING,
      0,
      1,
      1,
      token
    );
}

const complaintDb = openDb();
insertBetaRow(complaintDb.sqlite, "complaint-new", "spam@example.com", "e".repeat(64));
insertBetaRow(complaintDb.sqlite, "complaint-old", "spam@example.com", "f".repeat(64));
insertBetaRow(complaintDb.sqlite, "bounce-row", "bounced@example.com", "9".repeat(64));
const complained = await postWebhook(complaintDb.db, "email.complained", {
  to: ["Spam@Example.com"],
});
assert.strictEqual(complained.status, 200);
assert.strictEqual(
  complaintDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("spam@example.com").reason,
  "complaint"
);
const complaintTicks = complaintDb.sqlite
  .prepare("SELECT beta_box FROM consent WHERE email = ?")
  .all("spam@example.com");
assert.strictEqual(complaintTicks.length, 2);
complaintTicks.forEach(function (row) {
  assert.strictEqual(row.beta_box, 0);
});
const bounced = await postWebhook(complaintDb.db, "email.bounced", {
  to: ["bounced@example.com"],
  bounce: { type: "Permanent" },
});
assert.strictEqual(bounced.status, 200);
assert.strictEqual(
  complaintDb.sqlite.prepare("SELECT reason FROM suppression WHERE email = ?").get("bounced@example.com").reason,
  "bounce"
);
assert.strictEqual(
  complaintDb.sqlite.prepare("SELECT beta_box FROM consent WHERE email = ?").get("bounced@example.com").beta_box,
  1
);

function resultsPayload() {
  return {
    email: "results-only@example.com",
    resultsConsent: true,
    articlesConsent: false,
    company: "",
    turnstileToken: "token-ok-1234",
    pageUrl: "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/",
    utm: { source: null, medium: null, campaign: null, term: null, content: null },
    wordingVersion: WORDING_VERSION,
    wordingText: {
      required: REQUIRED_WORDING,
      optional: OPTIONAL_WORDING,
    },
    formId: "safety-stock-simulator",
    summary: {
      kind: "teaching",
      mode: "year",
      seed: 7,
      settings: [{ label: "Demand pattern", value: "Flat" }],
      metrics: {
        oosWeeks: 1,
        csl: 95,
        inventoryTurns: 4,
        averageWc: 10,
        annualGp: 20,
        safetyStock: 3,
      },
      commentary: ["In the scenario you ran, nothing here is a newsletter signup."],
      reopenUrl:
        "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/?m=year&s=7&run=1&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1",
      charts: [{ title: "One year", pngBase64: TINY_PNG }],
    },
  };
}

const resultsDb = openDb();
const resultsFetch = scriptedFetch(async function (call) {
  if (call.url.includes("/emails")) {
    return jsonResponse(200, { id: "msg_results_only" });
  }
  if (call.url.includes("/contacts")) {
    throw new Error("results-only must stay off the articles segment");
  }
  return null;
});
const resultsResponse = await handleResultsEmail(
  new Request("https://practicalsupplychainplanning.com/api/results-email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://practicalsupplychainplanning.com",
      "CF-Connecting-IP": "203.0.113.55",
    },
    body: JSON.stringify(resultsPayload()),
  }),
  Object.assign(liveEnv(resultsDb.db), { RESULTS_EMAIL: "on" }),
  deps(resultsFetch)
);
const resultsJson = await resultsResponse.json();
assert.strictEqual(resultsResponse.status, 200, JSON.stringify(resultsJson));
const resultsRow = resultsDb.sqlite.prepare("SELECT results_box, articles_box, beta_box FROM consent").get();
assert.strictEqual(resultsRow.results_box, 1);
assert.strictEqual(resultsRow.articles_box, 0);
assert.strictEqual(resultsRow.beta_box, 0);
assert.strictEqual(
  resultsFetch.calls.some(function (call) {
    return call.url.includes("/contacts");
  }),
  false
);
