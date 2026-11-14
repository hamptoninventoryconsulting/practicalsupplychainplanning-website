const { faqPageSchema, publishedFaqItems } = require("../scripts/faq-items");

module.exports = {
  eleventyComputed: {
    faqItems: function (data) {
      return publishedFaqItems(data.faq);
    },
    schemaJson: function (data) {
      return faqPageSchema(data.faq);
    },
  },
};
