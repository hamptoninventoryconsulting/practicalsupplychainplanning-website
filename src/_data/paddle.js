/**
 * Paddle Billing config for /products/practical-stock-planner/.
 *
 * Daniel fills in two values before live checkout can open:
 * - clientToken: the live client-side token (starts with live_)
 * - campaigns.default.priceId: the live price for Practical Stock Planner
 *
 * The product page opens the default price only, quantity 1.
 * While checkoutOpen is true, pricing-checkout.js passes foundingDiscountCode
 * to Paddle.Checkout.open as discountCode. Paddle.js supports that parameter.
 * The page never reads a price or a code from the URL.
 *
 * foundingDiscountCode is FOUNDING29, the live US dollar founding discount.
 * Paddle.js accepts one code. A flat discount must match the checkout currency
 * (Paddle error transaction_invalid_discount_currency), so this file does not
 * send FOUNDINGAU. That Australian code is decided but may not exist yet.
 *
 * guidedSetupOpen stays false until a Guided setup Paddle product exists.
 * The product page must not render a buy link while it is false. A later
 * change can set it true and add the buy link in the product template.
 *
 * Paddle's default live payment link, after the domain is approved:
 * https://practicalsupplychainplanning.com/products/practical-stock-planner/
 *
 * Turn checkout on (16 Nov 2026): set checkoutOpen to true and redeploy.
 * That one line loads Paddle on the product page, restores "Start your free trial",
 * applies FOUNDING29, and stops the /welcome/ redirect.
 * Do not change the token, price, or successUrl.
 * Leave guidedSetupOpen false until the Guided setup product exists.
 */
module.exports = {
  checkoutOpen: false,
  launchDate: "16 Nov 2026",
  environment: "live",
  clientToken: "live_17000353de961361741fa101825",
  successUrl: "https://practicalsupplychainplanning.com/welcome/",
  foundingDiscountCode: "FOUNDING29",
  guidedSetupOpen: false,
  campaigns: {
    default: {
      priceId: "pri_01m563dadzkmdnxz296qh7g63s",
    },
  },
};
