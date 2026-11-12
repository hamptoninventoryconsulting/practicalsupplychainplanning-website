function publishedFaqItems(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map(function (item) {
      return {
        question: String(item && item.question != null ? item.question : "").trim(),
        answer: String(item && item.answer != null ? item.answer : "").trim(),
      };
    })
    .filter(function (item) {
      return item.question && item.answer;
    });
}

function plainParagraphs(value) {
  const text = String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
  if (!text) {
    return [];
  }
  return text
    .split(/\n\s*\n/)
    .map(function (part) {
      return part.replace(/\s*\n\s*/g, " ").trim();
    })
    .filter(Boolean);
}

const SITE_ORIGIN = "https://practicalsupplychainplanning.com";
const INLINE_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`/g;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkHtml(label, url) {
  let href = url;
  let attrs = "";
  if (url === SITE_ORIGIN || url.startsWith(SITE_ORIGIN + "/")) {
    href = url.slice(SITE_ORIGIN.length) || "/";
  } else {
    attrs = ' rel="noopener noreferrer" target="_blank"';
  }
  return '<a href="' + escapeHtml(href) + '"' + attrs + ">" + escapeHtml(label) + "</a>";
}

function faqInline(value) {
  const text = String(value == null ? "" : value);
  let html = "";
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let match = INLINE_RE.exec(text);
  while (match) {
    html += escapeHtml(text.slice(last, match.index));
    if (match[1] != null) {
      html += linkHtml(match[1], match[2]);
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(match[3])) {
      const email = escapeHtml(match[3]);
      html += '<a class="support-email" href="mailto:' + email + '">' + email + "</a>";
    } else {
      html += escapeHtml(match[3]);
    }
    last = match.index + match[0].length;
    match = INLINE_RE.exec(text);
  }
  html += escapeHtml(text.slice(last));
  return html;
}

function faqPlainText(value) {
  return String(value == null ? "" : value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

module.exports = {
  publishedFaqItems: publishedFaqItems,
  plainParagraphs: plainParagraphs,
  faqInline: faqInline,
  faqPlainText: faqPlainText,
};
