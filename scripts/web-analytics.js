/**
 * Cloudflare Web Analytics beacon.
 *
 * The site token is the Pages build environment variable
 * CF_WEB_ANALYTICS_TOKEN. Eleventy reads it once and, when it is set, writes
 * the manual snippet immediately before </body> on every HTML page. An empty
 * value leaves every page without the beacon.
 *
 * The token is public once it is in the HTML. It still stays out of git so a
 * build without it cannot emit a broken script tag.
 */
"use strict";

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

function normalizeToken(value) {
  const token = String(value ?? "").trim();
  if (!token) {
    return "";
  }
  if (!TOKEN_RE.test(token)) {
    throw new Error(
      "CF_WEB_ANALYTICS_TOKEN must be 16 to 128 characters and use only letters, numbers, underscores, and hyphens. The beacon was not added."
    );
  }
  return token;
}

function webAnalyticsToken() {
  return normalizeToken(process.env.CF_WEB_ANALYTICS_TOKEN);
}

function beaconTag(token) {
  const safe = normalizeToken(token);
  if (!safe) {
    throw new Error("A Cloudflare Web Analytics token is required to build the beacon tag.");
  }
  return `<script defer src='${BEACON_SRC}' data-cf-beacon='{"token": "${safe}"}'></script>`;
}

function injectWebAnalytics(html, token) {
  const safe = normalizeToken(token);
  if (!safe) {
    return html;
  }
  if (
    html.includes("static.cloudflareinsights.com/beacon.min.js") ||
    html.includes("data-cf-beacon")
  ) {
    throw new Error(
      "Refusing to add a second Cloudflare Web Analytics beacon. Remove any other snippet first."
    );
  }
  const closeAt = html.lastIndexOf("</body>");
  if (closeAt === -1) {
    throw new Error(
      "HTML page has no </body>, so the Cloudflare Web Analytics beacon was not added."
    );
  }
  const lineStart = html.lastIndexOf("\n", closeAt - 1) + 1;
  const bodyIndent = html.slice(lineStart, closeAt);
  const tag = beaconTag(safe);
  return `${html.slice(0, lineStart)}${bodyIndent}  ${tag}\n${html.slice(lineStart)}`;
}

module.exports = {
  BEACON_SRC,
  TOKEN_RE,
  normalizeToken,
  webAnalyticsToken,
  beaconTag,
  injectWebAnalytics,
};
