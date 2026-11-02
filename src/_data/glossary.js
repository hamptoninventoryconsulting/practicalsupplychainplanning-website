/**
 * Planning glossary for /learn/glossary/.
 * General planning terms only. Groups stay in this order.
 * Terms are sorted A–Z by display name when the page is built.
 */
"use strict";

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
        definition:
          "Expedite means bringing a supply order in earlier, and reschedule means moving its due date so it lands in the week the projected balance needs it.",
        example:
          "A supply order for 200 is due in week 8. The projected balance falls below safety stock in week 5. Expediting that order into week 5 covers the gap. If the order is due in week 3 and the projected balance does not need it until week 7, reschedule it later so the stock does not arrive early and sit.",
        why: "An open order on the wrong date is already in the projection. Moving it fixes the week that is short. Raising another planned order on top of it leaves both quantities in the projected balance later.",
        seeAlso: ["supply-order", "planned-order", "past-due"],
      },
      {
        id: "lot-size",
        term: "Lot size",
        usedIn: ["Stock Planner"],
        definition:
          "Lot size is the quantity ordered or produced in one batch.",
        example:
          "A pallet holds 1,200 units and that is the lot size. The projected balance needs 400 units to finish the week back at safety stock. The planned order is still 1,200. The projected balance finishes higher than the shortage alone, and the extra 800 stays until demand uses it.",
        why: "The extra quantity is stock you hold so the order matches how the item is bought or made. A larger lot slows inventory turns and ties up cash. A smaller lot orders more often. The projected balance shows how many weeks of demand each order covers.",
        seeAlso: ["minimum-order-quantity", "planned-order", "inventory-turns"],
      },
      {
        id: "minimum-order-quantity",
        term: "Minimum order quantity (MOQ)",
        usedIn: ["Stock Planner"],
        definition:
          "Minimum order quantity is the smallest quantity a supplier will sell of one item.",
        example:
          "The projected balance needs 40 units to stay at safety stock. The supplier's minimum order quantity is 100. The planned order is 100, and the extra 60 remains in the projected balance until later weeks use it.",
        why: "The projection has to show the quantity you can actually buy, not only the quantity the week is short. Ordering the minimum raises stock and can slow inventory turns. It is a supply constraint on the planned order.",
        seeAlso: ["lot-size", "minimum-order-value", "planned-order"],
      },
      {
        id: "minimum-order-value",
        term: "Minimum order value (MOV)",
        usedIn: ["Stock Planner"],
        definition:
          "Minimum order value is the smallest spend a supplier will accept on an order.",
        example:
          "Three planned orders for one supplier add up to $400. The supplier's minimum order value is $500. You add a line, raise a quantity, or wait until a later week takes the order over $500.",
        why: "A planned order can be right for one SKU and still be too small for the supplier. Adding quantity to clear the minimum raises the projected balance and ties up cash. Waiting can take another SKU below safety stock. The projection is what shows which week is exposed.",
        seeAlso: ["minimum-order-quantity", "planned-order", "supply-order"],
      },
      {
        id: "mrp",
        term: "MRP",
        usedIn: ["Stock Planner"],
        definition:
          "MRP, material requirements planning, is the time-phased calculation of when and how much supply an item needs.",
        example:
          "MRP starts from stock on hand and walks forward one time bucket at a time. Each bucket takes that week's forecast and any supply order that is due, and carries the projected balance into the next bucket. When the projected balance would fall below safety stock, MRP raises a planned order, then applies the lot size.",
        why: "A total of stock against a total of demand can look balanced while an early week is already short. MRP shows that week, and it shows whether an open supply order arrives in time to cover it.",
        seeAlso: ["time-phased-planning", "projected-stock", "planned-order"],
      },
      {
        id: "past-due",
        term: "Past-due",
        usedIn: ["Stock Planner"],
        definition:
          "A past-due supply order is still open after its due date, and the quantity has not been received.",
        example:
          "A supply order for 100 was due last week and has not arrived. The projection keeps those 100 units behind today. They do not land in a future week until you give the order a new due date.",
        why: "A past-due quantity is not cover for a future bucket. Set a due date you believe, or expedite the order, so the projected balance only counts supply that will be there. Planned orders raised on top of a forgotten past-due line become extra stock when the original order finally arrives.",
        seeAlso: ["supply-order", "expedite-reschedule", "projected-stock"],
      },
      {
        id: "planned-order",
        term: "Planned order",
        usedIn: ["Stock Planner"],
        definition:
          "A planned order is a proposed supply order, not yet placed, raised so the projected balance stays at or above safety stock.",
        example:
          "The projected balance would finish week 6 at 0, below a safety stock of 20, and the supply lead time is 4 weeks. The planned order is released in week 2 so it is due in week 6. The quantity covers the gap back to safety stock, and the lot size or minimum order quantity may raise it further.",
        why: "It is the action the time-phased plan is asking for. Review it before it becomes a supply order. An open supply order that can be expedited may cover the same week, in which case this planned order is not also required.",
        seeAlso: ["projected-stock", "supply-lead-time", "safety-stock"],
      },
      {
        id: "supply-lead-time",
        term: "Supply lead time",
        usedIn: ["Stock Planner"],
        definition:
          "Supply lead time is the time from placing an order to that stock being available to use or sell.",
        example:
          "The lead time is 6 weeks. The projected balance goes below safety stock in week 9, so the planned order has to be released in week 3. Count the time until the stock is available: a week on the water and a week to receive still sit inside the 6 weeks when that is how long it really takes.",
        why: "The projection counts back by the lead time to the week you must release the planned order. A lead time that is shorter than reality places that order too late. Agree whether the clock stops when the supplier ships, when the goods reach the warehouse, or when they are available to sell.",
        seeAlso: ["planned-order", "time-phased-planning", "supply-order"],
      },
      {
        id: "supply-order",
        term: "Supply order",
        usedIn: ["Stock Planner"],
        definition:
          "A supply order is stock already on order: a purchase, a transfer, or a production order, with a quantity and a due date.",
        example:
          "A purchase order for 100 is due in week 8. The projection adds those 100 units in week 8. It does not add them in week 5, so a shortfall in week 5 is still there.",
        why: "Open supply is part of the projected balance. Ignoring it raises a planned order you do not need. Trusting a date that cannot be met leaves a week uncovered. When the date is wrong, expedite or reschedule the supply order.",
        seeAlso: ["planned-order", "past-due", "projected-stock"],
      },
      {
        id: "time-phased-planning",
        term: "Time-phased planning",
        usedIn: ["Stock Planner"],
        definition:
          "Time-phased planning projects stock forward, bucket by bucket, against the forecast, open orders and lead times, and times a planned order so it arrives before the projected balance falls below safety stock.",
        example:
          "The supply lead time is 6 weeks and the projected balance goes below safety stock in week 9. The plan shows the order in week 3, while the balance today can still look comfortable.",
        why: "Today's balance only says whether you are short now. The projection shows a shortage that is already inside the lead time, and it shows an open order that arrives too late to cover it.",
        seeAlso: ["projected-stock", "planned-order", "mrp"],
      },
      {
        id: "unit-of-measure",
        term: "Unit of measure (UoM)",
        usedIn: ["Stock Planner"],
        definition:
          "The unit of measure is the unit a quantity is counted in, such as each, kilogram, or case.",
        example:
          "Stock is held in eaches and the supplier sells a case of 12. A planned order of 10 cases is 120 eaches. Entered as 10 against a forecast in eaches, the projected balance looks short by about 110 units that are not really missing.",
        why: "Stock, forecast, and supply orders only add up in one unit. Mixed units make the projected balance, the planned order, and the minimum order quantity all wrong. Convert before the weeks are calculated.",
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
        definition:
          "Customer service level is the share of demand you can supply from stock when it is wanted.",
        example:
          "Customers ask for 1,000 units in a period and you supply 970 from stock. The service level for that period is 97%. Some teams instead count the share of periods that do not run out. A week that finishes below zero is a miss. A week that finishes on zero is not.",
        why: "The projected balance is what protects this number. Safety stock, supply lead time, and forecast variability all change how often that balance stays above zero. A higher service level needs a larger buffer when demand or delivery timing moves around. Inventory turns tell you what that buffer costs.",
        seeAlso: ["safety-stock", "inventory-turns", "forecast-reliability"],
      },
      {
        id: "inventory-turns",
        term: "Inventory turns",
        usedIn: ["Stock Planner"],
        definition:
          "Inventory turns are how many times stock is used and replaced over a year: demand for the year divided by the average stock on hand.",
        example:
          "Annual demand is 1,200 units and the average stock on hand is 300. Turns are 4. Count a week below zero as zero stock in that average, so a stockout leaves the average no smaller than an empty shelf.",
        why: "Lot size, safety stock, and a forecast that runs high all raise the average balance and lower turns. Turns sit next to customer service level. High turns with a weak service level means the buffer is thin and customers are already missing out.",
        seeAlso: ["lot-size", "safety-stock", "customer-service-level"],
      },
      {
        id: "projected-stock",
        term: "Projected stock",
        usedIn: ["Stock Planner"],
        definition:
          "Projected stock, also called the projected balance, is the on-hand quantity carried forward through each time bucket after that bucket's forecast and open supply orders.",
        example:
          "Opening stock is 100. The week 1 forecast is 30 and nothing is due in, so the projected balance finishes week 1 at 70. Week 2 opens at 70. Its forecast is 40 and a supply order of 100 is due, so the projected balance finishes week 2 at 130.",
        why: "The week the projected balance falls below safety stock is the week a planned order has to cover. Adding up all stock and all demand can hide that week, because supply that arrives later does not help an earlier bucket.",
        seeAlso: ["time-phased-planning", "planned-order", "safety-stock"],
      },
      {
        id: "safety-stock",
        term: "Safety stock",
        usedIn: ["Stock Planner"],
        definition:
          "Safety stock is weeks of demand converted to a quantity: a projected balance that would fall below that quantity triggers a planned order, and those weeks do not move supply due dates.",
        example:
          "On-hand stock is 100. Safety stock is 2 weeks and weekly demand is 10, so the quantity is 20. By the end of week 3 the projected balance would be 0, which is below 20, so a planned order is due in week 3 for enough to finish that week back at 20, before lot size is applied. Where safety stock is zero, the planned order is triggered when the projected balance would fall below zero. An open supply order keeps its due date.",
        why: "The buffer covers a demand spike or a late delivery that the forecast and the lead time did not already name. The weeks become units in the projected balance and leave supply due dates where they are. Safety time, cover stated as time rather than as a quantity, is a different rule and is not how this buffer is set.",
        seeAlso: ["projected-stock", "planned-order", "customer-service-level"],
      },
      {
        id: "slow-mover",
        term: "Slow mover / SLOB",
        usedIn: ["Stock Planner"],
        definition:
          "A slow mover sells or is used slowly compared with the stock on hand. SLOB is slow-moving and obsolete stock. Obsolete stock has no remaining demand.",
        example:
          "You hold 2,000 units of a SKU that now sells 10 a week, so years of cover sit in the projected balance and no planned order is due. A superseded SKU with no forecast and no remaining orders is obsolete, even while units are still on the shelf.",
        why: "The projection should not replenish stock the forecast will not use. Obsolete stock will not be consumed at all. It ties up cash and space, and the decision is to sell through, return, or write off.",
        seeAlso: ["inventory-turns", "forecast", "projected-stock"],
      },
    ],
  },
  {
    id: "demand-and-forecasting",
    title: "Demand & forecasting",
    terms: [
      {
        id: "demand-bucket",
        term: "Demand bucket",
        usedIn: ["Demand Planner"],
        definition:
          "A demand bucket groups SKUs by the shape of their sales history before you choose a forecast profile.",
        example:
          "Forecastable, or steady, demand has regular sales in most periods, enough for a baseline, trend, or seasonal profile. Low stable demand is regular too, but the quantities are small, so a change of one unit is a large share of the forecast. Intermittent demand has many zeros and occasional orders, and it has its own entry.",
        why: "The bucket stops a smooth weekly forecast being used on a SKU that does not sell that way, and it stops a small steady seller being treated as if it had no pattern. The stock projection inherits whatever shape you pick.",
        seeAlso: ["forecast-profile", "intermittent-demand", "sales-history"],
      },
      {
        id: "exception-outlier",
        term: "Exception / outlier",
        usedIn: ["Demand Planner"],
        definition:
          "An exception, or outlier, is a sales observation far from that SKU's usual pattern.",
        example:
          "A week of 18 on a SKU that usually sells about 100 may be a stockout, which is what you could sell, not what customers wanted. A week of 500 on an intermittent SKU may be a normal order. A customer who missed one order and then bought double may be a real sale that should not all sit in one week of the forecasting history.",
        why: "Ask whether the cause will happen again inside the forecast horizon. Keep the point when it is part of future demand. Adjust the forecasting history when it will not repeat, and keep the actual sales record as it was. The size of the gap does not decide it. A point left in or taken out changes the forecast, then the projected balance, then the planned orders.",
        seeAlso: ["sales-history", "intermittent-demand", "forecast"],
      },
      {
        id: "forecast",
        term: "Forecast",
        usedIn: ["Stock Planner", "Demand Planner"],
        definition:
          "A forecast is the demand you expect in each future time bucket, which the stock projection uses before it raises a planned order.",
        example:
          "Week 4 has a forecast of 100. A customer order for 80 arrives in that same week and consumes the forecast, so the projection uses 80 of orders and 20 of remaining forecast. It does not plan the order on top of the full 100. The shape may be a baseline, a trend, a seasonal pattern, a seasonal trend, a short history, or intermittent demand. A baseline can be a 12-week average of the complete weeks before the plan start week. The counting rules for that average are under Forecast profile.",
        why: "The projected balance is only as good as the forecast in each bucket. Forecast accuracy is how far the forecast was from demand. Bias is whether those misses keep landing high or low: a forecast that is always high builds stock, and a forecast that is always low raises planned orders too late. Forecast consumption stops firm orders being planned twice.",
        seeAlso: ["forecast-profile", "forecast-horizon", "sales-history"],
      },
      {
        id: "forecast-horizon",
        term: "Forecast horizon",
        usedIn: ["Demand Planner"],
        definition:
          "The forecast horizon is how far ahead demand is forecast, which is how far the stock projection can see.",
        example:
          "Supply lead time is 10 weeks and the horizon is 8 weeks. The projection cannot show a shortfall in week 10, so it cannot show the planned order you would need to release this week to cover it.",
        why: "The horizon has to cover the supply lead time, plus the time you need to review and place the order. A short horizon makes a long lead time look as if nothing needs ordering.",
        seeAlso: ["forecast", "supply-lead-time", "time-phased-planning"],
      },
      {
        id: "forecast-profile",
        term: "Forecast profile",
        usedIn: ["Demand Planner"],
        definition:
          "A forecast profile is the demand shape used for a SKU over the forecast horizon.",
        points: [
          {
            label: "Baseline",
            text: "One level across the horizon. A 12-week average is one baseline.",
          },
          {
            label: "Trend",
            text: "The level rises or falls as the horizon moves forward.",
          },
          {
            label: "Seasonal",
            text: "The level repeats at the same point in the year.",
          },
          {
            label: "Seasonal trend",
            text: "A seasonal shape sitting on a rise or fall.",
          },
          {
            label: "Short history",
            text: "The first sale was recent, so fewer than 12 complete weeks are available. The average uses only those weeks, and a short run can move it a lot.",
          },
          {
            label: "Intermittent",
            text: "Many zero periods and occasional orders. That profile is its own entry.",
          },
        ],
        example:
          "A 12-week average uses these rules. Sales from every location are added together, so there is one average per SKU. Each sale sits in the week of its date. The history window is the 12 complete weeks before the plan start week. Sales in the plan start week or later are left out. The first sale week is the first week with net sales above zero. Weeks before that are left out. Zero weeks after that first sale are counted. Weeks used is that count, capped at 12. The average is the total of those weeks divided by weeks used. A negative average is set to 0. The result is rounded to 2 decimals. Weekly quantities are whole units. A slow seller is written as 1 unit every few weeks so the total stays within 1 unit of the average times the number of weeks. The average itself does not climb or fall from week to week, so a trend or a seasonal peak stays outside it.",
        why: "The profile is the demand the projected balance will consume. A baseline on a seasonal SKU misses the peak and orders for the quiet weeks. A short history can swing the planned orders on a handful of sales. Pick the shape the sales history actually has.",
        seeAlso: ["forecast", "trend", "seasonality", "intermittent-demand"],
      },
      {
        id: "forecast-reliability",
        term: "Forecast reliability",
        usedIn: ["Demand Planner"],
        definition:
          "Forecast reliability is how tightly demand stays around the forecast. Variability is the width of that spread.",
        example:
          "Two SKUs each have a forecast of 100 a week. One usually lands between 90 and 110. The other swings from 20 to 180. The second needs more safety stock to hold the same customer service level, because the forecast in the projection is a weaker guide to the week.",
        why: "A reliable forecast lets you hold less safety stock. A wide spread can still have little bias, when the high weeks and the low weeks cancel out. Bias is the persistent high or low. Variability is the width. The projected balance needs a buffer for the width.",
        seeAlso: ["forecast", "safety-stock", "customer-service-level"],
      },
      {
        id: "intermittent-demand",
        term: "Intermittent demand",
        usedIn: ["Demand Planner"],
        definition:
          "Intermittent demand is many periods with no sales and occasional orders, often for a large quantity. It is both a demand bucket and a forecast profile.",
        example:
          "A history of 0, 0, 0, 500, 0, 0, 0, 400 is intermittent. The orders of 500 and 400 can be the real pattern. A level forecast spread across every week will not match how the stock is used. A 12-week average is a poor guide when most weeks are zero and one week is a large order.",
        why: "Removing the large orders because they look like outliers makes the forecast less like the demand you will get. The projection still needs a figure in each bucket, and the safety stock and the lot size have to respect the gaps and the size of the orders.",
        seeAlso: ["demand-bucket", "forecast-profile", "exception-outlier"],
      },
      {
        id: "sales-history",
        term: "Sales history",
        usedIn: ["Demand Planner"],
        definition:
          "Sales history is the record of what was sold, by SKU and by period, that a forecast is built from.",
        example:
          "Bring the history in as a CSV and check the dates, the quantities, and the unit of measure before you average anything. A week of low sales while you were out of stock is what you sold, not necessarily what customers wanted. Keep that actual record, and use a separate forecasting history when a point should not drive the forecast.",
        why: "The forecast cannot be more reliable than the history it starts from. Wrong units, duplicated orders, or a stockout treated as zero demand all flow into the projected balance and the planned orders.",
        seeAlso: ["exception-outlier", "forecast", "unit-of-measure"],
      },
      {
        id: "seasonality",
        term: "Seasonality",
        usedIn: ["Demand Planner"],
        definition:
          "Seasonality is a demand pattern that repeats at the same point in the cycle, usually the same weeks or months each year.",
        example:
          "A gift SKU sells hard in November and little in March. The forecast has to rise and fall with that calendar. A 12-week average taken from the quiet months holds one level and leaves the November peak outside it.",
        why: "A flat forecast understates the peak, so the projected balance falls through safety stock too late for the supply lead time. It overstates the quiet months, so planned orders arrive as stock you will sit on.",
        seeAlso: ["forecast-profile", "trend", "forecast-horizon"],
      },
      {
        id: "sku-forecasting-group",
        term: "SKU forecasting group",
        usedIn: ["Demand Planner"],
        definition:
          "A SKU forecasting group is a set of SKUs forecast together because they share one demand pattern, with that group forecast then shared back across the SKUs.",
        example:
          "Five colourways of one product are noisy on their own and steady as a group. Forecast the group, then split it back by each SKU's share of recent sales.",
        why: "Grouping is a forecasting choice. Each SKU still has its own projected balance, open supply orders, and planned orders. A group forecast only helps when the SKUs really do move together.",
        seeAlso: ["forecast", "demand-bucket", "sales-history"],
      },
      {
        id: "trend",
        term: "Trend",
        usedIn: ["Demand Planner"],
        definition:
          "A trend is a sustained rise or fall in demand, as distinct from a single high or low week.",
        example:
          "Sales moving from 80 a week to 120 over a few months is a trend. One week at 140, then back to 80, is a spike. A baseline holds the recent level and does not keep climbing or falling.",
        why: "If demand is still rising, a level forecast is already behind and planned orders lag the projected balance. If demand is falling, the level is already ahead and supply orders keep arriving for stock you no longer need.",
        seeAlso: ["forecast-profile", "seasonality", "forecast"],
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

function termBody(term) {
  const points = (term.points || [])
    .map(function (point) {
      return point.label + " " + point.text;
    })
    .join("\n");
  return [term.definition, term.example, term.why, points].join("\n");
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
      if (!term.definition || !term.example || !term.why) {
        throw new Error("Glossary term is missing a card part: " + term.id);
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
  return ids;
}

const groups = GROUPS.map(function (group) {
  return {
    id: group.id,
    title: group.title,
    terms: sortTerms(group.terms),
  };
});

validate(groups);

const byId = {};
groups.forEach(function (group) {
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
  hasDefinedTerm: groups.flatMap(function (group) {
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
  groups: groups,
  byId: byId,
  schemaJson: JSON.stringify(schema, null, 2).replace(/</g, "\\u003c"),
};
