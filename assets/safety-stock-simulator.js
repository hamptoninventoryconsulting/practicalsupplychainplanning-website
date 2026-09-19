/**
 * Learn page controller for the safety stock simulator.
 * Loads versioned scenario JSON, runs the engine in-browser, and keeps
 * visit state in sessionStorage only.
 */
(function () {
  "use strict";

  var SCENARIOS_URL = "/learn/safety-stock-simulator/scenarios.json";
  var engine = window.SafetyStockEngine;
  if (!engine) {
    return;
  }

  var dataset = null;
  var sample = null;
  var state = {
    scenarioId: "demand-risk-only",
    safetyStock: 40,
    seed: null,
    comparison: null,
    sensitivity: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits);
  }

  function readSession() {
    try {
      var raw = window.sessionStorage.getItem(engine.STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function writeSession() {
    try {
      window.sessionStorage.setItem(
        engine.STORAGE_KEY,
        JSON.stringify({
          scenarioId: state.scenarioId,
          safetyStock: state.safetyStock,
          seed: state.seed,
          comparison: state.comparison,
          sensitivity: state.sensitivity,
        })
      );
    } catch (err) {
      // Private mode or disabled storage should not break the simulator.
    }
  }

  function restoreSession() {
    var saved = readSession();
    if (!saved) {
      return;
    }
    if (saved.scenarioId && engine.findScenario(dataset, saved.scenarioId)) {
      state.scenarioId = saved.scenarioId;
    }
    if (typeof saved.safetyStock === "number" && !isNaN(saved.safetyStock)) {
      state.safetyStock = clampSafetyStock(saved.safetyStock);
    }
    if (typeof saved.seed === "number") {
      state.seed = saved.seed;
    }
    if (saved.comparison && saved.sensitivity) {
      state.comparison = saved.comparison;
      state.sensitivity = saved.sensitivity;
    }
  }

  function clampSafetyStock(value) {
    var shared = dataset.shared;
    var next = Math.round(Number(value));
    if (isNaN(next)) {
      next = shared.safetyStockDefault;
    }
    next = Math.max(shared.safetyStockMin, Math.min(shared.safetyStockMax, next));
    var step = shared.safetyStockStep || 1;
    return Math.round(next / step) * step;
  }

  function selectedScenario() {
    return engine.findScenario(dataset, state.scenarioId);
  }

  function renderScenarios() {
    var host = $("sim-scenarios");
    host.innerHTML = "";
    dataset.scenarios.forEach(function (scenario) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "sim-scenario";
      button.setAttribute("data-scenario-id", scenario.id);
      button.setAttribute(
        "aria-pressed",
        scenario.id === state.scenarioId ? "true" : "false"
      );
      if (scenario.id === state.scenarioId) {
        button.classList.add("sim-scenario--selected");
      }
      button.innerHTML =
        "<span class=\"sim-scenario__name\"></span>" +
        "<span class=\"sim-scenario__summary\"></span>";
      button.querySelector(".sim-scenario__name").textContent = scenario.name;
      button.querySelector(".sim-scenario__summary").textContent = scenario.summary;
      button.addEventListener("click", function () {
        state.scenarioId = scenario.id;
        renderScenarios();
        renderScenarioDetail();
        renderComparison();
        renderSensitivity();
        writeSession();
      });
      host.appendChild(button);
    });
  }

  function variabilityLabel(cv) {
    if (cv <= 0) {
      return "None (deterministic)";
    }
    return "High (CV " + cv.toFixed(2) + ")";
  }

  function renderScenarioDetail() {
    var scenario = selectedScenario();
    $("sim-teaching").textContent = scenario.teachingPoint;
    $("sim-param-demand").textContent =
      scenario.demandMeanPerDay + " units / day";
    $("sim-param-demand-cv").textContent = variabilityLabel(scenario.demandCv);
    $("sim-param-lead-time").textContent =
      scenario.leadTimeMeanDays + " days";
    $("sim-param-lead-time-cv").textContent = variabilityLabel(scenario.leadTimeCv);
    $("sim-param-expected-ltd").textContent =
      scenario.demandMeanPerDay * scenario.leadTimeMeanDays + " units";
    $("sim-param-rop").textContent =
      scenario.demandMeanPerDay * scenario.leadTimeMeanDays +
      state.safetyStock +
      " units";
  }

  function syncSafetyStockInputs() {
    $("sim-safety-stock").value = String(state.safetyStock);
    $("sim-safety-stock-number").value = String(state.safetyStock);
    $("sim-safety-stock-value").textContent = String(state.safetyStock);
    renderScenarioDetail();
  }

  function metricCell(text, scenarioId) {
    var td = document.createElement("td");
    td.textContent = text;
    if (scenarioId === state.scenarioId) {
      td.className = "sim-table__focus";
    }
    return td;
  }

  function renderComparison() {
    var table = $("sim-results-body");
    table.innerHTML = "";
    if (!state.comparison) {
      $("sim-status").textContent =
        "Run the simulation to compare the three scenarios.";
      $("sim-insight").textContent = "";
      return;
    }

    var rows = [
      {
        label: "Cycle service level",
        value: function (result) {
          return formatPercent(result.cycleServiceLevel);
        },
      },
      {
        label: "Fill rate",
        value: function (result) {
          return formatPercent(result.fillRate);
        },
      },
      {
        label: "Average units short",
        value: function (result) {
          return formatNumber(result.averageUnitsShort, 1);
        },
      },
      {
        label: "Average on-hand before receipt",
        value: function (result) {
          return formatNumber(result.averageOnHandBeforeReceipt, 1);
        },
      },
      {
        label: "Average lead time (days)",
        value: function (result) {
          return formatNumber(result.averageLeadTimeDays, 1);
        },
      },
    ];

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = row.label;
      tr.appendChild(th);
      state.comparison.results.forEach(function (result) {
        tr.appendChild(metricCell(row.value(result), result.scenarioId));
      });
      table.appendChild(tr);
    });

    $("sim-status").textContent =
      state.comparison.trials.toLocaleString() +
      " trials per scenario ran in your browser. The same sampled lead times and demands are reused when you change safety stock. Nothing was saved on a server.";

    var combined = state.comparison.byId["demand-and-supply"];
    var selected = state.comparison.byId[state.scenarioId];
    if (combined && selected) {
      $("sim-insight").textContent =
        "At " +
        state.safetyStock +
        " units of safety stock, " +
        selected.name +
        " reached " +
        formatPercent(selected.cycleServiceLevel) +
        " cycle service. The same buffer reached " +
        formatPercent(combined.cycleServiceLevel) +
        " when demand and supply risk were combined.";
    }
  }

  function renderSensitivity() {
    var table = $("sim-sensitivity-body");
    table.innerHTML = "";
    if (!state.sensitivity) {
      return;
    }
    state.sensitivity.forEach(function (row) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = String(row.safetyStock) + " units";
      tr.appendChild(th);
      dataset.scenarios.forEach(function (scenario) {
        var result = row.byId[scenario.id];
        tr.appendChild(
          metricCell(formatPercent(result.cycleServiceLevel), scenario.id)
        );
      });
      if (row.safetyStock === state.safetyStock) {
        tr.className = "sim-table__current";
      }
      table.appendChild(tr);
    });
  }

  function scoreCurrentSample() {
    if (!sample) {
      return;
    }
    state.comparison = engine.scoreComparison(
      dataset,
      sample,
      state.safetyStock
    );
    var safetyStocks = dataset.shared.sensitivitySafetyStocks.slice();
    if (safetyStocks.indexOf(state.safetyStock) === -1) {
      safetyStocks.push(state.safetyStock);
      safetyStocks.sort(function (a, b) {
        return a - b;
      });
    }
    state.sensitivity = engine.runSensitivity(dataset, sample, safetyStocks);
    writeSession();
    renderComparison();
    renderSensitivity();
  }

  function drawSample(seed) {
    state.seed = seed;
    sample = engine.sampleComparison(dataset, {
      trials: dataset.shared.trials,
      seed: seed,
    });
    scoreCurrentSample();
  }

  function bindControls() {
    var slider = $("sim-safety-stock");
    var number = $("sim-safety-stock-number");
    var shared = dataset.shared;
    [slider, number].forEach(function (input) {
      input.min = String(shared.safetyStockMin);
      input.max = String(shared.safetyStockMax);
      input.step = String(shared.safetyStockStep);
    });

    function onSafetyStockChange(event) {
      state.safetyStock = clampSafetyStock(event.target.value);
      syncSafetyStockInputs();
      if (sample) {
        scoreCurrentSample();
      }
    }

    slider.addEventListener("input", onSafetyStockChange);
    number.addEventListener("change", onSafetyStockChange);
    $("sim-run").addEventListener("click", function () {
      if (sample) {
        scoreCurrentSample();
        return;
      }
      drawSample(Date.now() >>> 0);
    });
    $("sim-new-sample").addEventListener("click", function () {
      drawSample(Date.now() >>> 0);
    });
  }

  function boot() {
    $("sim-error").hidden = true;
    fetch(SCENARIOS_URL, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Could not load scenario data");
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.scenarios || data.scenarios.length !== 3) {
          throw new Error("Scenario file must contain three teaching scenarios");
        }
        dataset = data;
        $("sim-data-version").insertAdjacentText(
          "afterbegin",
          "Scenario data version " + data.version + ". "
        );
        state.safetyStock = data.shared.safetyStockDefault;
        restoreSession();
        bindControls();
        renderScenarios();
        syncSafetyStockInputs();
        if (typeof state.seed === "number") {
          drawSample(state.seed);
        } else {
          drawSample(Date.now() >>> 0);
        }
      })
      .catch(function () {
        $("sim-error").hidden = false;
        $("sim-error").textContent =
          "The scenario file could not be loaded. Serve this site over HTTP so /learn/safety-stock-simulator/scenarios.json is available.";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
