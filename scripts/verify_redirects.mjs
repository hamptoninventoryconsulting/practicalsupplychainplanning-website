import assert from "node:assert/strict";
import { redirectLocation } from "../functions/_middleware.js";

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
];

for (const [input, expected] of cases) {
  assert.equal(redirectLocation(input), expected, input);
}

console.log(`Redirect checks OK (${cases.length} cases).`);
