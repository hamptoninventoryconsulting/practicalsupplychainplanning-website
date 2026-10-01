/**
 * Own-data safety stock simulator.
 *
 * Separate from assets/safety-stock-engine.js on purpose. The teaching
 * simulator keeps its clamps, lead-time table, fixed $100/$70 prices, and
 * computed starting stock. This file does not change those results.
 *
 * Same replenishment rule and the same seeded random stream as the teaching
 * engine, so a level forecast of 40, prices of $100 and $70, a lead time of
 * 2, 5, or 10, and the teaching starting stock reproduce that engine's stock
 * path. Annual gross profit does not: it counts units actually sold.
 * Demand that cannot be filled from stock on hand and receipts that week
 * is unmet and is left out. The teaching engine multiplies all simulated
 * demand by $30.
 *
 * Differences:
 * - One average weekly forecast per SKU (no Level / Seasonal / Rising pattern).
 * - The user's current stock, unit cost, and selling price.
 * - Lot size and safety stock are not clamped to 1–1000. The ceiling is
 *   999,999,999 so a 32-bit random draw still fits.
 * - Lead time is any whole number of weeks from 1 to 26. Extra delay caps
 *   match the teaching table at 2, 5, and 10. Other weeks use piecewise
 *   linear interpolation between those anchors, rounded half-even, and at
 *   least 1 when variability is on. The base lead time is still not added
 *   to the arrival week. It scales formula safety stock and the delay cap.
 *
 * Nothing in this file sends or stores SKU data.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.OwnDataEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HORIZON = 52;
  var MAX_SKUS = 10;
  var MAX_QTY = 999999999;
  var MAX_LABEL = 40;
  var FRAGMENT_LIMIT = 2000;
  var STRONG_TURNS = 8;
  var WEAK_CSL = 95;
  var HIGH_OOS = 3;
  var SHOCK_MULTIPLIER = 2;
  var MC_RUNS = 50;

  var Z_BY_SERVICE_LEVEL = {
    90: 1.282,
    95: 1.645,
    98: 2.054,
    99: 2.326,
  };

  var DEMAND_FACTORS = {
    small: [0.9, 1.1],
    medium: [0.7, 1.3],
    large: [0.5, 1.5],
  };

  var DELIVERY_PCT = { small: 5, medium: 10, large: 15 };

  var WEEKS_COVER_EXTRA = {
    2: { small: 0, medium: 0, large: -1 },
    4: { small: 0, medium: -1, large: -2 },
    6: { small: -1, medium: -2, large: -3 },
    10: { small: -1, medium: -3, large: -4 },
  };

  var COVER_OPTIONS = [2, 4, 6, 10];
  var SERVICE_LEVELS = [90, 95, 98, 99];
  var LEVELS = ["off", "small", "medium", "large"];
  var LEVEL_CODE = { off: "o", small: "s", medium: "m", large: "l" };
  var LEVEL_FROM = { o: "off", s: "small", m: "medium", l: "large" };
  var LOT_CODE = { fixed: "f", weeks: "w" };
  var LOT_FROM = { f: "fixed", w: "weeks" };
  var SS_CODE = { fixed: "f", formula: "u", weeks: "w" };
  var SS_FROM = { f: "fixed", u: "formula", w: "weeks" };

  // Teaching anchors: LT_EXTRA_MAX at 2, 5, and 10 weeks.
  var LT_KNOTS = [2, 5, 10];
  var LT_ANCHOR = {
    small: [1, 1, 1],
    medium: [1, 2, 3],
    large: [2, 3, 5],
  };

  var CSV_ALIASES = {
    sku: "label",
    sku_label: "label",
    label: "label",
    name: "label",
    weekly_forecast: "forecast",
    forecast: "forecast",
    average_weekly_forecast: "forecast",
    demand_variability: "demandVariability",
    demand_var: "demandVariability",
    lead_time_weeks: "leadTimeWeeks",
    lead_time: "leadTimeWeeks",
    lead_time_variability: "leadTimeVariability",
    lead_time_var: "leadTimeVariability",
    current_stock: "currentStock",
    stock: "currentStock",
    unit_cost: "unitCost",
    cost: "unitCost",
    selling_price: "sellingPrice",
    price: "sellingPrice",
    sell_price: "sellingPrice",
    lot_mode: "lotMode",
    lot_quantity: "lotQty",
    lot_qty: "lotQty",
    lot_weeks: "lotWeeks",
    safety_stock_mode: "ssMode",
    ss_mode: "ssMode",
    safety_stock_quantity: "ssQty",
    safety_stock_qty: "ssQty",
    ss_quantity: "ssQty",
    safety_stock_weeks: "ssWeeks",
    ss_weeks: "ssWeeks",
    service_level: "serviceLevel",
    service: "serviceLevel",
    delivery_variability: "deliveryVariability",
    delivery_quantity_variability: "deliveryVariability",
    demand_shock: "shock",
    shock: "shock",
  };

  function roundHalfEven(value) {
    if (!isFinite(value)) {
      return 0;
    }
    var sign = value < 0 ? -1 : 1;
    var x = Math.abs(value);
    var floor = Math.floor(x);
    var frac = x - floor;
    var rounded;
    if (Math.abs(frac - 0.5) < 1e-10) {
      rounded = floor % 2 === 0 ? floor : floor + 1;
    } else if (frac < 0.5) {
      rounded = floor;
    } else {
      rounded = floor + 1;
    }
    return sign * rounded;
  }

  function rotl(x, k) {
    x >>>= 0;
    return ((x << k) | (x >>> (32 - k))) >>> 0;
  }

  function createGenerator(seed) {
    var x = seed >>> 0;
    if (x === 0) {
      x = 0x6d2b79f5;
    }
    function split() {
      x = (x + 0x9e3779b9) >>> 0;
      var z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    }
    var a = split();
    var b = split();
    var c = split();
    var d = split();
    if ((a | b | c | d) === 0) {
      a = 1;
    }
    return {
      nextUint32: function () {
        var result = Math.imul(rotl(Math.imul(b, 5) >>> 0, 7), 9) >>> 0;
        var t = (b << 9) >>> 0;
        c = (c ^ a) >>> 0;
        d = (d ^ b) >>> 0;
        b = (b ^ c) >>> 0;
        a = (a ^ d) >>> 0;
        c = (c ^ t) >>> 0;
        d = rotl(d, 11);
        return result;
      },
    };
  }

  function nextInt(gen, low, highInclusive) {
    if (highInclusive <= low) {
      return low;
    }
    var span = highInclusive - low + 1;
    var limit = 4294967296 - (4294967296 % span);
    var drawn;
    do {
      drawn = gen.nextUint32();
    } while (drawn >= limit);
    return low + (drawn % span);
  }

  function nextUniform(gen, low, high) {
    return low + (high - low) * (gen.nextUint32() / 4294967296);
  }

  function spawnSeeds(parentSeed, count) {
    var x = (parentSeed >>> 0) ^ 0x53504157;
    if (x === 0) {
      x = 0x9e3779b9;
    }
    var seeds = [];
    for (var i = 0; i < count; i += 1) {
      x = (x + 0x9e3779b9) >>> 0;
      var mixed = (x ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0;
      var z = (mixed + 0x9e3779b9) >>> 0;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      var child = (z ^ (z >>> 16)) >>> 0;
      seeds.push(child || 1);
    }
    return seeds;
  }

  function formulaReferenceSeed(parentSeed) {
    var mixed = ((parentSeed >>> 0) ^ 0x464f524d) >>> 0;
    var z = (mixed + 0x9e3779b9) >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0 || 1;
  }

  function repeat(value, count) {
    var out = [];
    for (var i = 0; i < count; i += 1) {
      out.push(value);
    }
    return out;
  }

  function sumFirst(base, weeks) {
    var total = 0;
    var n = weeks;
    if (n < 0) {
      n = 0;
    }
    if (n > base.length) {
      n = base.length;
    }
    for (var i = 0; i < n; i += 1) {
      total += base[i];
    }
    return total;
  }

  function populationStdev(values) {
    var n = values.length;
    if (!n) {
      return 0;
    }
    var sum = 0;
    for (var i = 0; i < n; i += 1) {
      sum += values[i];
    }
    var mean = sum / n;
    var acc = 0;
    for (var j = 0; j < n; j += 1) {
      var diff = values[j] - mean;
      acc += diff * diff;
    }
    return Math.sqrt(acc / n);
  }

  function formulaSafetyStock(normalDemand, serviceLevel, leadTimeWeeks) {
    var z = Z_BY_SERVICE_LEVEL[serviceLevel];
    var sigma = populationStdev(normalDemand);
    return roundHalfEven(z * sigma * Math.sqrt(leadTimeWeeks));
  }

  function leadTimeExtraMax(leadTimeWeeks, level) {
    if (level === "off") {
      return 0;
    }
    var values = LT_ANCHOR[level];
    if (!values) {
      return 0;
    }
    var L = Number(leadTimeWeeks);
    var raw;
    if (L <= LT_KNOTS[0]) {
      var slopeStart = (values[1] - values[0]) / (LT_KNOTS[1] - LT_KNOTS[0]);
      raw = values[0] + (L - LT_KNOTS[0]) * slopeStart;
    } else if (L >= LT_KNOTS[2]) {
      var slopeEnd = (values[2] - values[1]) / (LT_KNOTS[2] - LT_KNOTS[1]);
      raw = values[2] + (L - LT_KNOTS[2]) * slopeEnd;
    } else if (L <= LT_KNOTS[1]) {
      var slopeMid = (values[1] - values[0]) / (LT_KNOTS[1] - LT_KNOTS[0]);
      raw = values[0] + (L - LT_KNOTS[0]) * slopeMid;
    } else {
      var slopeHi = (values[2] - values[1]) / (LT_KNOTS[2] - LT_KNOTS[1]);
      raw = values[1] + (L - LT_KNOTS[1]) * slopeHi;
    }
    var rounded = roundHalfEven(raw);
    if (rounded < 1) {
      return 1;
    }
    return rounded;
  }

  function sampleShockWeeks(gen) {
    var pool = [];
    for (var week = 21; week <= 46; week += 1) {
      pool.push(week);
    }
    for (var i = 0; i < 3; i += 1) {
      var j = nextInt(gen, i, pool.length - 1);
      var swap = pool[i];
      pool[i] = pool[j];
      pool[j] = swap;
    }
    var z = pool.slice(0, 3);
    z.sort(function (a, b) {
      return a - b;
    });
    return [z[0], z[1] + 3, z[2] + 6];
  }

  function nominalLotQty(controls, base) {
    if (controls.lotMode === "weeks") {
      return sumFirst(base, controls.lotWeeks);
    }
    return controls.lotQty;
  }

  function computedSafetyStock(controls, base, normalDemand) {
    if (controls.ssMode === "weeks") {
      return sumFirst(base, controls.ssWeeks);
    }
    if (controls.ssMode === "formula") {
      return formulaSafetyStock(
        normalDemand,
        controls.serviceLevel,
        controls.leadTimeWeeks
      );
    }
    return controls.ssQty;
  }

  function sampleLotReceipt(gen, controls, base, nominal) {
    if (controls.deliveryVariability === "off") {
      return nominal;
    }
    if (controls.lotMode === "weeks") {
      var extra = WEEKS_COVER_EXTRA[controls.lotWeeks][controls.deliveryVariability];
      var maxReduce = Math.abs(extra);
      var reduction = 0;
      if (maxReduce > 0) {
        reduction = nextInt(gen, 0, maxReduce);
      }
      return sumFirst(base, controls.lotWeeks - reduction);
    }
    var pct = DELIVERY_PCT[controls.deliveryVariability];
    var maxShort = roundHalfEven((nominal * pct) / 100);
    if (maxShort <= 0) {
      return nominal;
    }
    return nominal - nextInt(gen, 0, maxShort);
  }

  function buildDemand(gen, controls, base) {
    var normalDemand = [];
    var demandFactors = [];
    var bounds = DEMAND_FACTORS[controls.demandVariability];
    for (var w = 0; w < HORIZON; w += 1) {
      var factor = 1;
      if (bounds) {
        factor = nextUniform(gen, bounds[0], bounds[1]);
      }
      demandFactors.push(factor);
      normalDemand.push(roundHalfEven(base[w] * factor));
    }
    var shockWeeks = [];
    var shockSet = {};
    if (controls.shock) {
      shockWeeks = sampleShockWeeks(gen);
      for (var s = 0; s < shockWeeks.length; s += 1) {
        shockSet[shockWeeks[s]] = true;
      }
    }
    var simulatedDemand = [];
    for (var i = 0; i < HORIZON; i += 1) {
      if (shockSet[i + 1]) {
        simulatedDemand.push(roundHalfEven(normalDemand[i] * SHOCK_MULTIPLIER));
      } else {
        simulatedDemand.push(normalDemand[i]);
      }
    }
    return {
      normalDemand: normalDemand,
      demandFactors: demandFactors,
      shockWeeks: shockWeeks,
      simulatedDemand: simulatedDemand,
    };
  }

  function unitsSoldInWeek(week) {
    var onHand = week.beginningSoh > 0 ? week.beginningSoh : 0;
    var supply = week.plannedSupply > 0 ? week.plannedSupply : 0;
    var demand = week.simulatedDemand > 0 ? week.simulatedDemand : 0;
    var available = onHand + supply;
    return demand < available ? demand : available;
  }

  function computeMetrics(weeks, unitCost, sellingPrice) {
    var oosWeeks = 0;
    var sumEnding = 0;
    var sumFloored = 0;
    var annualDemand = 0;
    var unitsSold = 0;
    for (var i = 0; i < weeks.length; i += 1) {
      var ending = weeks[i].endingSoh;
      if (ending < 0) {
        oosWeeks += 1;
      }
      sumEnding += ending;
      sumFloored += ending > 0 ? ending : 0;
      annualDemand += weeks[i].simulatedDemand;
      unitsSold += unitsSoldInWeek(weeks[i]);
    }
    var n = weeks.length || HORIZON;
    var avgSohTurns = sumFloored / n;
    var inventoryTurns = avgSohTurns === 0 ? null : annualDemand / avgSohTurns;
    var gpEach = sellingPrice - unitCost;
    return {
      oosWeeks: oosWeeks,
      csl: ((n - oosWeeks) / n) * 100,
      annualDemand: annualDemand,
      unitsSold: unitsSold,
      unmetDemand: annualDemand - unitsSold,
      avgSohTurns: avgSohTurns,
      inventoryTurns: inventoryTurns,
      averageWc: (sumEnding / n) * unitCost,
      annualGp: unitsSold * gpEach,
      unitCost: unitCost,
      sellingPrice: sellingPrice,
      unitGp: gpEach,
    };
  }

  function percentileLinear(values, percentile) {
    if (!values || !values.length) {
      return null;
    }
    var xs = values.slice().sort(function (a, b) {
      return a - b;
    });
    if (xs.length === 1) {
      return xs[0];
    }
    var rank = (xs.length - 1) * (percentile / 100);
    var lo = Math.floor(rank);
    var hi = Math.ceil(rank);
    if (lo === hi) {
      return xs[lo];
    }
    var weight = rank - lo;
    return xs[lo] * (1 - weight) + xs[hi] * weight;
  }

  function summariseMonteCarlo(runs) {
    function collect(read) {
      var values = [];
      for (var i = 0; i < runs.length; i += 1) {
        var value = read(runs[i]);
        if (value != null && isFinite(value)) {
          values.push(value);
        }
      }
      return values;
    }
    function band(values) {
      return {
        median: percentileLinear(values, 50),
        p10: percentileLinear(values, 10),
        p90: percentileLinear(values, 90),
      };
    }
    var turns = [];
    for (var i = 0; i < runs.length; i += 1) {
      var inventoryTurns = runs[i].metrics.inventoryTurns;
      if (inventoryTurns != null && isFinite(inventoryTurns)) {
        turns.push(inventoryTurns);
      }
    }
    return {
      runs: runs.length,
      oosWeeks: band(collect(function (run) { return run.metrics.oosWeeks; })),
      csl: band(collect(function (run) { return run.metrics.csl; })),
      inventoryTurns: {
        median: percentileLinear(turns, 50),
        p10: percentileLinear(turns, 10),
        p90: percentileLinear(turns, 90),
        observations: turns.length,
      },
      averageWc: band(collect(function (run) { return run.metrics.averageWc; })),
      annualGp: {
        median: percentileLinear(collect(function (run) { return run.metrics.annualGp; }), 50),
      },
    };
  }

  function runYear(sku, globals, seed, options) {
    var g = globals || {};
    var opts = options || {};
    var controls = {
      lotMode: sku.lotMode,
      lotQty: sku.lotQty,
      lotWeeks: sku.lotWeeks,
      ssMode: sku.ssMode,
      ssQty: sku.ssQty,
      ssWeeks: sku.ssWeeks,
      serviceLevel: sku.serviceLevel,
      leadTimeWeeks: sku.leadTimeWeeks,
      demandVariability: sku.demandVariability,
      leadTimeVariability: sku.leadTimeVariability,
      deliveryVariability: g.deliveryVariability || "off",
      shock: Boolean(g.shock),
    };
    var gen = createGenerator(seed >>> 0);
    var base = repeat(sku.forecast, HORIZON);
    var demand = buildDemand(gen, controls, base);
    var nominalLot = nominalLotQty(controls, base);
    var computedSs = computedSafetyStock(controls, base, demand.normalDemand);
    var safetyStock = computedSs;
    var safetyStockFrozen = false;
    if (opts.frozenSafetyStock !== undefined && opts.frozenSafetyStock !== null) {
      var frozen = roundHalfEven(Number(opts.frozenSafetyStock));
      if (isFinite(frozen)) {
        safetyStock = frozen;
        safetyStockFrozen = true;
      }
    }
    var startingSoh = sku.currentStock;
    var due = repeat(0, HORIZON);
    var weeks = [];
    var releases = [];
    var previousEnding = null;

    for (var w = 0; w < HORIZON; w += 1) {
      var beginning = w === 0 ? startingSoh : previousEnding;
      var existing = due[w];
      var weekBase = base[w];
      var weekDemand = demand.simulatedDemand[w];
      var calculated = beginning + existing - weekBase;
      var threshold = safetyStock > 0 ? safetyStock : 0;
      var newReceipt = 0;

      if (calculated < threshold) {
        var lots = calculated + nominalLot > 0 ? 1 : 2;
        var lotReceipts = [];
        var received = 0;
        for (var lot = 0; lot < lots; lot += 1) {
          var qty = sampleLotReceipt(gen, controls, base, nominalLot);
          lotReceipts.push(qty);
          received += qty;
        }
        var delay = 0;
        var extraMax = leadTimeExtraMax(
          controls.leadTimeWeeks,
          controls.leadTimeVariability
        );
        if (extraMax > 0) {
          delay = nextInt(gen, 0, extraMax);
        }
        var arrivalIndex = w + delay;
        if (arrivalIndex === w) {
          newReceipt = received;
        } else if (arrivalIndex < HORIZON) {
          due[arrivalIndex] += received;
        }
        releases.push({
          requirementWeek: w + 1,
          lots: lots,
          nominalLot: nominalLot,
          lotReceipts: lotReceipts,
          received: received,
          delay: delay,
          arrivalWeek: w + 1 + delay,
        });
      }

      var plannedSupply = existing + newReceipt;
      var endingSoh = beginning + plannedSupply - weekDemand;
      weeks.push({
        week: w + 1,
        baseDemand: base[w],
        simulatedDemand: weekDemand,
        beginningSoh: beginning,
        plannedSupply: plannedSupply,
        endingSoh: endingSoh,
        safetyStock: safetyStock,
      });
      previousEnding = endingSoh;
    }

    var sigma = populationStdev(demand.normalDemand);
    return {
      skuId: sku.id,
      label: sku.label,
      controls: controls,
      prices: {
        cost: sku.unitCost,
        sell: sku.sellingPrice,
        gp: sku.sellingPrice - sku.unitCost,
      },
      seed: seed >>> 0,
      baseDemand: base,
      normalDemand: demand.normalDemand,
      shockWeeks: demand.shockWeeks,
      simulatedDemand: demand.simulatedDemand,
      nominalLot: nominalLot,
      startingSoh: startingSoh,
      safetyStock: safetyStock,
      safetyStockFrozen: safetyStockFrozen,
      formula: {
        z: Z_BY_SERVICE_LEVEL[controls.serviceLevel],
        sigma: sigma,
        leadTimeWeeks: controls.leadTimeWeeks,
        computedSafetyStock: computedSs,
        safetyStock: safetyStock,
        frozen: safetyStockFrozen,
      },
      weeks: weeks,
      releases: releases,
      metrics: computeMetrics(weeks, sku.unitCost, sku.sellingPrice),
    };
  }

  function runMonteCarlo(sku, globals, parentSeed, options) {
    var opts = options || {};
    var count = opts.runs || MC_RUNS;
    var parent = parentSeed >>> 0;
    var frozen = opts.frozenSafetyStock;
    if (sku.ssMode === "formula" && (frozen === undefined || frozen === null)) {
      frozen = runYear(sku, globals, formulaReferenceSeed(parent)).safetyStock;
    }
    var seeds = spawnSeeds(parent, count);
    var runs = [];
    for (var i = 0; i < count; i += 1) {
      var runOptions = {};
      if (sku.ssMode === "formula" && frozen !== undefined && frozen !== null) {
        runOptions.frozenSafetyStock = frozen;
      }
      var result = runYear(sku, globals, seeds[i], runOptions);
      result.runIndex = i + 1;
      result.seed = seeds[i];
      runs.push(result);
    }
    return {
      parentSeed: parent,
      seeds: seeds,
      frozenSafetyStock:
        sku.ssMode === "formula" && frozen !== undefined && frozen !== null
          ? roundHalfEven(Number(frozen))
          : null,
      runs: runs,
      summary: summariseMonteCarlo(runs),
    };
  }

  function portfolioJobs(scenario, mode, seed) {
    var parent = seed >>> 0;
    var jobs = [];
    var skus = scenario.skus || [];
    for (var s = 0; s < skus.length; s += 1) {
      var sku = skus[s];
      if (mode === "monte-carlo") {
        var frozen = null;
        if (sku.ssMode === "formula") {
          frozen = runYear(sku, scenario, formulaReferenceSeed(parent)).safetyStock;
        }
        var seeds = spawnSeeds(parent, MC_RUNS);
        for (var i = 0; i < seeds.length; i += 1) {
          jobs.push({
            skuIndex: s,
            seed: seeds[i],
            frozenSafetyStock: frozen,
            runIndex: i + 1,
          });
        }
      } else {
        jobs.push({
          skuIndex: s,
          seed: parent,
          frozenSafetyStock: null,
          runIndex: 1,
        });
      }
    }
    return jobs;
  }

  function assembleMonteCarlo(sku, globals, parentSeed, runs) {
    var frozen = null;
    if (sku.ssMode === "formula" && runs.length && runs[0].safetyStockFrozen) {
      frozen = runs[0].safetyStock;
    }
    return {
      parentSeed: parentSeed >>> 0,
      seeds: runs.map(function (run) { return run.seed; }),
      frozenSafetyStock: frozen,
      runs: runs,
      summary: summariseMonteCarlo(runs),
    };
  }

  function defaultSku(index) {
    var n = index || 1;
    return {
      id: "sku-" + n,
      label: "SKU " + n,
      forecast: 40,
      demandVariability: "medium",
      leadTimeWeeks: 5,
      leadTimeVariability: "off",
      currentStock: 80,
      unitCost: 70,
      sellingPrice: 100,
      lotMode: "fixed",
      lotQty: 40,
      lotWeeks: 4,
      ssMode: "fixed",
      ssQty: 20,
      ssWeeks: 4,
      serviceLevel: 95,
    };
  }

  function defaultScenario() {
    return {
      seed: null,
      deliveryVariability: "off",
      shock: false,
      skus: [defaultSku(1)],
    };
  }

  function cleanNumber(value) {
    return String(value == null ? "" : value)
      .trim()
      .replace(/[$,\s]/g, "");
  }

  function parseWhole(value) {
    var text = cleanNumber(value);
    if (text === "") {
      return { empty: true };
    }
    if (!/^-?\d+(\.0+)?$/.test(text)) {
      return { bad: "whole" };
    }
    var n = Number(text);
    if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_QTY) {
      return { bad: "range" };
    }
    if (n < 0) {
      return { bad: "negative", value: n };
    }
    return { value: n };
  }

  function parseMoney(value) {
    var text = cleanNumber(value);
    if (text === "") {
      return { empty: true };
    }
    if (!/^\d+(\.\d+)?$/.test(text)) {
      return { bad: "money" };
    }
    var n = Number(text);
    if (!isFinite(n) || n > MAX_QTY) {
      return { bad: "range" };
    }
    return { value: n };
  }

  function parseLevel(value, fallback) {
    if (value == null || String(value).trim() === "") {
      return fallback === undefined ? { empty: true } : { value: fallback };
    }
    var text = String(value).trim().toLowerCase();
    if (LEVELS.indexOf(text) === -1) {
      return { bad: true };
    }
    return { value: text };
  }

  function oneOfNumber(value, allowed, fallback) {
    if (value == null || String(value).trim() === "") {
      return { value: fallback, usedDefault: true };
    }
    var parsed = parseWhole(value);
    if (parsed.bad || parsed.empty) {
      return { bad: true };
    }
    if (allowed.indexOf(parsed.value) === -1) {
      return { bad: true };
    }
    return { value: parsed.value };
  }

  function prefixError(prefix, message) {
    return prefix ? prefix + ": " + message : message;
  }

  function parseSkuFields(fields, prefix) {
    var source = fields || {};
    var errors = [];
    var warnings = [];
    function err(message) {
      errors.push(prefixError(prefix, message));
    }
    function warn(message) {
      warnings.push(prefixError(prefix, message));
    }

    var label = String(source.label == null ? "" : source.label).trim();
    if (!label) {
      err("Enter a SKU name.");
    } else if (label.length > MAX_LABEL) {
      err("Use a SKU name of " + MAX_LABEL + " characters or fewer.");
    }

    var forecast = parseWhole(source.forecast);
    if (forecast.empty) {
      err("Enter a weekly forecast above zero.");
    } else if (forecast.bad === "negative") {
      err("Weekly forecast cannot be negative.");
    } else if (forecast.bad === "range") {
      err("Weekly forecast must be a whole number under 1,000,000,000.");
    } else if (forecast.bad) {
      err("Weekly forecast must be a whole number.");
    } else if (forecast.value === 0) {
      err("Enter a weekly forecast above zero.");
    } else if (forecast.value > MAX_QTY) {
      err("Weekly forecast must be under 1,000,000,000.");
    }

    var stock = parseWhole(source.currentStock);
    if (stock.empty) {
      err("Enter current stock of zero or more.");
    } else if (stock.bad === "negative") {
      err("Current stock cannot be negative.");
    } else if (stock.bad) {
      err("Current stock must be a whole number.");
    }

    var lead = parseWhole(source.leadTimeWeeks);
    if (lead.empty) {
      err("Enter a lead time in whole weeks from 1 to 26.");
    } else if (lead.bad === "negative" || lead.bad) {
      err("Lead time must be a whole number of weeks from 1 to 26.");
    } else if (lead.value < 1 || lead.value > 26) {
      err("Lead time must be a whole number of weeks from 1 to 26.");
    }

    var cost = parseMoney(source.unitCost);
    if (cost.empty) {
      err("Enter a unit cost of zero or more.");
    } else if (cost.bad) {
      err("Unit cost must be zero or a positive amount.");
    }

    var price = parseMoney(source.sellingPrice);
    if (price.empty) {
      err("Enter a selling price of zero or more.");
    } else if (price.bad) {
      err("Selling price must be zero or a positive amount.");
    }

    var lotModeText = String(source.lotMode == null ? "" : source.lotMode).trim().toLowerCase();
    var lotMode =
      lotModeText === "" || lotModeText === "fixed" || lotModeText === "f" || lotModeText === "fixed quantity"
        ? "fixed"
        : lotModeText === "weeks" || lotModeText === "w" || lotModeText === "weeks cover" || lotModeText === "weeks of cover"
          ? "weeks"
          : null;
    if (!lotMode) {
      err("Lot size mode must be fixed or weeks.");
      lotMode = "fixed";
    }

    var ssModeText = String(source.ssMode == null ? "" : source.ssMode).trim().toLowerCase();
    var ssMode =
      ssModeText === "" || ssModeText === "fixed" || ssModeText === "f"
        ? "fixed"
        : ssModeText === "formula" || ssModeText === "u"
          ? "formula"
          : ssModeText === "weeks" || ssModeText === "w"
            ? "weeks"
            : null;
    if (!ssMode) {
      err("Safety stock mode must be fixed, formula, or weeks.");
      ssMode = "fixed";
    }

    var lotQty = source.lotQty == null ? { missing: true } : parseWhole(source.lotQty);
    if (lotMode === "fixed") {
      if (lotQty.missing) {
        if (forecast.value > 0) {
          lotQty = { value: forecast.value };
          warn("Fixed lot was missing. The weekly forecast was used.");
        } else {
          err("Enter a fixed lot of at least 1.");
        }
      } else if (lotQty.empty || lotQty.bad === "negative" || lotQty.value === 0 || lotQty.bad) {
        err("Fixed lot size must be a whole number of at least 1.");
      }
    } else if (lotQty.missing) {
      lotQty = { value: forecast.value > 0 ? forecast.value : 1 };
    } else if (lotQty.empty) {
      lotQty = { value: forecast.value > 0 ? forecast.value : 1 };
    } else if (lotQty.bad) {
      err("Lot quantity must be a whole number when it is filled in.");
    }

    var ssQty = source.ssQty == null ? { missing: true } : parseWhole(source.ssQty);
    if (ssMode === "fixed") {
      if (ssQty.missing) {
        ssQty = { value: 0 };
        warn("Fixed safety stock was missing. Zero was used.");
      } else if (ssQty.empty) {
        err("Enter a fixed safety stock of zero or more.");
      } else if (ssQty.bad === "negative") {
        err("Fixed safety stock cannot be negative.");
      } else if (ssQty.bad) {
        err("Fixed safety stock must be a whole number of zero or more.");
      }
    } else if (ssQty.missing || ssQty.empty) {
      ssQty = { value: 0 };
    } else if (ssQty.bad) {
      err("Safety stock quantity must be a whole number when it is filled in.");
    }

    var lotWeeks = oneOfNumber(source.lotWeeks, COVER_OPTIONS, 4);
    if (lotWeeks.bad) {
      err("Weeks of cover for the lot must be 2, 4, 6, or 10.");
    }
    var ssWeeks = oneOfNumber(source.ssWeeks, COVER_OPTIONS, 4);
    if (ssWeeks.bad) {
      err("Weeks of cover for safety stock must be 2, 4, 6, or 10.");
    }
    var service = oneOfNumber(source.serviceLevel, SERVICE_LEVELS, 95);
    if (service.bad) {
      err("Service level must be 90, 95, 98, or 99.");
    }

    var demand = parseLevel(source.demandVariability, "medium");
    if (demand.bad) {
      err("Demand variability must be off, small, medium, or large.");
    }
    var leadVar = parseLevel(source.leadTimeVariability, "off");
    if (leadVar.bad) {
      err("Lead time variability must be off, small, medium, or large.");
    }

    if (forecast.value > 0 && stock.value != null && stock.value > forecast.value * HORIZON) {
      warn("Current stock is more than 52 weeks of cover.");
    }
    if (
      lotMode === "fixed" &&
      forecast.value > 0 &&
      lotQty.value != null &&
      lotQty.value < forecast.value
    ) {
      warn("The fixed lot is smaller than the weekly forecast.");
    }
    if (cost.value != null && price.value != null && cost.value >= price.value) {
      warn("Unit cost is at least the selling price, so gross profit is zero or negative.");
    }

    if (errors.length) {
      return { ok: false, errors: errors, warnings: warnings, sku: null };
    }

    var id = String(source.id || "").trim() || "sku-1";
    return {
      ok: true,
      errors: errors,
      warnings: warnings,
      sku: {
        id: id,
        label: label,
        forecast: forecast.value,
        demandVariability: demand.value,
        leadTimeWeeks: lead.value,
        leadTimeVariability: leadVar.value,
        currentStock: stock.value,
        unitCost: cost.value,
        sellingPrice: price.value,
        lotMode: lotMode,
        lotQty: lotQty.value == null ? forecast.value : lotQty.value,
        lotWeeks: lotWeeks.value,
        ssMode: ssMode,
        ssQty: ssQty.value == null ? 0 : ssQty.value,
        ssWeeks: ssWeeks.value,
        serviceLevel: service.value,
      },
    };
  }

  function validateScenario(input) {
    var source = input || {};
    var errors = [];
    var warnings = [];
    var skusIn = Array.isArray(source.skus) ? source.skus : [];
    if (!skusIn.length) {
      errors.push("Add at least one SKU.");
    }
    if (skusIn.length > MAX_SKUS) {
      errors.push("At most 10 SKUs can be simulated.");
    }
    var skus = [];
    var count = Math.min(skusIn.length, MAX_SKUS);
    for (var i = 0; i < count; i += 1) {
      var parsed = parseSkuFields(skusIn[i], skusIn[i] && skusIn[i].label ? String(skusIn[i].label).trim() : "SKU " + (i + 1));
      errors = errors.concat(parsed.errors);
      warnings = warnings.concat(parsed.warnings);
      if (parsed.sku) {
        if (!skusIn[i].id) {
          parsed.sku.id = "sku-" + (i + 1);
        }
        skus.push(parsed.sku);
      }
    }
    var deliveryParsed = parseLevel(source.deliveryVariability, "off");
    if (deliveryParsed.bad) {
      errors.push("Delivery quantity variability must be off, small, medium, or large.");
    }
    var seed = null;
    if (source.seed != null && source.seed !== "") {
      var seedNum = Number(source.seed);
      if (!isFinite(seedNum)) {
        errors.push("The sample number is not valid.");
      } else {
        seed = (seedNum >>> 0) || 1;
      }
    }
    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      scenario: {
        seed: seed,
        deliveryVariability: deliveryParsed.value || "off",
        shock: Boolean(source.shock),
        skus: skus.length ? skus : [defaultSku(1)],
      },
    };
  }

  function headerKey(name) {
    var text = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[%]+/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    return CSV_ALIASES[text] || null;
  }

  function parseDelimited(text) {
    var source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var headerLine = source.split("\n", 1)[0] || "";
    var delimiter = headerLine.indexOf("\t") !== -1 ? "\t" : ",";
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    for (var i = 0; i < source.length; i += 1) {
      var ch = source[i];
      if (inQuotes) {
        if (ch === '"') {
          if (source[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(function (cells) {
      return cells.some(function (cell) { return String(cell).trim() !== ""; });
    });
  }

  function parseShockCell(value) {
    var text = String(value == null ? "" : value).trim().toLowerCase();
    if (text === "") {
      return { empty: true };
    }
    if (text === "1" || text === "true" || text === "yes" || text === "y" || text === "on") {
      return { value: true };
    }
    if (text === "0" || text === "false" || text === "no" || text === "n" || text === "off") {
      return { value: false };
    }
    return { bad: true };
  }

  function parseTable(text) {
    var table = parseDelimited(text);
    var errors = [];
    var warnings = [];
    if (!table.length) {
      return {
        ok: false,
        errors: ["Paste a header row and at least one SKU."],
        warnings: warnings,
        skus: [],
        deliveryVariability: null,
        shock: null,
        ignoredRows: 0,
        preview: [],
      };
    }
    var headers = table[0].map(headerKey);
    if (headers.indexOf("label") === -1 || headers.indexOf("forecast") === -1) {
      errors.push("The first row must be a header with sku and weekly_forecast columns.");
    }
    var unknown = [];
    table[0].forEach(function (cell) {
      var raw = String(cell || "").trim();
      if (raw && !headerKey(raw) && unknown.indexOf(raw) === -1) {
        unknown.push(raw);
      }
    });
    if (unknown.length) {
      warnings.push("Some columns were ignored: " + unknown.join(", ") + ".");
    }
    var dataRows = table.slice(1);
    if (!dataRows.length) {
      errors.push("Add at least one SKU row under the header.");
    }
    var ignoredRows = 0;
    if (dataRows.length > MAX_SKUS) {
      ignoredRows = dataRows.length - MAX_SKUS;
      warnings.push(
        dataRows.length +
          " data rows were found. The first 10 are used. The rest were ignored."
      );
      dataRows = dataRows.slice(0, MAX_SKUS);
    }
    var preview = [];
    var skus = [];
    var delivery = null;
    var shock = null;
    var sawDelivery = headers.indexOf("deliveryVariability") !== -1;
    var sawShock = headers.indexOf("shock") !== -1;
    dataRows.forEach(function (cells, index) {
      var record = {};
      headers.forEach(function (key, cellIndex) {
        if (!key) {
          return;
        }
        record[key] = cells[cellIndex] == null ? "" : String(cells[cellIndex]).trim();
      });
      var rowNumber = index + 2;
      var parsed = parseSkuFields(record, "Row " + rowNumber);
      if (sawDelivery && record.deliveryVariability !== "") {
        var deliveryCell = parseLevel(record.deliveryVariability);
        if (deliveryCell.bad || deliveryCell.empty) {
          parsed.errors.push("Row " + rowNumber + ": Delivery variability must be off, small, medium, or large.");
          parsed.ok = false;
        } else if (delivery == null) {
          delivery = deliveryCell.value;
        } else if (delivery !== deliveryCell.value) {
          warnings.push("Row " + rowNumber + ": Delivery variability differs. The first value (" + delivery + ") is used for every SKU.");
        }
      }
      if (sawShock && record.shock !== "") {
        var shockCell = parseShockCell(record.shock);
        if (shockCell.bad || shockCell.empty) {
          parsed.errors.push("Row " + rowNumber + ": Demand shock must be yes or no.");
          parsed.ok = false;
        } else if (shock == null) {
          shock = shockCell.value;
        } else if (shock !== shockCell.value) {
          warnings.push("Row " + rowNumber + ": Demand shock differs. The first value is used for every SKU.");
        }
      }
      errors = errors.concat(parsed.errors);
      warnings = warnings.concat(parsed.warnings);
      preview.push({
        rowNumber: rowNumber,
        label: record.label || "",
        forecast: record.forecast || "",
        leadTimeWeeks: record.leadTimeWeeks || "",
        currentStock: record.currentStock || "",
        unitCost: record.unitCost || "",
        sellingPrice: record.sellingPrice || "",
        errors: parsed.errors,
        warnings: parsed.warnings,
      });
      if (parsed.ok && parsed.sku) {
        parsed.sku.id = "sku-" + (index + 1);
        skus.push(parsed.sku);
      }
    });
    var ok = errors.length === 0 && skus.length > 0;
    return {
      ok: ok,
      errors: errors,
      warnings: warnings,
      skus: ok ? skus : [],
      deliveryVariability: delivery,
      shock: shock,
      ignoredRows: ignoredRows,
      preview: preview,
    };
  }

  function compactSku(sku) {
    return [
      sku.label,
      sku.forecast,
      LEVEL_CODE[sku.demandVariability],
      sku.leadTimeWeeks,
      LEVEL_CODE[sku.leadTimeVariability],
      sku.currentStock,
      sku.unitCost,
      sku.sellingPrice,
      LOT_CODE[sku.lotMode],
      sku.lotQty,
      sku.lotWeeks,
      SS_CODE[sku.ssMode],
      sku.ssQty,
      sku.ssWeeks,
      sku.serviceLevel,
    ];
  }

  function expandSku(row, index) {
    if (!Array.isArray(row) || row.length < 15) {
      return null;
    }
    return {
      id: "sku-" + (index + 1),
      label: row[0],
      forecast: row[1],
      demandVariability: LEVEL_FROM[row[2]] || row[2],
      leadTimeWeeks: row[3],
      leadTimeVariability: LEVEL_FROM[row[4]] || row[4],
      currentStock: row[5],
      unitCost: row[6],
      sellingPrice: row[7],
      lotMode: LOT_FROM[row[8]] || row[8],
      lotQty: row[9],
      lotWeeks: row[10],
      ssMode: SS_FROM[row[11]] || row[11],
      ssQty: row[12],
      ssWeeks: row[13],
      serviceLevel: row[14],
    };
  }

  function utf8ToBase64Url(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    var base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToUtf8(value) {
    try {
      var base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      var binary = atob(base64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch (err) {
      return null;
    }
  }

  function encodeScenario(input) {
    var checked = validateScenario(input);
    if (!checked.ok) {
      return {
        ok: false,
        errors: checked.errors,
        warnings: checked.warnings,
        fragment: "",
        length: 0,
        overLimit: false,
      };
    }
    var payload = {
      v: 1,
      d: LEVEL_CODE[checked.scenario.deliveryVariability],
      k: checked.scenario.shock ? 1 : 0,
      u: checked.scenario.skus.map(compactSku),
    };
    if (checked.scenario.seed) {
      payload.s = checked.scenario.seed;
    }
    var fragment = "#d=" + utf8ToBase64Url(JSON.stringify(payload));
    var overLimit = fragment.length > FRAGMENT_LIMIT;
    var warnings = checked.warnings.slice();
    if (overLimit) {
      warnings.push(
        "This link is over 2,000 characters. Shorten the SKU names before sharing it."
      );
    }
    return {
      ok: true,
      errors: [],
      warnings: warnings,
      fragment: fragment,
      length: fragment.length,
      overLimit: overLimit,
      scenario: checked.scenario,
    };
  }

  function decodeScenario(fragment) {
    var fallback = {
      ok: false,
      errors: ["This link could not be read. Example numbers are shown instead."],
      warnings: [],
      scenario: defaultScenario(),
    };
    var text = String(fragment || "").trim();
    var token = "";
    if (text.indexOf("#d=") !== -1) {
      token = text.slice(text.indexOf("#d=") + 3);
    } else if (text.indexOf("d=") === 0) {
      token = text.slice(2);
    } else {
      return fallback;
    }
    token = token.split("&")[0].split("#")[0];
    var json = base64UrlToUtf8(token);
    if (!json) {
      return fallback;
    }
    var payload;
    try {
      payload = JSON.parse(json);
    } catch (err) {
      return fallback;
    }
    if (!payload || payload.v !== 1 || !Array.isArray(payload.u)) {
      return fallback;
    }
    var delivery = LEVEL_FROM[payload.d];
    if (!delivery) {
      return fallback;
    }
    var skus = [];
    for (var i = 0; i < payload.u.length; i += 1) {
      var expanded = expandSku(payload.u[i], i);
      if (!expanded) {
        return fallback;
      }
      skus.push(expanded);
    }
    var checked = validateScenario({
      seed: payload.s,
      deliveryVariability: delivery,
      shock: payload.k === 1 || payload.k === true,
      skus: skus,
    });
    if (!checked.ok) {
      return {
        ok: false,
        errors: checked.errors,
        warnings: checked.warnings,
        scenario: defaultScenario(),
      };
    }
    return {
      ok: true,
      errors: [],
      warnings: checked.warnings,
      scenario: checked.scenario,
    };
  }

  function shockStockout(result) {
    if (!result || !result.shockWeeks || !result.shockWeeks.length) {
      return false;
    }
    var earliest = result.shockWeeks[0];
    for (var i = 1; i < result.shockWeeks.length; i += 1) {
      if (result.shockWeeks[i] < earliest) {
        earliest = result.shockWeeks[i];
      }
    }
    for (var w = 0; w < result.weeks.length; w += 1) {
      if (result.weeks[w].endingSoh < 0 && result.weeks[w].week >= earliest) {
        return true;
      }
    }
    return false;
  }

  function contextFromYear(sku, globals, result) {
    var g = globals || {};
    return {
      mode: "year",
      demandVariability: sku.demandVariability,
      leadTimeVariability: sku.leadTimeVariability,
      deliveryVariability: g.deliveryVariability || "off",
      shock: Boolean(g.shock),
      lotMode: sku.lotMode,
      lotWeeks: sku.lotWeeks,
      ssMode: sku.ssMode,
      oosWeeks: result.metrics.oosWeeks,
      csl: result.metrics.csl,
      inventoryTurns: result.metrics.inventoryTurns,
      averageWc: result.metrics.averageWc,
      annualGp: result.metrics.annualGp,
      safetyStock: result.safetyStock,
      oosSpread: null,
      shockStockout: shockStockout(result),
    };
  }

  function contextFromMonteCarlo(sku, globals, batch) {
    var g = globals || {};
    var summary = batch.summary;
    var hits = 0;
    for (var i = 0; i < batch.runs.length; i += 1) {
      if (shockStockout(batch.runs[i])) {
        hits += 1;
      }
    }
    var spread = null;
    if (summary.oosWeeks.p90 != null && summary.oosWeeks.p10 != null) {
      spread = summary.oosWeeks.p90 - summary.oosWeeks.p10;
    }
    return {
      mode: "monte-carlo",
      demandVariability: sku.demandVariability,
      leadTimeVariability: sku.leadTimeVariability,
      deliveryVariability: g.deliveryVariability || "off",
      shock: Boolean(g.shock),
      lotMode: sku.lotMode,
      lotWeeks: sku.lotWeeks,
      ssMode: sku.ssMode,
      oosWeeks: summary.oosWeeks.median,
      csl: summary.csl.median,
      inventoryTurns: summary.inventoryTurns.median,
      averageWc: summary.averageWc.median,
      annualGp: summary.annualGp.median,
      safetyStock: batch.runs.length ? batch.runs[0].safetyStock : 0,
      oosSpread: spread,
      shockStockout: batch.runs.length > 0 && hits * 2 >= batch.runs.length,
    };
  }

  function matchingRules(ctx) {
    var rules = [];
    var turns = ctx.inventoryTurns;
    var oos = ctx.oosWeeks;
    if (turns != null && isFinite(turns) && turns >= STRONG_TURNS && (ctx.csl < WEAK_CSL || oos >= HIGH_OOS)) {
      rules.push({
        id: 1,
        text: "In the scenario you ran, high turns came with weak service: the stock looks busy because it is often missing.",
      });
    }
    if (oos === 0 && ctx.safetyStock > 0) {
      rules.push({
        id: 2,
        text: "In the scenario you ran, there were no stockouts. Try a lower safety stock to see where service starts to drop.",
      });
    }
    if ((ctx.leadTimeVariability !== "off" || ctx.deliveryVariability !== "off") && oos > 0) {
      rules.push({
        id: 3,
        text:
          ctx.safetyStock > 0
            ? "In the scenario you ran, late or short deliveries showed up as stockouts even with safety stock in place."
            : "In the scenario you ran, late or short deliveries showed up as stockouts.",
      });
    }
    if (ctx.shock && ctx.shockStockout) {
      rules.push({
        id: 4,
        text: "In the scenario you ran, the doubled-demand weeks used up the buffer. Shocks are hard to plan for.",
      });
    }
    if (
      ctx.ssMode === "formula" &&
      (ctx.leadTimeVariability !== "off" || ctx.deliveryVariability !== "off" || ctx.shock)
    ) {
      var switched = [];
      if (ctx.leadTimeVariability !== "off") {
        switched.push("lead-time variability");
      }
      if (ctx.deliveryVariability !== "off") {
        switched.push("short deliveries");
      }
      if (ctx.shock) {
        switched.push("the demand shock");
      }
      rules.push({
        id: 5,
        text:
          "In the scenario you ran, safety stock used the textbook formula. That formula assumes a fixed lead time and random demand only, so it does not cover " +
          switched.join(" or ") +
          ".",
      });
    }
    if (ctx.lotMode === "weeks" && ctx.lotWeeks >= 6 && turns != null && isFinite(turns) && turns < 6) {
      rules.push({
        id: 6,
        text: "In the scenario you ran, big lots raise average stock and working capital, which lowers turns.",
      });
    }
    if (ctx.averageWc != null && isFinite(ctx.averageWc) && ctx.averageWc < 0) {
      rules.push({
        id: 7,
        text: "In the scenario you ran, negative average stock means backorders outweighed stock on hand.",
      });
    }
    if (ctx.mode === "monte-carlo" && ctx.oosSpread != null && ctx.oosSpread >= 4) {
      rules.push({
        id: 8,
        text: "In the scenario you ran, the results vary a lot from year to year under the same settings.",
      });
    }
    rules.push({
      id: 9,
      text: "In the scenario you ran, change one setting at a time to see what drives service and cash.",
    });
    return rules;
  }

  function pedagogyCallout(ctx) {
    if (ctx.inventoryTurns == null || !isFinite(ctx.inventoryTurns)) {
      return null;
    }
    if (!(ctx.inventoryTurns >= STRONG_TURNS && (ctx.csl < WEAK_CSL || ctx.oosWeeks >= HIGH_OOS))) {
      return null;
    }
    if (ctx.mode === "monte-carlo") {
      return "Median turns look strong while median service is weak. High turns with poor service can still lose customers.";
    }
    return "High inventory turns with weak service is a poor outcome. The stock looks busy because it is often missing when the customer needs it.";
  }

  function commentaryFor(ctx) {
    var matched = matchingRules(ctx);
    return {
      rules: matched,
      lines: matched.slice(0, 3),
      callout: pedagogyCallout(ctx),
    };
  }

  function commentaryFromYear(sku, globals, result) {
    return commentaryFor(contextFromYear(sku, globals, result));
  }

  function commentaryFromMonteCarlo(sku, globals, batch) {
    return commentaryFor(contextFromMonteCarlo(sku, globals, batch));
  }

  function resolveRunSeed(scenario, holdSeed, nextSeed) {
    if (holdSeed && scenario && scenario.seed) {
      return { seed: scenario.seed, holdSeed: false };
    }
    var seed = (Number(nextSeed) >>> 0) || 1;
    return { seed: seed, holdSeed: false };
  }

  function reopenParams(input) {
    var text = String(input == null ? "" : input);
    var hash = text.indexOf("#");
    if (hash !== -1) {
      text = text.slice(0, hash);
    }
    var query = text.indexOf("?");
    if (query !== -1) {
      text = text.slice(query + 1);
    }
    if (text.charAt(0) === "?") {
      text = text.slice(1);
    }
    return new URLSearchParams(text);
  }

  function encodeReopenSearch(mode, run) {
    var code = mode === "monte-carlo" || mode === "mc" ? "mc" : "year";
    var query = "m=" + code;
    if (run) {
      query += "&run=1";
    }
    return "?" + query;
  }

  function decodeReopenSearch(input) {
    var params = reopenParams(input);
    var mode = params.get("m") === "mc" ? "monte-carlo" : "year";
    return {
      specified: params.has("m") || params.has("run"),
      mode: mode,
      run: params.get("run") === "1",
    };
  }

  function namedLevel(value) {
    if (value === "small") {
      return "Small";
    }
    if (value === "medium") {
      return "Medium";
    }
    if (value === "large") {
      return "Large";
    }
    return "Off";
  }

  function skuSettingRows(sku) {
    var lot = sku.lotMode === "weeks" ? sku.lotWeeks + " weeks of cover" : sku.lotQty + " units";
    var safety;
    if (sku.ssMode === "formula") {
      safety = "Formula, service level " + sku.serviceLevel + "%";
    } else if (sku.ssMode === "weeks") {
      safety = sku.ssWeeks + " weeks of cover";
    } else {
      safety = sku.ssQty + " units";
    }
    return [
      { label: "Weekly forecast", value: String(sku.forecast) },
      { label: "Current stock", value: String(sku.currentStock) },
      { label: "Unit cost", value: String(sku.unitCost) },
      { label: "Selling price", value: String(sku.sellingPrice) },
      { label: "Lead time", value: sku.leadTimeWeeks + " weeks" },
      { label: "Lot size", value: lot },
      { label: "Safety stock", value: safety },
      { label: "Demand variability", value: namedLevel(sku.demandVariability) },
      { label: "Lead-time variability", value: namedLevel(sku.leadTimeVariability) },
    ];
  }

  function pointMetrics(result) {
    return {
      oosWeeks: result.metrics.oosWeeks,
      csl: result.metrics.csl,
      inventoryTurns: result.metrics.inventoryTurns,
      averageWc: result.metrics.averageWc,
      annualGp: result.metrics.annualGp,
      safetyStock: result.safetyStock,
    };
  }

  function bandMetrics(batch) {
    var summary = batch.summary;
    var metrics = {
      oosWeeks: { median: summary.oosWeeks.median, p10: summary.oosWeeks.p10, p90: summary.oosWeeks.p90 },
      csl: { median: summary.csl.median, p10: summary.csl.p10, p90: summary.csl.p90 },
      inventoryTurns: {
        median: summary.inventoryTurns.median,
        p10: summary.inventoryTurns.p10,
        p90: summary.inventoryTurns.p90,
      },
      averageWc: { median: summary.averageWc.median, p10: summary.averageWc.p10, p90: summary.averageWc.p90 },
      annualGp: { median: summary.annualGp.median },
      safetyStock: batch.runs.length ? batch.runs[0].safetyStock : 0,
    };
    if (summary.inventoryTurns.observations < summary.runs) {
      metrics.turnsNote = "Years with no on-hand stock are left out of the turns band only.";
    }
    return metrics;
  }

  function resultsSummary(scenario, mode, rows) {
    var monte = mode === "monte-carlo" || mode === "mc";
    var lines = [];
    var averageWc = 0;
    var annualGp = 0;
    var skus = (rows || []).map(function (row) {
      var texts = row.commentary && row.commentary.lines ? row.commentary.lines : [];
      texts.forEach(function (line) {
        var text = typeof line === "string" ? line : line.text;
        if (text && lines.indexOf(text) === -1 && lines.length < 3) {
          lines.push(text);
        }
      });
      var metrics = monte ? bandMetrics(row.monteCarlo) : pointMetrics(row.result);
      averageWc += monte ? metrics.averageWc.median : metrics.averageWc;
      annualGp += monte ? metrics.annualGp.median : metrics.annualGp;
      return {
        label: row.sku.label,
        settings: skuSettingRows(row.sku),
        metrics: metrics,
      };
    });
    if (!lines.length) {
      lines.push("In the scenario you ran, change one setting at a time to see what drives service and cash.");
    }
    return {
      kind: "own-data",
      mode: monte ? "monte-carlo" : "year",
      seed: (Number(scenario.seed) >>> 0) || 1,
      settings: [
        { label: "Delivery variability", value: namedLevel(scenario.deliveryVariability) },
        { label: "Demand shock", value: scenario.shock ? "On" : "Off" },
      ],
      metrics: {
        oosWeeks: null,
        csl: null,
        inventoryTurns: null,
        averageWc: averageWc,
        annualGp: annualGp,
        safetyStock: null,
      },
      commentary: lines,
      skus: skus,
      totals: { averageWc: averageWc, annualGp: annualGp },
      reopenUrl: buildResultsUrl({
        scenario: scenario,
        mode: monte ? "monte-carlo" : "year",
        run: true,
        utm: true,
      }),
    };
  }

  function buildResultsUrl(options) {
    var opts = options || {};
    var origin = String(opts.origin || "https://practicalsupplychainplanning.com").replace(/\/$/, "");
    var path = opts.pathname || "/learn/safety-stock-simulator/own-data/";
    if (path.charAt(0) !== "/") {
      path = "/" + path;
    }
    var query = encodeReopenSearch(opts.mode, Boolean(opts.run)).slice(1);
    if (opts.utm) {
      query += "&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1";
    }
    var encoded = encodeScenario(opts.scenario);
    return origin + path + "?" + query + (encoded.fragment || "");
  }

  function freshSeed() {
    var seed = (Date.now() ^ (Math.floor(Math.random() * 0x100000000))) >>> 0;
    return seed || 1;
  }

  return {
    HORIZON: HORIZON,
    MAX_SKUS: MAX_SKUS,
    MAX_QTY: MAX_QTY,
    MAX_LABEL: MAX_LABEL,
    FRAGMENT_LIMIT: FRAGMENT_LIMIT,
    MC_RUNS: MC_RUNS,
    Z_BY_SERVICE_LEVEL: Z_BY_SERVICE_LEVEL,
    COVER_OPTIONS: COVER_OPTIONS,
    SERVICE_LEVELS: SERVICE_LEVELS,
    LEVELS: LEVELS,
    LT_KNOTS: LT_KNOTS,
    LT_ANCHOR: LT_ANCHOR,
    roundHalfEven: roundHalfEven,
    populationStdev: populationStdev,
    formulaSafetyStock: formulaSafetyStock,
    leadTimeExtraMax: leadTimeExtraMax,
    percentileLinear: percentileLinear,
    spawnSeeds: spawnSeeds,
    formulaReferenceSeed: formulaReferenceSeed,
    defaultSku: defaultSku,
    defaultScenario: defaultScenario,
    parseSkuFields: parseSkuFields,
    validateScenario: validateScenario,
    parseTable: parseTable,
    encodeScenario: encodeScenario,
    decodeScenario: decodeScenario,
    runYear: runYear,
    runMonteCarlo: runMonteCarlo,
    portfolioJobs: portfolioJobs,
    assembleMonteCarlo: assembleMonteCarlo,
    shockStockout: shockStockout,
    commentaryFor: commentaryFor,
    commentaryFromYear: commentaryFromYear,
    commentaryFromMonteCarlo: commentaryFromMonteCarlo,
    resolveRunSeed: resolveRunSeed,
    encodeReopenSearch: encodeReopenSearch,
    decodeReopenSearch: decodeReopenSearch,
    buildResultsUrl: buildResultsUrl,
    resultsSummary: resultsSummary,
    freshSeed: freshSeed,
    CONTRADICTIONS: [
      [1, 2],
      [2, 3],
      [2, 4],
      [2, 7],
      [1, 6],
    ],
  };
});
