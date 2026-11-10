#!/usr/bin/env node
/**
 * Load the real Meta Pixel script (fbevents.js 2.9.439) in Chrome.
 * Facebook hosts are intercepted. The script is served from a local fixture.
 * PageView and Lead must leave after Accept, stop after Reject, and resume
 * after Accept again. signals/config must not be requested.
 */
"use strict";

const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(ROOT, "scripts", "fixtures", "fbevents-2.9.439.js");
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const PIXEL_ID = "123456789012345";
const SKU = "QA-SKU-LEAK";
const ALLOWED = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "fbclid"];

function freePort() {
  return new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const port = server.address().port;
      server.close(function () {
        resolve(port);
      });
    });
  });
}

function startSite(port) {
  const longFragment = "#d=" + SKU + "x".repeat(2000);
  const landingPath =
    "/learn/safety-stock-simulator/?utm_source=facebook&utm_medium=paid-social&utm_content=v1-buffer&ref=abc&fbclid=IwAR123test&lq=500&sku=" +
    SKU +
    "&forecast=9991&stock=8882" +
    longFragment;
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Pixel browser check</title>
</head>
<body>
  <script type="application/json" id="pscp-meta-config">{"enabled":true,"pixelId":"${PIXEL_ID}"}</script>
  <section id="sim-results-email" data-results-email="on">
    <form id="sim-results-email-form">
      <p class="sim-results__status"></p>
      <input name="email" type="email" value="planner@example.com" />
      <input name="results" type="checkbox" />
      <input name="articles" type="checkbox" />
      <input name="company" type="text" value="" />
      <button type="submit">Send</button>
      <div class="sim-turnstile" data-sitekey="test"></div>
    </form>
    <p class="sim-results__sent" hidden></p>
  </section>
  <footer class="site-footer">
    <ul class="site-footer__list"></ul>
  </footer>
  <script src="/assets/meta-pixel.js"></script>
  <script src="/assets/sim-results-form.js"></script>
  <script>
    window.turnstile = {
      render: function () { return 1; },
      reset: function () {},
      getResponse: function () { return "token"; }
    };
    window.resultsForm = window.SimResultsForm.attach({
      id: "sim-results-email",
      formId: "safety-stock-simulator",
      turnstileToken: function () { return "token"; },
      buildSummary: function () {
        return {
          reopenUrl: window.location.href,
          sku: ${JSON.stringify(SKU)},
          forecast: 9991,
          stock: 8882
        };
      }
    });
  </script>
</body>
</html>`;
  const from =
    '<!DOCTYPE html><html><body><a id="go" href="' +
    landingPath +
    '">Open the simulator</a></body></html>';
  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === "/api/results-email") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    if (url.pathname === "/from/" || url.pathname === "/from") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(from);
      return;
    }
    if (url.pathname === "/learn/safety-stock-simulator/" || url.pathname === "/learn/safety-stock-simulator/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page);
      return;
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(port, "127.0.0.1", function () {
      resolve(server);
    });
  });
}

function CDP(ws) {
  this.ws = ws;
  this.next = 1;
  this.pending = new Map();
  this.listeners = [];
  const self = this;
  ws.addEventListener("message", function (event) {
    const msg = JSON.parse(event.data);
    if (msg.id && self.pending.has(msg.id)) {
      const waiter = self.pending.get(msg.id);
      self.pending.delete(msg.id);
      if (msg.error) {
        waiter.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        waiter.resolve(msg.result || {});
      }
      return;
    }
    if (msg.method) {
      self.listeners.forEach(function (fn) {
        fn(msg);
      });
    }
  });
}

CDP.prototype.send = function (method, params, sessionId) {
  const id = this.next++;
  const msg = { id: id, method: method, params: params || {} };
  if (sessionId) {
    msg.sessionId = sessionId;
  }
  this.ws.send(JSON.stringify(msg));
  const self = this;
  return new Promise(function (resolve, reject) {
    self.pending.set(id, { resolve: resolve, reject: reject });
  });
};

CDP.prototype.on = function (fn) {
  this.listeners.push(fn);
};

function connect(url) {
  const ws = new WebSocket(url);
  return new Promise(function (resolve, reject) {
    ws.addEventListener("open", function () {
      resolve(new CDP(ws));
    });
    ws.addEventListener("error", function () {
      reject(new Error("Could not connect to Chrome at " + url));
    });
  });
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function waitFor(label, predicate) {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    if (await predicate()) {
      return;
    }
    await sleep(50);
  }
  throw new Error("Timed out waiting for " + label);
}

function headerValue(headers, name) {
  const found = (headers || []).find(function (header) {
    return String(header.name || "").toLowerCase() === name;
  });
  return found ? found.value : "";
}

function paramsOf(hit) {
  const url = new URL(hit.url);
  const params = new URLSearchParams(url.search);
  if (hit.postData) {
    new URLSearchParams(hit.postData).forEach(function (value, key) {
      params.append(key, value);
    });
  }
  return params;
}

function assertCleanHit(hit, origin) {
  const params = paramsOf(hit);
  const ev = params.get("ev");
  assert.ok(ev === "PageView" || ev === "Lead", "unexpected event " + ev + " in " + hit.url);
  const dl = params.get("dl") || "";
  const decodedDl = decodeURIComponent(dl);
  assert.ok(dl, "dl missing");
  const page = new URL(dl);
  assert.strictEqual(page.hash, "", "dl still has a hash: " + dl);
  page.searchParams.forEach(function (value, key) {
    assert.ok(ALLOWED.indexOf(key) !== -1, "dl kept " + key);
  });
  assert.strictEqual(page.searchParams.get("utm_source"), "facebook");
  assert.strictEqual(page.searchParams.get("ref"), "abc");
  assert.strictEqual(page.searchParams.get("fbclid"), "IwAR123test");
  ["lq=", "sku=", "forecast=", "stock=", "#", SKU, "9991", "8882", "planner@example.com"].forEach(function (token) {
    assert.ok(!decodedDl.includes(token), "dl contains " + token);
  });
  const rl = params.get("rl") || "";
  if (rl) {
    const ref = new URL(rl);
    assert.strictEqual(ref.hash, "");
    ref.searchParams.forEach(function (value, key) {
      assert.ok(ALLOWED.indexOf(key) !== -1, "rl kept " + key);
    });
    const decodedRl = decodeURIComponent(rl);
    ["lq=", "sku=", "forecast=", "stock=", SKU, "9991", "8882"].forEach(function (token) {
      assert.ok(!decodedRl.includes(token), "rl contains " + token);
    });
  }
  const referer = headerValue(hit.headers, "referer");
  assert.strictEqual(referer, origin, "Referer should be origin-only, got " + referer);
  const raw = hit.url + "\n" + (hit.postData || "");
  assert.ok(!raw.includes("planner@example.com"), "email reached Meta");
  assert.ok(!decodeURIComponent(raw).includes(SKU), "SKU reached Meta");
  return ev;
}

async function main() {
  assert.ok(fs.existsSync(FIXTURE), "missing " + FIXTURE);
  const fixture = fs.readFileSync(FIXTURE);
  assert.ok(fixture.includes("2.9.439"), "fixture is not fbevents 2.9.439");
  assert.ok(fixture.includes("disableConfigLoading"), "fixture has no disableConfigLoading");
  assert.ok(fs.existsSync(CHROME), "Chrome is not at " + CHROME);

  const sitePort = await freePort();
  const debugPort = await freePort();
  const server = await startSite(sitePort);
  const origin = "http://127.0.0.1:" + sitePort + "/";
  const profile = fs.mkdtempSync(path.join(require("os").tmpdir(), "pscp-pixel-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=" + debugPort,
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  const hits = [];
  const signals = [];
  let fbeventsLoads = 0;
  let browser;

  try {
    let version = null;
    for (let i = 0; i < 50; i += 1) {
      try {
        version = await fetch("http://127.0.0.1:" + debugPort + "/json/version").then(function (response) {
          return response.json();
        });
        break;
      } catch (error) {
        await sleep(100);
      }
    }
    assert.ok(version && version.webSocketDebuggerUrl, "Chrome did not open a debugging port");
    browser = await connect(version.webSocketDebuggerUrl);
    const created = await browser.send("Target.createTarget", { url: "about:blank" });
    const attached = await browser.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    const sessionId = attached.sessionId;
    function send(method, params) {
      return browser.send(method, params, sessionId);
    }

    browser.on(function (msg) {
      if (msg.sessionId !== sessionId || msg.method !== "Fetch.requestPaused") {
        return;
      }
      const params = msg.params;
      const url = params.request.url;
      const respond = function (body, contentType) {
        return send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: contentType }],
          body: Buffer.from(body).toString("base64"),
        }).catch(function () {});
      };
      if (url.indexOf("/signals/") !== -1) {
        signals.push(url);
        respond("", "application/javascript");
        return;
      }
      if (url.indexOf("fbevents.js") !== -1) {
        fbeventsLoads += 1;
        respond(fixture, "application/javascript");
        return;
      }
      if (url.indexOf("facebook.com/tr") !== -1) {
        var postData = params.request.postData || "";
        if (!postData && params.request.postDataEntries) {
          postData = params.request.postDataEntries.map(function (entry) {
            return Buffer.from(entry.bytes, "base64").toString("utf8");
          }).join("");
        }
        var rawHeaders = params.request.headers || [];
        var headers = Array.isArray(rawHeaders)
          ? rawHeaders
          : Object.keys(rawHeaders).map(function (name) {
              return { name: name, value: rawHeaders[name] };
            });
        hits.push({
          url: url,
          postData: postData,
          headers: headers,
        });
        respond("", "image/gif");
        return;
      }
      send("Fetch.continueRequest", { requestId: params.requestId }).catch(function () {});
    });

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Fetch.enable", {
      patterns: [
        { urlPattern: "*connect.facebook.net/*" },
        { urlPattern: "*facebook.com/tr*" },
        { urlPattern: "*facebook.com/privacy_sandbox*" },
      ],
    });

    await send("Page.navigate", {
      url: origin + "from/?lq=500&sku=" + SKU + "&forecast=9991&stock=8882#d=" + SKU,
    });
    await waitFor("referrer page", async function () {
      const state = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
      return state.result && state.result.value === "complete" && fbeventsLoads === 0;
    });
    await send("Runtime.evaluate", { expression: "document.getElementById('go').click()" });
    await waitFor("simulator page", async function () {
      const state = await send("Runtime.evaluate", {
        expression: "location.pathname + '|' + !!document.getElementById('pscp-meta-banner')",
        returnByValue: true,
      });
      return state.result && state.result.value === "/learn/safety-stock-simulator/|true";
    });

    await send("Runtime.evaluate", {
      expression: "Array.prototype.find.call(document.querySelectorAll('button'), function (button) { return button.textContent === 'Accept'; }).click()",
    });
    await waitFor("PageView", function () {
      return hits.some(function (hit) {
        return paramsOf(hit).get("ev") === "PageView";
      });
    });
    const loaded = await send("Runtime.evaluate", {
      expression: "({plugin: typeof window.fbq.loadPlugin, config: window.fbq.disableConfigLoading === true, version: String(window.fbq.version || '')})",
      returnByValue: true,
    });
    assert.strictEqual(loaded.result.value.plugin, "function", "the real fbevents.js did not run");
    assert.strictEqual(loaded.result.value.config, true);
    assert.ok(loaded.result.value.version.indexOf("2.9") === 0, loaded.result.value.version);
    assert.strictEqual(fbeventsLoads, 1);
    assert.deepStrictEqual(signals, []);
    const firstView = hits.find(function (hit) {
      return paramsOf(hit).get("ev") === "PageView";
    });
    assert.strictEqual(assertCleanHit(firstView, origin), "PageView");
    assert.ok(firstView.postData, "a long address should be a POST, not only a short GET");

    const beforeLead = hits.length;
    await send("Runtime.evaluate", {
      expression:
        "var box = document.querySelector('[name=results]'); box.checked = true; box.dispatchEvent(new Event('change')); document.querySelector('form').requestSubmit();",
    });
    await waitFor("Lead", function () {
      return hits.slice(beforeLead).some(function (hit) {
        return paramsOf(hit).get("ev") === "Lead";
      });
    });
    const lead = hits.slice(beforeLead).find(function (hit) {
      return paramsOf(hit).get("ev") === "Lead";
    });
    assert.strictEqual(assertCleanHit(lead, origin), "Lead");
    assert.deepStrictEqual(signals, []);

    const afterLead = hits.length;
    await send("Runtime.evaluate", {
      expression:
        "document.getElementById('pscp-cookie-choices').click(); document.getElementById('pscp-meta-reject').click(); window.fbq('track', 'PageView'); window.fbq('track', 'Lead');",
    });
    await sleep(800);
    assert.strictEqual(hits.length, afterLead, "Reject must stop later Pixel sends");
    assert.deepStrictEqual(signals, []);

    await send("Runtime.evaluate", {
      expression:
        "document.getElementById('pscp-cookie-choices').click(); Array.prototype.find.call(document.querySelectorAll('button'), function (button) { return button.textContent === 'Accept'; }).click();",
    });
    await waitFor("PageView after Accept again", function () {
      return hits.slice(afterLead).some(function (hit) {
        return paramsOf(hit).get("ev") === "PageView";
      });
    });
    const resumed = hits.slice(afterLead).find(function (hit) {
      return paramsOf(hit).get("ev") === "PageView";
    });
    assert.strictEqual(assertCleanHit(resumed, origin), "PageView");
    hits.forEach(function (hit) {
      const ev = paramsOf(hit).get("ev");
      assert.ok(ev === "PageView" || ev === "Lead", "automatic event " + ev);
    });
    assert.deepStrictEqual(signals, [], "signals/config was requested: " + signals.join(" "));
    assert.strictEqual(fbeventsLoads, 1);

    console.log("Meta Pixel browser check OK (" + hits.length + " /tr requests, 0 signals/config).");
  } catch (error) {
    console.error(
      "Pixel browser check failed after " +
        hits.length +
        " /tr request(s), " +
        signals.length +
        " signals request(s), " +
        fbeventsLoads +
        " fbevents load(s)."
    );
    hits.slice(0, 3).forEach(function (hit, index) {
      console.error("hit " + index + " " + hit.url.slice(0, 180));
      console.error("post " + (hit.postData || "").slice(0, 180));
    });
    throw error;
  } finally {
    if (browser) {
      try {
        browser.ws.close();
      } catch (error) {
        /* Chrome is about to stop. */
      }
    }
    chrome.kill("SIGKILL");
    await new Promise(function (resolve) {
      chrome.once("exit", resolve);
      setTimeout(resolve, 1000);
    });
    await new Promise(function (resolve) {
      server.close(resolve);
    });
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (error) {
      /* The profile can still be busy for a moment. The next run uses a new directory. */
    }
  }
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
