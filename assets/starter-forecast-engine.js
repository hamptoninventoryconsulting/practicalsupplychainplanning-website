/**
 * Starter Forecast.
 *
 * The sales file is read and calculated in the browser. This file does not
 * upload it and does not put SKUs or quantities into an email.
 *
 * History window: the 12 complete weeks before the plan start week.
 * Weeks Used: weeks from the first sale week (net quantity above 0) through
 * the end of that window, including later zero weeks, excluding earlier
 * weeks, capped at 12. Average = that total / Weeks Used, floored at 0,
 * then rounded to 2 decimals. The same average is written on every
 * forecast week.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.StarterForecast = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var WINDOW_WEEKS = 12;
  var DEFAULT_HORIZON = 13;
  var MIN_HORIZON = 1;
  var MAX_HORIZON = 52;
  var MAX_BYTES = 10 * 1024 * 1024;
  var MAX_ROWS = 200000;
  var MAX_SKUS = 5000;
  var REQUIRED = ["order_id", "order_datetime", "sku", "qty", "fulfillment_location"];
  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  var EPS = 1e-9;

  function utf8Size(text) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(String(text || "")).length;
    }
    return String(text || "").length;
  }

  function normalizeHeader(name) {
    return String(name == null ? "" : name)
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/ /g, "_");
  }

  function parseCsv(text) {
    var source = String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
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
      } else if (ch === ",") {
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
    return rows;
  }

  function rowIsEmpty(cells) {
    for (var i = 0; i < cells.length; i += 1) {
      if (String(cells[i] == null ? "" : cells[i]).trim() !== "") {
        return false;
      }
    }
    return true;
  }

  function csvField(value) {
    var text = String(value == null ? "" : value);
    if (/[",\n\r]/.test(text) || text !== text.trim()) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function csvLine(cells) {
    return cells.map(csvField).join(",");
  }

  function utcDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    var dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
      return null;
    }
    return dt;
  }

  function addDays(date, days) {
    var next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function mondayOf(date) {
    var day = date.getUTCDay();
    var offset = day === 0 ? 6 : day - 1;
    return addDays(date, -offset);
  }

  function formatISO(date) {
    var month = String(date.getUTCMonth() + 1);
    var day = String(date.getUTCDate());
    if (month.length < 2) {
      month = "0" + month;
    }
    if (day.length < 2) {
      day = "0" + day;
    }
    return date.getUTCFullYear() + "-" + month + "-" + day;
  }

  function formatLong(date) {
    return date.getUTCDate() + " " + MONTHS[date.getUTCMonth()] + " " + date.getUTCFullYear();
  }

  function parseISODate(text) {
    var match = String(text || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    return utcDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  function slashFields(text) {
    return text.match(
      /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/
    );
  }

  function slashDate(match, dayFirst) {
    var first = Number(match[1]);
    var second = Number(match[2]);
    var year = Number(match[3]);
    var day = dayFirst ? first : second;
    var month = dayFirst ? second : first;
    return utcDate(year, month, day);
  }

  function parseOrderDate(raw, dayFirst) {
    var text = String(raw == null ? "" : raw).trim();
    if (!text) {
      return { ok: false, reason: "blank" };
    }
    if (/^\d+(\.\d+)?$/.test(text)) {
      return { ok: false, reason: "excel" };
    }
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (iso) {
      var isoDate = utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      if (!isoDate) {
        return { ok: false, reason: "unreadable" };
      }
      return { ok: true, date: isoDate, iso: true, ambiguous: false, original: text };
    }
    if (/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(text)) {
      return { ok: false, reason: "shortYear", original: text };
    }
    var parts = slashFields(text);
    if (!parts) {
      return { ok: false, reason: "unreadable" };
    }
    var date = slashDate(parts, dayFirst);
    if (!date) {
      return {
        ok: false,
        reason: "impossible",
        original: text,
        otherDate: slashDate(parts, !dayFirst),
      };
    }
    var first = Number(parts[1]);
    var second = Number(parts[2]);
    return {
      ok: true,
      date: date,
      iso: false,
      ambiguous: first <= 12 && second <= 12 && first !== second,
      original: text,
    };
  }

  function shownDate(original) {
    var shown = String(original || "");
    var timeCut = shown.search(/[T\s]\d{1,2}:/);
    if (timeCut !== -1) {
      shown = shown.slice(0, timeCut);
    }
    return shown;
  }

  function formatName(dayFirst) {
    return dayFirst ? "Day/Month/Year" : "Month/Day/Year";
  }

  function buildDateLine(dayFirst, ref) {
    if (!ref) {
      return "";
    }
    var prefix = "Dates read as " + formatName(dayFirst) + ": first date " + shownDate(ref.original);
    if (ref.date && ref.chosen) {
      return prefix + " read as " + formatLong(ref.date) + ".";
    }
    if (ref.date) {
      return prefix + " read as " + formatLong(ref.date) + " under " + formatName(!dayFirst) + ".";
    }
    return prefix + " could not be read.";
  }

  function dateStopMessage(parsed, rowNumber, dayFirst) {
    var shown = shownDate(parsed.original);
    if (parsed.reason === "shortYear") {
      return "Row " + rowNumber + ": " + shown + " uses a 2-digit year. Write the year in full, such as 2026.";
    }
    if (parsed.otherDate) {
      return (
        "Row " +
        rowNumber +
        ": " +
        shown +
        " does not fit " +
        formatName(dayFirst) +
        ". Switch to " +
        formatName(!dayFirst) +
        "."
      );
    }
    return (
      "Row " +
      rowNumber +
      ": " +
      shown +
      " is not a real date under " +
      formatName(dayFirst) +
      " or " +
      formatName(!dayFirst) +
      "."
    );
  }

  function usesSemicolons(text) {
    var source = String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    var lines = source.split("\n");
    for (var i = 0; i < lines.length; i += 1) {
      if (String(lines[i]).trim() === "") {
        continue;
      }
      var semis = (lines[i].match(/;/g) || []).length;
      var commas = (lines[i].match(/,/g) || []).length;
      return semis > 0 && semis > commas;
    }
    return false;
  }

  function parseQty(raw) {
    var text = String(raw == null ? "" : raw).trim();
    if (text.indexOf(",") !== -1) {
      if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
        return null;
      }
      text = text.replace(/,/g, "");
    }
    if (!/^-?\d+(\.\d+)?$/.test(text)) {
      return null;
    }
    var value = Number(text);
    if (!isFinite(value)) {
      return null;
    }
    return value;
  }

  function round2(value) {
    var rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    if (rounded === 0) {
      return 0;
    }
    return rounded;
  }

  function formatQty(value) {
    return round2(value).toFixed(2);
  }

  function listAnd(items) {
    if (items.length === 1) {
      return items[0];
    }
    if (items.length === 2) {
      return items[0] + " and " + items[1];
    }
    return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
  }

  function skipBucket() {
    return { count: 0, rows: [] };
  }

  function noteSkip(bucket, rowNumber) {
    bucket.count += 1;
    if (bucket.rows.length < 8) {
      bucket.rows.push(rowNumber);
    }
  }

  function capMessages(messages) {
    if (messages.length <= 10) {
      return messages.slice();
    }
    var more = messages.length - 10;
    return messages.slice(0, 10).concat(["and " + more + " more"]);
  }

  function skipWarning(bucket, detail) {
    if (!bucket.count) {
      return "";
    }
    var noun = bucket.count === 1 ? "row was" : "rows were";
    var message = bucket.count + " " + noun + " left out because " + detail + ".";
    if (bucket.rows.length) {
      message +=
        " Check row" +
        (bucket.rows.length === 1 ? " " : "s ") +
        bucket.rows.join(", ") +
        ".";
    }
    return message;
  }

  function emptyResult(errors, warnings, dateLine) {
    return {
      ok: false,
      errors: errors || [],
      warnings: warnings || [],
      notes: [],
      dateLine: dateLine || "",
      locationCount: 0,
      locationNote: "",
      skus: [],
      weekDates: [],
      forecastRows: [],
      forecastCsv: "",
      summaryCsv: "",
      forecastFileName: "",
      summaryFileName: "",
      previewSkuCount: 0,
      previewWeekCount: 0,
    };
  }

  function buildForecast(options) {
    var input = options || {};
    var fileName = String(input.fileName || "");
    if (!/\.csv$/i.test(fileName)) {
      return emptyResult([
        "This page reads a CSV file. In Excel or Google Sheets, use Save As and choose CSV UTF-8.",
      ]);
    }
    var text = String(input.text == null ? "" : input.text);
    var size = input.byteLength != null ? Number(input.byteLength) : utf8Size(text);
    if (!isFinite(size) || size > MAX_BYTES) {
      return emptyResult(["This file is over 10 MB. Export a shorter history and try again."]);
    }
    var planStart = parseISODate(input.planStart);
    if (!planStart) {
      return emptyResult(["Choose a plan start date."]);
    }
    var today = parseISODate(input.today) || planStart;
    var horizon = Number(input.horizon == null ? DEFAULT_HORIZON : input.horizon);
    if (!isFinite(horizon) || Math.floor(horizon) !== horizon || horizon < MIN_HORIZON || horizon > MAX_HORIZON) {
      return emptyResult(["Forecast weeks must be a whole number from 1 to 52."]);
    }
    var dayFirst = input.dayFirst !== false;
    var table = parseCsv(text).filter(function (cells) {
      return !rowIsEmpty(cells);
    });
    if (!table.length) {
      return emptyResult(["The file has no header row. Download the template and match those column names."]);
    }
    if (usesSemicolons(text)) {
      return emptyResult(["This file uses semicolons. Save it as a comma-separated CSV and try again."]);
    }
    var headers = table[0].map(normalizeHeader);
    var missing = REQUIRED.filter(function (name) {
      return headers.indexOf(name) === -1;
    });
    if (missing.length) {
      var label = missing.length === 1 ? "column" : "columns";
      var quoted = missing.map(function (name) {
        return "`" + name + "`";
      });
      return emptyResult([
        "We couldn't find the " +
          listAnd(quoted) +
          " " +
          label +
          ". Your file needs: order_id, order_datetime, sku, qty, fulfillment_location. Download the template.",
      ]);
    }
    var col = {
      order_id: headers.indexOf("order_id"),
      order_datetime: headers.indexOf("order_datetime"),
      sku: headers.indexOf("sku"),
      qty: headers.indexOf("qty"),
      fulfillment_location: headers.indexOf("fulfillment_location"),
    };
    var dataRows = table.slice(1);
    if (dataRows.length > MAX_ROWS) {
      return emptyResult([
        "This file has more than " + MAX_ROWS.toLocaleString("en-US") + " data rows. Export a shorter history and try again.",
      ]);
    }
    if (!dataRows.length) {
      return emptyResult(["The file has no sales rows under the header."]);
    }

    var seenSkus = new Map();
    var skuCount = 0;
    for (var s = 0; s < dataRows.length; s += 1) {
      var skuCell = dataRows[s][col.sku] == null ? "" : String(dataRows[s][col.sku]);
      if (String(skuCell).trim() === "") {
        continue;
      }
      if (!seenSkus.has(skuCell)) {
        seenSkus.set(skuCell, true);
        skuCount += 1;
        if (skuCount > MAX_SKUS) {
          return emptyResult([
            "This file has more than " + MAX_SKUS.toLocaleString("en-US") + " SKUs. Split the file and try again.",
          ]);
        }
      }
    }

    var skipped = {
      blankSku: skipBucket(),
      unreadable: skipBucket(),
      excel: skipBucket(),
      qty: skipBucket(),
      future: skipBucket(),
    };
    var spaced = Object.create(null);
    var spacedCount = 0;
    var digitSku = false;
    var bySku = new Map();
    var locations = Object.create(null);
    var locationCount = 0;
    var firstDateRef = null;
    var earliestWeek = "";
    var dateStops = [];
    var slashDates = 0;
    var ambiguousDates = 0;
    var parsedDates = 0;
    var dateCells = 0;
    var laterRows = 0;
    var startMonday = mondayOf(planStart);
    var startKey = formatISO(startMonday);
    var todayKey = formatISO(today);

    function skuBucket(sku) {
      var found = bySku.get(sku);
      if (found) {
        return found;
      }
      found = { weeks: Object.create(null), locations: Object.create(null), locationCount: 0 };
      bySku.set(sku, found);
      return found;
    }

    for (var r = 0; r < dataRows.length; r += 1) {
      var cells = dataRows[r];
      var rowNumber = r + 2;
      var sku = cells[col.sku] == null ? "" : String(cells[col.sku]);
      if (String(sku).trim() === "") {
        noteSkip(skipped.blankSku, rowNumber);
        continue;
      }
      if (sku !== sku.trim()) {
        if (!Object.prototype.hasOwnProperty.call(spaced, sku)) {
          spaced[sku] = true;
          spacedCount += 1;
        }
      }
      if (/^\d+$/.test(sku)) {
        digitSku = true;
      }
      var dateRaw = cells[col.order_datetime];
      if (String(dateRaw == null ? "" : dateRaw).trim() !== "") {
        dateCells += 1;
      }
      var parsed = parseOrderDate(dateRaw, dayFirst);
      if (!parsed.ok) {
        if (parsed.reason === "impossible" || parsed.reason === "shortYear") {
          if (!firstDateRef) {
            firstDateRef = {
              original: parsed.original,
              date: parsed.otherDate || null,
              chosen: false,
            };
          }
          dateStops.push(dateStopMessage(parsed, rowNumber, dayFirst));
          continue;
        }
        if (parsed.reason === "excel") {
          noteSkip(skipped.excel, rowNumber);
        } else {
          noteSkip(skipped.unreadable, rowNumber);
        }
        continue;
      }
      parsedDates += 1;
      if (!firstDateRef) {
        firstDateRef = { original: parsed.original, date: parsed.date, chosen: true };
      }
      var parsedWeek = formatISO(mondayOf(parsed.date));
      if (!earliestWeek || parsedWeek < earliestWeek) {
        earliestWeek = parsedWeek;
      }
      if (!parsed.iso) {
        slashDates += 1;
        if (parsed.ambiguous) {
          ambiguousDates += 1;
        }
      }
      var qty = parseQty(cells[col.qty]);
      if (qty == null) {
        noteSkip(skipped.qty, rowNumber);
        continue;
      }
      var dayKey = formatISO(parsed.date);
      if (dayKey > todayKey) {
        noteSkip(skipped.future, rowNumber);
        continue;
      }
      var weekKey = formatISO(mondayOf(parsed.date));
      var bucket = skuBucket(sku);
      bucket.weeks[weekKey] = (bucket.weeks[weekKey] || 0) + qty;
      var location = String(cells[col.fulfillment_location] == null ? "" : cells[col.fulfillment_location]).trim();
      if (!Object.prototype.hasOwnProperty.call(bucket.locations, location)) {
        bucket.locations[location] = true;
        bucket.locationCount += 1;
      }
      if (!Object.prototype.hasOwnProperty.call(locations, location)) {
        locations[location] = true;
        locationCount += 1;
      }
      if (weekKey >= startKey) {
        laterRows += 1;
      }
    }

    var warnings = [];
    [
      skipWarning(skipped.blankSku, "the SKU was blank"),
      skipWarning(skipped.unreadable, "the date could not be read"),
      skipWarning(skipped.excel, "the date is an Excel date number. Save the file with real dates, not date numbers"),
      skipWarning(skipped.qty, "the quantity is not a number"),
      skipWarning(skipped.future, "the date is after today"),
    ].forEach(function (message) {
      if (message) {
        warnings.push(message);
      }
    });
    if (spacedCount) {
      warnings.push(
        spacedCount +
          (spacedCount === 1 ? " SKU has a space" : " SKUs have a space") +
          " at the start or end. " +
          (spacedCount === 1 ? "It is" : "They are") +
          " kept exactly as written."
      );
    }
    if (digitSku) {
      warnings.push(
        "Some SKUs contain only digits. A spreadsheet can drop zeros from the front of a code, so 00123 can become 123. If your codes use leading zeros, set that column to text before you export."
      );
    }
    if (slashDates > 0 && ambiguousDates === slashDates && !dateStops.length) {
      warnings.push(
        "Every day/month date in this file could be read the other way. Check the date setting against the first date line."
      );
    }

    var dateLine = buildDateLine(dayFirst, firstDateRef);
    if (dateStops.length) {
      return emptyResult(capMessages(dateStops), warnings, dateLine);
    }
    if (!parsedDates && dateCells) {
      return emptyResult(
        [
          "None of the dates fit the " +
            formatName(dayFirst) +
            " setting. Switch the date setting, or use year-month-day dates, and try again.",
        ],
        warnings,
        dateLine
      );
    }
    if (!bySku.size) {
      return emptyResult(["No usable sales rows were left after the checks above."], warnings);
    }

    var windowMondays = [];
    for (var w = WINDOW_WEEKS; w >= 1; w -= 1) {
      windowMondays.push(formatISO(addDays(startMonday, -7 * w)));
    }
    var windowStart = windowMondays[0];
    var windowEnd = windowMondays[windowMondays.length - 1];
    var firstTwo = [];
    if (earliestWeek) {
      firstTwo.push(earliestWeek);
      firstTwo.push(formatISO(addDays(parseISODate(earliestWeek), 7)));
    }
    var summaries = [];
    var anyPositive = false;

    bySku.forEach(function (bucket, sku) {
      var firstSale = "";
      Object.keys(bucket.weeks).forEach(function (week) {
        if (bucket.weeks[week] > EPS && (!firstSale || week < firstSale)) {
          firstSale = week;
        }
      });
      var fromIndex = 0;
      var weeksUsed = 0;
      if (firstSale && firstSale <= windowEnd) {
        if (firstSale <= windowStart) {
          fromIndex = 0;
          weeksUsed = WINDOW_WEEKS;
        } else {
          fromIndex = windowMondays.indexOf(firstSale);
          if (fromIndex < 0) {
            fromIndex = 0;
            weeksUsed = 0;
          } else {
            weeksUsed = WINDOW_WEEKS - fromIndex;
          }
        }
      }
      var total = 0;
      var positive = false;
      for (var i = fromIndex; i < windowMondays.length && weeksUsed; i += 1) {
        var net = bucket.weeks[windowMondays[i]] || 0;
        total += net;
        if (net > EPS) {
          positive = true;
        }
      }
      if (positive) {
        anyPositive = true;
      }
      var average = 0;
      var negative = false;
      if (weeksUsed > 0) {
        average = total / weeksUsed;
        if (average < -EPS) {
          negative = true;
          average = 0;
        } else if (average < 0) {
          average = 0;
        }
        average = round2(average);
      }
      var flags = [];
      if (weeksUsed > 0 && weeksUsed < WINDOW_WEEKS) {
        flags.push("Short history: " + weeksUsed + (weeksUsed === 1 ? " week" : " weeks"));
      }
      if (negative) {
        flags.push("Negative set to 0");
      }
      if (firstSale && firstTwo.indexOf(firstSale) !== -1) {
        flags.push("History may be longer than this file shows");
      }
      if (!positive) {
        flags.push("No sales");
      }
      summaries.push({
        sku: sku,
        weeklyForecast: average,
        weeksUsed: weeksUsed,
        firstSaleWeek: firstSale,
        locations: bucket.locationCount,
        flags: flags,
      });
    });

    summaries.sort(function (a, b) {
      if (a.sku < b.sku) {
        return -1;
      }
      if (a.sku > b.sku) {
        return 1;
      }
      return 0;
    });

    if (!anyPositive) {
      return emptyResult(
        [
          "No SKU has sales in the 12 weeks before the plan start week. Check the plan start date and the date setting.",
        ],
        warnings
      );
    }

    var weekDates = [];
    for (var h = 0; h < horizon; h += 1) {
      weekDates.push(formatISO(addDays(startMonday, 7 * h)));
    }
    var forecastRows = [];
    summaries.forEach(function (sku) {
      weekDates.forEach(function (week) {
        forecastRows.push({ sku: sku.sku, qty: sku.weeklyForecast, week: week });
      });
    });

    var forecastLines = ["SKU,Forecast Qty,Week Starting Date"];
    forecastRows.forEach(function (row) {
      forecastLines.push(csvLine([row.sku, formatQty(row.qty), row.week]));
    });
    var summaryLines = ["SKU,Weekly Forecast,Weeks Used,First Sale Week,Locations,Flags"];
    summaries.forEach(function (sku) {
      summaryLines.push(
        csvLine([
          sku.sku,
          formatQty(sku.weeklyForecast),
          String(sku.weeksUsed),
          sku.firstSaleWeek,
          String(sku.locations),
          sku.flags.join("; "),
        ])
      );
    });
    var planKey = formatISO(planStart);
    var notes = [];
    if (laterRows) {
      notes.push(
        laterRows +
          (laterRows === 1 ? " sales row falls" : " sales rows fall") +
          " in the plan start week or later, so " +
          (laterRows === 1 ? "it is" : "they are") +
          " not in the average."
      );
    }
    var locationNote =
      "Sales from " +
      locationCount +
      (locationCount === 1 ? " location are" : " locations are") +
      " added together for each SKU.";
    return {
      ok: true,
      errors: [],
      warnings: warnings,
      notes: notes,
      dateLine: dateLine,
      locationCount: locationCount,
      locationNote: locationNote,
      skus: summaries,
      weekDates: weekDates,
      forecastRows: forecastRows,
      forecastCsv: "\uFEFF" + forecastLines.join("\n") + "\n",
      summaryCsv: "\uFEFF" + summaryLines.join("\n") + "\n",
      forecastFileName: "Forecast_starter_" + planKey + ".csv",
      summaryFileName: "Starter_Forecast_summary_" + planKey + ".csv",
      previewSkuCount: Math.min(10, summaries.length),
      previewWeekCount: Math.min(4, weekDates.length),
    };
  }

  return {
    WINDOW_WEEKS: WINDOW_WEEKS,
    DEFAULT_HORIZON: DEFAULT_HORIZON,
    MIN_HORIZON: MIN_HORIZON,
    MAX_HORIZON: MAX_HORIZON,
    MAX_BYTES: MAX_BYTES,
    MAX_ROWS: MAX_ROWS,
    MAX_SKUS: MAX_SKUS,
    REQUIRED: REQUIRED,
    normalizeHeader: normalizeHeader,
    parseOrderDate: parseOrderDate,
    mondayOf: mondayOf,
    formatISO: formatISO,
    formatLong: formatLong,
    buildForecast: buildForecast,
    listAnd: listAnd,
  };
});
