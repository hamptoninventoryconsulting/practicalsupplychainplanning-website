/**
 * Host redirects for Cloudflare Pages.
 *
 * www is redirected to the apex HTTPS host. `/` is the home page and is not
 * redirected. This runs in a Pages Function so it applies even when
 * `_redirects` is skipped because Functions are present.
 *
 * www only reaches this code after the hostname is bound as a Pages custom
 * domain. A proxied www record that is not bound still 522s at the edge.
 */
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

export function redirectLocation(requestUrl) {
  const url = new URL(requestUrl);
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

  return redirect ? url.href : null;
}

export async function onRequest(context) {
  const location = redirectLocation(context.request.url);
  if (location) {
    return Response.redirect(location, 301);
  }
  return context.next();
}
