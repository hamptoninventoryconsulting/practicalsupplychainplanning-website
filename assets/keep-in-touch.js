/**
 * Footer "Let's keep in touch" form.
 * Posts to /api/keep-in-touch. The articles sentence is the consent.
 * The beta tick is optional and starts unticked.
 */
(function () {
  "use strict";

  var SUCCESS = "You're on the list.";
  var NEED_EMAIL = "Enter an email address.";
  var CHECK_PENDING = "The check didn't finish. Try again in a moment.";
  var FAILED = "We couldn't add you to the list. Try again in a minute.";

  function emailOk(value) {
    var address = String(value || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) && address.length <= 254;
  }

  function readUtm() {
    var params = new URLSearchParams(window.location.search);
    function pick(name) {
      var value = params.get(name);
      if (!value) {
        return null;
      }
      return value.slice(0, 120);
    }
    return {
      source: pick("utm_source"),
      medium: pick("utm_medium"),
      campaign: pick("utm_campaign"),
      term: pick("utm_term"),
      content: pick("utm_content"),
    };
  }

  function textOf(node) {
    return node && node.textContent ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  var root = document.getElementById("keep-in-touch");
  if (!root) {
    return;
  }
  var form = root.querySelector("form");
  var email = root.querySelector('[name="email"]');
  var beta = root.querySelector('[name="beta"]');
  var company = root.querySelector('[name="company"]');
  var send = root.querySelector("button");
  var status = root.querySelector(".keep-in-touch__status");
  var sent = root.querySelector(".keep-in-touch__sent");
  var consent = root.querySelector(".keep-in-touch__consent");
  var betaLabel = root.querySelector(".keep-in-touch__beta");
  var turnstileSlot = root.querySelector(".sim-turnstile");
  var widgetId = null;
  var latestToken = "";
  var waitTimer = null;
  var resetting = false;

  function turnstileRenderable() {
    return Boolean(window.turnstile && typeof window.turnstile.render === "function");
  }

  function renderWidget() {
    if (!turnstileSlot || widgetId !== null || !turnstileRenderable()) {
      return;
    }
    var sitekey = turnstileSlot.getAttribute("data-sitekey");
    if (!sitekey) {
      return;
    }
    widgetId = window.turnstile.render(turnstileSlot, {
      sitekey: sitekey,
      size: "flexible",
      callback: function (token) {
        latestToken = token || "";
      },
      "expired-callback": function () {
        latestToken = "";
        resetWidget();
      },
      "error-callback": function () {
        latestToken = "";
        resetWidget();
      },
    });
  }

  function whenTurnstile(done) {
    if (turnstileRenderable()) {
      done();
      return;
    }
    var queue = window.pscpTurnstileQueue;
    if (queue && typeof queue.push === "function") {
      queue.push(function () {
        if (turnstileRenderable()) {
          done();
        }
      });
    }
    if (waitTimer !== null) {
      return;
    }
    var tries = 0;
    waitTimer = setInterval(function () {
      tries += 1;
      if (turnstileRenderable()) {
        clearInterval(waitTimer);
        waitTimer = null;
        done();
      } else if (tries > 50) {
        clearInterval(waitTimer);
        waitTimer = null;
      }
    }, 100);
  }

  function currentToken() {
    if (window.turnstile && widgetId !== null && typeof window.turnstile.getResponse === "function") {
      var value = window.turnstile.getResponse(widgetId) || "";
      if (value) {
        latestToken = value;
        return value;
      }
      latestToken = "";
    } else if (latestToken) {
      return latestToken;
    }
    var input = root.querySelector('[name="cf-turnstile-response"]');
    return input && input.value ? input.value : "";
  }

  function resetWidget() {
    latestToken = "";
    if (resetting || !window.turnstile || widgetId === null || typeof window.turnstile.reset !== "function") {
      return;
    }
    resetting = true;
    try {
      window.turnstile.reset(widgetId);
    } finally {
      resetting = false;
    }
  }

  function showError(message) {
    status.textContent = message;
    send.removeAttribute("data-busy");
    send.disabled = false;
    resetWidget();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (send.getAttribute("data-busy") === "1") {
      return;
    }
    if (!emailOk(email.value)) {
      status.textContent = NEED_EMAIL;
      return;
    }
    var token = currentToken();
    if (!token) {
      status.textContent = CHECK_PENDING;
      if (widgetId === null) {
        whenTurnstile(renderWidget);
      } else {
        resetWidget();
      }
      return;
    }
    send.setAttribute("data-busy", "1");
    send.disabled = true;
    status.textContent = "";
    fetch("/api/keep-in-touch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(email.value).trim(),
        betaConsent: beta.checked === true,
        company: company.value,
        turnstileToken: token,
        pageUrl: window.location.origin + window.location.pathname + window.location.search,
        utm: readUtm(),
        wordingVersion: "keep-in-touch-v1",
        wordingText: {
          articles: textOf(consent),
          beta: textOf(betaLabel),
        },
        formId: "keep-in-touch",
      }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          form.hidden = true;
          sent.hidden = false;
          sent.textContent = SUCCESS;
          return;
        }
        showError((result.data && result.data.error) || FAILED);
      })
      .catch(function () {
        showError(FAILED);
      });
  });

  whenTurnstile(renderWidget);
})();
