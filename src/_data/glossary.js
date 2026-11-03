/**
 * Planning glossary for /learn/glossary/.
 * General planning terms only. Groups stay in this order.
 * Terms are sorted A–Z by display name when the page is built.
 * Entry wording lives in glossaryCopy.json: general planning text from the
 * app glossaries. App-specific entries and sections are not included.
 */
"use strict";

const COPY = require("./glossaryCopy.json");

const SITE = "https://practicalsupplychainplanning.com/learn/glossary/";

const GROUPS = [
  {
    id: "supply-and-ordering",
    title: "Supply & ordering",
    terms: [
      {
        id: "expedite-reschedule",
        term: "Expedite / reschedule",
        usedIn: ["Stock Planner"],
        seeAlso: ["supply-order", "planned-order", "past-due"],
      },
      {
        id: "lot-size",
        term: "Lot size",
        usedIn: ["Stock Planner"],
        seeAlso: ["minimum-order-quantity", "planned-order", "inventory-turns"],
      },
      {
        id: "minimum-order-quantity",
        term: "Minimum order quantity (MOQ)",
        usedIn: ["Stock Planner"],
        seeAlso: ["lot-size", "minimum-order-value", "planned-order"],
      },
      {
        id: "minimum-order-value",
        term: "Minimum order value (MOV)",
        usedIn: ["Stock Planner"],
        seeAlso: ["minimum-order-quantity", "planned-order", "supply-order"],
      },
      {
        id: "mrp",
        term: "MRP",
        usedIn: ["Stock Planner"],
        seeAlso: ["time-phased-planning", "projected-stock", "planned-order"],
      },
      {
        id: "past-due",
        term: "Past-due",
        usedIn: ["Stock Planner"],
        seeAlso: ["supply-order", "expedite-reschedule", "projected-stock"],
      },
      {
        id: "planned-order",
        term: "Planned order",
        usedIn: ["Stock Planner"],
        seeAlso: ["projected-stock", "supply-lead-time", "safety-stock"],
      },
      {
        id: "supply-lead-time",
        term: "Supply lead time",
        usedIn: ["Stock Planner"],
        seeAlso: ["planned-order", "time-phased-planning", "supply-order"],
      },
      {
        id: "supply-order",
        term: "Supply order",
        usedIn: ["Stock Planner"],
        seeAlso: ["planned-order", "past-due", "projected-stock"],
      },
      {
        id: "time-phased-planning",
        term: "Time-phased planning",
        usedIn: ["Stock Planner"],
        seeAlso: ["projected-stock", "planned-order", "mrp"],
      },
      {
        id: "unit-of-measure",
        term: "Unit of measure (UoM)",
        usedIn: ["Stock Planner"],
        seeAlso: ["projected-stock", "minimum-order-quantity", "forecast"],
      },
    ],
  },
  {
    id: "stock-and-service",
    title: "Stock & service",
    terms: [
      {
        id: "customer-service-level",
        term: "Customer service level",
        usedIn: ["Stock Planner"],
        seeAlso: ["safety-stock", "inventory-turns", "forecast-reliability"],
      },
      {
        id: "inventory-turns",
        term: "Inventory turns",
        usedIn: ["Stock Planner"],
        seeAlso: ["lot-size", "safety-stock", "customer-service-level"],
      },
      {
        id: "projected-stock",
        term: "Projected stock",
        usedIn: ["Stock Planner"],
        seeAlso: ["time-phased-planning", "planned-order", "safety-stock"],
      },
      {
        id: "safety-stock",
        term: "Safety stock",
        usedIn: ["Stock Planner"],
        seeAlso: ["projected-stock", "planned-order", "customer-service-level"],
      },
      {
        id: "slow-mover",
        term: "Slow mover / SLOB",
        usedIn: ["Stock Planner"],
        seeAlso: ["inventory-turns", "forecast", "projected-stock"],
      },
    ],
  },
  {
    id: "demand-and-forecasting",
    title: "Demand & forecasting",
    terms: [
      {
        id: "exception-outlier",
        term: "Exception / outlier",
        usedIn: ["Demand Planner"],
        seeAlso: ["sales-history", "intermittent-demand", "forecast"],
      },
      {
        id: "forecast",
        term: "Forecast",
        usedIn: ["Stock Planner", "Demand Planner"],
        seeAlso: ["forecast-horizon", "sales-history", "forecast-reliability"],
      },
      {
        id: "forecast-horizon",
        term: "Forecast horizon",
        usedIn: ["Demand Planner"],
        seeAlso: ["forecast", "supply-lead-time", "time-phased-planning"],
      },
      {
        id: "forecast-reliability",
        term: "Forecast reliability",
        usedIn: ["Demand Planner"],
        seeAlso: ["forecast", "safety-stock", "customer-service-level"],
      },
      {
        id: "intermittent-demand",
        term: "Intermittent demand",
        usedIn: ["Demand Planner"],
        seeAlso: ["exception-outlier", "forecast", "sales-history"],
      },
      {
        id: "sales-history",
        term: "Sales history",
        usedIn: ["Demand Planner"],
        seeAlso: ["exception-outlier", "forecast", "unit-of-measure"],
      },
      {
        id: "sku-forecasting-group",
        term: "SKU forecasting group",
        usedIn: ["Demand Planner"],
        seeAlso: ["forecast", "sales-history", "exception-outlier"],
      },
    ],
  },
];

const BANNED = [
  { label: "reorder point", re: /reorder point|\breorder\b|\bre-order\b|\bROP\b/i },
  { label: "min-max", re: /min-?max|minmax/i },
  { label: "Croston", re: /croston/i },
  { label: "Excel", re: /\bexcel\b/i },
  { label: "numbered option", re: /option\s*[123]/i },
  { label: "4-4-5", re: /4-4-5/ },
  { label: "product name in the body", re: /stock planner|demand planner/i },
];

function sortTerms(terms) {
  return terms.slice().sort(function (a, b) {
    return a.term.localeCompare(b.term, "en", { sensitivity: "base" });
  });
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(
      /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g,
      '<a href="$2">$1</a>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function applyCopy(term) {
  const copy = COPY[term.id];
  if (!copy) {
    throw new Error("Missing glossary copy for " + term.id);
  }
  return Object.assign({}, term, copy);
}

function decorate(term) {
  if (!term.sections) {
    return term;
  }
  return Object.assign({}, term, {
    sections: term.sections.map(function (section) {
      return Object.assign({}, section, {
        blocks: section.blocks.map(function (block) {
          if (block.type === "ul") {
            return Object.assign({}, block, {
              html: block.items.map(formatInline),
            });
          }
          return Object.assign({}, block, {
            html: formatInline(block.text),
          });
        }),
      });
    }),
  });
}

function termBody(term) {
  const chunks = [];
  if (term.definition) {
    chunks.push(term.definition);
  }
  if (term.example) {
    chunks.push(term.example);
  }
  if (term.why) {
    chunks.push(term.why);
  }
  (term.points || []).forEach(function (point) {
    chunks.push(point.label + " " + point.text);
  });
  (term.sections || []).forEach(function (section) {
    if (section.heading) {
      chunks.push(section.heading);
    }
    (section.blocks || []).forEach(function (block) {
      if (block.text) {
        chunks.push(block.text);
      }
      (block.items || []).forEach(function (item) {
        chunks.push(item);
      });
    });
  });
  return chunks.join("\n");
}

function validate(groups) {
  const seen = new Set();
  const ids = [];
  groups.forEach(function (group) {
    group.terms.forEach(function (term) {
      if (!term.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(term.id)) {
        throw new Error("Bad glossary id: " + term.id);
      }
      if (seen.has(term.id)) {
        throw new Error("Duplicate glossary id: " + term.id);
      }
      seen.add(term.id);
      ids.push(term.id);
      if (!term.definition) {
        throw new Error("Glossary term is missing a definition: " + term.id);
      }
      if (term.sections) {
        const hasBlock = term.sections.some(function (section) {
          return section.blocks && section.blocks.length;
        });
        if (!hasBlock) {
          throw new Error("Glossary term has no body: " + term.id);
        }
      }
      const body = termBody(term);
      BANNED.forEach(function (rule) {
        if (rule.re.test(body)) {
          throw new Error("Glossary term " + term.id + " hits banned copy: " + rule.label);
        }
      });
      (term.usedIn || []).forEach(function (name) {
        if (name !== "Stock Planner" && name !== "Demand Planner") {
          throw new Error("Unexpected Used in value on " + term.id + ": " + name);
        }
      });
      if (!term.usedIn || !term.usedIn.length) {
        throw new Error("Glossary term is missing Used in: " + term.id);
      }
    });
  });
  groups.forEach(function (group) {
    group.terms.forEach(function (term) {
      (term.seeAlso || []).forEach(function (id) {
        if (!seen.has(id)) {
          throw new Error(term.id + " seeAlso missing " + id);
        }
      });
    });
  });
  const copyIds = Object.keys(COPY);
  copyIds.forEach(function (id) {
    if (!seen.has(id)) {
      throw new Error("Glossary copy has no term: " + id);
    }
  });
  if (seen.size !== copyIds.length) {
    throw new Error("Glossary term count does not match copy");
  }
  return ids;
}

const groups = GROUPS.map(function (group) {
  return {
    id: group.id,
    title: group.title,
    terms: sortTerms(group.terms).map(applyCopy),
  };
});

validate(groups);

const renderedGroups = groups.map(function (group) {
  return {
    id: group.id,
    title: group.title,
    terms: group.terms.map(decorate),
  };
});

const byId = {};
renderedGroups.forEach(function (group) {
  group.terms.forEach(function (term) {
    byId[term.id] = term;
  });
});

const schema = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: "Planning glossary",
  description:
    "Plain-English definitions of safety stock, lead time, MOQ, forecasting and more, from a working supply chain planner.",
  url: SITE,
  hasDefinedTerm: renderedGroups.flatMap(function (group) {
    return group.terms.map(function (term) {
      return {
        "@type": "DefinedTerm",
        name: term.term,
        description: term.definition,
        url: SITE + "#" + term.id,
        inDefinedTermSet: SITE,
      };
    });
  }),
};

module.exports = {
  groups: renderedGroups,
  byId: byId,
  schemaJson: JSON.stringify(schema, null, 2).replace(/</g, "\\u003c"),
};
