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

module.exports = {
  publishedFaqItems: publishedFaqItems,
  plainParagraphs: plainParagraphs,
};
