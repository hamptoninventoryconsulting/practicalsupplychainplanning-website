/**
 * DIFOT Calculator.
 *
 * Purchase order lines and the optional supplier list are read in the
 * browser. Nothing in this file uploads them or puts suppliers, orders,
 * or figures into an email.
 *
 * A line is PO Number + SKU + supplier. Repeated rows are combined: the
 * largest ordered quantity, the sum of the received and damaged quantities,
 * and the latest date of each date field. An unreceived row is ignored when
 * another row in the group was received. Ordered quantities that disagree
 * are kept as the largest and warned.
 *
 * When the supplier delivers, on time compares Arrived at Your Site Date
 * with the required date. When you arrange the freight, on time compares
 * Handed to Freight Date with the required date. In full compares the
 * accepted quantity with the ordered quantity. Freight you arrange is
 * reported separately, from Handed to Freight Date to Arrived at Your Site
 * Date, and does not change DIFOT.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DifotCalculator = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var MAX_PO_BYTES = 10 * 1024 * 1024;
  var MAX_PO_ROWS = 200000;
  var MAX_SUPPLIER_BYTES = 1 * 1024 * 1024;
  var MAX_SUPPLIERS = 5000;
  var MAX_MONTHS_ON_SCREEN = 24;
  var HELP_LINE =
    "Missing dates? Add Arrived at Your Site Date from the day the goods arrived. If you arrange the freight add Handed to Freight Date from the freight company's paperwork or tracking before you upload.";
  var PO_FIELDS = [
    ["po_number", "PO Number", true],
    ["supplier", "Supplier", true],
    ["sku", "SKU", true],
    ["ordered_qty", "Ordered Qty", true],
    ["required_date", "Required Date", true],
    ["arrived_at_your_site_date", "Arrived at Your Site Date", true, false],
    ["received_qty", "Received Qty", true, false],
    ["damaged_qty", "Damaged Qty", false],
    ["damaged_reason", "Damaged Reason", false],
    ["handed_to_freight_date", "Handed to Freight Date", false],
  ];
  var SUPPLIER_FIELDS = [
    ["supplier", "Supplier", true],
    ["freight_arranged_by", "Freight arranged by", true],
    ["expected_transit_days", "Expected transit days", false],
  ];
  var SUMMARY_HEADER = [
    "Level",
    "Supplier",
    "Month",
    "Lines",
    "On Time Lines",
    "In Full Lines",
    "DIFOT Lines",
    "On Time %",
    "In Full %",
    "DIFOT %",
    "Avg Days Late",
    "Freight On Time Lines",
    "Freight On Time %",
    "Average Transit Days",
    "Longest Transit Days",
    "Note",
  ];
  var LINES_HEADER = [
    "PO Number",
    "Supplier",
    "SKU",
    "Ordered Qty",
    "Received Qty",
    "Damaged Qty",
    "Accepted Qty",
    "Required Date",
    "Arrived at Your Site Date",
    "Handed to Freight Date",
    "Days Late",
    "On Time",
    "In Full",
    "DIFOT",
    "Reason",
    "Counted",
    "Rows Combined",
    "Transit Days",
    "Freight On Time",
  ];
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
      .replace(/[\s_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function parseCsv(text) {
    var source = String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    if (source.indexOf('"') === -1) {
      if (!source) {
        return [];
      }
      var plain = source.split("\n");
      var plainRows = [];
      for (var p = 0; p < plain.length; p += 1) {
        if (plain[p] === "" && p === plain.length - 1) {
          continue;
        }
        plainRows.push(plain[p].split(","));
      }
      return plainRows;
    }
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

  function isHelpRow(cells) {
    return String(cells[0] == null ? "" : cells[0]).trim() === HELP_LINE;
  }

  function csvField(value) {
    var text = String(value == null ? "" : value);
    var quote = false;
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code === 34 || code === 44 || code === 10 || code === 13) {
        quote = true;
        break;
      }
    }
    if (!quote && text !== text.trim()) {
      quote = true;
    }
    if (!quote) {
      return text;
    }
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function csvLine(cells) {
    return cells.map(csvField).join(",");
  }

  var datesByKey = Object.create(null);
  var isoTextByDate = typeof WeakMap === "function" ? new WeakMap() : null;

  function utcDate(year, month, day) {
    var key = (year * 100 + month) * 100 + day;
    if (Object.prototype.hasOwnProperty.call(datesByKey, key)) {
      return datesByKey[key];
    }
    var dt = null;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dt = new Date(Date.UTC(year, month - 1, day));
      if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
        dt = null;
      }
    }
    datesByKey[key] = dt;
    return dt;
  }

  function addDays(date, days) {
    var next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function formatISO(date) {
    if (isoTextByDate) {
      var cached = isoTextByDate.get(date);
      if (cached) {
        return cached;
      }
    }
    var month = String(date.getUTCMonth() + 1);
    var day = String(date.getUTCDate());
    if (month.length < 2) {
      month = "0" + month;
    }
    if (day.length < 2) {
      day = "0" + day;
    }
    var text = date.getUTCFullYear() + "-" + month + "-" + day;
    if (isoTextByDate) {
      isoTextByDate.set(date, text);
    }
    return text;
  }

  function formatLong(date) {
    return date.getUTCDate() + " " + MONTHS[date.getUTCMonth()] + " " + date.getUTCFullYear();
  }

  function parseISODate(text) {
    var match = String(text || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    return utcDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  function monthKey(date) {
    var month = String(date.getUTCMonth() + 1);
    if (month.length < 2) {
      month = "0" + month;
    }
    return date.getUTCFullYear() + "-" + month;
  }

  function daysBetween(later, earlier) {
    return Math.round((later.getTime() - earlier.getTime()) / 86400000);
  }

  function slashFields(text) {
    return text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  }

  function slashDate(match, dayFirst) {
    var first = Number(match[1]);
    var second = Number(match[2]);
    var year = Number(match[3]);
    var day = dayFirst ? first : second;
    var month = dayFirst ? second : first;
    return utcDate(year, month, day);
  }

  function fastIso(text) {
    for (var i = 0; i < 10; i += 1) {
      if (i === 4 || i === 7) {
        continue;
      }
      var code = text.charCodeAt(i);
      if (code < 48 || code > 57) {
        return null;
      }
    }
    if (text.length > 10) {
      var sep = text.charCodeAt(10);
      if (sep !== 84 && sep !== 32) {
        return null;
      }
    }
    var year =
      (text.charCodeAt(0) - 48) * 1000 +
      (text.charCodeAt(1) - 48) * 100 +
      (text.charCodeAt(2) - 48) * 10 +
      (text.charCodeAt(3) - 48);
    var month = (text.charCodeAt(5) - 48) * 10 + (text.charCodeAt(6) - 48);
    var day = (text.charCodeAt(8) - 48) * 10 + (text.charCodeAt(9) - 48);
    var isoDate = utcDate(year, month, day);
    if (!isoDate) {
      return { ok: false, reason: "unreadable", original: text };
    }
    return { ok: true, date: isoDate, iso: true, ambiguous: false, original: text };
  }

  function parseDate(raw, dayFirst) {
    var text = raw == null ? "" : typeof raw === "string" ? raw : String(raw);
    if (text.charCodeAt(0) <= 32 || text.charCodeAt(text.length - 1) <= 32) {
      text = text.trim();
    }
    if (!text) {
      return { ok: false, reason: "blank" };
    }
    if (text.length >= 10 && text.charCodeAt(4) === 45 && text.charCodeAt(7) === 45) {
      var fast = fastIso(text);
      if (fast) {
        return fast;
      }
    }
    if (/^\d+(\.\d+)?$/.test(text)) {
      return { ok: false, reason: "excel", original: text };
    }
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (iso) {
      var isoDate = utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      if (!isoDate) {
        return { ok: false, reason: "unreadable", original: text };
      }
      return { ok: true, date: isoDate, iso: true, ambiguous: false, original: text };
    }
    if (/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(text)) {
      return { ok: false, reason: "shortYear", original: text };
    }
    var parts = slashFields(text);
    if (!parts) {
      return { ok: false, reason: "unreadable", original: text };
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
    var prefix = "Dates read as " + formatName(dayFirst) + ". First date " + shownDate(ref.original);
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

  function parseNumber(raw) {
    if (raw == null) {
      return { blank: true, value: null };
    }
    var text = typeof raw === "string" ? raw : String(raw);
    if (text.charCodeAt(0) <= 32 || text.charCodeAt(text.length - 1) <= 32) {
      text = text.trim();
    }
    if (text === "") {
      return { blank: true, value: null };
    }
    var sign = 1;
    var start = 0;
    if (text.charCodeAt(0) === 45) {
      sign = -1;
      start = 1;
    }
    var digits = start < text.length;
    var whole = 0;
    for (var i = start; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code < 48 || code > 57) {
        digits = false;
        break;
      }
      whole = whole * 10 + (code - 48);
    }
    if (digits) {
      return { blank: false, value: sign * whole };
    }
    if (text.indexOf(",") !== -1) {
      if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
        return { blank: false, value: null, thousands: true };
      }
      text = text.replace(/,/g, "");
    }
    if (!/^-?\d+(\.\d+)?$/.test(text)) {
      return { blank: false, value: null };
    }
    var value = Number(text);
    if (!isFinite(value)) {
      return { blank: false, value: null };
    }
    return { blank: false, value: value };
  }

  function formatNumber(value) {
    if (value == null || value === "") {
      return "";
    }
    var rounded = Math.round(value * 10000) / 10000;
    if (Object.is(rounded, -0) || rounded === 0) {
      return "0";
    }
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
      return String(Math.round(rounded));
    }
    return String(rounded);
  }

  function formatPct(count, total) {
    if (!total) {
      return "";
    }
    return (Math.round((count / total) * 1000) / 10).toFixed(1);
  }

  function formatAvg(sum, count) {
    if (!count) {
      return "";
    }
    var value = Math.round((sum / count) * 10) / 10;
    if (Object.is(value, -0)) {
      value = 0;
    }
    return value.toFixed(1);
  }

  function formatPercentNumber(value) {
    var rounded = Math.round(value * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
      return String(Math.round(rounded));
    }
    return rounded.toFixed(1);
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

  function rowPhrase(rows, total) {
    var shown = rows.slice(0, 10);
    var text = (shown.length === 1 ? "Row " : "Rows ") + shown.join(", ");
    var more = (total == null ? rows.length : total) - shown.length;
    if (more > 0) {
      text += ", and " + more + " more";
    }
    return text;
  }

  function capMessages(messages) {
    if (messages.length <= 10) {
      return messages.slice();
    }
    var more = messages.length - 10;
    return messages.slice(0, 10).concat(["and " + more + " more"]);
  }

  function skipBucket() {
    return { count: 0, rows: [] };
  }

  function noteSkip(bucket, rowNumber) {
    bucket.count += 1;
    if (bucket.rows.length < 10) {
      bucket.rows.push(rowNumber);
    }
  }

  var THOUSANDS_HINT = "A thousands separator must group digits in threes, such as 1,000";

  function fieldText(value) {
    return String(value == null ? "" : value).trim();
  }

  function requiredMap(fields) {
    var map = Object.create(null);
    fields.forEach(function (field) {
      var requiredOnRow = field.length > 3 ? field[3] : field[2];
      if (requiredOnRow) {
        map[field[0]] = field[1];
      }
    });
    return map;
  }

  function rowShape(cells, headerCount, normalizedHeaders, requiredLookup, rawHeaders) {
    var i;
    if (cells.length > headerCount) {
      for (i = headerCount; i < cells.length; i += 1) {
        if (fieldText(cells[i]) !== "") {
          return { kind: "extra" };
        }
      }
      return { kind: "ok", cells: cells.slice(0, headerCount) };
    }
    if (cells.length < headerCount) {
      for (i = cells.length; i < headerCount; i += 1) {
        if (requiredLookup[normalizedHeaders[i]]) {
          var raw = rawHeaders ? fieldText(rawHeaders[i]) : "";
          return { kind: "short", column: raw || requiredLookup[normalizedHeaders[i]] };
        }
      }
      var padded = cells.slice();
      while (padded.length < headerCount) {
        padded.push("");
      }
      return { kind: "ok", cells: padded };
    }
    return { kind: "ok", cells: cells };
  }

  function shapeRows(dataRows, headerCount, normalizedHeaders, requiredLookup, rawHeaders) {
    var extras = [];
    var shorts = [];
    var skip = Object.create(null);
    for (var i = 0; i < dataRows.length; i += 1) {
      var shape = rowShape(dataRows[i], headerCount, normalizedHeaders, requiredLookup, rawHeaders);
      var rowNumber = i + 2;
      if (shape.kind === "extra") {
        extras.push(rowNumber);
        skip[rowNumber] = true;
      } else if (shape.kind === "short") {
        shorts.push({ row: rowNumber, column: shape.column });
        skip[rowNumber] = true;
      } else {
        dataRows[i] = shape.cells;
      }
    }
    return { extras: extras, shorts: shorts, skip: skip };
  }

  function rowsLeftOut(rowNumbers, reason) {
    if (!rowNumbers.length) {
      return "";
    }
    var bucket = skipBucket();
    rowNumbers.forEach(function (rowNumber) {
      noteSkip(bucket, rowNumber);
    });
    var pronoun = bucket.count === 1 ? "it has" : "they have";
    return skipWarning(bucket, pronoun + " " + reason);
  }

  function columnWarnings(prefix, extras, shorts) {
    var messages = [];
    var extraMessage = rowsLeftOut(
      extras,
      'more columns than the header. Put any value with a comma in quotes, such as "1,000" or "Acme, Ltd"'
    );
    if (extraMessage) {
      messages.push(prefix + extraMessage);
    }
    var byColumn = Object.create(null);
    var columns = [];
    shorts.forEach(function (item) {
      if (!byColumn[item.column]) {
        byColumn[item.column] = [];
        columns.push(item.column);
      }
      byColumn[item.column].push(item.row);
    });
    columns.forEach(function (column) {
      var shortMessage = rowsLeftOut(
        byColumn[column],
        "fewer columns than the header. " + column + " is missing"
      );
      if (shortMessage) {
        messages.push(prefix + shortMessage);
      }
    });
    return messages;
  }

  function skipWarning(bucket, detail) {
    if (!bucket.count) {
      return "";
    }
    return (
      rowPhrase(bucket.rows, bucket.count) +
      " " +
      (bucket.count === 1 ? "was" : "were") +
      " left out because " +
      detail +
      "."
    );
  }

  function rowNote(bucket, detail) {
    if (!bucket.count) {
      return "";
    }
    return rowPhrase(bucket.rows, bucket.count) + ": " + detail + ".";
  }

  function handedBlankWarning(items) {
    if (!items.length) {
      return "";
    }
    var shown = items.slice(0, 10).map(function (item) {
      return "PO " + item.po + ", SKU " + item.sku;
    });
    var more = items.length - shown.length;
    var lead;
    if (items.length === 1) {
      lead = shown[0] + " was left out";
    } else {
      lead = shown.join("; ");
      if (more > 0) {
        lead += "; and " + more + " more";
      }
      lead += " were left out";
    }
    return (
      lead +
      " because Handed to Freight Date is blank. You arrange the freight, so on time is the date the goods were handed to the freight company."
    );
  }

  function cell(cells, index) {
    if (index == null || index < 0) {
      return "";
    }
    return cells[index] == null ? "" : cells[index];
  }

  function columnIndex(headers, key) {
    return headers.indexOf(key);
  }

  function missingHeaders(headers, fields) {
    return fields
      .filter(function (field) {
        return field[2] && headers.indexOf(field[0]) === -1;
      })
      .map(function (field) {
        return field[1];
      });
  }

  function missingHeaderError(missing) {
    var label = missing.length === 1 ? "column" : "columns";
    return (
      "We couldn't find the " +
      listAnd(missing) +
      " " +
      label +
      ". Download the template and match those column names."
    );
  }

  function emptyResult(errors, warnings, dateLine, notes) {
    return {
      ok: false,
      errors: errors || [],
      warnings: warnings || [],
      notes: notes || [],
      dateLine: dateLine || "",
      summaryLine: "",
      settings: [],
      overall: null,
      suppliers: [],
      months: [],
      monthsHidden: 0,
      freight: [],
      freightNote: "",
      summaryCsv: "",
      linesCsv: "",
      summaryFileName: "",
      linesFileName: "",
    };
  }

  function fileProvided(fileName, text) {
    return String(fileName || "") !== "" || String(text || "") !== "";
  }

  function checkFile(fileName, text, byteLength, maxBytes, maxRows, sizeError, rowError) {
    if (!/\.csv$/i.test(String(fileName || ""))) {
      return ["Save it as CSV UTF-8 and try again."];
    }
    var size = byteLength != null ? Number(byteLength) : utf8Size(text);
    if (!isFinite(size) || size > maxBytes) {
      return [sizeError];
    }
    if (usesSemicolons(text)) {
      return ["This file uses semicolons. Save it as a comma-separated CSV and try again."];
    }
    var table = parseCsv(text).filter(function (cells) {
      return !rowIsEmpty(cells) && !isHelpRow(cells);
    });
    if (!table.length) {
      return ["The file has no header row. Download the template and match those column names."];
    }
    var dataRows = table.slice(1);
    if (dataRows.length > maxRows) {
      return [rowError];
    }
    return { table: table, headers: table[0].map(normalizeHeader), dataRows: dataRows };
  }

  function freightMode(raw) {
    var text = String(raw == null ? "" : raw)
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
    if (!text) {
      return { ok: true, mode: "supplier", blank: true };
    }
    if (text === "supplier" || text === "supplier delivers") {
      return { ok: true, mode: "supplier", blank: false };
    }
    if (text === "me" || text === "i arrange freight") {
      return { ok: true, mode: "me", blank: false };
    }
    return { ok: false, original: String(raw == null ? "" : raw).trim() };
  }

  function freightLabel(mode) {
    return mode === "me" ? "I arrange freight" : "Supplier delivers";
  }

  function readWhole(value, fallback, min, max, label) {
    if (value == null || value === "") {
      return { ok: true, value: fallback };
    }
    var number = Number(value);
    if (!isFinite(number) || Math.floor(number) !== number || number < min || number > max) {
      return { ok: false, error: label + " must be a whole number from " + min + " to " + max + "." };
    }
    return { ok: true, value: number };
  }

  function nearlyEqual(a, b) {
    return Math.abs(a - b) <= 1e-9;
  }

  function sameQty(values) {
    for (var i = 1; i < values.length; i += 1) {
      if (!nearlyEqual(values[i], values[0])) {
        return false;
      }
    }
    return true;
  }

  function uniqueNumbers(values) {
    var list = [];
    values.forEach(function (value) {
      var seen = list.some(function (item) {
        return nearlyEqual(item, value);
      });
      if (!seen) {
        list.push(value);
      }
    });
    list.sort(function (a, b) {
      return a - b;
    });
    return list;
  }

  function yn(flag) {
    return flag ? "Y" : "N";
  }

  function tally() {
    return {
      lines: 0,
      onTime: 0,
      inFull: 0,
      difot: 0,
      late: 0,
      short: 0,
      lateDays: 0,
    };
  }

  function addTally(bucket, line) {
    bucket.lines += 1;
    if (line.onTime) {
      bucket.onTime += 1;
    }
    if (line.inFull) {
      bucket.inFull += 1;
    }
    if (line.difot) {
      bucket.difot += 1;
    }
    if (line.late) {
      bucket.late += 1;
      bucket.lateDays += line.daysLate;
    }
    if (line.short) {
      bucket.short += 1;
    }
  }

  function tallyFields(bucket) {
    return {
      lines: bucket.lines,
      onTimeLines: bucket.onTime,
      inFullLines: bucket.inFull,
      difotLines: bucket.difot,
      onTimePct: formatPct(bucket.onTime, bucket.lines),
      inFullPct: formatPct(bucket.inFull, bucket.lines),
      difotPct: formatPct(bucket.difot, bucket.lines),
      lateLines: bucket.late,
      shortLines: bucket.short,
      avgDaysLate: formatAvg(bucket.lateDays, bucket.late),
    };
  }

  function summaryCells(level, supplier, month, fields, freight, note) {
    var row = freight || {};
    return [
      level,
      supplier || "",
      month || "",
      String(fields ? fields.lines : row.lines || 0),
      fields ? String(fields.onTimeLines) : "",
      fields ? String(fields.inFullLines) : "",
      fields ? String(fields.difotLines) : "",
      fields ? fields.onTimePct : "",
      fields ? fields.inFullPct : "",
      fields ? fields.difotPct : "",
      fields ? fields.avgDaysLate : "",
      row.onTimeLines == null || row.onTimeLines === "" ? "" : String(row.onTimeLines),
      row.onTimePct || "",
      row.averageTransit || "",
      row.longestTransit || "",
      note || row.note || "",
    ];
  }

  function buildDifot(options) {
    var input = options || {};
    var dayFirst = input.dayFirst !== false;
    var early = readWhole(input.daysEarly, 2, 0, 60, "Days early allowed");
    if (!early.ok) {
      return emptyResult([early.error]);
    }
    var late = readWhole(input.daysLate, 0, 0, 60, "Days late allowed");
    if (!late.ok) {
      return emptyResult([late.error]);
    }
    var shortfall = readWhole(input.shortfallPct, 0, 0, 50, "Shortfall allowed");
    if (!shortfall.ok) {
      return emptyResult([shortfall.error]);
    }
    var overOk = input.overDeliveryInFull !== false;
    var asAt = parseISODate(input.asAt);
    if (!asAt) {
      return emptyResult(["Choose an as-at date."]);
    }
    var measureFrom = null;
    var measureTo = null;
    if (String(input.measureFrom || "").trim() !== "") {
      measureFrom = parseISODate(input.measureFrom);
      if (!measureFrom) {
        return emptyResult(["Choose a valid measure-from date."]);
      }
    }
    if (String(input.measureTo || "").trim() !== "") {
      measureTo = parseISODate(input.measureTo);
      if (!measureTo) {
        return emptyResult(["Choose a valid measure-to date."]);
      }
    }
    if (measureFrom && measureTo && formatISO(measureFrom) > formatISO(measureTo)) {
      return emptyResult(["The measure-from date must be on or before the measure-to date."]);
    }
    if (!fileProvided(input.poFileName, input.poText)) {
      return emptyResult(["Choose a purchase order CSV."]);
    }

    var supplierWarnings = [];
    var master = null;
    if (fileProvided(input.supplierFileName, input.supplierText)) {
      var supplierLoaded = checkFile(
        input.supplierFileName,
        input.supplierText,
        input.supplierByteLength,
        MAX_SUPPLIER_BYTES,
        MAX_SUPPLIERS,
        "This supplier list is over 1 MB. Export a shorter file and try again.",
        "This supplier list has more than 5,000 suppliers. Split the file and try again."
      );
      if (Array.isArray(supplierLoaded)) {
        return emptyResult(
          supplierLoaded.map(function (message) {
            if (message.toLowerCase().indexOf("supplier list") !== -1) {
              return message;
            }
            return "Supplier list: " + message;
          })
        );
      }
      var supplierMissing = missingHeaders(supplierLoaded.headers, SUPPLIER_FIELDS);
      if (supplierMissing.length) {
        return emptyResult(["Supplier list: " + missingHeaderError(supplierMissing)]);
      }
      var supplierCols = {
        supplier: columnIndex(supplierLoaded.headers, "supplier"),
        freight: columnIndex(supplierLoaded.headers, "freight_arranged_by"),
        transit: columnIndex(supplierLoaded.headers, "expected_transit_days"),
      };
      var supplierShape = shapeRows(
        supplierLoaded.dataRows,
        supplierLoaded.headers.length,
        supplierLoaded.headers,
        requiredMap(SUPPLIER_FIELDS),
        supplierLoaded.table[0]
      );
      if (supplierShape.extras.length * 2 > supplierLoaded.dataRows.length) {
        return emptyResult(columnWarnings("Supplier list: ", supplierShape.extras, []));
      }
      columnWarnings("Supplier list: ", supplierShape.extras, supplierShape.shorts).forEach(function (message) {
        supplierWarnings.push(message);
      });
      master = new Map();
      for (var s = 0; s < supplierLoaded.dataRows.length; s += 1) {
        var supplierCells = supplierLoaded.dataRows[s];
        var supplierRow = s + 2;
        if (supplierShape.skip[supplierRow]) {
          continue;
        }
        var supplierRaw = String(cell(supplierCells, supplierCols.supplier));
        var supplierName = supplierRaw.trim();
        if (!supplierName) {
          supplierWarnings.push(
            "Row " + supplierRow + " was left out of the supplier list because the supplier name is blank."
          );
          continue;
        }
        if (supplierRaw !== supplierName) {
          supplierWarnings.push(
            "Row " + supplierRow + ": spaces were removed from the start or end of " + supplierName + "."
          );
        }
        var mode = freightMode(cell(supplierCells, supplierCols.freight));
        if (!mode.ok) {
          return emptyResult([
            "Supplier list: row " +
              supplierRow +
              ': freight arranged by is "' +
              mode.original +
              '". Use Supplier, Supplier delivers, Me, or I arrange freight.',
          ]);
        }
        var transit = null;
        var transitRaw = cell(supplierCells, supplierCols.transit);
        if (String(transitRaw == null ? "" : transitRaw).trim() !== "") {
          if (!/^\d+$/.test(String(transitRaw).trim())) {
            return emptyResult([
              "Supplier list: row " +
                supplierRow +
                ": expected transit days must be a whole number from 0 to 365.",
            ]);
          }
          transit = Number(String(transitRaw).trim());
          if (transit > 365) {
            return emptyResult([
              "Supplier list: row " +
                supplierRow +
                ": expected transit days must be a whole number from 0 to 365.",
            ]);
          }
        }
        var supplierKey = supplierName.toLowerCase();
        if (master.has(supplierKey)) {
          master.get(supplierKey).rows.push(supplierRow);
        } else {
          master.set(supplierKey, {
            name: supplierName,
            mode: mode.mode,
            blankFreight: mode.blank,
            transit: transit,
            rows: [supplierRow],
            used: false,
          });
        }
      }
      var duplicateMessages = [];
      master.forEach(function (entry) {
        if (entry.rows.length > 1) {
          duplicateMessages.push(
            "Supplier list: " +
              entry.name +
              " is on rows " +
              listAnd(entry.rows.slice(0, 10).map(String)) +
              (entry.rows.length > 10 ? ", and " + (entry.rows.length - 10) + " more" : "") +
              ". A supplier can appear only once."
          );
        }
      });
      if (duplicateMessages.length) {
        return emptyResult(capMessages(duplicateMessages));
      }
      master.forEach(function (entry) {
        if (entry.blankFreight) {
          supplierWarnings.push(
            "Supplier list: freight arranged by is blank for " +
              entry.name +
              ". Treated as Supplier delivers."
          );
        }
      });
    }

    var poLoaded = checkFile(
      input.poFileName,
      input.poText,
      input.poByteLength,
      MAX_PO_BYTES,
      MAX_PO_ROWS,
      "This purchase order file is over 10 MB. Export a shorter file and try again.",
      "This purchase order file has more than 200,000 data rows. Export a shorter file and try again."
    );
    if (Array.isArray(poLoaded)) {
      return emptyResult(poLoaded);
    }
    var poMissing = missingHeaders(poLoaded.headers, PO_FIELDS);
    if (poMissing.length) {
      return emptyResult([missingHeaderError(poMissing)]);
    }
    var cols = {};
    PO_FIELDS.forEach(function (field) {
      cols[field[0]] = columnIndex(poLoaded.headers, field[0]);
    });
    if (!poLoaded.dataRows.length) {
      return emptyResult(["The file has no purchase order lines under the header."]);
    }
    var poShape = shapeRows(
      poLoaded.dataRows,
      poLoaded.headers.length,
      poLoaded.headers,
      requiredMap(PO_FIELDS),
      poLoaded.table[0]
    );
    if (poShape.extras.length * 2 > poLoaded.dataRows.length) {
      return emptyResult(columnWarnings("", poShape.extras, []));
    }

    var skipped = {
      identity: skipBucket(),
      required: skipBucket(),
      ordered: skipBucket(),
      orderedComma: skipBucket(),
      received: skipBucket(),
      receivedComma: skipBucket(),
      damaged: skipBucket(),
      damagedComma: skipBucket(),
      damagedOver: skipBucket(),
      judge: skipBucket(),
      judgeHanded: skipBucket(),
      excel: skipBucket(),
      future: skipBucket(),
      futureHanded: skipBucket(),
      unreadableSite: skipBucket(),
      unreadableHanded: skipBucket(),
      siteUnreadKept: skipBucket(),
      futureSiteKept: skipBucket(),
    };
    var ignoredHanded = Object.create(null);
    var handedBlank = [];
    var dateStops = [];
    var firstDateRef = null;
    var slashDates = 0;
    var ambiguousDates = 0;
    var groups = new Map();
    var groupOrder = [];
    var digitLengths = Object.create(null);
    var digitSku = false;

    function noteFirst(parsed) {
      if (firstDateRef || !parsed || !parsed.original) {
        return;
      }
      if (parsed.ok) {
        firstDateRef = { original: parsed.original, date: parsed.date, chosen: true };
        return;
      }
      if (parsed.reason === "impossible" || parsed.reason === "shortYear") {
        firstDateRef = { original: parsed.original, date: parsed.otherDate || null, chosen: false };
      }
    }

    function countAmbiguity(parsed) {
      if (!parsed.ok || parsed.iso) {
        return;
      }
      slashDates += 1;
      if (parsed.ambiguous) {
        ambiguousDates += 1;
      }
    }

    function stopDate(parsed, rowNumber) {
      dateStops.push(dateStopMessage(parsed, rowNumber, dayFirst));
    }

    function modeFor(supplierName) {
      if (!master) {
        return "supplier";
      }
      var entry = master.get(String(supplierName || "").trim().toLowerCase());
      return entry ? entry.mode : "supplier";
    }

    function takeDate(raw) {
      var parsed = parseDate(raw, dayFirst);
      if (String(raw == null ? "" : raw).trim() !== "") {
        noteFirst(parsed);
      }
      if (parsed.ok) {
        countAmbiguity(parsed);
      }
      return parsed;
    }

    function blockingDate(parsed, rowNumber) {
      if (parsed.ok || parsed.reason === "blank") {
        return false;
      }
      if (parsed.reason === "excel") {
        noteSkip(skipped.excel, rowNumber);
        return true;
      }
      if (parsed.reason === "impossible" || parsed.reason === "shortYear") {
        stopDate(parsed, rowNumber);
        return true;
      }
      return false;
    }

    for (var r = 0; r < poLoaded.dataRows.length; r += 1) {
      var cells = poLoaded.dataRows[r];
      var rowNumber = r + 2;
      if (poShape.skip[rowNumber]) {
        continue;
      }
      var poRaw = String(cell(cells, cols.po_number));
      var supplierRaw = String(cell(cells, cols.supplier));
      var skuRaw = String(cell(cells, cols.sku));
      var po = poRaw.trim();
      var supplierTrim = supplierRaw.trim();
      var sku = skuRaw.trim();
      if (!po || !supplierTrim || !sku) {
        noteSkip(skipped.identity, rowNumber);
        continue;
      }
      var requiredParsed = parseDate(cell(cells, cols.required_date), dayFirst);
      noteFirst(requiredParsed);
      if (!requiredParsed.ok) {
        if (requiredParsed.reason === "blank" || requiredParsed.reason === "unreadable") {
          noteSkip(skipped.required, rowNumber);
        } else if (requiredParsed.reason === "excel") {
          noteSkip(skipped.excel, rowNumber);
        } else {
          stopDate(requiredParsed, rowNumber);
        }
        continue;
      }
      countAmbiguity(requiredParsed);

      var ordered = parseNumber(cell(cells, cols.ordered_qty));
      if (ordered.thousands) {
        noteSkip(skipped.orderedComma, rowNumber);
        continue;
      }
      if (ordered.blank || ordered.value == null || ordered.value <= 0) {
        noteSkip(skipped.ordered, rowNumber);
        continue;
      }
      var received = parseNumber(cell(cells, cols.received_qty));
      if (received.thousands) {
        noteSkip(skipped.receivedComma, rowNumber);
        continue;
      }
      if (!received.blank && (received.value == null || received.value < 0)) {
        noteSkip(skipped.received, rowNumber);
        continue;
      }
      var damaged = parseNumber(cell(cells, cols.damaged_qty));
      if (damaged.thousands) {
        noteSkip(skipped.damagedComma, rowNumber);
        continue;
      }
      if (!damaged.blank && (damaged.value == null || damaged.value < 0)) {
        noteSkip(skipped.damaged, rowNumber);
        continue;
      }
      var damagedQty = damaged.blank ? 0 : damaged.value;
      var receivedQty = received.blank ? 0 : received.value;
      if (damagedQty - receivedQty > 1e-9) {
        noteSkip(skipped.damagedOver, rowNumber);
        continue;
      }

      var siteParsed = takeDate(cell(cells, cols.arrived_at_your_site_date));
      if (blockingDate(siteParsed, rowNumber)) {
        continue;
      }
      var handedParsed = takeDate(cell(cells, cols.handed_to_freight_date));
      if (blockingDate(handedParsed, rowNumber)) {
        continue;
      }

      var mode = modeFor(supplierTrim);
      var siteDate = siteParsed.ok ? siteParsed.date : null;
      var handedDate = handedParsed.ok ? handedParsed.date : null;
      var asAtText = formatISO(asAt);
      if (mode === "me") {
        if (!handedParsed.ok && handedParsed.reason === "unreadable") {
          noteSkip(skipped.unreadableHanded, rowNumber);
          continue;
        }
        if (!siteParsed.ok && siteParsed.reason === "unreadable") {
          noteSkip(skipped.siteUnreadKept, rowNumber);
          siteDate = null;
        }
        if (handedDate && formatISO(handedDate) > asAtText) {
          noteSkip(skipped.futureHanded, rowNumber);
          continue;
        }
        if (siteDate && formatISO(siteDate) > asAtText) {
          if (handedDate) {
            noteSkip(skipped.futureSiteKept, rowNumber);
          } else {
            siteDate = null;
          }
        }
        if (handedDate && (received.blank || receivedQty <= 0)) {
          noteSkip(skipped.judgeHanded, rowNumber);
          continue;
        }
      } else {
        if (!siteParsed.ok && siteParsed.reason === "unreadable") {
          noteSkip(skipped.unreadableSite, rowNumber);
          continue;
        }
        if (String(cell(cells, cols.handed_to_freight_date)).trim() !== "") {
          ignoredHanded[supplierTrim] = true;
        }
        if ((receivedQty > 0 && !siteDate) || (siteDate && (received.blank || receivedQty <= 0))) {
          noteSkip(skipped.judge, rowNumber);
          continue;
        }
        if (siteDate && formatISO(siteDate) > asAtText) {
          noteSkip(skipped.future, rowNumber);
          continue;
        }
      }

      var spaced = supplierRaw !== supplierTrim || skuRaw !== sku;
      if (/^\d+$/.test(sku)) {
        digitSku = true;
        digitLengths[String(sku.length)] = true;
      }
      var supplierKey = supplierTrim.toLowerCase();
      var key = supplierKey + "\n" + po + "\n" + sku;
      var group = groups.get(key);
      if (!group) {
        group = {
          po: po,
          sku: sku,
          supplierKey: supplierKey,
          supplierName: supplierTrim,
          spaced: false,
          parts: [],
        };
        groups.set(key, group);
        groupOrder.push(group);
      }
      if (spaced) {
        group.spaced = true;
      }
      group.parts.push({
        rowNumber: rowNumber,
        ordered: ordered.value,
        received: receivedQty,
        receivedBlank: received.blank,
        damaged: damagedQty,
        reason: String(cell(cells, cols.damaged_reason)).trim(),
        required: requiredParsed.date,
        arrivedSite: siteDate,
        handed: handedDate,
        spaced: spaced,
      });
    }

    var warnings = supplierWarnings.slice();
    columnWarnings("", poShape.extras, poShape.shorts).forEach(function (message) {
      warnings.push(message);
    });
    [
      skipWarning(skipped.identity, "the PO number, supplier or SKU is blank"),
      skipWarning(skipped.required, "the required date is blank or could not be read"),
      skipWarning(skipped.ordered, "the ordered quantity must be a number above 0"),
      skipWarning(
        skipped.orderedComma,
        "the ordered quantity is not a number. " + THOUSANDS_HINT
      ),
      skipWarning(skipped.received, "the received quantity is not a number or is negative"),
      skipWarning(
        skipped.receivedComma,
        "the received quantity is not a number. " + THOUSANDS_HINT
      ),
      skipWarning(skipped.damaged, "the damaged quantity is not a number or is negative"),
      skipWarning(
        skipped.damagedComma,
        "the damaged quantity is not a number. " + THOUSANDS_HINT
      ),
      skipWarning(skipped.damagedOver, "the damaged quantity is greater than the received quantity"),
      skipWarning(
        skipped.judge,
        "a received quantity and an Arrived at Your Site Date are both needed to judge the line"
      ),
      skipWarning(
        skipped.judgeHanded,
        "a received quantity and a Handed to Freight Date are both needed to judge the line"
      ),
      skipWarning(skipped.excel, "the date is an Excel date number. Save dates as dates"),
      skipWarning(skipped.future, "the Arrived at Your Site Date is after the as-at date"),
      skipWarning(skipped.futureHanded, "the Handed to Freight Date is after the as-at date"),
      skipWarning(skipped.unreadableSite, "Arrived at Your Site Date could not be read"),
      skipWarning(skipped.unreadableHanded, "Handed to Freight Date could not be read"),
      rowNote(skipped.siteUnreadKept, "Arrived at Your Site Date could not be read and was not used"),
      rowNote(
        skipped.futureSiteKept,
        "Arrived at Your Site Date is after the as-at date and was not used for the freight figures"
      ),
    ].forEach(function (message) {
      if (message) {
        warnings.push(message);
      }
    });

    var spacedSeen = [];
    var spacedTotal = 0;
    groupOrder.forEach(function (group) {
      group.parts.forEach(function (part) {
        if (!part.spaced) {
          return;
        }
        spacedTotal += 1;
        if (spacedSeen.length < 10) {
          spacedSeen.push(part.rowNumber);
        }
      });
    });
    if (spacedTotal) {
      warnings.push(
        rowPhrase(spacedSeen, spacedTotal) +
          (spacedTotal === 1 ? " had a space" : " had spaces") +
          " at the start or end of the SKU or supplier. " +
          (spacedTotal === 1 ? "It was removed." : "They were removed.")
      );
    }
    if (digitSku && Object.keys(digitLengths).length > 1) {
      warnings.push(
        "Some SKUs contain only digits and are different lengths. A spreadsheet can drop zeros from the front of a code, so 00123 can become 123. If your codes use leading zeros, set that column to text before you export."
      );
    }
    var dateLine = buildDateLine(dayFirst, firstDateRef);
    if (slashDates > 0 && ambiguousDates === slashDates && !dateStops.length) {
      warnings.push(
        "Every day and month date in this file could be read the other way. Check the first date line."
      );
    }
    if (dateStops.length) {
      return emptyResult(capMessages(dateStops), warnings, dateLine);
    }
    if (!groupOrder.length) {
      return emptyResult(["No usable purchase order lines were left after the checks above."], warnings, dateLine);
    }

    var fileFrom = null;
    var fileTo = null;
    groupOrder.forEach(function (group) {
      group.parts.forEach(function (part) {
        var key = formatISO(part.required);
        if (!fileFrom || key < fileFrom) {
          fileFrom = key;
        }
        if (!fileTo || key > fileTo) {
          fileTo = key;
        }
      });
    });
    var fromKey = measureFrom ? formatISO(measureFrom) : fileFrom;
    var toKey = measureTo ? formatISO(measureTo) : fileTo;
    var asAtKey = formatISO(asAt);

    var lines = [];
    var notDue = 0;
    var outside = 0;
    var missingSuppliers = [];
    var missingSeen = Object.create(null);
    var checkDateRows = [];
    var checkDateTotal = 0;

    groupOrder.forEach(function (group) {
      var masterEntry = master ? master.get(group.supplierKey) : null;
      var supplierName = masterEntry ? masterEntry.name : group.supplierName;
      var mode = masterEntry ? masterEntry.mode : "supplier";
      var transitDaysExpected = masterEntry ? masterEntry.transit : null;
      if (masterEntry) {
        masterEntry.used = true;
      }
      if (master && !masterEntry && !missingSeen[group.supplierKey]) {
        missingSeen[group.supplierKey] = true;
        missingSuppliers.push(supplierName);
      }

      var receivedParts = group.parts.filter(function (part) {
        if (mode === "me") {
          return part.handed || part.arrivedSite || part.received > 0;
        }
        return part.arrivedSite;
      });
      var ignoredUnreceived = receivedParts.length > 0;
      var countedParts = ignoredUnreceived ? receivedParts : group.parts;
      var orderedValues = group.parts.map(function (part) {
        return part.ordered;
      });
      var orderedQty = orderedValues[0];
      orderedValues.forEach(function (value) {
        if (value > orderedQty) {
          orderedQty = value;
        }
      });
      var required = countedParts[0].required;
      countedParts.forEach(function (part) {
        if (formatISO(part.required) < formatISO(required)) {
          required = part.required;
        }
      });
      var requiredValues = [];
      countedParts.forEach(function (part) {
        var key = formatISO(part.required);
        if (requiredValues.indexOf(key) === -1) {
          requiredValues.push(key);
        }
      });
      var receivedQty = 0;
      var damagedQty = 0;
      var reasons = [];
      var arrivedSite = null;
      var handed = null;
      var onTimeRow = countedParts[0].rowNumber;
      countedParts.forEach(function (part) {
        receivedQty += part.received;
        damagedQty += part.damaged;
        if (part.reason && reasons.indexOf(part.reason) === -1) {
          reasons.push(part.reason);
        }
        if (part.arrivedSite && (!arrivedSite || part.arrivedSite.getTime() > arrivedSite.getTime())) {
          arrivedSite = part.arrivedSite;
          if (mode !== "me") {
            onTimeRow = part.rowNumber;
          }
        }
        if (part.handed && (!handed || part.handed.getTime() > handed.getTime())) {
          handed = part.handed;
          if (mode === "me") {
            onTimeRow = part.rowNumber;
          }
        }
      });
      var onTimeDate = mode === "me" ? handed : arrivedSite;
      if (group.parts.length > 1) {
        var appearRows = group.parts.map(function (part) {
          return part.rowNumber;
        });
        warnings.push(
          "PO " +
            group.po +
            ", SKU " +
            group.sku +
            " appears " +
            group.parts.length +
            " times (" +
            rowPhrase(appearRows, appearRows.length) +
            "). Rows were combined."
        );
      }
      if (!sameQty(orderedValues)) {
        var listed = uniqueNumbers(orderedValues).map(formatNumber);
        warnings.push(
          "PO " +
            group.po +
            ", SKU " +
            group.sku +
            " has different ordered quantities (" +
            listAnd(listed) +
            "). The largest, " +
            formatNumber(orderedQty) +
            ", was used."
        );
      }
      if (requiredValues.length > 1) {
        warnings.push(
          "PO " +
            group.po +
            ", SKU " +
            group.sku +
            " has different required dates. The earliest, " +
            formatISO(required) +
            ", was used."
        );
      }
      if (mode === "me" && !handed && (receivedQty > 0 || arrivedSite)) {
        handedBlank.push({ po: group.po, sku: group.sku });
        return;
      }

      var accepted = receivedQty - damagedQty;
      if (accepted < 0) {
        accepted = 0;
      }
      var requiredKey = formatISO(required);
      var inRange = requiredKey >= fromKey && requiredKey <= toKey;
      var daysLate = onTimeDate ? daysBetween(onTimeDate, required) : null;
      var overdue = false;
      if (!onTimeDate) {
        overdue = formatISO(addDays(required, late.value)) < asAtKey;
      }
      var counted = false;
      var countedText = "";
      if (!inRange) {
        outside += 1;
        countedText = "N: outside the measure range";
      } else if (!onTimeDate && !overdue) {
        notDue += 1;
        countedText = "N: not due yet";
      } else {
        counted = true;
        countedText = "Y";
      }

      var onTime = false;
      var inFull = false;
      var earlyMiss = false;
      var lateMiss = false;
      var shortMiss = false;
      var overMiss = false;
      var checkDate = false;
      var reasonParts = [];
      if (counted && !onTimeDate) {
        reasonParts.push("Not received");
      }
      if (counted && onTimeDate) {
        onTime = daysLate >= -early.value && daysLate <= late.value;
        earlyMiss = daysLate < -early.value;
        lateMiss = daysLate > late.value;
        var threshold = orderedQty * (1 - shortfall.value / 100);
        inFull = accepted + 1e-9 >= threshold;
        if (!overOk && accepted > orderedQty + 1e-9) {
          inFull = false;
          overMiss = true;
        }
        shortMiss = !inFull && !overMiss;
        if (lateMiss) {
          var lateDays = daysLate;
          reasonParts.push("Late " + lateDays + (lateDays === 1 ? " day" : " days"));
        }
        if (earlyMiss) {
          var earlyDays = -daysLate;
          reasonParts.push("Early " + earlyDays + (earlyDays === 1 ? " day" : " days"));
        }
        if (shortMiss) {
          var shortQty = orderedQty - accepted;
          reasonParts.push(
            "Short " + formatNumber(shortQty) + " (" + formatPercentNumber((shortQty / orderedQty) * 100) + "%)"
          );
        }
        if (overMiss) {
          reasonParts.push("Over " + formatNumber(accepted - orderedQty));
        }
      }
      if (counted && damagedQty > 0) {
        reasonParts.push("Damaged " + formatNumber(damagedQty) + (reasons.length ? " (" + reasons.join("; ") + ")" : ""));
      }
      if (onTimeDate && daysLate != null && Math.abs(daysLate) > 365) {
        checkDate = true;
        if (counted) {
          reasonParts.push("Check this date");
        }
        checkDateTotal += 1;
        if (checkDateRows.length < 10) {
          checkDateRows.push(onTimeRow);
        }
      }

      var transit = null;
      var freightOnTime = "";
      if (mode === "me" && handed && arrivedSite && formatISO(arrivedSite) <= asAtKey) {
        transit = daysBetween(arrivedSite, handed);
        if (transitDaysExpected != null) {
          freightOnTime = transit <= transitDaysExpected ? "Y" : "N";
        }
      }

      lines.push({
        po: group.po,
        supplier: supplierName,
        supplierKey: group.supplierKey,
        sku: group.sku,
        ordered: orderedQty,
        received: receivedQty,
        damaged: damagedQty,
        accepted: accepted,
        required: required,
        requiredKey: requiredKey,
        month: monthKey(required),
        onTimeDate: onTimeDate,
        daysLate: daysLate,
        onTime: onTime,
        inFull: inFull,
        difot: counted && onTime && inFull,
        late: counted && lateMiss,
        short: counted && shortMiss,
        reason: counted ? reasonParts.join("; ") : "",
        counted: counted,
        countedText: countedText,
        rowsCombined: group.parts.length,
        arrivedSite: arrivedSite,
        handed: handed,
        transit: transit,
        freightOnTime: freightOnTime,
        mode: mode,
        transitExpected: transitDaysExpected,
        checkDate: checkDate,
      });
    });

    if (missingSuppliers.length) {
      var shownMissing = missingSuppliers.slice(0, 10);
      var missingMore = missingSuppliers.length - shownMissing.length;
      warnings.push(
        "These suppliers are not in the supplier list, so they are treated as Supplier delivers: " +
          listAnd(shownMissing) +
          (missingMore > 0 ? ", and " + missingMore + " more" : "") +
          "."
      );
    }
    if (checkDateTotal) {
      warnings.push(
        rowPhrase(checkDateRows, checkDateTotal) +
          (checkDateTotal === 1 ? ": the on-time date is" : ": the on-time dates are") +
          " more than 365 days from the required date. Check this date."
      );
    }
    var handedBlankMessage = handedBlankWarning(handedBlank);
    if (handedBlankMessage) {
      warnings.push(handedBlankMessage);
    }

    var notes = [];
    var ignoredNames = Object.keys(ignoredHanded);
    if (ignoredNames.length) {
      notes.push(
        "Handed to Freight Date was filled in for " +
          listAnd(ignoredNames.slice(0, 10)) +
          (ignoredNames.length > 10 ? ", and " + (ignoredNames.length - 10) + " more" : "") +
          ". " +
          (ignoredNames.length === 1 ? "That supplier delivers" : "Those suppliers deliver") +
          " to you, so that date was not used. On time uses Arrived at Your Site Date."
      );
    }
    if (!master) {
      notes.push("No supplier list was loaded. Every supplier is treated as Supplier delivers.");
    } else {
      var unused = 0;
      master.forEach(function (entry) {
        if (!entry.used) {
          unused += 1;
        }
      });
      if (unused) {
        notes.push(
          unused +
            (unused === 1 ? " supplier in the supplier list is" : " suppliers in the supplier list are") +
            " not in the PO file."
        );
      }
    }
    if (notDue) {
      notes.push(notDue + (notDue === 1 ? " line not due yet" : " lines not due yet") + ".");
    }
    if (outside) {
      notes.push(
        outside +
          (outside === 1 ? " line is" : " lines are") +
          " outside the measure range."
      );
    }

    var measured = lines.filter(function (line) {
      return line.counted;
    });
    if (!measured.length) {
      var none = "No lines are measured. None are due in this range, or none are received or overdue.";
      if (notDue) {
        none += " " + notDue + (notDue === 1 ? " line not due yet." : " lines not due yet.");
      }
      return emptyResult([none], warnings, dateLine, notes);
    }

    var overall = tally();
    var bySupplier = new Map();
    var byMonth = new Map();
    var bySupplierMonth = new Map();
    measured.forEach(function (line) {
      addTally(overall, line);
      if (!bySupplier.has(line.supplierKey)) {
        bySupplier.set(line.supplierKey, { name: line.supplier, mode: line.mode, tally: tally() });
      }
      addTally(bySupplier.get(line.supplierKey).tally, line);
      if (!byMonth.has(line.month)) {
        byMonth.set(line.month, tally());
      }
      addTally(byMonth.get(line.month), line);
      var pairKey = line.supplierKey + "\n" + line.month;
      if (!bySupplierMonth.has(pairKey)) {
        bySupplierMonth.set(pairKey, { name: line.supplier, month: line.month, key: line.supplierKey, tally: tally() });
      }
      addTally(bySupplierMonth.get(pairKey).tally, line);
    });

    var supplierRows = [];
    bySupplier.forEach(function (entry) {
      var fields = tallyFields(entry.tally);
      supplierRows.push({
        supplier: entry.name,
        supplierKey: entry.name.toLowerCase(),
        freight: freightLabel(entry.mode),
        mode: entry.mode,
        lines: fields.lines,
        onTimeLines: fields.onTimeLines,
        inFullLines: fields.inFullLines,
        difotLines: fields.difotLines,
        onTimePct: fields.onTimePct,
        inFullPct: fields.inFullPct,
        difotPct: fields.difotPct,
        lateLines: fields.lateLines,
        shortLines: fields.shortLines,
        avgDaysLate: fields.avgDaysLate,
        ratio: fields.lines ? fields.difotLines / fields.lines : 0,
      });
    });
    supplierRows.sort(function (a, b) {
      if (a.ratio !== b.ratio) {
        return a.ratio - b.ratio;
      }
      if (a.supplier < b.supplier) {
        return -1;
      }
      if (a.supplier > b.supplier) {
        return 1;
      }
      return 0;
    });

    var monthKeys = Array.from(byMonth.keys()).sort();
    var monthRows = monthKeys.map(function (key) {
      var fields = tallyFields(byMonth.get(key));
      return {
        month: key,
        lines: fields.lines,
        onTimeLines: fields.onTimeLines,
        inFullLines: fields.inFullLines,
        difotLines: fields.difotLines,
        onTimePct: fields.onTimePct,
        inFullPct: fields.inFullPct,
        difotPct: fields.difotPct,
      };
    });
    var monthsHidden = 0;
    var monthsShown = monthRows;
    if (monthRows.length > MAX_MONTHS_ON_SCREEN) {
      monthsHidden = monthRows.length - MAX_MONTHS_ON_SCREEN;
      monthsShown = monthRows.slice(monthRows.length - MAX_MONTHS_ON_SCREEN);
      notes.push(
        monthsHidden +
          (monthsHidden === 1 ? " older month is" : " older months are") +
          " in the totals and in the summary CSV."
      );
    }

    var freightRows = [];
    supplierRows.forEach(function (supplier) {
      if (supplier.mode !== "me") {
        return;
      }
      var receivedLines = measured.filter(function (line) {
        return line.supplierKey === supplier.supplier.toLowerCase() && line.handed;
      });
      var expected = null;
      var masterEntry = master ? master.get(supplier.supplier.toLowerCase()) : null;
      if (masterEntry) {
        expected = masterEntry.transit;
      }
      var measurable = [];
      var notMeasurable = 0;
      receivedLines.forEach(function (line) {
        if (expected == null || line.transit == null) {
          notMeasurable += 1;
          return;
        }
        measurable.push(line);
      });
      if (expected == null) {
        warnings.push(supplier.supplier + ": expected transit days is blank, so freight is not measurable.");
      }
      var onTimeLines = measurable.filter(function (line) {
        return line.freightOnTime === "Y";
      }).length;
      var transitValues = measurable.map(function (line) {
        return line.transit;
      });
      var average = "";
      var longest = "";
      if (transitValues.length) {
        var sum = 0;
        var max = transitValues[0];
        transitValues.forEach(function (value) {
          sum += value;
          if (value > max) {
            max = value;
          }
        });
        average = formatAvg(sum, transitValues.length);
        longest = formatNumber(max);
      }
      var note = "";
      if (!measurable.length) {
        note = "not measurable";
      } else if (notMeasurable) {
        note = notMeasurable + (notMeasurable === 1 ? " line not measurable" : " lines not measurable");
      }
      freightRows.push({
        supplier: supplier.supplier,
        lines: measurable.length ? measurable.length : receivedLines.length,
        population: receivedLines.length,
        measurable: measurable.length,
        onTimeLines: measurable.length ? onTimeLines : "",
        onTimePct: measurable.length ? formatPct(onTimeLines, measurable.length) : "",
        averageTransit: average,
        longestTransit: longest,
        note: note,
      });
    });
    if (freightRows.length) {
      notes.push("Freight performance is separate. It does not change a supplier's DIFOT.");
    }

    var overallFields = tallyFields(overall);
    var settings = [
      { label: "Date format", value: formatName(dayFirst) },
      { label: "Days early allowed", value: String(early.value) },
      { label: "Days late allowed", value: String(late.value) },
      { label: "Shortfall allowed", value: String(shortfall.value) + "%" },
      { label: "Over-delivery counts as in full", value: overOk ? "Yes" : "No" },
      { label: "Measure from", value: fromKey },
      { label: "Measure to", value: toKey },
      { label: "As at date", value: asAtKey },
    ];
    var summaryLine =
      "DIFOT " +
      overallFields.difotPct +
      "% (" +
      overallFields.difotLines +
      " of " +
      overallFields.lines +
      " lines). On time " +
      overallFields.onTimePct +
      "% (" +
      overallFields.onTimeLines +
      " of " +
      overallFields.lines +
      "). In full " +
      overallFields.inFullPct +
      "% (" +
      overallFields.inFullLines +
      " of " +
      overallFields.lines +
      "). Days early allowed " +
      early.value +
      ". Days late allowed " +
      late.value +
      ". Shortfall allowed " +
      shortfall.value +
      "%. Over-delivery counts as in full: " +
      (overOk ? "Yes" : "No") +
      ". Dates: " +
      formatName(dayFirst) +
      ". Measured " +
      fromKey +
      " to " +
      toKey +
      ". As at " +
      asAtKey +
      ".";

    var settingLines = ["Setting,Value"];
    settings.forEach(function (setting) {
      settingLines.push(csvLine([setting.label, setting.value]));
    });
    var summaryBody = [SUMMARY_HEADER.join(",")];
    summaryBody.push(csvLine(summaryCells("Overall", "", "", overallFields, null, "")));
    supplierRows.forEach(function (supplier) {
      summaryBody.push(
        csvLine(
          summaryCells("Supplier", supplier.supplier, "", supplier, null, "")
        )
      );
    });
    monthRows.forEach(function (month) {
      summaryBody.push(csvLine(summaryCells("Month", "", month.month, month, null, "")));
    });
    var supplierOrder = supplierRows.map(function (supplier) {
      return supplier.supplier;
    });
    var pairRows = Array.from(bySupplierMonth.values());
    pairRows.sort(function (a, b) {
      var aIndex = supplierOrder.indexOf(a.name);
      var bIndex = supplierOrder.indexOf(b.name);
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      if (a.month < b.month) {
        return -1;
      }
      if (a.month > b.month) {
        return 1;
      }
      return 0;
    });
    pairRows.forEach(function (pair) {
      summaryBody.push(csvLine(summaryCells("Supplier-Month", pair.name, pair.month, tallyFields(pair.tally), null, "")));
    });
    freightRows.forEach(function (freight) {
      summaryBody.push(csvLine(summaryCells("Freight", freight.supplier, "", null, freight, freight.note)));
    });

    var lineBody = [LINES_HEADER.join(",")];
    lines.forEach(function (line) {
      lineBody.push(
        csvLine([
          line.po,
          line.supplier,
          line.sku,
          formatNumber(line.ordered),
          formatNumber(line.received),
          formatNumber(line.damaged),
          formatNumber(line.accepted),
          formatISO(line.required),
          line.arrivedSite ? formatISO(line.arrivedSite) : "",
          line.handed ? formatISO(line.handed) : "",
          line.daysLate == null ? "" : String(line.daysLate),
          line.counted ? yn(line.onTime) : "",
          line.counted ? yn(line.inFull) : "",
          line.counted ? yn(line.difot) : "",
          line.reason,
          line.countedText,
          String(line.rowsCombined),
          line.transit == null ? "" : String(line.transit),
          line.freightOnTime,
        ])
      );
    });

    var summaryCsv = "\uFEFF" + settingLines.join("\n") + "\n\n" + summaryBody.join("\n") + "\n";
    var linesCsv = "\uFEFF" + settingLines.join("\n") + "\n\n" + lineBody.join("\n") + "\n";

    return {
      ok: true,
      errors: [],
      warnings: warnings,
      notes: notes,
      dateLine: dateLine,
      summaryLine: summaryLine,
      settings: settings,
      overall: {
        lines: overallFields.lines,
        onTimeLines: overallFields.onTimeLines,
        inFullLines: overallFields.inFullLines,
        difotLines: overallFields.difotLines,
        onTimePct: overallFields.onTimePct,
        inFullPct: overallFields.inFullPct,
        difotPct: overallFields.difotPct,
        lateLines: overallFields.lateLines,
        shortLines: overallFields.shortLines,
        avgDaysLate: overallFields.avgDaysLate,
      },
      suppliers: supplierRows,
      months: monthsShown,
      allMonths: monthRows,
      monthsHidden: monthsHidden,
      freight: freightRows,
      freightNote: freightRows.length
        ? "Freight performance is separate. It does not change a supplier's DIFOT."
        : "",
      summaryCsv: summaryCsv,
      linesCsv: linesCsv,
      summaryFileName: "DIFOT_summary_" + asAtKey + ".csv",
      linesFileName: "DIFOT_lines_" + asAtKey + ".csv",
      lines: lines,
    };
  }

  return {
    HELP_LINE: HELP_LINE,
    MAX_PO_BYTES: MAX_PO_BYTES,
    MAX_PO_ROWS: MAX_PO_ROWS,
    MAX_SUPPLIER_BYTES: MAX_SUPPLIER_BYTES,
    MAX_SUPPLIERS: MAX_SUPPLIERS,
    SUMMARY_HEADER: SUMMARY_HEADER,
    LINES_HEADER: LINES_HEADER,
    normalizeHeader: normalizeHeader,
    parseDate: parseDate,
    formatISO: formatISO,
    formatLong: formatLong,
    buildDifot: buildDifot,
  };
});
