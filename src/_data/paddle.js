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
 *
 * Turn checkout on (16 Nov 2026): set checkoutOpen to true and redeploy.
 * That one line loads Paddle on the product page, restores "Start your free trial",
 * and stops the /welcome/ redirect. Do not change the token, price, or successUrl.
 */
module.exports = {
  checkoutOpen: false,
  launchDate: "16 Nov 2026",
  environment: "live",
  clientToken: "live_17000353de961361741fa101825",
  successUrl: "https://practicalsupplychainplanning.com/welcome/",
  campaigns: {
    default: {
      priceId: "pri_01m563dadzkmdnxz296qh7g63s",
    },
  },
};
