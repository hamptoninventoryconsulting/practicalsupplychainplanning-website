/**
 * Learn page controller for the 52-week safety stock simulator.
 * Visit state is kept in sessionStorage only.
 */
(function () {
  "use strict";

  var engine = window.SafetyStockEngine;
  var state = {
    controls: null,
    seed: 20260923,
    explanations: false,
    mode: "year",
    result: null,
    monteCarlo: null,
    yearStatus: "empty",
    mcStatus: "empty",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function fail(message) {
    var error = $("sim-error");
    if (!error) {
      return;
    }
    error.hidden = false;
    error.textContent = message;
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
          controls: state.controls,
          seed: state.seed,
          explanations: state.explanations,
          mode: state.mode,
          result: state.result,
          yearStatus: state.yearStatus,
          monteCarlo: state.monteCarlo,
          mcStatus: state.mcStatus,
        })
      );
    } catch (err) {
      // Private mode or disabled storage should not break the simulator.
    }
  }

  function formatCount(value) {
    if (value == null || !isFinite(value)) {
      return "N/A";
    }
    if (Math.abs(value - Math.round(value)) < 1e-9) {
      return String(Math.round(value));
    }
    return value.toFixed(1);
  }

  function formatTurns(value) {
    if (value == null || !isFinite(value)) {
      return "N/A";
    }
    return value.toFixed(2);
  }

  function formatPercent(value) {
    if (value == null || !isFinite(value)) {
      return "N/A";
    }
    return value.toFixed(1) + "%";
  }

  function formatMoney(value) {
    if (value == null || !isFinite(value)) {
      return "N/A";
    }
    var rounded = Math.round(value);
    var sign = rounded < 0 ? "-" : "";
    return sign + "$" + Math.abs(rounded).toLocaleString("en-US");
  }

  function formatBand(band, format) {
    return (
      "Median " +
      format(band.median) +
      " (P10 " +
      format(band.p10) +
      "–P90 " +
      format(band.p90) +
      ")"
    );
  }

  function freshSeed() {
    var seed = (Date.now() ^ (Math.floor(Math.random() * 0x100000000))) >>> 0;
    return seed || 1;
  }

  function readControlsFromDom() {
    return engine.normalizeControls({
      patternId: state.controls ? state.controls.patternId : "level",
      lotMode: $("sim-lot-mode").value,
      lotQty: $("sim-lot-qty").value,
      lotWeeks: Number($("sim-lot-weeks").value),
      ssMode: $("sim-ss-mode").value,
      ssQty: $("sim-ss-qty").value,
      ssWeeks: Number($("sim-ss-weeks").value),
      serviceLevel: Number($("sim-service-level").value),
      leadTimeWeeks: Number($("sim-lead-time").value),
      demandVariability: $("sim-demand-var").value,
      leadTimeVariability: $("sim-lt-var").value,
      deliveryVariability: $("sim-delivery-var").value,
      shock: $("sim-shock").checked,
    });
  }

  function writeControlsToDom() {
    var controls = state.controls;
    $("sim-lot-mode").value = controls.lotMode;
    $("sim-lot-qty").value = String(controls.lotQty);
    $("sim-lot-weeks").value = String(controls.lotWeeks);
    $("sim-ss-mode").value = controls.ssMode;
    $("sim-ss-qty").value = String(controls.ssQty);
    $("sim-ss-weeks").value = String(controls.ssWeeks);
    $("sim-service-level").value = String(controls.serviceLevel);
    $("sim-lead-time").value = String(controls.leadTimeWeeks);
    $("sim-demand-var").value = controls.demandVariability;
    $("sim-lt-var").value = controls.leadTimeVariability;
    $("sim-delivery-var").value = controls.deliveryVariability;
    $("sim-shock").checked = controls.shock;
    $("sim-explanations").checked = state.explanations;
    document.querySelectorAll("[data-pattern-id]").forEach(function (button) {
      var selected = button.getAttribute("data-pattern-id") === controls.patternId;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.classList.toggle("sim-scenario--selected", selected);
    });
    applyMode();
    $("sim-lot-qty-field").hidden = controls.lotMode !== "fixed";
    $("sim-lot-weeks-field").hidden = controls.lotMode !== "weeks";
    $("sim-ss-qty-field").hidden = controls.ssMode !== "fixed";
    $("sim-ss-weeks-field").hidden = controls.ssMode !== "weeks";
    $("sim-service-field").hidden = controls.ssMode !== "formula";
    $("sim-app").classList.toggle("sim-app--help", state.explanations);
  }

  function metricCard(label, value, note) {
    var card = document.createElement("div");
    card.className = "sim-metric";
    var dt = document.createElement("div");
    dt.className = "sim-metric__label";
    dt.textContent = label;
    var dd = document.createElement("div");
    dd.className = "sim-metric__value";
    dd.textContent = value;
    card.appendChild(dt);
    card.appendChild(dd);
    if (note) {
      var extra = document.createElement("div");
      extra.className = "sim-metric__note";
      extra.textContent = note;
      card.appendChild(extra);
    }
    return card;
  }

  function renderSnapshot(result) {
    var host = $("sim-snapshot");
    host.innerHTML = "";
    var rows = [
      ["Starting stock", String(result.startingSoh) + " units"],
      ["Nominal lot", String(result.nominalLot) + " units"],
      ["Safety stock", String(result.safetyStock) + " units"],
      ["Annual demand", result.metrics.annualDemand.toLocaleString("en-US") + " units"],
    ];
    rows.forEach(function (row) {
      var wrap = document.createElement("div");
      var dt = document.createElement("dt");
      dt.textContent = row[0];
      var dd = document.createElement("dd");
      dd.textContent = row[1];
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      host.appendChild(wrap);
    });
  }

  function renderFormula(result) {
    var note = $("sim-formula-note");
    if (state.controls.ssMode !== "formula") {
      note.hidden = true;
      note.textContent = "";
      return;
    }
    var formula = result.formula;
    note.hidden = false;
    if (formula.sigma === 0) {
      note.textContent =
        "Formula safety stock is 0. Pre-shock demand does not vary, so σ is 0. Turn demand variability on, or choose a seasonal or rising forecast, to see a positive result. Z is " +
        formula.z.toFixed(3) +
        " and L is " +
        formula.leadTimeWeeks +
        ".";
      return;
    }
    note.textContent =
      "Formula safety stock is " +
      formula.computedSafetyStock +
      " = round(" +
      formula.z.toFixed(3) +
      " × σ " +
      formula.sigma.toFixed(3) +
      " × √" +
      formula.leadTimeWeeks +
      "). σ is the population standard deviation of this year's pre-shock demand. Monte Carlo uses this same quantity for all 50 years.";
  }

  function renderMetrics(result) {
    var metrics = result.metrics;
    var host = $("sim-metrics");
    host.innerHTML = "";
    host.appendChild(metricCard("Out-of-stock weeks", formatCount(metrics.oosWeeks)));
    host.appendChild(metricCard("Customer service level", formatPercent(metrics.csl)));
    host.appendChild(metricCard("Inventory turns", formatTurns(metrics.inventoryTurns)));
    host.appendChild(metricCard("Average working capital", formatMoney(metrics.averageWc)));
    host.appendChild(
      metricCard(
        "Annual gross profit",
        formatMoney(metrics.annualGp),
        metrics.annualDemand.toLocaleString("en-US") + " × $30"
      )
    );
    var callout = $("sim-callout");
    if (engine.needsPedagogyCallout(metrics)) {
      callout.hidden = false;
      callout.textContent =
        "High inventory turns with weak service is a poor outcome. The stock looks busy because it is often missing when the customer needs it.";
    } else {
      callout.hidden = true;
      callout.textContent = "";
    }
  }

  function renderShock(result) {
    var node = $("sim-shock-weeks");
    if (!result.shockWeeks.length) {
      node.textContent = "Shock is off for this year.";
      return;
    }
    node.textContent = "Shock weeks this year: " + result.shockWeeks.join(", ") + ".";
  }

  function renderChart(weeks) {
    var svg = $("sim-chart");
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    var width = 640;
    var height = 260;
    var left = 52;
    var right = 16;
    var top = 16;
    var bottom = 32;
    var minValue = 0;
    var maxValue = 0;
    weeks.forEach(function (week) {
      if (week.endingSoh < minValue) {
        minValue = week.endingSoh;
      }
      if (week.endingSoh > maxValue) {
        maxValue = week.endingSoh;
      }
      if (week.safetyStock < minValue) {
        minValue = week.safetyStock;
      }
      if (week.safetyStock > maxValue) {
        maxValue = week.safetyStock;
      }
    });
    if (minValue === maxValue) {
      minValue -= 1;
      maxValue += 1;
    }
    var pad = (maxValue - minValue) * 0.08;
    minValue -= pad;
    maxValue += pad;
    var innerWidth = width - left - right;
    var innerHeight = height - top - bottom;

    function x(index) {
      return left + (index / (weeks.length - 1)) * innerWidth;
    }
    function y(value) {
      return top + ((maxValue - value) / (maxValue - minValue)) * innerHeight;
    }
    function seriesPath(read) {
      return weeks
        .map(function (week, index) {
          return (index === 0 ? "M" : "L") + x(index).toFixed(2) + " " + y(read(week)).toFixed(2);
        })
        .join(" ");
    }
    function add(name, attrs) {
      var node = document.createElementNS("http://www.w3.org/2000/svg", name);
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
      svg.appendChild(node);
      return node;
    }

    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    add("line", {
      class: "sim-chart__zero",
      x1: String(left),
      x2: String(width - right),
      y1: y(0).toFixed(2),
      y2: y(0).toFixed(2),
    });
    add("path", { class: "sim-chart__ss", d: seriesPath(function (week) { return week.safetyStock; }) });
    add("path", { class: "sim-chart__ending", d: seriesPath(function (week) { return week.endingSoh; }) });
    [1, 13, 26, 39, 52].forEach(function (weekNo) {
      var label = add("text", {
        class: "sim-chart__label",
        x: x(weekNo - 1).toFixed(2),
        y: String(height - 10),
        "text-anchor": "middle",
      });
      label.textContent = String(weekNo);
    });
    var dataMax = 0;
    var dataMin = 0;
    weeks.forEach(function (week) {
      dataMax = Math.max(dataMax, week.endingSoh, week.safetyStock);
      dataMin = Math.min(dataMin, week.endingSoh, week.safetyStock);
    });
    var yTicks = dataMax === 0 ? [0] : [dataMax, 0];
    if (dataMin < 0) {
      yTicks.push(dataMin);
    }
    yTicks.forEach(function (tick) {
      var label = add("text", {
        class: "sim-chart__label",
        x: "4",
        y: (y(tick) + 4).toFixed(2),
      });
      label.textContent = String(Math.round(tick));
    });
  }

  function renderWeeks(weeks) {
    var body = $("sim-weeks-body");
    body.innerHTML = "";
    weeks.forEach(function (week) {
      var tr = document.createElement("tr");
      var values = [
        week.week,
        week.baseDemand,
        week.simulatedDemand,
        week.beginningSoh,
        week.plannedSupply,
        week.endingSoh,
        week.safetyStock,
      ];
      values.forEach(function (value, index) {
        var cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) {
          cell.scope = "row";
        }
        cell.textContent = String(value);
        if (index === 5 && value < 0) {
          cell.className = "sim-negative";
        }
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
  }

  function clearYearDom() {
    $("sim-snapshot").innerHTML = "";
    $("sim-metrics").innerHTML = "";
    $("sim-callout").hidden = true;
    $("sim-callout").textContent = "";
    $("sim-status").textContent = "";
    $("sim-formula-note").hidden = true;
    $("sim-formula-note").textContent = "";
    $("sim-shock-weeks").textContent = "";
    $("sim-weeks-body").innerHTML = "";
    var svg = $("sim-chart");
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
  }

  function renderSingle() {
    var empty = $("sim-year-empty");
    var output = $("sim-year-output");
    if (!state.result) {
      clearYearDom();
      output.hidden = true;
      empty.hidden = false;
      empty.textContent =
        state.yearStatus === "stale"
          ? "Settings changed. The chart, weekly table, and year metrics were cleared. Press Run year at the end of the settings to draw them again."
          : "No year yet. Press Run year at the end of the settings. Changing settings does not draw this chart or table.";
      return;
    }
    empty.hidden = true;
    output.hidden = false;
    var result = state.result;
    var quiet =
      state.controls.demandVariability === "off" &&
      state.controls.leadTimeVariability === "off" &&
      state.controls.deliveryVariability === "off" &&
      !state.controls.shock;
    $("sim-status").textContent = quiet
      ? "Showing the 52-week year for sample " +
        state.seed +
        ". Variability and shock are off, so Run year again matches this one. Nothing was saved on a server."
      : "Showing the 52-week year for sample " +
        state.seed +
        ". Press Run year again for a new sample. Nothing was saved on a server.";
    renderSnapshot(result);
    renderFormula(result);
    renderMetrics(result);
    renderShock(result);
    renderChart(result.weeks);
    renderWeeks(result.weeks);
  }

  function renderMonteCarlo() {
    var empty = $("sim-mc-empty");
    var results = $("sim-mc-results");
    var card = $("sim-mc-card");
    var body = $("sim-mc-body");
    var callout = $("sim-mc-callout");
    card.innerHTML = "";
    body.innerHTML = "";
    if (!state.monteCarlo) {
      empty.hidden = false;
      results.hidden = true;
      callout.hidden = true;
      callout.textContent = "";
      card.innerHTML = "";
      body.innerHTML = "";
      empty.textContent =
        state.mcStatus === "stale"
          ? "Settings changed. The last Monte Carlo batch was cleared. Press Run Monte Carlo at the end of the settings to run fifty years again."
          : "No Monte Carlo batch yet. Press Run Monte Carlo at the end of the settings. Opening this mode does not start a batch.";
      return;
    }
    empty.hidden = true;
    results.hidden = false;
    var summary = state.monteCarlo.summary;
    card.appendChild(metricCard("Out-of-stock weeks", formatBand(summary.oosWeeks, formatCount)));
    card.appendChild(metricCard("Customer service level", formatBand(summary.csl, formatPercent)));
    var turnsNote =
      summary.inventoryTurns.observations < summary.runs
        ? "Years with no on-hand stock are left out of the turns band only."
        : "";
    card.appendChild(
      metricCard(
        "Inventory turns",
        formatBand(summary.inventoryTurns, formatTurns),
        turnsNote
      )
    );
    card.appendChild(
      metricCard("Average working capital", formatBand(summary.averageWc, formatMoney))
    );
    card.appendChild(
      metricCard("Annual gross profit", "Median " + formatMoney(summary.annualGp.median))
    );
    if (
      engine.needsPedagogyCallout({
        inventoryTurns: summary.inventoryTurns.median,
        csl: summary.csl.median,
        oosWeeks: summary.oosWeeks.median,
      })
    ) {
      callout.hidden = false;
      callout.textContent =
        "Median turns look strong while median service is weak. High turns with poor service can still lose customers.";
    } else {
      callout.hidden = true;
      callout.textContent = "";
    }
    state.monteCarlo.rows.forEach(function (row) {
      var tr = document.createElement("tr");
      [
        row.run,
        formatCount(row.oosWeeks),
        formatPercent(row.csl),
        formatTurns(row.inventoryTurns),
        formatMoney(row.averageWc),
        formatMoney(row.annualGp),
        formatCount(row.safetyStock),
      ].forEach(function (value, index) {
        var cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) {
          cell.scope = "row";
        }
        cell.textContent = String(value);
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
  }

  function compactMonteCarlo(batch) {
    return {
      frozenSafetyStock: batch.frozenSafetyStock,
      summary: batch.summary,
      rows: batch.runs.map(function (run) {
        return {
          run: run.runIndex,
          oosWeeks: run.metrics.oosWeeks,
          csl: run.metrics.csl,
          inventoryTurns: run.metrics.inventoryTurns,
          averageWc: run.metrics.averageWc,
          annualGp: run.metrics.annualGp,
          safetyStock: run.safetyStock,
        };
      }),
    };
  }

  function applyMode() {
    var yearMode = state.mode !== "monte-carlo";
    $("sim-mode-year").setAttribute("aria-pressed", yearMode ? "true" : "false");
    $("sim-mode-mc").setAttribute("aria-pressed", yearMode ? "false" : "true");
    $("sim-mode-year").classList.toggle("sim-scenario--selected", yearMode);
    $("sim-mode-mc").classList.toggle("sim-scenario--selected", !yearMode);
    $("sim-run-year").hidden = !yearMode;
    $("sim-run-mc").hidden = yearMode;
    $("sim-year-panel").hidden = !yearMode;
    $("sim-mc-panel").hidden = yearMode;
  }

  function clearStaleOutputs() {
    if (state.result) {
      state.result = null;
      state.yearStatus = "stale";
    }
    if (state.monteCarlo) {
      state.monteCarlo = null;
      state.mcStatus = "stale";
    }
  }

  function onControlsChanged() {
    state.controls = readControlsFromDom();
    clearStaleOutputs();
    writeControlsToDom();
    renderSingle();
    renderMonteCarlo();
    writeSession();
  }

  function setMode(mode) {
    if (mode !== "year" && mode !== "monte-carlo") {
      return;
    }
    state.mode = mode;
    applyMode();
    writeSession();
  }

  function restoreSession() {
    var saved = readSession();
    state.controls = engine.normalizeControls(engine.DEFAULT_CONTROLS);
    if (!saved) {
      return;
    }
    if (saved.controls) {
      state.controls = engine.normalizeControls(saved.controls);
    }
    if (typeof saved.seed === "number" && isFinite(saved.seed)) {
      state.seed = saved.seed >>> 0 || 1;
    }
    state.explanations = Boolean(saved.explanations);
    if (saved.mode === "year" || saved.mode === "monte-carlo") {
      state.mode = saved.mode;
    }
    if (saved.yearStatus === "ready" && saved.result && saved.result.weeks && saved.result.weeks.length === 52) {
      state.result = saved.result;
      state.yearStatus = "ready";
    } else if (saved.yearStatus === "stale") {
      state.yearStatus = "stale";
    }
    if (saved.mcStatus === "ready" && saved.monteCarlo && saved.monteCarlo.summary && saved.monteCarlo.rows) {
      state.monteCarlo = saved.monteCarlo;
      state.mcStatus = "ready";
    } else if (saved.monteCarlo && saved.monteCarlo.summary && saved.monteCarlo.rows && saved.mcStatus !== "stale") {
      state.monteCarlo = saved.monteCarlo;
      state.mcStatus = "ready";
    } else if (saved.mcStatus === "stale") {
      state.mcStatus = "stale";
    }
  }

  function bindControls() {
    [
      "sim-lot-mode",
      "sim-lot-weeks",
      "sim-ss-mode",
      "sim-ss-weeks",
      "sim-service-level",
      "sim-lead-time",
      "sim-demand-var",
      "sim-lt-var",
      "sim-delivery-var",
    ].forEach(function (id) {
      $(id).addEventListener("change", onControlsChanged);
    });
    ["sim-lot-qty", "sim-ss-qty"].forEach(function (id) {
      $(id).addEventListener("change", onControlsChanged);
    });
    $("sim-shock").addEventListener("change", onControlsChanged);
    $("sim-explanations").addEventListener("change", function () {
      state.explanations = $("sim-explanations").checked;
      $("sim-app").classList.toggle("sim-app--help", state.explanations);
      writeSession();
    });
    document.querySelectorAll("[data-pattern-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        var patternId = button.getAttribute("data-pattern-id");
        if (state.controls.patternId === patternId) {
          return;
        }
        state.controls.patternId = patternId;
        onControlsChanged();
      });
    });
    $("sim-mode-year").addEventListener("click", function () {
      setMode("year");
    });
    $("sim-mode-mc").addEventListener("click", function () {
      setMode("monte-carlo");
    });
    $("sim-run-year").addEventListener("click", runYearClicked);
    $("sim-run-mc").addEventListener("click", runMonteCarloClicked);
  }

  function scrollResultsIntoView(panelId) {
    var panel = $(panelId);
    if (!panel || panel.hidden) {
      return;
    }
    var heading = panel.querySelector(".card__title");
    var target = heading || panel;
    var reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (heading) {
      heading.setAttribute("tabindex", "-1");
    }
    target.scrollIntoView({
      behavior: reduceMotion ? "instant" : "smooth",
      block: "start",
    });
    if (heading) {
      heading.focus({ preventScroll: true });
    }
  }

  function runYearClicked() {
    state.controls = readControlsFromDom();
    writeControlsToDom();
    state.seed = freshSeed();
    state.result = engine.runYear(state.controls, state.seed);
    state.yearStatus = "ready";
    renderSingle();
    writeSession();
    scrollResultsIntoView("sim-year-panel");
  }

  function runMonteCarloClicked() {
    var next = readControlsFromDom();
    if (JSON.stringify(next) !== JSON.stringify(state.controls)) {
      state.controls = next;
      clearStaleOutputs();
      writeControlsToDom();
      renderSingle();
    }
    var options = { runs: 50 };
    if (state.controls.ssMode === "formula" && state.result) {
      options.frozenSafetyStock = state.result.safetyStock;
    }
    var batch = engine.runMonteCarlo(state.controls, freshSeed(), options);
    state.monteCarlo = compactMonteCarlo(batch);
    state.mcStatus = "ready";
    renderMonteCarlo();
    writeSession();
    scrollResultsIntoView("sim-mc-panel");
  }

  function boot() {
    if (!engine) {
      fail("The simulator script did not load.");
      return;
    }
    restoreSession();
    writeControlsToDom();
    bindControls();
    renderSingle();
    renderMonteCarlo();
    writeSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
