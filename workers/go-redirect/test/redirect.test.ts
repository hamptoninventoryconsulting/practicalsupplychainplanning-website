import { afterEach, describe, expect, it, vi } from "vitest";
import worker, {
  CLICK_TIMEOUT_MS,
  HOME_URL,
  LINK_TOKEN,
  handleRequest,
  landingUrl,
} from "../src/index";

const SECRET = "test-click-secret-value";
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const API = "https://web-production-aa173b.up.railway.app/track/click";
const USER_AGENT = "UA-TRACK-9f3a";
const LANDING = `https://practicalsupplychainplanning.com/start/plan-ahead/?utm_source=outreach&utm_medium=email&utm_campaign=plan-ahead&utm_content=intro-v1&ref=${TOKEN}`;

function env(overrides: { CLICK_API_URL?: string; CLICK_SECRET?: string } = {}): Env {
  return {
    CLICK_API_URL: (overrides.CLICK_API_URL ?? API) as Env["CLICK_API_URL"],
    CLICK_SECRET: overrides.CLICK_SECRET ?? SECRET,
  };
}

function trackingRequest(method = "GET", token = TOKEN): Request {
  return new Request(`https://go.getpracticalplanning.com/r/${token}`, {
    method,
    headers: { "user-agent": USER_AGENT },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("landing url", () => {
  it("keeps an https url on the apex host", () => {
    expect(landingUrl(LANDING)).toBe(new URL(LANDING).href);
    expect(landingUrl("https://practicalsupplychainplanning.com")).toBe(HOME_URL);
    expect(landingUrl("https://PracticalSupplyChainPlanning.com/start/")).toBe(
      "https://practicalsupplychainplanning.com/start/",
    );
  });

  it("rejects every other target", () => {
    const rejected = [
      "https://evil.com/",
      "https://evil.com/?next=https://practicalsupplychainplanning.com/",
      "https://practicalsupplychainplanning.com.evil.com/",
      "https://www.practicalsupplychainplanning.com/",
      "https://notpracticalsupplychainplanning.com/",
      "http://practicalsupplychainplanning.com/",
      "https://user:pass@practicalsupplychainplanning.com/",
      "https://practicalsupplychainplanning.com:8443/",
      "https://practicalsupplychainplanning.com\\@evil.com",
      "javascript:alert(1)",
      "//practicalsupplychainplanning.com/",
      "https://practicalsupplychainplanning.com.evil.com/start",
    ];
    for (const value of rejected) {
      expect(landingUrl(value), value).toBeNull();
    }
  });
});

describe("go redirect", () => {
  it("uses a 43 character url-safe token", () => {
    expect(TOKEN).toMatch(LINK_TOKEN);
    expect(CLICK_TIMEOUT_MS).toBe(2000);
  });

  it("redirects a known token to the backend url", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => {
      logs.push(String(line));
    });
    let seen: Request | undefined;
    const response = await handleRequest(trackingRequest(), env(), {
      fetchImpl: async (input, init) => {
        seen = new Request(input, init);
        return jsonResponse(200, { url: LANDING, ignored: true });
      },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(new URL(LANDING).href);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.text()).toBe("");

    expect(seen?.method).toBe("POST");
    expect(seen?.url).toBe(API);
    expect(seen?.redirect).toBe("manual");
    expect(seen?.headers.get("x-click-secret")).toBe(SECRET);
    const body = (await seen?.json()) as {
      token: string;
      user_agent: string;
      clicked_at: string;
    };
    expect(body.token).toBe(TOKEN);
    expect(body.user_agent).toBe(USER_AGENT);
    expect(body.clicked_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const logged = logs.join("\n");
    expect(logged).toContain('"outcome":"redirect"');
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(USER_AGENT);
    expect(response.headers.get("Location")).not.toContain(SECRET);
  });

  it("follows HEAD the same way, with an empty body", async () => {
    let method = "";
    const response = await handleRequest(trackingRequest("HEAD"), env(), {
      fetchImpl: async (input, init) => {
        method = new Request(input, init).method;
        return jsonResponse(200, { url: HOME_URL });
      },
    });
    expect(method).toBe("POST");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(HOME_URL);
    expect(response.body).toBeNull();
  });

  it.each([
    [404, { url: HOME_URL }],
    [401, { error: "unauthorized" }],
    [503, { error: "secret unset" }],
  ])("falls back to home on backend %s", async (status, body) => {
    const response = await handleRequest(trackingRequest(), env(), {
      fetchImpl: async () => jsonResponse(status, body),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(HOME_URL);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("falls back when the backend redirects instead of returning JSON", async () => {
    const response = await handleRequest(trackingRequest(), env(), {
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.com/" },
        }),
    });
    expect(response.headers.get("Location")).toBe(HOME_URL);
  });

  it("falls back on bad JSON and on a foreign host", async () => {
    const badJson = await handleRequest(trackingRequest(), env(), {
      fetchImpl: async () => new Response("{", { status: 200 }),
    });
    expect(badJson.headers.get("Location")).toBe(HOME_URL);

    const foreign = await handleRequest(trackingRequest(), env(), {
      fetchImpl: async () => jsonResponse(200, { url: "https://evil.com/phish" }),
    });
    expect(foreign.headers.get("Location")).toBe(HOME_URL);

    const missing = await handleRequest(trackingRequest(), env(), {
      fetchImpl: async () => jsonResponse(200, { ok: true }),
    });
    expect(missing.headers.get("Location")).toBe(HOME_URL);
  });

  it("falls back when the backend call exceeds the timeout", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => {
      logs.push(String(line));
    });
    const started = Date.now();
    const response = await handleRequest(trackingRequest(), env(), {
      timeoutMs: 30,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("missing signal"));
            return;
          }
          const fail = () => reject(signal.reason);
          if (signal.aborted) {
            fail();
            return;
          }
          signal.addEventListener("abort", fail, { once: true });
        }),
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(response.headers.get("Location")).toBe(HOME_URL);
    expect(logs.join("\n")).toContain('"reason":"timeout"');
  });

  it("falls back on a network error", async () => {
    const response = await handleRequest(trackingRequest(), env(), {
      fetchImpl: async () => {
        throw new TypeError("connect failed");
      },
    });
    expect(response.headers.get("Location")).toBe(HOME_URL);
  });

  it("does not call the backend for a malformed token", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return jsonResponse(200, { url: LANDING });
    };
    const malformed = [
      "not-a-token",
      `${TOKEN}x`,
      TOKEN.slice(0, 42),
      `${TOKEN.slice(0, 42)}.`,
      `${TOKEN.slice(0, 20)} ${TOKEN.slice(20)}`,
      "person@example.com",
    ];
    for (const token of malformed) {
      const response = await handleRequest(trackingRequest("GET", token), env(), { fetchImpl });
      expect(response.headers.get("Location"), token).toBe(HOME_URL);
    }
    expect(calls).toEqual([]);
  });

  it("sends every other path home without a backend call", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async () => {
      calls.push("called");
      return jsonResponse(200, { url: LANDING });
    };
    for (const path of ["/", "/r", "/r/", `/r/${TOKEN}/extra`, "/favicon.ico", "/start/plan-ahead/"]) {
      const response = await handleRequest(
        new Request(`https://go.getpracticalplanning.com${path}`),
        env(),
        { fetchImpl },
      );
      expect(response.status, path).toBe(302);
      expect(response.headers.get("Location"), path).toBe(HOME_URL);
      expect(response.headers.get("Referrer-Policy"), path).toBe("no-referrer");
    }
    const posted = await handleRequest(trackingRequest("POST"), env(), { fetchImpl });
    expect(posted.headers.get("Location")).toBe(HOME_URL);
    expect(calls).toEqual([]);
  });

  it("does not call the backend when the secret is missing", async () => {
    let called = false;
    const response = await handleRequest(trackingRequest(), env({ CLICK_SECRET: "" }), {
      fetchImpl: async () => {
        called = true;
        return jsonResponse(200, { url: LANDING });
      },
    });
    expect(called).toBe(false);
    expect(response.headers.get("Location")).toBe(HOME_URL);
    expect(await response.text()).not.toContain(SECRET);
  });

  it("serves the default export through global fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { url: LANDING })),
    );
    const request = trackingRequest() as Parameters<NonNullable<typeof worker.fetch>>[0];
    const response = await worker.fetch(request, env());
    expect(response.headers.get("Location")).toBe(new URL(LANDING).href);
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  });
});
