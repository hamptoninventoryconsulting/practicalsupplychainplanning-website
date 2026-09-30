(function () {
  var button = document.getElementById("checkout-button");
  var note = document.getElementById("checkout-note");
  var loadNote = document.getElementById("checkout-load-note");
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
      var customData = { campaign: campaignId };
      params.forEach(function (value, key) {
        if (key.indexOf("utm_") === 0 && value) {
          customData[key] = String(value).slice(0, 100);
        }
      });
      var openArgs = {
        items: [{ priceId: campaign.priceId, quantity: 1 }],
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
