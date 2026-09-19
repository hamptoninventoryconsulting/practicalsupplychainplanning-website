#!/usr/bin/env node
/**
 * Smoke checks for the educational safety stock simulator.
 * Loads versioned scenario JSON and runs the browser engine in Node.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(
  ROOT,
  "learn",
  "safety-stock-simulator",
  "scenarios.json"
);
const PAGE_PATH = path.join(
  ROOT,
  "learn",
  "safety-stock-simulator",
  "index.html"
);
const ENGINE_PATH = path.join(ROOT, "assets", "safety-stock-engine.js");
const UI_PATH = path.join(ROOT, "assets", "safety-stock-simulator.js");

const dataset = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const engine = require(ENGINE_PATH);
const page = fs.readFileSync(PAGE_PATH, "utf8");
const ui = fs.readFileSync(UI_PATH, "utf8");

assert.strictEqual(dataset.scenarios.length, 3, "exactly three scenarios");
assert.deepStrictEqual(
  dataset.scenarios.map((scenario) => scenario.id),
  ["demand-risk-only", "supply-risk-only", "demand-and-supply"]
);

const demand = dataset.scenarios[0];
const supply = dataset.scenarios[1];
const combined = dataset.scenarios[2];

assert.ok(demand.demandCv > 0 && demand.leadTimeCv === 0);
assert.ok(supply.demandCv === 0 && supply.leadTimeCv > 0);
assert.ok(combined.demandCv > 0 && combined.leadTimeCv > 0);
assert.strictEqual(demand.demandMeanPerDay, supply.demandMeanPerDay);
assert.strictEqual(demand.leadTimeMeanDays, supply.leadTimeMeanDays);

const sample = engine.sampleComparison(dataset, { trials: 800, seed: 42 });
const atForty = engine.scoreComparison(dataset, sample, 40);
const atZero = engine.scoreComparison(dataset, sample, 0);
const atHigh = engine.scoreComparison(dataset, sample, 120);

assert.ok(
  atForty.byId["demand-and-supply"].cycleServiceLevel <=
    atForty.byId["demand-risk-only"].cycleServiceLevel + 0.001,
  "combined risk should not beat demand-only service"
);
assert.ok(
  atForty.byId["demand-and-supply"].cycleServiceLevel <=
    atForty.byId["supply-risk-only"].cycleServiceLevel + 0.001,
  "combined risk should not beat supply-only service"
);
assert.ok(
  atHigh.byId["demand-risk-only"].cycleServiceLevel >
    atZero.byId["demand-risk-only"].cycleServiceLevel,
  "more safety stock should improve demand-only service"
);
assert.ok(
  atHigh.byId["demand-and-supply"].cycleServiceLevel -
    atForty.byId["demand-and-supply"].cycleServiceLevel <=
    atForty.byId["demand-and-supply"].cycleServiceLevel -
      atZero.byId["demand-and-supply"].cycleServiceLevel + 0.05,
  "later stock additions should not improve service much more than the first additions"
);

assert.match(page, /sessionStorage/);
assert.match(page, /\/learn\/safety-stock-simulator\/scenarios\.json/);
assert.doesNotMatch(page, /railway|streamlit|sqlite/i);
assert.doesNotMatch(ui, /fetch\([^)]*api/i);
assert.match(ui, /sessionStorage/);
assert.match(ui, /STORAGE_KEY/);

const about = fs.readFileSync(path.join(ROOT, "about", "index.html"), "utf8");
assert.match(about, /free educational/);
assert.match(about, /\/learn\/safety-stock-simulator\//);
assert.match(about, />Learn<\/a/);

console.log("Safety stock simulator checks OK.");
