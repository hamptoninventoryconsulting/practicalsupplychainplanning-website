/**
 * Loads the results-email form script against a small page stand-in.
 * Turnstile arrives asynchronously and has no ready() method. Calling
 * ready() throws, which is the production failure this test guards.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const source = fs.readFileSync(path.join(ROOT, "assets", "sim-results-form.js"), "utf8");
const partial = fs.readFileSync(
  path.join(ROOT, "src", "_includes", "partials", "sim-results-form.njk"),
  "utf8"
);

assert.doesNotMatch(source, /turnstile\.ready|\.ready\(/);
assert.match(partial, /render=explicit&onload=pscpTurnstileLoaded/);
assert.match(partial, /data-appearance="interaction-only"/);
assert.match(source, /appearance:\s*"interaction-only"/);
assert.match(
  fs.readFileSync(path.join(ROOT, "assets", "keep-in-touch.js"), "utf8"),
  /appearance:\s*"interaction-only"/
);
assert.match(
  fs.readFileSync(path.join(ROOT, "src", "_includes", "partials", "keep-in-touch.njk"), "utf8"),
  /data-appearance="interaction-only"/
);
assert.match(partial, /async><\/script>/);
assert.doesNotMatch(partial, /api\.js[^>]*defer/);
assert.match(
  fs.readFileSync(path.join(ROOT, "src", "learn", "safety-stock-simulator.njk"), "utf8"),
  /sim-results-form\.js\?v=4/
);

function Element(spec) {
  this.tag = spec.tag || "div";
  this.hidden = false;
  this.textContent = "";
  this.value = spec.value || "";
  this.checked = Boolean(spec.checked);
  this.disabled = Boolean(spec.disabled);
  this.id = spec.id || "";
  this.className = spec.className || "";
  this.name = spec.name || "";
  this.attrs = Object.assign({}, spec.attrs || {});
  this.children = [];
  this.listeners = {};
}

Element.prototype.getAttribute = function (name) {
  if (name === "id") {
    return this.id || null;
  }
  if (Object.prototype.hasOwnProperty.call(this.attrs, name)) {
    return this.attrs[name];
  }
  return null;
};

Element.prototype.setAttribute = function (name, value) {
  this.attrs[name] = String(value);
  if (name === "data-busy") {
    this.disabled = true;
  }
};

Element.prototype.removeAttribute = function (name) {
  delete this.attrs[name];
};

Element.prototype.addEventListener = function (type, fn) {
  this.listeners[type] = fn;
};

Element.prototype.appendChild = function (child) {
  this.children.push(child);
  return child;
};

Element.prototype.querySelector = function (selector) {
  return find(this, selector);
};

function matches(el, selector) {
  if (selector.charAt(0) === ".") {
    return el.className === selector.slice(1);
  }
  const named = selector.match(/^\[name="([^"]+)"\]$/);
  if (named) {
    return el.name === named[1];
  }
  return el.tag === selector;
}

function find(el, selector) {
  for (let i = 0; i < el.children.length; i += 1) {
    if (matches(el.children[i], selector)) {
      return el.children[i];
    }
    const nested = find(el.children[i], selector);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function page() {
  const root = new Element({
    tag: "section",
    id: "sim-results-email",
    attrs: { "data-results-email": "on" },
  });
  const form = new Element({ tag: "form" });
  const status = new Element({ tag: "p", className: "sim-results__status" });
  const email = new Element({ tag: "input", name: "email" });
  const results = new Element({ tag: "input", name: "results" });
  const articles = new Element({ tag: "input", name: "articles" });
  const company = new Element({ tag: "input", name: "company" });
  const slot = new Element({
    tag: "div",
    className: "sim-turnstile",
    attrs: { "data-sitekey": "0x4AAAAAAFMWJU5owYhGcyrK" },
  });
  const send = new Element({ tag: "button" });
  send.disabled = true;
  const sent = new Element({ tag: "p", className: "sim-results__sent" });
  [status, email, results, articles, company, slot, send].forEach(function (child) {
    form.appendChild(child);
  });
  root.appendChild(form);
  root.appendChild(sent);
  return { root: root, form: form, email: email, results: results, status: status, send: send };
}

function load(extra) {
  const built = page();
  const posts = [];
  const sandbox = {
    window: null,
    document: {
      getElementById: function (id) {
        return id === built.root.id ? built.root : null;
      },
      createElement: function () {
        return new Element({ tag: "iframe" });
      },
    },
    URLSearchParams: URLSearchParams,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Promise: Promise,
    fetch: async function (url, options) {
      posts.push({ url: String(url), body: options && options.body });
      return {
        ok: true,
        json: async function () {
          return { ok: true };
        },
      };
    },
    console: console,
  };
  sandbox.window = sandbox;
  sandbox.window.location = {
    origin: "https://practicalsupplychainplanning.com",
    pathname: "/learn/safety-stock-simulator/",
    search: "",
  };
  Object.assign(sandbox.window, extra || {});
  vm.runInNewContext(source, sandbox, { filename: "sim-results-form.js" });
  const api = sandbox.window.SimResultsForm.attach({
    id: "sim-results-email",
    formId: "safety-stock-simulator",
    buildSummary: function () {
      return { reopenUrl: "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/?run=1" };
    },
  });
  return { sandbox: sandbox, built: built, api: api, posts: posts };
}

function turnstileStub(state) {
  return {
    ready: function () {
      state.readyCalls += 1;
      throw new Error("3857 Remove async/defer");
    },
    render: function (el, options) {
      state.renders.push(options);
      state.options = options;
      state.widget = el;
      return "widget-1";
    },
    getResponse: function () {
      return state.token;
    },
    reset: function (id) {
      state.resets.push(id);
      state.token = "";
      if (state.reenter && state.options && state.resets.length === 1) {
        state.options["error-callback"]();
      }
    },
  };
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

const onload = load({ pscpTurnstileQueue: [] });
onload.api.show();
assert.strictEqual(onload.built.root.hidden, false);
const onloadState = { readyCalls: 0, renders: [], resets: [], token: "", reenter: true, options: null, widget: null };
assert.strictEqual(onload.sandbox.window.pscpTurnstileQueue.length, 1);
onload.sandbox.window.turnstile = turnstileStub(onloadState);
onload.sandbox.window.pscpTurnstileQueue[0]();
assert.strictEqual(onloadState.readyCalls, 0);
assert.strictEqual(onloadState.renders.length, 1);
assert.strictEqual(onloadState.renders[0].sitekey, "0x4AAAAAAFMWJU5owYhGcyrK");
assert.strictEqual(onloadState.renders[0].appearance, "interaction-only");
assert.strictEqual(typeof onloadState.renders[0].callback, "function");
assert.strictEqual(typeof onloadState.renders[0]["expired-callback"], "function");
assert.strictEqual(typeof onloadState.renders[0]["error-callback"], "function");
assert.strictEqual(onloadState.widget.className, "sim-turnstile");

onloadState.token = "";
onload.built.email.value = "reader@example.com";
onload.built.results.checked = true;
onload.built.form.listeners.submit({ preventDefault: function () {} });
await wait(20);
assert.strictEqual(onload.posts.length, 0);
assert.strictEqual(onload.built.status.textContent, "The check didn't finish. Try again in a moment.");
assert.deepStrictEqual(onloadState.resets, ["widget-1"]);
assert.doesNotMatch(onload.built.status.textContent, /Refresh the page/);

onloadState.token = "token-from-widget-1234";
onloadState.renders[0].callback(onloadState.token);
onload.built.form.listeners.submit({ preventDefault: function () {} });
await wait(20);
assert.strictEqual(onload.posts.length, 1);
assert.strictEqual(onload.posts[0].url, "/api/results-email");
const sent = JSON.parse(onload.posts[0].body);
assert.strictEqual(sent.turnstileToken, "token-from-widget-1234");
assert.strictEqual(sent.email, "reader@example.com");

onloadState.options["expired-callback"]();
assert.ok(onloadState.resets.length >= 2);
assert.ok(onloadState.resets.length < 5, "expired reset must not loop");

const polled = load();
polled.api.show();
const pollState = { readyCalls: 0, renders: [], resets: [], token: "polled-token-9876", reenter: false, options: null, widget: null };
await wait(40);
assert.strictEqual(pollState.renders.length, 0);
polled.sandbox.window.turnstile = turnstileStub(pollState);
await wait(180);
assert.strictEqual(pollState.readyCalls, 0);
assert.strictEqual(pollState.renders.length, 1);
polled.built.email.value = "later@example.com";
polled.built.results.checked = true;
polled.built.form.listeners.submit({ preventDefault: function () {} });
await wait(20);
assert.strictEqual(JSON.parse(polled.posts[0].body).turnstileToken, "polled-token-9876");

const failed = load({
  pscpTurnstileQueue: [],
  fetch: async function () {
    return {
      ok: false,
      json: async function () {
        return { ok: false, error: "The check failed. Refresh the page and try again." };
      },
    };
  },
});
failed.api.show();
const failedState = {
  readyCalls: 0,
  renders: [],
  resets: [],
  token: "token-rejected-1234",
  reenter: false,
  options: null,
  widget: null,
};
failed.sandbox.window.turnstile = turnstileStub(failedState);
failed.sandbox.window.pscpTurnstileQueue[0]();
failedState.renders[0].callback(failedState.token);
failed.built.email.value = "reader@example.com";
failed.built.results.checked = true;
failed.built.form.listeners.submit({ preventDefault: function () {} });
await wait(20);
assert.strictEqual(failed.built.status.textContent, "The check failed. Refresh the page and try again.");
assert.strictEqual(failed.built.send.disabled, false);

console.log("Turnstile form load checks OK.");
