#!/usr/bin/env node
/**
 * Developer self-check for the Learn safety stock simulator.
 * Covers the approved PRODUCT_SPEC behaviour, including CR1–CR3.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PAGE_PATH = path.join(ROOT, "learn", "safety-stock-simulator", "index.html");
const ENGINE_PATH = path.join(ROOT, "assets", "safety-stock-engine.js");
const UI_PATH = path.join(ROOT, "assets", "safety-stock-simulator.js");

const engine = require(ENGINE_PATH);
const page = fs.readFileSync(PAGE_PATH, "utf8");
const ui = fs.readFileSync(UI_PATH, "utf8");

function flat(value) {
  const demand = [];
  for (let i = 0; i < 52; i += 1) {
    demand.push(value);
  }
  return demand;
}

function run(overrides, seed) {
  return engine.runYear(
    Object.assign(
      {
        patternId: "level",
        lotMode: "fixed",
        lotQty: 40,
        ssMode: "fixed",
        ssQty: 20,
        serviceLevel: 95,
        leadTimeWeeks: 5,
        demandVariability: "off",
        leadTimeVariability: "off",
        deliveryVariability: "off",
        shock: false,
      },
      overrides
    ),
    seed == null ? 1 : seed
  );
}

assert.strictEqual(engine.roundHalfEven(0.5), 0);
assert.strictEqual(engine.roundHalfEven(1.5), 2);
assert.strictEqual(engine.roundHalfEven(2.5), 2);
assert.strictEqual(engine.roundHalfEven(3.5), 4);
assert.strictEqual(engine.roundHalfEven(-1.5), -2);
assert.strictEqual(engine.roundHalfEven(-2.5), -2);

const stdevValues = [1, 2, 3];
assert.ok(
  Math.abs(engine.populationStdev(stdevValues) - Math.sqrt(2 / 3)) < 1e-12,
  "population stdev uses ddof 0"
);

assert.strictEqual(engine.percentileLinear([10, 20, 30, 40], 10), 13);
assert.strictEqual(engine.percentileLinear([10, 20, 30, 40], 50), 25);
assert.strictEqual(engine.percentileLinear([10, 20, 30, 40], 90), 37);
assert.strictEqual(engine.percentileLinear([], 50), null);

const zeroWeeks = [];
for (let i = 0; i < 52; i += 1) {
  zeroWeeks.push({ endingSoh: 0, simulatedDemand: 5 });
}
const zeroMetrics = engine.computeMetrics(zeroWeeks);
assert.strictEqual(zeroMetrics.inventoryTurns, null, "turns are N/A when floored average is 0");
assert.strictEqual(zeroMetrics.oosWeeks, 0, "ending on zero is not a stockout");
assert.strictEqual(zeroMetrics.annualGp, 52 * 5 * 30);

const mixedWeeks = [];
for (let i = 0; i < 52; i += 1) {
  mixedWeeks.push({
    endingSoh: i === 0 ? -20 : i === 1 ? 0 : 10,
    simulatedDemand: 10,
  });
}
const mixed = engine.computeMetrics(mixedWeeks);
const floored = (10 * 50) / 52;
const raw = (-20 + 10 * 50) / 52;
assert.ok(Math.abs(mixed.avgSohTurns - floored) < 1e-9);
assert.ok(Math.abs(mixed.inventoryTurns - 520 / floored) < 1e-6);
assert.ok(Math.abs(mixed.averageWc - raw * 70) < 1e-6);
assert.ok(raw > 0 && raw < floored);
assert.ok(
  mixed.inventoryTurns < 520 / raw,
  "negatives must not improve turns versus Method A"
);
assert.strictEqual(mixed.oosWeeks, 1);
assert.strictEqual(mixed.annualGp, 520 * 30);
assert.notStrictEqual(mixed.averageWc, mixed.avgSohTurns * 70);

const cr1Demand = flat(1);
cr1Demand[0] = 25;
cr1Demand[1] = 25;
cr1Demand[2] = 25;
cr1Demand[3] = 25;
const cr1 = run({ baseDemand: cr1Demand, lotQty: 10, ssQty: 0 });
assert.strictEqual(cr1.startingSoh, 35);
assert.strictEqual(cr1.weeks[0].endingSoh, 10);
assert.strictEqual(cr1.weeks[0].plannedSupply, 0);
assert.strictEqual(cr1.releases[0].requirementWeek, 2);
assert.strictEqual(cr1.releases[0].lots, 2, "two lots even though the previous ending was positive");
assert.ok(cr1.weeks[0].endingSoh > 0);
assert.strictEqual(cr1.weeks[1].endingSoh, 5);
assert.strictEqual(cr1.weeks[2].endingSoh, 0);
assert.strictEqual(cr1.weeks[3].endingSoh, -5);
assert.strictEqual(cr1.releases[3].requirementWeek, 5);
assert.strictEqual(
  cr1.releases[3].lots,
  1,
  "one lot when the previous ending is negative but one lot clears zero"
);
assert.ok(cr1.metrics.oosWeeks >= 1);
assert.ok(cr1.metrics.avgSohTurns > cr1.metrics.averageWc / 70);

const atLine = run({ baseDemand: flat(10), lotQty: 10, ssQty: 10 });
assert.strictEqual(atLine.weeks[0].plannedSupply, 0, "calculated SOH equal to SS does not order");
assert.strictEqual(atLine.releases[0].requirementWeek, 2);
assert.strictEqual(atLine.releases[0].lots, 1);

const atZero = run({ baseDemand: flat(10), lotQty: 10, ssQty: 0 });
assert.strictEqual(atZero.weeks[1].endingSoh, 0);
assert.strictEqual(atZero.weeks[1].plannedSupply, 0, "calculated SOH of zero with no SS does not order");
assert.strictEqual(atZero.releases[0].requirementWeek, 3);
assert.strictEqual(atZero.releases[0].lots, 2, "one lot that lands on zero is not enough");
assert.strictEqual(atZero.metrics.oosWeeks, 0);

const sameWeek = run({
  baseDemand: flat(40),
  lotQty: 40,
  ssQty: 100,
  leadTimeWeeks: 10,
  leadTimeVariability: "off",
});
assert.strictEqual(sameWeek.releases[0].requirementWeek, 1);
assert.strictEqual(sameWeek.releases[0].delay, 0);
assert.strictEqual(sameWeek.releases[0].arrivalWeek, 1);
assert.strictEqual(sameWeek.weeks[0].plannedSupply, 40);
assert.ok(sameWeek.weeks.every((week) => week.safetyStock === 100));

assert.deepStrictEqual(engine.LT_EXTRA_MAX[2], { small: 1, medium: 1, large: 2 });
assert.deepStrictEqual(engine.LT_EXTRA_MAX[5], { small: 1, medium: 2, large: 3 });
assert.deepStrictEqual(engine.LT_EXTRA_MAX[10], { small: 1, medium: 3, large: 5 });

let droppedReceipt = false;
[2, 5, 10].forEach((leadTime) => {
  ["small", "medium", "large"].forEach((level) => {
    const extra = engine.leadTimeExtraMax(leadTime, level);
    const timed = run(
      {
        baseDemand: flat(20),
        lotQty: 10,
        ssQty: 1000,
        leadTimeWeeks: leadTime,
        leadTimeVariability: level,
      },
      4
    );
    const landed = timed.releases
      .filter((release) => release.arrivalWeek <= 52)
      .reduce((sum, release) => sum + release.received, 0);
    const planned = timed.weeks.reduce((sum, week) => sum + week.plannedSupply, 0);
    assert.strictEqual(planned, landed);
    timed.releases.forEach((release) => {
      assert.ok(release.delay >= 0 && release.delay <= extra);
      assert.strictEqual(release.arrivalWeek, release.requirementWeek + release.delay);
      if (release.arrivalWeek > 52) {
        droppedReceipt = true;
      }
    });
  });
});
assert.ok(droppedReceipt, "a delay past week 52 does not arrive inside the year");

const levelBase = flat(40);
const quiet = run({ deliveryVariability: "off" }, 9);
const noisyDelivery = run({ deliveryVariability: "large" }, 9);
assert.strictEqual(quiet.startingSoh, noisyDelivery.startingSoh);
assert.strictEqual(quiet.startingSoh, engine.roundHalfEven(levelBase[0] + 40));
assert.deepStrictEqual(quiet.simulatedDemand, noisyDelivery.simulatedDemand);

let sawShortReceipt = false;
for (let seed = 1; seed <= 15 && !sawShortReceipt; seed += 1) {
  const sample = run({ lotQty: 100, ssQty: 1000, deliveryVariability: "large" }, seed);
  sample.releases.forEach((release) => {
    release.lotReceipts.forEach((qty) => {
      assert.ok(qty <= 100 && qty >= 85);
      if (qty < 100) {
        sawShortReceipt = true;
      }
    });
  });
}
assert.ok(sawShortReceipt, "fixed-lot delivery noise can reduce a receipt");

assert.deepStrictEqual(
  engine.allowedLotReceipts(
    engine.normalizeControls({ lotMode: "fixed", lotQty: 10, deliveryVariability: "small" }),
    levelBase
  ),
  [10],
  "round(10 × 5%) is 0 under half-even rounding, so the lot is not reduced"
);
assert.deepStrictEqual(
  engine.allowedLotReceipts(
    engine.normalizeControls({
      lotMode: "weeks",
      lotWeeks: 6,
      deliveryVariability: "large",
    }),
    levelBase
  ),
  [240, 200, 160, 120]
);

const cover = run({
  lotMode: "weeks",
  lotWeeks: 4,
  deliveryVariability: "large",
  ssMode: "weeks",
  ssWeeks: 2,
});
assert.strictEqual(cover.nominalLot, 160);
assert.strictEqual(cover.startingSoh, 200);
assert.strictEqual(cover.safetyStock, 80);
cover.releases.forEach((release) => {
  const allowed = engine.allowedLotReceipts(cover.controls, cover.baseDemand);
  release.lotReceipts.forEach((qty) => {
    assert.ok(allowed.indexOf(qty) !== -1);
  });
});

const demandOff = run({ demandVariability: "off", shock: false }, 5);
assert.deepStrictEqual(demandOff.simulatedDemand, demandOff.baseDemand);
["small", "medium", "large"].forEach((level) => {
  const bounds = engine.DEMAND_FACTORS[level];
  const varied = run({ demandVariability: level, shock: false }, 6);
  varied.demandFactors.forEach((factor, index) => {
    assert.ok(factor >= bounds[0] && factor < bounds[1]);
    assert.strictEqual(
      varied.normalDemand[index],
      engine.roundHalfEven(varied.baseDemand[index] * factor)
    );
  });
});

const shockWeeksSeen = new Set();
for (let seed = 1; seed <= 25; seed += 1) {
  const shocked = run({ shock: true, demandVariability: "off" }, seed);
  assert.strictEqual(shocked.shockWeeks.length, 3);
  assert.ok(shocked.shockWeeks[0] >= 21 && shocked.shockWeeks[2] <= 52);
  assert.ok(shocked.shockWeeks[1] - shocked.shockWeeks[0] >= 4);
  assert.ok(shocked.shockWeeks[2] - shocked.shockWeeks[1] >= 4);
  shocked.weeks.forEach((week) => {
    const shockedWeek = shocked.shockWeeks.indexOf(week.week) !== -1;
    if (shockedWeek) {
      assert.strictEqual(week.simulatedDemand, week.baseDemand * 2);
    } else {
      assert.strictEqual(week.simulatedDemand, week.baseDemand);
    }
  });
  shockWeeksSeen.add(shocked.shockWeeks.join("-"));
  shocked.shockWeeks.forEach((weekNo) => {
    const week = shocked.weeks[weekNo - 1];
    assert.strictEqual(week.baseDemand, 40);
    assert.strictEqual(week.beginningSoh, 40);
    assert.strictEqual(week.simulatedDemand, 80, "shock week simulated demand is double the forecast");
    assert.strictEqual(week.plannedSupply, 40, "order one lot from base-netted calculated SOH");
    assert.strictEqual(
      week.endingSoh,
      0,
      "ending stock consumes the doubled demand in the shock week"
    );
    const release = shocked.releases.find((item) => item.requirementWeek === weekNo);
    assert.strictEqual(release.lots, 1);
    assert.strictEqual(release.delay, 0);
    assert.strictEqual(release.arrivalWeek, weekNo);
  });
}
assert.ok(shockWeeksSeen.size > 1, "shock weeks are redrawn for a new sample");

const exampleBase = flat(40);
exampleBase[21] = 55;
exampleBase[25] = 40;
exampleBase[32] = 62;
const shockExample = run(
  {
    baseDemand: exampleBase,
    shock: true,
    demandVariability: "off",
    leadTimeVariability: "off",
    deliveryVariability: "off",
  },
  109
);
assert.deepStrictEqual(shockExample.shockWeeks, [22, 26, 33]);
assert.deepStrictEqual(
  [22, 26, 33].map((weekNo) => shockExample.normalDemand[weekNo - 1]),
  [55, 40, 62]
);
assert.deepStrictEqual(
  [22, 26, 33].map((weekNo) => shockExample.simulatedDemand[weekNo - 1]),
  [110, 80, 124]
);
assert.deepStrictEqual(
  [22, 26, 33].map((weekNo) => shockExample.weeks[weekNo - 1].baseDemand),
  [55, 40, 62]
);
shockExample.weeks.forEach((week) => {
  const shockedWeek = shockExample.shockWeeks.indexOf(week.week) !== -1;
  if (!shockedWeek) {
    assert.strictEqual(week.simulatedDemand, week.baseDemand);
  }
});

function ordersFromBaseForecast(result) {
  result.weeks.forEach((week) => {
    const threshold = result.safetyStock > 0 ? result.safetyStock : 0;
    const calculated = week.beginningSoh - week.baseDemand;
    const lots = calculated < threshold ? (calculated + result.nominalLot > 0 ? 1 : 2) : 0;
    assert.strictEqual(week.plannedSupply, lots * result.nominalLot);
    assert.strictEqual(
      week.endingSoh,
      week.beginningSoh + week.plannedSupply - week.simulatedDemand
    );
  });
}
ordersFromBaseForecast(shockExample);
const variedOrders = run(
  {
    demandVariability: "medium",
    shock: true,
    leadTimeVariability: "off",
    deliveryVariability: "off",
  },
  17
);
assert.notDeepStrictEqual(variedOrders.simulatedDemand, variedOrders.baseDemand);
ordersFromBaseForecast(variedOrders);
variedOrders.shockWeeks.forEach((weekNo) => {
  const index = weekNo - 1;
  assert.strictEqual(
    variedOrders.simulatedDemand[index],
    engine.roundHalfEven(variedOrders.normalDemand[index] * 2)
  );
  assert.strictEqual(variedOrders.weeks[index].baseDemand, variedOrders.baseDemand[index]);
});

const streamSeed = 99;
const withShock = run({ demandVariability: "medium", shock: true }, streamSeed);
const shockOff = run({ demandVariability: "medium", shock: false }, streamSeed);
assert.deepStrictEqual(withShock.normalDemand, shockOff.normalDemand);
assert.notDeepStrictEqual(withShock.simulatedDemand, shockOff.simulatedDemand);
const factorsOff = run({ demandVariability: "off", shock: true }, streamSeed);
assert.notDeepStrictEqual(withShock.shockWeeks, factorsOff.shockWeeks);
const leadOn = run(
  { demandVariability: "medium", shock: true, leadTimeVariability: "large", leadTimeWeeks: 10 },
  streamSeed
);
assert.deepStrictEqual(withShock.simulatedDemand, leadOn.simulatedDemand);
assert.deepStrictEqual(withShock.shockWeeks, leadOn.shockWeeks);
assert.deepStrictEqual(run({ demandVariability: "medium" }, streamSeed).weeks, run({ demandVariability: "medium" }, streamSeed).weeks);

const lowSs = run({ ssQty: 0, demandVariability: "off" }, 3);
const highSs = run({ ssQty: 500, demandVariability: "off" }, 3);
assert.deepStrictEqual(lowSs.simulatedDemand, highSs.simulatedDemand);
assert.strictEqual(lowSs.metrics.annualGp, highSs.metrics.annualGp);
assert.strictEqual(lowSs.metrics.annualGp, lowSs.metrics.annualDemand * 30);
assert.strictEqual(lowSs.metrics.annualGp, lowSs.metrics.annualDemand * engine.PRICES.gp);

const levelFormula = run({ ssMode: "formula", patternId: "level", demandVariability: "off" });
assert.strictEqual(levelFormula.safetyStock, 0);
assert.strictEqual(levelFormula.formula.sigma, 0);

function expectedFormula(patternId, serviceLevel, leadTimeWeeks) {
  const normal = engine.baseDemandFor({ patternId: patternId });
  const sigma = engine.populationStdev(normal);
  return engine.roundHalfEven(
    engine.Z_BY_SERVICE_LEVEL[serviceLevel] * sigma * Math.sqrt(leadTimeWeeks)
  );
}

[90, 95, 98, 99].forEach((serviceLevel) => {
  [2, 5, 10].forEach((leadTimeWeeks) => {
    const formulaRun = run({
      ssMode: "formula",
      patternId: "rising",
      demandVariability: "off",
      shock: true,
      serviceLevel: serviceLevel,
      leadTimeWeeks: leadTimeWeeks,
    });
    assert.strictEqual(
      formulaRun.safetyStock,
      expectedFormula("rising", serviceLevel, leadTimeWeeks)
    );
    assert.ok(formulaRun.safetyStock > 0);
    assert.ok(formulaRun.weeks.every((week) => week.safetyStock === formulaRun.safetyStock));
    assert.deepStrictEqual(formulaRun.normalDemand, formulaRun.baseDemand);
  });
});
const z95l5 = expectedFormula("rising", 95, 5);
const z99l10 = expectedFormula("rising", 99, 10);
assert.notStrictEqual(z95l5, z99l10);

const noisyFormula = run(
  { ssMode: "formula", patternId: "seasonal", demandVariability: "large", shock: true },
  11
);
const noisyFormulaQuiet = run(
  { ssMode: "formula", patternId: "seasonal", demandVariability: "large", shock: false },
  11
);
assert.deepStrictEqual(noisyFormula.normalDemand, noisyFormulaQuiet.normalDemand);
assert.strictEqual(noisyFormula.safetyStock, noisyFormulaQuiet.safetyStock);
assert.strictEqual(noisyFormula.formula.sigma, engine.populationStdev(noisyFormula.normalDemand));
assert.notStrictEqual(
  engine.populationStdev(noisyFormula.simulatedDemand),
  noisyFormula.formula.sigma
);
assert.strictEqual(
  noisyFormula.safetyStock,
  engine.formulaSafetyStock(noisyFormula.normalDemand, 95, 5)
);

const monteCarlo = engine.runMonteCarlo(noisyFormula.controls, 12345, {
  runs: 50,
  frozenSafetyStock: noisyFormula.safetyStock,
});
assert.strictEqual(monteCarlo.runs.length, 50);
assert.strictEqual(monteCarlo.frozenSafetyStock, noisyFormula.safetyStock);
const demandSignatures = new Set();
const shockSignatures = new Set();
monteCarlo.runs.forEach((batchRun) => {
  assert.strictEqual(batchRun.safetyStock, noisyFormula.safetyStock);
  assert.strictEqual(batchRun.weeks.length, 52);
  assert.strictEqual(batchRun.shockWeeks.length, 3);
  assert.ok(batchRun.shockWeeks[1] - batchRun.shockWeeks[0] >= 4);
  assert.ok(batchRun.shockWeeks[2] - batchRun.shockWeeks[1] >= 4);
  batchRun.shockWeeks.forEach((weekNo) => {
    const index = weekNo - 1;
    assert.strictEqual(
      batchRun.simulatedDemand[index],
      engine.roundHalfEven(batchRun.normalDemand[index] * 2)
    );
    assert.strictEqual(batchRun.weeks[index].baseDemand, batchRun.baseDemand[index]);
  });
  demandSignatures.add(batchRun.simulatedDemand.join(","));
  shockSignatures.add(batchRun.shockWeeks.join("-"));
});
assert.ok(demandSignatures.size > 1);
assert.ok(shockSignatures.size > 1, "Monte Carlo redraws shock weeks");

const autoFrozen = engine.runMonteCarlo(noisyFormula.controls, 12345, { runs: 50 });
const reference = engine.runYear(
  noisyFormula.controls,
  engine.formulaReferenceSeed(12345)
);
autoFrozen.runs.forEach((batchRun) => {
  assert.strictEqual(batchRun.safetyStock, reference.safetyStock);
});
assert.strictEqual(new Set(autoFrozen.seeds).size, 50);

assert.deepStrictEqual(Object.keys(monteCarlo.summary.annualGp), ["median"]);
["oosWeeks", "csl", "inventoryTurns", "averageWc"].forEach((key) => {
  assert.deepStrictEqual(Object.keys(monteCarlo.summary[key]).filter((name) => name !== "observations").sort(), [
    "median",
    "p10",
    "p90",
  ].sort());
  assert.ok(!("p5" in monteCarlo.summary[key]));
  assert.ok(!("p95" in monteCarlo.summary[key]));
  assert.ok(!("min" in monteCarlo.summary[key]));
  assert.ok(!("max" in monteCarlo.summary[key]));
});

function fakeRun(oos, turns) {
  return {
    metrics: {
      oosWeeks: oos,
      csl: ((52 - oos) / 52) * 100,
      inventoryTurns: turns,
      averageWc: 100,
      annualGp: 3000,
    },
  };
}
const skippedTurns = engine.summariseMonteCarlo([
  fakeRun(1, null),
  fakeRun(2, 10),
  fakeRun(3, 30),
]);
assert.strictEqual(skippedTurns.inventoryTurns.observations, 2);
assert.strictEqual(skippedTurns.inventoryTurns.median, 20);
assert.strictEqual(skippedTurns.oosWeeks.median, 2);
assert.strictEqual(skippedTurns.annualGp.median, 3000);

assert.strictEqual(
  engine.needsPedagogyCallout({ inventoryTurns: 20, csl: 90, oosWeeks: 6 }),
  true
);
assert.strictEqual(
  engine.needsPedagogyCallout({ inventoryTurns: 20, csl: 100, oosWeeks: 0 }),
  false
);
assert.strictEqual(
  engine.needsPedagogyCallout({ inventoryTurns: null, csl: 40, oosWeeks: 20 }),
  false
);
assert.strictEqual(
  engine.needsPedagogyCallout({ inventoryTurns: 3, csl: 40, oosWeeks: 20 }),
  false
);
const thin = run({ baseDemand: flat(40), lotQty: 5, ssQty: 0 });
assert.strictEqual(engine.needsPedagogyCallout(thin.metrics), true);
assert.ok(thin.metrics.averageWc < thin.metrics.avgSohTurns * engine.PRICES.cost);

assert.deepStrictEqual(engine.VISIBLE_WEEK_COLUMNS, [
  "Week",
  "Base demand",
  "Simulated demand",
  "Beginning SOH",
  "Planned supply",
  "Ending SOH",
  "Safety stock",
]);
assert.deepStrictEqual(Object.keys(cr1.weeks[0]).sort(), [
  "baseDemand",
  "beginningSoh",
  "endingSoh",
  "plannedSupply",
  "safetyStock",
  "simulatedDemand",
  "week",
].sort());

assert.match(page, /sessionStorage/);
assert.match(page, /Teaching tool only/);
assert.match(page, /not suitable for real\s+operational use/i);
assert.match(page, /\$100/);
assert.match(page, /\$70/);
assert.match(page, /\$30/);
assert.match(page, /id="sim-service-level"/);
assert.match(page, /90%/);
assert.match(page, /95%/);
assert.match(page, /98%/);
assert.match(page, /99%/);
assert.match(page, /Short \(2 weeks\)/);
assert.match(page, /Medium \(5 weeks\)/);
assert.match(page, /Long \(10 weeks\)/);
assert.match(page, /id="sim-mode-band"/);
assert.match(page, /id="sim-run-year"/);
assert.match(page, /Run year/);
assert.match(page, />One year</);
assert.match(page, /id="sim-run-mc"/);
assert.match(page, /Run Monte Carlo/);
assert.match(page, /Double three demand weeks/);
assert.match(page, /doubles demand in three separate weeks/);
const flatPage = page.replace(/\s+/g, " ");
const practiceSentence =
  "In practice that can look like a large unexpected customer order, an unplanned promotion, or a competitor running out of stock and sending extra demand your way.";
assert.strictEqual(
  flatPage.split(practiceSentence).length - 1,
  1,
  "demand-shock examples appear once"
);
const variabilitySlice = flatPage.slice(
  flatPage.indexOf(">Variability<"),
  flatPage.indexOf(">Demand shock<")
);
assert.ok(
  variabilitySlice.includes("or picking errors."),
  "variability ends at picking errors"
);
assert.ok(!variabilitySlice.includes(practiceSentence));
const shockSlice = flatPage.slice(
  flatPage.indexOf(">Demand shock<"),
  flatPage.indexOf(">One simulated year<")
);
assert.ok(shockSlice.includes(practiceSentence));
assert.equal(
  (shockSlice.match(/id="sim-run-year"/g) || []).length,
  1,
  "Run year button is inside the Demand shock card exactly once"
);
assert.equal(
  (shockSlice.match(/id="sim-run-mc"/g) || []).length,
  1,
  "Run Monte Carlo button is inside the Demand shock card exactly once"
);
assert.ok(
  shockSlice.includes(
    "The chart, weekly table, and Monte Carlo summary stay empty until you press the button for this mode. Changing a setting clears them."
  ),
  "run helper note sits in the Demand shock card"
);
assert.match(page, /minus this week's base forecast/);
assert.match(page, /Ending stock subtracts simulated demand/);
assert.doesNotMatch(page, /Triple|tripled|3×/);
const teachingAt = page.indexOf("Teaching tool only");
const modeAt = page.indexOf('id="sim-mode-band"');
const patternAt = page.indexOf("Base demand pattern");
assert.ok(teachingAt !== -1 && modeAt > teachingAt, "mode band follows the teaching framing");
assert.ok(patternAt > modeAt, "mode band comes before the setup sections");
const modeBand = page.slice(modeAt, patternAt);
assert.match(modeBand, />One year</);
assert.match(modeBand, />Monte Carlo</);
assert.doesNotMatch(modeBand, /id="sim-run-year"/);
assert.doesNotMatch(modeBand, /id="sim-run-mc"/);
assert.equal(page.split('id="sim-run-mc"').length - 1, 1);
assert.equal(page.split('id="sim-run-year"').length - 1, 1);
assert.equal(page.split('id="sim-demand-shock"').length - 1, 1);
assert.match(page, /P10–P90/);
assert.match(page, /median only/i);
assert.doesNotMatch(page, /planned_order/);
assert.doesNotMatch(page, /P5|P95/);
assert.doesNotMatch(page, /railway|streamlit|sqlite/i);
assert.doesNotMatch(page, /<input[^>]*(price|sell-price|unit-cost)/i);
engine.VISIBLE_WEEK_COLUMNS.forEach((column) => {
  assert.ok(page.indexOf(column) !== -1, column);
});

assert.match(ui, /sessionStorage/);
assert.match(ui, /STORAGE_KEY/);
assert.match(ui, /frozenSafetyStock/);
assert.match(ui, /sim-run-mc/);
assert.doesNotMatch(ui, /planned_order/);
assert.doesNotMatch(ui, /P5|P95/);
assert.doesNotMatch(ui, /railway|streamlit|sqlite/i);
const bootStart = ui.indexOf("function boot()");
const bootBody = ui.slice(bootStart, ui.indexOf("if (document.readyState"));
assert.doesNotMatch(bootBody, /runMonteCarloClicked|runYearClicked|engine\.runMonteCarlo|engine\.runYear/);
const changeBody = ui.slice(
  ui.indexOf("function onControlsChanged()"),
  ui.indexOf("function setMode(")
);
assert.match(changeBody, /clearStaleOutputs/);
assert.doesNotMatch(changeBody, /engine\.runYear|engine\.runMonteCarlo|runYearClicked|runMonteCarloClicked/);
const modeBody = ui.slice(ui.indexOf("function setMode("), ui.indexOf("function restoreSession"));
assert.doesNotMatch(modeBody, /engine\.runYear|engine\.runMonteCarlo|runYearClicked|runMonteCarloClicked/);

const about = fs.readFileSync(path.join(ROOT, "about", "index.html"), "utf8");
assert.match(about, /free educational/);
assert.match(about, /\/learn\/safety-stock-simulator\//);
assert.match(about, />Learn<\/a>/);

console.log("Safety stock simulator checks OK.");
