/**
 * Overlay checkout for /products/practical-stock-planner/.
 * Uses the Paddle config in src/_data/paddle.js.
 * Quantity is fixed at 1.
 * While checkoutOpen is true, pass one founding code as discountCode.
 * Paddle.Checkout.open accepts discountCode. Do not pass a discount entity id.
 * The page never reads a code from the URL.
 * A flat discount only applies in its own currency. The price-preview
 * currency decides the code: USD gets FOUNDING29, AUD gets FOUNDINGAU, and
 * any other currency opens checkout with no code. If the preview fails, try
 * it once more. If it still fails, open checkout with no code. Never guess
 * the currency from the device time zone.
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

  function foundingCodeForCurrency(currencyCode) {
    if (currencyCode === "USD") {
      return config.foundingDiscountCode;
    }
    if (currencyCode === "AUD") {
      return config.foundingDiscountCodeAud;
    }
    return "";
  }

  function openCheckout(currencyCode) {
    try {
      var customData = { campaign: "default" };
      var params = new URLSearchParams(window.location.search);
      params.forEach(function (value, key) {
        if (key.indexOf("utm_") === 0 && value) {
          customData[key] = String(value).slice(0, 100);
        }
      });
      var checkout = {
        items: [{ priceId: campaign.priceId, quantity: 1 }],
        customData: customData,
        settings: {
          successUrl: config.successUrl,
          displayMode: "overlay",
        },
      };
      var code = foundingCodeForCurrency(currencyCode);
      if (config.checkoutOpen === true && !isPlaceholder(code)) {
        checkout.discountCode = code;
      }
      window.Paddle.Checkout.open(checkout);
    } catch (error) {
      showUnconfigured();
    }
  }

  function currencyFromPreview(preview) {
    var data = preview && (preview.data || preview);
    var currency = data && (data.currencyCode || data.currency_code);
    return typeof currency === "string" ? currency : "";
  }

  function requestPricePreview() {
    return window.Paddle.PricePreview({
      items: [{ priceId: campaign.priceId, quantity: 1 }],
    });
  }

  function previewThenOpen(attemptsLeft) {
    requestPricePreview()
      .then(function (preview) {
        button.disabled = false;
        openCheckout(currencyFromPreview(preview));
      })
      .catch(function () {
        if (attemptsLeft > 1) {
          previewThenOpen(attemptsLeft - 1);
          return;
        }
        button.disabled = false;
        openCheckout("");
      });
  }

  note.hidden = true;
  button.disabled = false;
  button.addEventListener("click", function () {
    if (
      config.checkoutOpen !== true ||
      typeof window.Paddle.PricePreview !== "function"
    ) {
      openCheckout("");
      return;
    }
    button.disabled = true;
    previewThenOpen(2);
  });
})();
