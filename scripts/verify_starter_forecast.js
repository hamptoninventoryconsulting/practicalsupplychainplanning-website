#!/usr/bin/env node
/**
 * Starter Forecast checks: 12-week average, date reading, CSV headers,
 * separate SKUs, locations, and the built page.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "_site");
const PAGE = path.join(SITE, "learn", "starter-forecast", "index.html");
const engine = require(path.join(ROOT, "assets", "starter-forecast-engine.js"));

const HEADER = "order_id,order_datetime,sku,qty,fulfillment_location";
const PLAN = "2026-04-06";
const TODAY = "2026-10-14";

function addDays(iso, days) {
  const parts = iso.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WINDOW = [];
for (let i = 12; i >= 1; i -= 1) {
  WINDOW.push(addDays(PLAN, -7 * i));
}

function line(date, sku, qty, location) {
  return "1," + date + "," + sku + "," + qty + "," + (location || "Main");
}

function run(lines, extra) {
  const opts = Object.assign(
    {
      fileName: "history.csv",
      dayFirst: true,
      planStart: PLAN,
      horizon: 13,
      today: TODAY,
    },
    extra || {}
  );
  if (!opts.text) {
    opts.text = HEADER + "\n" + lines.join("\n") + "\n";
  }
  return engine.buildForecast(opts);
}

function skuOf(result, sku) {
  const found = result.skus.find(function (row) {
    return row.sku === sku;
  });
  assert.ok(found, "missing SKU " + JSON.stringify(sku));
  return found;
}

function assertQty(row, expected) {
  assert.strictEqual(row.weeklyForecast.toFixed(2), expected, row.sku + " weekly forecast");
}

assert.deepStrictEqual(WINDOW, [
  "2026-01-12",
  "2026-01-19",
  "2026-01-26",
  "2026-02-02",
  "2026-02-09",
  "2026-02-16",
  "2026-02-23",
  "2026-03-02",
  "2026-03-09",
  "2026-03-16",
  "2026-03-23",
  "2026-03-30",
]);

const anchor = [line("2025-05-05", "OLD", 5), line("2025-05-12", "OLD", 5)];

const full = run(anchor.concat(WINDOW.map(function (date) { return line(date, "A", 10); })));
assert.strictEqual(full.ok, true, JSON.stringify(full.errors));
const fullA = skuOf(full, "A");
assert.strictEqual(fullA.weeksUsed, 12);
assertQty(fullA, "10.00");
assert.strictEqual(fullA.firstSaleWeek, "2026-01-12");
assert.deepStrictEqual(fullA.flags, []);
assert.strictEqual(full.forecastRows.length, 2 * 13);

const zerosAfter = run(anchor.concat([line(WINDOW[0], "A", 24)]));
assert.strictEqual(zerosAfter.ok, true);
const zerosRow = skuOf(zerosAfter, "A");
assert.strictEqual(zerosRow.weeksUsed, 12);
assertQty(zerosRow, "2.00");
assert.ok(zerosRow.flags.indexOf("Short history: 12 weeks") === -1);
assert.ok(!zerosRow.flags.some(function (flag) { return flag.indexOf("Short history") === 0; }));

const leading = run(
  WINDOW.slice(0, 9)
    .map(function (date) { return line(date, "A", 0); })
    .concat(WINDOW.slice(9).map(function (date) { return line(date, "A", 6); }))
);
assert.strictEqual(leading.ok, true, JSON.stringify(leading.errors));
const leadingRow = skuOf(leading, "A");
assert.strictEqual(leadingRow.weeksUsed, 3);
assert.strictEqual(leadingRow.firstSaleWeek, "2026-03-16");
assertQty(leadingRow, "6.00");
assert.deepStrictEqual(leadingRow.flags, ["Short history: 3 weeks"]);

const short = run(anchor.concat([line(WINDOW[9], "A", 9), line(WINDOW[11], "A", 6)]));
assert.strictEqual(short.ok, true);
const shortRow = skuOf(short, "A");
assert.strictEqual(shortRow.weeksUsed, 3);
assertQty(shortRow, "5.00");
assert.deepStrictEqual(shortRow.flags, ["Short history: 3 weeks"]);

const returned = run(
  WINDOW.map(function (date) { return line(date, "A", 8); }).concat([line(WINDOW[11], "A", -2)])
);
assert.strictEqual(returned.ok, true);
assert.strictEqual(skuOf(returned, "A").weeksUsed, 12);
assertQty(skuOf(returned, "A"), "7.83");

const sameWeek = run(anchor.concat([line(WINDOW[0], "A", 10), line(WINDOW[0], "A", -4)]));
assert.strictEqual(sameWeek.ok, true);
assert.strictEqual(skuOf(sameWeek, "A").weeksUsed, 12);
assertQty(skuOf(sameWeek, "A"), "0.50");

const negative = run(anchor.concat([line(WINDOW[0], "A", 5), line(WINDOW[1], "A", -20)]));
assert.strictEqual(negative.ok, true);
const negativeRow = skuOf(negative, "A");
assert.strictEqual(negativeRow.weeksUsed, 12);
assertQty(negativeRow, "0.00");
assert.deepStrictEqual(negativeRow.flags, ["Negative set to 0"]);
assert.ok(negative.forecastCsv.includes(",0.00,"));

const rounded = run(anchor.concat([line(WINDOW[0], "A", 5)]));
assertQty(skuOf(rounded, "A"), "0.42");

const early = run(
  anchor.concat([line("2025-06-02", "A", 100)].concat(WINDOW.map(function (date) { return line(date, "A", 10); })))
);
assert.strictEqual(early.ok, true);
const earlyRow = skuOf(early, "A");
assert.strictEqual(earlyRow.weeksUsed, 12);
assertQty(earlyRow, "10.00");
assert.strictEqual(earlyRow.firstSaleWeek, "2025-06-02");
assert.deepStrictEqual(earlyRow.flags, []);
const oldRow = skuOf(early, "OLD");
assert.strictEqual(oldRow.weeksUsed, 12);
assertQty(oldRow, "0.00");
assert.ok(oldRow.flags.indexOf("No sales") !== -1);
assert.ok(oldRow.flags.indexOf("No sales in window") === -1);
assert.ok(oldRow.flags.indexOf("History may be longer than this file shows") !== -1);

const dayLine = run([line("03/04/2026", "A", 12)]);
assert.strictEqual(dayLine.ok, true, JSON.stringify(dayLine.errors));
assert.strictEqual(
  dayLine.dateLine,
  "Dates read as Day/Month/Year: first date 03/04/2026 read as 3 April 2026."
);
assert.strictEqual(skuOf(dayLine, "A").firstSaleWeek, "2026-03-30");
assert.strictEqual(skuOf(dayLine, "A").weeksUsed, 1);
assertQty(skuOf(dayLine, "A"), "12.00");

const monthLine = run([line("03/04/2026", "A", 12)], { dayFirst: false });
assert.strictEqual(monthLine.ok, true, JSON.stringify(monthLine.errors));
assert.strictEqual(
  monthLine.dateLine,
  "Dates read as Month/Day/Year: first date 03/04/2026 read as 4 March 2026."
);
assert.strictEqual(skuOf(monthLine, "A").firstSaleWeek, "2026-03-02");
assert.strictEqual(skuOf(monthLine, "A").weeksUsed, 5);
assertQty(skuOf(monthLine, "A"), "2.40");

const isoEither = run([line("2026-04-03", "A", 12)], { dayFirst: false });
assert.strictEqual(isoEither.ok, true);
assert.strictEqual(skuOf(isoEither, "A").firstSaleWeek, "2026-03-30");
assertQty(skuOf(isoEither, "A"), "12.00");
assert.strictEqual(engine.formatISO(engine.parseOrderDate("2026-04-03", true).date), "2026-04-03");
assert.strictEqual(engine.formatISO(engine.parseOrderDate("2026-04-03", false).date), "2026-04-03");
assert.strictEqual(engine.formatISO(engine.parseOrderDate("03/04/2026", true).date), "2026-04-03");
assert.strictEqual(engine.formatISO(engine.parseOrderDate("03/04/2026", false).date), "2026-03-04");
assert.strictEqual(engine.parseOrderDate("13/04/2026", false).ok, false);
assert.strictEqual(engine.parseOrderDate("44927", true).reason, "excel");

const timed = run([line("03/04/2026 09:15:00", "A", 12)]);
assert.strictEqual(
  timed.dateLine,
  "Dates read as Day/Month/Year: first date 03/04/2026 read as 3 April 2026."
);

const header = run([line(WINDOW[11], "A", 12)]);
assert.strictEqual(header.forecastCsv.charCodeAt(0), 0xfeff);
const forecastLines = header.forecastCsv.replace(/^\uFEFF/, "").trim().split("\n");
assert.strictEqual(forecastLines[0], "SKU,Forecast Qty,Week Starting Date");
forecastLines.slice(1).forEach(function (row) {
  assert.strictEqual(row.split(",").length, 3, row);
});
assert.ok(!header.forecastCsv.includes("Weeks Used"));
assert.strictEqual(header.summaryCsv.charCodeAt(0), 0xfeff);
const summaryLines = header.summaryCsv.replace(/^\uFEFF/, "").trim().split("\n");
assert.strictEqual(
  summaryLines[0],
  "SKU,Weekly Forecast,Weeks Used,First Sale Week,Locations,Flags"
);
assert.strictEqual(summaryLines.length, 2);
assert.ok(summaryLines[1].indexOf(",1,") !== -1);
assert.strictEqual(header.forecastFileName, "Forecast_starter_2026-04-06.csv");
assert.strictEqual(header.summaryFileName, "Starter_Forecast_summary_2026-04-06.csv");

const wednesday = run([line(WINDOW[11], "A", 4)], { planStart: "2026-04-08", horizon: 2 });
assert.strictEqual(wednesday.ok, true);
assert.deepStrictEqual(wednesday.weekDates, ["2026-04-06", "2026-04-13"]);
assert.strictEqual(wednesday.forecastRows.length, 2);

const codes = run([line(WINDOW[11], "00123", 12), line(WINDOW[11], "123", 3)]);
assert.strictEqual(codes.ok, true);
assertQty(skuOf(codes, "00123"), "12.00");
assertQty(skuOf(codes, "123"), "3.00");
const codeLines = codes.forecastCsv.replace(/^\uFEFF/, "").trim().split("\n").slice(1);
assert.strictEqual(codeLines.filter(function (row) { return row.indexOf("00123,") === 0; }).length, 13);
assert.strictEqual(codeLines.filter(function (row) { return row.indexOf("123,") === 0; }).length, 13);
assert.ok(codes.warnings.some(function (warning) { return warning.indexOf("00123") !== -1; }));

const spaced = run([line(WINDOW[11], " 123", 4)]);
assert.strictEqual(spaced.ok, true);
assert.strictEqual(skuOf(spaced, " 123").sku, " 123");
assert.ok(spaced.summaryCsv.indexOf("\" 123\"") !== -1);
assert.ok(spaced.warnings.some(function (warning) { return warning.indexOf("space") !== -1; }));

const places = run([
  line(WINDOW[11], "A", 4, "North"),
  line(WINDOW[11], "A", 6, "South"),
]);
assert.strictEqual(places.ok, true);
const placeRow = skuOf(places, "A");
assert.strictEqual(placeRow.locations, 2);
assertQty(placeRow, "10.00");
assert.strictEqual(placeRow.weeksUsed, 1);
assert.strictEqual(places.locationCount, 2);
assert.match(places.locationNote, /2 locations/);

const renamed = run([], {
  text: "Order ID,Order Datetime,SKU,Qty,Fulfillment Location\n1,2026-03-30,A,12,North\n",
});
assert.strictEqual(renamed.ok, true, JSON.stringify(renamed.errors));
assertQty(skuOf(renamed, "A"), "12.00");

const missingQty = run([], { text: "order_id,order_datetime,sku,fulfillment_location\n1,2026-03-30,A,North\n" });
assert.strictEqual(missingQty.ok, false);
assert.match(missingQty.errors[0], /`qty`/);
assert.match(missingQty.errors[0], /order_id, order_datetime, sku, qty, fulfillment_location/);
assert.match(missingQty.errors[0], /Download the template/);

const missingTwo = run([], { text: "order_id,order_datetime,fulfillment_location\n1,2026-03-30,North\n" });
assert.match(missingTwo.errors[0], /`sku` and `qty`/);

const excelFile = run([line("44927", "A", 4), line(WINDOW[11], "B", 4)]);
assert.strictEqual(excelFile.ok, true);
assert.ok(excelFile.warnings.some(function (warning) { return warning.indexOf("Excel date number") !== -1; }));
assert.strictEqual(excelFile.skus.length, 1);

const blankSku = run(["1," + WINDOW[11] + ",,4,Main", line(WINDOW[11], "A", 4)]);
assert.strictEqual(blankSku.ok, true);
assert.ok(blankSku.warnings.some(function (warning) { return warning.indexOf("blank") !== -1; }));

const badQty = run(["1," + WINDOW[11] + ",A,ten,Main", line(WINDOW[11], "B", 4)]);
assert.strictEqual(badQty.ok, true);
assert.ok(badQty.warnings.some(function (warning) { return warning.indexOf("not a number") !== -1; }));

const thousands = run([
  "1," + WINDOW[11] + ',A,"1,200",Main',
  "1," + WINDOW[11] + ',B,"2,500.50",Main',
]);
assert.strictEqual(thousands.ok, true, JSON.stringify(thousands.warnings));
assertQty(skuOf(thousands, "A"), "1200.00");
assertQty(skuOf(thousands, "B"), "2500.50");
const badThousands = run(["1," + WINDOW[11] + ',A,"1,00",Main', line(WINDOW[11], "B", 4)]);
assert.strictEqual(badThousands.ok, true);
assert.ok(badThousands.warnings.some(function (warning) {
  return warning.indexOf("not a number") !== -1 && warning.indexOf("thousands separator") !== -1;
}));
assert.strictEqual(badThousands.skus.length, 1);
const unquotedQty = run(["1," + WINDOW[11] + ",A,1,000,Main", line(WINDOW[11], "B", 4)]);
assert.strictEqual(unquotedQty.ok, true, JSON.stringify(unquotedQty.errors));
assert.strictEqual(unquotedQty.skus.length, 1);
assert.strictEqual(skuOf(unquotedQty, "B").sku, "B");
assert.ok(unquotedQty.skus.every(function (row) { return row.sku !== "A"; }));
assert.ok(unquotedQty.warnings.some(function (warning) {
  return warning.indexOf("row 2") !== -1 && warning.indexOf("1,000 must be in quotes") !== -1;
}));
const mostlyUnquoted = run([
  "1," + WINDOW[11] + ",A,1,000,Main",
  "1," + WINDOW[11] + ",B,2,000,Main",
  line(WINDOW[11], "C", 4),
]);
assert.strictEqual(mostlyUnquoted.ok, false);
assert.match(mostlyUnquoted.errors[0], /1,000 must be in quotes/);
assert.strictEqual(mostlyUnquoted.forecastCsv, "");

const future = run([line("2026-03-30", "A", 99), line(WINDOW[0], "A", 10)], { today: "2026-03-01" });
assert.strictEqual(future.ok, true);
assert.ok(future.warnings.some(function (warning) { return warning.indexOf("after today") !== -1; }));
assertQty(skuOf(future, "A"), "0.83");

const later = run([line("2026-04-06", "A", 1000), line(WINDOW[11], "A", 12)]);
assert.strictEqual(later.ok, true);
assertQty(skuOf(later, "A"), "12.00");
assert.ok(later.notes.some(function (note) { return note.indexOf("plan start week") !== -1; }));

const noWindow = run([line("2025-05-05", "A", 20)]);
assert.strictEqual(noWindow.ok, false);
assert.match(noWindow.errors[0], /12 weeks/);

const badSetting = run([line("13/04/2026", "A", 4)], { dayFirst: false });
assert.strictEqual(badSetting.ok, false);
assert.strictEqual(
  badSetting.errors[0],
  "Row 2: 13/04/2026 does not fit Month/Day/Year. Switch to Day/Month/Year."
);
assert.match(badSetting.dateLine, /first date 13\/04\/2026 read as 13 April 2026/);

const impossible = run([line("2026-03-30", "KEEP", 4), line("10/13/2026", "STOP", 4)]);
assert.strictEqual(impossible.ok, false);
assert.strictEqual(impossible.forecastCsv, "");
assert.strictEqual(impossible.skus.length, 0);
assert.strictEqual(
  impossible.errors[0],
  "Row 3: 10/13/2026 does not fit Day/Month/Year. Switch to Month/Day/Year."
);
assert.strictEqual(
  impossible.dateLine,
  "Dates read as Day/Month/Year: first date 2026-03-30 read as 30 March 2026."
);

const impossibleFirst = run([line("10/13/2026", "A", 4)]);
assert.strictEqual(impossibleFirst.ok, false);
assert.strictEqual(
  impossibleFirst.errors[0],
  "Row 2: 10/13/2026 does not fit Day/Month/Year. Switch to Month/Day/Year."
);
assert.strictEqual(
  impossibleFirst.dateLine,
  "Dates read as Day/Month/Year: first date 10/13/2026 read as 13 October 2026 under Month/Day/Year."
);

const shortYear = run([line("10/13/26", "A", 4)]);
assert.strictEqual(shortYear.ok, false);
assert.match(shortYear.errors[0], /Row 2: 10\/13\/26 uses a 2-digit year/);
assert.match(shortYear.errors[0], /2026/);
assert.strictEqual(shortYear.forecastCsv, "");

const gapWeeks = run([line("2026-01-12", "EARLY", 4), line("2026-01-26", "LATE", 4)]);
assert.strictEqual(gapWeeks.ok, true, JSON.stringify(gapWeeks.errors));
assert.ok(skuOf(gapWeeks, "EARLY").flags.indexOf("History may be longer than this file shows") !== -1);
assert.ok(skuOf(gapWeeks, "LATE").flags.indexOf("History may be longer than this file shows") === -1);

function warnsOtherWay(result) {
  return (result.warnings || []).some(function (warning) {
    return warning.indexOf("other way") !== -1;
  });
}

const isoOnly = run([line("2026-03-30", "A", 4), line("2026-03-16", "A", 4)]);
assert.strictEqual(isoOnly.ok, true, JSON.stringify(isoOnly.errors));
assert.strictEqual(warnsOtherWay(isoOnly), false);

const isoAndAmbiguous = run([line("2026-03-30", "A", 4), line("03/04/2026", "B", 4)]);
assert.strictEqual(isoAndAmbiguous.ok, true, JSON.stringify(isoAndAmbiguous.errors));
assert.strictEqual(warnsOtherWay(isoAndAmbiguous), true);

const isoAndClear = run([line("2026-03-30", "A", 4), line("13/04/2026", "B", 4)]);
assert.strictEqual(isoAndClear.ok, true, JSON.stringify(isoAndClear.errors));
assert.strictEqual(warnsOtherWay(isoAndClear), false);

const stopAndAmbiguous = run([line("03/04/2026", "A", 4), line("10/13/2026", "B", 4)]);
assert.strictEqual(stopAndAmbiguous.ok, false);
assert.strictEqual(warnsOtherWay(stopAndAmbiguous), false);
assert.match(stopAndAmbiguous.dateLine, /first date 03\/04\/2026 read as 3 April 2026/);

const manyStops = [];
for (let i = 0; i < 12; i += 1) {
  manyStops.push(line("10/13/2026", "S" + i, 1));
}
const listedStops = run(manyStops);
assert.strictEqual(listedStops.ok, false);
assert.strictEqual(listedStops.errors.length, 11);
assert.match(listedStops.errors[0], /Row 2: 10\/13\/2026 does not fit Day\/Month\/Year/);
assert.strictEqual(listedStops.errors[10], "and 2 more");

const semicolons = run([], {
  text: "order_id;order_datetime;sku;qty;fulfillment_location\n1;2026-03-30;A;4;Main\n",
});
assert.strictEqual(semicolons.ok, false);
assert.deepStrictEqual(semicolons.errors, [
  "This file uses semicolons. Save it as a comma-separated CSV and try again.",
]);
assert.doesNotMatch(semicolons.errors.join(" "), /couldn.t find|not found/i);

const notCsv = run([line(WINDOW[11], "A", 1)], { fileName: "history.xlsx" });
assert.strictEqual(notCsv.ok, false);
assert.match(notCsv.errors[0], /CSV UTF-8/);

const tooBig = run([line(WINDOW[11], "A", 1)], { byteLength: 10 * 1024 * 1024 + 1 });
assert.strictEqual(tooBig.ok, false);
assert.match(tooBig.errors[0], /10 MB/);

const tooManySkus = [];
for (let i = 0; i < 5001; i += 1) {
  tooManySkus.push(line(WINDOW[11], "SKU-" + i, 1));
}
const skuLimit = run(tooManySkus);
assert.strictEqual(skuLimit.ok, false);
assert.match(skuLimit.errors[0], /5,000 SKUs/);

const manyRows = [HEADER];
for (let i = 0; i < 200001; i += 1) {
  manyRows.push("1," + WINDOW[11] + ",A,1,Main");
}
const rowLimit = run([], { text: manyRows.join("\n") });
assert.strictEqual(rowLimit.ok, false);
assert.match(rowLimit.errors[0], /200,000/);

const ordered = run([line(WINDOW[1], "b", 2), line(WINDOW[0], "a", 3)], { horizon: 2 });
assert.strictEqual(ordered.ok, true);
assert.deepStrictEqual(
  ordered.forecastRows.map(function (row) { return row.sku + " " + row.week; }),
  ["a 2026-04-06", "a 2026-04-13", "b 2026-04-06", "b 2026-04-13"]
);

const quoted = run([], { text: HEADER + "\n1," + WINDOW[11] + ",\"A,B\",4,Main\n" });
assert.strictEqual(quoted.ok, true);
assert.ok(quoted.forecastCsv.indexOf("\"A,B\"") !== -1);

const badHorizon = run([line(WINDOW[11], "A", 1)], { horizon: 0 });
assert.strictEqual(badHorizon.ok, false);
const badHorizonHigh = run([line(WINDOW[11], "A", 1)], { horizon: 53 });
assert.strictEqual(badHorizonHigh.ok, false);

const template = fs.readFileSync(path.join(ROOT, "assets", "template_Sales_History.csv"), "utf8");
assert.match(template, /^order_id,order_datetime,sku,qty,fulfillment_location\n/);
const sample = run([], {
  text: template,
  fileName: "template_Sales_History.csv",
  planStart: "2026-10-14",
  today: "2026-10-14",
});
assert.strictEqual(sample.ok, true, JSON.stringify(sample.errors));
assert.strictEqual(skuOf(sample, "SKU-001").weeksUsed, 5);
assertQty(skuOf(sample, "SKU-001"), "3.60");
assert.strictEqual(skuOf(sample, "SKU-001").locations, 2);
assert.strictEqual(skuOf(sample, "SKU-002").weeksUsed, 3);
assertQty(skuOf(sample, "SKU-002"), "1.33");
assert.ok(skuOf(sample, "SKU-001").flags.indexOf("History may be longer than this file shows") !== -1);
assert.ok(skuOf(sample, "SKU-002").flags.indexOf("History may be longer than this file shows") === -1);

if (!fs.existsSync(PAGE)) {
  console.error("Built Starter Forecast page is missing. Run `npm run build` first.");
  process.exit(1);
}

function assertByteCopy(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath));
  const built = fs.readFileSync(path.join(SITE, relativePath));
  assert.ok(source.equals(built), relativePath + " in _site must be a byte copy of the source file");
}

assertByteCopy("assets/starter-forecast-engine.js");
assertByteCopy("assets/starter-forecast.js");
assertByteCopy("assets/template_Sales_History.csv");

const page = fs.readFileSync(PAGE, "utf8");
const sourcePage = fs.readFileSync(path.join(ROOT, "src", "learn", "starter-forecast.njk"), "utf8");
const ui = fs.readFileSync(path.join(ROOT, "assets", "starter-forecast.js"), "utf8");
const privacy = fs.readFileSync(path.join(ROOT, "src", "privacy.njk"), "utf8");

assert.match(page, /<h1 class="page-title">Starter Forecast<\/h1>/);
assert.match(page, /What a 12-week average can't do/);
assert.match(page, /Weeks Used/);
assert.match(page, /processed in this browser and is never sent/);
assert.match(page, /href="\/assets\/template_Sales_History\.csv"/);
assert.match(page, /download="template_Sales_History\.csv"/);
assert.match(page, /id="sf-downloads" hidden/);
assert.match(page, /id="sf-results" hidden/);
assert.match(page, /name="articles"/);
assert.doesNotMatch(page, /name="articles"[^>]*checked/);
assert.match(page, /src="\/assets\/starter-forecast-engine\.js\?v=5"/);
assert.match(page, /A quantity such as "1,000" in quotes is read as 1000/);
assert.match(page, /A full stop is only for decimals/);
assert.match(page, /src="\/assets\/sim-results-form\.js\?v=7"/);
assert.match(page, /src="\/assets\/starter-forecast\.js\?v=3"/);
assert.match(page, /Email me to unlock the download/);
assert.doesNotMatch(page, /results of the scenario/);
assert.match(ui, /Email me to unlock the download/);
assert.doesNotMatch(ui, /results of the scenario/);
assert.match(ui, /\/learn\/starter-forecast\/sent\//);
const sentPage = fs.readFileSync(
  path.join(SITE, "learn", "starter-forecast", "sent", "index.html"),
  "utf8"
);
assert.match(sentPage, /noindex/);
assert.match(sentPage, /The download is unlocked on the Starter Forecast page/);
assert.doesNotMatch(sentPage, /results of the scenario/);
assert.ok(!fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8").includes("/learn/starter-forecast/sent/"));
assert.doesNotMatch(sourcePage, /coming soon|ERP|Demand Planner|Stock Planner/i);
assert.doesNotMatch(ui, /coming soon|ERP|Demand Planner|Stock Planner/i);
assert.match(ui, /formId:\s*"starter-forecast"/);
assert.match(ui, /onSent/);
assert.match(ui, /kind:\s*"starter-forecast"/);
assert.doesNotMatch(ui, /articles\.checked/);
assert.match(privacy, /processed in the browser and is never sent/);
assert.match(
  fs.readFileSync(path.join(ROOT, "src", "_data", "learnTools.js"), "utf8"),
  /\/learn\/starter-forecast\//
);

function element(value) {
  return {
    hidden: false,
    textContent: "",
    innerHTML: "",
    value: value == null ? "" : value,
    files: [],
    listeners: {},
    addEventListener: function (type, fn) {
      this.listeners[type] = fn;
    },
  };
}

function settingsChangeKeepsDownload() {
  const uiSource = fs.readFileSync(path.join(ROOT, "assets", "starter-forecast.js"), "utf8");
  const ids = {};
  [
    "sf-errors",
    "sf-output",
    "sf-gate",
    "sf-downloads",
    "sf-date-line",
    "sf-warnings",
    "sf-output-date",
    "sf-location-note",
    "sf-notes",
    "sf-summary-body",
    "sf-preview-body",
    "sf-preview-note",
    "sf-file-name",
    "sf-download-forecast",
    "sf-download-summary",
  ].forEach(function (id) {
    ids[id] = element("");
  });
  ids["sf-date-order"] = element("dmy");
  ids["sf-plan-start"] = element("");
  ids["sf-horizon"] = element("13");
  ids["sf-file"] = element("");
  const csv = "order_id,order_datetime,sku,qty,fulfillment_location\n1,2026-03-30,A,4,Main\n";
  let shows = 0;
  let attached = null;
  const RealDate = Date;
  function FixedDate() {
    return new RealDate(2026, 9, 14, 12, 0, 0);
  }
  FixedDate.prototype = RealDate.prototype;
  FixedDate.now = function () {
    return new RealDate(2026, 9, 14, 12, 0, 0).getTime();
  };
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  function FileReader() {
    this.result = "";
  }
  FileReader.prototype.readAsText = function () {
    this.result = csv;
    this.onload();
  };
  const sandbox = {
    document: {
      getElementById: function (id) {
        return ids[id] || null;
      },
      createElement: function () {
        return element("");
      },
      body: {
        appendChild: function () {},
        removeChild: function () {},
      },
    },
    TextEncoder: TextEncoder,
    Date: FixedDate,
    FileReader: FileReader,
    URL: {
      createObjectURL: function () {
        return "blob:test";
      },
      revokeObjectURL: function () {},
    },
    Blob: function Blob() {},
    console: console,
  };
  sandbox.window = sandbox;
  sandbox.window.StarterForecast = engine;
  sandbox.window.SimResultsForm = {
    attach: function (options) {
      attached = options;
      return {
        show: function () {
          shows += 1;
        },
        hide: function () {},
      };
    },
  };
  vm.runInNewContext(uiSource, sandbox, { filename: "starter-forecast.js" });
  assert.strictEqual(attached.wordingRequired, "Email me to unlock the download.");
  assert.strictEqual(attached.wordingVersion, "starter-forecast-v1");
  assert.strictEqual(attached.sentUrl, "/learn/starter-forecast/sent/");
  assert.doesNotMatch(attached.wordingRequired, /results of the scenario/);
  ids["sf-plan-start"].value = "2026-04-06";
  ids["sf-file"].files = [{ name: "history.csv", size: csv.length }];
  ids["sf-file"].listeners.change();
  assert.strictEqual(shows, 1);
  assert.strictEqual(ids["sf-downloads"].hidden, true);
  assert.strictEqual(ids["sf-date-line"].hidden, false);
  assert.match(ids["sf-date-line"].textContent, /first date 2026-03-30 read as 30 March 2026/);
  const sentSummary = attached.buildSummary();
  assert.strictEqual(sentSummary.kind, "starter-forecast");
  assert.deepStrictEqual(Object.keys(sentSummary), ["kind"]);
  attached.onSent();
  assert.strictEqual(ids["sf-downloads"].hidden, false);
  ids["sf-horizon"].value = "8";
  ids["sf-horizon"].listeners.change();
  assert.strictEqual(ids["sf-downloads"].hidden, false);
  assert.strictEqual(shows, 1);
  ids["sf-date-order"].value = "mdy";
  ids["sf-date-order"].listeners.change();
  assert.strictEqual(ids["sf-downloads"].hidden, false);
  assert.strictEqual(shows, 1);
  ids["sf-plan-start"].value = "2026-01-05";
  ids["sf-plan-start"].listeners.change();
  assert.strictEqual(ids["sf-downloads"].hidden, true);
  assert.strictEqual(shows, 1);
  ids["sf-plan-start"].value = "2026-04-06";
  ids["sf-plan-start"].listeners.change();
  assert.strictEqual(ids["sf-downloads"].hidden, false);
  assert.strictEqual(shows, 1);
  ids["sf-file"].listeners.change();
  assert.strictEqual(ids["sf-downloads"].hidden, true);
  assert.strictEqual(shows, 2);
  attached.buildSummary();
  ids["sf-file"].listeners.change();
  assert.strictEqual(ids["sf-downloads"].hidden, true);
  attached.onSent();
  assert.strictEqual(ids["sf-downloads"].hidden, true);
}

settingsChangeKeepsDownload();

console.log("Starter Forecast checks passed.");
