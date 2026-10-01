(function () {
  var button = document.getElementById("checkout-button");
  var note = document.getElementById("checkout-note");
  var loadNote = document.getElementById("checkout-load-note");
  var configEl = document.getElementById("paddle-config");
  var totalEl = document.getElementById("checkout-total");
  var standaloneNote = document.getElementById("standalone-note");
  var licenceNote = document.getElementById("licence-note");
  var teamToggle = document.getElementById("team-toggle");
  var userField = document.getElementById("user-count-field");
  var userCount = document.getElementById("user-count");

  var MIN_USERS = 1;
  var MAX_USERS = 10;

  /**
   * Display quote for a number of users.
   *
   * quantity is the Paddle seat count (one user, one computer). A later
   * multi-user Paddle discount replaces `text` only and leaves quantity
   * equal to the user count, for example:
   * "3 users: US$99/month (save US$48)"
   */
  function quoteForUsers(users) {
    var count = users;
    var unitUsd = 49;
    var listMonthlyUsd = unitUsd * count;
    var people = count === 1 ? "1 user" : count + " users";
    return {
      quantity: count,
      text: people + " × US$" + unitUsd + "/month = US$" + listMonthlyUsd + "/month",
    };
  }

  function parseUserCount(raw) {
    var text = String(raw == null ? "" : raw).trim();
    if (!/^[0-9]+$/.test(text)) {
      return null;
    }
    var count = parseInt(text, 10);
    if (count < MIN_USERS || count > MAX_USERS) {
      return null;
    }
    return count;
  }

  function renderQuote(count) {
    var quote = quoteForUsers(count);
    if (totalEl && totalEl.textContent !== quote.text) {
      totalEl.textContent = quote.text;
    }
    if (standaloneNote) {
      standaloneNote.hidden = quote.quantity < 2;
    }
    if (userCount && licenceNote) {
      userCount.setAttribute(
        "aria-describedby",
        quote.quantity < 2 ? "licence-note" : "licence-note standalone-note"
      );
    }
    return quote;
  }

  function readUserCount(commit) {
    var count = userCount ? parseUserCount(userCount.value) : MIN_USERS;
    if (count === null) {
      count = MIN_USERS;
    }
    if (commit && userCount) {
      userCount.value = String(count);
    }
    return count;
  }

  function refreshQuote(commit) {
    return renderQuote(readUserCount(commit));
  }

  if (teamToggle && userField) {
    teamToggle.addEventListener("click", function () {
      var expanded = teamToggle.getAttribute("aria-expanded") === "true";
      var next = !expanded;
      teamToggle.setAttribute("aria-expanded", next ? "true" : "false");
      userField.hidden = !next;
      if (next && userCount) {
        userCount.focus();
      }
    });
  }

  if (userCount) {
    userCount.addEventListener("input", function () {
      var raw = String(userCount.value);
      if (raw.trim() === "") {
        return;
      }
      var count = parseUserCount(raw);
      if (count === null) {
        refreshQuote(true);
        return;
      }
      renderQuote(count);
    });
    userCount.addEventListener("change", function () {
      refreshQuote(true);
    });
    userCount.addEventListener("blur", function () {
      refreshQuote(true);
    });
    userCount.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
      },
      { passive: false }
    );
  }

  refreshQuote(false);

  if (!button || !note || !loadNote || !configEl) {
    return;
  }

  function isPlaceholder(value) {
    return (
      typeof value !== "string" ||
      value.indexOf("REPLACE_ME") !== -1 ||
      value.trim() === ""
    );
  }

  function showUnconfigured() {
    button.disabled = true;
    note.hidden = false;
    loadNote.hidden = true;
  }

  function showLoadFailed() {
    button.disabled = true;
    button.setAttribute("aria-describedby", "checkout-load-note");
    note.hidden = true;
    loadNote.hidden = false;
  }

  var config;
  try {
    config = JSON.parse(configEl.textContent);
  } catch (error) {
    showUnconfigured();
    return;
  }

  var campaigns = config && config.campaigns ? config.campaigns : {};
  var params = new URLSearchParams(window.location.search);
  var requested = params.get("c");
  var campaignId =
    requested && Object.prototype.hasOwnProperty.call(campaigns, requested)
      ? requested
      : "default";
  var campaign = campaigns[campaignId];
  var ready =
    config &&
    !isPlaceholder(config.clientToken) &&
    !isPlaceholder(config.successUrl) &&
    campaign &&
    !isPlaceholder(campaign.priceId) &&
    (!campaign.discountId || !isPlaceholder(campaign.discountId));

  if (!ready) {
    showUnconfigured();
    return;
  }

  if (!window.Paddle || typeof window.Paddle.Initialize !== "function") {
    showLoadFailed();
    return;
  }

  try {
    if (config.environment === "sandbox") {
      window.Paddle.Environment.set("sandbox");
    }
    window.Paddle.Initialize({
      token: config.clientToken,
      checkout: {
        settings: {
          successUrl: config.successUrl,
          displayMode: "overlay",
        },
      },
    });
  } catch (error) {
    showLoadFailed();
    return;
  }

  note.hidden = true;
  button.disabled = false;
  button.addEventListener("click", function () {
    try {
      var quote = refreshQuote(true);
      var customData = { campaign: campaignId };
      params.forEach(function (value, key) {
        if (key.indexOf("utm_") === 0 && value) {
          customData[key] = String(value).slice(0, 100);
        }
      });
      var openArgs = {
        items: [{ priceId: campaign.priceId, quantity: quote.quantity }],
        customData: customData,
        settings: {
          successUrl: config.successUrl,
          displayMode: "overlay",
        },
      };
      if (campaign.discountId) {
        openArgs.discountId = campaign.discountId;
      }
      window.Paddle.Checkout.open(openArgs);
    } catch (error) {
      showUnconfigured();
    }
  });
})();
