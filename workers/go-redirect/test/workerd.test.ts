import { createServer, type Server } from "node:http";
import { Buffer } from "node:buffer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "wrangler";
import { HOME_URL } from "../src/redirect";

const SECRET = "test-click-secret-value";
/** 22 characters, the length of Python secrets.token_urlsafe(16). */
const TOKEN = "abcDEF123_-xyz7890abcd";
const USER_AGENT = "UA-TRACK-9f3a";
const LANDING = `https://practicalsupplychainplanning.com/start/plan-ahead/?ref=${TOKEN}`;

interface Hit {
  method: string;
  url: string;
  secret: string | undefined;
  body: string;
}

describe("workerd", () => {
  let stub: Server;
  let hits: Hit[];
  let server: TestHarness;

  beforeAll(async () => {
    hits = [];
    stub = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      hits.push({
        method: req.method ?? "",
        url: req.url ?? "",
        secret:
          typeof req.headers["x-click-secret"] === "string" ? req.headers["x-click-secret"] : undefined,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url: LANDING }));
    });
    await new Promise<void>((resolve) => {
      stub.listen(0, "127.0.0.1", () => resolve());
    });
    const address = stub.address();
    if (address === null || typeof address === "string") {
      throw new Error("stub did not bind a port");
    }

    server = createTestHarness({
      workers: [
        {
          configPath: "./wrangler.jsonc",
          vars: { CLICK_API_URL: `http://127.0.0.1:${address.port}/track/click` },
          secrets: { CLICK_SECRET: SECRET },
        },
      ],
    });
    await server.listen();
  }, 30_000);

  afterAll(async () => {
    await server?.close();
    if (stub) {
      await new Promise<void>((resolve, reject) => {
        stub.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("redirects a 22 character token through a stubbed upstream and falls back home", async () => {
    const worker = server.getWorker("go-redirect");
    const response = await worker.fetch(`https://go.getpracticalplanning.com/r/${TOKEN}`, {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(LANDING);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-type")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();

    expect(hits).toHaveLength(1);
    expect(hits[0]?.method).toBe("POST");
    expect(hits[0]?.url).toBe("/track/click");
    expect(hits[0]?.secret).toBe(SECRET);
    const posted = JSON.parse(hits[0]?.body ?? "") as {
      token: string;
      user_agent: string;
      clicked_at: string;
    };
    expect(posted.token).toBe(TOKEN);
    expect(posted.user_agent).toBe(USER_AGENT);
    expect(posted.clicked_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const callsBeforeFallback = hits.length;
    const fallback = await worker.fetch("https://go.getpracticalplanning.com/r/not-a-token", {
      redirect: "manual",
    });
    expect(fallback.status).toBe(302);
    expect(fallback.headers.get("location")).toBe(HOME_URL);
    expect(fallback.headers.get("cache-control")).toBe("no-store");
    expect(fallback.headers.get("referrer-policy")).toBe("no-referrer");
    expect(fallback.headers.get("content-type")).toBeNull();
    expect(hits).toHaveLength(callsBeforeFallback);
  }, 30_000);

  it("does not call the backend for HEAD", async () => {
    const worker = server.getWorker("go-redirect");
    const callsBefore = hits.length;
    const response = await worker.fetch(`https://go.getpracticalplanning.com/r/${TOKEN}`, {
      method: "HEAD",
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(HOME_URL);
    expect(response.headers.get("content-type")).toBeNull();
    expect(hits).toHaveLength(callsBefore);
  }, 30_000);
});
