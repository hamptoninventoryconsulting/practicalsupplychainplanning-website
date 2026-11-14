# Excel → Practical Stock Planner: File 7 – Forecast (expected weekly demand)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just Excel and a sales report from your system._

**Tags (in the sales-history table):** **[T]** = tested on screen or in the exported file during our live tests (Shopify 2 Oct 2026, WooCommerce 11.1.2 2 Oct 2026, Xero and QuickBooks Online AU 3 Oct 2026). **[V]** = checked against the system's official help (link given), not separately tested.

**What this file is:** how many units of each SKU you expect to sell each week. Columns: `SKU`, `Forecast Qty`, `Week Starting Date`.
Shopify, WooCommerce, Xero and QuickBooks Online don't forecast, so you build a simple forecast in Excel from recent sales.

---

## Before you start

1. **Download the Forecast template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_Forecast.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Long format.** One row per SKU per week – not a grid with weeks across the top. Monthly forecasts must be split into weeks.
3. **Single units**, the same unit as SOH.
4. **Weeks start Monday.** Dates are moved to the Monday of their week automatically. Weeks before the plan start are ignored.
5. **Duplicate rows are fine.** Rows for the same SKU and date are simply added up (the app sums by SKU per week, with weeks starting Monday).
6. **Forecast and open orders are not added together.** Each week, Practical Stock Planner uses the **larger** of forecast and open orders. Don't reduce your forecast for orders you've already taken.

---

## Step 1 – Get 12–26 weeks of sales history

| System | Report and path | SKU → | Quantity → | Watch out |
|---|---|---|---|---|
| **Shopify** | **Analytics > Reports** › *Category* **Sales** › **Total sales by product variant** › date range (e.g. last 12 full weeks) › *(optional)* **Dimensions → Time → Week** › menu icon **> Export** › CSV [T] · [Sales reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report) | **Product variant SKU** [T] | **Net items sold** (sold minus returned) [T] | Reports show max 1,000 rows on screen – export to get all [V]. |
| **WooCommerce** | **Analytics › Products** › **Date range › Custom** = one Monday–Sunday week › **Update** › **Download**. Repeat in **Analytics › Variations** for variable products, and for each week [T] · [Products report](https://woocommerce.com/document/woocommerce-analytics/products-report/) | **SKU** [T] | **Items sold** [T] | One week per download – the *By week* interval changes only the chart [T]. Products report rolls variations into the parent SKU – delete parent rows [T]. Over 25 rows → emailed [V]. Add a *Week Starting Date* column to each download. |
| **Xero** | **Reporting › All reports › Inventory Item Details** › **Date range** › **Update** › **Filter** *Source*: *Receivable Invoice*, *Receivable Credit Note* (+ *Receive Money* if you sell for cash) › **Export › Excel** [T] · [Inventory Item Details](https://central.xero.com/s/article/Inventory-Item-Details-report-New) | **No Item Code column** – lines sit under a heading row such as `GB1-White - Golf balls - white single (Untracked)` [T]. See the Xero note below. | **−QoH Movement** (sales are negative, credit notes positive) [T] | Title, heading and *Total* rows to delete [T]. |
| **QuickBooks Online** | **Reports › Standard reports › Sales by Product/Service Detail** › date range › **Customize** › add **Product/Service full name** and **SKU** › **Export ▼ › Export to Excel** [T] | **SKU** (if blank, look it up by *Product/Service full name*) [T] | **Quantity** [T] | Heading and *Total for …* rows in column A [T]. Dates come out as text (`DD/MM/YYYY`) – convert with *Data › Text to Columns* [T]. |

**Xero note – putting the SKU on every line:** in column I next to the first row under the header, type `=IF(AND(A6<>"",B6=""),A6,I5)` and fill down – each line now carries its item heading.
In your Products and services sheet, add a key column `=A2&" - "&B2&" ("&O2&")"` (ItemCode – ItemName (InventoryType)); this matches the heading text exactly [T for untracked items].
Look the SKU up with `=XLOOKUP(I6, Items!P:P, Items!A:A)`, then delete the heading and *Total* rows (blank **Source**).

**Weekly totals (Xero and QuickBooks Online):** add `Week` = `=INT(A2)-WEEKDAY(A2,3)` (Monday of the date in A2), then a PivotTable: rows SKU, columns Week, values Sum of quantity.

## Step 2 – Turn history into a simple forecast

1. Average weekly demand per SKU = quantity sold ÷ number of weeks (e.g. ÷12). Adjust for known promotions and seasons.
2. Make a list of the next Mondays for your horizon (e.g. 26 weeks), starting at your plan start week. `=INT(A2)-WEEKDAY(A2,3)` gives the Monday of any date.
3. Build long format: copy your SKU + average block once per week, with that week's Monday in *Week Starting Date* (26 weeks × 300 SKUs = 7,800 rows – fine for Excel).
4. Paste into the **Forecast** template (paste as values).

## Column mapping

| Practical Stock Planner column | What to enter | Blank means |
|---|---|---|
| **SKU** | Your product code, exactly as in SKU_Details | – |
| **Forecast Qty** | Expected units sold that week | 0 |
| **Week Starting Date** | The Monday of the week (any date in the week works) | Row not used, with a warning |

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] One row per SKU per week (long format), weeks from your plan start date onwards.
- [ ] Quantities in single units; returns netted off.
- [ ] *Week Starting Date* holds real dates (not text).
- [ ] SKUs exactly match your SKU_Details file.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

**Set the date format before you upload.** On the Load Data page, set **Date format in your files** to match your dates: **Day/Month/Year** (the default, e.g. 05/10/2026 = 5 October) or **Month/Day/Year** (US-style, e.g. 10/05/2026 = 5 October). Only Week Starting Date (Forecast), Ship Date (Open Sales Orders) and Due Date (Open Supply) are read as dates. Dates like 2026-10-05, 2026/10/05 and 13-Apr-2026 are always accepted, whichever setting you choose. If you change the setting, upload the file again. A date that can't fit the setting (e.g. US-style 10/13/2026 under Day/Month/Year) stops the upload, and the message names the file, column, row and value.

Questions? Contact support@practicalsupplychainplanning.com.
