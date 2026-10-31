/**
 * Home page assets. Leave a value as "" until the file or URL exists.
 * Empty values hide that image or link. No placeholder text is shown.
 *
 * Drop files, then set the public path (Eleventy copies assets/ and images/):
 *
 * 1. Daniel's photo (head and shoulders, at least 600×600, plain background)
 *    File: assets/brand/daniel-hampton-home.jpg
 *    Then: photoUrl: "/assets/brand/daniel-hampton-home.jpg"
 *    Do not replace assets/brand/daniel-hampton.png (that is the About page photo).
 *
 * 2. LinkedIn profile URL (no file)
 *    linkedinUrl: "https://www.linkedin.com/in/…"
 *
 * 3. Practical Stock Planner projected stock chart (demo data: stock dips,
 *    a planned order arrives before the shortage). Used in "Why plan ahead?"
 *    and on the Stock Planner card.
 *    File: images/projected-stock-chart.png
 *    Then: heroChartUrl: "/images/projected-stock-chart.png"
 *
 * 4. Social preview, 1200×630, same chart with the headline overlaid.
 *    File: images/og-projected-stock.png
 *    Then: ogImageUrl: "/images/og-projected-stock.png"
 *    If ogImageUrl is empty and heroChartUrl is set, the home preview uses
 *    the chart. If both are empty, the home preview uses the brand logo.
 *
 * 5. Optional Safety Stock Simulator results chart for its card.
 *    File: images/safety-stock-simulator-chart.png
 *    Then: simulatorChartUrl: "/images/safety-stock-simulator-chart.png"
 */
module.exports = {
  photoUrl: "",
  photoAlt: "Daniel Hampton, founder of Practical Supply Chain Planning",
  aboutPhotoAlt: "Daniel Hampton",
  linkedinUrl: "",
  heroChartUrl: "",
  heroChartAlt:
    "Chart of projected stock week by week, with a planned order arriving before stock runs short.",
  stockChartAlt: "Practical Stock Planner projected stock chart.",
  simulatorChartUrl: "",
  simulatorChartAlt: "Safety Stock Simulator results chart.",
  ogImageUrl: "",
};
