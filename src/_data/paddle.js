/**
 * Paddle Billing config for /products/practical-stock-planner/.
 *
 * Daniel fills in two values before sandbox checkout can open:
 * - clientToken: the sandbox client-side token (starts with test_)
 * - campaigns.default.priceId: the sandbox price for Practical Stock Planner
 *
 * The product page opens the default price only, quantity 1, with no discount.
 * The page never reads a price or discount from the URL.
 *
 * Paddle's default payment link, after the domain is approved:
 * https://practicalsupplychainplanning.com/products/practical-stock-planner/
 */
module.exports = {
  environment: "sandbox",
  clientToken: "test_3dd1fd98b3c32496b6e8788b014",
  successUrl: "https://practicalsupplychainplanning.com/welcome/",
  campaigns: {
    default: {
      priceId: "pri_01m3dtrhg3n7ydgnrvm7kvwgvz",
    },
  },
};
