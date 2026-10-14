/**
 * DIFOT Calculator page.
 * The purchase order file and the supplier list stay in this browser.
 * The email summary is only a confirmation and carries no suppliers,
 * orders, or figures. The download unlocks after the email is accepted,
 * whether or not the articles box is ticked.
 * A new file locks the download again. A settings change does not.
 * A file chosen while a send is still in flight does not get unlocked
 * by that send.
 */
(function () {
  "use strict";

  var engine = window.DifotCalculator;
  var poText = "";
  var poName = "";
  var supplierText = "";
  var supplierName = "";
  var current = null;
  var unlocked = false;
  var fileToken = 0;
  var sentToken = 0;
  var resultsForm = { show: function () {}, hide: function () {} };

  function $(id) {
    return document.getElementById(id);
  }

  function localISO(date) {
    var month = String(date.getMonth() + 1);
    var day = String(date.getDate());
    if (month.length < 2) {
      month = "0" + month;
    }
    if (day.length < 2) {
      day = "0" + day;
    }
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showList(el, items) {
    if (!el) {
      return;
    }
    if (!items || !items.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML =
      "<ul>" +
      items
        .map(function (item) {
          return "<li>" + escapeHtml(item) + "</li>";
        })
        .join("") +
      "</ul>";
  }

  function applyDateLine(result) {
    var dateLine = $("df-date-line");
    if (!dateLine) {
      return;
    }
    var text = result && result.dateLine ? result.dateLine : "";
    dateLine.hidden = !text;
    dateLine.textContent = text;
  }

  function pctCell(pct, count, total) {
    return escapeHtml(pct) + "% (" + escapeHtml(String(count)) + " of " + escapeHtml(String(total)) + ")";
  }

  function fact(label, value) {
    return "<div><dt>" + escapeHtml(label) + "</dt><dd>" + value + "</dd></div>";
  }

  function freightOnTimeText(stats) {
    if (!stats || !stats.onTimePct) {
      return "Not measurable";
    }
    return escapeHtml(stats.onTimePct) + "% (" + escapeHtml(String(stats.onTimeLines)) + " of " + escapeHtml(String(stats.measurable)) + ")";
  }

  function plainNumber(value) {
    return value ? escapeHtml(value) : "None";
  }

  function monthTable(group) {
    var freightHead = "";
    if (group.mode === "me") {
      freightHead =
        "<th scope=\"col\">Freight on time</th>" +
        "<th scope=\"col\">Average transit days</th>" +
        "<th scope=\"col\">Longest transit days</th>" +
        "<th scope=\"col\">Lines not measurable</th>";
    }
    var body = (group.months || [])
      .map(function (row) {
        var freight = "";
        if (group.mode === "me") {
          var stats = row.freightStats;
          var notMeasured = stats ? String(stats.population - stats.measurable) : "0";
          freight =
            "<td>" +
            freightOnTimeText(stats) +
            "</td><td>" +
            plainNumber(stats && stats.averageTransit) +
            "</td><td>" +
            plainNumber(stats && stats.longestTransit) +
            "</td><td>" +
            escapeHtml(notMeasured) +
            "</td>";
        }
        return (
          "<tr><td>" +
          escapeHtml(row.month) +
          "</td><td>" +
          escapeHtml(String(row.lines)) +
          "</td><td>" +
          pctCell(row.onTimePct, row.onTimeLines, row.lines) +
          "</td><td>" +
          pctCell(row.inFullPct, row.inFullLines, row.lines) +
          "</td><td>" +
          pctCell(row.difotPct, row.difotLines, row.lines) +
          "</td><td>" +
          escapeHtml(String(row.lateLines)) +
          "</td><td>" +
          escapeHtml(String(row.shortLines)) +
          "</td><td>" +
          plainNumber(row.avgDaysLate) +
          "</td>" +
          freight +
          "</tr>"
        );
      })
      .join("");
    return (
      "<h3 class=\"sf-subhead\">By month</h3><p class=\"sim-meta\">Month of the required date.</p><div class=\"sim-table-wrap\"><table class=\"sim-table\"><caption class=\"visually-hidden\">DIFOT by month for " +
      escapeHtml(group.supplier) +
      "</caption><thead><tr><th scope=\"col\">Month</th><th scope=\"col\">Lines</th><th scope=\"col\">On time</th><th scope=\"col\">In full</th><th scope=\"col\">DIFOT</th><th scope=\"col\">Late lines</th><th scope=\"col\">Short lines</th><th scope=\"col\">Average days late</th>" +
      freightHead +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }

  function supplierCard(row, group, index) {
    var detailId = "df-supplier-detail-" + index;
    var facts =
      fact("On time", pctCell(row.onTimePct, row.onTimeLines, row.lines)) +
      fact("In full", pctCell(row.inFullPct, row.inFullLines, row.lines)) +
      fact("Late lines", escapeHtml(String(row.lateLines))) +
      fact("Short lines", escapeHtml(String(row.shortLines))) +
      fact("Average days late", plainNumber(row.avgDaysLate));
    var freight = "";
    if (row.mode === "me" && row.freightStats) {
      var stats = row.freightStats;
      freight =
        "<h3 class=\"sf-subhead\">Freight you arrange</h3><dl class=\"difot-supplier__facts\">" +
        fact("Freight on time", freightOnTimeText(stats)) +
        fact("Average transit days", plainNumber(stats.averageTransit)) +
        fact("Longest transit days", plainNumber(stats.longestTransit)) +
        fact("Lines not measurable", escapeHtml(String(stats.population - stats.measurable))) +
        "</dl>";
    }
    return (
      "<article class=\"difot-supplier\"><button type=\"button\" class=\"difot-supplier__toggle\" aria-expanded=\"false\" aria-controls=\"" +
      detailId +
      "\"><span class=\"difot-supplier__name\">" +
      escapeHtml(row.supplier) +
      "</span><span class=\"difot-supplier__pct\">" +
      escapeHtml(row.difotPct) +
      "%</span><span class=\"difot-supplier__lines\">" +
      escapeHtml(String(row.difotLines)) +
      " of " +
      escapeHtml(String(row.lines)) +
      " lines</span><span class=\"difot-supplier__freight\">" +
      escapeHtml(row.freight) +
      "</span></button><div class=\"difot-supplier__detail\" id=\"" +
      detailId +
      "\" hidden><dl class=\"difot-supplier__facts\">" +
      facts +
      "</dl>" +
      freight +
      monthTable(group || { supplier: row.supplier, mode: row.mode, months: [] }) +
      "</div></article>"
    );
  }

  function toggleSupplier(button) {
    var detail = document.getElementById(button.getAttribute("aria-controls"));
    if (!detail) {
      return;
    }
    var open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", open ? "false" : "true");
    detail.hidden = open;
  }

  function wireSupplierCards() {
    var root = $("df-supplier-cards");
    if (!root || root.wired) {
      return;
    }
    root.wired = true;
    root.addEventListener("click", function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest("button.difot-supplier__toggle") : null;
      if (!button || !root.contains(button)) {
        return;
      }
      toggleSupplier(button);
    });
  }

  function fail(messages, result) {
    showList($("df-errors"), messages);
    $("df-output").hidden = true;
    $("df-gate").hidden = true;
    $("df-downloads").hidden = true;
    applyDateLine(result);
    showList($("df-warnings"), result && result.warnings ? result.warnings : []);
    current = null;
    resultsForm.hide();
  }

  function download(name, text) {
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function render(result) {
    $("df-errors").hidden = true;
    $("df-errors").innerHTML = "";
    applyDateLine(result);
    showList($("df-warnings"), result.warnings);
    showList($("df-notes"), result.notes);
    $("df-lines").textContent = String(result.counts.lines);
    $("df-suppliers").textContent = String(result.counts.suppliers);
    $("df-pos").textContent = String(result.counts.purchaseOrders);
    $("df-settings").innerHTML = result.settings
      .map(function (setting) {
        return "<li>" + escapeHtml(setting.label) + ": " + escapeHtml(setting.value) + "</li>";
      })
      .join("");

    var monthsBySupplier = {};
    (result.supplierMonths || []).forEach(function (group) {
      monthsBySupplier[group.supplier] = group;
    });
    $("df-supplier-cards").innerHTML = result.suppliers
      .map(function (row, index) {
        return supplierCard(row, monthsBySupplier[row.supplier], index);
      })
      .join("");
    var monthNote = result.monthNote || "";
    $("df-month-note").hidden = !monthNote;
    $("df-month-note").textContent = monthNote;

    $("df-output").hidden = false;
    $("df-gate").hidden = false;
    if (unlocked) {
      $("df-downloads").hidden = false;
    } else {
      $("df-downloads").hidden = true;
      resultsForm.show();
    }
  }

  function whole(id) {
    return Number($(id).value);
  }

  function rebuild() {
    if (!poText) {
      return;
    }
    if (!engine) {
      fail(["The calculator did not load."]);
      return;
    }
    var result = engine.buildDifot({
      poText: poText,
      poFileName: poName,
      poByteLength: poText ? new TextEncoder().encode(poText).length : 0,
      supplierText: supplierText,
      supplierFileName: supplierName,
      supplierByteLength: supplierText ? new TextEncoder().encode(supplierText).length : 0,
      dayFirst: $("df-date-order").value !== "mdy",
      daysEarly: whole("df-days-early"),
      daysLate: whole("df-days-late"),
      shortfallPct: whole("df-shortfall"),
      overDeliveryInFull: $("df-over").value !== "no",
      measureFrom: $("df-measure-from").value,
      measureTo: $("df-measure-to").value,
      asAt: $("df-as-at").value,
    });
    current = result.ok ? result : null;
    if (!result.ok) {
      fail(result.errors, result);
      return;
    }
    render(result);
  }

  function readChosen(input, maxBytes, tooBig, onReady) {
    var file = input.files && input.files[0];
    if (!file) {
      onReady("", "");
      return;
    }
    if (file.size > maxBytes) {
      onReady(file.name || "", "", tooBig);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      onReady(file.name || "", String(reader.result || ""));
    };
    reader.onerror = function () {
      onReady(file.name || "", "", "The file could not be read. Try again.");
    };
    reader.readAsText(file, "UTF-8");
  }

  function lockForNewFile() {
    fileToken += 1;
    unlocked = false;
    $("df-downloads").hidden = true;
  }

  function boot() {
    if (!engine || !window.SimResultsForm) {
      fail(["The calculator did not load."]);
      return;
    }
    $("df-as-at").value = localISO(new Date());
    wireSupplierCards();
    resultsForm = window.SimResultsForm.attach({
      id: "df-results",
      formId: "difot-calculator",
      wordingVersion: "difot-calculator-v1",
      wordingRequired: "Email me to unlock the download.",
      sentUrl: "/learn/difot-calculator/sent/",
      sentMessage: "Sent. The download is unlocked on this page. Check your inbox (and spam folder).",
      buildSummary: function () {
        if (!current || !current.ok) {
          return null;
        }
        sentToken = fileToken;
        return { kind: "difot-calculator" };
      },
      onSent: function () {
        if (!current || !current.ok || sentToken !== fileToken) {
          if (current && current.ok) {
            resultsForm.show();
          }
          return;
        }
        unlocked = true;
        $("df-downloads").hidden = false;
      },
    });

    $("df-po-file").addEventListener("change", function () {
      lockForNewFile();
      readChosen(
        $("df-po-file"),
        engine.MAX_PO_BYTES,
        "This purchase order file is over 10 MB. Export a shorter file and try again.",
        function (name, text, error) {
          poName = name;
          poText = text;
          $("df-po-name").hidden = !name;
          $("df-po-name").textContent = name;
          if (error) {
            fail([error]);
            return;
          }
          if (!name) {
            fail(["Choose a purchase order CSV."]);
            return;
          }
          rebuild();
        }
      );
    });

    $("df-supplier-file").addEventListener("change", function () {
      lockForNewFile();
      readChosen(
        $("df-supplier-file"),
        engine.MAX_SUPPLIER_BYTES,
        "This supplier list is over 1 MB. Export a shorter file and try again.",
        function (name, text, error) {
          supplierName = name;
          supplierText = text;
          $("df-supplier-name").hidden = !name;
          $("df-supplier-name").textContent = name;
          if (error) {
            fail([error]);
            return;
          }
          if (poText) {
            rebuild();
          }
        }
      );
    });

    [
      "df-date-order",
      "df-days-early",
      "df-days-late",
      "df-shortfall",
      "df-over",
      "df-as-at",
      "df-measure-from",
      "df-measure-to",
    ].forEach(function (id) {
      $(id).addEventListener("change", rebuild);
    });

    $("df-download-summary").addEventListener("click", function () {
      if (!unlocked || !current) {
        return;
      }
      download(current.summaryFileName, current.summaryCsv);
    });
    $("df-download-lines").addEventListener("click", function () {
      if (!unlocked || !current) {
        return;
      }
      download(current.linesFileName, current.linesCsv);
    });
  }

  boot();
})();
