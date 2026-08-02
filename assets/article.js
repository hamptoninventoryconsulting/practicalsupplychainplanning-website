(function () {
  "use strict";

  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  function formatPublishedDate(raw) {
    if (!raw) {
      return "";
    }

    var match = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      var year = Number(match[1]);
      var monthIndex = Number(match[2]) - 1;
      var day = Number(match[3]);

      return day + " " + MONTHS[monthIndex] + " " + year;
    }

    var date = new Date(String(raw).trim());

    if (Number.isNaN(date.getTime())) {
      return String(raw).trim();
    }

    return (
      date.getDate() +
      " " +
      MONTHS[date.getMonth()] +
      " " +
      date.getFullYear()
    );
  }

  function formatReadingTime(raw) {
    if (!raw) {
      return "";
    }

    var text = String(raw).trim();
    var match = text.match(/(\d+)/);

    if (match) {
      return match[1] + " min read";
    }

    return text;
  }

  function toIsoDate(raw) {
    var match = String(raw || "").match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  function renderMeta(meta) {
    var published = formatPublishedDate(meta.getAttribute("data-published"));
    var reading = formatReadingTime(meta.getAttribute("data-reading-time"));
    var author = (meta.getAttribute("data-author") || "").trim();
    var parts = [];

    if (published) {
      var time = document.createElement("time");
      time.className = "article-meta__item";
      time.dateTime = toIsoDate(meta.getAttribute("data-published"));
      time.textContent = published;
      parts.push(time);
    }

    if (reading) {
      var readingEl = document.createElement("span");
      readingEl.className = "article-meta__item";
      readingEl.textContent = reading;
      parts.push(readingEl);
    }

    if (author) {
      var authorEl = document.createElement("span");
      authorEl.className = "article-meta__item";
      authorEl.textContent = author;
      parts.push(authorEl);
    }

    meta.textContent = "";

    parts.forEach(function (part, index) {
      if (index > 0) {
        var sep = document.createElement("span");
        sep.className = "article-meta__sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "•";
        meta.appendChild(sep);
      }
      meta.appendChild(part);
    });
  }

  function currentUrl() {
    return window.location.href.split("#")[0];
  }

  function currentTitle() {
    var heading = document.querySelector(".article-header .page-title");
    return heading ? heading.textContent.trim() : document.title;
  }

  function setupShareLinks() {
    var url = encodeURIComponent(currentUrl());
    var title = encodeURIComponent(currentTitle());
    var text = encodeURIComponent(currentTitle() + " " + currentUrl());

    var linkedIn = document.querySelector('[data-share="linkedin"]');
    var x = document.querySelector('[data-share="x"]');
    var email = document.querySelector('[data-share="email"]');
    var whatsapp = document.querySelector('[data-share="whatsapp"]');

    if (linkedIn) {
      linkedIn.href =
        "https://www.linkedin.com/sharing/share-offsite/?url=" + url;
    }

    if (x) {
      x.href = "https://twitter.com/intent/tweet?url=" + url + "&text=" + title;
    }

    if (email) {
      email.href =
        "mailto:?subject=" + title + "&body=" + encodeURIComponent(currentUrl());
    }

    if (whatsapp) {
      whatsapp.href = "https://wa.me/?text=" + text;
    }
  }

  function setupCopyLink() {
    var button = document.getElementById("copy-link-button");
    var feedback = document.getElementById("copy-link-feedback");

    if (!button || !feedback) {
      return;
    }

    var hideTimer = null;

    function showCopied() {
      feedback.hidden = false;
      feedback.textContent = "Link copied";

      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }

      hideTimer = window.setTimeout(function () {
        feedback.hidden = true;
      }, 2000);
    }

    button.addEventListener("click", function () {
      var url = currentUrl();

      function finish(success) {
        if (success) {
          showCopied();
        }
      }

      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function" &&
        window.isSecureContext
      ) {
        navigator.clipboard.writeText(url).then(
          function () {
            finish(true);
          },
          function () {
            finish(fallbackCopy(url));
          }
        );
        return;
      }

      finish(fallbackCopy(url));
    });
  }

  function fallbackCopy(text) {
    var input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.top = "0";
    input.style.left = "0";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, text.length);

    var success = false;

    try {
      success = document.execCommand("copy");
    } catch (error) {
      success = false;
    }

    document.body.removeChild(input);
    return success;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var meta = document.getElementById("article-meta");

    if (meta) {
      renderMeta(meta);
    }

    setupShareLinks();
    setupCopyLink();
  });
})();
