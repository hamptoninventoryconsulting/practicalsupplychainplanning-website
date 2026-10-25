/**
 * Paddle Billing config for /products/practical-stock-planner/.
 *
 * Daniel fills in two values before live checkout can open:
 * - clientToken: the live client-side token (starts with live_)
 * - campaigns.default.priceId: the live price for Practical Stock Planner
 *
 * The product page opens the default price only, quantity 1, with no discount.
 * The page never reads a price or discount from the URL.
 *
 * Paddle's default live payment link, after the domain is approved:
 * https://practicalsupplychainplanning.com/products/practical-stock-planner/
 */
module.exports = {
  environment: "live",
  clientToken: "REPLACE_ME_LIVE_TOKEN",
  successUrl: "https://practicalsupplychainplanning.com/welcome/",
  campaigns: {
    default: {
      priceId: "pri_01m563dadzkmdnxz296qh7g63s",
    },
  },
};
