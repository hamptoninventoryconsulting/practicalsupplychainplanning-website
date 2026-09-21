/**
 * Host and homepage redirects for Cloudflare Pages.
 *
 * www is redirected to the apex HTTPS host. `/` is an HTTP 301 to `/about/`
 * (replacing the old meta-refresh). These run in a Pages Function so they
 * apply even when `_redirects` is skipped because Functions are present.
 *
 * www only reaches this code after the hostname is bound as a Pages custom
 * domain. A proxied www record that is not bound still 522s at the edge.
 */
export const APEX_HOST = "practicalsupplychainplanning.com";

export function redirectLocation(requestUrl) {
  const url = new URL(requestUrl);
  let changed = false;

  if (url.hostname === `www.${APEX_HOST}`) {
    url.hostname = APEX_HOST;
    url.protocol = "https:";
    changed = true;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    url.pathname = "/about/";
    changed = true;
  }

  return changed ? url.href : null;
}

export async function onRequest(context) {
  const location = redirectLocation(context.request.url);
  if (location) {
    return Response.redirect(location, 301);
  }
  return context.next();
}
