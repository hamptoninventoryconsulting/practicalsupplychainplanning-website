/**
 * DIFOT Calculator checks: line scoring, tolerances, combined rows,
 * freight, dates, CSV output, and the download gate.
 */
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "_site");
const engine = require(path.join(ROOT, "assets", "difot-engine.js"));

const HEADER =
  "PO Number,Supplier,SKU,Ordered Qty,Required Date,Arrived at Your Site Date,Received Qty,Damaged Qty,Damaged Reason,Handed to Freight Date";

function poCsv(rows) {
  return [HEADER].concat(rows).join("\n");
}

function run(rows, extra) {
  const options = Object.assign(
    {
      poText: Array.isArray(rows) ? poCsv(rows) : String(rows || ""),
      poFileName: "lines.csv",
      asAt: "2026-10-14",
      dayFirst: true,
    },
    extra || {}
  );
  return engine.buildDifot(options);
}

function lineOf(result, sku) {
  return result.lines.filter(function (line) {
    return line.sku === sku;
  })[0];
}

function warns(result, pattern) {
  return (result.warnings || []).some(function (warning) {
    return pattern.test(warning);
  });
}

const worked = run([
  "A,Acme,A,100,10/03/2026,09/03/2026,100,0,,",
  "B,Acme,B,50,10/03/2026,12/03/2026,50,0,,",
  "C,Acme,C,100,10/03/2026,10/03/2026,100,10,,",
  "D,Acme,D,100,10/03/2026,07/03/2026,100,0,,",
]);
assert.strictEqual(worked.ok, true, JSON.stringify(worked.errors));
assert.strictEqual(worked.overall.onTimePct, "50.0");
assert.strictEqual(worked.overall.inFullPct, "75.0");
assert.strictEqual(worked.overall.difotPct, "25.0");
assert.strictEqual(worked.overall.onTimeLines, 2);
assert.strictEqual(worked.overall.inFullLines, 3);
assert.strictEqual(worked.overall.difotLines, 1);
assert.strictEqual(worked.overall.lines, 4);
assert.strictEqual(lineOf(worked, "A").difot, true);
assert.strictEqual(lineOf(worked, "B").reason, "Late 2 days");
assert.match(lineOf(worked, "C").reason, /Short 10 \(10%\)/);
assert.strictEqual(lineOf(worked, "D").onTime, false);
assert.strictEqual(lineOf(worked, "D").inFull, true);
assert.strictEqual(worked.summaryLine, "4 lines measured. 1 supplier. 4 purchase orders.");
assert.strictEqual(worked.counts.lines, 4);
assert.strictEqual(worked.counts.suppliers, 1);
assert.strictEqual(worked.counts.purchaseOrders, 4);
assert.strictEqual(worked.settings.filter(function (setting) {
  return setting.label === "Days early allowed";
})[0].value, "2");
assert.strictEqual(worked.settings.filter(function (setting) {
  return setting.label === "Days late allowed";
})[0].value, "0");
assert.doesNotMatch(worked.summaryCsv, /^Overall,/m);
assert.doesNotMatch(worked.summaryCsv, /^Month,/m);
assert.match(worked.summaryCsv, /Supplier,Acme,,4,2,3,1,50\.0,75\.0,25\.0/);
assert.match(worked.summaryCsv, /Supplier-Month,Acme,2026-03,4,2,3,1,50\.0,75\.0,25\.0/);
assert.match(worked.dateLine, /First date 10\/03\/2026 read as 10 March 2026/);

const earlyEdge = run(
  ["1,Acme,PASS,10,2026-03-10,2026-03-08,10,,,", "2,Acme,FAIL,10,2026-03-10,2026-03-07,10,,,"],
  { daysEarly: 2 }
);
assert.strictEqual(lineOf(earlyEdge, "PASS").onTime, true);
assert.strictEqual(lineOf(earlyEdge, "FAIL").onTime, false);
assert.match(lineOf(earlyEdge, "FAIL").reason, /Early 3 days/);

const lateEdge = run(["1,Acme,A,10,2026-03-10,2026-03-11,10,,,"], { daysLate: 1 });
assert.strictEqual(lateEdge.lines[0].onTime, true);
assert.strictEqual(lateEdge.lines[0].difot, true);

const shortfall = run(
  ["1,Acme,PASS,100,2026-03-10,2026-03-10,95,,,", "2,Acme,FAIL,100,2026-03-10,2026-03-10,94,,,"],
  { shortfallPct: 5 }
);
assert.strictEqual(lineOf(shortfall, "PASS").inFull, true);
assert.strictEqual(lineOf(shortfall, "FAIL").inFull, false);
assert.match(lineOf(shortfall, "FAIL").reason, /Short 6 \(6%\)/);

const overNo = run(["1,Acme,A,100,2026-03-10,2026-03-10,110,,,"], { overDeliveryInFull: false });
assert.strictEqual(overNo.lines[0].inFull, false);
assert.strictEqual(overNo.lines[0].reason, "Over 10");
const overYes = run(["1,Acme,A,100,2026-03-10,2026-03-10,110,,,"], { overDeliveryInFull: true });
assert.strictEqual(overYes.lines[0].inFull, true);
assert.strictEqual(overYes.lines[0].difot, true);

const damaged = run(["1,Acme,A,100,2026-03-10,2026-03-10,100,10,Crushed,"]);
assert.strictEqual(damaged.lines[0].accepted, 90);
assert.strictEqual(damaged.lines[0].inFull, false);
assert.match(damaged.lines[0].reason, /Short 10 \(10%\)/);
assert.match(damaged.lines[0].reason, /Damaged 10 \(Crushed\)/);
const damagedOver = run(["1,Acme,A,100,2026-03-10,2026-03-10,10,11,,"]);
assert.strictEqual(damagedOver.ok, false);
assert.match(damagedOver.errors.join(" "), /No usable purchase order lines/);
assert.ok(warns(damagedOver, /Row 2 was left out because the damaged quantity is greater than the received quantity/));

const notDue = run(["1,Acme,LATE,10,2026-03-01,,,,,", "2,Acme,WAIT,10,2026-03-20,,,,,"], { asAt: "2026-03-10" });
assert.strictEqual(notDue.ok, true, JSON.stringify(notDue.errors));
assert.strictEqual(notDue.overall.lines, 1);
assert.strictEqual(lineOf(notDue, "LATE").countedText, "Y");
assert.strictEqual(lineOf(notDue, "LATE").onTime, false);
assert.strictEqual(lineOf(notDue, "LATE").inFull, false);
assert.strictEqual(lineOf(notDue, "LATE").reason, "Not received");
assert.strictEqual(lineOf(notDue, "WAIT").countedText, "N: not due yet");
assert.match(notDue.notes.join(" "), /1 line not due yet/);
const nowDue = run(["1,Acme,WAIT,10,2026-03-20,,,,,"], { asAt: "2026-03-21" });
assert.strictEqual(nowDue.overall.lines, 1);
assert.strictEqual(nowDue.lines[0].reason, "Not received");
const stillInside = run(["1,Acme,WAIT,10,2026-03-10,,,,,"], { asAt: "2026-03-11", daysLate: 1 });
assert.strictEqual(stillInside.ok, false);
assert.match(stillInside.errors[0], /No lines are measured/);
assert.match(stillInside.errors[0], /1 line not due yet/);

const repeated = run([
  "1001,Acme,00123,100,2026-03-10,2026-03-09,40,,,",
  "1001,Acme,00123,80,2026-03-10,,,,,",
  "1001,Acme,00123,100,2026-03-10,2026-03-12,60,,,",
]);
assert.strictEqual(repeated.lines.length, 1);
assert.strictEqual(repeated.lines[0].ordered, 100);
assert.strictEqual(repeated.lines[0].received, 100);
assert.strictEqual(repeated.lines[0].rowsCombined, 3);
assert.strictEqual(engine.formatISO(repeated.lines[0].onTimeDate), "2026-03-12");
assert.strictEqual(repeated.lines[0].onTime, false);
assert.ok(warns(repeated, /PO 1001, SKU 00123 appears 3 times/));
assert.ok(warns(repeated, /Rows were combined/));
assert.ok(warns(repeated, /different ordered quantities \(80 and 100\)/));
assert.ok(warns(repeated, /The largest, 100, was used/));
assert.match(repeated.linesCsv, /Rows Combined/);
assert.match(repeated.linesCsv, /,3,/);

const pooled = run([
  "1,Alpha,A,10,2026-03-10,2026-03-10,10,,,",
  "2,Alpha,B,10,2026-03-10,2026-03-10,10,,,",
  "3,Alpha,C,10,2026-03-10,2026-03-10,10,,,",
  "4,Beta,D,10,2026-03-10,2026-03-20,10,,,",
]);
assert.strictEqual(pooled.overall.difotPct, "75.0");
assert.strictEqual(pooled.overall.difotLines, 3);
assert.strictEqual(pooled.overall.lines, 4);
assert.notStrictEqual((100 + 0) / 2, 75);
assert.strictEqual(pooled.suppliers[0].supplier, "Beta");
assert.strictEqual(pooled.suppliers[0].difotPct, "0.0");
assert.strictEqual(pooled.suppliers[1].supplier, "Alpha");
assert.strictEqual(pooled.suppliers[1].difotPct, "100.0");
assert.deepStrictEqual(
  pooled.allMonths.map(function (month) {
    return month.month;
  }),
  ["2026-03"]
);
const months = run([
  "1,Alpha,A,10,2026-03-10,2026-03-10,10,,,",
  "2,Alpha,B,10,2026-04-02,2026-04-02,10,,,",
]);
assert.deepStrictEqual(
  months.allMonths.map(function (month) {
    return month.month + ":" + month.lines;
  }),
  ["2026-03:1", "2026-04:1"]
);
assert.strictEqual(months.monthNote, "");
assert.doesNotMatch(months.notes.join(" "), /older month/);
function monthRowsFor(supplier, count, year, month) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(year, month - 1 + i, 10));
    const iso = date.toISOString().slice(0, 10);
    rows.push("PO" + i + "," + supplier + ",SKU" + i + ",10," + iso + "," + iso + ",10,,,");
  }
  return rows;
}
const manyMonths = run(monthRowsFor("Alpha", 25, 2024, 1).concat(monthRowsFor("Beta", 26, 2024, 1)), {
  asAt: "2026-10-14",
});
assert.strictEqual(manyMonths.ok, true, JSON.stringify(manyMonths.errors));
function shownMonths(result, supplier) {
  return result.supplierMonths.filter(function (group) {
    return group.supplier === supplier;
  })[0].months;
}
assert.strictEqual(shownMonths(manyMonths, "Alpha").length, 24);
assert.strictEqual(shownMonths(manyMonths, "Alpha")[0].month, "2024-02");
assert.strictEqual(shownMonths(manyMonths, "Alpha")[23].month, "2026-01");
assert.strictEqual(shownMonths(manyMonths, "Beta").length, 24);
assert.strictEqual(shownMonths(manyMonths, "Beta")[0].month, "2024-03");
assert.strictEqual(shownMonths(manyMonths, "Beta")[23].month, "2026-02");
assert.strictEqual(
  manyMonths.monthNote,
  "Alpha has 1 older month and Beta has 2 older months in the summary CSV. The latest 24 months are shown here."
);
assert.doesNotMatch(manyMonths.notes.join(" "), /older month/);
assert.match(manyMonths.summaryCsv, /Supplier-Month,Alpha,2024-01,/);
assert.match(manyMonths.summaryCsv, /Supplier-Month,Beta,2024-01,/);
const exactMonths = run(monthRowsFor("Alpha", 24, 2024, 1), { asAt: "2026-10-14" });
assert.strictEqual(exactMonths.monthNote, "");
assert.strictEqual(shownMonths(exactMonths, "Alpha").length, 24);
assert.strictEqual(shownMonths(exactMonths, "Alpha")[0].month, "2024-01");
const ranged = run(
  ["1,Alpha,IN,10,2026-03-10,2026-03-10,10,,,", "2,Alpha,OUT,10,2026-01-10,2026-01-10,10,,,"],
  { measureFrom: "2026-03-01", measureTo: "2026-03-31" }
);
assert.strictEqual(ranged.overall.lines, 1);
assert.strictEqual(ranged.counts.lines, 1);
assert.strictEqual(ranged.counts.purchaseOrders, 1);
assert.strictEqual(lineOf(ranged, "OUT").countedText, "N: outside the measure range");
assert.strictEqual(ranged.settings.filter(function (setting) {
  return setting.label === "Measure from";
})[0].value, "2026-03-01");
assert.strictEqual(ranged.settings.filter(function (setting) {
  return setting.label === "Measure to";
})[0].value, "2026-03-31");

const suppliers = [
  "Supplier,Freight arranged by,Expected transit days",
  "Shenzhen Widgets,Me,35",
  "Acme Packaging,Supplier,",
].join("\n");
const freight = run(
  [
    "1,Shenzhen Widgets,ON,10,2026-03-10,2026-04-10,10,,,2026-03-10",
    "2,Shenzhen Widgets,LATEF,10,2026-03-10,2026-06-01,10,,,2026-03-10",
    "3,Shenzhen Widgets,NONE,10,2026-03-10,,10,,,2026-03-10",
  ],
  { supplierText: suppliers, supplierFileName: "suppliers.csv" }
);
assert.strictEqual(freight.ok, true, JSON.stringify(freight.errors));
assert.strictEqual(freight.suppliers.length, 1);
assert.strictEqual(freight.suppliers[0].difotPct, "100.0");
assert.strictEqual(freight.suppliers[0].freight, "I arrange freight");
assert.strictEqual(lineOf(freight, "LATEF").difot, true);
assert.strictEqual(lineOf(freight, "LATEF").freightOnTime, "N");
assert.strictEqual(lineOf(freight, "ON").freightOnTime, "Y");
assert.strictEqual(freight.freight[0].measurable, 2);
assert.strictEqual(freight.freight[0].onTimePct, "50.0");
assert.match(freight.freight[0].note, /1 line not measurable/);
assert.match(freight.notes.join(" "), /does not change a supplier's DIFOT/);
assert.match(freight.summaryCsv, /Supplier,Shenzhen Widgets,,3,/);
assert.match(freight.summaryCsv, /Supplier-Month,Shenzhen Widgets,2026-03,/);
assert.doesNotMatch(freight.summaryCsv, /^Freight,/m);
assert.doesNotMatch(freight.summaryCsv, /^Overall,/m);
assert.match(freight.notes.join(" "), /1 supplier in the supplier list is not in the PO file/);
assert.strictEqual(lineOf(freight, "NONE").difot, true);
assert.strictEqual(lineOf(freight, "NONE").freightOnTime, "");
assert.strictEqual(lineOf(freight, "ON").transit, 31);

const ignoredHanded = run(["1,Acme,A,10,2026-03-10,2026-03-10,10,,,2026-03-01"]);
assert.strictEqual(ignoredHanded.ok, true, JSON.stringify(ignoredHanded.errors));
assert.strictEqual(ignoredHanded.lines[0].difot, true);
assert.strictEqual(engine.formatISO(ignoredHanded.lines[0].onTimeDate), "2026-03-10");
assert.strictEqual(engine.formatISO(ignoredHanded.lines[0].handed), "2026-03-01");
assert.match(ignoredHanded.notes.join(" "), /Handed to Freight Date was filled in for Acme/);
assert.match(ignoredHanded.notes.join(" "), /was not used/);
assert.match(ignoredHanded.notes.join(" "), /Arrived at Your Site Date/);
assert.strictEqual(ignoredHanded.freight.length, 0);
assert.strictEqual(warns(ignoredHanded, /left out/), false);

const blankHanded = run(
  [
    "1,Shenzhen Widgets,KEEP,10,2026-03-10,2026-04-01,10,,,2026-03-10",
    "2,Shenzhen Widgets,SKIP,10,2026-03-10,2026-03-12,10,,,",
    "3,Shenzhen Widgets,WAIT,10,2026-03-20,,,,,",
  ],
  {
    supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
    supplierFileName: "suppliers.csv",
    asAt: "2026-03-10",
  }
);
assert.strictEqual(blankHanded.ok, true, JSON.stringify(blankHanded.errors) + JSON.stringify(blankHanded.warnings));
assert.strictEqual(blankHanded.lines.length, 2);
assert.strictEqual(lineOf(blankHanded, "KEEP").difot, true);
assert.strictEqual(engine.formatISO(lineOf(blankHanded, "KEEP").arrivedSite), "2026-04-01");
assert.strictEqual(lineOf(blankHanded, "KEEP").transit, null);
assert.ok(warns(blankHanded, /after the as-at date and was not used for the freight figures/));
assert.strictEqual(lineOf(blankHanded, "SKIP"), undefined);
assert.strictEqual(lineOf(blankHanded, "WAIT").countedText, "N: not due yet");
assert.ok(warns(blankHanded, /Row 3 was left out because Handed to Freight Date is blank/));
assert.ok(warns(blankHanded, /handed to the freight company/));

const blankRows = run(
  [
    "1,Shenzhen Widgets,G0,10,2026-03-10,2026-03-10,10,,,",
    "2,Shenzhen Widgets,G1,10,2026-03-10,2026-03-10,10,,,",
    "3,Shenzhen Widgets,OK,10,2026-03-10,2026-03-20,10,,,2026-03-10",
  ],
  {
    supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
    supplierFileName: "suppliers.csv",
  }
);
assert.strictEqual(blankRows.ok, true, JSON.stringify(blankRows.errors));
assert.strictEqual(blankRows.lines.length, 1);
assert.strictEqual(blankRows.lines[0].sku, "OK");
assert.ok(warns(blankRows, /Rows 2, 3 were left out because Handed to Freight Date is blank/));

const inTransitBlank = run(["1,Shenzhen Widgets,SHIP,10,2026-04-10,,,,,2026-04-12"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
  supplierFileName: "suppliers.csv",
  asAt: "2026-04-30",
});
assert.strictEqual(inTransitBlank.ok, true, JSON.stringify(inTransitBlank.errors) + JSON.stringify(inTransitBlank.warnings));
assert.strictEqual(inTransitBlank.lines[0].onTime, false);
assert.strictEqual(inTransitBlank.lines[0].inFull, true);
assert.strictEqual(inTransitBlank.lines[0].difot, false);
assert.strictEqual(inTransitBlank.lines[0].daysLate, 2);
assert.strictEqual(inTransitBlank.lines[0].received, 10);
assert.match(inTransitBlank.lines[0].reason, /Late 2 days/);
assert.match(inTransitBlank.lines[0].reason, /ordered quantity was used/);
assert.strictEqual(inTransitBlank.lines[0].transit, null);
assert.strictEqual(inTransitBlank.freight[0].note, "not measurable");
assert.match(inTransitBlank.notes.join(" "), /counted as delivered in full/);

const inTransitFull = run(["1,Shenzhen Widgets,SHIPOK,10,2026-04-10,,,,,2026-04-08"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
  supplierFileName: "suppliers.csv",
  asAt: "2026-04-30",
});
assert.strictEqual(inTransitFull.lines[0].difot, true);
assert.strictEqual(inTransitFull.lines[0].inFull, true);
assert.strictEqual(inTransitFull.lines[0].received, 10);

const explicitZero = run(["1,Shenzhen Widgets,ZERO,10,2026-04-10,,0,,,2026-04-10"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
  supplierFileName: "suppliers.csv",
  asAt: "2026-04-30",
});
assert.strictEqual(explicitZero.ok, true, JSON.stringify(explicitZero.errors) + JSON.stringify(explicitZero.warnings));
assert.strictEqual(explicitZero.lines[0].onTime, true);
assert.strictEqual(explicitZero.lines[0].inFull, false);
assert.strictEqual(explicitZero.lines[0].received, 0);
assert.match(explicitZero.lines[0].reason, /Short 10 \(100%\)/);
assert.strictEqual(explicitZero.notes.length === 0 || !/ordered quantity was counted/.test(explicitZero.notes.join(" ")), true);

const arrivedBlankQty = run(["1,Shenzhen Widgets,HERE,10,2026-04-10,2026-04-12,,,,2026-04-10"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
  supplierFileName: "suppliers.csv",
  asAt: "2026-04-30",
});
assert.strictEqual(arrivedBlankQty.ok, false);
assert.ok(
  warns(arrivedBlankQty, /Row 2 was left out because the goods are at your site and the received quantity is blank/)
);

const backwards = run(
  [
    "1,Shenzhen Widgets,BACK,10,2026-04-10,2026-04-05,10,,,2026-04-10",
    "2,Shenzhen Widgets,OKF,10,2026-04-10,2026-04-20,10,,,2026-04-10",
  ],
  {
    supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
    supplierFileName: "suppliers.csv",
    asAt: "2026-04-30",
  }
);
assert.strictEqual(backwards.ok, true, JSON.stringify(backwards.errors) + JSON.stringify(backwards.warnings));
assert.strictEqual(lineOf(backwards, "BACK").difot, true);
assert.strictEqual(lineOf(backwards, "BACK").transit, null);
assert.strictEqual(lineOf(backwards, "BACK").freightOnTime, "");
assert.strictEqual(lineOf(backwards, "OKF").transit, 10);
assert.strictEqual(lineOf(backwards, "OKF").freightOnTime, "Y");
assert.strictEqual(backwards.freight[0].measurable, 1);
assert.strictEqual(backwards.freight[0].onTimePct, "100.0");
assert.strictEqual(backwards.freight[0].averageTransit, "10.0");
assert.match(backwards.freight[0].note, /1 line not measurable/);
assert.ok(
  warns(
    backwards,
    /Row 2: Handed to Freight Date is after Arrived at Your Site Date, so the line is not in the freight figures/
  )
);

const inTransit = run(["1,Shenzhen Widgets,ROAD,10,2026-03-10,,10,,,2026-03-10"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
  supplierFileName: "suppliers.csv",
});
assert.strictEqual(inTransit.ok, true, JSON.stringify(inTransit.errors));
assert.strictEqual(inTransit.lines[0].difot, true);
assert.strictEqual(inTransit.lines[0].onTime, true);
assert.strictEqual(inTransit.lines[0].freightOnTime, "");
assert.strictEqual(inTransit.lines[0].transit, null);
assert.strictEqual(inTransit.freight[0].measurable, 0);
assert.strictEqual(inTransit.freight[0].note, "not measurable");
assert.strictEqual(inTransit.overall.difotPct, "100.0");

const splitDates = run(
  [
    "9,Shenzhen Widgets,SPLIT,100,2026-03-10,2026-03-20,60,,,2026-03-09",
    "9,Shenzhen Widgets,SPLIT,100,2026-03-10,2026-03-25,40,,,2026-03-11",
  ],
  {
    supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,20\n",
    supplierFileName: "suppliers.csv",
  }
);
assert.strictEqual(splitDates.ok, true, JSON.stringify(splitDates.errors));
assert.strictEqual(splitDates.lines.length, 1);
assert.strictEqual(splitDates.lines[0].received, 100);
assert.strictEqual(splitDates.lines[0].rowsCombined, 2);
assert.strictEqual(engine.formatISO(splitDates.lines[0].handed), "2026-03-11");
assert.strictEqual(engine.formatISO(splitDates.lines[0].arrivedSite), "2026-03-25");
assert.strictEqual(engine.formatISO(splitDates.lines[0].onTimeDate), "2026-03-11");
assert.strictEqual(splitDates.lines[0].daysLate, 1);
assert.strictEqual(splitDates.lines[0].onTime, false);
assert.strictEqual(splitDates.lines[0].transit, 14);
assert.strictEqual(splitDates.lines[0].freightOnTime, "Y");

const splitRemainder = run(
  [
    "1,Shenzhen Widgets,PART,10,2026-04-05,2026-04-11,4,,,2026-04-01",
    "1,Shenzhen Widgets,PART,10,2026-04-05,,,,,2026-04-05",
  ],
  {
    supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
    supplierFileName: "suppliers.csv",
    asAt: "2026-04-30",
  }
);
assert.strictEqual(splitRemainder.ok, true, JSON.stringify(splitRemainder.errors) + JSON.stringify(splitRemainder.warnings));
assert.strictEqual(splitRemainder.lines.length, 1);
assert.strictEqual(splitRemainder.lines[0].received, 10);
assert.strictEqual(splitRemainder.lines[0].inFull, true);
assert.strictEqual(splitRemainder.lines[0].onTime, true);
assert.strictEqual(splitRemainder.lines[0].difot, true);
assert.strictEqual(splitRemainder.lines[0].transit, 10);
assert.strictEqual(splitRemainder.lines[0].freightOnTime, "Y");
assert.strictEqual(engine.formatISO(splitRemainder.lines[0].handed), "2026-04-05");
assert.strictEqual(engine.formatISO(splitRemainder.lines[0].onTimeDate), "2026-04-05");
assert.match(splitRemainder.lines[0].reason, /rest of the ordered quantity/);
assert.match(splitRemainder.notes.join(" "), /another handover with no quantity yet/);
assert.match(splitRemainder.notes.join(" "), /Freight days use only the rows that have arrived/);
assert.strictEqual(warns(splitRemainder, /Handed to Freight Date is after/), false);

const splitRemainderLate = run(
  [
    "1,Shenzhen Widgets,PARTL,10,2026-04-05,2026-04-11,4,,,2026-04-01",
    "1,Shenzhen Widgets,PARTL,10,2026-04-05,,,,,2026-04-15",
  ],
  {
    supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
    supplierFileName: "suppliers.csv",
    asAt: "2026-04-30",
  }
);
assert.strictEqual(splitRemainderLate.ok, true, JSON.stringify(splitRemainderLate.errors) + JSON.stringify(splitRemainderLate.warnings));
assert.strictEqual(splitRemainderLate.lines[0].received, 10);
assert.strictEqual(splitRemainderLate.lines[0].inFull, true);
assert.strictEqual(splitRemainderLate.lines[0].onTime, false);
assert.strictEqual(splitRemainderLate.lines[0].daysLate, 10);
assert.strictEqual(splitRemainderLate.lines[0].transit, 10);
assert.strictEqual(splitRemainderLate.lines[0].freightOnTime, "Y");
assert.strictEqual(warns(splitRemainderLate, /Handed to Freight Date is after/), false);

const splitFilledOpen = run(
  [
    "1,Shenzhen Widgets,PARTF,10,2026-04-05,2026-04-11,6,,,2026-04-01",
    "1,Shenzhen Widgets,PARTF,10,2026-04-05,,4,,,2026-04-08",
  ],
  {
    supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
    supplierFileName: "suppliers.csv",
    asAt: "2026-04-30",
  }
);
assert.strictEqual(splitFilledOpen.lines[0].received, 10);
assert.strictEqual(splitFilledOpen.lines[0].transit, 10);
assert.strictEqual(engine.formatISO(splitFilledOpen.lines[0].handed), "2026-04-08");
assert.strictEqual(splitFilledOpen.notes.length === 0 || !/rest of the ordered quantity/.test(splitFilledOpen.notes.join(" ")), true);

const damagedOrdered = run(["1,Shenzhen Widgets,DMG,10,2026-04-10,,,12,,2026-04-10"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
  supplierFileName: "suppliers.csv",
  asAt: "2026-04-30",
});
assert.strictEqual(damagedOrdered.ok, false);
assert.ok(warns(damagedOrdered, /Row 2 was left out because the damaged quantity is greater than the ordered quantity/));
assert.strictEqual(warns(damagedOrdered, /received quantity/), false);

const damagedWithinOrder = run(["1,Shenzhen Widgets,DMGOK,10,2026-04-10,,,2,,2026-04-10"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,I arrange freight,21\n",
  supplierFileName: "suppliers.csv",
  asAt: "2026-04-30",
});
assert.strictEqual(damagedWithinOrder.ok, true, JSON.stringify(damagedWithinOrder.errors) + JSON.stringify(damagedWithinOrder.warnings));
assert.strictEqual(damagedWithinOrder.lines[0].received, 10);
assert.strictEqual(damagedWithinOrder.lines[0].accepted, 8);
assert.strictEqual(damagedWithinOrder.lines[0].inFull, false);
assert.match(damagedWithinOrder.lines[0].reason, /Damaged 2/);
assert.match(damagedWithinOrder.lines[0].reason, /Short 2 \(20%\)/);

const splitSite = run([
  "9,Acme,SPLIT,100,2026-03-10,2026-03-08,60,,,2026-03-01",
  "9,Acme,SPLIT,100,2026-03-10,2026-03-10,40,,,2026-02-01",
]);
assert.strictEqual(splitSite.ok, true, JSON.stringify(splitSite.errors));
assert.strictEqual(engine.formatISO(splitSite.lines[0].arrivedSite), "2026-03-10");
assert.strictEqual(engine.formatISO(splitSite.lines[0].onTimeDate), "2026-03-10");
assert.strictEqual(engine.formatISO(splitSite.lines[0].handed), "2026-03-01");
assert.strictEqual(splitSite.lines[0].onTime, true);
assert.strictEqual(splitSite.lines[0].difot, true);
assert.match(splitSite.notes.join(" "), /was not used/);

const noTransit = run(["1,Shenzhen Widgets,A,10,2026-03-10,2026-04-01,10,,,2026-03-10"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nShenzhen Widgets,Me,\n",
  supplierFileName: "suppliers.csv",
});
assert.strictEqual(noTransit.freight[0].note, "not measurable");
assert.ok(warns(noTransit, /expected transit days is blank, so freight is not measurable/));
assert.strictEqual(noTransit.lines[0].difot, true);

const missingMaster = run(["1,Mystery Co,A,10,2026-03-10,2026-03-10,10,,,"], {
  supplierText: suppliers,
  supplierFileName: "suppliers.csv",
});
assert.strictEqual(missingMaster.suppliers[0].freight, "Supplier delivers");
assert.ok(warns(missingMaster, /Mystery Co/));
assert.ok(warns(missingMaster, /Supplier delivers/));
assert.strictEqual(missingMaster.freight.length, 0);

const noMaster = run(["1,Mystery Co,A,10,2026-03-10,2026-03-10,10,,,"]);
assert.match(noMaster.notes.join(" "), /No supplier list was loaded/);
assert.strictEqual(noMaster.suppliers[0].freight, "Supplier delivers");
assert.strictEqual(noMaster.freight.length, 0);
assert.strictEqual(warns(noMaster, /not in the supplier list/), false);

const duplicateSuppliers = run(["1,Acme,A,10,2026-03-10,2026-03-10,10,,,"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nAcme,Supplier,\nacme,Me,10\n",
  supplierFileName: "suppliers.csv",
});
assert.strictEqual(duplicateSuppliers.ok, false);
assert.match(duplicateSuppliers.errors[0], /Acme is on rows 2 and 3/);
assert.match(duplicateSuppliers.errors[0], /only once/);

const monthDay = run(["1,Acme,A,10,03/04/2026,03/04/2026,10,,,"], { dayFirst: false });
assert.strictEqual(engine.formatISO(monthDay.lines[0].required), "2026-03-04");
assert.match(monthDay.dateLine, /First date 03\/04\/2026 read as 4 March 2026/);
const dayMonth = run(["1,Acme,A,10,03/04/2026,03/04/2026,10,,,"], { dayFirst: true });
assert.strictEqual(engine.formatISO(dayMonth.lines[0].required), "2026-04-03");
assert.match(dayMonth.dateLine, /First date 03\/04\/2026 read as 3 April 2026/);

const isoTime = run(["1,Acme,A,10,2026-03-10T14:30:00,2026-03-10 09:00,10,,,"]);
assert.strictEqual(isoTime.ok, true, JSON.stringify(isoTime.errors));
assert.strictEqual(isoTime.lines[0].daysLate, 0);
assert.strictEqual(warns(isoTime, /other way/), false);

const impossible = run(["1,Acme,A,10,2026-03-10,2026-03-10,10,,,", "2,Acme,B,10,10/13/2026,2026-03-10,10,,,"]);
assert.strictEqual(impossible.ok, false);
assert.strictEqual(
  impossible.errors[0],
  "Row 3: 10/13/2026 does not fit Day/Month/Year. Switch to Month/Day/Year."
);
assert.match(impossible.dateLine, /First date 2026-03-10 read as 10 March 2026/);
assert.strictEqual(warns(impossible, /other way/), false);
assert.strictEqual(impossible.summaryCsv, "");

const notReal = run(["1,Acme,A,10,31/02/2026,01/03/2026,10,,,"]);
assert.match(notReal.errors[0], /Row 2: 31\/02\/2026 is not a real date under Day\/Month\/Year or Month\/Day\/Year/);

const shortYear = run(["1,Acme,A,10,10/03/26,09/03/2026,10,,,"]);
assert.match(shortYear.errors[0], /Row 2: 10\/03\/26 uses a 2-digit year/);
assert.match(shortYear.errors[0], /2026/);

const excel = run(["1,Acme,A,10,45931,2026-03-10,10,,,", "2,Acme,B,10,2026-03-10,2026-03-10,10,,,"]);
assert.strictEqual(excel.ok, true, JSON.stringify(excel.errors));
assert.strictEqual(excel.lines.length, 1);
assert.ok(warns(excel, /Excel date number/));
assert.ok(warns(excel, /Save dates as dates/));

const ambiguousIso = run(["1,Acme,A,10,2026-03-10,2026-03-10,10,,,", "2,Acme,B,10,03/04/2026,03/04/2026,10,,,"]);
assert.strictEqual(ambiguousIso.ok, true, JSON.stringify(ambiguousIso.errors));
assert.ok(warns(ambiguousIso, /other way/));
const clearSlash = run(["1,Acme,A,10,2026-03-10,2026-03-10,10,,,", "2,Acme,B,10,13/04/2026,13/04/2026,10,,,"]);
assert.strictEqual(warns(clearSlash, /other way/), false);
const stopAmbiguous = run(["1,Acme,A,10,03/04/2026,03/04/2026,10,,,", "2,Acme,B,10,10/13/2026,03/04/2026,10,,,"]);
assert.strictEqual(stopAmbiguous.ok, false);
assert.strictEqual(warns(stopAmbiguous, /other way/), false);
assert.match(stopAmbiguous.dateLine, /First date 03\/04\/2026 read as 3 April 2026/);

const manyStops = [];
for (let i = 0; i < 12; i += 1) {
  manyStops.push(i + ",Acme,S" + i + ",1,10/13/2026,01/03/2026,1,,,");
}
const listedStops = run(manyStops);
assert.strictEqual(listedStops.errors.length, 11);
assert.match(listedStops.errors[0], /Row 2:/);
assert.strictEqual(listedStops.errors[10], "and 2 more");

const thousands = run([
  '1,Acme,A,"1,000",2026-03-10,2026-03-10,"1,000",,,',
  '2,Acme,B,"1,200.5",2026-03-10,2026-03-10,"1,000.25","200.25",,',
]);
assert.strictEqual(thousands.ok, true, JSON.stringify(thousands.errors) + JSON.stringify(thousands.warnings));
assert.strictEqual(lineOf(thousands, "A").ordered, 1000);
assert.strictEqual(lineOf(thousands, "A").received, 1000);
assert.strictEqual(lineOf(thousands, "A").inFull, true);
assert.strictEqual(lineOf(thousands, "B").ordered, 1200.5);
assert.strictEqual(lineOf(thousands, "B").received, 1000.25);
assert.strictEqual(lineOf(thousands, "B").damaged, 200.25);
const badThousands = run([
  '1,Acme,A,"1,00",2026-03-10,2026-03-10,10,,,',
  "2,Acme,B,10,2026-03-10,2026-03-10,10,,,",
]);
assert.strictEqual(badThousands.ok, true, JSON.stringify(badThousands.errors));
assert.strictEqual(badThousands.lines.length, 1);
assert.ok(warns(badThousands, /ordered quantity/));
assert.ok(warns(badThousands, /thousands separator/));
const unquotedMiddle = run([
  "1,Acme,A,1,000,2026-03-10,2026-03-10,1000,0,note,2026-04-01",
  "2,Acme,B,10,2026-03-10,2026-03-10,10,,,",
]);
assert.strictEqual(unquotedMiddle.ok, true, JSON.stringify(unquotedMiddle.errors));
assert.strictEqual(unquotedMiddle.lines.length, 1);
assert.strictEqual(lineOf(unquotedMiddle, "B").ordered, 10);
assert.ok(warns(unquotedMiddle, /Row 2 was left out because it has more columns than the header/));
assert.ok(warns(unquotedMiddle, /"1,000"/));
assert.ok(!unquotedMiddle.lines.some(function (line) { return /Short 999/.test(line.reason); }));
const unquotedReceived = run([
  "1,Acme,A,1000,2026-03-10,2026-03-10,1,000,0,Crushed,2026-04-01",
  "2,Acme,B,10,2026-03-10,2026-03-10,10,,,",
]);
assert.strictEqual(unquotedReceived.ok, true, JSON.stringify(unquotedReceived.errors));
assert.strictEqual(unquotedReceived.lines.length, 1);
assert.strictEqual(lineOf(unquotedReceived, "B").received, 10);
assert.ok(!unquotedReceived.lines.some(function (line) { return line.sku === "A"; }));
const acmeSplit = run([
  "1,Acme, Ltd,A,10,2026-03-10,2026-03-10,10,0,Crushed,2026-04-01",
  '2,"Acme, Ltd",B,10,2026-03-10,2026-03-10,10,,,',
]);
assert.strictEqual(acmeSplit.ok, true, JSON.stringify(acmeSplit.errors) + JSON.stringify(acmeSplit.warnings));
assert.strictEqual(acmeSplit.lines.length, 1);
assert.strictEqual(acmeSplit.lines[0].supplier, "Acme, Ltd");
assert.strictEqual(acmeSplit.lines[0].sku, "B");
assert.ok(warns(acmeSplit, /Row 2 was left out because it has more columns than the header/));
assert.ok(warns(acmeSplit, /"Acme, Ltd"/));
const shortOptional = run(["1,Acme,A,10,2026-03-10,2026-03-10,10"]);
assert.strictEqual(shortOptional.ok, true, JSON.stringify(shortOptional.errors) + JSON.stringify(shortOptional.warnings));
assert.strictEqual(shortOptional.lines.length, 1);
assert.strictEqual(shortOptional.lines[0].ordered, 10);
assert.strictEqual(shortOptional.lines[0].received, 10);
assert.strictEqual(shortOptional.lines[0].damaged, 0);
assert.strictEqual(warns(shortOptional, /columns than the header/), false);
const trailingComma = run(["1,Acme,A,10,2026-03-10,2026-03-10,10,,,,"]);
assert.strictEqual(trailingComma.ok, true, JSON.stringify(trailingComma.warnings));
assert.strictEqual(trailingComma.lines[0].received, 10);
assert.strictEqual(warns(trailingComma, /more columns/), false);
const shortRequired = run([
  "1,Acme,A,10",
  "2,Acme,B,10,2026-03-10,2026-03-10,10,,,",
]);
assert.strictEqual(shortRequired.ok, true, JSON.stringify(shortRequired.errors));
assert.strictEqual(shortRequired.lines.length, 1);
assert.strictEqual(lineOf(shortRequired, "B").sku, "B");
assert.ok(
  shortRequired.warnings.indexOf(
    "Row 2 was left out because it has fewer columns than the header. Required Date is missing."
  ) !== -1
);
const shortUnreceived = run(["1,Acme,LATE,10,2026-04-10"]);
assert.strictEqual(shortUnreceived.ok, true, JSON.stringify(shortUnreceived.errors) + JSON.stringify(shortUnreceived.warnings));
assert.strictEqual(shortUnreceived.overall.lines, 1);
assert.strictEqual(shortUnreceived.lines[0].counted, true);
assert.strictEqual(shortUnreceived.lines[0].reason, "Not received");
assert.strictEqual(shortUnreceived.lines[0].onTime, false);
assert.strictEqual(shortUnreceived.lines[0].inFull, false);
assert.strictEqual(shortUnreceived.lines[0].difot, false);
assert.strictEqual(warns(shortUnreceived, /fewer columns/), false);
const supplierShort = run(["1,C,A,10,2026-03-10,2026-03-10,10,,,"], {
  supplierText: "Supplier,Freight arranged by,Expected transit days\nC,Supplier\n",
  supplierFileName: "suppliers.csv",
});
assert.strictEqual(supplierShort.ok, true, JSON.stringify(supplierShort.errors) + JSON.stringify(supplierShort.warnings));
assert.strictEqual(supplierShort.suppliers[0].supplier, "C");
assert.strictEqual(supplierShort.suppliers[0].freight, "Supplier delivers");
assert.strictEqual(warns(supplierShort, /columns than the header/), false);
const mostlyUnquoted = run([
  "1,Acme,A,1,000,2026-03-10,2026-03-10,10,0,note,extra",
  "2,Acme,B,2,000,2026-03-10,2026-03-10,10,0,note,extra",
  "3,Acme,C,10,2026-03-10,2026-03-10,10,,,",
]);
assert.strictEqual(mostlyUnquoted.ok, false);
assert.match(mostlyUnquoted.errors[0], /Rows 2, 3 were left out because they have more columns than the header/);
assert.strictEqual(mostlyUnquoted.summaryCsv, "");

const semicolons = run("PO Number;Supplier;SKU\n1;Acme;A\n");
assert.deepStrictEqual(semicolons.errors, [
  "This file uses semicolons. Save it as a comma-separated CSV and try again.",
]);
const xlsx = run(["1,Acme,A,1,2026-03-10,2026-03-10,1,,,"], { poFileName: "lines.xlsx" });
assert.deepStrictEqual(xlsx.errors, ["Save it as CSV UTF-8 and try again."]);
const missingHeader = run(
  "PO Number,Supplier,SKU,Required Date,Arrived at Your Site Date,Received Qty\n1,Acme,A,2026-03-10,2026-03-10,1\n"
);
assert.match(missingHeader.errors[0], /Ordered Qty/);
assert.match(missingHeader.errors[0], /Download the template/);

const bom = run("\uFEFF" + HEADER + "\n1,Acme,A,10,2026-03-10,2026-03-10,10,,,\n");
assert.strictEqual(bom.ok, true, JSON.stringify(bom.errors));
const quoted = run(HEADER + '\n1,"Acme, Inc",A,10,2026-03-10,2026-03-10,10,,,\n');
assert.strictEqual(quoted.ok, true, JSON.stringify(quoted.errors));
assert.strictEqual(quoted.lines[0].supplier, "Acme, Inc");
assert.match(quoted.linesCsv, /"Acme, Inc"/);

const renamed = run(
  "po-number,SUPPLIER,sku,ordered-qty,REQUIRED-DATE,arrived_at_your_site_date,received qty\n1,Acme,A,10,2026-03-10,2026-03-10,10\n"
);
assert.strictEqual(renamed.ok, true, JSON.stringify(renamed.errors));

const skus = run([
  "1,Acme,00123,10,2026-03-10,2026-03-10,10,,,",
  "2,Acme,123,10,2026-03-10,2026-03-10,10,,,",
  "1, Acme , 00123 ,10,2026-03-10,2026-03-10,10,,,",
]);
assert.strictEqual(skus.lines.length, 2);
assert.ok(lineOf(skus, "00123"));
assert.ok(lineOf(skus, "123"));
assert.strictEqual(lineOf(skus, "00123").rowsCombined, 2);
assert.ok(warns(skus, /space/));
assert.ok(warns(skus, /00123 can become 123/));
assert.strictEqual(lineOf(skus, "00123").supplier, "Acme");

const summary = worked.summaryCsv;
assert.strictEqual(summary.charCodeAt(0), 0xfeff);
assert.match(summary, /Setting,Value\nDate format,Day\/Month\/Year/);
assert.match(summary, /Days early allowed,2/);
assert.match(summary, /Days late allowed,0/);
assert.match(summary, /Shortfall allowed,0%/);
assert.match(summary, /Over-delivery counts as in full,Yes/);
assert.match(summary, /As at date,2026-10-14/);
const summaryTable = summary.slice(summary.indexOf("Level,"));
assert.ok(summaryTable.startsWith(engine.SUMMARY_HEADER.join(",")));
assert.doesNotMatch(summaryTable, /^Overall,/m);
assert.doesNotMatch(summaryTable, /^Month,/m);
assert.match(summaryTable, /Supplier,Acme,,4,2,3,1,50\.0,75\.0,25\.0/);
assert.match(summaryTable, /Supplier-Month,Acme,2026-03,4,2,3,1,50\.0,75\.0,25\.0/);
assert.match(worked.linesCsv, /2026-03-09/);
assert.ok(worked.linesCsv.includes(engine.LINES_HEADER.join(",")));
assert.strictEqual(worked.summaryFileName, "DIFOT_summary_2026-10-14.csv");
assert.strictEqual(worked.linesFileName, "DIFOT_lines_2026-10-14.csv");
assert.doesNotMatch(worked.summaryCsv, /\d,\d{3}/);

const help = fs.readFileSync(path.join(ROOT, "assets", "template_DIFOT_PO_Lines.csv"), "utf8");
assert.ok(help.includes(engine.HELP_LINE));
const templateRun = run(help, {
  poFileName: "template_DIFOT_PO_Lines.csv",
  supplierText: fs.readFileSync(path.join(ROOT, "assets", "template_DIFOT_Suppliers.csv"), "utf8"),
  supplierFileName: "template_DIFOT_Suppliers.csv",
});
assert.strictEqual(templateRun.ok, true, JSON.stringify(templateRun.errors) + JSON.stringify(templateRun.warnings));
assert.strictEqual(templateRun.overall.lines, 5);
assert.strictEqual(warns(templateRun, /left out/), false);
assert.strictEqual(lineOf(templateRun, "WDG-010").difot, false);
assert.strictEqual(lineOf(templateRun, "WDG-010").onTime, true);
assert.strictEqual(lineOf(templateRun, "WDG-010").freightOnTime, "");
assert.strictEqual(lineOf(templateRun, "WDG-020").freightOnTime, "Y");
assert.strictEqual(lineOf(templateRun, "BOX-100").difot, true);
assert.strictEqual(lineOf(templateRun, "WDG-030").difot, true);
assert.strictEqual(lineOf(templateRun, "WDG-030").inFull, true);
assert.strictEqual(lineOf(templateRun, "WDG-030").received, 20);
assert.strictEqual(lineOf(templateRun, "WDG-030").freightOnTime, "");
assert.match(templateRun.notes.join(" "), /ordered quantity was counted as delivered in full/);

const samplePo = fs.readFileSync(path.join(ROOT, "samples", "difot_sample_po_lines.csv"), "utf8");
const sampleSuppliers = fs.readFileSync(path.join(ROOT, "samples", "difot_sample_suppliers.csv"), "utf8");
const sample = run(samplePo, {
  poFileName: "difot_sample_po_lines.csv",
  supplierText: sampleSuppliers,
  supplierFileName: "difot_sample_suppliers.csv",
  asAt: "2026-10-14",
});
assert.strictEqual(sample.ok, true, JSON.stringify(sample.errors) + JSON.stringify(sample.warnings));
assert.strictEqual(sample.counts.lines, 393);
assert.strictEqual(sample.counts.suppliers, 5);
assert.strictEqual(sample.counts.purchaseOrders, 50);
assert.strictEqual(sample.summaryLine, "393 lines measured. 5 suppliers. 50 purchase orders.");
assert.strictEqual(sample.monthNote, "");
assert.doesNotMatch(sample.notes.join(" "), /older month/);
assert.doesNotMatch(sample.summaryCsv, /^Overall,/m);
assert.doesNotMatch(sample.summaryCsv, /^Month,/m);
assert.doesNotMatch(sample.summaryLine, /DIFOT /);
assert.strictEqual(sample.overall.lines, 393);
assert.strictEqual(sample.overall.difotPct, "81.2");
assert.strictEqual(sample.overall.difotLines, 319);
assert.strictEqual(sample.overall.onTimePct, "87.3");
assert.strictEqual(sample.overall.inFullPct, "91.6");
function samplePct(name) {
  return sample.suppliers.filter(function (row) {
    return row.supplier === name;
  })[0];
}
assert.strictEqual(samplePct("Brisbane Packaging Co").difotPct, "100.0");
assert.strictEqual(samplePct("Brisbane Packaging Co").lines, 80);
assert.strictEqual(samplePct("Coastal Fasteners").difotPct, "97.5");
assert.strictEqual(samplePct("Southern Cross Hardware").difotPct, "79.0");
assert.strictEqual(samplePct("Southern Cross Hardware").lines, 81);
assert.strictEqual(samplePct("Southern Cross Hardware").onTimePct, "85.2");
assert.strictEqual(samplePct("Southern Cross Hardware").inFullPct, "91.4");
assert.strictEqual(samplePct("Harbour Electrical Supplies").difotPct, "77.5");
assert.strictEqual(samplePct("Outback Tools & Parts").difotPct, "48.6");
assert.strictEqual(samplePct("Outback Tools & Parts").lines, 72);
var supplierAverage = 0;
["Brisbane Packaging Co", "Coastal Fasteners", "Southern Cross Hardware", "Harbour Electrical Supplies", "Outback Tools & Parts"].forEach(
  function (name) {
    supplierAverage += Number(samplePct(name).difotPct);
  }
);
supplierAverage = Math.round((supplierAverage / 5) * 10) / 10;
assert.notStrictEqual(Number(sample.overall.difotPct), supplierAverage);
assert.strictEqual(samplePct("Southern Cross Hardware").freight, "I arrange freight");
assert.strictEqual(samplePct("Outback Tools & Parts").freight, "I arrange freight");
assert.strictEqual(samplePct("Brisbane Packaging Co").freight, "Supplier delivers");
assert.strictEqual(warns(sample, /Handed to Freight Date is blank/), false);
const sampleOpen = lineOf(sample, "SKU-9001");
assert.strictEqual(sampleOpen.supplier, "Southern Cross Hardware");
assert.strictEqual(sampleOpen.ordered, 24);
assert.strictEqual(sampleOpen.received, 24);
assert.strictEqual(sampleOpen.onTime, false);
assert.strictEqual(sampleOpen.inFull, true);
assert.strictEqual(sampleOpen.difot, false);
assert.strictEqual(sampleOpen.daysLate, 2);
assert.strictEqual(sampleOpen.transit, null);
assert.match(sampleOpen.reason, /ordered quantity was used/);
assert.match(sample.notes.join(" "), /handover date and no arrival yet/);
const sampleFreight = sample.freight.filter(function (row) {
  return row.supplier === "Southern Cross Hardware";
})[0];
assert.strictEqual(sampleFreight.measurable, 78);
assert.strictEqual(sampleFreight.onTimeLines, 46);
assert.strictEqual(sampleFreight.onTimePct, "59.0");
assert.strictEqual(sampleFreight.averageTransit, "21.1");
assert.strictEqual(sampleFreight.longestTransit, "26");
assert.strictEqual(sampleFreight.note, "1 line not measurable");
const outbackFreight = sample.freight.filter(function (row) {
  return row.supplier === "Outback Tools & Parts";
})[0];
assert.strictEqual(outbackFreight.measurable, 67);
assert.strictEqual(outbackFreight.onTimeLines, 33);
assert.strictEqual(outbackFreight.onTimePct, "49.3");
assert.strictEqual(outbackFreight.averageTransit, "28.6");
assert.strictEqual(outbackFreight.longestTransit, "33");
assert.strictEqual(outbackFreight.note, "");
function sampleMonth(supplier, month) {
  const group = sample.supplierMonths.filter(function (row) {
    return row.supplier === supplier;
  })[0];
  return group.months.filter(function (row) {
    return row.month === month;
  })[0];
}
const sampleMonths = {
  "Outback Tools & Parts": {
    "2026-06": ["24", "70.8", "79.2", "54.2", "52.2"],
    "2026-07": ["24", "54.2", "79.2", "37.5", "60.9"],
    "2026-08": ["16", "75.0", "75.0", "62.5", "35.7"],
    "2026-09": ["8", "62.5", "62.5", "37.5", "28.6"],
  },
  "Harbour Electrical Supplies": {
    "2026-06": ["24", "87.5", "83.3", "75.0", ""],
    "2026-07": ["24", "83.3", "91.7", "75.0", ""],
    "2026-08": ["16", "93.8", "93.8", "87.5", ""],
    "2026-09": ["16", "81.3", "87.5", "75.0", ""],
  },
  "Southern Cross Hardware": {
    "2026-06": ["24", "79.2", "100.0", "79.2", "54.2"],
    "2026-07": ["24", "87.5", "87.5", "79.2", "69.6"],
    "2026-08": ["24", "87.5", "83.3", "75.0", "52.2"],
    "2026-09": ["9", "88.9", "100.0", "88.9", "62.5"],
  },
  "Coastal Fasteners": {
    "2026-06": ["24", "100.0", "100.0", "100.0", ""],
    "2026-07": ["24", "91.7", "100.0", "91.7", ""],
    "2026-08": ["24", "100.0", "100.0", "100.0", ""],
    "2026-09": ["8", "100.0", "100.0", "100.0", ""],
  },
  "Brisbane Packaging Co": {
    "2026-06": ["24", "100.0", "100.0", "100.0", ""],
    "2026-07": ["24", "100.0", "100.0", "100.0", ""],
    "2026-08": ["24", "100.0", "100.0", "100.0", ""],
    "2026-09": ["8", "100.0", "100.0", "100.0", ""],
  },
};
Object.keys(sampleMonths).forEach(function (supplier) {
  Object.keys(sampleMonths[supplier]).forEach(function (month) {
    const expected = sampleMonths[supplier][month];
    const row = sampleMonth(supplier, month);
    assert.ok(row, supplier + " " + month);
    assert.strictEqual(String(row.lines), expected[0], supplier + " " + month + " lines");
    assert.strictEqual(row.onTimePct, expected[1], supplier + " " + month + " on time");
    assert.strictEqual(row.inFullPct, expected[2], supplier + " " + month + " in full");
    assert.strictEqual(row.difotPct, expected[3], supplier + " " + month + " difot");
    if (expected[4]) {
      assert.strictEqual(row.freightStats.onTimePct, expected[4], supplier + " " + month + " freight");
    } else {
      assert.strictEqual(row.freightStats, null, supplier + " " + month + " freight");
    }
  });
});
assert.strictEqual(sampleMonth("Southern Cross Hardware", "2026-09").freightStats.note, "1 line not measurable");
assert.match(sample.summaryCsv, /Supplier-Month,Southern Cross Hardware,2026-09,9,/);

const big = ["PO Number,Supplier,SKU,Ordered Qty,Required Date,Arrived at Your Site Date,Received Qty"];
for (let i = 0; i < 200000; i += 1) {
  big.push("PO" + i + ",Acme,SKU" + (i % 1000) + ",10,2026-03-10,2026-03-10,10");
}
const bigText = big.join("\n");
const started = Date.now();
const bigResult = engine.buildDifot({
  poText: bigText,
  poFileName: "big.csv",
  poByteLength: Buffer.byteLength(bigText),
  asAt: "2026-10-14",
});
const elapsed = Date.now() - started;
assert.strictEqual(bigResult.ok, true, JSON.stringify(bigResult.errors));
assert.strictEqual(bigResult.overall.lines, 200000);
assert.ok(elapsed < 2000, "200,000 rows took " + elapsed + "ms");

if (!fs.existsSync(path.join(SITE, "learn", "difot-calculator", "index.html"))) {
  console.error("Built DIFOT Calculator page is missing. Run `npm run build` first.");
  process.exit(1);
}

const page = fs.readFileSync(path.join(SITE, "learn", "difot-calculator", "index.html"), "utf8");
const sourcePage = fs.readFileSync(path.join(ROOT, "src", "learn", "difot-calculator.njk"), "utf8");
const ui = fs.readFileSync(path.join(ROOT, "assets", "difot-calculator.js"), "utf8");
const article = fs.readFileSync(
  path.join(ROOT, "src", "blog", "posts", "supplier-difot-measure-the-delivery-that-actually-matters.html"),
  "utf8"
);
assert.match(page, /<h1 class="page-title">DIFOT Calculator<\/h1>/);
assert.match(page, /id="df-days-early"[^>]*value="2"/);
assert.match(page, /id="df-days-late"[^>]*value="0"/);
assert.match(page, /id="df-shortfall"/);
assert.match(page, /id="df-over"/);
assert.match(page, /id="df-measure-from"/);
assert.match(page, /id="df-measure-to"/);
assert.match(page, /id="df-as-at"/);
assert.match(page, /Day\/Month\/Year/);
assert.match(page, /your accounting or purchasing system/);
assert.match(page, /A quantity such as "1,000" in quotes is read as 1000/);
assert.match(page, /A full stop is only for decimals/);
assert.ok(page.includes(engine.HELP_LINE));
assert.match(page, /supplier's invoice date/);
assert.match(page, /Arrived at Your Site Date/);
assert.match(page, /Handed to Freight Date/);
assert.match(page, /does not change the supplier's DIFOT/);
assert.match(page, /handed over but have not arrived yet/);
assert.match(page, /leave Received Qty blank/);
assert.match(page, /handover date is after the arrival date/);
assert.match(page, /Freight days use only the rows that have arrived/);
assert.match(page, /rest of the ordered quantity/);
assert.match(page, /difot-engine\.js\?v=10/);
assert.match(page, /difot-calculator\.js\?v=3/);
assert.match(page, /<summary>What DIFOT is and why it matters<\/summary>/);
assert.match(page, /<summary>Your files<\/summary>/);
assert.match(page, /<summary>How the calculation works<\/summary>/);
assert.match(page, /Delivered In Full, On Time/);
assert.match(page, /sliding scale/);
assert.match(page, /Agree the allowance with each supplier/);
assert.match(page, /percentage on\s+this page applies to the whole file/);
assert.match(page, /Rerun with a\s+different\s+percentage to check one supplier/);
assert.match(page, /agreed\s+lead time is 3 weeks/);
assert.match(page, /look up Incoterms/);
assert.match(page, /ready for shipping on the agreed\s+date/);
assert.match(page, /There is no overall total/);
assert.match(page, /id="df-lines"/);
assert.match(page, /id="df-suppliers"/);
assert.match(page, /id="df-pos"/);
assert.match(page, /id="df-supplier-months"/);
assert.doesNotMatch(page, /id="df-difot"|id="df-on-time"|id="df-in-full"|id="df-summary-line"/);
assert.doesNotMatch(page, /Receipt Date|ship date/i);
assert.match(page, /id="df-downloads" hidden/);
assert.match(page, /id="df-results" hidden/);
assert.match(page, /Email me to unlock the download/);
assert.match(page, /name="articles"/);
assert.doesNotMatch(page, /name="articles"[^>]*checked/);
assert.doesNotMatch(page, /Xero|ERP|Stock Planner|Demand Planner|coming soon/i);
assert.doesNotMatch(sourcePage, /Xero|ERP|Stock Planner|Demand Planner|coming soon/i);
assert.doesNotMatch(ui, /Xero|ERP|Stock Planner|Demand Planner|coming soon/i);
assert.match(ui, /formId:\s*"difot-calculator"/);
assert.match(ui, /return \{ kind: "difot-calculator" \}/);
assert.doesNotMatch(ui, /buildSummary:[\s\S]*?return \{[^}]*supplier/);
assert.match(ui, /result\.monthNote/);
assert.doesNotMatch(ui, /older months are/);
assert.match(article, /<a href="\/learn\/difot-calculator\/">Calculate your suppliers' DIFOT free<\/a>/);
assert.doesNotMatch(article, /Stock Planner|Xero/);
const sentPage = fs.readFileSync(path.join(SITE, "learn", "difot-calculator", "sent", "index.html"), "utf8");
assert.match(sentPage, /noindex/);
assert.match(sentPage, /The download is unlocked on the DIFOT Calculator page/);
assert.ok(!fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8").includes("/learn/difot-calculator/sent/"));
assert.match(fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8"), /\/learn\/difot-calculator\//);
assert.match(fs.readFileSync(path.join(ROOT, "src", "_data", "learnTools.js"), "utf8"), /\/learn\/difot-calculator\//);

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

function settingsKeepDownload() {
  const uiSource = fs.readFileSync(path.join(ROOT, "assets", "difot-calculator.js"), "utf8");
  const ids = {};
  [
    "df-errors",
    "df-warnings",
    "df-date-line",
    "df-po-name",
    "df-supplier-name",
    "df-output",
    "df-lines",
    "df-suppliers",
    "df-pos",
    "df-settings",
    "df-notes",
    "df-supplier-body",
    "df-supplier-months",
    "df-month-note",
    "df-gate",
    "df-downloads",
    "df-download-summary",
    "df-download-lines",
  ].forEach(function (id) {
    ids[id] = element("");
  });
  ids["df-date-order"] = element("dmy");
  ids["df-days-early"] = element("2");
  ids["df-days-late"] = element("0");
  ids["df-shortfall"] = element("0");
  ids["df-over"] = element("yes");
  ids["df-as-at"] = element("");
  ids["df-measure-from"] = element("");
  ids["df-measure-to"] = element("");
  ids["df-po-file"] = element("");
  ids["df-supplier-file"] = element("");
  const csv = HEADER + "\n1,Acme,A,10,2026-03-10,2026-03-10,10,,,\n";
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
  function FileReader() {}
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
      body: { appendChild: function () {}, removeChild: function () {} },
    },
    TextEncoder: TextEncoder,
    Date: FixedDate,
    FileReader: FileReader,
    URL: { createObjectURL: function () { return "blob:test"; }, revokeObjectURL: function () {} },
    Blob: function Blob() {},
    console: console,
  };
  sandbox.window = sandbox;
  sandbox.window.DifotCalculator = engine;
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
  vm.runInNewContext(uiSource, sandbox, { filename: "difot-calculator.js" });
  assert.strictEqual(attached.formId, "difot-calculator");
  assert.strictEqual(attached.wordingVersion, "difot-calculator-v1");
  assert.strictEqual(attached.wordingRequired, "Email me to unlock the download.");
  assert.strictEqual(attached.sentUrl, "/learn/difot-calculator/sent/");
  assert.strictEqual(ids["df-as-at"].value, "2026-10-14");
  ids["df-po-file"].files = [{ name: "lines.csv", size: csv.length }];
  ids["df-po-file"].listeners.change();
  assert.strictEqual(shows, 1);
  assert.strictEqual(ids["df-lines"].textContent, "1");
  assert.strictEqual(ids["df-suppliers"].textContent, "1");
  assert.strictEqual(ids["df-pos"].textContent, "1");
  assert.match(ids["df-supplier-body"].innerHTML, /Acme/);
  assert.match(ids["df-supplier-body"].innerHTML, /100\.0%/);
  assert.match(ids["df-supplier-months"].innerHTML, /2026-03/);
  assert.match(ids["df-supplier-months"].innerHTML, /Acme/);
  assert.doesNotMatch(ids["df-supplier-months"].innerHTML, /Freight on time/);
  assert.strictEqual(ids["df-downloads"].hidden, true);
  const sentSummary = attached.buildSummary();
  assert.strictEqual(sentSummary.kind, "difot-calculator");
  assert.deepStrictEqual(Object.keys(sentSummary), ["kind"]);
  attached.onSent();
  assert.strictEqual(ids["df-downloads"].hidden, false);
  ids["df-days-early"].value = "5";
  ids["df-days-early"].listeners.change();
  assert.strictEqual(ids["df-downloads"].hidden, false);
  assert.strictEqual(shows, 1);
  ids["df-days-late"].value = "1";
  ids["df-days-late"].listeners.change();
  assert.strictEqual(ids["df-downloads"].hidden, false);
  attached.buildSummary();
  ids["df-po-file"].listeners.change();
  assert.strictEqual(ids["df-downloads"].hidden, true);
  attached.onSent();
  assert.strictEqual(ids["df-downloads"].hidden, true);
  assert.ok(shows > 1);
}

settingsKeepDownload();

console.log("DIFOT Calculator checks passed.");
