import assert from "node:assert/strict";
import paddle from "../src/_data/paddle.js";
import { redirectDecision, redirectLocation } from "../functions/_middleware.js";

const product = "https://practicalsupplychainplanning.com/products/practical-stock-planner/";

const cases = [
  [
    "https://www.practicalsupplychainplanning.com/",
    "https://practicalsupplychainplanning.com/",
  ],
  [
    "http://www.practicalsupplychainplanning.com/blog/example/?q=1",
    "https://practicalsupplychainplanning.com/blog/example/?q=1",
  ],
  [
    "https://www.practicalsupplychainplanning.com/about/",
    "https://practicalsupplychainplanning.com/about/",
  ],
  [
    "https://practicalsupplychainplanning.com/",
    null,
  ],
  [
    "https://practicalsupplychainplanning.com/index.html",
    null,
  ],
  [
    "https://practicalsupplychainplanning.com/about/",
    null,
  ],
  [
    "https://practicalsupplychainplanning.com/blog/",
    null,
  ],
  [
    "https://practicalsupplychainplanning-website.pages.dev/",
    null,
  ],
  [
    "https://practicalsupplychainplanning.com/buy/",
    product,
  ],
  [
    "https://practicalsupplychainplanning.com/buy",
    product,
  ],
  [
    "https://practicalsupplychainplanning.com/buy/index.html",
    product,
  ],
  [
    "https://practicalsupplychainplanning.com/buy/?utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1",
    product + "?utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1",
  ],
  [
    "https://www.practicalsupplychainplanning.com/buy/?utm_source=results-email",
    product + "?utm_source=results-email",
  ],
  [
    "http://www.practicalsupplychainplanning.com/buy",
    product,
  ],
  [
    "https://practicalsupplychainplanning.com/pricing/",
    product,
  ],
  [
    "https://practicalsupplychainplanning.com/pricing",
    product,
  ],
  [
    "https://practicalsupplychainplanning.com/pricing/index.html",
    product,
  ],
  [
    "https://practicalsupplychainplanning.com/pricing/?utm_source=results-email&utm_medium=email",
    product + "?utm_source=results-email&utm_medium=email",
  ],
  [
    "https://www.practicalsupplychainplanning.com/pricing/?utm_source=paddle",
    product + "?utm_source=paddle",
  ],
  [
    "http://www.practicalsupplychainplanning.com/pricing",
    product,
  ],
  [
    "https://practicalsupplychainplanning.com/products/",
    null,
  ],
  [
    "https://practicalsupplychainplanning.com/products/practical-stock-planner/",
    null,
  ],
];

for (const [input, expected] of cases) {
  assert.equal(redirectLocation(input), expected, input);
  const decision = redirectDecision(input);
  if (expected == null) {
    assert.equal(decision, null, input);
  } else {
    assert.equal(decision.location, expected, input);
    assert.equal(decision.status, 301, input);
  }
}

assert.equal(typeof paddle.checkoutOpen, "boolean");

const welcomeCases = [
  "https://practicalsupplychainplanning.com/welcome/",
  "https://practicalsupplychainplanning.com/welcome",
  "https://practicalsupplychainplanning.com/welcome/index.html",
  "https://practicalsupplychainplanning.com/welcome/?_ptxn=abc",
  "https://www.practicalsupplychainplanning.com/welcome/?_ptxn=abc",
  "http://www.practicalsupplychainplanning.com/welcome",
];

for (const input of welcomeCases) {
  const decision = redirectDecision(input);
  if (paddle.checkoutOpen === true) {
    const url = new URL(input);
    if (url.hostname === "www.practicalsupplychainplanning.com") {
      url.hostname = "practicalsupplychainplanning.com";
      url.protocol = "https:";
      assert.equal(decision && decision.status, 301, input);
      assert.equal(decision && decision.location, url.href, input);
    } else {
      assert.equal(decision, null, input);
    }
  } else {
    assert.equal(decision && decision.status, 302, input);
    assert.equal(decision && decision.location, product, input);
  }
}

console.log(
  `Redirect checks OK (${cases.length + welcomeCases.length} cases, checkoutOpen=${paddle.checkoutOpen}).`
);
