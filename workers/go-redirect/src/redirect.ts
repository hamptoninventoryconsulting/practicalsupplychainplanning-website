/**
 * Click lookup and redirect rules for go.getpracticalplanning.com.
 *
 * This module is not the Worker entrypoint. workerd treats every named
 * export of the main module as a handler, so constants live here.
 */

/** Python secrets.token_urlsafe(16), and the 16–128 range the backend accepts. */
export const LINK_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export const HOME_URL = "https://practicalsupplychainplanning.com/";

export const CLICK_TIMEOUT_MS = 2000;

const MAX_BACKEND_BODY = 8192;

const LANDING_HOST = "practicalsupplychainplanning.com";

export interface ClickDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  try {
    return await handleRequest(request, env);
  } catch {
    logOutcome("fallback", "error");
    return redirectTo(HOME_URL);
  }
}

export async function handleRequest(
  request: Request,
  env: Env,
  deps: ClickDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const token = tokenFromPath(url.pathname);
  if (token === null) {
    logOutcome("fallback", pathIsTracking(url.pathname) ? "malformed" : "other_path");
    return redirectTo(HOME_URL);
  }

  // Link scanners send HEAD. Counting those would inflate click totals.
  if (request.method === "HEAD") {
    logOutcome("fallback", "head");
    return redirectTo(HOME_URL);
  }

  if (request.method !== "GET") {
    logOutcome("fallback", "method");
    return redirectTo(HOME_URL);
  }

  if (!env.CLICK_SECRET) {
    logOutcome("fallback", "missing_secret");
    return redirectTo(HOME_URL);
  }

  if (!clickApiUrl(env.CLICK_API_URL)) {
    logOutcome("fallback", "bad_api_url");
    return redirectTo(HOME_URL);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? CLICK_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetchImpl(env.CLICK_API_URL, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        "x-click-secret": env.CLICK_SECRET,
      },
      body: JSON.stringify({
        token,
        user_agent: request.headers.get("user-agent") ?? "",
        clicked_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    logOutcome("fallback", isTimeout(error) ? "timeout" : "network");
    return redirectTo(HOME_URL);
  }

  if (response.status !== 200) {
    await response.body?.cancel();
    logOutcome("fallback", "backend", response.status);
    return redirectTo(HOME_URL);
  }

  const text = await readLimitedText(response);
  if (text === null) {
    logOutcome("fallback", "bad_json");
    return redirectTo(HOME_URL);
  }

  let landing: string | null = null;
  try {
    landing = landingUrl(urlField(text));
  } catch {
    landing = null;
  }
  if (!landing) {
    logOutcome("fallback", urlFieldPresent(text) ? "foreign_host" : "bad_json");
    return redirectTo(HOME_URL);
  }

  logOutcome("redirect", "ok");
  return redirectTo(landing);
}

function tokenFromPath(pathname: string): string | null {
  const match = /^\/r\/([^/]+)$/.exec(pathname);
  if (!match) {
    return null;
  }
  return LINK_TOKEN.test(match[1]) ? match[1] : null;
}

function pathIsTracking(pathname: string): boolean {
  return /^\/r\/[^/]+$/.test(pathname);
}

function clickApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username !== "" || url.password !== "") {
      return false;
    }
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Accept only an https URL whose host is the apex site. The raw string has to
 * start with that host so a parsed-but-misleading value cannot slip through.
 */
export function landingUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return null;
  }
  if (!/^https:\/\/practicalsupplychainplanning\.com(?=[/?#]|$)/i.test(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") {
    return null;
  }
  if (url.username !== "" || url.password !== "") {
    return null;
  }
  if (url.port !== "") {
    return null;
  }
  if (url.hostname !== LANDING_HOST) {
    return null;
  }
  return url.href;
}

function urlField(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !("url" in parsed)) {
    return undefined;
  }
  return (parsed as { url: unknown }).url;
}

function urlFieldPresent(text: string): boolean {
  try {
    return urlField(text) !== undefined;
  } catch {
    return false;
  }
}

async function readLimitedText(response: Response): Promise<string | null> {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > MAX_BACKEND_BODY) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function logOutcome(
  outcome: "redirect" | "fallback",
  reason: string,
  status?: number,
): void {
  const record: Record<string, string | number> = {
    message: "outreach click",
    outcome,
    reason,
  };
  if (status !== undefined) {
    record.status = status;
  }
  console.log(JSON.stringify(record));
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) {
    return false;
  }
  const name = String((error as { name: unknown }).name);
  return name === "AbortError" || name === "TimeoutError";
}
