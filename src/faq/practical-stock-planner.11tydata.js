const { faqPageSchema, publishedFaqItems } = require("../../scripts/faq-items");

module.exports = {
  eleventyComputed: {
    stockPlannerFaqItems: function (data) {
      return publishedFaqItems(data.stockPlannerFaq);
    },
    schemaJson: function (data) {
      return faqPageSchema(data.stockPlannerFaq);
    },
  },
};
