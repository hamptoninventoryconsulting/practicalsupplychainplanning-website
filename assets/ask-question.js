/**
 * FAQ "Ask a question" form.
 * Posts to /api/ask. The server emails support@ and sets Reply-To to the asker.
 * No acknowledgement email is sent to the asker.
 */
(function () {
  "use strict";

  var NEED_EMAIL = "Enter an email address.";
  var NEED_TOPIC = "Choose a topic.";
  var NEED_QUESTION = "Enter your question.";
  var CHECK_PENDING = "The check didn't finish. Try again in a moment.";
  var FAILED = "We couldn't send that. Try again in a minute.";

  function emailOk(value) {
    var address = String(value || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) && address.length <= 254;
  }

  var form = document.getElementById("ask-question");
  if (!form) {
    return;
  }
  var name = form.querySelector('[name="name"]');
  var email = form.querySelector('[name="email"]');
  var topic = form.querySelector('[name="topic"]');
  var question = form.querySelector('[name="question"]');
  var company = form.querySelector('[name="company"]');
  var send = form.querySelector("button");
  var status = document.getElementById("ask-status");
  var sent = document.getElementById("ask-sent");
  var turnstileSlot = form.querySelector(".sim-turnstile");
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
    var input = form.querySelector('[name="cf-turnstile-response"]');
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
    if (!topic.value) {
      status.textContent = NEED_TOPIC;
      return;
    }
    var asked = String(question.value || "").trim();
    if (!asked) {
      status.textContent = NEED_QUESTION;
      return;
    }
    if (asked.length > 4000) {
      status.textContent = "Check the form and try again.";
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
    fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(name.value || "").trim(),
        email: String(email.value).trim(),
        topic: topic.value,
        question: asked,
        company: company.value,
        turnstileToken: token,
        pageUrl: window.location.origin + window.location.pathname + window.location.search,
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
