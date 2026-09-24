const MONTHS = [
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

module.exports = function (eleventyConfig) {
  // Cloudflare Pages compiles functions/ from the project root (sibling of
  // _site). Do not copy that directory into the static output.
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("_redirects");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy({
    "learn/safety-stock-simulator/scenarios.json":
      "learn/safety-stock-simulator/scenarios.json",
  });
  eleventyConfig.addWatchTarget("assets");

  eleventyConfig.addFilter("isoDate", (value) => String(value || "").slice(0, 10));

  eleventyConfig.addFilter("displayDate", (value) => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return "";
    }
    const month = MONTHS[Number(match[2]) - 1];
    if (!month) {
      return "";
    }
    return `${Number(match[3])} ${month} ${match[1]}`;
  });

  eleventyConfig.addFilter("readingLabel", (value) => {
    const match = String(value || "").match(/(\d+)/);
    return match ? `${match[1]} min read` : "";
  });

  eleventyConfig.addCollection("postsByDate", (collectionApi) => {
    return collectionApi.getFilteredByTag("post").sort((a, b) => {
      return String(b.data.published_datetime || "").localeCompare(
        String(a.data.published_datetime || "")
      );
    });
  });

  return {
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
};
