const { webAnalyticsToken } = require("../../scripts/web-analytics");

module.exports = {
  name: "Practical Supply Chain Planning",
  url: "https://practicalsupplychainplanning.com",
  // Cloudflare Web Analytics site token. Set the Pages *build* environment
  // variable CF_WEB_ANALYTICS_TOKEN. Leave it unset and every page is built
  // without the beacon. Do not also enable Pages automatic injection.
  webAnalyticsToken: webAnalyticsToken(),
  // Bump whenever any versioned CSS or JS asset changes.
  cssVersion: "40",
  logoVersion: "2",
  copyrightYear: 2026,
  // Replace "[ABN]" with the ABN. Until then the ABN is not shown.
  abn: "56 757 743 802",
  // Public Turnstile site key for the Website forms widget. The secret stays in Pages.
  turnstileSiteKey: "0x4AAAAAAFMWJU5owYhGcyrK",
};
