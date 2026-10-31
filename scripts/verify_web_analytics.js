#!/usr/bin/env node
/**
 * Confirm the Cloudflare Web Analytics beacon on the Eleventy build.
 *
 * Run after `npm run build` in the same environment. With CF_WEB_ANALYTICS_TOKEN
 * unset, every HTML file has zero beacons. With it set, every HTML file has
 * exactly one, immediately before </body>.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  BEACON_SRC,
  beaconTag,
  injectWebAnalytics,
  normalizeToken,
  webAnalyticsToken,
} = require("./web-analytics");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "_site");

function walkHtml(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkHtml(full));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      found.push(full);
    }
  }
  return found;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
  return count;
}

function assertInjector() {
  const sample = "<!DOCTYPE html>\n<html>\n<body>\n  <p>Hi</p>\n  </body>\n</html>\n";
  assert.strictEqual(injectWebAnalytics(sample, ""), sample);
  assert.strictEqual(injectWebAnalytics(sample, "   "), sample);

  const token = "a1b2c3d4e5f67890abcd";
  const once = injectWebAnalytics(sample, token);
  const tag = beaconTag(token);
  assert.strictEqual(countOccurrences(once, tag), 1);
  assert.match(once, new RegExp(`${tag}\\n\\s*</body>`));
  assert.throws(() => injectWebAnalytics(once, token), /second Cloudflare Web Analytics beacon/);
  assert.throws(() => normalizeToken("short"), /CF_WEB_ANALYTICS_TOKEN/);
  assert.throws(() => normalizeToken(`bad'quote${"a".repeat(16)}`), /CF_WEB_ANALYTICS_TOKEN/);
  assert.throws(() => injectWebAnalytics("<p>No body</p>", token), /no <\/body>/);
}

function assertNoContentSecurityPolicyGap() {
  const headers = [path.join(ROOT, "_headers"), path.join(SITE, "_headers")];
  const texts = [];
  for (const file of headers) {
    if (fs.existsSync(file)) {
      texts.push(fs.readFileSync(file, "utf8"));
    }
  }
  const functionsDir = path.join(ROOT, "functions");
  if (fs.existsSync(functionsDir)) {
    for (const file of fs.readdirSync(functionsDir, { recursive: true })) {
      const full = path.join(functionsDir, file.toString());
      if (fs.existsSync(full) && fs.statSync(full).isFile() && /\.(js|mjs|ts)$/.test(full)) {
        texts.push(fs.readFileSync(full, "utf8"));
      }
    }
  }
  const htmlFiles = walkHtml(SITE);
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    if (/content-security-policy/i.test(html)) {
      texts.push(html);
    }
  }
  for (const text of texts) {
    if (!/content-security-policy/i.test(text)) {
      continue;
    }
    assert.match(
      text,
      /static\.cloudflareinsights\.com/,
      "Content-Security-Policy must allow static.cloudflareinsights.com (script)"
    );
    assert.match(
      text,
      /(?<!static\.)cloudflareinsights\.com/,
      "Content-Security-Policy must allow cloudflareinsights.com (connect)"
    );
  }
}

function main() {
  assertInjector();

  if (!fs.existsSync(SITE)) {
    console.error("Built site is missing. Run `npm run build` before scripts/verify_web_analytics.js.");
    process.exit(1);
  }

  const token = webAnalyticsToken();
  const expectedTag = token ? beaconTag(token) : "";
  const htmlFiles = walkHtml(SITE).sort();
  assert.ok(htmlFiles.length > 0, "no HTML files were built into _site");

  const pages = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const relative = path.relative(SITE, file).split(path.sep).join("/");
    const tags = countOccurrences(html, "data-cf-beacon");
    const sources = countOccurrences(html, BEACON_SRC);
    if (!token) {
      assert.strictEqual(tags, 0, `${relative} includes a beacon but CF_WEB_ANALYTICS_TOKEN is unset`);
      assert.strictEqual(sources, 0, `${relative} includes ${BEACON_SRC} but no token is set`);
    } else {
      assert.strictEqual(tags, 1, `${relative} should contain exactly one beacon, found ${tags}`);
      assert.strictEqual(sources, 1, `${relative} should load ${BEACON_SRC} once, found ${sources}`);
      assert.strictEqual(
        countOccurrences(html, expectedTag),
        1,
        `${relative} beacon does not match the configured token`
      );
      assert.match(
        html,
        new RegExp(`${expectedTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n\\s*</body>`),
        `${relative} beacon must sit immediately before </body>`
      );
    }
    pages.push(relative);
  }

  assertNoContentSecurityPolicyGap();

  if (token) {
    const privacy = fs.readFileSync(path.join(SITE, "privacy", "index.html"), "utf8");
    assert.match(privacy, /Cloudflare Web Analytics/);
    assert.match(privacy, /does not use cookies/);
    assert.match(privacy, /31 October 2026/);
    assert.match(
      privacy,
      /<th scope="row">Cloudflare<\/th>\s*<td>Hosts our website and domain name records, website analytics \(page views\), and stores the free-tool email records<\/td>/
    );
    assert.doesNotMatch(privacy, /has no analytics, advertising or tracking cookies/);
    console.log(
      `Cloudflare Web Analytics: ${pages.length} HTML pages, each has exactly one beacon.`
    );
  } else {
    const privacy = fs.readFileSync(path.join(SITE, "privacy", "index.html"), "utf8");
    assert.match(privacy, /has no analytics, advertising or tracking cookies/);
    assert.match(privacy, /31 October 2026/);
    assert.match(
      privacy,
      /<th scope="row">Cloudflare<\/th>\s*<td>Hosts our website and domain name records, and stores the free-tool email records<\/td>/
    );
    assert.doesNotMatch(privacy, /We count page views with Cloudflare Web Analytics/);
    assert.doesNotMatch(privacy, /website analytics \(page views\)/);
    console.log(
      `Cloudflare Web Analytics: ${pages.length} HTML pages, token unset, 0 beacons.`
    );
  }
  for (const page of pages) {
    console.log(`  ${page}`);
  }
}

main();
