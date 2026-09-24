const SITE_URL = "https://practicalsupplychainplanning.com";

module.exports = {
  layout: "layouts/article.njk",
  tags: ["post"],
  nav: "blog",
  og: true,
  deferScripts: ["/assets/article.js?v=3"],
  eleventyComputed: {
    permalink: (data) => `/blog/${data.page.fileSlug}/`,
    canonical: (data) => `${SITE_URL}/blog/${data.page.fileSlug}/`,
    description: (data) => data.description || data.summary,
    schemaJson: (data) => {
      const slug = data.page.fileSlug;
      const featured = `${SITE_URL}/images/${data.featured_image}`;
      const schemaImage = data.schema_image
        ? `${SITE_URL}/images/${data.schema_image}`
        : featured;
      return JSON.stringify(
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: data.title,
          description: data.summary,
          author: {
            "@type": "Person",
            name: data.author,
          },
          publisher: {
            "@type": "Organization",
            name: data.publisher || "Practical Supply Chain Planning",
          },
          datePublished: data.published_datetime,
          inLanguage: data.in_language || "English",
          keywords: data.keywords,
          image: schemaImage,
          mainEntityOfPage: `${SITE_URL}/blog/${slug}/`,
          about: data.about,
        },
        null,
        2
      );
    },
  },
};
