/**
 * Client-side 52-week MRP engine for the Learn safety stock simulator.
 * No network calls. Safe to load in the browser or require() from Node.
 *
 * Product behaviour follows PRODUCT_SPEC (approved 2026-09-23).
 *
 * Random stream
 * -------------
 * Each run uses one xoshiro128** generator seeded with splitmix32.
 * Monte Carlo draws 50 child seeds from the parent (a SeedSequence-style
 * spawn). This matches the numpy default_rng / SeedSequence contract:
 * one sequential stream per run, independent streams across the batch.
 * It is deterministic and NOT bit-identical to NumPy.
 *
 * Continuous uniforms are half-open [low, high).
 * Discrete uniforms are inclusive {low … high}.
 * A draw is skipped when the inclusive range has only one value.
 *
 * Rounding is Python 3 / NumPy round-half-to-even.
 *
 * Stream order inside a run
 * -------------------------
 * 1. Demand factors for weeks 1–52 (only when demand variability is on).
 * 2. Shock-week combination (only when shock is on).
 * 3. MRP, week by week. Each release draws delivery-quantity noise for
 *    each lot, then one lead-time delay (only when that variability is on).
 *
 * Replenishment
 * -------------
 * Each week's demand is split evenly across 7 days. The split is exact:
 * seven daily amounts add up to the week's demand, with no remainder.
 * Each day, demand is taken from the opening stock, then receipts due
 * that day are added.
 * An order is placed one day earlier than the day that would finish at
 * or below safety stock (or at or below zero when safety stock is 0).
 * The test looks at the day after tomorrow: that day's opening, minus
 * its base forecast. Receipts already due before that demand count.
 * Simulated demand is not an input to the order. The order arrives
 * tomorrow, after tomorrow's demand, when supply-timing variability is
 * off, so the stock stays on or above the line. The base lead
 * time is not added. It only scales the extra delay, in whole weeks,
 * when that variability is on. Each extra week is 7 days.
 * One nominal lot is ordered, unless that lot would not lift the
 * projected finish above zero — then two lots.
 * A day below zero before the receipt marks its week out of stock.
 * Touching zero does not. The chart draws each day's post-demand stock,
 * and the post-receipt stock as well when a receipt lands.
 *
 * Demand shock (when on) doubles pre-shock normal demand on exactly three
 * weeks in 21–52, successive gaps at least 4, then rounds. The base demand
 * column stays unshocked. The multiplier is 2.
 *
 * Formula safety stock is computed from this run's pre-shock normal demand.
 * Monte Carlo freezes one safety-stock quantity for all 50 runs (the
 * caller passes the single-run value; otherwise a reference stream is used).
 *
 * Average stock, turns, and working capital use the daily points drawn
 * on the chart. A day with no receipt contributes its post-demand stock.
 * A receipt day contributes that point and the stock after the receipt.
 * Each plotted point is floored at zero before the average. A negative
 * point does not reduce that average, so working capital is not negative.
 * Out-of-stock stays a count of weeks: a week counts once if any of its
 * days is below zero before the receipt. Monte Carlo summaries are
 * median and P10–P90, with median only for gross profit (CR3).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SafetyStockEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "pscp.learn.safetyStockSimulator.v2";
  var HORIZON = 52;
  var DAYS_PER_WEEK = 7;
  var DAY_COUNT = HORIZON * DAYS_PER_WEEK;
  var SELL_PRICE = 100;
  var UNIT_COST = 70;
  var UNIT_GP = 30;
  var STRONG_TURNS = 8;
  var WEAK_CSL = 95;
  var HIGH_OOS = 3;
  var SHOCK_MULTIPLIER = 2;

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

  var LT_EXTRA_MAX = {
    2: { small: 1, medium: 1, large: 2 },
    5: { small: 1, medium: 2, large: 3 },
    10: { small: 1, medium: 3, large: 5 },
  };

  var DELIVERY_PCT = { small: 5, medium: 10, large: 15 };

  var WEEKS_COVER_EXTRA = {
    2: { small: 0, medium: 0, large: -1 },
    4: { small: 0, medium: -1, large: -2 },
    6: { small: -1, medium: -2, large: -3 },
    10: { small: -1, medium: -3, large: -4 },
  };

  var COVER_OPTIONS = [2, 4, 6, 10];
  var LEAD_TIMES = [2, 5, 10];
  var SERVICE_LEVELS = [90, 95, 98, 99];
  var LEVELS = ["off", "small", "medium", "large"];

  var VISIBLE_WEEK_COLUMNS = [
    "Week",
    "Base demand",
    "Simulated demand",
    "Beginning SOH",
    "Pre-receipt SOH",
    "Planned supply",
    "Ending SOH",
    "Safety stock",
  ];

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

  function clampInt(value, min, max, fallback) {
    var parsed = Number(value);
    if (!isFinite(parsed)) {
      return fallback;
    }
    var n = roundHalfEven(parsed);
    if (n < min) {
      return min;
    }
    if (n > max) {
      return max;
    }
    return n;
  }

  function oneOf(value, allowed, fallback) {
    var n = typeof value === "number" ? value : Number(value);
    for (var i = 0; i < allowed.length; i += 1) {
      if (allowed[i] === value || allowed[i] === n) {
        return allowed[i];
      }
    }
    return fallback;
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

  function levelWeeks() {
    return repeat(40, HORIZON);
  }

  function seasonalWeeks() {
    var out = [];
    for (var i = 0; i < HORIZON; i += 1) {
      out.push(roundHalfEven(40 + 18 * Math.sin((2 * Math.PI * i) / HORIZON)));
    }
    return out;
  }

  function risingWeeks() {
    var out = [];
    for (var i = 0; i < HORIZON; i += 1) {
      out.push(roundHalfEven(22 + i * 0.7));
    }
    return out;
  }

  function seriesStats(weeks) {
    var min = weeks[0];
    var max = weeks[0];
    var sum = 0;
    for (var i = 0; i < weeks.length; i += 1) {
      if (weeks[i] < min) {
        min = weeks[i];
      }
      if (weeks[i] > max) {
        max = weeks[i];
      }
      sum += weeks[i];
    }
    return {
      min: min,
      max: max,
      average: roundHalfEven(sum / weeks.length),
    };
  }

  function levelSummary(weeks) {
    return "The same forecast every week: " + seriesStats(weeks).average + " units.";
  }

  function seasonalSummary(weeks) {
    var stats = seriesStats(weeks);
    return (
      "Peaks near " +
      stats.max +
      " and dips near " +
      stats.min +
      " a week, averaging " +
      stats.average +
      "."
    );
  }

  function risingSummary(weeks) {
    var stats = seriesStats(weeks);
    return (
      "Starts at " +
      weeks[0] +
      " a week and climbs to about " +
      weeks[weeks.length - 1] +
      ", averaging about " +
      stats.average +
      "."
    );
  }

  var levelDemand = levelWeeks();
  var seasonalDemand = seasonalWeeks();
  var risingDemand = risingWeeks();

  var PATTERNS = [
    {
      id: "level",
      name: "Level",
      summary: levelSummary(levelDemand),
      weeks: levelDemand,
    },
    {
      id: "seasonal",
      name: "Seasonal",
      summary: seasonalSummary(seasonalDemand),
      weeks: seasonalDemand,
    },
    {
      id: "rising",
      name: "Rising",
      summary: risingSummary(risingDemand),
      weeks: risingDemand,
    },
  ];

  var DEFAULT_CONTROLS = {
    patternId: "level",
    lotMode: "fixed",
    lotQty: 40,
    lotWeeks: 4,
    ssMode: "fixed",
    ssQty: 20,
    ssWeeks: 4,
    serviceLevel: 95,
    leadTimeWeeks: 5,
    demandVariability: "off",
    leadTimeVariability: "off",
    deliveryVariability: "off",
    shock: false,
  };

  function findPattern(patternId) {
    for (var i = 0; i < PATTERNS.length; i += 1) {
      if (PATTERNS[i].id === patternId) {
        return PATTERNS[i];
      }
    }
    return PATTERNS[0];
  }

  function normalizeControls(input) {
    var source = input || {};
    var controls = {
      patternId: findPattern(source.patternId).id,
      lotMode: source.lotMode === "weeks" ? "weeks" : "fixed",
      lotQty: clampInt(source.lotQty, 1, 1000, DEFAULT_CONTROLS.lotQty),
      lotWeeks: oneOf(source.lotWeeks, COVER_OPTIONS, DEFAULT_CONTROLS.lotWeeks),
      ssMode:
        source.ssMode === "formula" || source.ssMode === "weeks"
          ? source.ssMode
          : "fixed",
      ssQty: clampInt(source.ssQty, 0, 1000, DEFAULT_CONTROLS.ssQty),
      ssWeeks: oneOf(source.ssWeeks, COVER_OPTIONS, DEFAULT_CONTROLS.ssWeeks),
      serviceLevel: oneOf(
        source.serviceLevel,
        SERVICE_LEVELS,
        DEFAULT_CONTROLS.serviceLevel
      ),
      leadTimeWeeks: oneOf(
        source.leadTimeWeeks,
        LEAD_TIMES,
        DEFAULT_CONTROLS.leadTimeWeeks
      ),
      demandVariability: oneOf(source.demandVariability, LEVELS, "off"),
      leadTimeVariability: oneOf(source.leadTimeVariability, LEVELS, "off"),
      deliveryVariability: oneOf(source.deliveryVariability, LEVELS, "off"),
      shock: Boolean(source.shock),
    };
    if (Array.isArray(source.baseDemand) && source.baseDemand.length === HORIZON) {
      controls.baseDemand = source.baseDemand.map(function (value) {
        return roundHalfEven(Number(value));
      });
    }
    return controls;
  }

  function baseDemandFor(controls) {
    var normalized = controls.patternId ? controls : normalizeControls(controls);
    if (normalized.baseDemand && normalized.baseDemand.length === HORIZON) {
      return normalized.baseDemand.slice();
    }
    return findPattern(normalized.patternId).weeks.slice();
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

  function nominalLotQty(controls, base) {
    if (controls.lotMode === "weeks") {
      return sumFirst(base, controls.lotWeeks);
    }
    return controls.lotQty;
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

  function leadTimeExtraMax(leadTimeWeeks, level) {
    if (level === "off" || !LT_EXTRA_MAX[leadTimeWeeks]) {
      return 0;
    }
    return LT_EXTRA_MAX[leadTimeWeeks][level] || 0;
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

  function allowedLotReceipts(controls, base) {
    var nominal = nominalLotQty(controls, base);
    if (controls.deliveryVariability === "off") {
      return [nominal];
    }
    var out = [];
    if (controls.lotMode === "weeks") {
      var extra = WEEKS_COVER_EXTRA[controls.lotWeeks][controls.deliveryVariability];
      var maxReduce = Math.abs(extra);
      for (var reduction = 0; reduction <= maxReduce; reduction += 1) {
        out.push(sumFirst(base, controls.lotWeeks - reduction));
      }
      return out;
    }
    var maxShort = roundHalfEven((nominal * DELIVERY_PCT[controls.deliveryVariability]) / 100);
    for (var shortfall = 0; shortfall <= maxShort; shortfall += 1) {
      out.push(nominal - shortfall);
    }
    return out;
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

  // Points drawn for one week. No receipt: the pre-receipt stock only.
  // A receipt: that point, then the close after the receipt. A missing
  // pre-receipt falls back to the close so a one-point week still averages.
  function plottedSohPoints(weeks) {
    if (!weeks || !weeks.length) {
      return [];
    }
    var points = [];
    for (var i = 0; i < weeks.length; i += 1) {
      var week = weeks[i] || {};
      var pre = week.preReceiptSoh;
      if (pre == null || pre === "") {
        pre = week.endingSoh;
      }
      points.push(Number(pre));
      if (Number(week.plannedSupply) > 0) {
        points.push(Number(week.endingSoh));
      }
    }
    return points;
  }

  // Mean of the plotted stock points after flooring each point at zero.
  // The chart label, turns, and working capital all use this mean.
  function meanPlottedSoh(weeks) {
    var points = plottedSohPoints(weeks);
    if (!points.length) {
      return null;
    }
    var sum = 0;
    for (var i = 0; i < points.length; i += 1) {
      if (!isFinite(points[i])) {
        return null;
      }
      sum += points[i] > 0 ? points[i] : 0;
    }
    return sum / points.length;
  }

  function seriesPreReceipt(row) {
    var pre = row.preReceiptSoh;
    if (pre == null || pre === "") {
      pre = row.endingSoh;
    }
    return pre;
  }

  // Daily rows share a week number. A shorter series counts each row as
  // its own week, which is what the hand-built metric checks use.
  function oosWeekCount(series) {
    var daily = series.length > HORIZON && series[0] && series[0].demandSevenths != null;
    if (!daily) {
      var count = 0;
      for (var i = 0; i < series.length; i += 1) {
        if (seriesPreReceipt(series[i]) < 0) {
          count += 1;
        }
      }
      return { oosWeeks: count, weeks: series.length || HORIZON };
    }
    var seen = {};
    var bad = {};
    for (var d = 0; d < series.length; d += 1) {
      var weekNo = series[d].week;
      seen[weekNo] = true;
      if (seriesPreReceipt(series[d]) < 0) {
        bad[weekNo] = true;
      }
    }
    var weeks = 0;
    var oosWeeks = 0;
    for (var key in seen) {
      if (Object.prototype.hasOwnProperty.call(seen, key)) {
        weeks += 1;
      }
    }
    for (var badKey in bad) {
      if (Object.prototype.hasOwnProperty.call(bad, badKey)) {
        oosWeeks += 1;
      }
    }
    return { oosWeeks: oosWeeks, weeks: weeks || HORIZON };
  }

  function annualDemandOf(series) {
    if (series.length > HORIZON && series[0] && series[0].demandSevenths != null) {
      var sevenths = 0;
      for (var i = 0; i < series.length; i += 1) {
        sevenths += series[i].demandSevenths;
      }
      return sevenths / DAYS_PER_WEEK;
    }
    var annualDemand = 0;
    for (var w = 0; w < series.length; w += 1) {
      annualDemand += series[w].simulatedDemand;
    }
    return annualDemand;
  }

  function computeMetrics(series) {
    var rows = series || [];
    var counted = oosWeekCount(rows);
    var annualDemand = rows.length ? annualDemandOf(rows) : 0;
    var n = counted.weeks;
    var avgSohTurns = meanPlottedSoh(rows);
    if (avgSohTurns == null) {
      avgSohTurns = 0;
    }
    var inventoryTurns = avgSohTurns === 0 ? null : annualDemand / avgSohTurns;
    return {
      oosWeeks: counted.oosWeeks,
      csl: ((n - counted.oosWeeks) / n) * 100,
      annualDemand: annualDemand,
      avgSohTurns: avgSohTurns,
      inventoryTurns: inventoryTurns,
      averageWc: avgSohTurns * UNIT_COST,
      annualGp: annualDemand * UNIT_GP,
    };
  }

  function needsPedagogyCallout(metrics) {
    if (!metrics || metrics.inventoryTurns == null || !isFinite(metrics.inventoryTurns)) {
      return false;
    }
    var strong = metrics.inventoryTurns >= STRONG_TURNS;
    var weak = metrics.csl < WEAK_CSL || metrics.oosWeeks >= HIGH_OOS;
    return strong && weak;
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

  function runYear(controlsInput, seed, options) {
    var controls = normalizeControls(controlsInput);
    var opts = options || {};
    var gen = createGenerator(seed >>> 0);
    var base = baseDemandFor(controls);
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
    var startingSoh = roundHalfEven(base[0] + nominalLot);
    var due = repeat(0, DAY_COUNT);
    var days = [];
    var weeks = [];
    var releases = [];
    var open7 = startingSoh * DAYS_PER_WEEK;
    var threshold7 = (safetyStock > 0 ? safetyStock : 0) * DAYS_PER_WEEK;
    var lot7 = nominalLot * DAYS_PER_WEEK;

    for (var t = 0; t < DAY_COUNT; t += 1) {
      var weekIndex = Math.floor(t / DAYS_PER_WEEK);
      var weekNo = weekIndex + 1;
      var base7 = base[weekIndex];
      var sim7 = demand.simulatedDemand[weekIndex];
      var existing7 = due[t];

      if (t + 1 < DAY_COUNT) {
        var nextBase7 = base[Math.floor((t + 1) / DAYS_PER_WEEK)];
        var projected7;
        if (t + 2 < DAY_COUNT) {
          var dayAfterBase7 = base[Math.floor((t + 2) / DAYS_PER_WEEK)];
          projected7 = open7 - base7 + existing7 - nextBase7 + due[t + 1] - dayAfterBase7;
        } else {
          projected7 = open7 - base7 + existing7 - nextBase7;
        }
        if (projected7 <= threshold7) {
          var lots = projected7 + lot7 > 0 ? 1 : 2;
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
          var arrivalIndex = t + 1 + delay * DAYS_PER_WEEK;
          if (arrivalIndex < DAY_COUNT) {
            due[arrivalIndex] += received * DAYS_PER_WEEK;
          }
          releases.push({
            requirementDay: t + 1,
            requirementWeek: weekNo,
            lots: lots,
            nominalLot: nominalLot,
            lotReceipts: lotReceipts,
            received: received,
            delay: delay,
            arrivalDay: arrivalIndex + 1,
            arrivalWeek: Math.floor(arrivalIndex / DAYS_PER_WEEK) + 1,
          });
        }
      }

      var pre7 = open7 - sim7;
      var end7 = pre7 + existing7;
      var pre = pre7 / DAYS_PER_WEEK;
      var end = end7 / DAYS_PER_WEEK;
      var supply = existing7 / DAYS_PER_WEEK;
      if (t % DAYS_PER_WEEK === 0) {
        weeks.push({
          week: weekNo,
          baseDemand: base[weekIndex],
          simulatedDemand: demand.simulatedDemand[weekIndex],
          beginningSoh: open7 / DAYS_PER_WEEK,
          plannedSupply: 0,
          preReceiptSoh: pre,
          endingSoh: end,
          safetyStock: safetyStock,
        });
      }
      var weekRow = weeks[weekIndex];
      if (pre < weekRow.preReceiptSoh) {
        weekRow.preReceiptSoh = pre;
      }
      weekRow.plannedSupply += supply;
      weekRow.endingSoh = end;
      days.push({
        day: t + 1,
        week: weekNo,
        baseDemand: base7 / DAYS_PER_WEEK,
        simulatedDemand: sim7 / DAYS_PER_WEEK,
        demandSevenths: sim7,
        beginningSoh: open7 / DAYS_PER_WEEK,
        plannedSupply: supply,
        preReceiptSoh: pre,
        endingSoh: end,
        safetyStock: safetyStock,
      });
      open7 = end7;
    }

    var sigma = populationStdev(demand.normalDemand);
    return {
      controls: controls,
      seed: seed >>> 0,
      baseDemand: base,
      normalDemand: demand.normalDemand,
      demandFactors: demand.demandFactors,
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
      days: days,
      weeks: weeks,
      releases: releases,
      metrics: computeMetrics(days),
    };
  }

  var REOPEN_QUERY_KEYS = [
    "m",
    "s",
    "p",
    "lm",
    "lq",
    "lw",
    "sm",
    "sq",
    "sw",
    "sl",
    "lt",
    "dv",
    "lv",
    "qv",
    "sh",
    "run",
  ];

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

  function encodeReopenQuery(controls, seed, mode, run) {
    var normalized = normalizeControls(controls);
    var modeCode = mode === "monte-carlo" || mode === "mc" ? "mc" : "year";
    var seedNum = (Number(seed) >>> 0) || 1;
    var parts = [
      ["m", modeCode],
      ["s", String(seedNum)],
      ["p", normalized.patternId],
      ["lm", normalized.lotMode],
      ["lq", String(normalized.lotQty)],
      ["lw", String(normalized.lotWeeks)],
      ["sm", normalized.ssMode],
      ["sq", String(normalized.ssQty)],
      ["sw", String(normalized.ssWeeks)],
      ["sl", String(normalized.serviceLevel)],
      ["lt", String(normalized.leadTimeWeeks)],
      ["dv", normalized.demandVariability],
      ["lv", normalized.leadTimeVariability],
      ["qv", normalized.deliveryVariability],
      ["sh", normalized.shock ? "1" : "0"],
    ];
    if (run) {
      parts.push(["run", "1"]);
    }
    return parts
      .map(function (pair) {
        return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
      })
      .join("&");
  }

  function decodeReopenQuery(input) {
    var params = reopenParams(input);
    var present = false;
    for (var i = 0; i < REOPEN_QUERY_KEYS.length; i += 1) {
      if (params.has(REOPEN_QUERY_KEYS[i])) {
        present = true;
        break;
      }
    }
    var seed = 20260923;
    if (params.has("s") && params.get("s") !== "") {
      var parsed = Number(params.get("s"));
      seed = (isFinite(parsed) ? parsed : 1) >>> 0 || 1;
    }
    function given(key) {
      if (!params.has(key) || params.get(key) === "") {
        return undefined;
      }
      return params.get(key);
    }
    var fields = {
      patternId: DEFAULT_CONTROLS.patternId,
      lotMode: DEFAULT_CONTROLS.lotMode,
      lotQty: DEFAULT_CONTROLS.lotQty,
      lotWeeks: DEFAULT_CONTROLS.lotWeeks,
      ssMode: DEFAULT_CONTROLS.ssMode,
      ssQty: DEFAULT_CONTROLS.ssQty,
      ssWeeks: DEFAULT_CONTROLS.ssWeeks,
      serviceLevel: DEFAULT_CONTROLS.serviceLevel,
      leadTimeWeeks: DEFAULT_CONTROLS.leadTimeWeeks,
      demandVariability: DEFAULT_CONTROLS.demandVariability,
      leadTimeVariability: DEFAULT_CONTROLS.leadTimeVariability,
      deliveryVariability: DEFAULT_CONTROLS.deliveryVariability,
      shock: false,
    };
    if (given("p") !== undefined) {
      fields.patternId = given("p");
    }
    if (given("lm") !== undefined) {
      fields.lotMode = given("lm");
    }
    if (given("lq") !== undefined) {
      fields.lotQty = given("lq");
    }
    if (given("lw") !== undefined) {
      fields.lotWeeks = given("lw");
    }
    if (given("sm") !== undefined) {
      fields.ssMode = given("sm");
    }
    if (given("sq") !== undefined) {
      fields.ssQty = given("sq");
    }
    if (given("sw") !== undefined) {
      fields.ssWeeks = given("sw");
    }
    if (given("sl") !== undefined) {
      fields.serviceLevel = given("sl");
    }
    if (given("lt") !== undefined) {
      fields.leadTimeWeeks = given("lt");
    }
    if (given("dv") !== undefined) {
      fields.demandVariability = given("dv");
    }
    if (given("lv") !== undefined) {
      fields.leadTimeVariability = given("lv");
    }
    if (given("qv") !== undefined) {
      fields.deliveryVariability = given("qv");
    }
    if (params.has("sh")) {
      fields.shock = params.get("sh") === "1";
    }
    return {
      present: present,
      run: params.get("run") === "1",
      mode: params.get("m") === "mc" ? "monte-carlo" : "year",
      seed: seed,
      controls: normalizeControls(fields),
    };
  }

  function runMonteCarlo(controlsInput, parentSeed, options) {
    var controls = normalizeControls(controlsInput);
    var opts = options || {};
    var count = opts.runs || 50;
    var parent = parentSeed >>> 0;
    var frozen = opts.frozenSafetyStock;
    if (
      controls.ssMode === "formula" &&
      (frozen === undefined || frozen === null)
    ) {
      frozen = runYear(controls, formulaReferenceSeed(parent), {}).safetyStock;
    }
    var seeds = spawnSeeds(parent, count);
    var runs = [];
    for (var i = 0; i < count; i += 1) {
      var runOptions = {};
      if (frozen !== undefined && frozen !== null && controls.ssMode === "formula") {
        runOptions.frozenSafetyStock = frozen;
      }
      var result = runYear(controls, seeds[i], runOptions);
      result.runIndex = i + 1;
      result.seed = seeds[i];
      runs.push(result);
    }
    return {
      parentSeed: parent,
      seeds: seeds,
      frozenSafetyStock:
        controls.ssMode === "formula" && frozen !== undefined && frozen !== null
          ? roundHalfEven(Number(frozen))
          : null,
      runs: runs,
      summary: summariseMonteCarlo(runs),
    };
  }

  var RESULTS_ORIGIN = "https://practicalsupplychainplanning.com";
  var RESULTS_UTM = "utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1";

  function levelLabel(value) {
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

  function settingsRows(controls) {
    var normalized = normalizeControls(controls);
    var lot =
      normalized.lotMode === "weeks"
        ? normalized.lotWeeks + " weeks of cover"
        : normalized.lotQty + " units";
    var safety;
    if (normalized.ssMode === "formula") {
      safety = "Formula, service level " + normalized.serviceLevel + "%";
    } else if (normalized.ssMode === "weeks") {
      safety = normalized.ssWeeks + " weeks of cover";
    } else {
      safety = normalized.ssQty + " units";
    }
    return [
      { label: "Demand pattern", value: findPattern(normalized.patternId).name },
      { label: "Lot size", value: lot },
      { label: "Safety stock", value: safety },
      { label: "Lead time", value: normalized.leadTimeWeeks + " weeks" },
      { label: "Demand variability", value: levelLabel(normalized.demandVariability) },
      { label: "Lead-time variability", value: levelLabel(normalized.leadTimeVariability) },
      { label: "Delivery variability", value: levelLabel(normalized.deliveryVariability) },
      { label: "Demand shock", value: normalized.shock ? "On" : "Off" },
    ];
  }

  function shockHit(result) {
    if (!result || !result.shockWeeks || !result.shockWeeks.length || !result.weeks) {
      return false;
    }
    var earliest = result.shockWeeks[0];
    for (var i = 1; i < result.shockWeeks.length; i += 1) {
      if (result.shockWeeks[i] < earliest) {
        earliest = result.shockWeeks[i];
      }
    }
    for (var w = 0; w < result.weeks.length; w += 1) {
      var position = result.weeks[w].preReceiptSoh;
      if (position == null || position === "") {
        position = result.weeks[w].endingSoh;
      }
      if (position < 0 && result.weeks[w].week >= earliest) {
        return true;
      }
    }
    return false;
  }

  function commentaryLines(ctx) {
    var rules = [];
    var turns = ctx.inventoryTurns;
    var oos = ctx.oosWeeks;
    if (turns != null && isFinite(turns) && turns >= STRONG_TURNS && (ctx.csl < WEAK_CSL || oos >= HIGH_OOS)) {
      rules.push("In the scenario you ran, high turns came with weak service: the stock looks busy because it is often missing.");
    }
    if (oos === 0 && ctx.safetyStock > 0) {
      rules.push("In the scenario you ran, there were no stockouts. Try a lower safety stock to see where service starts to drop.");
    }
    if ((ctx.leadTimeVariability !== "off" || ctx.deliveryVariability !== "off") && oos > 0) {
      rules.push(
        ctx.safetyStock > 0
          ? "In the scenario you ran, late or short deliveries showed up as stockouts even with safety stock in place."
          : "In the scenario you ran, late or short deliveries showed up as stockouts."
      );
    }
    if (ctx.shock && ctx.shockStockout) {
      rules.push("In the scenario you ran, the doubled-demand weeks used up the buffer. Shocks are hard to plan for.");
    }
    if (ctx.ssMode === "formula" && (ctx.leadTimeVariability !== "off" || ctx.deliveryVariability !== "off" || ctx.shock)) {
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
      rules.push(
        "In the scenario you ran, safety stock used the textbook formula. That formula assumes a fixed lead time and random demand only, so it does not cover " +
          switched.join(" or ") +
          "."
      );
    }
    if (ctx.lotMode === "weeks" && ctx.lotWeeks >= 6 && turns != null && isFinite(turns) && turns < 6) {
      rules.push("In the scenario you ran, big lots raise average stock and working capital, which lowers turns.");
    }
    if (ctx.mode === "monte-carlo" && ctx.oosSpread != null && ctx.oosSpread >= 4) {
      rules.push("In the scenario you ran, the results vary a lot from year to year under the same settings.");
    }
    rules.push("In the scenario you ran, change one setting at a time to see what drives service and cash.");
    return rules.slice(0, 3);
  }

  function yearContext(controls, result) {
    return {
      mode: "year",
      demandVariability: controls.demandVariability,
      leadTimeVariability: controls.leadTimeVariability,
      deliveryVariability: controls.deliveryVariability,
      shock: Boolean(controls.shock),
      lotMode: controls.lotMode,
      lotWeeks: controls.lotWeeks,
      ssMode: controls.ssMode,
      oosWeeks: result.metrics.oosWeeks,
      csl: result.metrics.csl,
      inventoryTurns: result.metrics.inventoryTurns,
      averageWc: result.metrics.averageWc,
      annualGp: result.metrics.annualGp,
      safetyStock: result.safetyStock,
      oosSpread: null,
      shockStockout: shockHit(result),
    };
  }

  function monteCarloContext(controls, batch) {
    var summary = batch.summary;
    var hits = 0;
    for (var i = 0; i < batch.runs.length; i += 1) {
      if (shockHit(batch.runs[i])) {
        hits += 1;
      }
    }
    var spread = null;
    if (summary.oosWeeks && summary.oosWeeks.p90 != null && summary.oosWeeks.p10 != null) {
      spread = summary.oosWeeks.p90 - summary.oosWeeks.p10;
    }
    return {
      mode: "monte-carlo",
      demandVariability: controls.demandVariability,
      leadTimeVariability: controls.leadTimeVariability,
      deliveryVariability: controls.deliveryVariability,
      shock: Boolean(controls.shock),
      lotMode: controls.lotMode,
      lotWeeks: controls.lotWeeks,
      ssMode: controls.ssMode,
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

  function buildResultsUrl(controls, seed, mode) {
    return (
      RESULTS_ORIGIN +
      "/learn/safety-stock-simulator/?" +
      encodeReopenQuery(controls, seed, mode, true) +
      "&" +
      RESULTS_UTM
    );
  }

  function bandFields(band) {
    return { median: band.median, p10: band.p10, p90: band.p90 };
  }

  function resultsSummary(controls, seed, mode, yearResult, monteCarlo) {
    var normalized = normalizeControls(controls);
    var monte = mode === "monte-carlo" || mode === "mc";
    var metrics;
    var lines;
    if (monte) {
      var summary = monteCarlo.summary;
      metrics = {
        oosWeeks: bandFields(summary.oosWeeks),
        csl: bandFields(summary.csl),
        inventoryTurns: bandFields(summary.inventoryTurns),
        averageWc: bandFields(summary.averageWc),
        annualGp: { median: summary.annualGp.median },
        safetyStock: monteCarlo.runs[0].safetyStock,
      };
      if (summary.inventoryTurns.observations < summary.runs) {
        metrics.turnsNote = "Years with no on-hand stock are left out of the turns band only.";
      }
      lines = commentaryLines(monteCarloContext(normalized, monteCarlo));
    } else {
      metrics = {
        oosWeeks: yearResult.metrics.oosWeeks,
        csl: yearResult.metrics.csl,
        inventoryTurns: yearResult.metrics.inventoryTurns,
        averageWc: yearResult.metrics.averageWc,
        annualGp: yearResult.metrics.annualGp,
        safetyStock: yearResult.safetyStock,
      };
      lines = commentaryLines(yearContext(normalized, yearResult));
    }
    return {
      kind: "teaching",
      mode: monte ? "monte-carlo" : "year",
      seed: (Number(seed) >>> 0) || 1,
      settings: settingsRows(normalized),
      metrics: metrics,
      commentary: lines,
      reopenUrl: buildResultsUrl(normalized, seed, monte ? "monte-carlo" : "year"),
    };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    HORIZON: HORIZON,
    DAYS_PER_WEEK: DAYS_PER_WEEK,
    DAY_COUNT: DAY_COUNT,
    PRICES: { sell: SELL_PRICE, cost: UNIT_COST, gp: UNIT_GP },
    STRONG_TURNS: STRONG_TURNS,
    WEAK_CSL: WEAK_CSL,
    HIGH_OOS: HIGH_OOS,
    Z_BY_SERVICE_LEVEL: Z_BY_SERVICE_LEVEL,
    DEMAND_FACTORS: DEMAND_FACTORS,
    LT_EXTRA_MAX: LT_EXTRA_MAX,
    DELIVERY_PCT: DELIVERY_PCT,
    WEEKS_COVER_EXTRA: WEEKS_COVER_EXTRA,
    COVER_OPTIONS: COVER_OPTIONS,
    LEAD_TIMES: LEAD_TIMES,
    SERVICE_LEVELS: SERVICE_LEVELS,
    PATTERNS: PATTERNS,
    DEFAULT_CONTROLS: DEFAULT_CONTROLS,
    VISIBLE_WEEK_COLUMNS: VISIBLE_WEEK_COLUMNS,
    roundHalfEven: roundHalfEven,
    populationStdev: populationStdev,
    percentileLinear: percentileLinear,
    createGenerator: createGenerator,
    spawnSeeds: spawnSeeds,
    formulaReferenceSeed: formulaReferenceSeed,
    normalizeControls: normalizeControls,
    baseDemandFor: baseDemandFor,
    nominalLotQty: nominalLotQty,
    formulaSafetyStock: formulaSafetyStock,
    leadTimeExtraMax: leadTimeExtraMax,
    allowedLotReceipts: allowedLotReceipts,
    sampleShockWeeks: sampleShockWeeks,
    plottedSohPoints: plottedSohPoints,
    meanPlottedSoh: meanPlottedSoh,
    computeMetrics: computeMetrics,
    needsPedagogyCallout: needsPedagogyCallout,
    summariseMonteCarlo: summariseMonteCarlo,
    runYear: runYear,
    runMonteCarlo: runMonteCarlo,
    encodeReopenQuery: encodeReopenQuery,
    decodeReopenQuery: decodeReopenQuery,
    buildResultsUrl: buildResultsUrl,
    resultsSummary: resultsSummary,
    commentaryLines: commentaryLines,
  };
});
