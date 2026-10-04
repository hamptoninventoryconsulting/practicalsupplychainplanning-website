/**
 * Paddle Billing config for /pricing/.
 *
 * Daniel fills in two values before sandbox checkout can open:
 * - clientToken: the sandbox client-side token (starts with test_)
 * - campaigns.default.priceId: the sandbox price for Practical Stock Planner
 *
 * /pricing/ opens the default price only, quantity 1, with no discount.
 * The page never reads a price or discount from the URL.
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
