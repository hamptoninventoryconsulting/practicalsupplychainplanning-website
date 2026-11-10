/**
 * Consent-gated Meta Pixel.
 *
 * The Pixel script is not requested until both of these are true:
 * the config is armed (enabled and a real Pixel ID), and this browser's
 * stored choice is "accepted". Reject stores the opposite and blocks the
 * script and later event requests.
 *
 * PageView is sent only on the home page and /learn/ pages.
 * Lead is the standard Meta event for "Simulator results emailed".
 * It is fired only after a successful results email, with no parameters.
 *
 * Scenario settings can sit in the page address, including a long #d= fragment.
 * Every Pixel transport (image, fetch, XHR, sendBeacon, and form POST) rewrites
 * dl and rl and drops scenario fields. A body that cannot be cleaned is not sent.
 * Reject calls fbq('consent', 'revoke') and the fbq wrapper drops later track
 * calls on the same page. The signals/config script is never requested, so
 * Events Manager cannot turn automatic advanced matching on in the browser.
 * Automatic advanced matching must also stay off in Events Manager.
 * UTM tags, ref and fbclid are kept. init is called with the Pixel ID only.
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "pscp.metaConsent";
  var SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";
  var ALLOWED_QUERY = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "fbclid"];
  var URL_PARAMS = { dl: true, rl: true, event_source_url: true };
  var DROP_PARAMS = { cd: true, ud: true, udff: true, em: true, email: true };
  // Page-address keys that carry a scenario. Pixel fields sw and sh are screen
  // size, so they are not in this list; those scenario keys are removed inside dl.
  var SCENARIO_FIELDS = {
    d: true,
    m: true,
    s: true,
    p: true,
    lm: true,
    lq: true,
    lw: true,
    sm: true,
    sq: true,
    sl: true,
    lt: true,
    dv: true,
    lv: true,
    qv: true,
    run: true,
    sku: true,
    forecast: true,
    stock: true,
    result: true,
  };

  function isArmed(config) {
    if (!config || config.enabled !== true) {
      return false;
    }
    return /^[0-9]{15,20}$/.test(String(config.pixelId || ""));
  }

  function isPixelPage(pathname) {
    var path = String(pathname || "");
    if (path === "/" || path === "/index.html") {
      return true;
    }
    if (path === "/learn" || path === "/learn/") {
      return true;
    }
    return path.indexOf("/learn/") === 0;
  }

  function safeDecode(value) {
    var text = String(value || "");
    try {
      return decodeURIComponent(text);
    } catch (error) {
      return text;
    }
  }

  function scenarioLeak(value) {
    var decoded = safeDecode(value).replace(/#/g, "&");
    if (decoded.indexOf("@") !== -1) {
      return true;
    }
    if (/[?&](?:m|s|p|lm|lq|lw|sm|sq|sw|sl|lt|dv|lv|qv|sh|run|sku|forecast|stock|result)=/i.test("?" + decoded)) {
      return true;
    }
    if (/"(?:sku|forecast|stock|result|email)"\s*:/i.test(decoded)) {
      return true;
    }
    return false;
  }

  function cleanPageUrl(href) {
    var text = String(href || "").trim();
    if (!text) {
      return "";
    }
    var parsed;
    try {
      parsed = new URL(text, "https://practicalsupplychainplanning.com");
    } catch (error) {
      return "";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    var next = new URLSearchParams();
    ALLOWED_QUERY.forEach(function (key) {
      if (!parsed.searchParams.has(key)) {
        return;
      }
      var value = parsed.searchParams.get(key) || "";
      if (!value || value.indexOf("@") !== -1 || scenarioLeak(value)) {
        return;
      }
      var max = key === "fbclid" ? 200 : 100;
      next.append(key, value.slice(0, max));
    });
    parsed.search = next.toString() ? "?" + next.toString() : "";
    return parsed.toString();
  }

  function shouldDropKey(key) {
    var lower = String(key || "").toLowerCase();
    if (DROP_PARAMS[lower] || SCENARIO_FIELDS[lower]) {
      return true;
    }
    return lower.indexOf("cd[") === 0 || lower.indexOf("ud[") === 0;
  }

  function isSignalsConfigUrl(value) {
    try {
      var parsed = new URL(String(value || ""), "https://connect.facebook.net");
      return parsed.hostname === "connect.facebook.net" && parsed.pathname.indexOf("/signals/") === 0;
    } catch (error) {
      return String(value || "").indexOf("/signals/config/") !== -1;
    }
  }

  function payloadUnsafe(value) {
    var decoded = safeDecode(value);
    if (decoded.indexOf("#") !== -1) {
      return true;
    }
    if (/[?&#](?:d|lq|sq|sku|forecast|stock|result)=[^&#]/i.test("?" + decoded)) {
      return true;
    }
    if (/"(?:sku|forecast|stock|result|email)"\s*:/i.test(decoded)) {
      return true;
    }
    return false;
  }

  function sanitizeParams(params) {
    var entries = [];
    params.forEach(function (value, key) {
      entries.push([key, value]);
    });
    entries.forEach(function (pair) {
      params.delete(pair[0]);
    });
    entries.forEach(function (pair) {
      var key = pair[0];
      var value = pair[1];
      if (shouldDropKey(key)) {
        return;
      }
      var lower = String(key || "").toLowerCase();
      if (URL_PARAMS[lower]) {
        var cleaned = cleanPageUrl(value);
        if (cleaned) {
          params.append(key, cleaned);
        }
        return;
      }
      if (value && (String(value).indexOf("@") !== -1 || scenarioLeak(value))) {
        return;
      }
      params.append(key, value);
    });
    return params;
  }

  function isMetaPixelUrl(value) {
    try {
      var parsed = new URL(String(value || ""), "https://www.facebook.com");
      if (parsed.hostname === "connect.facebook.net") {
        return true;
      }
      if (parsed.hostname === "www.facebook.com" || parsed.hostname === "facebook.com") {
        return parsed.pathname === "/tr" || parsed.pathname.indexOf("/tr/") === 0;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  function sanitizeOutbound(raw) {
    var text = String(raw || "");
    if (!text) {
      return "";
    }
    if (!isMetaPixelUrl(text)) {
      return sanitizePixelBody(text);
    }
    var parsed = new URL(text, "https://www.facebook.com");
    if (parsed.hostname === "connect.facebook.net") {
      return parsed.toString();
    }
    sanitizeParams(parsed.searchParams);
    return parsed.toString();
  }

  function isPixelBody(value) {
    var text = String(value || "");
    return text.indexOf("dl=") !== -1 || text.indexOf("ev=") !== -1 || text.indexOf("cd=") !== -1;
  }

  function sanitizePixelBody(raw) {
    var text = String(raw || "");
    if (!text) {
      return "";
    }
    if (!isPixelBody(text) && text.indexOf("#") === -1 && !scenarioLeak(text)) {
      return text;
    }
    var params = new URLSearchParams(text);
    sanitizeParams(params);
    return params.toString();
  }

  function preparePixelBody(body) {
    if (body == null || body === "") {
      return body == null ? "" : body;
    }
    if (typeof body === "string") {
      var cleaned = sanitizePixelBody(body);
      if (payloadUnsafe(cleaned)) {
        return null;
      }
      return cleaned;
    }
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      var params = new URLSearchParams(body.toString());
      sanitizeParams(params);
      var asString = params.toString();
      if (payloadUnsafe(asString)) {
        return null;
      }
      return asString;
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      var formParams = new URLSearchParams();
      var blockedBinary = false;
      body.forEach(function (value, key) {
        if (typeof value !== "string") {
          blockedBinary = true;
          return;
        }
        formParams.append(key, value);
      });
      if (blockedBinary) {
        return null;
      }
      sanitizeParams(formParams);
      var formString = formParams.toString();
      if (payloadUnsafe(formString)) {
        return null;
      }
      return formString;
    }
    return null;
  }

  function sanitizeFbqArgs(args) {
    var command = String(args[0] || "");
    if (command === "init") {
      return [args[0], args[1]];
    }
    if (command === "track" || command === "trackCustom") {
      return [args[0], args[1]];
    }
    if (command === "trackSingle" || command === "trackSingleCustom") {
      return [args[0], args[1], args[2]];
    }
    return args.slice();
  }

  function readStored(storage) {
    if (!storage || typeof storage.getItem !== "function") {
      return "";
    }
    try {
      var value = storage.getItem(STORAGE_KEY);
      if (value === "accepted" || value === "rejected") {
        return value;
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function addClass(el, name) {
    var parts = String(el.className || "")
      .split(/\s+/)
      .filter(Boolean);
    if (parts.indexOf(name) === -1) {
      parts.push(name);
    }
    el.className = parts.join(" ");
  }

  function removeClass(el, name) {
    el.className = String(el.className || "")
      .split(/\s+/)
      .filter(function (part) {
        return part && part !== name;
      })
      .join(" ");
  }

  function setHidden(el, hidden) {
    el.hidden = hidden;
    if (hidden) {
      el.setAttribute("hidden", "");
    } else if (typeof el.removeAttribute === "function") {
      el.removeAttribute("hidden");
    }
  }

  function hookSrc(el, filter) {
    if (!el || el.__pscpSrcHook) {
      return;
    }
    var desc = null;
    try {
      desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "src");
    } catch (error) {
      desc = null;
    }
    var origSetAttribute = typeof el.setAttribute === "function" ? el.setAttribute : null;
    var current = "";
    function apply(value) {
      var next = filter(String(value == null ? "" : value));
      if (next == null) {
        current = "";
        return;
      }
      current = next;
      if (desc && desc.set) {
        desc.set.call(el, next);
      } else if (origSetAttribute) {
        origSetAttribute.call(el, "src", next);
      }
    }
    try {
      Object.defineProperty(el, "src", {
        configurable: true,
        enumerable: true,
        get: function () {
          return current;
        },
        set: apply,
      });
      if (origSetAttribute) {
        el.setAttribute = function (name, value) {
          if (String(name).toLowerCase() === "src") {
            apply(value);
            return;
          }
          return origSetAttribute.apply(el, arguments);
        };
      }
      el.__pscpSrcHook = true;
    } catch (error) {
      /* The load gate still refuses to assign a Pixel URL before consent. */
    }
  }

  function createMetaPixel(deps) {
    var options = deps || {};
    var config = options.config || { enabled: false, pixelId: "" };
    var storage = options.storage || null;
    var location = options.location || { pathname: "/", href: "https://practicalsupplychainplanning.com/" };
    var doc = options.document || null;
    var win = options.window || null;
    var inFrame = options.inFrame === true;
    var referrer = options.referrer || (doc && doc.referrer) || "";
    var sent = [];
    var blocked = [];
    var override = "";
    var loaded = false;
    var guarded = false;
    var banner = null;
    var rejectButton = null;

    function choice() {
      if (override === "accepted" || override === "rejected") {
        return override;
      }
      return readStored(storage);
    }

    function allow() {
      return isArmed(config) && choice() === "accepted";
    }

    function filter(raw) {
      var text = raw == null ? "" : String(raw);
      if (!text || !isMetaPixelUrl(text)) {
        return text;
      }
      if (isSignalsConfigUrl(text)) {
        blocked.push(text);
        return null;
      }
      if (!allow()) {
        blocked.push(text);
        return null;
      }
      var clean = text.indexOf("fbevents.js") !== -1 ? text : sanitizeOutbound(text);
      if (payloadUnsafe(clean)) {
        blocked.push(text);
        return null;
      }
      sent.push(clean);
      return clean;
    }

    function deliverBody(body) {
      if (!allow()) {
        blocked.push("pixel-body");
        return null;
      }
      var prepared = preparePixelBody(body);
      if (prepared == null || payloadUnsafe(prepared)) {
        blocked.push("pixel-body");
        return null;
      }
      return prepared;
    }

    function persist(next) {
      override = next;
      if (!storage || typeof storage.setItem !== "function") {
        override = "";
        return false;
      }
      try {
        storage.setItem(STORAGE_KEY, next);
        return true;
      } catch (error) {
        override = "";
        return false;
      }
    }

    function clearPixelCookies() {
      if (!doc) {
        return;
      }
      ["_fbp", "_fbc"].forEach(function (name) {
        try {
          doc.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
        } catch (error) {
          /* A blocked cookie store still leaves the Pixel unloaded after Reject. */
        }
      });
    }

    function installGuard() {
      if (!win || guarded || !isArmed(config)) {
        return;
      }
      guarded = true;
      if (typeof win.Image === "function") {
        var OriginalImage = win.Image;
        var WrappedImage = function Image(width, height) {
          var img = new OriginalImage(width, height);
          hookSrc(img, filter);
          return img;
        };
        WrappedImage.prototype = OriginalImage.prototype;
        win.Image = WrappedImage;
      }
      if (doc && typeof doc.createElement === "function" && !doc.__pscpCreateHook) {
        var origCreate = doc.createElement;
        doc.createElement = function (tag) {
          var el = origCreate.apply(doc, arguments);
          var name = String(tag || "").toLowerCase();
          if (name === "script" || name === "img") {
            hookSrc(el, filter);
          }
          return el;
        };
        doc.__pscpCreateHook = true;
      }
      function emptyResponse() {
        return Promise.resolve({
          ok: false,
          status: 0,
          json: function () {
            return Promise.resolve({});
          },
          text: function () {
            return Promise.resolve("");
          },
        });
      }
      if (typeof win.fetch === "function" && !win.__pscpFetchHook) {
        var origFetch = win.fetch;
        win.fetch = function (input, init) {
          var url = typeof input === "string" ? input : input && input.url;
          var nextUrl = filter(url);
          if (url && isMetaPixelUrl(url) && nextUrl == null) {
            return emptyResponse();
          }
          var nextInit = init;
          if (url && isMetaPixelUrl(url)) {
            var prepared = deliverBody(init && init.body);
            if (prepared == null && init && init.body != null && init.body !== "") {
              return emptyResponse();
            }
            if (init && init.body != null) {
              nextInit = Object.assign({}, init, { body: prepared });
            }
          }
          var nextInput = input;
          if (typeof input === "string" && nextUrl && nextUrl !== url) {
            nextInput = nextUrl;
          }
          return origFetch.call(win, nextInput, nextInit);
        };
        win.__pscpFetchHook = true;
      }
      if (win.XMLHttpRequest && win.XMLHttpRequest.prototype && !win.XMLHttpRequest.prototype.__pscpHook) {
        var proto = win.XMLHttpRequest.prototype;
        var origOpen = proto.open;
        var origSend = proto.send;
        proto.open = function (method, url) {
          var args = Array.prototype.slice.call(arguments);
          var nextUrl = filter(url);
          this.__pscpPixel = Boolean(url && isMetaPixelUrl(url));
          this.__pscpBlocked = Boolean(this.__pscpPixel && nextUrl == null);
          if (!this.__pscpBlocked && nextUrl && nextUrl !== url) {
            args[1] = nextUrl;
          }
          if (this.__pscpBlocked) {
            args[1] = "about:blank";
          }
          return origOpen.apply(this, args);
        };
        proto.send = function (body) {
          if (this.__pscpBlocked) {
            return;
          }
          if (this.__pscpPixel) {
            var prepared = deliverBody(body);
            if (prepared == null && body != null && body !== "") {
              return;
            }
            body = prepared;
          }
          return origSend.call(this, body);
        };
        proto.__pscpHook = true;
      }
      if (win.navigator && typeof win.navigator.sendBeacon === "function" && !win.navigator.__pscpBeaconHook) {
        var origBeacon = win.navigator.sendBeacon.bind(win.navigator);
        win.navigator.sendBeacon = function (url, data) {
          var nextUrl = filter(url);
          if (url && isMetaPixelUrl(url) && nextUrl == null) {
            return false;
          }
          var nextData = data;
          if (url && isMetaPixelUrl(url) && data != null && data !== "") {
            nextData = deliverBody(data);
            if (nextData == null) {
              return false;
            }
          }
          return origBeacon(nextUrl || url, nextData);
        };
        win.navigator.__pscpBeaconHook = true;
      }
      hookFormSubmit(win);
    }

    function scrubForm(form) {
      var action = form && (form.action || (form.getAttribute && form.getAttribute("action"))) || "";
      if (!isMetaPixelUrl(action)) {
        return "ignore";
      }
      if (!allow()) {
        blocked.push(action);
        return "block";
      }
      var cleanedAction = filter(action);
      if (cleanedAction == null) {
        return "block";
      }
      form.action = cleanedAction;
      var elements = form.elements || [];
      for (var i = 0; i < elements.length; i += 1) {
        var field = elements[i];
        if (!field) {
          continue;
        }
        var key = String(field.name || "");
        if (shouldDropKey(key)) {
          field.value = "";
          continue;
        }
        var lower = key.toLowerCase();
        if (URL_PARAMS[lower]) {
          field.value = cleanPageUrl(field.value);
          continue;
        }
        var rawValue = String(field.value || "");
        if (rawValue.indexOf("#") !== -1 || rawValue.indexOf("@") !== -1 || scenarioLeak(rawValue)) {
          if (/^https?:\/\//i.test(rawValue)) {
            field.value = cleanPageUrl(rawValue);
          } else {
            field.value = "";
          }
        }
      }
      var snapshot = "";
      for (var j = 0; j < elements.length; j += 1) {
        if (elements[j]) {
          snapshot += String(elements[j].name || "") + "=" + String(elements[j].value || "") + "&";
        }
      }
      if (payloadUnsafe(snapshot)) {
        blocked.push(action);
        return "block";
      }
      return "send";
    }

    function hookFormSubmit(target) {
      var Form = target && target.HTMLFormElement;
      var proto = Form && Form.prototype;
      if (!proto || proto.__pscpSubmitHook || typeof proto.submit !== "function") {
        return;
      }
      var origSubmit = proto.submit;
      proto.submit = function () {
        var decision = scrubForm(this);
        if (decision === "block") {
          return;
        }
        return origSubmit.apply(this, arguments);
      };
      if (typeof proto.requestSubmit === "function") {
        var origRequest = proto.requestSubmit;
        proto.requestSubmit = function () {
          var decision = scrubForm(this);
          if (decision === "block") {
            return;
          }
          return origRequest.apply(this, arguments);
        };
      }
      proto.__pscpSubmitHook = true;
    }

    function installFbq() {
      if (!win || !doc || win.fbq) {
        return;
      }
      var queueFn = function () {
        var args = Array.prototype.slice.call(arguments);
        var command = String(args[0] || "");
        if (!allow()) {
          if (command === "consent" && queueFn.callMethod) {
            queueFn.callMethod.apply(queueFn, args);
          } else if (command === "consent") {
            queueFn.queue.push(args);
          } else {
            blocked.push("fbq:" + command);
          }
          return;
        }
        var safe = sanitizeFbqArgs(args);
        if (queueFn.callMethod) {
          queueFn.callMethod.apply(queueFn, safe);
        } else {
          queueFn.queue.push(safe);
        }
      };
      win.fbq = queueFn;
      if (!win._fbq) {
        win._fbq = queueFn;
      }
      queueFn.push = queueFn;
      queueFn.loaded = true;
      queueFn.version = "2.0";
      queueFn.queue = [];
      queueFn.disablePushState = true;
      var script = doc.createElement("script");
      script.async = true;
      script.id = "pscp-meta-pixel-script";
      script.src = SCRIPT_SRC;
      var first = doc.getElementsByTagName ? doc.getElementsByTagName("script")[0] : null;
      if (first && first.parentNode && typeof first.parentNode.insertBefore === "function") {
        first.parentNode.insertBefore(script, first);
      } else if (doc.head && typeof doc.head.appendChild === "function") {
        doc.head.appendChild(script);
      } else if (doc.body && typeof doc.body.appendChild === "function") {
        doc.body.appendChild(script);
      }
    }

    function loadPixel() {
      if (loaded) {
        return true;
      }
      if (inFrame || !allow() || !isPixelPage(location.pathname) || !doc || !win) {
        return false;
      }
      installGuard();
      installFbq();
      if (!win.fbq) {
        return false;
      }
      loaded = true;
      var pixelId = String(config.pixelId);
      win.fbq("consent", "grant");
      win.fbq("set", "autoConfig", false, pixelId);
      win.fbq("init", pixelId);
      win.fbq("track", "PageView");
      return true;
    }

    function trackLead() {
      if (inFrame || !loaded || !allow() || !win || !win.fbq) {
        return false;
      }
      if (!isPixelPage(location.pathname)) {
        return false;
      }
      win.fbq("track", "Lead");
      return true;
    }

    function showBanner() {
      if (!banner) {
        return;
      }
      setHidden(banner, false);
      if (doc.body) {
        addClass(doc.body, "meta-consent-open");
      }
    }

    function hideBanner() {
      if (!banner) {
        return;
      }
      setHidden(banner, true);
      if (doc.body) {
        removeClass(doc.body, "meta-consent-open");
      }
    }

    function note(text) {
      if (!banner) {
        return;
      }
      var status = banner.querySelector ? banner.querySelector(".meta-consent__status") : null;
      if (status) {
        status.textContent = text || "";
      }
    }

    function accept() {
      if (!isArmed(config)) {
        return false;
      }
      if (!persist("accepted")) {
        note("We couldn't save that choice in this browser, so the Pixel stays off.");
        return false;
      }
      note("");
      var started = loadPixel();
      hideBanner();
      return started || choice() === "accepted";
    }

    function reject() {
      if (!isArmed(config)) {
        return false;
      }
      if (!persist("rejected")) {
        note("We couldn't save that choice in this browser, so the Pixel stays off.");
        return false;
      }
      loaded = false;
      if (win && win.fbq) {
        win.fbq("consent", "revoke");
      }
      clearPixelCookies();
      note("");
      hideBanner();
      return true;
    }

    function ensureFooter() {
      if (!doc || typeof doc.querySelector !== "function" || typeof doc.getElementById !== "function") {
        return;
      }
      if (doc.getElementById("pscp-cookie-choices")) {
        return;
      }
      var list = doc.querySelector(".site-footer__list");
      if (!list || typeof list.appendChild !== "function") {
        return;
      }
      var item = doc.createElement("li");
      var button = doc.createElement("button");
      button.type = "button";
      button.id = "pscp-cookie-choices";
      button.className = "meta-consent-footer";
      button.textContent = "Cookie choices";
      button.addEventListener("click", function () {
        showBanner();
        if (rejectButton && typeof rejectButton.focus === "function") {
          rejectButton.focus();
        }
      });
      item.appendChild(button);
      list.appendChild(item);
    }

    function ensureBanner() {
      if (!doc || !doc.body || typeof doc.createElement !== "function") {
        return;
      }
      if (typeof doc.getElementById === "function" && doc.getElementById("pscp-meta-banner")) {
        banner = doc.getElementById("pscp-meta-banner");
        return;
      }
      banner = doc.createElement("section");
      banner.id = "pscp-meta-banner";
      banner.className = "meta-consent";
      banner.setAttribute("role", "region");
      banner.setAttribute("aria-label", "Advertising cookies");

      var inner = doc.createElement("div");
      inner.className = "meta-consent__inner";

      var text = doc.createElement("p");
      text.className = "meta-consent__text";
      text.textContent =
        "The home page and Learn pages can use a Meta Pixel, an advertising cookie, to measure ads for the free Safety Stock Simulator. It does not load until you accept. Reject leaves it off. We never send your planning or scenario data. You can change this later from Cookie choices in the footer.";

      var status = doc.createElement("p");
      status.className = "meta-consent__status";
      status.setAttribute("role", "status");

      var actions = doc.createElement("div");
      actions.className = "meta-consent__actions";

      var acceptBtn = doc.createElement("button");
      acceptBtn.type = "button";
      acceptBtn.className = "meta-consent__choice";
      acceptBtn.textContent = "Accept";
      acceptBtn.addEventListener("click", function () {
        accept();
      });

      rejectButton = doc.createElement("button");
      rejectButton.type = "button";
      rejectButton.className = "meta-consent__choice";
      rejectButton.id = "pscp-meta-reject";
      rejectButton.textContent = "Reject";
      rejectButton.addEventListener("click", function () {
        reject();
      });

      var privacy = doc.createElement("p");
      privacy.className = "meta-consent__privacy";
      var link = doc.createElement("a");
      link.href = "/privacy/";
      link.textContent = "Privacy policy";
      privacy.appendChild(link);

      actions.appendChild(acceptBtn);
      actions.appendChild(rejectButton);
      inner.appendChild(text);
      inner.appendChild(status);
      inner.appendChild(actions);
      inner.appendChild(privacy);
      banner.appendChild(inner);
      doc.body.appendChild(banner);
      setHidden(banner, true);
    }

    function mount() {
      if (!isArmed(config) || inFrame) {
        return false;
      }
      installGuard();
      ensureFooter();
      ensureBanner();
      if (choice() === "") {
        showBanner();
      } else {
        hideBanner();
      }
      if (choice() === "accepted") {
        loadPixel();
      }
      return true;
    }

    return {
      STORAGE_KEY: STORAGE_KEY,
      sent: sent,
      blocked: blocked,
      choice: choice,
      allow: allow,
      filter: filter,
      accept: accept,
      reject: reject,
      loadPixel: loadPixel,
      trackLead: trackLead,
      mount: mount,
      showBanner: showBanner,
    };
  }

  function readConfig(doc) {
    var empty = { enabled: false, pixelId: "" };
    if (!doc || typeof doc.getElementById !== "function") {
      return empty;
    }
    var node = doc.getElementById("pscp-meta-config");
    if (!node) {
      return empty;
    }
    try {
      var parsed = JSON.parse(node.textContent || "");
      return {
        enabled: parsed.enabled === true,
        pixelId: parsed.pixelId == null ? "" : String(parsed.pixelId),
      };
    } catch (error) {
      return empty;
    }
  }

  function boot(win) {
    if (!win || !win.document || !win.location) {
      return null;
    }
    var inFrame = false;
    try {
      inFrame = win.self !== win.top;
    } catch (error) {
      inFrame = true;
    }
    var storage = null;
    try {
      storage = win.localStorage;
    } catch (error) {
      storage = null;
    }
    var pixel = createMetaPixel({
      config: readConfig(win.document),
      storage: storage,
      location: win.location,
      referrer: win.document.referrer || "",
      document: win.document,
      window: win,
      inFrame: inFrame,
    });
    win.pscpMeta = pixel;
    if (!inFrame) {
      pixel.mount();
    }
    return pixel;
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    SCRIPT_SRC: SCRIPT_SRC,
    isArmed: isArmed,
    isPixelPage: isPixelPage,
    cleanPageUrl: cleanPageUrl,
    sanitizeOutbound: sanitizeOutbound,
    sanitizePixelBody: sanitizePixelBody,
    isMetaPixelUrl: isMetaPixelUrl,
    scenarioLeak: scenarioLeak,
    createMetaPixel: createMetaPixel,
    readConfig: readConfig,
    boot: boot,
    preparePixelBody: preparePixelBody,
    isSignalsConfigUrl: isSignalsConfigUrl,
    payloadUnsafe: payloadUnsafe,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root && root.document && root.location) {
    boot(root);
  }
})(typeof window !== "undefined" ? window : null);
