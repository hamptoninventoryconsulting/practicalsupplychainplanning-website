const { faqPlainText, publishedFaqItems } = require("../scripts/faq-items");

module.exports = {
  eleventyComputed: {
    faqItems: function (data) {
      return publishedFaqItems(data.faq);
    },
    schemaJson: function (data) {
      const items = publishedFaqItems(data.faq);
      if (!items.length) {
        return "";
      }
      return JSON.stringify(
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map(function (item) {
            return {
              "@type": "Question",
              name: item.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faqPlainText(item.answer),
              },
            };
          }),
        },
        null,
        2
      ).replace(/</g, "\\u003c");
    },
  },
};
