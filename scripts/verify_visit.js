#!/usr/bin/env node
/**
 * Visit utm_ and ref carry into Paddle customData and the email form.
 * Run after `npm run build`.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const visit = require("../assets/visit.js");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "_site");

function memoryStorage() {
  const data = Object.create(null);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

function harness(initial) {
  let search = initial;
  const storage = memoryStorage();
  const api = visit.createVisit(storage, function () {
    return search;
  });
  return {
    storage,
    api,
    set(next) {
      search = next;
    },
  };
}

const landing =
  "?utm_source=outreach&utm_medium=email&utm_campaign=plan-ahead&utm_content=intro-v1&ref=abc";

const arrived = harness(landing);
arrived.api.capture();
arrived.set("");
const carried = arrived.api.customData();
assert.deepStrictEqual(carried, {
  campaign: "plan-ahead",
  utm_source: "outreach",
  utm_medium: "email",
  utm_campaign: "plan-ahead",
  utm_content: "intro-v1",
  ref: "abc",
});
assert.deepStrictEqual(arrived.api.forSignup(), {
  source: "outreach",
  medium: "email",
  campaign: "plan-ahead",
  term: null,
  content: "intro-v1",
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(arrived.api.forSignup(), "ref"), false);

const quiet = harness("");
assert.deepStrictEqual(quiet.api.customData(), { campaign: "default" });
assert.deepStrictEqual(quiet.api.forSignup(), {
  source: null,
  medium: null,
  campaign: null,
  term: null,
  content: null,
});
quiet.api.capture();
assert.strictEqual(quiet.storage.getItem(visit.STORAGE_KEY), null);

const direct = harness(
  "?utm_source=outreach&utm_medium=email&utm_campaign=planning-guides&utm_term=spring&ref=token"
);
const onPage = direct.api.customData();
assert.strictEqual(onPage.campaign, "planning-guides");
assert.strictEqual(onPage.ref, "token");
assert.strictEqual(onPage.utm_term, "spring");

const replace = harness(landing);
replace.api.capture();
replace.set("?utm_campaign=other&utm_source=ad");
replace.api.capture();
const replaced = replace.api.customData();
assert.strictEqual(replaced.campaign, "other");
assert.strictEqual(replaced.utm_source, "ad");
assert.strictEqual(replaced.utm_medium, undefined);
assert.strictEqual(replaced.ref, undefined);

const urlFirst = harness("?utm_campaign=one&ref=aaa");
urlFirst.api.capture();
urlFirst.set("?utm_source=newsletter");
const merged = urlFirst.api.read();
assert.strictEqual(merged.utm_source, "newsletter");
assert.strictEqual(merged.utm_campaign, "one");
assert.strictEqual(merged.ref, "aaa");

const longCampaign = "c".repeat(150);
const longRef = "r".repeat(150);
const odd = harness(
  "?utm_campaign=" +
    longCampaign +
    "&utm_content=intro<script>&ref=" +
    longRef +
    "<>abc&utm_medium=em ail"
);
const cleaned = odd.api.customData();
assert.strictEqual(cleaned.campaign.length, 100);
assert.strictEqual(cleaned.utm_campaign, cleaned.campaign);
assert.strictEqual(cleaned.utm_content, "introscript");
assert.strictEqual(cleaned.ref.length, 100);
assert.strictEqual(cleaned.utm_medium, "email");
assert.ok(!JSON.stringify(cleaned).includes("<"));
assert.ok(!JSON.stringify(cleaned).includes(" "));

const pii = harness("?utm_campaign=person@example.com&email=person@example.com&name=Daniel&ref=ab@c");
const hidden = pii.api.customData();
assert.deepStrictEqual(hidden, { campaign: "default" });
pii.api.capture();
assert.strictEqual(pii.storage.getItem(visit.STORAGE_KEY), null);
assert.ok(!JSON.stringify(hidden).includes("@"));
assert.ok(!JSON.stringify(hidden).includes("Daniel"));
assert.ok(!JSON.stringify(hidden).includes("person"));

const dotted = harness("?utm_content=intro.v1&ref=ab.c_d-e");
assert.strictEqual(dotted.api.customData().utm_content, "intro.v1");
assert.strictEqual(dotted.api.customData().ref, "abc_d-e");

let refused = false;
const blocked = visit.createVisit(
  {
    getItem() {
      return null;
    },
    setItem() {
      refused = true;
      throw new Error("blocked");
    },
  },
  function () {
    return landing;
  }
);
assert.doesNotThrow(function () {
  blocked.capture();
});
assert.strictEqual(refused, true);
assert.strictEqual(blocked.customData().ref, "abc");
assert.strictEqual(blocked.customData().campaign, "plan-ahead");

const checkout = fs.readFileSync(path.join(ROOT, "assets", "pricing-checkout.js"), "utf8");
assert.match(checkout, /window\.pscpVisit\.customData/);
assert.match(checkout, /campaign:\s*"default"/);
assert.match(checkout, /key\.indexOf\("utm_"\) === 0/);
assert.match(checkout, /foundingDiscountCodeAud/);
assert.match(checkout, /config\.checkoutOpen === true/);
assert.doesNotMatch(checkout, /live_[A-Za-z0-9]|pri_[A-Za-z0-9]/);

const signup = fs.readFileSync(path.join(ROOT, "assets", "keep-in-touch.js"), "utf8");
assert.match(signup, /window\.pscpVisit\.forSignup/);
assert.doesNotMatch(signup, /ref:\s*(fields|read|visit|params)/);

const layout = fs.readFileSync(path.join(ROOT, "src", "_includes", "layouts", "base.njk"), "utf8");
assert.match(layout, /\/assets\/visit\.js\?v=\{\{ site\.cssVersion \}\}/);
assert.doesNotMatch(layout, /history\.replaceState/);

const plan = fs.readFileSync(path.join(ROOT, "src", "start", "plan-ahead.njk"), "utf8");
assert.match(plan, /href="\/products\/practical-stock-planner\/#price"/);

if (!fs.existsSync(SITE)) {
  console.error("Built site is missing. Run `npm run build` before scripts/verify_visit.js.");
  process.exit(1);
}

const sourceVisit = fs.readFileSync(path.join(ROOT, "assets", "visit.js"));
const builtVisit = fs.readFileSync(path.join(SITE, "assets", "visit.js"));
assert.ok(sourceVisit.equals(builtVisit), "assets/visit.js in _site must match the source file");

const siteData = fs.readFileSync(path.join(ROOT, "src", "_data", "site.js"), "utf8");
const cssVersion = siteData.match(/cssVersion:\s*"([^"]+)"/);
assert.ok(cssVersion, "src/_data/site.js is missing cssVersion");
const visitTag = "/assets/visit.js?v=" + cssVersion[1];

for (const rel of [
  "index.html",
  "start/plan-ahead/index.html",
  "start/planning-guides/index.html",
  "products/practical-stock-planner/index.html",
  "products/index.html",
]) {
  const page = fs.readFileSync(path.join(SITE, rel), "utf8");
  assert.ok(page.includes(visitTag), rel + " must load " + visitTag);
  assert.ok(!page.includes("history.replaceState"), rel + " must leave the query string in the address bar");
}

console.log("Visit carry-through OK.");
