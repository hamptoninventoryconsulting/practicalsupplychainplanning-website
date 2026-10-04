/**
 * Overlay checkout for /pricing/.
 * Uses the same Paddle config as /buy/ (src/_data/paddle.js).
 * Quantity is fixed at 1. No discount is applied.
 */
(function () {
  var button = document.getElementById("trial-button");
  var note = document.getElementById("trial-note");
  var loadNote = document.getElementById("trial-load-note");
  var configEl = document.getElementById("paddle-config");

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
    button.setAttribute("aria-describedby", "trial-consent trial-load-note");
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

  var campaign =
    config && config.campaigns && config.campaigns.default
      ? config.campaigns.default
      : null;
  var ready =
    config &&
    !isPlaceholder(config.clientToken) &&
    !isPlaceholder(config.successUrl) &&
    campaign &&
    !isPlaceholder(campaign.priceId);

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
      var customData = { campaign: "default" };
      var params = new URLSearchParams(window.location.search);
      params.forEach(function (value, key) {
        if (key.indexOf("utm_") === 0 && value) {
          customData[key] = String(value).slice(0, 100);
        }
      });
      window.Paddle.Checkout.open({
        items: [{ priceId: campaign.priceId, quantity: 1 }],
        customData: customData,
        settings: {
          successUrl: config.successUrl,
          displayMode: "overlay",
        },
      });
    } catch (error) {
      showUnconfigured();
    }
  });
})();
