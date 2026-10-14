/**
 * Starter Forecast page.
 * The sales file stays in this browser. The email summary is only a
 * confirmation and carries no SKU or sales data. The download unlocks
 * after the email is accepted, whether or not the articles box is ticked.
 */
(function () {
  "use strict";

  var engine = window.StarterForecast;
  var fileText = "";
  var fileName = "";
  var current = null;
  var unlocked = false;
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

  function fail(messages) {
    var el = $("sf-errors");
    showList(el, messages);
    $("sf-output").hidden = true;
    $("sf-gate").hidden = true;
    $("sf-downloads").hidden = true;
    $("sf-date-line").hidden = true;
    showList($("sf-warnings"), []);
    unlocked = false;
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
    $("sf-errors").hidden = true;
    $("sf-errors").innerHTML = "";
    var dateLine = $("sf-date-line");
    dateLine.hidden = !result.dateLine;
    dateLine.textContent = result.dateLine;
    $("sf-output-date").textContent = result.dateLine;
    $("sf-location-note").textContent = result.locationNote;
    showList($("sf-notes"), result.notes);
    showList($("sf-warnings"), result.warnings);

    var summary = $("sf-summary-body");
    summary.innerHTML = result.skus
      .map(function (sku) {
        return (
          "<tr><td class=\"sim-sku\">" +
          escapeHtml(sku.sku) +
          "</td><td>" +
          escapeHtml(sku.weeklyForecast.toFixed(2)) +
          "</td><td>" +
          escapeHtml(String(sku.weeksUsed)) +
          "</td><td>" +
          escapeHtml(sku.firstSaleWeek) +
          "</td><td>" +
          escapeHtml(String(sku.locations)) +
          "</td><td>" +
          escapeHtml(sku.flags.join("; ")) +
          "</td></tr>"
        );
      })
      .join("");

    var previewSkuList = result.skus.slice(0, result.previewSkuCount).map(function (sku) {
      return sku.sku;
    });
    var previewWeekList = result.weekDates.slice(0, result.previewWeekCount);
    var previewRows = result.forecastRows.filter(function (row) {
      return previewSkuList.indexOf(row.sku) !== -1 && previewWeekList.indexOf(row.week) !== -1;
    });
    $("sf-preview-body").innerHTML = previewRows
      .map(function (row) {
        return (
          "<tr><td class=\"sim-sku\">" +
          escapeHtml(row.sku) +
          "</td><td>" +
          escapeHtml(row.qty.toFixed(2)) +
          "</td><td>" +
          escapeHtml(row.week) +
          "</td></tr>"
        );
      })
      .join("");
    $("sf-preview-note").textContent =
      "Showing the first " +
      result.previewSkuCount +
      (result.previewSkuCount === 1 ? " SKU" : " SKUs") +
      " and the first " +
      result.previewWeekCount +
      (result.previewWeekCount === 1 ? " forecast week" : " forecast weeks") +
      ". The forecast CSV has every SKU and every forecast week.";

    $("sf-output").hidden = false;
    $("sf-gate").hidden = false;
    $("sf-downloads").hidden = true;
    unlocked = false;
    resultsForm.show();
  }

  function rebuild() {
    if (!fileText) {
      return;
    }
    if (!engine) {
      fail(["The forecast script did not load."]);
      return;
    }
    var result = engine.buildForecast({
      text: fileText,
      fileName: fileName,
      byteLength: fileText.length ? new TextEncoder().encode(fileText).length : 0,
      dayFirst: $("sf-date-order").value !== "mdy",
      planStart: $("sf-plan-start").value,
      horizon: Number($("sf-horizon").value),
      today: localISO(new Date()),
    });
    current = result.ok ? result : null;
    if (!result.ok) {
      fail(result.errors);
      if (result.warnings && result.warnings.length) {
        showList($("sf-warnings"), result.warnings);
        $("sf-warnings").hidden = false;
      }
      return;
    }
    render(result);
  }

  function boot() {
    if (!engine || !window.SimResultsForm) {
      fail(["The forecast script did not load."]);
      return;
    }
    $("sf-plan-start").value = localISO(new Date());
    resultsForm = window.SimResultsForm.attach({
      id: "sf-results",
      formId: "starter-forecast",
      buildSummary: function () {
        if (!current || !current.ok) {
          return null;
        }
        return { kind: "starter-forecast" };
      },
      onSent: function () {
        if (!current || !current.ok) {
          return;
        }
        unlocked = true;
        $("sf-downloads").hidden = false;
      },
    });

    $("sf-file").addEventListener("change", function () {
      var file = $("sf-file").files && $("sf-file").files[0];
      fileText = "";
      fileName = "";
      current = null;
      unlocked = false;
      $("sf-downloads").hidden = true;
      if (!file) {
        fail(["Choose a CSV file."]);
        return;
      }
      fileName = file.name || "";
      $("sf-file-name").hidden = false;
      $("sf-file-name").textContent = fileName;
      if (file.size > engine.MAX_BYTES) {
        fail(["This file is over 10 MB. Export a shorter history and try again."]);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        fileText = String(reader.result || "");
        rebuild();
      };
      reader.onerror = function () {
        fail(["The file could not be read. Try again."]);
      };
      reader.readAsText(file, "UTF-8");
    });

    ["sf-date-order", "sf-plan-start", "sf-horizon"].forEach(function (id) {
      $(id).addEventListener("change", rebuild);
    });

    $("sf-download-forecast").addEventListener("click", function () {
      if (!unlocked || !current) {
        return;
      }
      download(current.forecastFileName, current.forecastCsv);
    });
    $("sf-download-summary").addEventListener("click", function () {
      if (!unlocked || !current) {
        return;
      }
      download(current.summaryFileName, current.summaryCsv);
    });
  }

  boot();
})();
