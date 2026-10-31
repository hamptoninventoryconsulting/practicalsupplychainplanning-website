/**
 * Paddle Billing config for /products/practical-stock-planner/.
 *
 * Daniel fills in two values before live checkout can open:
 * - clientToken: the live client-side token (starts with live_)
 * - campaigns.default.priceId: the live price for Practical Stock Planner
 *
 * The product page opens the default price only, quantity 1.
 * While checkoutOpen is true, pricing-checkout.js passes one founding discount
 * code to Paddle.Checkout.open as discountCode. Paddle.js supports that
 * parameter. The page never reads a price or a code from the URL.
 *
 * foundingDiscountCode is FOUNDING29: US$20 off for 12 billing periods
 * (US$29 per month). foundingDiscountCodeAud is FOUNDINGAU: 40% off for 12
 * billing periods (A$75 down to A$45 per month including GST). Paddle.js
 * accepts one code. A flat discount must match the checkout currency, so an
 * Australian-dollar checkout gets FOUNDINGAU and any other checkout gets
 * FOUNDING29. Neither code is sent while checkoutOpen is false.
 *
 * guidedSetupOpen stays false. The Guided setup product exists in Paddle,
 * but the product page must not render a buy link while this flag is false.
 *
 * Paddle's default live payment link, after the domain is approved:
 * https://practicalsupplychainplanning.com/products/practical-stock-planner/
 *
 * Turn checkout on (16 Nov 2026): set checkoutOpen to true and redeploy.
 * That one line loads Paddle on the product page, restores "Start your free trial",
 * applies FOUNDING29, or FOUNDINGAU when the checkout currency is AUD, and stops
 * the /welcome/ redirect.
 * Do not change the token, price, or successUrl.
 * Leave guidedSetupOpen false. There is no Guided setup buy link yet.
 */
module.exports = {
  checkoutOpen: false,
  launchDate: "16 Nov 2026",
  environment: "live",
  clientToken: "live_17000353de961361741fa101825",
  successUrl: "https://practicalsupplychainplanning.com/welcome/",
  foundingDiscountCode: "FOUNDING29",
  foundingDiscountCodeAud: "FOUNDINGAU",
  guidedSetupOpen: false,
  campaigns: {
    default: {
      priceId: "pri_01m563dadzkmdnxz296qh7g63s",
    },
  },
};
