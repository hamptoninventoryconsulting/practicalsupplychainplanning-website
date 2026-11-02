/**
 * Outreach tracking links for go.getpracticalplanning.com.
 *
 * GET /r/<token> asks the Potential Customers backend where to send the
 * visitor. HEAD does not: a link scanner would inflate the click count.
 * Every other outcome, including a lost click, answers 302 to the home page.
 * Redirect targets are limited to https://practicalsupplychainplanning.com.
 *
 * The main module exports only the default fetch handler. workerd treats
 * other named exports as handlers and refuses to start.
 */

import { handleFetch } from "./redirect";

export default {
  async fetch(request, env): Promise<Response> {
    return handleFetch(request, env);
  },
} satisfies ExportedHandler<Env>;
