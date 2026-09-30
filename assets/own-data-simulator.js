/**
 * Own-data simulator page.
 * Runs in the browser. Does not keep a saved copy and does not send SKU data.
 * Inputs for a copied link live in the URL fragment (#d=), which is not sent to the server.
 */
(function () {
  "use strict";

  var engine = window.OwnDataEngine;
  var state = {
    scenario: null,
    selected: 0,
    mode: "year",
    holdSeed: false,
    yearRows: null,
    mcRows: null,
    errors: [],
    warnings: [],
    paste: null,
    running: false,
    explanations: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function freshSeed() {
    return engine.freshSeed();
  }

  function fail(message) {
    var error = $("own-errors");
    error.hidden = false;
    error.textContent = message;
  }

  function listBox(id, items, className) {
    var host = $(id);
    host.innerHTML = "";
    if (!items || !items.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.className = className;
    var list = document.createElement("ul");
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    host.appendChild(list);
  }

  function renderProblems() {
    listBox("own-errors", state.errors, "sim-error");
    var warnings = state.warnings.slice();
    var encoded = state.scenario ? engine.encodeScenario(state.scenario) : null;
    if (encoded && encoded.ok && encoded.overLimit) {
      warnings.push("This link is over 2,000 characters. Shorten the SKU names before sharing it.");
    }
    listBox("own-warnings", warnings, "sim-warning");
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
    var cents = Math.round(value * 100) / 100;
    var sign = cents < 0 ? "-" : "";
    var abs = Math.abs(cents);
    var fixed = abs.toFixed(2).split(".");
    var whole = Number(fixed[0]).toLocaleString("en-US");
    if (fixed[1] === "00") {
      return sign + "$" + whole;
    }
    return sign + "$" + whole + "." + fixed[1];
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

  function fieldsFromDom() {
    var current = state.scenario.skus[state.selected] || engine.defaultSku(state.selected + 1);
    return {
      id: current.id,
      label: $("own-label").value,
      forecast: $("own-forecast").value,
      demandVariability: $("own-demand-var").value,
      leadTimeWeeks: $("own-lead").value,
      leadTimeVariability: $("own-lt-var").value,
      currentStock: $("own-stock").value,
      unitCost: $("own-cost").value,
      sellingPrice: $("own-price").value,
      lotMode: $("own-lot-mode").value,
      lotQty: $("own-lot-qty").value,
      lotWeeks: $("own-lot-weeks").value,
      ssMode: $("own-ss-mode").value,
      ssQty: $("own-ss-qty").value,
      ssWeeks: $("own-ss-weeks").value,
      serviceLevel: $("own-service").value,
    };
  }

  function sameSkus(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function commitSelected() {
    var parsed = engine.parseSkuFields(fieldsFromDom(), "This SKU");
    state.errors = parsed.errors.slice();
    state.warnings = parsed.warnings.slice();
    if (!parsed.ok) {
      renderProblems();
      return false;
    }
    var next = state.scenario.skus.slice();
    next[state.selected] = parsed.sku;
    var draft = {
      seed: state.scenario.seed,
      deliveryVariability: $("own-delivery-var").value,
      shock: $("own-shock").checked,
      skus: next,
    };
    var checked = engine.validateScenario(draft);
    state.errors = checked.errors.slice();
    state.warnings = checked.warnings.slice();
    if (!checked.ok) {
      renderProblems();
      return false;
    }
    checked.scenario.seed = state.scenario.seed;
    var changed =
      !sameSkus(checked.scenario.skus, state.scenario.skus) ||
      checked.scenario.deliveryVariability !== state.scenario.deliveryVariability ||
      checked.scenario.shock !== state.scenario.shock;
    state.scenario = checked.scenario;
    if (changed) {
      state.holdSeed = false;
      state.yearRows = null;
      state.mcRows = null;
      $("own-linked").hidden = true;
    }
    renderProblems();
    writeHash();
    return true;
  }

  function writeHash() {
    var encoded = engine.encodeScenario(state.scenario);
    if (!encoded.ok) {
      return;
    }
    var next = encoded.fragment;
    if (window.location.hash === next) {
      renderProblems();
      return;
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search + next);
    renderProblems();
  }

  function fillDom() {
    var sku = state.scenario.skus[state.selected];
    $("own-label").value = sku.label;
    $("own-forecast").value = String(sku.forecast);
    $("own-stock").value = String(sku.currentStock);
    $("own-cost").value = String(sku.unitCost);
    $("own-price").value = String(sku.sellingPrice);
    $("own-lot-mode").value = sku.lotMode;
    $("own-lot-qty").value = String(sku.lotQty);
    $("own-lot-weeks").value = String(sku.lotWeeks);
    $("own-ss-mode").value = sku.ssMode;
    $("own-ss-qty").value = String(sku.ssQty);
    $("own-ss-weeks").value = String(sku.ssWeeks);
    $("own-service").value = String(sku.serviceLevel);
    $("own-lead").value = String(sku.leadTimeWeeks);
    $("own-demand-var").value = sku.demandVariability;
    $("own-lt-var").value = sku.leadTimeVariability;
    $("own-delivery-var").value = state.scenario.deliveryVariability;
    $("own-shock").checked = state.scenario.shock;
    $("sim-explanations").checked = state.explanations;
    $("own-lot-qty-field").hidden = sku.lotMode !== "fixed";
    $("own-lot-weeks-field").hidden = sku.lotMode !== "weeks";
    $("own-ss-qty-field").hidden = sku.ssMode !== "fixed";
    $("own-ss-weeks-field").hidden = sku.ssMode !== "weeks";
    $("own-service-field").hidden = sku.ssMode !== "formula";
    $("own-app").classList.toggle("sim-app--help", state.explanations);
    renderSkuBar();
    applyMode();
  }

  function renderSkuBar() {
    var bar = $("own-sku-bar");
    bar.innerHTML = "";
    state.scenario.skus.forEach(function (sku, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "sim-scenario" + (index === state.selected ? " sim-scenario--selected" : "");
      button.setAttribute("aria-pressed", index === state.selected ? "true" : "false");
      button.textContent = sku.label;
      button.addEventListener("click", function () {
        selectSku(index);
      });
      bar.appendChild(button);
    });
    $("own-count").textContent = state.scenario.skus.length + " of 10 SKUs";
    $("own-add").disabled = state.running || state.scenario.skus.length >= engine.MAX_SKUS;
    $("own-remove").disabled = state.running || state.scenario.skus.length <= 1;
  }

  function applyMode() {
    var yearMode = state.mode !== "monte-carlo";
    $("own-mode-year").setAttribute("aria-pressed", yearMode ? "true" : "false");
    $("own-mode-mc").setAttribute("aria-pressed", yearMode ? "false" : "true");
    $("own-mode-year").classList.toggle("sim-scenario--selected", yearMode);
    $("own-mode-mc").classList.toggle("sim-scenario--selected", !yearMode);
    $("own-run-year").hidden = !yearMode;
    $("own-run-mc").hidden = yearMode;
    $("own-year-panel").hidden = !yearMode;
    $("own-mc-panel").hidden = yearMode;
  }

  function selectSku(index) {
    if (index === state.selected || state.running) {
      return;
    }
    if (!commitSelected()) {
      return;
    }
    state.selected = index;
    fillDom();
    renderResults();
  }

  function nextSkuId(skus) {
    var max = 0;
    skus.forEach(function (sku) {
      var match = /^sku-(\d+)$/.exec(sku.id || "");
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    });
    return "sku-" + (max + 1);
  }

  function addSku() {
    if (state.running || !commitSelected()) {
      return;
    }
    if (state.scenario.skus.length >= engine.MAX_SKUS) {
      return;
    }
    var sku = engine.defaultSku(state.scenario.skus.length + 1);
    sku.id = nextSkuId(state.scenario.skus);
    sku.label = "SKU " + (state.scenario.skus.length + 1);
    state.scenario.skus.push(sku);
    state.selected = state.scenario.skus.length - 1;
    state.holdSeed = false;
    state.yearRows = null;
    state.mcRows = null;
    fillDom();
    renderResults();
    writeHash();
  }

  function removeSku() {
    if (state.running || state.scenario.skus.length <= 1 || !commitSelected()) {
      return;
    }
    state.scenario.skus.splice(state.selected, 1);
    if (state.selected >= state.scenario.skus.length) {
      state.selected = state.scenario.skus.length - 1;
    }
    state.holdSeed = false;
    state.yearRows = null;
    state.mcRows = null;
    fillDom();
    renderResults();
    writeHash();
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

  function renderCommentary(host, commentary) {
    host.innerHTML = "";
    if (!commentary) {
      return;
    }
    commentary.lines.forEach(function (line) {
      var p = document.createElement("p");
      p.textContent = line.text;
      host.appendChild(p);
    });
  }

  function renderSnapshot(result) {
    var host = $("own-snapshot");
    host.innerHTML = "";
    var rows = [
      ["Starting stock", String(result.startingSoh) + " units"],
      ["Nominal lot", String(result.nominalLot) + " units"],
      ["Safety stock", String(result.safetyStock) + " units"],
      ["Annual demand", result.metrics.annualDemand.toLocaleString("en-US") + " units"],
      ["Unit cost", formatMoney(result.prices.cost)],
      ["Selling price", formatMoney(result.prices.sell)],
      ["Gross profit per unit", formatMoney(result.prices.gp)],
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

  function renderChart(weeks) {
    var svg = $("own-chart");
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
      minValue = Math.min(minValue, week.endingSoh, week.safetyStock);
      maxValue = Math.max(maxValue, week.endingSoh, week.safetyStock);
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
  }

  function renderWeeks(weeks) {
    var body = $("own-weeks-body");
    body.innerHTML = "";
    weeks.forEach(function (week) {
      var tr = document.createElement("tr");
      [week.week, week.baseDemand, week.simulatedDemand, week.beginningSoh, week.plannedSupply, week.endingSoh, week.safetyStock].forEach(function (value, index) {
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

  function renderYear() {
    var row = state.yearRows ? state.yearRows[state.selected] : null;
    $("own-year-empty").hidden = Boolean(row);
    $("own-year-output").hidden = !row;
    if (!row) {
      $("own-shock-weeks").textContent = "";
      $("own-formula-note").hidden = true;
      return;
    }
    var result = row.result;
    $("own-status").textContent =
      "Showing the 52-week year for " +
      row.sku.label +
      ", sample " +
      state.scenario.seed +
      ". Nothing was saved on a server.";
    renderSnapshot(result);
    var note = $("own-formula-note");
    if (row.sku.ssMode === "formula") {
      note.hidden = false;
      note.textContent =
        result.formula.sigma === 0
          ? "Formula safety stock is 0 because pre-shock demand does not vary."
          : "Formula safety stock is " +
            result.formula.computedSafetyStock +
            " = round(" +
            result.formula.z.toFixed(3) +
            " × σ " +
            result.formula.sigma.toFixed(3) +
            " × √" +
            result.formula.leadTimeWeeks +
            ").";
    } else {
      note.hidden = true;
      note.textContent = "";
    }
    $("own-shock-weeks").textContent = result.shockWeeks.length
      ? "Shock weeks this year: " + result.shockWeeks.join(", ") + "."
      : "Shock is off for this year.";
    var callout = $("own-callout");
    if (row.commentary.callout) {
      callout.hidden = false;
      callout.textContent = row.commentary.callout;
    } else {
      callout.hidden = true;
      callout.textContent = "";
    }
    renderCommentary($("own-commentary"), row.commentary);
    var metrics = result.metrics;
    var host = $("own-metrics");
    host.innerHTML = "";
    host.appendChild(metricCard("Out-of-stock weeks", formatCount(metrics.oosWeeks)));
    host.appendChild(metricCard("Customer service level", formatPercent(metrics.csl)));
    host.appendChild(metricCard("Inventory turns", formatTurns(metrics.inventoryTurns)));
    host.appendChild(metricCard("Average working capital", formatMoney(metrics.averageWc)));
    host.appendChild(metricCard("Annual gross profit", formatMoney(metrics.annualGp)));
    renderChart(result.weeks);
    renderWeeks(result.weeks);
  }

  function renderMonteCarlo() {
    var row = state.mcRows ? state.mcRows[state.selected] : null;
    $("own-mc-empty").hidden = Boolean(row);
    $("own-mc-results").hidden = !row;
    var card = $("own-mc-card");
    var body = $("own-mc-body");
    card.innerHTML = "";
    body.innerHTML = "";
    if (!row) {
      $("own-mc-callout").hidden = true;
      $("own-mc-commentary").innerHTML = "";
      return;
    }
    var summary = row.monteCarlo.summary;
    card.appendChild(metricCard("Out-of-stock weeks", formatBand(summary.oosWeeks, formatCount)));
    card.appendChild(metricCard("Customer service level", formatBand(summary.csl, formatPercent)));
    card.appendChild(metricCard("Inventory turns", formatBand(summary.inventoryTurns, formatTurns)));
    card.appendChild(metricCard("Average working capital", formatBand(summary.averageWc, formatMoney)));
    card.appendChild(metricCard("Annual gross profit", "Median " + formatMoney(summary.annualGp.median)));
    var callout = $("own-mc-callout");
    if (row.commentary.callout) {
      callout.hidden = false;
      callout.textContent = row.commentary.callout;
    } else {
      callout.hidden = true;
      callout.textContent = "";
    }
    renderCommentary($("own-mc-commentary"), row.commentary);
    row.monteCarlo.runs.forEach(function (run) {
      var tr = document.createElement("tr");
      [
        run.runIndex,
        formatCount(run.metrics.oosWeeks),
        formatPercent(run.metrics.csl),
        formatTurns(run.metrics.inventoryTurns),
        formatMoney(run.metrics.averageWc),
        formatMoney(run.metrics.annualGp),
        formatCount(run.safetyStock),
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

  function summaryValue(row, mode, key) {
    if (mode === "monte-carlo") {
      var summary = row.monteCarlo.summary;
      if (key === "oosWeeks") {
        return formatBand(summary.oosWeeks, formatCount);
      }
      if (key === "csl") {
        return formatBand(summary.csl, formatPercent);
      }
      if (key === "inventoryTurns") {
        return formatBand(summary.inventoryTurns, formatTurns);
      }
      if (key === "averageWc") {
        return formatBand(summary.averageWc, formatMoney);
      }
      return "Median " + formatMoney(summary.annualGp.median);
    }
    var metrics = row.result.metrics;
    if (key === "oosWeeks") {
      return formatCount(metrics.oosWeeks);
    }
    if (key === "csl") {
      return formatPercent(metrics.csl);
    }
    if (key === "inventoryTurns") {
      return formatTurns(metrics.inventoryTurns);
    }
    if (key === "averageWc") {
      return formatMoney(metrics.averageWc);
    }
    return formatMoney(metrics.annualGp);
  }

  function pointValue(row, mode, key) {
    if (mode === "monte-carlo") {
      var summary = row.monteCarlo.summary;
      if (key === "averageWc") {
        return summary.averageWc.median;
      }
      return summary.annualGp.median;
    }
    return row.result.metrics[key];
  }

  function renderSummary() {
    var mode = state.mode === "monte-carlo" ? "monte-carlo" : "year";
    var rows = mode === "monte-carlo" ? state.mcRows : state.yearRows;
    var empty = $("own-summary-empty");
    var wrap = $("own-summary-wrap");
    if (!rows) {
      empty.hidden = false;
      wrap.hidden = true;
      empty.textContent =
        mode === "monte-carlo"
          ? "No Monte Carlo results yet. Press Run Monte Carlo."
          : "No year results yet. Press Run year.";
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    $("own-summary-caption").textContent =
      mode === "monte-carlo"
        ? "Illustrative estimate. Monte Carlo rows show medians and P10–P90. The total adds the median working capital and the median gross profit."
        : "Illustrative estimate. One row per SKU. The total adds working capital and gross profit only.";
    var body = $("own-summary-body");
    body.innerHTML = "";
    var keys = ["oosWeeks", "csl", "inventoryTurns", "averageWc", "annualGp"];
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var head = document.createElement("th");
      head.scope = "row";
      head.textContent = row.sku.label;
      tr.appendChild(head);
      keys.forEach(function (key) {
        var cell = document.createElement("td");
        cell.textContent = summaryValue(row, mode, key);
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    var totalWc = 0;
    var totalGp = 0;
    rows.forEach(function (row) {
      totalWc += pointValue(row, mode, "averageWc");
      totalGp += pointValue(row, mode, "annualGp");
    });
    var total = document.createElement("tr");
    total.className = "sim-total";
    var totalHead = document.createElement("th");
    totalHead.scope = "row";
    totalHead.textContent = "Total";
    total.appendChild(totalHead);
    ["—", "—", "—", formatMoney(totalWc), formatMoney(totalGp)].forEach(function (value) {
      var cell = document.createElement("td");
      cell.textContent = value;
      total.appendChild(cell);
    });
    body.appendChild(total);
  }

  function renderResults() {
    renderYear();
    renderMonteCarlo();
    renderSummary();
    $("own-linked").hidden = !state.holdSeed;
  }

  function setBusy(busy) {
    state.running = busy;
    $("own-run-year").disabled = busy;
    $("own-run-mc").disabled = busy;
    $("own-progress").hidden = !busy;
    renderSkuBar();
  }

  function scrollResults() {
    var panel = state.mode === "monte-carlo" ? $("own-mc-panel") : $("own-year-panel");
    var heading = panel.querySelector(".card__title");
    var reduce =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (heading) {
      heading.setAttribute("tabindex", "-1");
    }
    (heading || panel).scrollIntoView({
      behavior: reduce ? "instant" : "smooth",
      block: "start",
    });
    if (heading) {
      heading.focus({ preventScroll: true });
    }
  }

  function runActive() {
    if (state.running || !commitSelected()) {
      return;
    }
    var resolved = engine.resolveRunSeed(state.scenario, state.holdSeed, freshSeed());
    state.holdSeed = false;
    state.scenario.seed = resolved.seed;
    $("own-linked").hidden = true;
    var mode = state.mode === "monte-carlo" ? "monte-carlo" : "year";
    var jobs = engine.portfolioJobs(state.scenario, mode, resolved.seed);
    var grouped = state.scenario.skus.map(function () {
      return [];
    });
    var index = 0;
    setBusy(true);
    function step() {
      var start = Date.now();
      while (index < jobs.length && Date.now() - start < 12) {
        var job = jobs[index];
        var sku = state.scenario.skus[job.skuIndex];
        var options = {};
        if (job.frozenSafetyStock != null) {
          options.frozenSafetyStock = job.frozenSafetyStock;
        }
        var result = engine.runYear(sku, state.scenario, job.seed, options);
        result.runIndex = job.runIndex;
        result.seed = job.seed;
        grouped[job.skuIndex].push(result);
        index += 1;
      }
      $("own-progress").textContent =
        "Simulating " + index + " of " + jobs.length + "…";
      if (index < jobs.length) {
        setTimeout(step, 0);
        return;
      }
      var rows = state.scenario.skus.map(function (sku, skuIndex) {
        if (mode === "monte-carlo") {
          var batch = engine.assembleMonteCarlo(sku, state.scenario, resolved.seed, grouped[skuIndex]);
          return {
            sku: sku,
            monteCarlo: batch,
            commentary: engine.commentaryFromMonteCarlo(sku, state.scenario, batch),
          };
        }
        var result = grouped[skuIndex][0];
        return {
          sku: sku,
          result: result,
          commentary: engine.commentaryFromYear(sku, state.scenario, result),
        };
      });
      if (mode === "monte-carlo") {
        state.mcRows = rows;
      } else {
        state.yearRows = rows;
      }
      setBusy(false);
      $("own-progress").hidden = true;
      writeHash();
      renderResults();
      scrollResults();
    }
    step();
  }

  function previewPaste() {
    state.paste = engine.parseTable($("own-paste").value);
    var host = $("own-preview");
    var body = $("own-preview-body");
    body.innerHTML = "";
    host.hidden = false;
    state.paste.preview.forEach(function (row) {
      var tr = document.createElement("tr");
      var check = row.errors.length ? row.errors.join(" ") : row.warnings.length ? row.warnings.join(" ") : "OK";
      [row.rowNumber, row.label, row.forecast, row.leadTimeWeeks, row.currentStock, row.unitCost, row.sellingPrice, check].forEach(function (value, index) {
        var cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) {
          cell.scope = "row";
        }
        cell.textContent = String(value);
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    var notes = state.paste.errors.concat(state.paste.warnings);
    $("own-preview-note").textContent = notes.length
      ? notes.join(" ")
      : "Preview looks usable. Use these SKUs to replace the list on the page.";
    $("own-apply").disabled = !state.paste.ok;
  }

  function applyPaste() {
    if (!state.paste || !state.paste.ok || state.running) {
      return;
    }
    state.scenario.skus = state.paste.skus;
    if (state.paste.deliveryVariability) {
      state.scenario.deliveryVariability = state.paste.deliveryVariability;
    }
    if (state.paste.shock != null) {
      state.scenario.shock = state.paste.shock;
    }
    state.scenario.seed = null;
    state.selected = 0;
    state.holdSeed = false;
    state.yearRows = null;
    state.mcRows = null;
    state.errors = [];
    state.warnings = state.paste.warnings.slice();
    fillDom();
    renderProblems();
    renderResults();
    writeHash();
  }

  function copyLink() {
    if (!commitSelected()) {
      $("own-copy-note").hidden = false;
      $("own-copy-note").textContent = "Fix the values above before copying. The link keeps the last valid scenario.";
      return;
    }
    var url = window.location.origin + window.location.pathname + window.location.search + engine.encodeScenario(state.scenario).fragment;
    $("own-copy-note").hidden = false;
    function show(text) {
      $("own-copy-note").textContent = text;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () {
          show("Copied. This link contains your numbers. Anyone who opens it can read them.");
        },
        function () {
          show(url);
        }
      );
    } else {
      show(url);
    }
  }

  function onEdit() {
    if (state.running) {
      return;
    }
    state.yearRows = null;
    state.mcRows = null;
    state.holdSeed = false;
    $("own-linked").hidden = true;
    $("own-lot-qty-field").hidden = $("own-lot-mode").value !== "fixed";
    $("own-lot-weeks-field").hidden = $("own-lot-mode").value !== "weeks";
    $("own-ss-qty-field").hidden = $("own-ss-mode").value !== "fixed";
    $("own-ss-weeks-field").hidden = $("own-ss-mode").value !== "weeks";
    $("own-service-field").hidden = $("own-ss-mode").value !== "formula";
    commitSelected();
    renderSkuBar();
    renderResults();
  }

  function restoreFromHash() {
    if (!window.location.hash) {
      state.scenario = engine.defaultScenario();
      return;
    }
    var decoded = engine.decodeScenario(window.location.hash);
    if (!decoded.ok) {
      state.errors = decoded.errors.slice();
      state.scenario = engine.defaultScenario();
      state.holdSeed = false;
      return;
    }
    state.scenario = decoded.scenario;
    state.warnings = decoded.warnings.slice();
    state.holdSeed = Boolean(decoded.scenario.seed);
    state.selected = 0;
    state.yearRows = null;
    state.mcRows = null;
  }

  function bind() {
    [
      "own-label",
      "own-forecast",
      "own-stock",
      "own-cost",
      "own-price",
      "own-lot-mode",
      "own-lot-qty",
      "own-lot-weeks",
      "own-ss-mode",
      "own-ss-qty",
      "own-ss-weeks",
      "own-service",
      "own-lead",
      "own-demand-var",
      "own-lt-var",
      "own-delivery-var",
    ].forEach(function (id) {
      $(id).addEventListener("change", onEdit);
    });
    $("own-shock").addEventListener("change", onEdit);
    $("sim-explanations").addEventListener("change", function () {
      state.explanations = $("sim-explanations").checked;
      $("own-app").classList.toggle("sim-app--help", state.explanations);
    });
    $("own-mode-year").addEventListener("click", function () {
      state.mode = "year";
      applyMode();
      renderResults();
    });
    $("own-mode-mc").addEventListener("click", function () {
      state.mode = "monte-carlo";
      applyMode();
      renderResults();
    });
    $("own-add").addEventListener("click", addSku);
    $("own-remove").addEventListener("click", removeSku);
    $("own-copy").addEventListener("click", copyLink);
    $("own-preview-btn").addEventListener("click", previewPaste);
    $("own-apply").addEventListener("click", applyPaste);
    $("own-run-year").addEventListener("click", function () {
      state.mode = "year";
      applyMode();
      runActive();
    });
    $("own-run-mc").addEventListener("click", function () {
      state.mode = "monte-carlo";
      applyMode();
      runActive();
    });
    window.addEventListener("hashchange", function () {
      restoreFromHash();
      fillDom();
      renderProblems();
      renderResults();
    });
  }

  function boot() {
    if (!engine) {
      fail("The own-data simulator script did not load.");
      return;
    }
    restoreFromHash();
    bind();
    fillDom();
    renderProblems();
    renderResults();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
