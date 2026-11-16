module.exports = {
  eleventyComputed: {
    schemaJson: function () {
      return JSON.stringify(
        {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: "Practical Stock Planner: See Shortages Before They Happen (2-Minute Overview)",
          description:
            "A two-minute overview of Practical Stock Planner, a Windows desktop app that projects stock period by period and shows shortages before they happen.",
          thumbnailUrl: "https://i.ytimg.com/vi/LakHyJ3b7Mk/hqdefault.jpg",
          uploadDate: "2026-11-16",
          embedUrl: "https://www.youtube-nocookie.com/embed/LakHyJ3b7Mk",
        },
        null,
        2
      ).replace(/</g, "\\u003c");
    },
  },
};
