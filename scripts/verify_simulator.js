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
const SITE = path.join(ROOT, "_site");
const PAGE_PATH = path.join(SITE, "learn", "safety-stock-simulator", "index.html");
const ENGINE_PATH = path.join(ROOT, "assets", "safety-stock-engine.js");
const UI_PATH = path.join(ROOT, "assets", "safety-stock-simulator.js");

if (!fs.existsSync(PAGE_PATH)) {
  console.error(
    "Built simulator page is missing. Run `npm run build` before scripts/verify_simulator.js."
  );
  process.exit(1);
}

const engine = require(ENGINE_PATH);
const page = fs.readFileSync(PAGE_PATH, "utf8");
const ui = fs.readFileSync(UI_PATH, "utf8");

function assertByteCopy(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath));
  const built = fs.readFileSync(path.join(SITE, relativePath));
  assert.ok(
    source.equals(built),
    `${relativePath} in _site must be a byte copy of the source file`
  );
}

assertByteCopy("assets/safety-stock-engine.js");
assertByteCopy("assets/safety-stock-simulator.js");
assertByteCopy("learn/safety-stock-simulator/scenarios.json");

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
assert.ok(Math.abs(mixed.averageWc - floored * 70) < 1e-6);
assert.ok(raw > 0 && raw < floored);
assert.ok(
  mixed.inventoryTurns < 520 / raw,
  "negatives must not improve turns versus Method A"
);
assert.strictEqual(mixed.oosWeeks, 1);
assert.strictEqual(mixed.annualGp, 520 * 30);
assert.ok(Math.abs(mixed.averageWc - mixed.avgSohTurns * 70) < 1e-9);
assert.ok(mixed.averageWc >= 0);

const cr1Demand = flat(1);
cr1Demand[0] = 25;
cr1Demand[1] = 25;
cr1Demand[2] = 25;
cr1Demand[3] = 25;
const cr1 = run({ baseDemand: cr1Demand, lotQty: 10, ssQty: 0 });
assert.strictEqual(cr1.startingSoh, 10);
assert.strictEqual(cr1.weeks[0].beginningSoh, 10);
assert.strictEqual(cr1.weeks[0].endingSoh, -15);
assert.strictEqual(cr1.weeks[0].plannedSupply, 0);
assert.ok(cr1.metrics.oosWeeks > 0, "the lead time leaves the early spike uncovered");
assert.ok(Math.abs(cr1.metrics.avgSohTurns - cr1.metrics.averageWc / 70) < 1e-9);
assert.ok(cr1.metrics.averageWc >= 0);

const twoLots = run({ baseDemand: flat(100), lotQty: 1, ssQty: 0 });
assert.ok(
  twoLots.releases.some((release) => release.lots > 1),
  "more than one lot when one lot leaves the week below safety stock"
);
twoLots.releases.forEach((release) => {
  assert.strictEqual(release.nominalQuantity, release.lots * release.nominalLot);
});

function assertLeadTimeBoundary(result, leadTime) {
  assert.ok(result.releases.length > 0, "LT " + leadTime + " still releases");
  result.releases.forEach((release) => {
    assert.strictEqual(release.plannedDueDay, release.releaseDay + leadTime * 7);
    assert.strictEqual(release.actualArrivalDay, release.plannedDueDay + release.privateDelayWeeks * 7);
    assert.ok(release.actualArrivalDay >= release.releaseDay + leadTime * 7);
    assert.strictEqual(release.plannedDueWeek, release.releaseWeek + leadTime);
    assert.strictEqual(release.nominalQuantity, release.lots * release.nominalLot);
  });
  result.days.forEach((day) => {
    if (day.plannedSupply > 0) {
      const arrived = result.releases.filter((release) => release.actualArrivalDay === day.day);
      const sum = arrived.reduce((total, release) => total + release.privateQuantity, 0);
      assert.strictEqual(day.plannedSupply, sum);
      arrived.forEach((release) => {
        assert.ok(day.day >= release.releaseDay + leadTime * 7);
      });
    }
  });
}

[2, 5, 10].forEach((leadTime) => {
  ["off", "large"].forEach((level) => {
    const timed = run(
      {
        baseDemand: flat(40),
        lotQty: 40,
        ssQty: 0,
        leadTimeWeeks: leadTime,
        demandVariability: level === "off" ? "off" : "large",
        leadTimeVariability: level,
        deliveryVariability: level,
        shock: false,
      },
      4
    );
    assertLeadTimeBoundary(timed, leadTime);
    if (leadTime === 5 && level === "off") {
      assert.strictEqual(timed.releases[0].releaseWeek, 1);
      assert.strictEqual(timed.releases[0].plannedDueWeek, 6);
      assert.strictEqual(timed.releases[0].actualArrivalDay, 36);
      timed.weeks.slice(0, 5).forEach((week) => {
        assert.strictEqual(week.plannedSupply, 0, "week " + week.week + " is inside the fence");
      });
      assert.ok(timed.weeks[2].endingSoh < 0, "the uncovered weeks stay visible");
      assert.ok(timed.releases.length >= 2, "a later order is still allowed");
      assert.ok(timed.releases[1].plannedDueWeek > timed.releases[0].plannedDueWeek);
    }
  });
});

const fence = run({
  baseDemand: flat(40),
  lotQty: 40,
  ssQty: 0,
  leadTimeWeeks: 5,
  demandVariability: "off",
  leadTimeVariability: "off",
  deliveryVariability: "off",
  shock: false,
});
assert.strictEqual(fence.startingSoh, 40);
assert.strictEqual(fence.weeks[0].beginningSoh, fence.startingSoh);
assert.strictEqual(fence.days[0].beginningSoh, fence.startingSoh);
assert.ok(
  Math.abs(fence.weeks[0].beginningSoh - fence.weeks[0].simulatedDemand + fence.weeks[0].plannedSupply - fence.weeks[0].endingSoh) < 1e-9
);
assert.strictEqual(fence.days.length, 364);
assert.strictEqual(fence.metrics.annualDemand, 2080);
assert.ok(fence.releases.length < 60, "orders are weekly, not one a day");
fence.releases.forEach((release) => {
  assert.strictEqual((release.releaseDay - 1) % 7, 0, "release is the weekly review");
});
const releaseWeeks = fence.releases.map((release) => release.releaseWeek);
assert.strictEqual(new Set(releaseWeeks).size, releaseWeeks.length, "one release per review");
assert.ok(fence.metrics.averageWc >= 0);
assert.ok(Math.abs(fence.metrics.averageWc - fence.metrics.avgSohTurns * 70) < 1e-6);

function weekClose(week) {
  return week.beginningSoh - week.simulatedDemand + week.plannedSupply;
}
const baseline = run({
  lotMode: "fixed",
  lotQty: 160,
  ssQty: 0,
  leadTimeWeeks: 2,
  demandVariability: "off",
  leadTimeVariability: "off",
  deliveryVariability: "off",
  shock: false,
});
const baselineCover = run({
  lotMode: "weeks",
  lotWeeks: 4,
  ssQty: 0,
  leadTimeWeeks: 2,
  demandVariability: "off",
  leadTimeVariability: "off",
  deliveryVariability: "off",
  shock: false,
});
[baseline, baselineCover].forEach((result) => {
  assert.strictEqual(result.startingSoh, 160);
  assert.strictEqual(result.metrics.oosWeeks, 0);
  assert.strictEqual(result.metrics.annualDemand, 2080);
  const shown = result.weeks.slice(0, 9).map((week) => [
    week.beginningSoh,
    week.preReceiptSoh,
    week.plannedSupply,
    week.endingSoh,
  ]);
  assert.deepStrictEqual(shown, [
    [160, 120, 0, 120],
    [120, 80, 0, 80],
    [80, 40, 0, 40],
    [40, 0, 0, 0],
    [0, 0, 160, 120],
    [120, 80, 0, 80],
    [80, 40, 0, 40],
    [40, 0, 0, 0],
    [0, 0, 160, 120],
  ]);
  result.days.forEach((day) => {
    assert.ok(day.preReceiptSoh >= -1e-9, "day " + day.day);
  });
  result.releases.forEach((release) => {
    assert.ok(release.actualArrivalDay >= release.releaseDay + 14);
    assert.strictEqual(release.actualArrivalDay, release.plannedDueDay);
  });
});

[40, 80, 120, 160, 400, 600].forEach((lotQty) => {
  [2, 5, 10].forEach((leadTime) => {
    [0, 20].forEach((safetyStock) => {
      const sample = run({
        lotQty: lotQty,
        ssQty: safetyStock,
        leadTimeWeeks: leadTime,
        demandVariability: "off",
        leadTimeVariability: "off",
        deliveryVariability: "off",
        shock: false,
      });
      assert.strictEqual(sample.startingSoh, lotQty + safetyStock);
      sample.weeks.forEach((week) => {
        assert.ok(Math.abs(weekClose(week) - week.endingSoh) < 1e-6, lotQty + " LT" + leadTime);
      });
      sample.releases.forEach((release) => {
        assert.ok(
          release.actualArrivalDay >= release.releaseDay + leadTime * 7,
          "no early receipt"
        );
      });
      const firstReceipt = sample.weeks.find((week) => week.plannedSupply > 0);
      if (firstReceipt) {
        assert.ok(firstReceipt.week >= 1 + leadTime);
      }
      sample.days.forEach((day) => {
        if (Math.abs(day.beginningSoh) < 1e-9 && day.plannedSupply > 0) {
          assert.ok(day.preReceiptSoh >= -1e-9, "zero opening is not a one-day dip");
        }
      });
    });
  });
});
const insideFence = run({
  lotQty: 160,
  ssQty: 0,
  leadTimeWeeks: 5,
  demandVariability: "off",
  leadTimeVariability: "off",
  deliveryVariability: "off",
  shock: false,
});
assert.ok(insideFence.weeks[4].endingSoh < -1, "week 5 is inside a 5-week fence");
assert.strictEqual(insideFence.weeks[4].plannedSupply, 0);
assert.ok(insideFence.metrics.oosWeeks > 0);
const shortLot = run({
  lotQty: 40,
  ssQty: 0,
  leadTimeWeeks: 2,
  demandVariability: "off",
});
assert.ok(shortLot.metrics.oosWeeks > 0, "a one-week lot cannot cover a 2-week lead time");
const noisyShort = run(
  {
    lotQty: 160,
    ssQty: 0,
    leadTimeWeeks: 2,
    demandVariability: "large",
    leadTimeVariability: "large",
    deliveryVariability: "large",
    shock: true,
  },
  4
);
assert.ok(noisyShort.metrics.oosWeeks > 0, "variability can still stock out");
noisyShort.releases.forEach((release) => {
  assert.ok(release.actualArrivalDay >= release.releaseDay + 14);
  noisyShort.reviews.forEach((review) => {
    const seen = review.outstanding.concat(review.releasedNow).find((order) => order.id === release.id);
    if (seen) {
      assert.strictEqual(seen.plannerQuantity, release.nominalQuantity);
    }
  });
});

const calm = run({ demandVariability: "off", shock: false, ssQty: 0, lotQty: 400, leadTimeWeeks: 5 });
const wild = run({ demandVariability: "large", shock: false, ssQty: 0, lotQty: 400, leadTimeWeeks: 5 }, 3);
let replanned = false;
wild.reviews.forEach((review, index) => {
  if (index > 0) {
    assert.strictEqual(review.onHand, wild.weeks[index - 1].endingSoh);
  }
  review.projection.forEach((row) => {
    assert.strictEqual(row.forecast, wild.baseDemand[row.week - 1]);
  });
  if (review.onHand !== calm.reviews[index].onHand) {
    replanned = true;
  }
});
assert.ok(replanned, "observed demand changes the next review's opening stock");

const knownLot = run(
  {
    lotQty: 400,
    ssQty: 0,
    leadTimeWeeks: 5,
    demandVariability: "off",
    leadTimeVariability: "large",
    deliveryVariability: "large",
    shock: false,
  },
  1
);
const shortLate = knownLot.releases.find(
  (release) => release.privateDelayWeeks > 0 && release.privateQuantity < release.nominalQuantity
);
assert.ok(shortLate, "seed 1 has a late short receipt");
assert.strictEqual(shortLate.nominalQuantity, 400);
assert.strictEqual(shortLate.privateQuantity, 392);
assert.strictEqual(shortLate.privateDelayWeeks, 3);
assert.strictEqual(shortLate.plannedDueWeek, 11);
assert.strictEqual(shortLate.plannedDueDay, 71);
assert.strictEqual(shortLate.actualArrivalWeek, 14);
assert.strictEqual(shortLate.actualArrivalDay, 92);
assert.strictEqual(shortLate.delayRecognizedDay, 71);
knownLot.reviews.forEach((review) => {
  review.outstanding.concat(review.releasedNow).forEach((order) => {
    assert.strictEqual(order.plannerQuantity, order.nominalQuantity);
  });
  const seen = review.outstanding.concat(review.releasedNow).find((order) => order.id === shortLate.id);
  if (!seen) {
    return;
  }
  assert.strictEqual(seen.plannerQuantity, 400);
  if (review.week < shortLate.plannedDueWeek) {
    assert.strictEqual(seen.delayRecognized, false);
    assert.strictEqual(seen.knownDueWeek, shortLate.plannedDueWeek);
  }
  if (review.week === shortLate.plannedDueWeek + 1) {
    assert.strictEqual(seen.delayRecognized, true);
    assert.strictEqual(seen.knownDueWeek, shortLate.plannedDueWeek + 1);
    assert.notStrictEqual(seen.knownDueDay, shortLate.actualArrivalDay);
  }
  if (review.week === shortLate.actualArrivalWeek) {
    assert.strictEqual(seen.knownDueWeek, shortLate.actualArrivalWeek);
    assert.strictEqual(seen.plannerQuantity, 400);
  }
});
const slippedReview = knownLot.reviews[shortLate.plannedDueWeek];
assert.strictEqual(
  slippedReview.projection.find((row) => row.week === shortLate.actualArrivalWeek).knownIncoming,
  0,
  "the review after the miss does not count the private arrival week"
);
const arrivalReview = knownLot.reviews[shortLate.actualArrivalWeek - 1];
const arrivalRow = arrivalReview.projection.find((row) => row.week === shortLate.actualArrivalWeek);
assert.strictEqual(arrivalRow.knownIncoming, 400, "the plan still expects the full lot on the arrival review");
assert.strictEqual(knownLot.weeks[shortLate.plannedDueWeek - 1].plannedSupply, 0);
assert.strictEqual(knownLot.weeks[shortLate.actualArrivalWeek - 1].plannedSupply, 392);

const coveredLate = run(
  {
    lotMode: "weeks",
    lotWeeks: 10,
    ssQty: 0,
    leadTimeWeeks: 5,
    demandVariability: "off",
    leadTimeVariability: "large",
    deliveryVariability: "large",
    shock: false,
  },
  4
);
const orderFour = coveredLate.releases.find((release) => release.releaseWeek === 32);
assert.ok(orderFour);
assert.strictEqual(orderFour.plannedDueDay, 253);
assert.strictEqual(orderFour.plannedDueWeek, 37);
assert.strictEqual(orderFour.actualArrivalDay, 274);
assert.strictEqual(orderFour.actualArrivalWeek, 40);
assert.strictEqual(orderFour.privateQuantity, 320);
assert.strictEqual(orderFour.nominalQuantity, 400);
assert.strictEqual(coveredLate.reviews[36].outstanding.find((order) => order.id === orderFour.id).knownDueWeek, 37);
assert.strictEqual(coveredLate.reviews[38].outstanding.find((order) => order.id === orderFour.id).knownDueWeek, 39);
assert.strictEqual(
  coveredLate.reviews[38].projection.find((row) => row.week === 40).knownIncoming,
  0
);
assert.strictEqual(coveredLate.weeks[39].plannedSupply, 320);

const horizonBase = flat(40);
function hiddenPlan(actualArrivalDay, privateQuantity) {
  return engine.planReview({
    weekIndex: 39,
    onHand: -120,
    base: horizonBase,
    safetyStock: 0,
    nominalLot: 400,
    leadTimeWeeks: 5,
    outstanding: [
      {
        nominalQuantity: 400,
        knownDueDay: 274,
        actualArrivalDay: actualArrivalDay,
        privateQuantity: privateQuantity,
      },
    ],
  });
}
assert.deepStrictEqual(hiddenPlan(281, 320), hiddenPlan(999, 10));
const sameWeekRecovery = engine.planReview({
  weekIndex: 3,
  onHand: -80,
  base: horizonBase,
  safetyStock: 0,
  nominalLot: 40,
  leadTimeWeeks: 1,
  outstanding: [
    { nominalQuantity: 40, knownDueDay: 29 },
    { nominalQuantity: 40, knownDueDay: 29 },
  ],
});
const weekFive = sameWeekRecovery.projection.find((row) => row.week === 5);
assert.ok(weekFive.addedNominal >= 40, "another lot is due in the pipeline week");
assert.strictEqual(weekFive.end >= 0, true);
assert.ok(sameWeekRecovery.suggestions.some((item) => item.dueWeekIndex === 4));
const onTheLine = engine.planReview({
  weekIndex: 0,
  onHand: 60,
  base: horizonBase,
  safetyStock: 20,
  nominalLot: 40,
  leadTimeWeeks: 5,
  outstanding: [],
});
assert.strictEqual(onTheLine.projection[0].addedNominal, 0);
assert.strictEqual(onTheLine.projection[0].end, 20);
const oneLotShort = engine.planReview({
  weekIndex: 0,
  onHand: 15,
  base: horizonBase,
  safetyStock: 20,
  nominalLot: 40,
  leadTimeWeeks: 0,
  outstanding: [],
});
assert.strictEqual(oneLotShort.projection[0].lots, 2);
assert.strictEqual(oneLotShort.projection[0].end, 55);
const sizedBacklog = engine.planReview({
  weekIndex: 0,
  onHand: -200,
  base: horizonBase,
  safetyStock: 20,
  nominalLot: 40,
  leadTimeWeeks: 0,
  outstanding: [],
});
assert.ok(sizedBacklog.projection[0].lots > 2);
assert.ok(sizedBacklog.projection[0].end >= 20);
assert.strictEqual(sizedBacklog.projection[0].addedNominal % 40, 0);

const sameWeek = run({
  baseDemand: flat(40),
  lotQty: 40,
  ssQty: 100,
  leadTimeWeeks: 10,
  leadTimeVariability: "off",
});
assert.strictEqual(sameWeek.releases[0].releaseWeek, 1);
assert.strictEqual(sameWeek.releases[0].plannedDueWeek, 11);
assert.strictEqual(sameWeek.releases[0].delay, 0);
assert.ok(sameWeek.controls.leadTimeWeeks === 10);
assert.ok(sameWeek.weeks.every((week) => week.safetyStock === 100));

assert.deepStrictEqual(engine.LT_EXTRA_MAX[2], { small: 1, medium: 1, large: 2 });
assert.deepStrictEqual(engine.LT_EXTRA_MAX[5], { small: 1, medium: 2, large: 3 });
assert.deepStrictEqual(engine.LT_EXTRA_MAX[10], { small: 1, medium: 3, large: 5 });

const coveredArrival = run(
  {
    baseDemand: flat(40),
    lotQty: 40,
    ssQty: 20,
    leadTimeWeeks: 10,
    demandVariability: "off",
    leadTimeVariability: "large",
    deliveryVariability: "off",
    shock: false,
  },
  1
);
assert.strictEqual(coveredArrival.controls.leadTimeVariability, "large");
assert.ok(coveredArrival.releases.some((release) => release.delay > 0));
coveredArrival.releases.forEach((release) => {
  assert.strictEqual(release.plannedDueDay, release.releaseDay + 10 * 7);
  assert.strictEqual(release.actualArrivalDay, release.plannedDueDay + release.delay * 7);
});
assert.ok(coveredArrival.metrics.averageWc >= 0);
assert.ok(
  Math.abs(coveredArrival.metrics.averageWc - engine.meanPlottedSoh(coveredArrival.days) * engine.PRICES.cost) < 1e-6
);
assert.ok(
  Math.abs(coveredArrival.metrics.avgSohTurns - engine.meanPlottedSoh(coveredArrival.days)) < 1e-12
);

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
      assert.strictEqual(release.plannedDueDay, release.releaseDay + leadTime * 7);
      assert.strictEqual(release.actualArrivalDay, release.plannedDueDay + release.delay * 7);
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
assert.strictEqual(quiet.startingSoh, 60);
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
assert.strictEqual(cover.startingSoh, 240);
assert.strictEqual(cover.safetyStock, 80);
cover.releases.forEach((release) => {
  const allowed = engine.allowedLotReceipts(cover.controls, cover.baseDemand);
  release.lotReceipts.forEach((qty) => {
    assert.ok(allowed.indexOf(qty) !== -1);
  });
});

const demandOff = run({ demandVariability: "off", shock: false }, 5);
assert.deepStrictEqual(demandOff.simulatedDemand, demandOff.baseDemand);
assert.deepStrictEqual(engine.DEMAND_FACTORS.small, [0.9, 1.1]);
assert.deepStrictEqual(engine.DEMAND_FACTORS.medium, [0.7, 1.3]);
assert.deepStrictEqual(engine.DEMAND_FACTORS.large, [0, 2]);
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

const largeSeeds = [1, 7, 42, 99];
largeSeeds.forEach((seed) => {
  const once = run({ demandVariability: "large", shock: false, baseDemand: flat(40) }, seed);
  const twice = run({ demandVariability: "large", shock: false, baseDemand: flat(40) }, seed);
  assert.deepStrictEqual(once.simulatedDemand, twice.simulatedDemand, "seed " + seed);
  assert.deepStrictEqual(once.demandFactors, twice.demandFactors, "seed " + seed);
  once.simulatedDemand.forEach((qty, index) => {
    assert.ok(qty >= 0 && qty <= 80, "week " + (index + 1) + " seed " + seed);
    assert.strictEqual(once.baseDemand[index], 40);
    const days = once.days.filter((day) => day.week === index + 1);
    assert.strictEqual(days.length, 7);
    const daySum = days.reduce((sum, day) => sum + day.demandSevenths, 0) / 7;
    assert.strictEqual(daySum, qty, "daily total week " + (index + 1));
  });
  once.demandFactors.forEach((factor) => {
    assert.ok(factor >= 0 && factor < 2);
  });
  assert.strictEqual(
    once.metrics.annualDemand,
    once.simulatedDemand.reduce((sum, qty) => sum + qty, 0)
  );
});

// Audit trail, not the seeds 1-50 result. The first report called 40.019 the
// mean of seeds 1-50. That pool appended seeds 1, 7, 42, and 99 and then
// seeds 1-50 again, so 1, 7, and 42 were counted twice and 99 was included.
// Those 2,808 weeks sum to 112,374, which is 40.019 to three decimals.
const earlierMixed = [];
largeSeeds.forEach((seed) => {
  earlierMixed.push(
    ...run({ demandVariability: "large", shock: false, baseDemand: flat(40) }, seed).simulatedDemand
  );
});
for (let seed = 1; seed <= 50; seed += 1) {
  earlierMixed.push(
    ...run({ demandVariability: "large", shock: false, baseDemand: flat(40) }, seed).simulatedDemand
  );
}
assert.strictEqual(earlierMixed.length, 2808, "earlier double-counted pool length");
assert.strictEqual(
  earlierMixed.reduce((sum, qty) => sum + qty, 0),
  112374,
  "earlier double-counted pool sum, reported as mean 40.019"
);

const uniqueSeeds = [];
for (let seed = 1; seed <= 50; seed += 1) {
  const sampled = run({ demandVariability: "large", shock: false, baseDemand: flat(40) }, seed);
  sampled.simulatedDemand.forEach((qty) => {
    assert.ok(qty >= 0 && qty <= 80);
  });
  uniqueSeeds.push(...sampled.simulatedDemand);
}
assert.strictEqual(uniqueSeeds.length, 50 * 52, "unique seeds 1-50, each week once");
assert.strictEqual(Math.min(...uniqueSeeds), 0, "unique seeds 1-50 reach none of the forecast");
assert.strictEqual(Math.max(...uniqueSeeds), 80, "unique seeds 1-50 reach double the forecast");
const uniqueSum = uniqueSeeds.reduce((sum, qty) => sum + qty, 0);
assert.strictEqual(uniqueSum, 104116, "unique seeds 1-50 weekly demand sum");
assert.strictEqual(
  Math.round((uniqueSum / uniqueSeeds.length) * 1000) / 1000,
  40.045,
  "unique seeds 1-50 weekly mean, three decimals"
);

const largeMc = engine.runMonteCarlo(
  Object.assign({}, engine.DEFAULT_CONTROLS, {
    demandVariability: "large",
    leadTimeVariability: "off",
    deliveryVariability: "off",
    shock: false,
  }),
  42,
  { runs: 5 }
);
largeMc.runs.forEach((sample) => {
  assert.strictEqual(
    sample.metrics.annualDemand,
    sample.weeks.reduce((sum, week) => sum + week.simulatedDemand, 0)
  );
  assert.strictEqual(
    sample.metrics.oosWeeks,
    sample.weeks.filter((week) => week.preReceiptSoh < 0).length
  );
  sample.weeks.forEach((week) => {
    assert.ok(week.simulatedDemand >= 0 && week.simulatedDemand <= 80);
  });
});

const tinyBase = flat(1);
const tiny = run({ demandVariability: "large", shock: false, baseDemand: tinyBase }, 3);
tiny.simulatedDemand.forEach((qty) => {
  assert.ok(qty === 0 || qty === 1 || qty === 2);
});
const mediumOnly = run({ demandVariability: "medium", shock: false, baseDemand: flat(40) }, 11);
mediumOnly.simulatedDemand.forEach((qty) => {
  assert.ok(qty >= 28 && qty <= 52);
});

const coverAllowed = [240, 280, 320, 360, 400];
for (let seed = 1; seed <= 40; seed += 1) {
  const covered = run(
    {
      lotMode: "weeks",
      lotWeeks: 10,
      ssQty: 0,
      leadTimeWeeks: 5,
      demandVariability: "large",
      leadTimeVariability: "large",
      deliveryVariability: "large",
      shock: false,
    },
    seed
  );
  const again = run(
    {
      lotMode: "weeks",
      lotWeeks: 10,
      ssQty: 0,
      leadTimeWeeks: 5,
      demandVariability: "large",
      leadTimeVariability: "large",
      deliveryVariability: "large",
      shock: false,
    },
    seed
  );
  assert.deepStrictEqual(covered.simulatedDemand, again.simulatedDemand);
  assert.deepStrictEqual(
    covered.releases.map((release) => release.actualArrivalDay + ":" + release.privateQuantity),
    again.releases.map((release) => release.actualArrivalDay + ":" + release.privateQuantity)
  );
  assert.strictEqual(covered.nominalLot, 400);
  assert.strictEqual(covered.startingSoh, 400);
  covered.simulatedDemand.forEach((qty) => {
    assert.ok(qty >= 0 && qty <= 80);
  });
  covered.releases.forEach((release) => {
    assert.ok(release.actualArrivalDay >= release.releaseDay + 35);
    release.lotReceipts.forEach((qty) => {
      assert.ok(coverAllowed.indexOf(qty) !== -1, "lot " + qty);
    });
    covered.reviews.forEach((review) => {
      const seen = review.outstanding.concat(review.releasedNow).find((order) => order.id === release.id);
      if (seen) {
        assert.strictEqual(seen.plannerQuantity, release.nominalQuantity);
      }
    });
  });
  covered.weeks.forEach((week, index) => {
    const arrivals = covered.releases.filter(
      (release) => release.hasArrived && release.actualArrivalWeek === week.week
    );
    const sum = arrivals.reduce((total, release) => total + release.privateQuantity, 0);
    assert.strictEqual(week.plannedSupply, sum, "seed " + seed + " week " + week.week);
    if (week.plannedSupply === 1040) {
      assert.ok(arrivals.length >= 3, "1040 is several receipts");
    }
    const next = covered.weeks[index + 1];
    assert.ok(Math.abs(week.beginningSoh - week.simulatedDemand + week.plannedSupply - week.endingSoh) < 1e-6);
    if (next) {
      assert.ok(Math.abs(next.beginningSoh - week.endingSoh) < 1e-6);
    }
  });
}

const shockedLarge = run(
  {
    demandVariability: "large",
    shock: true,
    leadTimeVariability: "off",
    deliveryVariability: "off",
  },
  8
);
shockedLarge.shockWeeks.forEach((weekNo) => {
  const qty = shockedLarge.simulatedDemand[weekNo - 1];
  assert.ok(qty >= 0 && qty <= 160);
  assert.strictEqual(qty, engine.roundHalfEven(shockedLarge.normalDemand[weekNo - 1] * 2));
  const review = shockedLarge.reviews[weekNo - 1];
  const row = review.projection.find((item) => item.week === weekNo);
  assert.strictEqual(row.forecast, shockedLarge.baseDemand[weekNo - 1]);
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
    assert.strictEqual(week.simulatedDemand, 80, "shock week simulated demand is double the forecast");
    const shockDays = shocked.days.filter((day) => day.week === weekNo);
    assert.strictEqual(shockDays.length, 7);
    const shockSum = shockDays.reduce((sum, day) => sum + day.demandSevenths, 0) / 7;
    assert.strictEqual(shockSum, 80);
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
  result.days.forEach((day) => {
    const close = day.beginningSoh - day.simulatedDemand + day.plannedSupply;
    assert.ok(Math.abs(day.endingSoh - close) < 1e-9);
    const low = Math.min(day.beginningSoh, day.endingSoh);
    assert.ok(Math.abs(day.preReceiptSoh - low) < 1e-9);
  });
  result.releases.forEach((release) => {
    assert.strictEqual(
      release.plannedDueDay,
      release.releaseDay + result.controls.leadTimeWeeks * 7
    );
    assert.strictEqual(release.actualArrivalDay, release.plannedDueDay + release.delay * 7);
  });
  result.reviews.forEach((review) => {
    review.projection.forEach((row) => {
      assert.strictEqual(row.forecast, result.baseDemand[row.week - 1]);
    });
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
const thin = run({ baseDemand: flat(40), lotQty: 5, ssQty: 0, shock: true });
assert.strictEqual(engine.needsPedagogyCallout(thin.metrics), true);
assert.ok(Math.abs(thin.metrics.averageWc - thin.metrics.avgSohTurns * engine.PRICES.cost) < 1e-6);
assert.ok(thin.metrics.averageWc >= 0);

assert.deepStrictEqual(engine.VISIBLE_WEEK_COLUMNS, [
  "Week",
  "Base demand",
  "Simulated demand",
  "Beginning SOH",
  "Pre-receipt SOH",
  "Receipts",
  "Ending SOH",
  "Safety stock",
]);
assert.deepStrictEqual(Object.keys(cr1.weeks[0]).sort(), [
  "baseDemand",
  "beginningSoh",
  "endingSoh",
  "plannedSupply",
  "preReceiptSoh",
  "safetyStock",
  "simulatedDemand",
  "week",
].sort());

assert.match(page, /src="\/assets\/safety-stock-engine\.js\?v=17"/);
assert.match(page, /src="\/assets\/sim-results-form\.js\?v=7"/);
assert.match(page, /src="\/assets\/safety-stock-simulator\.js\?v=15"/);

assert.strictEqual(engine.meanPlottedSoh([]), null);
assert.strictEqual(engine.meanPlottedSoh(null), null);
assert.strictEqual(engine.meanPlottedSoh([{ endingSoh: -4 }, { endingSoh: 10 }]), 5);
assert.strictEqual(engine.meanPlottedSoh([{ endingSoh: NaN }]), null);
assert.ok(Math.abs(engine.meanPlottedSoh(mixedWeeks) - floored) < 1e-12);
assert.ok(
  Math.abs(engine.meanPlottedSoh(mixedWeeks) * engine.PRICES.cost - mixed.averageWc) < 1e-6,
  "floored plotted SOH is the working-capital average"
);
const levelYear = engine.runYear(engine.DEFAULT_CONTROLS, 1);
const levelMean = engine.meanPlottedSoh(levelYear.days);
assert.ok(Math.abs(levelMean - levelYear.metrics.avgSohTurns) < 1e-9);
assert.strictEqual(engine.PRICES.cost, 70);
assert.ok(Math.abs(levelYear.metrics.averageWc - levelMean * engine.PRICES.cost) < 1e-6);

function pageMoney(value) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + "$" + Math.abs(rounded).toLocaleString("en-US");
}
function chartAverageLabel(mean) {
  const units =
    Math.abs(mean - Math.round(mean)) < 1e-9 ? String(Math.round(mean)) : mean.toFixed(1);
  return "Avg SOH " + units + " units (" + pageMoney(mean * engine.PRICES.cost) + ")";
}
function moneyInAverageLabel(label) {
  const match = label.match(/\(([^)]+)\)$/);
  assert.ok(match, label);
  return match[1];
}
assert.strictEqual(chartAverageLabel(40), "Avg SOH 40 units ($2,800)");
assert.strictEqual(chartAverageLabel(38), "Avg SOH 38 units ($2,660)");
assert.strictEqual(chartAverageLabel(15.826923076923077), "Avg SOH 15.8 units ($1,108)");
assert.strictEqual(chartAverageLabel(-2.24), "Avg SOH -2.2 units (-$157)");
assert.strictEqual(
  moneyInAverageLabel(chartAverageLabel(engine.meanPlottedSoh(levelYear.days))),
  pageMoney(levelYear.metrics.averageWc)
);
assert.strictEqual(
  moneyInAverageLabel(chartAverageLabel(engine.meanPlottedSoh(mixedWeeks))),
  pageMoney(mixed.averageWc)
);
const noisyYear = engine.runYear(
  Object.assign({}, engine.DEFAULT_CONTROLS, {
    demandVariability: "medium",
    leadTimeVariability: "small",
    shock: true,
  }),
  7
);
const noisyMean = engine.meanPlottedSoh(noisyYear.days);
assert.strictEqual(noisyYear.metrics.averageWc, noisyMean * engine.PRICES.cost);
assert.strictEqual(
  moneyInAverageLabel(chartAverageLabel(noisyMean)),
  pageMoney(noisyYear.metrics.averageWc)
);
assert.match(ui, /function averageSohLabel\(mean\)/);
assert.match(ui, /renderChart\(result\.days\)/);
assert.match(ui, /engine\.meanPlottedSoh\(weeks\)/);
assert.match(ui, /function stockPath\(/);
assert.doesNotMatch(ui, /sim-chart__avg-label-bg/);
assert.match(ui, /"paint-order": "stroke"/);
assert.match(ui, /stroke: "#ffffff"/);
assert.match(ui, /"stroke-width": "3"/);
assert.match(ui, /formatCount\(value\)/);
assert.match(ui, /function weeksCsv\(/);
assert.match(ui, /week\.preReceiptSoh/);
assert.match(ui, /formatCount\(mean\)/);
assert.match(ui, /formatMoney\(mean \* rate\)/);
assert.match(ui, /engine\.PRICES\.cost/);
const averageLabelSource = ui.slice(
  ui.indexOf("function averageSohLabel"),
  ui.indexOf("function formatBand")
);
assert.doesNotMatch(averageLabelSource, /PRICES\.gp/);
assert.doesNotMatch(averageLabelSource, /\$30/);
assert.match(ui, /Avg SOH /);
assert.match(ui, /class: "sim-chart__avg"/);
assert.match(ui, /stroke: "#6d28d9"/);
assert.match(ui, /"stroke-dasharray": "4 3"/);
assert.match(page, /class="sim-legend__avg">Average SOH</);
assert.match(page, /id="sim-chart-avg"/);

const patternSummaries = {
  level: "The same forecast every week: 40 units.",
  seasonal: "Peaks near 58 and dips near 22 a week, averaging 40.",
  rising: "Starts at 22 a week and climbs to about 58, averaging about 40.",
};
engine.PATTERNS.forEach((pattern) => {
  assert.strictEqual(pattern.summary, patternSummaries[pattern.id], pattern.id);
  assert.ok(page.includes(pattern.summary), pattern.id + " summary is on the page");
  const stats = pattern.weeks.reduce(
    (acc, value) => ({
      min: Math.min(acc.min, value),
      max: Math.max(acc.max, value),
      sum: acc.sum + value,
    }),
    { min: Infinity, max: -Infinity, sum: 0 }
  );
  const average = Math.round(stats.sum / pattern.weeks.length);
  assert.ok(pattern.summary.includes(String(average)), pattern.id + " average");
  if (pattern.id === "seasonal") {
    assert.strictEqual(stats.min, 22);
    assert.strictEqual(stats.max, 58);
    assert.strictEqual(average, 40);
  }
  if (pattern.id === "rising") {
    assert.strictEqual(pattern.weeks[0], 22);
    assert.strictEqual(pattern.weeks[pattern.weeks.length - 1], 58);
    assert.strictEqual(average, 40);
  }
  if (pattern.id === "level") {
    assert.strictEqual(stats.min, 40);
    assert.strictEqual(stats.max, 40);
  }
});
const coverHint = "Average demand is about 40 a week, so 40 is about 1 week of cover.";
function labelInner(id) {
  const marker = `id="${id}"`;
  const start = page.indexOf(marker);
  assert.ok(start !== -1, id);
  const open = page.lastIndexOf("<label", start);
  const close = page.indexOf("</label>", start);
  return page.slice(open, close);
}
const lotQtyField = labelInner("sim-lot-qty-field");
const ssQtyField = labelInner("sim-ss-qty-field");
assert.ok(lotQtyField.includes(coverHint), "fixed lot hint");
assert.ok(ssQtyField.includes(coverHint), "fixed safety stock hint");
assert.ok(lotQtyField.includes('id="sim-lot-cover-hint"'));
assert.ok(ssQtyField.includes('id="sim-ss-cover-hint"'));
assert.ok(!labelInner("sim-lot-weeks-field").includes("sim-cover-hint"));
assert.ok(!labelInner("sim-ss-weeks-field").includes("sim-cover-hint"));
assert.ok(!labelInner("sim-service-field").includes("sim-cover-hint"));
assert.match(ui, /This quantity is /);
assert.match(ui, /\/ 40\)/);
assert.match(ui, /lotMode !== "fixed"/);
assert.match(ui, /ssMode !== "fixed"/);
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
assert.match(page, /split evenly across seven days/);
const variabilityHelp = page.replace(/\s+/g, " ");
assert.match(variabilityHelp, /The forecast is the expected mean/);
assert.match(variabilityHelp, /One year's realized mean can sit above or below it/);
assert.match(variabilityHelp, /Across many runs those weeks average to the forecast/);
assert.doesNotMatch(variabilityHelp, /still average to the forecast/);
const replenishmentHelp = page.replace(/\s+/g, " ");
assert.match(replenishmentHelp, /full base lead time has passed/);
assert.match(replenishmentHelp, /first day of week 6/);
assert.match(replenishmentHelp, /normal lot quantity/);
assert.match(replenishmentHelp, /short shipment is recognised only when the goods arrive/);
assert.match(replenishmentHelp, /expects that same quantity one week later/);
assert.match(replenishmentHelp, /does not learn the actual arrival date in advance/);
assert.match(replenishmentHelp, /at or above safety stock/);
assert.match(replenishmentHelp, /Starting stock is that full normal/);
assert.match(replenishmentHelp, /week-1 forecast is not added/);

[0, 40, 160, 300].forEach((safetyStock) => {
  ["fixed", "weeks"].forEach((lotMode) => {
    const opened = run({
      lotMode: lotMode,
      lotQty: 400,
      lotWeeks: 10,
      ssMode: "fixed",
      ssQty: safetyStock,
      demandVariability: "off",
      leadTimeVariability: "off",
      deliveryVariability: "off",
    });
    assert.strictEqual(opened.nominalLot, 400);
    assert.strictEqual(opened.startingSoh, 400 + safetyStock);
    assert.strictEqual(opened.weeks[0].beginningSoh, opened.startingSoh);
    assert.strictEqual(opened.weeks[0].safetyStock, safetyStock);
  });
});
const userExample = run({
  lotMode: "weeks",
  lotWeeks: 10,
  ssMode: "fixed",
  ssQty: 300,
  demandVariability: "off",
});
assert.strictEqual(userExample.startingSoh, 700);
assert.strictEqual(userExample.weeks[0].baseDemand, 40);
assert.strictEqual(userExample.weeks[0].plannedSupply, 0);
assert.strictEqual(userExample.weeks[0].endingSoh, 660);
const seasonalOpen = run({
  patternId: "seasonal",
  lotMode: "weeks",
  lotWeeks: 10,
  ssQty: 300,
  demandVariability: "off",
});
assert.strictEqual(seasonalOpen.nominalLot, 486);
assert.strictEqual(seasonalOpen.startingSoh, 786);
const risingOpen = run({
  patternId: "rising",
  lotMode: "fixed",
  lotQty: 400,
  ssQty: 300,
  demandVariability: "off",
});
assert.strictEqual(risingOpen.baseDemand[0], 22);
assert.strictEqual(risingOpen.startingSoh, 700);
const formulaOff = run({
  lotMode: "weeks",
  lotWeeks: 10,
  ssMode: "formula",
  demandVariability: "off",
});
assert.strictEqual(formulaOff.safetyStock, 0);
assert.strictEqual(formulaOff.startingSoh, 400);
const formulaOn = run({
  lotMode: "weeks",
  lotWeeks: 10,
  ssMode: "formula",
  serviceLevel: 95,
  demandVariability: "large",
}, 7);
assert.ok(formulaOn.safetyStock > 0);
assert.strictEqual(formulaOn.startingSoh, 400 + formulaOn.safetyStock);
const quietOpen = run({
  lotQty: 400,
  ssQty: 300,
  demandVariability: "off",
  leadTimeVariability: "off",
  deliveryVariability: "off",
});
const noisyOpen = run({
  lotQty: 400,
  ssQty: 300,
  demandVariability: "off",
  leadTimeVariability: "large",
  deliveryVariability: "large",
}, 9);
assert.strictEqual(quietOpen.startingSoh, 700);
assert.strictEqual(noisyOpen.startingSoh, quietOpen.startingSoh);
const batch = engine.runMonteCarlo(
  {
    patternId: "level",
    lotMode: "weeks",
    lotWeeks: 10,
    ssMode: "formula",
    serviceLevel: 95,
    leadTimeWeeks: 5,
    demandVariability: "large",
    leadTimeVariability: "off",
    deliveryVariability: "off",
    shock: false,
  },
  1,
  { runs: 5 }
);
batch.runs.forEach((sample) => {
  assert.strictEqual(sample.safetyStock, batch.runs[0].safetyStock);
  assert.strictEqual(sample.startingSoh, 400 + sample.safetyStock);
});
assert.match(page, /below zero before a receipt due that morning/);
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
assert.match(bootBody, /applyReopenLink\(\)/);
const reopenBody = ui.slice(ui.indexOf("function applyReopenLink()"), bootStart);
assert.match(reopenBody, /if \(!link\.present\)/);
assert.ok(reopenBody.indexOf("if (link.run)") < reopenBody.indexOf("engine.runYear"));
assert.doesNotMatch(ui, /fetch\(|RESEND|api\.resend/);
assert.match(page, /id="sim-results-email" hidden/);
assert.match(page, /data-results-email="on"/);
assert.match(page, /data-sitekey="0x4AAAAAAFMWJU5owYhGcyrK"/);
assert.match(page, /turnstile\/v0\/api\.js\?render=explicit&onload=pscpTurnstileLoaded" async/);
assert.doesNotMatch(page, /turnstile\/v0\/api\.js[^>]*\sdefer/);
assert.match(page, /id="sim-storage-on" hidden/);
assert.match(page, /unless you ask to email yourself the results/);
assert.doesNotMatch(ui, /location\.href/);
assert.match(ui, /buildResultsUrl|resultsSummary/);
const changeBody = ui.slice(
  ui.indexOf("function onControlsChanged()"),
  ui.indexOf("function setMode(")
);
assert.match(changeBody, /clearStaleOutputs/);
assert.doesNotMatch(changeBody, /engine\.runYear|engine\.runMonteCarlo|runYearClicked|runMonteCarloClicked/);
const modeBody = ui.slice(ui.indexOf("function setMode("), ui.indexOf("function restoreSession"));
assert.doesNotMatch(modeBody, /engine\.runYear|engine\.runMonteCarlo|runYearClicked|runMonteCarloClicked/);

assert.match(
  flatPage,
  /No year yet\. Press Run year at the end of the settings\. Changing settings does not draw this chart or table\./
);
assert.match(
  flatPage,
  /No Monte Carlo batch yet\. Press Run Monte Carlo at the end of the settings\. Opening this mode does not start a batch\./
);
assert.match(
  flatPage,
  /Press Run Monte Carlo at the end of the settings\. Opening this mode does not start a batch\./
);
assert.doesNotMatch(flatPage, /Press Run year\. Changing settings/);
assert.doesNotMatch(flatPage, /Press Run Monte Carlo\. Opening/);
assert.match(
  ui,
  /Press Run year at the end of the settings to draw them again\./
);
assert.match(
  ui,
  /No year yet\. Press Run year at the end of the settings\. Changing settings does not draw this chart or table\./
);
assert.match(
  ui,
  /Press Run Monte Carlo at the end of the settings to run fifty years again\./
);
assert.match(
  ui,
  /No Monte Carlo batch yet\. Press Run Monte Carlo at the end of the settings\. Opening this mode does not start a batch\./
);
assert.doesNotMatch(ui, /Press Run year to draw them again\./);
assert.doesNotMatch(ui, /Press Run Monte Carlo to run fifty years again\./);
assert.doesNotMatch(ui, /Press Run Monte Carlo\. Opening/);
const yearClickBody = ui.slice(
  ui.indexOf("function runYearClicked()"),
  ui.indexOf("function runMonteCarloClicked()")
);
const mcClickBody = ui.slice(
  ui.indexOf("function runMonteCarloClicked()"),
  ui.indexOf("function boot()")
);
assert.match(yearClickBody, /scrollResultsIntoView\("sim-year-panel"\)/);
assert.match(mcClickBody, /scrollResultsIntoView\("sim-mc-panel"\)/);
const scrollBody = ui.slice(
  ui.indexOf("function scrollResultsIntoView("),
  ui.indexOf("function runYearClicked()")
);
assert.match(scrollBody, /prefers-reduced-motion: reduce/);
assert.match(scrollBody, /behavior: reduceMotion \? "instant" : "smooth"/);
assert.match(scrollBody, /tabindex", "-1"/);
assert.match(scrollBody, /preventScroll: true/);
assert.match(bootBody, /if \(reopened\.panel\) \{[^}]*scrollResultsIntoView\(reopened\.panel\);/);
assert.strictEqual((bootBody.match(/scrollResultsIntoView/g) || []).length, 1);
assert.doesNotMatch(changeBody, /scrollResultsIntoView/);
assert.doesNotMatch(modeBody, /scrollResultsIntoView/);

function expanderAround(id) {
  const at = page.indexOf(`id="${id}"`);
  assert.notStrictEqual(at, -1, id);
  const start = page.lastIndexOf("<details", at);
  const end = page.indexOf("</details>", at);
  assert.ok(start !== -1 && end > at, `${id} sits inside a details element`);
  const block = page.slice(start, end);
  const openTag = block.slice(0, block.indexOf(">") + 1);
  assert.match(openTag, /class="sim-details"/, `${id} uses the shared expander`);
  assert.doesNotMatch(
    openTag,
    /\sopen(?:\s|=|>)/,
    `${id} expander is closed by default`
  );
  return block;
}

const weekExpander = expanderAround("sim-weeks-body");
assert.match(weekExpander, /<summary>Weekly table<\/summary>/);
assert.ok(!weekExpander.includes('id="sim-chart"'), "chart stays outside the weekly expander");
assert.ok(!weekExpander.includes('id="sim-metrics"'), "year metrics stay outside the weekly expander");

const mcExpander = expanderAround("sim-mc-body");
assert.match(mcExpander, /<summary>Per-run results<\/summary>/);
assert.ok(!mcExpander.includes('id="sim-mc-card"'), "Monte Carlo summary stays outside the per-run expander");
assert.equal(page.split('class="sim-details"').length - 1, 2);

const yearBeforeTable = page.slice(
  page.indexOf('id="sim-year-output"'),
  page.indexOf('id="sim-weeks-body"')
);
assert.match(yearBeforeTable, /id="sim-chart"/);
assert.match(yearBeforeTable, /id="sim-metrics"/);
assert.match(
  yearBeforeTable,
  /<details class="sim-details">\s*<summary>Weekly table<\/summary>/
);
const yearSection = page.slice(
  page.indexOf('id="sim-year-panel"'),
  page.indexOf('id="sim-mc-panel"')
);
assert.match(
  yearSection.slice(yearSection.indexOf("</details>")),
  /Inventory turns, average stock, and working capital use the daily/
);

const mcBeforeTable = page.slice(
  page.indexOf('id="sim-mc-results"'),
  page.indexOf('id="sim-mc-body"')
);
assert.match(mcBeforeTable, /id="sim-mc-card"/);
assert.match(
  mcBeforeTable,
  /<details class="sim-details">\s*<summary>Per-run results<\/summary>/
);

const css = fs.readFileSync(path.join(ROOT, "assets", "styles.css"), "utf8");
assert.match(css, /\.sim-chart__avg\s*\{[^}]*stroke:\s*#6d28d9/);
assert.match(css, /\.sim-chart__avg\s*\{[^}]*stroke-dasharray:\s*4 3/);
assert.match(css, /\.sim-legend__avg\s*\{[^}]*color:\s*#6d28d9/);
assert.match(css, /\.sim-legend li\.sim-legend__avg::before\s*\{[^}]*border-top-style:\s*dashed/);
assert.match(css, /\.sim-details\s*\{[^}]*border:\s*1px solid var\(--color-border\)/);
assert.match(css, /\.sim-details\s*\{[^}]*margin:\s*0 0 1\.5rem/);
assert.match(css, /\.sim-details\[open\] > summary::before/);

const about = fs.readFileSync(path.join(SITE, "about", "index.html"), "utf8");
assert.match(about, /Free guides and interactive learning tools are on the/);
assert.match(about, /<a href="\/learn\/">Learn page<\/a>/);
assert.doesNotMatch(about, /free educational/);
assert.match(about, />Learn<\/a>/);

const reopenControls = {
  patternId: "seasonal",
  lotMode: "weeks",
  lotQty: 15,
  lotWeeks: 6,
  ssMode: "formula",
  ssQty: 3,
  ssWeeks: 2,
  serviceLevel: 98,
  leadTimeWeeks: 10,
  demandVariability: "medium",
  leadTimeVariability: "small",
  deliveryVariability: "large",
  shock: true,
};
const reopenQuery = engine.encodeReopenQuery(reopenControls, 4242, "monte-carlo", true);
assert.ok(!reopenQuery.includes("utm_"), reopenQuery);
assert.ok(!reopenQuery.includes("@"), reopenQuery);
const reopenBack = engine.decodeReopenQuery(
  "https://practicalsupplychainplanning.com/learn/safety-stock-simulator/?" +
    reopenQuery +
    "&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1"
);
assert.strictEqual(reopenBack.present, true);
assert.strictEqual(reopenBack.run, true);
assert.strictEqual(reopenBack.mode, "monte-carlo");
assert.strictEqual(reopenBack.seed, 4242);
assert.deepStrictEqual(reopenBack.controls, engine.normalizeControls(reopenControls));
const reopenYear = engine.runYear(reopenControls, 4242);
const reopenAgain = engine.runYear(reopenBack.controls, reopenBack.seed);
assert.strictEqual(reopenYear.weeks[51].endingSoh, reopenAgain.weeks[51].endingSoh);
assert.strictEqual(reopenYear.metrics.oosWeeks, reopenAgain.metrics.oosWeeks);
assert.strictEqual(reopenYear.safetyStock, reopenAgain.safetyStock);
const yearLink = engine.decodeReopenQuery(
  "?" + engine.encodeReopenQuery(reopenControls, 4242, "year", true)
);
assert.strictEqual(yearLink.mode, "year");
assert.strictEqual(yearLink.run, true);
assert.deepStrictEqual(yearLink.controls, engine.normalizeControls(reopenControls));
const quietLink = engine.decodeReopenQuery("");
assert.strictEqual(quietLink.present, false);
assert.strictEqual(quietLink.run, false);
const utmOnly = engine.decodeReopenQuery(
  "?utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1"
);
assert.strictEqual(utmOnly.present, false);
assert.strictEqual(utmOnly.run, false);
const runOnly = engine.decodeReopenQuery("?run=1");
assert.strictEqual(runOnly.present, true);
assert.strictEqual(runOnly.run, true);
assert.strictEqual(runOnly.mode, "year");
assert.strictEqual(runOnly.seed, 20260923);
assert.deepStrictEqual(runOnly.controls, engine.normalizeControls(engine.DEFAULT_CONTROLS));
const held = engine.decodeReopenQuery("?" + engine.encodeReopenQuery(engine.DEFAULT_CONTROLS, 7, "year", false));
assert.strictEqual(held.run, false);
assert.strictEqual(held.present, true);
assert.strictEqual(held.seed, 7);
assert.strictEqual(held.controls.shock, false);
const garbageQty = engine.decodeReopenQuery("?lq=abc&sq=nope&lw=4&run=1");
assert.strictEqual(garbageQty.controls.lotQty, engine.DEFAULT_CONTROLS.lotQty);
assert.strictEqual(garbageQty.controls.ssQty, engine.DEFAULT_CONTROLS.ssQty);
assert.strictEqual(garbageQty.controls.lotQty, 40);
assert.strictEqual(garbageQty.controls.ssQty, 20);
const belowMin = engine.decodeReopenQuery("?lq=0&sq=-4");
assert.strictEqual(belowMin.controls.lotQty, 1);
assert.strictEqual(belowMin.controls.ssQty, 0);
const aboveMax = engine.decodeReopenQuery("?lq=5000&sq=5000");
assert.strictEqual(aboveMax.controls.lotQty, 1000);
assert.strictEqual(aboveMax.controls.ssQty, 1000);
const resultsUrl = engine.buildResultsUrl(reopenControls, 4242, "year");
assert.ok(resultsUrl.startsWith("https://practicalsupplychainplanning.com/learn/safety-stock-simulator/?"));
assert.ok(resultsUrl.includes("lq=15"));
assert.ok(resultsUrl.includes("sq=3"));
assert.ok(resultsUrl.includes("run=1"));
assert.ok(resultsUrl.includes("utm_source=results-email"));
assert.ok(!resultsUrl.includes("location"));
const changedUrl = engine.buildResultsUrl(
  Object.assign({}, reopenControls, { lotQty: 80, ssQty: 11 }),
  4242,
  "year"
);
assert.ok(changedUrl.includes("lq=80"));
assert.ok(changedUrl.includes("sq=11"));
assert.ok(!changedUrl.includes("lq=15"));
const yearResult = engine.runYear(engine.DEFAULT_CONTROLS, 7);
const summary = engine.resultsSummary(engine.DEFAULT_CONTROLS, 7, "year", yearResult, null);
assert.ok(summary.commentary.length >= 1 && summary.commentary.length <= 3);
summary.commentary.forEach(function (line) {
  assert.ok(line.indexOf("In the scenario you ran") === 0, line);
});
assert.strictEqual(summary.reopenUrl, engine.buildResultsUrl(engine.DEFAULT_CONTROLS, 7, "year"));
assert.ok(!summary.reopenUrl.includes("abc"));
const sentPage = fs.readFileSync(
  path.join(SITE, "learn", "safety-stock-simulator", "sent", "index.html"),
  "utf8"
);
assert.match(sentPage, /noindex/);
assert.match(sentPage, /Check your inbox \(and spam folder\)\./);
const sitemap = fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8");
assert.ok(!sitemap.includes("/sent/"));

console.log("Safety stock simulator checks OK.");
