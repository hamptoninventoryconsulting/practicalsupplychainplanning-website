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

export function redirectLocation(requestUrl) {
  const url = new URL(requestUrl);

  if (url.hostname === `www.${APEX_HOST}`) {
    url.hostname = APEX_HOST;
    url.protocol = "https:";
    return url.href;
  }

  return null;
}

export async function onRequest(context) {
  const location = redirectLocation(context.request.url);
  if (location) {
    return Response.redirect(location, 301);
  }
  return context.next();
}
