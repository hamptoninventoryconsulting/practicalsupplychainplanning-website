#!/usr/bin/env node
/**
 * Own-data simulator checks: calculations, fragment round trip, validation,
 * commentary, and the built page. The teaching engine is the parity reference.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "_site");
const PAGE = path.join(SITE, "learn", "safety-stock-simulator", "own-data", "index.html");
const own = require(path.join(ROOT, "assets", "own-data-engine.js"));
const teaching = require(path.join(ROOT, "assets", "safety-stock-engine.js"));

function sku(overrides) {
  return Object.assign(own.defaultSku(1), overrides || {});
}

function globals(overrides) {
  return Object.assign({ deliveryVariability: "off", shock: false }, overrides || {});
}

function assertClose(actual, expected, label) {
  assert.ok(
    actual != null && Math.abs(actual - expected) < 1e-6,
    (label || "value") + " " + actual + " !== " + expected
  );
}

const leadExpect = {
  small: { 1: 1, 2: 1, 4: 1, 5: 1, 7: 1, 10: 1, 15: 1, 26: 1 },
  medium: { 1: 1, 2: 1, 4: 2, 5: 2, 7: 2, 10: 3, 15: 4, 26: 6 },
  large: { 1: 2, 2: 2, 4: 3, 5: 3, 7: 4, 10: 5, 15: 7, 26: 11 },
};
["small", "medium", "large"].forEach(function (level) {
  Object.keys(leadExpect[level]).forEach(function (week) {
    assert.strictEqual(
      own.leadTimeExtraMax(Number(week), level),
      leadExpect[level][week],
      level + " " + week
    );
  });
  [2, 5, 10].forEach(function (week) {
    assert.strictEqual(
      own.leadTimeExtraMax(week, level),
      teaching.LT_EXTRA_MAX[week][level],
      "anchor " + level + " " + week
    );
  });
});
assert.strictEqual(own.leadTimeExtraMax(7, "off"), 0);
assert.strictEqual(teaching.leadTimeExtraMax(7, "large"), 0);
assert.ok(own.leadTimeExtraMax(7, "large") > 0);

function requireError(fields, pattern) {
  const parsed = own.parseSkuFields(fields, "Row");
  assert.strictEqual(parsed.ok, false, JSON.stringify(fields));
  assert.ok(
    parsed.errors.some(function (error) { return pattern.test(error); }),
    parsed.errors.join(" | ")
  );
}

requireError(Object.assign(sku(), { forecast: "" }), /above zero/);
requireError(Object.assign(sku(), { forecast: -4 }), /cannot be negative/);
requireError(Object.assign(sku(), { forecast: 0 }), /above zero/);
requireError(Object.assign(sku(), { forecast: 1.5 }), /whole number/);
requireError(Object.assign(sku(), { currentStock: -1 }), /cannot be negative/);
requireError(Object.assign(sku(), { currentStock: "" }), /current stock/i);
requireError(Object.assign(sku(), { leadTimeWeeks: 0 }), /1 to 26/);
requireError(Object.assign(sku(), { leadTimeWeeks: 27 }), /1 to 26/);
requireError(Object.assign(sku(), { leadTimeWeeks: 1.5 }), /1 to 26/);
requireError(Object.assign(sku(), { leadTimeWeeks: "" }), /1 to 26/);
requireError(Object.assign(sku(), { unitCost: -2 }), /unit cost/i);
requireError(Object.assign(sku(), { sellingPrice: "" }), /selling price/i);
requireError(Object.assign(sku(), { lotMode: "fixed", lotQty: 0 }), /at least 1/);
requireError(Object.assign(sku(), { ssMode: "fixed", ssQty: -5 }), /cannot be negative/);
requireError(Object.assign(sku(), { label: "" }), /SKU name/);

[1, 26].forEach(function (lead) {
  const parsed = own.parseSkuFields(sku({ leadTimeWeeks: lead }), "Row");
  assert.strictEqual(parsed.ok, true, parsed.errors.join(" "));
  assert.strictEqual(parsed.sku.leadTimeWeeks, lead);
});

const bigLot = own.parseSkuFields(sku({ lotQty: 5000, ssQty: 5000 }), "Row");
assert.strictEqual(bigLot.ok, true, bigLot.errors.join(" "));
assert.strictEqual(bigLot.sku.lotQty, 5000);
assert.strictEqual(bigLot.sku.ssQty, 5000);

const costWarn = own.parseSkuFields(sku({ unitCost: 30, sellingPrice: 20 }), "Row");
assert.strictEqual(costWarn.ok, true);
assert.ok(costWarn.warnings.some(function (warning) { return /gross profit/i.test(warning); }));

const lotWarn = own.parseSkuFields(sku({ lotQty: 10, forecast: 40 }), "Row");
assert.ok(lotWarn.warnings.some(function (warning) { return /smaller than the weekly forecast/i.test(warning); }));

const stockWarn = own.parseSkuFields(sku({ currentStock: 40 * 53, forecast: 40 }), "Row");
assert.ok(stockWarn.warnings.some(function (warning) { return /52 weeks of cover/i.test(warning); }));

const quiet = own.runYear(
  sku({
    forecast: 10,
    currentStock: 1000,
    lotQty: 10,
    ssQty: 0,
    demandVariability: "off",
    unitCost: 10,
    sellingPrice: 15,
    leadTimeWeeks: 5,
  }),
  globals(),
  1
);
assert.strictEqual(quiet.startingSoh, 1000);
assert.strictEqual(quiet.nominalLot, 10);
assert.strictEqual(quiet.safetyStock, 0);
assert.strictEqual(quiet.metrics.oosWeeks, 0);
assert.strictEqual(quiet.metrics.annualDemand, 520);
assert.strictEqual(quiet.metrics.unitsSold, 520);
assert.strictEqual(quiet.metrics.unmetDemand, 0);
assert.strictEqual(quiet.metrics.annualGp, 2600);
assertClose(quiet.metrics.averageWc, 7350, "working capital");
assert.strictEqual(quiet.weeks[51].endingSoh, 480);
assert.ok(quiet.releases.length === 0, "a full opening stock does not order");

const zeroStock = own.runYear(sku({ currentStock: 0, ssQty: 0, demandVariability: "off" }), globals(), 4);
assert.strictEqual(zeroStock.startingSoh, 0);
assert.ok(zeroStock.releases.length > 0, "zero stock still places an order");
assert.strictEqual(zeroStock.metrics.unitsSold + zeroStock.metrics.unmetDemand, zeroStock.metrics.annualDemand);
assert.strictEqual(zeroStock.metrics.annualGp, zeroStock.metrics.unitsSold * 30);

const lostSales = own.runYear(
  sku({
    forecast: 10,
    currentStock: 4,
    lotQty: 1,
    ssQty: 0,
    demandVariability: "off",
    leadTimeVariability: "off",
    leadTimeWeeks: 5,
    unitCost: 70,
    sellingPrice: 100,
  }),
  globals(),
  1
);
assert.strictEqual(lostSales.weeks[0].plannedSupply, 2, "week 1 receives two lots");
assert.strictEqual(lostSales.weeks[0].endingSoh, -4, "week 1 ends short");
lostSales.weeks.forEach(function (week, index) {
  assert.strictEqual(week.simulatedDemand, 10, "demand " + (index + 1));
  assert.strictEqual(week.plannedSupply, 2, "supply " + (index + 1));
});
assert.strictEqual(lostSales.metrics.annualDemand, 520);
assert.strictEqual(lostSales.metrics.unitsSold, 108, "opening stock plus two units a week");
assert.strictEqual(lostSales.metrics.unmetDemand, 412);
assert.strictEqual(lostSales.metrics.annualGp, 108 * 30);
assert.ok(lostSales.metrics.annualGp < lostSales.metrics.annualDemand * 30);

const ownBig = own.runYear(sku({ lotQty: 2500, demandVariability: "off", currentStock: 80 }), globals(), 1);
assert.strictEqual(ownBig.nominalLot, 2500);
const teachingClamped = teaching.runYear(
  { patternId: "level", lotQty: 2500, ssQty: 20, demandVariability: "off", leadTimeWeeks: 5 },
  1
);
assert.strictEqual(teachingClamped.nominalLot, 1000);

const lead7 = own.runYear(
  sku({ leadTimeWeeks: 7, ssMode: "formula", demandVariability: "medium" }),
  globals(),
  11
);
assert.strictEqual(lead7.controls.leadTimeWeeks, 7);
assert.strictEqual(
  lead7.formula.computedSafetyStock,
  own.formulaSafetyStock(lead7.normalDemand, 95, 7)
);
const teachingLead = teaching.runYear(
  { patternId: "level", leadTimeWeeks: 7, ssMode: "formula", demandVariability: "medium" },
  11
);
assert.strictEqual(teachingLead.controls.leadTimeWeeks, 5);

function parityControls(controls) {
  const forecast = 40;
  const nominal = controls.lotMode === "weeks" ? forecast * (controls.lotWeeks || 4) : (controls.lotQty == null ? 40 : controls.lotQty);
  return sku({
    label: "Parity",
    forecast: forecast,
    demandVariability: controls.demandVariability || "off",
    leadTimeWeeks: controls.leadTimeWeeks || 5,
    leadTimeVariability: controls.leadTimeVariability || "off",
    currentStock: forecast + nominal,
    unitCost: 70,
    sellingPrice: 100,
    lotMode: controls.lotMode || "fixed",
    lotQty: controls.lotQty == null ? 40 : controls.lotQty,
    lotWeeks: controls.lotWeeks || 4,
    ssMode: controls.ssMode || "fixed",
    ssQty: controls.ssQty == null ? 20 : controls.ssQty,
    ssWeeks: controls.ssWeeks || 4,
    serviceLevel: controls.serviceLevel || 95,
  });
}

function soldFromWeeks(weeks) {
  return weeks.reduce(function (sum, week) {
    const available = Math.max(0, week.beginningSoh) + Math.max(0, week.plannedSupply);
    return sum + Math.min(week.simulatedDemand, available);
  }, 0);
}

function assertSameYear(left, right, label) {
  assert.strictEqual(left.startingSoh, right.startingSoh, label + " start");
  assert.strictEqual(left.safetyStock, right.safetyStock, label + " ss");
  assert.deepStrictEqual(left.shockWeeks, right.shockWeeks, label + " shock");
  for (let week = 0; week < 52; week += 1) {
    assert.strictEqual(left.weeks[week].endingSoh, right.weeks[week].endingSoh, label + " end " + (week + 1));
    assert.strictEqual(left.weeks[week].simulatedDemand, right.weeks[week].simulatedDemand, label + " demand " + (week + 1));
    assert.strictEqual(left.weeks[week].plannedSupply, right.weeks[week].plannedSupply, label + " supply " + (week + 1));
  }
  assert.strictEqual(left.metrics.oosWeeks, right.metrics.oosWeeks, label + " oos");
  assert.strictEqual(left.metrics.unitsSold, soldFromWeeks(left.weeks), label + " units sold");
  assert.strictEqual(
    left.metrics.unmetDemand,
    left.metrics.annualDemand - left.metrics.unitsSold,
    label + " unmet"
  );
  assert.strictEqual(
    left.metrics.annualGp,
    left.metrics.unitsSold * (left.prices.sell - left.prices.cost),
    label + " gp"
  );
  if (left.metrics.unmetDemand === 0) {
    assert.strictEqual(left.metrics.annualGp, right.metrics.annualGp, label + " gp parity");
  } else {
    assert.ok(left.metrics.annualGp < right.metrics.annualGp, label + " lost sales reduce gp");
  }
  assertClose(left.metrics.averageWc, right.metrics.averageWc, label + " wc");
  if (left.metrics.inventoryTurns == null || right.metrics.inventoryTurns == null) {
    assert.strictEqual(left.metrics.inventoryTurns, right.metrics.inventoryTurns, label + " turns");
  } else {
    assertClose(left.metrics.inventoryTurns, right.metrics.inventoryTurns, label + " turns");
  }
}

[1, 42].forEach(function (seed) {
  [2, 5, 10].forEach(function (lead) {
    ["off", "medium"].forEach(function (demand) {
      ["off", "large"].forEach(function (ltVar) {
        ["off", "small"].forEach(function (delivery) {
          [false, true].forEach(function (shock) {
            ["fixed", "formula", "weeks"].forEach(function (ssMode) {
              const controls = {
                patternId: "level",
                lotMode: "fixed",
                lotQty: 40,
                ssMode: ssMode,
                ssQty: 20,
                ssWeeks: 4,
                serviceLevel: 95,
                leadTimeWeeks: lead,
                demandVariability: demand,
                leadTimeVariability: ltVar,
                deliveryVariability: delivery,
                shock: shock,
              };
              const taught = teaching.runYear(controls, seed);
              const ours = own.runYear(parityControls(controls), globals({ deliveryVariability: delivery, shock: shock }), seed);
              assertSameYear(ours, taught, "y" + seed + ":" + lead + ":" + demand + ":" + ssMode + ":" + shock);
            });
          });
        });
      });
    });
  });
});

const weekControls = {
  patternId: "level",
  lotMode: "weeks",
  lotWeeks: 4,
  lotQty: 40,
  ssMode: "fixed",
  ssQty: 20,
  leadTimeWeeks: 5,
  demandVariability: "small",
  leadTimeVariability: "small",
  deliveryVariability: "medium",
  shock: true,
};
assertSameYear(
  own.runYear(parityControls(weekControls), globals({ deliveryVariability: "medium", shock: true }), 9),
  teaching.runYear(weekControls, 9),
  "weeks lot"
);

const mcControls = {
  patternId: "level",
  lotMode: "fixed",
  lotQty: 40,
  ssMode: "formula",
  ssQty: 0,
  serviceLevel: 95,
  leadTimeWeeks: 10,
  demandVariability: "medium",
  leadTimeVariability: "small",
  deliveryVariability: "off",
  shock: true,
};
const taughtMc = teaching.runMonteCarlo(mcControls, 7, { runs: 50 });
const ownMc = own.runMonteCarlo(
  parityControls(mcControls),
  globals({ deliveryVariability: "off", shock: true }),
  7
);
assert.strictEqual(ownMc.summary.oosWeeks.median, taughtMc.summary.oosWeeks.median);
ownMc.runs.forEach(function (run, index) {
  const taughtRun = taughtMc.runs[index];
  assert.strictEqual(run.metrics.annualDemand, taughtRun.metrics.annualDemand, "mc demand " + index);
  assert.strictEqual(run.metrics.unitsSold, soldFromWeeks(run.weeks), "mc sold " + index);
  assert.strictEqual(run.metrics.annualGp, run.metrics.unitsSold * 30, "mc gp " + index);
  if (run.metrics.unmetDemand === 0) {
    assert.strictEqual(run.metrics.annualGp, taughtRun.metrics.annualGp, "mc gp parity " + index);
  } else {
    assert.ok(run.metrics.annualGp < taughtRun.metrics.annualGp, "mc lost sales " + index);
  }
});
assert.strictEqual(ownMc.runs[0].safetyStock, taughtMc.runs[0].safetyStock);
assert.strictEqual(ownMc.frozenSafetyStock, taughtMc.frozenSafetyStock);

const chunkScenario = own.validateScenario({
  seed: 7,
  deliveryVariability: "off",
  shock: true,
  skus: [parityControls(mcControls)],
}).scenario;
const jobs = own.portfolioJobs(chunkScenario, "monte-carlo", 7);
const grouped = [];
jobs.forEach(function (job) {
  const options = {};
  if (job.frozenSafetyStock != null) {
    options.frozenSafetyStock = job.frozenSafetyStock;
  }
  const result = own.runYear(chunkScenario.skus[job.skuIndex], chunkScenario, job.seed, options);
  result.runIndex = job.runIndex;
  result.seed = job.seed;
  grouped.push(result);
});
const assembled = own.assembleMonteCarlo(chunkScenario.skus[0], chunkScenario, 7, grouped);
assert.strictEqual(assembled.summary.oosWeeks.median, ownMc.summary.oosWeeks.median);
assert.strictEqual(assembled.summary.csl.p10, ownMc.summary.csl.p10);
assert.strictEqual(assembled.runs.length, 50);

function context(overrides) {
  return Object.assign(
    {
      mode: "year",
      demandVariability: "off",
      leadTimeVariability: "off",
      deliveryVariability: "off",
      shock: false,
      lotMode: "fixed",
      lotWeeks: 4,
      ssMode: "fixed",
      oosWeeks: 1,
      csl: 98.1,
      inventoryTurns: 3,
      averageWc: 1000,
      annualGp: 100,
      safetyStock: 0,
      oosSpread: null,
      shockStockout: false,
    },
    overrides || {}
  );
}

function idsOf(overrides) {
  return own.commentaryFor(context(overrides)).rules.map(function (rule) { return rule.id; });
}

assert.deepStrictEqual(idsOf({ inventoryTurns: 9, csl: 90, oosWeeks: 6, safetyStock: 10 }), [1, 9]);
assert.deepStrictEqual(idsOf({ oosWeeks: 0, csl: 100, safetyStock: 12, inventoryTurns: 3 }), [2, 9]);
assert.deepStrictEqual(
  idsOf({ oosWeeks: 2, csl: 96, leadTimeVariability: "small", safetyStock: 8 }),
  [3, 9]
);
assert.deepStrictEqual(idsOf({ oosWeeks: 2, shock: true, shockStockout: true, safetyStock: 4 }), [4, 9]);
assert.deepStrictEqual(
  idsOf({ ssMode: "formula", shock: true, shockStockout: true, oosWeeks: 1, safetyStock: 6 }),
  [4, 5, 9]
);
assert.deepStrictEqual(
  idsOf({ lotMode: "weeks", lotWeeks: 6, inventoryTurns: 4, oosWeeks: 2, safetyStock: 10 }),
  [6, 9]
);
assert.deepStrictEqual(idsOf({ averageWc: -25, oosWeeks: 3, safetyStock: 0 }), [7, 9]);
assert.deepStrictEqual(
  idsOf({ mode: "monte-carlo", oosSpread: 5, oosWeeks: 2, safetyStock: 4 }),
  [8, 9]
);
assert.deepStrictEqual(idsOf({}), [9]);
assert.deepStrictEqual(
  idsOf({
    inventoryTurns: 12,
    csl: 80,
    oosWeeks: 8,
    safetyStock: 15,
    leadTimeVariability: "large",
    shock: true,
    shockStockout: true,
    ssMode: "formula",
  }).slice(0, 3),
  [1, 3, 4]
);

const phrases = {
  1: /weak service/,
  2: /no stockouts/,
  3: /late or short/,
  4: /doubled-demand/,
  5: /textbook formula/,
  6: /working capital/,
  7: /backorders/,
  8: /year to year/,
  9: /one setting at a time/,
};
Object.keys(phrases).forEach(function (id) {
  const sample = own.commentaryFor(context(
    id === "1" ? { inventoryTurns: 9, csl: 90, oosWeeks: 6, safetyStock: 10 }
      : id === "2" ? { oosWeeks: 0, csl: 100, safetyStock: 12 }
        : id === "3" ? { oosWeeks: 2, deliveryVariability: "medium", safetyStock: 0 }
          : id === "4" ? { oosWeeks: 2, shock: true, shockStockout: true }
            : id === "5" ? { ssMode: "formula", leadTimeVariability: "small", oosWeeks: 0, csl: 100, safetyStock: 4 }
              : id === "6" ? { lotMode: "weeks", lotWeeks: 10, inventoryTurns: 3, oosWeeks: 1 }
                : id === "7" ? { averageWc: -1, oosWeeks: 4 }
                  : id === "8" ? { mode: "monte-carlo", oosSpread: 6, oosWeeks: 3 }
                    : {}
  ));
  const rule = sample.rules.find(function (item) { return item.id === Number(id); });
  assert.ok(rule, "rule " + id);
  assert.match(rule.text, /^In the scenario you ran/);
  assert.match(rule.text, phrases[id]);
});

const zeroSsLine = own.commentaryFor(context({
  oosWeeks: 2,
  deliveryVariability: "small",
  safetyStock: 0,
})).rules.find(function (rule) { return rule.id === 3; });
assert.ok(!/even with safety stock in place/.test(zeroSsLine.text));

const banned = [
  /your business should/i,
  /\brecommended\b/i,
  /\byou should\b/i,
  /calculates safety stock/i,
];

function assertClean(text, label) {
  banned.forEach(function (pattern) {
    assert.doesNotMatch(text, pattern, label + " " + pattern);
  });
}

const seen = {};
const levels = ["off", "small", "medium", "large"];
const lotModes = [
  { lotMode: "fixed", lotQty: 40, lotWeeks: 4 },
  { lotMode: "weeks", lotQty: 40, lotWeeks: 6 },
];
const ssModes = [
  { ssMode: "fixed", ssQty: 20 },
  { ssMode: "formula", ssQty: 0, serviceLevel: 95 },
  { ssMode: "weeks", ssQty: 0, ssWeeks: 4 },
];
levels.forEach(function (level) {
  lotModes.forEach(function (lot) {
    ssModes.forEach(function (ss) {
      [false, true].forEach(function (shock) {
        ["year", "monte-carlo"].forEach(function (mode) {
          const item = sku(Object.assign({
            forecast: 40,
            currentStock: 80,
            unitCost: 70,
            sellingPrice: 100,
            demandVariability: level,
            leadTimeVariability: level,
            leadTimeWeeks: 5,
          }, lot, ss));
          const shared = globals({ deliveryVariability: level, shock: shock });
          const commentary = mode === "year"
            ? own.commentaryFromYear(item, shared, own.runYear(item, shared, 3))
            : own.commentaryFromMonteCarlo(item, shared, own.runMonteCarlo(item, shared, 3));
          const ruleIds = commentary.rules.map(function (rule) { return rule.id; });
          own.CONTRADICTIONS.forEach(function (pair) {
            assert.ok(!(ruleIds.indexOf(pair[0]) !== -1 && ruleIds.indexOf(pair[1]) !== -1), ruleIds.join(",") + " " + pair.join("/"));
          });
          assert.deepStrictEqual(
            commentary.lines.map(function (rule) { return rule.id; }),
            ruleIds.slice(0, 3)
          );
          commentary.rules.forEach(function (rule) {
            seen[rule.id] = true;
            assert.match(rule.text, /^In the scenario you ran/);
            assertClean(rule.text, "rule " + rule.id);
          });
          if (commentary.callout) {
            assertClean(commentary.callout, "callout");
          }
          const turns = mode === "year"
            ? own.runYear(item, shared, 3).metrics.inventoryTurns
            : null;
          if (mode === "year") {
            const metrics = own.runYear(item, shared, 3).metrics;
            const expectCallout = metrics.inventoryTurns != null && metrics.inventoryTurns >= 8 && (metrics.csl < 95 || metrics.oosWeeks >= 3);
            assert.strictEqual(Boolean(commentary.callout), expectCallout);
            assert.strictEqual(
              teaching.needsPedagogyCallout(metrics),
              expectCallout
            );
          }
          if (turns == null && mode === "year") {
            assert.ok(true);
          }
        });
      });
    });
  });
});
const bigLots = sku({
  lotMode: "weeks",
  lotWeeks: 10,
  lotQty: 40,
  currentStock: 2000,
  forecast: 40,
  demandVariability: "off",
  leadTimeVariability: "off",
  ssQty: 200,
});
const bigLotsRun = own.runYear(bigLots, globals(), 3);
own.commentaryFromYear(bigLots, globals(), bigLotsRun).rules.forEach(function (rule) {
  seen[rule.id] = true;
  assert.match(rule.text, /^In the scenario you ran/);
  assertClean(rule.text, "big lots");
});
assert.ok(bigLotsRun.metrics.inventoryTurns < 6);
[1, 2, 3, 4, 5, 6, 7, 9].forEach(function (id) {
  assert.ok(seen[id], "matrix did not fire rule " + id);
});

const edges = [
  sku({ currentStock: 0, ssQty: 0, demandVariability: "medium" }),
  sku({ ssQty: 0, demandVariability: "large", leadTimeVariability: "large" }),
  sku({ unitCost: 80, sellingPrice: 70, demandVariability: "off" }),
];
edges.forEach(function (item) {
  const result = own.runYear(item, globals({ deliveryVariability: "small", shock: true }), 5);
  assert.ok(result.metrics.annualDemand >= 0);
  if (item.unitCost >= item.sellingPrice) {
    assert.ok(result.metrics.annualGp <= 0);
  }
  const commentary = own.commentaryFromYear(item, globals({ deliveryVariability: "small", shock: true }), result);
  commentary.rules.forEach(function (rule) { assertClean(rule.text, "edge"); });
});

const started = Date.now();
const heavy = [];
for (let i = 0; i < 10; i += 1) {
  heavy.push(sku({
    id: "sku-" + (i + 1),
    label: "SKU " + (i + 1),
    forecast: 20 + i,
    currentStock: 30 + i,
    leadTimeWeeks: (i % 26) + 1,
    demandVariability: "medium",
  }));
}
heavy.forEach(function (item) {
  own.runMonteCarlo(item, globals({ deliveryVariability: "medium", shock: true }), 99);
});
const elapsed = Date.now() - started;
assert.ok(elapsed < 2000, "10 SKUs x 50 runs took " + elapsed + "ms");

const examplePath = path.join(ROOT, "assets", "simulator-example.csv");
const example = fs.readFileSync(examplePath, "utf8");
const parsedExample = own.parseTable(example);
assert.strictEqual(parsedExample.ok, true, parsedExample.errors.join(" "));
assert.strictEqual(parsedExample.skus.length, 2);
assert.strictEqual(parsedExample.deliveryVariability, "off");
assert.strictEqual(parsedExample.shock, false);
const manual = own.validateScenario({
  deliveryVariability: "off",
  shock: false,
  skus: [
    {
      id: "sku-1",
      label: "Widget A",
      forecast: 40,
      demandVariability: "medium",
      leadTimeWeeks: 5,
      leadTimeVariability: "small",
      currentStock: 120,
      unitCost: 70,
      sellingPrice: 100,
      lotMode: "fixed",
      lotQty: 40,
      lotWeeks: 4,
      ssMode: "fixed",
      ssQty: 20,
      ssWeeks: 4,
      serviceLevel: 95,
    },
    {
      id: "sku-2",
      label: "Widget B",
      forecast: 25,
      demandVariability: "large",
      leadTimeWeeks: 8,
      leadTimeVariability: "off",
      currentStock: 40,
      unitCost: 12.5,
      sellingPrice: 20,
      lotMode: "weeks",
      lotQty: 25,
      lotWeeks: 6,
      ssMode: "formula",
      ssQty: 0,
      ssWeeks: 4,
      serviceLevel: 98,
    },
  ],
});
assert.strictEqual(manual.ok, true, manual.errors.join(" "));
assert.deepStrictEqual(parsedExample.skus, manual.scenario.skus);
const fromPaste = own.runYear(parsedExample.skus[1], { deliveryVariability: "off", shock: false }, 21);
const fromManual = own.runYear(manual.scenario.skus[1], manual.scenario, 21);
assert.deepStrictEqual(fromPaste.metrics, fromManual.metrics);
assert.strictEqual(fromPaste.safetyStock, fromManual.safetyStock);

const rows = ["sku,weekly_forecast,lead_time_weeks,current_stock,unit_cost,selling_price"];
for (let i = 0; i < 11; i += 1) {
  rows.push("Item " + (i + 1) + ",10,5,20,4,9");
}
const many = own.parseTable(rows.join("\n"));
assert.strictEqual(many.ok, true, many.errors.join(" "));
assert.strictEqual(many.skus.length, 10);
assert.strictEqual(many.ignoredRows, 1);
assert.ok(many.warnings.some(function (warning) { return /ignored/i.test(warning); }));

const tabbed = own.parseTable(
  "sku\tweekly_forecast\tlead_time_weeks\tcurrent_stock\tunit_cost\tselling_price\n\"Widget, A\"\t12\t3\t0\t1.25\t4\n"
);
assert.strictEqual(tabbed.ok, true, tabbed.errors.join(" "));
assert.strictEqual(tabbed.skus[0].label, "Widget, A");
assert.strictEqual(tabbed.skus[0].unitCost, 1.25);
assert.strictEqual(tabbed.skus[0].currentStock, 0);

const disagree = own.parseTable(
  "sku,weekly_forecast,lead_time_weeks,current_stock,unit_cost,selling_price,delivery_variability,demand_shock\nA,10,2,5,1,3,off,no\nB,10,2,5,1,3,large,yes\n"
);
assert.strictEqual(disagree.ok, true, disagree.errors.join(" "));
assert.strictEqual(disagree.deliveryVariability, "off");
assert.strictEqual(disagree.shock, false);
assert.ok(disagree.warnings.length >= 2);

const linked = own.validateScenario({
  seed: 99,
  deliveryVariability: "small",
  shock: true,
  skus: manual.scenario.skus,
}).scenario;
const encoded = own.encodeScenario(linked);
assert.strictEqual(encoded.ok, true, encoded.errors.join(" "));
assert.match(encoded.fragment, /^#d=/);
assert.ok(!encoded.fragment.includes("?"), encoded.fragment);
assert.ok(!encoded.fragment.includes("Widget"), "fragment is not plain text");
const decoded = own.decodeScenario(encoded.fragment);
assert.strictEqual(decoded.ok, true, decoded.errors.join(" "));
assert.strictEqual(decoded.scenario.seed, 99);
assert.strictEqual(decoded.scenario.deliveryVariability, "small");
assert.strictEqual(decoded.scenario.shock, true);
assert.strictEqual(decoded.scenario.skus[1].leadTimeWeeks, 8);
assert.strictEqual(decoded.scenario.skus[1].unitCost, 12.5);
assert.strictEqual(decoded.scenario.skus[1].sellingPrice, 20);
assert.strictEqual(decoded.scenario.skus[1].serviceLevel, 98);
assert.strictEqual(decoded.scenario.skus[1].lotWeeks, 6);
const again = own.decodeScenario(own.encodeScenario(decoded.scenario).fragment);
assert.deepStrictEqual(again.scenario, decoded.scenario);
const resolved = own.resolveRunSeed(decoded.scenario, true, 5);
assert.strictEqual(resolved.seed, 99);
assert.strictEqual(own.resolveRunSeed(decoded.scenario, false, 5).seed, 5);
const reopenSearch = own.encodeReopenSearch("monte-carlo", true);
assert.strictEqual(reopenSearch, "?m=mc&run=1");
assert.ok(!reopenSearch.includes("#"), "mode stays out of the fragment");
const reopenHref =
  "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/own-data/" +
  reopenSearch +
  "&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1" +
  encoded.fragment;
const reopenQuery = own.decodeReopenSearch(reopenHref);
assert.strictEqual(reopenQuery.specified, true);
assert.strictEqual(reopenQuery.mode, "monte-carlo");
assert.strictEqual(reopenQuery.run, true);
const reopenScenario = own.decodeScenario(reopenHref.slice(reopenHref.indexOf("#")));
assert.strictEqual(reopenScenario.ok, true, reopenScenario.errors.join(" "));
assert.strictEqual(reopenScenario.scenario.seed, 99);
assert.deepStrictEqual(reopenScenario.scenario.skus, decoded.scenario.skus);
assert.deepStrictEqual(reopenScenario.scenario, decoded.scenario);
const copiedSearch = own.decodeReopenSearch("");
assert.strictEqual(copiedSearch.specified, false);
assert.strictEqual(copiedSearch.run, false);
const utmOnly = own.decodeReopenSearch("?utm_source=share&utm_campaign=sim-results-v1");
assert.strictEqual(utmOnly.specified, false);
assert.strictEqual(utmOnly.run, false);
const yearWait = own.decodeReopenSearch(own.encodeReopenSearch("year", false));
assert.strictEqual(yearWait.mode, "year");
assert.strictEqual(yearWait.run, false);
assert.strictEqual(yearWait.specified, true);

const badLink = own.decodeScenario("#d=not-valid");
assert.strictEqual(badLink.ok, false);
assert.strictEqual(badLink.scenario.skus[0].label, "SKU 1");
assert.ok(badLink.errors.length > 0);

const badLead = own.encodeScenario(linked);
const broken = own.decodeScenario("#d=" + Buffer.from(JSON.stringify({
  v: 1,
  d: "o",
  k: 0,
  u: [["A", 10, "m", 99, "o", 5, 1, 2, "f", 10, 4, "f", 0, 4, 95]],
})).toString("base64url"));
assert.strictEqual(broken.ok, false);
assert.ok(broken.errors.some(function (error) { return /1 to 26/.test(error); }));
assert.strictEqual(broken.scenario.skus.length, 1);
assert.strictEqual(broken.scenario.skus[0].label, "SKU 1");
assert.ok(badLead.ok);

const wide = [];
for (let i = 0; i < 10; i += 1) {
  wide.push(sku({
    id: "sku-" + (i + 1),
    label: "ABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJ",
    forecast: 999999999,
    currentStock: 999999999,
    unitCost: 999999.99,
    sellingPrice: 999999.99,
    lotQty: 999999999,
    ssQty: 999999999,
    leadTimeWeeks: 26,
    demandVariability: "large",
    leadTimeVariability: "large",
    lotMode: "weeks",
    lotWeeks: 10,
    ssMode: "formula",
    serviceLevel: 99,
  }));
}
const wideEncoded = own.encodeScenario({
  seed: 4000000000,
  deliveryVariability: "large",
  shock: true,
  skus: wide,
});
assert.strictEqual(wideEncoded.ok, true, wideEncoded.errors.join(" "));
assert.ok(
  wideEncoded.length <= own.FRAGMENT_LIMIT,
  "10 SKU fragment is " + wideEncoded.length
);
const wideDecoded = own.decodeScenario(wideEncoded.fragment);
assert.strictEqual(wideDecoded.ok, true, wideDecoded.errors.join(" "));
assert.strictEqual(wideDecoded.scenario.skus.length, 10);
assert.strictEqual(wideDecoded.scenario.skus[9].label.length, 40);
assert.strictEqual(wideDecoded.scenario.skus[9].forecast, 999999999);

if (!fs.existsSync(PAGE)) {
  console.error("Built own-data page is missing. Run `npm run build` first.");
  process.exit(1);
}

function assertByteCopy(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath));
  const built = fs.readFileSync(path.join(SITE, relativePath));
  assert.ok(source.equals(built), relativePath + " must be copied unchanged");
}
assertByteCopy("assets/own-data-engine.js");
assertByteCopy("assets/own-data-simulator.js");
assertByteCopy("assets/simulator-example.csv");

const page = fs.readFileSync(PAGE, "utf8");
const ui = fs.readFileSync(path.join(ROOT, "assets", "own-data-simulator.js"), "utf8");
const flat = page.replace(/\s+/g, " ");
assert.match(page, /Illustrative estimate/);
assert.ok((page.match(/Illustrative estimate/g) || []).length >= 4);
assert.match(flat, /not a forecast, a recommendation, or advice for your business/);
assert.match(flat, /single average weekly forecast/);
assert.match(flat, /variability bands/);
assert.match(flat, /reorder rule/);
assert.match(flat, /does not calculate safety stock/);
assert.match(page, /#d=/);
assert.match(page, /href="\/assets\/simulator-example\.csv"/);
assert.match(page, /id="own-sku-bar"/);
assert.match(page, /Out-of-stock weeks/);
assert.match(page, /Customer service level/);
assert.match(page, /Inventory turns/);
assert.match(page, /Average working capital/);
assert.match(page, /Annual gross profit \(units sold\)/);
assert.match(flat, /only units actually sold/);
assert.match(flat, /could not be filled in a stockout is left out/);
assert.match(flat, /SOH means stock on hand/);
assert.match(flat, /In 8 out of 10 simulated years, the result falls inside it/);
assert.match(flat, /Z comes from the service level you pick/);
assert.match(flat, /square root of L spreads that weekly variation/);
assert.match(page, /src="\/assets\/own-data-engine\.js\?v=4"/);
assert.match(page, /src="\/assets\/sim-results-form\.js\?v=2"/);
assert.match(page, /src="\/assets\/own-data-simulator\.js\?v=4"/);
assert.ok(page.indexOf("own-data-engine.js") < page.indexOf("own-data-simulator.js"));
assert.match(page, /id="own-results-email" hidden/);
assert.match(page, /data-results-email="on"/);
assert.match(page, /data-sitekey="0x4AAAAAAFMWJU5owYhGcyrK"/);
assert.match(page, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
assert.match(page, /id="own-storage-on" hidden/);
assert.match(page, /We do not keep the summary or the link/);
assert.doesNotMatch(page, /sessionStorage/);
assert.doesNotMatch(ui, /sessionStorage|localStorage|fetch\(|XMLHttpRequest|sendBeacon/);
assert.match(ui, /setTimeout\(step, 0\)/);
assert.match(ui, /encodeScenario/);
assert.match(ui, /decodeReopenSearch/);
const ownBoot = ui.slice(ui.indexOf("function boot()"), ui.indexOf("if (document.readyState"));
assert.match(ownBoot, /if \(reopen\.run && state\.errors\.length === 0\)/);
assert.doesNotMatch(ownBoot, /fetch\(|RESEND|api\.resend/);
const copyBody = ui.slice(ui.indexOf("function copyLink()"), ui.indexOf("function onEdit("));
assert.match(copyBody, /buildResultsUrl/);
assert.doesNotMatch(copyBody, /location\.href|location\.search/);
const share = own.buildResultsUrl({
  origin: "https://practicalsupplychainplanning.com",
  pathname: "/learn/safety-stock-simulator/own-data/",
  scenario: own.defaultScenario(),
  mode: "year",
  run: false,
  utm: false,
});
assert.ok(share.includes("?m=year"));
assert.ok(!share.includes("run=1"));
assert.ok(share.includes("#d="));
const emailed = own.buildResultsUrl({
  origin: "https://practicalsupplychainplanning.com",
  pathname: "/learn/safety-stock-simulator/own-data/",
  scenario: own.defaultScenario(),
  mode: "monte-carlo",
  run: true,
  utm: true,
});
assert.ok(emailed.includes("m=mc"));
assert.ok(emailed.includes("run=1"));
assert.ok(emailed.includes("utm_campaign=sim-results-v1"));
assert.ok(emailed.indexOf("#d=") > emailed.indexOf("run=1"));
assert.match(ui, /prefers-reduced-motion: reduce/);
assertClean(page, "page");
assertClean(ui, "ui");

const engineSource = fs.readFileSync(path.join(ROOT, "assets", "own-data-engine.js"), "utf8");
assert.doesNotMatch(engineSource, /sessionStorage|fetch\(|RESEND|api\.resend/);

console.log("Own-data simulator checks OK.");
