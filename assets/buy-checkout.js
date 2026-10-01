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

  function teamOpen() {
    return !!(teamToggle && teamToggle.getAttribute("aria-expanded") === "true");
  }

  /**
   * Seat count for this checkout. Closing "Buying for a team?" selects 1.
   * Blank, fractional, and out-of-range entries also select 1.
   */
  function getSelectedUsers(commit) {
    if (!teamOpen()) {
      if (userCount) {
        userCount.value = String(MIN_USERS);
      }
      return MIN_USERS;
    }
    var count = userCount ? parseUserCount(userCount.value) : null;
    if (count === null) {
      count = MIN_USERS;
    }
    if (commit && userCount) {
      userCount.value = String(count);
    }
    return count;
  }

  /**
   * Display copy only. The count comes from getSelectedUsers().
   * A later Paddle discount can return different copy for that same count,
   * for example "3 users: US$99/month (save US$48)".
   */
  function quoteForUsers(users) {
    var unitUsd = 49;
    var listMonthlyUsd = unitUsd * users;
    var people = users === 1 ? "1 user" : users + " users";
    return (
      people +
      " × US$" +
      unitUsd +
      "/month = US$" +
      listMonthlyUsd +
      "/month (plus any applicable tax)"
    );
  }

  function showQuote(users) {
    var text = quoteForUsers(users);
    if (totalEl && totalEl.textContent !== text) {
      totalEl.textContent = text;
    }
    if (standaloneNote) {
      standaloneNote.hidden = users < 2;
    }
    if (userCount && licenceNote) {
      userCount.setAttribute(
        "aria-describedby",
        users < 2 ? "licence-note" : "licence-note standalone-note"
      );
    }
  }

  if (teamToggle && userField) {
    teamToggle.addEventListener("click", function () {
      var expanded = teamToggle.getAttribute("aria-expanded") === "true";
      var next = !expanded;
      teamToggle.setAttribute("aria-expanded", next ? "true" : "false");
      userField.hidden = !next;
      showQuote(getSelectedUsers(true));
      if (next && userCount) {
        userCount.focus();
      }
    });
  }

  if (userCount) {
    userCount.addEventListener("input", function () {
      var raw = String(userCount.value);
      if (parseUserCount(raw) === null && raw.trim() !== "") {
        userCount.value = String(MIN_USERS);
      }
      // Blank counts select 1 immediately. Waiting for blur hides the
      // stand-alone note under the pointer, and the Checkout click misses.
      showQuote(getSelectedUsers(false));
    });
    userCount.addEventListener("change", function () {
      showQuote(getSelectedUsers(true));
    });
    userCount.addEventListener("blur", function () {
      showQuote(getSelectedUsers(true));
    });
    userCount.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
      },
      { passive: false }
    );
  }

  showQuote(getSelectedUsers(false));

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
      var quantity = getSelectedUsers(true);
      showQuote(quantity);
      var customData = { campaign: campaignId };
      params.forEach(function (value, key) {
        if (key.indexOf("utm_") === 0 && value) {
          customData[key] = String(value).slice(0, 100);
        }
      });
      var openArgs = {
        items: [{ priceId: campaign.priceId, quantity: quantity }],
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
