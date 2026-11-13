#!/usr/bin/env node
/**
 * Meta Pixel stays off until config and consent both say yes.
 * Reject blocks the Pixel. Lead fires only after a successful results email.
 * Scenario data never appears in a Pixel payload.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const meta = require("../assets/meta-pixel.js");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "_site");
const PIXEL_ID = "123456789012345";
const FORBIDDEN = [
  "Widget-SKU",
  "forecast=9991",
  "stock=8882",
  "result=7773",
  "lq=500",
  "sq=80",
  "sku=",
  "planner@example.com",
];
const DIRTY_PAGE =
  "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/" +
  "?lq=500&sq=80&sku=Widget-SKU&utm_source=facebook&utm_medium=paid-social" +
  "&utm_campaign=2026-11-sim-fb-test&utm_content=v1-buffer&ref=abc&fbclid=IwAR123test" +
  "#forecast=9991&stock=8882&result=7773";

function memoryStorage() {
  const data = Object.create(null);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

function makeElement(tag) {
  const el = {
    tagName: String(tag || "").toUpperCase(),
    children: [],
    parentNode: null,
    attributes: {},
    className: "",
    id: "",
    hidden: false,
    textContent: "",
    type: "",
    href: "",
    async: false,
    listeners: {},
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    insertBefore(child, before) {
      child.parentNode = el;
      const at = el.children.indexOf(before);
      if (at === -1) {
        el.children.push(child);
      } else {
        el.children.splice(at, 0, child);
      }
      return child;
    },
    setAttribute(name, value) {
      el.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete el.attributes[name];
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(el.attributes, name) ? el.attributes[name] : null;
    },
    addEventListener(type, fn) {
      el.listeners[type] = fn;
    },
    querySelector(sel) {
      return find(el, sel);
    },
  };
  return el;
}

function classMatch(el, sel) {
  if (!sel || sel.charAt(0) !== ".") {
    return false;
  }
  return String(el.className || "")
    .split(/\s+/)
    .indexOf(sel.slice(1)) !== -1;
}

function walk(el, fn) {
  if (!el) {
    return;
  }
  fn(el);
  (el.children || []).forEach(function (child) {
    walk(child, fn);
  });
}

function find(root, sel) {
  let found = null;
  walk(root, function (el) {
    if (!found && classMatch(el, sel)) {
      found = el;
    }
  });
  return found;
}

function collect(root, sel) {
  const found = [];
  walk(root, function (el) {
    if (classMatch(el, sel)) {
      found.push(el);
    }
  });
  return found;
}

function byTag(root, tag) {
  const name = String(tag || "").toUpperCase();
  const found = [];
  walk(root, function (el) {
    if (el.tagName === name) {
      found.push(el);
    }
  });
  return found;
}

function FakeImage() {
  this.received = [];
}
Object.defineProperty(FakeImage.prototype, "src", {
  configurable: true,
  enumerable: true,
  set(value) {
    this.received.push(value);
    this._src = value;
  },
  get() {
    return this._src || "";
  },
});

function makeDocument(configText) {
  const head = makeElement("head");
  const body = makeElement("body");
  const config = makeElement("script");
  config.id = "pscp-meta-config";
  config.textContent = configText;
  head.appendChild(config);
  const footerList = makeElement("ul");
  footerList.className = "site-footer__list";
  const footer = makeElement("footer");
  footer.appendChild(footerList);
  body.appendChild(footer);
  const doc = {
    head: head,
    body: body,
    referrer: "https://example.test/from",
    cookieLog: [],
    createElement: makeElement,
    getElementById(id) {
      let found = null;
      [head, body].forEach(function (root) {
        walk(root, function (el) {
          if (el.id === id) {
            found = el;
          }
        });
      });
      return found;
    },
    querySelector(sel) {
      return find(body, sel) || find(head, sel);
    },
    getElementsByTagName(tag) {
      return byTag(head, tag).concat(byTag(body, tag));
    },
  };
  Object.defineProperty(doc, "cookie", {
    configurable: true,
    set(value) {
      doc.cookieLog.push(String(value));
    },
    get() {
      return doc.cookieLog.join("; ");
    },
  });
  return doc;
}

function makeWindow(doc, location) {
  function XHR() {}
  XHR.prototype.open = function (method, url) {
    this.method = method;
    this.url = url;
  };
  XHR.prototype.send = function (body) {
    this.body = body;
    this.sentBody = true;
  };
  function HTMLFormElement() {}
  HTMLFormElement.submits = [];
  HTMLFormElement.prototype.submit = function () {
    HTMLFormElement.submits.push({
      action: this.action,
      fields: (this.elements || []).map(function (field) {
        return { name: field.name, value: field.value };
      }),
    });
  };
  const win = {
    document: doc,
    location: location,
    Image: FakeImage,
    XMLHttpRequest: XHR,
    HTMLFormElement: HTMLFormElement,
    navigator: {
      sendBeacon(url, data) {
        this.beacons = this.beacons || [];
        this.beacons.push({ url: url, data: data });
        return true;
      },
    },
    fetchCalls: [],
    fetch(url, init) {
      this.fetchCalls.push({ url: url, body: init && init.body });
      return Promise.resolve({ ok: true, url: url, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(""); } });
    },
    self: null,
    top: null,
    localStorage: memoryStorage(),
  };
  win.self = win;
  win.top = win;
  return win;
}

function pixelLocation(pathname, href) {
  const url = new URL(href || "https://practicalsupplychainplanning.com" + pathname);
  return {
    pathname: pathname,
    href: url.toString(),
    search: url.search,
    hash: url.hash,
  };
}

function armedConfig() {
  return { enabled: true, pixelId: PIXEL_ID };
}

function queueArgs(win) {
  if (!win.fbq || !win.fbq.queue) {
    return [];
  }
  return win.fbq.queue.map(function (item) {
    return Array.prototype.slice.call(item);
  });
}

function leadCalls(win) {
  return queueArgs(win).filter(function (args) {
    return args[0] === "track" && args[1] === "Lead";
  });
}

function decoded(text) {
  const raw = String(text || "");
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    return raw;
  }
}

function assertNoScenario(text, label) {
  const raw = decoded(text);
  FORBIDDEN.forEach(function (token) {
    assert.ok(!raw.includes(token), label + " must not include " + token + " in " + raw);
  });
}

function scriptSrcs(doc) {
  return doc.getElementsByTagName("script").map(function (script) {
    return script.src || script.getAttribute("src") || "";
  });
}

function assertOff(pixel, doc) {
  assert.deepStrictEqual(pixel.sent, []);
  assert.ok(!scriptSrcs(doc).some(function (src) { return src.indexOf("connect.facebook.net") !== -1; }));
  assert.ok(!scriptSrcs(doc).some(function (src) { return src.indexOf("fbevents.js") !== -1; }));
}

async function flush() {
  for (let i = 0; i < 12; i += 1) {
    await new Promise(function (resolve) {
      setImmediate(resolve);
    });
  }
}

function makeFormRoot() {
  function field() {
    return {
      hidden: false,
      value: "",
      checked: false,
      textContent: "",
      disabled: false,
      attributes: {},
      children: [],
      listeners: {},
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      },
      appendChild(child) {
        this.children.push(child);
      },
    };
  }
  const form = field();
  const email = field();
  const results = field();
  const articles = field();
  const company = field();
  const send = field();
  const status = field();
  const sent = field();
  sent.hidden = true;
  const turnstile = field();
  const root = field();
  root.attributes["data-results-email"] = "on";
  root.querySelector = function (sel) {
    const map = {
      form: form,
      '[name="email"]': email,
      '[name="results"]': results,
      '[name="articles"]': articles,
      '[name="company"]': company,
      button: send,
      ".sim-results__status": status,
      ".sim-results__sent": sent,
      ".sim-turnstile": turnstile,
      '[name="cf-turnstile-response"]': null,
    };
    return Object.prototype.hasOwnProperty.call(map, sel) ? map[sel] : null;
  };
  return { root: root, form: form, email: email, results: results, articles: articles, company: company, send: send };
}

function loadForm(sandbox) {
  const source = fs.readFileSync(path.join(ROOT, "assets", "sim-results-form.js"), "utf8");
  vm.runInNewContext(source, sandbox, { filename: "sim-results-form.js" });
  return sandbox.window.SimResultsForm;
}

async function submitForm(options) {
  const parts = makeFormRoot();
  const fetchCalls = [];
  const state = { ok: options.ok !== false };
  const sandbox = {
    window: {
      location: new URL(DIRTY_PAGE),
      pscpMeta: options.pixel,
      turnstile: { render: function () { return 1; }, reset: function () {}, getResponse: function () { return "token"; } },
      SimResultsForm: null,
    },
    document: {
      getElementById() {
        return parts.root;
      },
      createElement() {
        return { hidden: true, src: "", setAttribute() {}, children: [] };
      },
    },
    fetch(url, init) {
      fetchCalls.push({ url: url, body: init && init.body });
      const ok = state.ok;
      return Promise.resolve({
        ok: ok,
        json() {
          return Promise.resolve(ok ? { ok: true } : { ok: false, error: "no" });
        },
      });
    },
    URLSearchParams: URLSearchParams,
    Promise: Promise,
    setInterval() {
      throw new Error("results form started a timer");
    },
    clearInterval() {},
  };
  sandbox.window.document = sandbox.document;
  const api = loadForm(sandbox);
  const summary = options.summary || {
    reopenUrl: DIRTY_PAGE,
    sku: "Widget-SKU",
    forecast: 9991,
    stock: 8882,
    result: 7773,
    email: "planner@example.com",
  };
  const form = api.attach({
    id: "sim-results-email",
    formId: options.formId,
    turnstileToken() {
      return "token";
    },
    buildSummary() {
      return summary;
    },
  });
  if (options.show) {
    form.show();
  }
  parts.results.checked = true;
  if (parts.results.listeners.change) {
    parts.results.listeners.change();
  }
  parts.email.value = "planner@example.com";
  parts.form.listeners.submit({ preventDefault() {} });
  await flush();
  return { fetchCalls: fetchCalls, state: state, form: form, parts: parts };
}

function choiceButtons(doc) {
  return collect(doc.body, ".meta-consent__choice");
}

async function main() {
  assert.strictEqual(meta.isArmed({ enabled: false, pixelId: "" }), false);
  assert.strictEqual(meta.isArmed({ enabled: false, pixelId: PIXEL_ID }), false);
  assert.strictEqual(meta.isArmed({ enabled: "true", pixelId: PIXEL_ID }), false);
  assert.strictEqual(meta.isArmed({ enabled: true, pixelId: "" }), false);
  assert.strictEqual(meta.isArmed({ enabled: true, pixelId: "REPLACE_ME" }), false);
  assert.strictEqual(meta.isArmed({ enabled: true, pixelId: "YOUR_PIXEL_ID" }), false);
  assert.strictEqual(meta.isArmed({ enabled: true, pixelId: "0" }), false);
  assert.strictEqual(meta.isArmed({ enabled: true, pixelId: "12345" }), false);
  assert.strictEqual(meta.isArmed(armedConfig()), true);

  assert.strictEqual(meta.isPixelPage("/"), true);
  assert.strictEqual(meta.isPixelPage("/index.html"), true);
  assert.strictEqual(meta.isPixelPage("/learn"), true);
  assert.strictEqual(meta.isPixelPage("/learn/"), true);
  assert.strictEqual(meta.isPixelPage("/learn/safety-stock-simulator/"), true);
  assert.strictEqual(meta.isPixelPage("/learn/glossary/"), true);
  assert.strictEqual(meta.isPixelPage("/blog/"), false);
  assert.strictEqual(meta.isPixelPage("/privacy/"), false);
  assert.strictEqual(meta.isPixelPage("/products/"), false);
  assert.strictEqual(meta.isPixelPage("/learning/"), false);

  const cleaned = meta.cleanPageUrl(DIRTY_PAGE);
  assert.ok(cleaned.includes("utm_source=facebook"));
  assert.ok(cleaned.includes("utm_medium=paid-social"));
  assert.ok(cleaned.includes("utm_campaign=2026-11-sim-fb-test"));
  assert.ok(cleaned.includes("utm_content=v1-buffer"));
  assert.ok(cleaned.includes("ref=abc"));
  assert.ok(cleaned.includes("fbclid=IwAR123test"));
  assert.ok(!cleaned.includes("#"));
  assertNoScenario(cleaned, "clean page url");

  const dirtyTrack =
    "https://www.facebook.com/tr/?id=" +
    PIXEL_ID +
    "&ev=Lead&dl=" +
    encodeURIComponent(DIRTY_PAGE) +
    "&cd=" +
    encodeURIComponent(
      JSON.stringify({
        sku: "Widget-SKU",
        forecast: 9991,
        stock: 8882,
        result: 7773,
        email: "planner@example.com",
      })
    ) +
    "&em=planner@example.com";
  const sanitized = meta.sanitizeOutbound(dirtyTrack);
  const sanitizedText = decoded(sanitized);
  assert.ok(sanitizedText.includes("ev=Lead"));
  assert.ok(sanitizedText.includes("utm_source=facebook"));
  assert.ok(sanitizedText.includes("ref=abc"));
  assertNoScenario(sanitized, "sanitized pixel url");
  assert.ok(!/[?&]cd=/.test(sanitized), sanitized);
  assert.ok(!/[?&]em=/.test(sanitized), sanitized);

  const dirtyBody =
    "id=" +
    PIXEL_ID +
    "&ev=PageView&dl=" +
    encodeURIComponent(DIRTY_PAGE) +
    "&cd=" +
    encodeURIComponent('{"sku":"Widget-SKU","email":"planner@example.com"}');
  const cleanBody = meta.sanitizePixelBody(dirtyBody);
  const cleanBodyText = decoded(cleanBody);
  assert.ok(cleanBodyText.includes("ev=PageView"));
  assert.ok(cleanBodyText.includes("utm_source=facebook"));
  assertNoScenario(cleanBody, "sanitized pixel body");

  const offDoc = makeDocument('{"enabled":false,"pixelId":""}');
  const offWindow = makeWindow(offDoc, pixelLocation("/", "https://practicalsupplychainplanning.com/"));
  const originalFetch = offWindow.fetch;
  const offPixel = meta.boot(offWindow);
  assert.strictEqual(offWindow.fetch, originalFetch);
  assert.strictEqual(offPixel.choice(), "");
  assertOff(offPixel, offDoc);
  assert.strictEqual(offDoc.getElementById("pscp-meta-banner"), null);
  assert.strictEqual(offDoc.getElementById("pscp-cookie-choices"), null);
  assert.strictEqual(offPixel.accept(), false);
  assert.strictEqual(offPixel.trackLead(), false);
  assertOff(offPixel, offDoc);

  const doc = makeDocument(JSON.stringify(armedConfig()));
  const location = pixelLocation("/learn/safety-stock-simulator/", DIRTY_PAGE);
  const win = makeWindow(doc, location);
  const pixel = meta.createMetaPixel({
    config: armedConfig(),
    storage: win.localStorage,
    location: location,
    document: doc,
    window: win,
    referrer: DIRTY_PAGE,
  });
  win.pscpMeta = pixel;
  pixel.mount();

  const buttons = choiceButtons(doc);
  assert.strictEqual(buttons.length, 2);
  assert.deepStrictEqual(
    buttons.map(function (button) {
      return button.textContent;
    }),
    ["Accept", "Reject"]
  );
  assert.strictEqual(buttons[0].className, buttons[1].className);
  assert.strictEqual(buttons[0].type, "button");
  assert.strictEqual(buttons[1].type, "button");
  assert.strictEqual(buttons[0].hidden, false);
  assert.strictEqual(buttons[1].hidden, false);
  assert.ok(doc.getElementById("pscp-cookie-choices"));
  assert.strictEqual(doc.getElementById("pscp-meta-banner").hidden, false);
  assertOff(pixel, doc);

  const early = new win.Image();
  early.src = dirtyTrack;
  assert.deepStrictEqual(early.received, []);
  assert.ok(pixel.blocked.length > 0);
  assertOff(pixel, doc);
  assert.strictEqual(pixel.trackLead(), false);
  assert.deepStrictEqual(leadCalls(win), []);

  buttons[1].listeners.click();
  assert.strictEqual(pixel.choice(), "rejected");
  assert.strictEqual(win.localStorage.getItem(meta.STORAGE_KEY), "rejected");
  assert.strictEqual(doc.getElementById("pscp-meta-banner").hidden, true);
  const afterReject = new win.Image();
  afterReject.src = dirtyTrack;
  assert.deepStrictEqual(afterReject.received, []);
  assert.strictEqual(pixel.trackLead(), false);
  assert.deepStrictEqual(leadCalls(win), []);
  assertOff(pixel, doc);
  assert.ok(doc.cookieLog.some(function (row) { return row.indexOf("_fbp=") === 0; }));
  assert.ok(doc.cookieLog.some(function (row) { return row.indexOf("_fbc=") === 0; }));

  doc.getElementById("pscp-cookie-choices").listeners.click();
  assert.strictEqual(doc.getElementById("pscp-meta-banner").hidden, false);
  buttons[0].listeners.click();
  assert.strictEqual(pixel.choice(), "accepted");
  assert.ok(scriptSrcs(doc).some(function (src) { return src.indexOf(meta.SCRIPT_SRC) !== -1; }));
  const calls = queueArgs(win);
  assert.strictEqual(win.fbq.disableConfigLoading, true);
  assert.deepStrictEqual(calls[0], ["consent", "grant"]);
  assert.deepStrictEqual(calls[1], ["set", "autoConfig", false, PIXEL_ID]);
  assert.deepStrictEqual(calls[2], ["init", PIXEL_ID]);
  assert.deepStrictEqual(calls[3], ["track", "PageView"]);
  assert.strictEqual(calls[2].length, 2);
  assertNoScenario(JSON.stringify(calls), "fbq queue after accept");
  assert.deepStrictEqual(leadCalls(win), []);

  const released = new win.Image();
  released.src = dirtyTrack;
  assert.strictEqual(released.received.length, 1);
  const releasedText = decoded(released.received[0]);
  assert.ok(releasedText.includes("ev=Lead"));
  assert.ok(releasedText.includes("utm_source=facebook"));
  assert.ok(releasedText.includes("ref=abc"));
  assertNoScenario(released.received[0], "released pixel request");

  const blog = pixelLocation("/blog/", "https://practicalsupplychainplanning.com/blog/?lq=500&sku=Widget-SKU");
  const blogDoc = makeDocument(JSON.stringify(armedConfig()));
  const blogWin = makeWindow(blogDoc, blog);
  const blogPixel = meta.createMetaPixel({
    config: armedConfig(),
    storage: blogWin.localStorage,
    location: blog,
    document: blogDoc,
    window: blogWin,
  });
  blogPixel.mount();
  choiceButtons(blogDoc)[0].listeners.click();
  assert.strictEqual(blogPixel.choice(), "accepted");
  assertOff(blogPixel, blogDoc);
  blog.pathname = "/learn/safety-stock-simulator/";
  blog.href = DIRTY_PAGE;
  assert.strictEqual(blogPixel.loadPixel(), true);
  assert.ok(scriptSrcs(blogDoc).some(function (src) { return src.indexOf("fbevents.js") !== -1; }));
  assert.deepStrictEqual(leadCalls(blogWin), []);
  assert.strictEqual(blogPixel.trackLead(), true);
  assert.strictEqual(leadCalls(blogWin).length, 1);
  assert.deepStrictEqual(leadCalls(blogWin)[0], ["track", "Lead"]);
  assertNoScenario(JSON.stringify(queueArgs(blogWin)), "lead queue");

  const homeDoc = makeDocument(JSON.stringify(armedConfig()));
  const homeLoc = pixelLocation("/", "https://practicalsupplychainplanning.com/?utm_source=facebook&utm_medium=paid-social&lq=500");
  const homeWin = makeWindow(homeDoc, homeLoc);
  homeWin.localStorage.setItem(meta.STORAGE_KEY, "accepted");
  const homePixel = meta.createMetaPixel({
    config: armedConfig(),
    storage: homeWin.localStorage,
    location: homeLoc,
    document: homeDoc,
    window: homeWin,
  });
  homePixel.mount();
  assert.strictEqual(homeDoc.getElementById("pscp-meta-banner").hidden, true);
  assert.ok(scriptSrcs(homeDoc).some(function (src) { return src.indexOf("fbevents.js") !== -1; }));
  const homeImage = new homeWin.Image();
  homeImage.src =
    "https://www.facebook.com/tr/?id=" + PIXEL_ID + "&ev=PageView&dl=" + encodeURIComponent(homeLoc.href);
  const homeText = decoded(homeImage.received[0]);
  assert.ok(homeText.includes("utm_source=facebook"));
  assert.ok(!homeText.includes("lq=500"));

  const frameDoc = makeDocument(JSON.stringify(armedConfig()));
  const frameWin = makeWindow(frameDoc, location);
  const framePixel = meta.createMetaPixel({
    config: armedConfig(),
    storage: frameWin.localStorage,
    location: location,
    document: frameDoc,
    window: frameWin,
    inFrame: true,
  });
  frameWin.localStorage.setItem(meta.STORAGE_KEY, "accepted");
  assert.strictEqual(framePixel.mount(), false);
  assert.strictEqual(framePixel.loadPixel(), false);
  assert.strictEqual(framePixel.trackLead(), false);
  assertOff(framePixel, frameDoc);

  const blockedStore = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("storage blocked");
    },
  };
  const blockedDoc = makeDocument(JSON.stringify(armedConfig()));
  const blockedWin = makeWindow(blockedDoc, location);
  const blockedPixel = meta.createMetaPixel({
    config: armedConfig(),
    storage: blockedStore,
    location: location,
    document: blockedDoc,
    window: blockedWin,
  });
  blockedPixel.mount();
  assert.strictEqual(choiceButtons(blockedDoc)[0].listeners.click(), undefined);
  assert.strictEqual(blockedPixel.accept(), false);
  assertOff(blockedPixel, blockedDoc);

  const before = leadCalls(win).length;
  const opened = await submitForm({ pixel: pixel, formId: "safety-stock-simulator", show: true, ok: false });
  assert.strictEqual(leadCalls(win).length, before);
  assert.ok(opened.fetchCalls[0].body.includes("Widget-SKU"));
  assert.ok(opened.fetchCalls[0].body.includes("planner@example.com"));
  assert.strictEqual(pixel.choice(), "accepted");

  const failedLeads = leadCalls(win).length;
  await submitForm({ pixel: pixel, formId: "safety-stock-simulator", ok: false });
  assert.strictEqual(leadCalls(win).length, failedLeads);

  await submitForm({ pixel: pixel, formId: "starter-forecast", summary: { kind: "starter-forecast" }, ok: true });
  await submitForm({ pixel: pixel, formId: "difot-calculator", summary: { kind: "difot-calculator" }, ok: true });
  assert.strictEqual(leadCalls(win).length, failedLeads);

  await submitForm({ pixel: pixel, formId: "safety-stock-simulator", ok: true });
  assert.strictEqual(leadCalls(win).length, failedLeads + 1);
  assert.deepStrictEqual(leadCalls(win)[0], ["track", "Lead"]);
  assertNoScenario(JSON.stringify(queueArgs(win)), "queue after emailed results");

  await submitForm({ pixel: pixel, formId: "own-data-simulator", ok: true });
  assert.strictEqual(leadCalls(win).length, failedLeads + 2);

  const rejectedDoc = makeDocument(JSON.stringify(armedConfig()));
  const rejectedWin = makeWindow(rejectedDoc, location);
  const rejected = meta.createMetaPixel({
    config: armedConfig(),
    storage: rejectedWin.localStorage,
    location: location,
    document: rejectedDoc,
    window: rejectedWin,
  });
  rejected.mount();
  choiceButtons(rejectedDoc)[1].listeners.click();
  await submitForm({ pixel: rejected, formId: "safety-stock-simulator", ok: true });
  assert.deepStrictEqual(leadCalls(rejectedWin), []);
  assert.deepStrictEqual(rejected.sent, []);

  const source = fs.readFileSync(path.join(ROOT, "assets", "meta-pixel.js"), "utf8");
  assert.strictEqual(source.split("notifyMetaLead(").length - 1, 0);
  assert.doesNotMatch(source, /history\.replaceState|pscp\.visit|checkoutOpen/);
  const formSource = fs.readFileSync(path.join(ROOT, "assets", "sim-results-form.js"), "utf8");
  assert.strictEqual(formSource.split("notifyMetaLead(").length - 1, 2);
  assert.ok(formSource.includes('formId !== "safety-stock-simulator" && formId !== "own-data-simulator"'));
  assert.doesNotMatch(formSource, /pscp\.metaConsent|fbq\(|fbevents/);

  const paddle = fs.readFileSync(path.join(ROOT, "src", "_data", "paddle.js"), "utf8");
  assert.match(
    paddle,
    /checkoutOpen:\s*(?:true|false)\b/,
    "src/_data/paddle.js must set checkoutOpen to true or false"
  );
  const checkout = fs.readFileSync(path.join(ROOT, "assets", "pricing-checkout.js"), "utf8");
  assert.match(checkout, /config\.checkoutOpen === true/);
  assert.match(checkout, /window\.pscpVisit\.customData/);
  const visit = fs.readFileSync(path.join(ROOT, "assets", "visit.js"), "utf8");
  assert.match(visit, /STORAGE_KEY = "pscp\.visit"/);
  const metaConfig = fs.readFileSync(path.join(ROOT, "src", "_data", "metaPixel.js"), "utf8");
  assert.match(metaConfig, /enabled:\s*true/);
  assert.match(metaConfig, /pixelId:\s*"4035664576572032"/);

  if (!fs.existsSync(SITE)) {
    console.error("Built site is missing. Run `npm run build` before scripts/verify_meta_pixel.js.");
    process.exit(1);
  }

  const siteData = fs.readFileSync(path.join(ROOT, "src", "_data", "site.js"), "utf8");
  const cssVersion = siteData.match(/cssVersion:\s*"([^"]+)"/);
  assert.ok(cssVersion, "cssVersion missing");
  const pixelTag = "/assets/meta-pixel.js?v=" + cssVersion[1];

  function walkHtml(dir) {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        found.push(...walkHtml(full));
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        found.push(full);
      }
    }
    return found;
  }

  const htmlFiles = walkHtml(SITE);
  assert.ok(htmlFiles.length > 0);
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const relative = path.relative(SITE, file);
    assert.ok(!html.includes("connect.facebook.net"), relative + " must not request the Pixel script");
    assert.ok(!html.includes("facebook.com/tr"), relative + " must not contain a Pixel image url");
    assert.ok(!html.includes("fbevents.js"), relative + " must not name fbevents.js");
  }

  for (const relative of [
    "index.html",
    "learn/index.html",
    "learn/safety-stock-simulator/index.html",
    "privacy/index.html",
  ]) {
    const html = fs.readFileSync(path.join(SITE, relative), "utf8");
    assert.ok(html.includes(pixelTag), relative + " must load " + pixelTag);
    const configMatch = html.match(/<script type="application\/json" id="pscp-meta-config">([\s\S]*?)<\/script>/);
    assert.ok(configMatch, relative + " must include the Pixel config");
    const config = JSON.parse(configMatch[1]);
    assert.strictEqual(config.enabled, true);
    assert.strictEqual(config.pixelId, "4035664576572032");
  }

  const privacySource = fs.readFileSync(path.join(ROOT, "src", "privacy.njk"), "utf8");
  const privacy = fs.readFileSync(path.join(SITE, "privacy", "index.html"), "utf8");
  assert.match(privacy, /Last updated: 12 November 2026/);
  assert.match(privacy, /Meta Platforms, Inc\./);
  assert.match(privacy, /Safety Stock Simulator/);
  assert.match(privacy, /United States/);
  assert.match(privacy, /about 90 days/);
  assert.match(privacy, /The banner offers Accept and Reject as equal choices/);
  assert.match(privacy, /Cookie choices in the footer/);
  assert.match(privacy, /If you accept, Meta receives a page view/);
  assert.match(privacy, /choose Reject, or open Cookie choices/);
  assert.doesNotMatch(privacy, /The Meta Pixel is not switched on, so no page views are sent to Meta/);
  assert.doesNotMatch(privacy, /While the Pixel is switched off/);
  assert.doesNotMatch(privacy, /described above/);
  assert.match(privacySource, /If you accept, Meta receives a page view/);
  assert.match(privacySource, /choose Reject, or open Cookie choices/);
  assert.match(privacySource, /We never send scenario data, SKU names, forecasts, stock figures or result numbers to Meta/);
  assert.match(privacySource, /separate from the .*Email me my results/);
  assert.doesNotMatch(privacy, /does not use advertising or tracking cookies/);
  assert.doesNotMatch(privacy, /has no analytics, advertising or tracking cookies/);
  assert.doesNotMatch(privacy, /don&rsquo;t use it for advertising/);
  assert.doesNotMatch(privacy, /AWAITING DANIEL/);
  assert.doesNotMatch(privacy, /not switched on/);
  assert.match(privacySource, /The banner offers Accept and Reject as equal choices/);
  assert.match(privacySource, /a page view, and a lead event after a results email is sent/);
  assert.doesNotMatch(privacySource, /AWAITING DANIEL/);

  const simPage = fs.readFileSync(path.join(SITE, "learn", "safety-stock-simulator", "index.html"), "utf8").replace(/\s+/g, " ");
  const ownPage = fs.readFileSync(path.join(SITE, "learn", "safety-stock-simulator", "own-data", "index.html"), "utf8").replace(/\s+/g, " ");
  assert.doesNotMatch(simPage, /Nothing is stored on a server/);
  assert.match(simPage, /for 24 months/);
  assert.match(simPage, /page address can include the scenario settings/);
  assert.match(simPage, /That view does not include the scenario settings/);
  assert.match(ownPage, /We do not keep the summary or the link/);
  assert.match(ownPage, /for 24 months/);
  assert.match(ownPage, /does not include the #d= fragment/);
  assert.doesNotMatch(ownPage, /are not stored and are not sent to a server/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(ROOT, "src", "learn", "safety-stock-simulator.njk"), "utf8"),
    /AWAITING DANIEL/
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(ROOT, "src", "learn", "own-data-simulator.njk"), "utf8"),
    /AWAITING DANIEL/
  );

  const sku = "QA-SKU-LEAK";
  const fragment = "#d=" + sku + "x".repeat(2000 - 3 - sku.length);
  assert.strictEqual(fragment.length, 2000);
  const longPage =
    "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/own-data/?lq=500&sku=" +
    sku +
    "&utm_source=facebook" +
    fragment;
  assert.ok(fragment.length >= 1893);
  assert.ok(longPage.length > 2048, "fixture should be long enough for a Pixel POST");
  const postBody =
    "id=" +
    PIXEL_ID +
    "&ev=PageView&dl=" +
    encodeURIComponent(longPage) +
    "&cd=" +
    encodeURIComponent(JSON.stringify({ sku: sku, email: "planner@example.com" }));
  assert.ok(decoded(postBody).includes(sku));

  const longDoc = makeDocument(JSON.stringify(armedConfig()));
  const longLoc = pixelLocation("/learn/safety-stock-simulator/own-data/", longPage);
  const longWin = makeWindow(longDoc, longLoc);
  const longPixel = meta.createMetaPixel({
    config: armedConfig(),
    storage: longWin.localStorage,
    location: longLoc,
    document: longDoc,
    window: longWin,
    referrer: longPage,
  });
  longPixel.mount();
  choiceButtons(longDoc)[0].listeners.click();

  const xhr = new longWin.XMLHttpRequest();
  xhr.open("POST", "https://www.facebook.com/tr/");
  xhr.send(postBody);
  assert.strictEqual(xhr.sentBody, true);
  const posted = decoded(xhr.body);
  assert.ok(posted.includes("ev=PageView"));
  assert.ok(posted.includes("utm_source=facebook"));
  assert.ok(!posted.includes(sku), posted);
  assert.ok(!posted.includes("#d="));
  assert.ok(!posted.includes("lq=500"));
  assert.ok(!posted.includes("sku="));
  assert.ok(!posted.includes("planner@example.com"));
  assert.ok(!posted.includes("#"));

  const formData = new FormData();
  formData.append("id", PIXEL_ID);
  formData.append("ev", "PageView");
  formData.append("dl", longPage);
  formData.append("cd", JSON.stringify({ sku: sku }));
  formData.append("sku", sku);
  await longWin.fetch("https://www.facebook.com/tr/", { method: "POST", body: formData });
  const fetched = decoded(longWin.fetchCalls[longWin.fetchCalls.length - 1].body);
  assert.ok(fetched.includes("utm_source=facebook"));
  assert.ok(!fetched.includes(sku));
  assert.ok(!fetched.includes("#"));

  const form = Object.create(longWin.HTMLFormElement.prototype);
  form.action = "https://www.facebook.com/tr/";
  form.elements = [
    { name: "id", value: PIXEL_ID },
    { name: "ev", value: "PageView" },
    { name: "dl", value: longPage },
    { name: "cd", value: JSON.stringify({ sku: sku }) },
    { name: "sku", value: sku },
  ];
  form.submit();
  assert.strictEqual(longWin.HTMLFormElement.submits.length, 1);
  const formText = longWin.HTMLFormElement.submits[0].fields
    .map(function (field) {
      return field.name + "=" + field.value;
    })
    .join("&");
  assert.ok(decoded(formText).includes("utm_source=facebook"));
  assert.ok(!decoded(formText).includes(sku));
  assert.ok(!formText.includes("#"));

  const configScript = longDoc.createElement("script");
  configScript.src = "https://connect.facebook.net/signals/config/" + PIXEL_ID;
  assert.ok(!String(configScript.src).includes("/signals/config/"));

  const blobWhileOn = new longWin.XMLHttpRequest();
  blobWhileOn.open("POST", "https://www.facebook.com/tr/");
  blobWhileOn.send(new Blob([postBody]));
  assert.ok(!blobWhileOn.sentBody, "an unreadable Pixel body must not be sent");

  const seen = [];
  longWin.fbq.callMethod = function () {
    seen.push(Array.prototype.slice.call(arguments));
    const follow = new longWin.XMLHttpRequest();
    follow.open("POST", "https://www.facebook.com/tr/");
    follow.send(postBody);
  };
  longWin.fbq("init", PIXEL_ID, { em: "planner@example.com", sku: sku });
  assert.deepStrictEqual(seen[seen.length - 1], ["init", PIXEL_ID]);

  const sendsBeforeReject = seen.length;
  longPixel.reject();
  assert.ok(seen.slice(sendsBeforeReject).some(function (args) {
    return args[0] === "consent" && args[1] === "revoke";
  }));
  const afterRevoke = seen.length;
  longWin.fbq("track", "PageView");
  longWin.fbq("track", "Lead");
  assert.strictEqual(seen.length, afterRevoke);
  assert.deepStrictEqual(leadCalls(longWin), []);

  const late = new longWin.XMLHttpRequest();
  late.open("POST", "https://www.facebook.com/tr/");
  late.send(postBody);
  assert.ok(!late.sentBody);

  const lateBlob = new longWin.XMLHttpRequest();
  lateBlob.open("POST", "https://www.facebook.com/tr/");
  lateBlob.send(new Blob([postBody]));
  assert.ok(!lateBlob.sentBody);

  form.elements[2].value = longPage;
  form.elements[4].value = sku;
  const submitsBefore = longWin.HTMLFormElement.submits.length;
  form.submit();
  assert.strictEqual(longWin.HTMLFormElement.submits.length, submitsBefore);

  console.log("Meta Pixel consent checks OK.");
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
