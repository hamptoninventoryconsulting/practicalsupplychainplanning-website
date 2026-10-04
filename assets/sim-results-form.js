/**
 * Results-email panel. data-results-email="on" lets Send call the server.
 * A preview host can still show the panel when the switch is off.
 * The reopen link is supplied by the page from the current controls.
 * The Turnstile widget is rendered when the panel is shown.
 */
(function () {
  "use strict";

  var SUCCESS = "Sent. Check your inbox (and spam folder).";
  var UNAVAILABLE = "This form is not available yet.";
  var NEED_EMAIL = "Enter an email address.";
  var CHECK_PENDING = "The check didn't finish. Try again in a moment.";

  function sendingOn(root) {
    return root.getAttribute("data-results-email") === "on";
  }

  function panelAvailable(root) {
    if (!root) {
      return false;
    }
    if (sendingOn(root)) {
      return true;
    }
    return /\.pages\.dev$/i.test(window.location.hostname);
  }

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

  function snapshotChart(svg) {
    return new Promise(function (resolve) {
      if (!svg || !svg.querySelector("path")) {
        resolve("");
        return;
      }
      try {
        var xml = new XMLSerializer().serializeToString(svg);
        var blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var image = new Image();
        image.onload = function () {
          var canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 260;
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 640, 260);
          ctx.drawImage(image, 0, 0, 640, 260);
          URL.revokeObjectURL(url);
          var data = canvas.toDataURL("image/png");
          var comma = data.indexOf(",");
          resolve(comma === -1 ? "" : data.slice(comma + 1));
        };
        image.onerror = function () {
          URL.revokeObjectURL(url);
          resolve("");
        };
        image.src = url;
      } catch (err) {
        resolve("");
      }
    });
  }

  function attach(options) {
    var root = document.getElementById(options.id);
    var idle = { show: function () {}, hide: function () {} };
    if (!root || !window.SimResultsForm) {
      return idle;
    }
    var form = root.querySelector("form");
    var email = root.querySelector('[name="email"]');
    var results = root.querySelector('[name="results"]');
    var articles = root.querySelector('[name="articles"]');
    var company = root.querySelector('[name="company"]');
    var send = root.querySelector("button");
    var status = root.querySelector(".sim-results__status");
    var sent = root.querySelector(".sim-results__sent");
    var turnstileSlot = root.querySelector(".sim-turnstile");
    var widgetId = null;
    var latestToken = "";
    var waitTimer = null;
    var resetting = false;
    var allowed = panelAvailable(root);

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
        appearance: "interaction-only",
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

    function rerunCheck() {
      if (widgetId === null) {
        whenTurnstile(renderWidget);
        return;
      }
      resetWidget();
    }

    function syncButton() {
      send.disabled = !results.checked || send.getAttribute("data-busy") === "1";
    }

    results.addEventListener("change", syncButton);

    function hide() {
      root.hidden = true;
      status.textContent = "";
    }

    function show() {
      if (!allowed) {
        hide();
        return;
      }
      sent.hidden = true;
      form.hidden = false;
      root.hidden = false;
      whenTurnstile(renderWidget);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!results.checked || send.getAttribute("data-busy") === "1") {
        return;
      }
      if (!emailOk(email.value)) {
        status.textContent = NEED_EMAIL;
        return;
      }
      if (!sendingOn(root)) {
        status.textContent = UNAVAILABLE;
        return;
      }
      var token = options.turnstileToken ? options.turnstileToken() : currentToken();
      if (!token) {
        status.textContent = CHECK_PENDING;
        rerunCheck();
        return;
      }
      send.setAttribute("data-busy", "1");
      send.disabled = true;
      status.textContent = "";
      Promise.resolve()
        .then(function () {
          return options.buildSummary();
        })
        .then(function (summary) {
          if (!summary || !summary.reopenUrl) {
            throw new Error("summary");
          }
          return fetch("/api/results-email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: String(email.value).trim(),
              resultsConsent: true,
              articlesConsent: articles.checked === true,
              company: company.value,
              turnstileToken: token,
              pageUrl: window.location.origin + window.location.pathname + window.location.search,
              utm: readUtm(),
              wordingVersion: "sim-results-v1",
              wordingText: {
                required: "Email me the results of the scenario I ran. This is a one-off email.",
                optional: "Also send me new articles from Practical Supply Chain Planning. Unsubscribe any time.",
              },
              formId: options.formId,
              summary: summary,
            }),
          });
        })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          send.removeAttribute("data-busy");
          syncButton();
          if (result.ok && result.data && result.data.ok) {
            form.hidden = true;
            sent.hidden = false;
            sent.textContent = SUCCESS;
            var frame = document.createElement("iframe");
            frame.hidden = true;
            frame.setAttribute("title", "Sent");
            frame.src = "/learn/safety-stock-simulator/sent/";
            root.appendChild(frame);
            return;
          }
          resetWidget();
          status.textContent =
            (result.data && result.data.error) || "We couldn't send that. Try again in a minute.";
        })
        .catch(function () {
          send.removeAttribute("data-busy");
          syncButton();
          resetWidget();
          status.textContent = "We couldn't send that. Try again in a minute.";
        });
    });

    if (!allowed) {
      hide();
    }
    return { show: show, hide: hide };
  }

  window.SimResultsForm = {
    attach: attach,
    panelAvailable: panelAvailable,
    snapshotChart: snapshotChart,
    emailOk: emailOk,
  };
})();
