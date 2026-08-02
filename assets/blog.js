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
      return Number(match[3]) + " " + MONTHS[Number(match[2]) - 1] + " " + match[1];
    }

    var date = new Date(String(raw).trim());

    if (Number.isNaN(date.getTime())) {
      return "";
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

    var match = String(raw).trim().match(/(\d+)/);
    return match ? match[1] + " min read" : "";
  }

  function toIsoDate(raw) {
    var match = String(raw || "").match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildCard(post) {
    var slug = String(post.slug || "").trim();
    var title = String(post.title || "Untitled").trim();
    var summary = String(post.summary || "").trim();
    var image = String(post.featured_image_filename || "").trim();
    var publishedRaw = String(post.published_datetime || "").trim();
    var published = formatPublishedDate(publishedRaw);
    var reading = formatReadingTime(post.reading_time);
    var href = "/blog/" + encodeURIComponent(slug) + "/";
    var metaParts = [];

    if (published) {
      metaParts.push(
        '<time class="blog-post-card__meta-item" datetime="' +
          escapeHtml(toIsoDate(publishedRaw)) +
          '">' +
          escapeHtml(published) +
          "</time>"
      );
    }

    if (reading) {
      metaParts.push(
        '<span class="blog-post-card__meta-item">' +
          escapeHtml(reading) +
          "</span>"
      );
    }

    var media = image
      ? '<div class="blog-post-card__media">' +
        '<img class="blog-post-card__image" src="/images/' +
        escapeHtml(image) +
        '" alt="" width="240" height="175" loading="lazy" decoding="async" />' +
        "</div>"
      : "";

    return (
      '<a class="blog-post-card" href="' +
      escapeHtml(href) +
      '">' +
      media +
      '<div class="blog-post-card__body">' +
      '<h2 class="blog-post-card__title">' +
      escapeHtml(title) +
      "</h2>" +
      (summary
        ? '<p class="blog-post-card__summary">' + escapeHtml(summary) + "</p>"
        : "") +
      (metaParts.length
        ? '<p class="blog-post-card__meta">' +
          metaParts.join(
            '<span class="blog-post-card__meta-sep" aria-hidden="true">•</span>'
          ) +
          "</p>"
        : "") +
      '<span class="blog-post-card__cta">Read Article →</span>' +
      "</div>" +
      "</a>"
    );
  }

  function renderPosts(container, posts) {
    if (!posts.length) {
      container.innerHTML =
        '<p class="tagline">No articles published yet.</p>';
      return;
    }

    container.innerHTML = posts.map(buildCard).join("");
  }

  function loadReadingTime(post) {
    var slug = String(post.slug || "").trim();

    if (!slug) {
      return Promise.resolve(post);
    }

    return fetch("/blog/" + encodeURIComponent(slug) + "/", {
      credentials: "same-origin",
    })
      .then(function (response) {
        if (!response.ok) {
          return post;
        }

        return response.text().then(function (html) {
          var match = html.match(/data-reading-time="([^"]+)"/i);

          if (match) {
            post.reading_time = match[1];
          }

          return post;
        });
      })
      .catch(function () {
        return post;
      });
  }

  function init() {
    var container = document.getElementById("blog-posts");

    if (!container) {
      return;
    }

    fetch("/blog/.posts.manifest.json", { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Unable to load posts manifest");
        }

        return response.json();
      })
      .then(function (manifest) {
        var posts = Array.isArray(manifest && manifest.posts)
          ? manifest.posts.slice()
          : [];

        posts.sort(function (a, b) {
          return String(b.published_datetime || "").localeCompare(
            String(a.published_datetime || "")
          );
        });

        return Promise.all(posts.map(loadReadingTime)).then(function (enriched) {
          renderPosts(container, enriched);
          container.setAttribute("data-enhanced", "true");
        });
      })
      .catch(function () {
        container.setAttribute("data-enhanced", "fallback");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
