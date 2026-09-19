/**
 * Client-side Monte Carlo engine for the educational safety stock simulator.
 * No network calls. Safe to load in the browser or require() from Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SafetyStockEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "pscp.learn.safetyStockSimulator.v1";

  function createRng(seed) {
    var state = seed >>> 0;
    if (!state) {
      state = 1;
    }
    return function rng() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function hashSeed(base, label) {
    var hash = base >>> 0;
    var text = String(label);
    for (var i = 0; i < text.length; i += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    }
    return hash >>> 0 || 1;
  }

  function randomNormal(rng) {
    var u = rng();
    var v = rng();
    while (u <= 0) {
      u = rng();
    }
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sampleLeadTimeDays(rng, mean, cv) {
    if (cv <= 0) {
      return Math.max(1, Math.round(mean));
    }
    return Math.max(1, Math.round(mean + mean * cv * randomNormal(rng)));
  }

  function sampleDailyDemand(rng, mean, cv) {
    if (cv <= 0) {
      return mean;
    }
    return Math.max(0, mean + mean * cv * randomNormal(rng));
  }

  function findScenario(dataset, scenarioId) {
    var scenarios = dataset.scenarios || [];
    for (var i = 0; i < scenarios.length; i += 1) {
      if (scenarios[i].id === scenarioId) {
        return scenarios[i];
      }
    }
    return null;
  }

  function simulateExposures(scenario, options) {
    var rng = createRng(options.seed);
    var demandMean = scenario.demandMeanPerDay;
    var demandCv = scenario.demandCv;
    var leadTimeMean = scenario.leadTimeMeanDays;
    var leadTimeCv = scenario.leadTimeCv;
    var exposures = [];

    for (var trial = 0; trial < options.trials; trial += 1) {
      var leadTime = sampleLeadTimeDays(rng, leadTimeMean, leadTimeCv);
      var leadTimeDemand = 0;
      for (var day = 0; day < leadTime; day += 1) {
        leadTimeDemand += sampleDailyDemand(rng, demandMean, demandCv);
      }
      exposures.push({
        leadTimeDays: leadTime,
        leadTimeDemand: leadTimeDemand,
      });
    }

    return exposures;
  }

  function evaluateExposures(scenario, exposures, safetyStock) {
    var expectedLtd = scenario.demandMeanPerDay * scenario.leadTimeMeanDays;
    var reorderPoint = expectedLtd + safetyStock;
    var trials = exposures.length;
    var stockoutTrials = 0;
    var totalDemand = 0;
    var totalShort = 0;
    var totalOnHand = 0;
    var totalLeadTime = 0;

    for (var i = 0; i < trials; i += 1) {
      var exposure = exposures[i];
      var unitsShort = Math.max(0, exposure.leadTimeDemand - reorderPoint);
      if (unitsShort > 0) {
        stockoutTrials += 1;
      }
      totalDemand += exposure.leadTimeDemand;
      totalShort += unitsShort;
      totalOnHand += Math.max(0, reorderPoint - exposure.leadTimeDemand);
      totalLeadTime += exposure.leadTimeDays;
    }

    return {
      scenarioId: scenario.id,
      name: scenario.name,
      trials: trials,
      safetyStock: safetyStock,
      expectedLeadTimeDemand: expectedLtd,
      reorderPoint: reorderPoint,
      cycleServiceLevel: trials ? 1 - stockoutTrials / trials : 1,
      fillRate: totalDemand > 0 ? 1 - totalShort / totalDemand : 1,
      averageUnitsShort: trials ? totalShort / trials : 0,
      averageOnHandBeforeReceipt: trials ? totalOnHand / trials : 0,
      averageLeadTimeDays: trials ? totalLeadTime / trials : 0,
    };
  }

  function runScenario(scenario, options) {
    var exposures = simulateExposures(scenario, {
      trials: options.trials,
      seed: options.seed,
    });
    return evaluateExposures(scenario, exposures, options.safetyStock);
  }

  function sampleComparison(dataset, options) {
    var scenarios = dataset.scenarios || [];
    var exposuresById = {};
    for (var i = 0; i < scenarios.length; i += 1) {
      var scenario = scenarios[i];
      exposuresById[scenario.id] = simulateExposures(scenario, {
        trials: options.trials,
        seed: hashSeed(options.seed, scenario.id),
      });
    }
    return {
      seed: options.seed,
      trials: options.trials,
      exposuresById: exposuresById,
    };
  }

  function scoreComparison(dataset, sample, safetyStock) {
    var scenarios = dataset.scenarios || [];
    var results = [];
    var byId = {};
    for (var i = 0; i < scenarios.length; i += 1) {
      var scenario = scenarios[i];
      var result = evaluateExposures(
        scenario,
        sample.exposuresById[scenario.id],
        safetyStock
      );
      results.push(result);
      byId[scenario.id] = result;
    }
    return {
      seed: sample.seed,
      trials: sample.trials,
      safetyStock: safetyStock,
      results: results,
      byId: byId,
    };
  }

  function runComparison(dataset, options) {
    var sample = sampleComparison(dataset, options);
    var scored = scoreComparison(dataset, sample, options.safetyStock);
    scored.exposuresById = sample.exposuresById;
    return scored;
  }

  function runSensitivity(dataset, sample, safetyStocks) {
    var rows = [];
    for (var i = 0; i < safetyStocks.length; i += 1) {
      rows.push(scoreComparison(dataset, sample, safetyStocks[i]));
    }
    return rows;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    createRng: createRng,
    hashSeed: hashSeed,
    findScenario: findScenario,
    simulateExposures: simulateExposures,
    evaluateExposures: evaluateExposures,
    runScenario: runScenario,
    sampleComparison: sampleComparison,
    scoreComparison: scoreComparison,
    runComparison: runComparison,
    runSensitivity: runSensitivity,
  };
});
