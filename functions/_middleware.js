/**
 * Host redirects for Cloudflare Pages.
 *
 * www is redirected to the apex HTTPS host. `/` is the home page and is not
 * redirected. This runs in a Pages Function so it applies even when
 * `_redirects` is skipped because Functions are present.
 *
 * www only reaches this code after the hostname is bound as a Pages custom
 * domain. A proxied www record that is not bound still 522s at the edge.
 *
 * While src/_data/paddle.js has checkoutOpen: false, /welcome/ 302s to the
 * product page. Set checkoutOpen to true and redeploy to serve /welcome/ again.
 */
import paddle from "../src/_data/paddle.js";

export const APEX_HOST = "practicalsupplychainplanning.com";

const PRODUCT_PATH = "/products/practical-stock-planner/";

function isRetiredCheckoutPath(pathname) {
  return (
    pathname === "/buy" ||
    pathname === "/buy/" ||
    pathname === "/buy/index.html" ||
    pathname === "/pricing" ||
    pathname === "/pricing/" ||
    pathname === "/pricing/index.html"
  );
}

function isWelcomePath(pathname) {
  return (
    pathname === "/welcome" ||
    pathname === "/welcome/" ||
    pathname === "/welcome/index.html"
  );
}

export function redirectDecision(requestUrl) {
  const url = new URL(requestUrl);
  let status = 301;
  let redirect = false;

  if (url.hostname === `www.${APEX_HOST}`) {
    url.hostname = APEX_HOST;
    url.protocol = "https:";
    redirect = true;
  }

  // Old checkout URLs. The public offer is the Practical Stock Planner page.
  if (isRetiredCheckoutPath(url.pathname)) {
    url.pathname = PRODUCT_PATH;
    redirect = true;
  }

  // Pre-launch: the post-checkout page must not be reachable. Temporary, so
  // flipping checkoutOpen back to true does not need a permanent redirect.
  if (paddle.checkoutOpen !== true && isWelcomePath(url.pathname)) {
    url.pathname = PRODUCT_PATH;
    url.search = "";
    url.hash = "";
    status = 302;
    redirect = true;
  }

  return redirect ? { location: url.href, status } : null;
}

export function redirectLocation(requestUrl) {
  const decision = redirectDecision(requestUrl);
  return decision ? decision.location : null;
}

export async function onRequest(context) {
  const decision = redirectDecision(context.request.url);
  if (decision) {
    return Response.redirect(decision.location, decision.status);
  }
  return context.next();
}
