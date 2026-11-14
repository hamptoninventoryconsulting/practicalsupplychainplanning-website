# WooCommerce → Practical Stock Planner: File 3 – Open_SO (open customer orders)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a WordPress login with the Administrator or Shop Manager role, and Excel._

**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against WooCommerce's official docs (link given), not tested. **[U]** = unverified – check on screen.
If a WooCommerce label differs slightly, pick the closest match.

**What this file is:** customer orders you haven't shipped yet. Columns: `Sales Order ID`, `SKU`, `Open SO Qty`, `Ship Date`.

---

## Before you start

1. **Download the Open_SO template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_Open_SO.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Log in as an Administrator or Shop Manager.** Orders can be viewed by "Admin and Shop Manager" roles [V] ([Managing orders](https://woocommerce.com/document/managing-orders/)).
3. **Match your SOH choice.** WooCommerce has already reduced stock for Processing and On hold orders. If you used *Stock as it is* for SOH (option (b) in the WooCommerce SOH guide), **leave those orders out of this file** – they are already deducted. Only build this file if you added them back to SOH (option (a)).
4. **Set Analytics › Settings › Date type to Date created** and click **Save settings** [T]. The default is **Date paid**. With that setting, **On hold** orders that are not paid yet do not appear in the Orders report [T].
5. **Refresh Analytics first.** Analytics updates every 12 hours by default [T]. Click **Update now** in the *Data status* box at the top of the report before you download [T] ([Analytics](https://woocommerce.com/document/woocommerce-analytics/) [V]).
6. **Duplicate rows are fine.** Rows for the same SKU and date are simply added up (the app sums by SKU per week, with weeks starting Monday).

> **Do you need order-by-order detail?** Each week, Practical Stock Planner plans for whichever is higher: your forecast or your open orders. If a SKU's open orders are below its forecast, they don't change the plan, so a single total line per SKU is enough – add the quantities up per SKU in Excel (PivotTable) and leave *Ship Date* blank. Order-by-order detail is only worth the effort when open orders are more than the forecast, for example a large one-off order.

**Which orders are open?** Processing ("awaiting fulfillment" – your cue to ship) and On hold ("awaiting payment confirmation", e.g. bank transfer) [V] ([Order statuses](https://woocommerce.com/document/managing-orders/order-statuses/)). Completed = fulfilled [V].
**WooCommerce core has no order CSV export** – the Orders screen has no export button or bulk action (only *Move to Trash* and *Change status to…*) [T].

---

## Option A – Analytics › Orders (free)

| # | Step | Status |
|---|---|---|
| 1 | Check **Analytics › Settings › Date type** = **Date created** (see *Before you start*). | [T] |
| 2 | **Analytics › Orders**. Set **Date range** (Custom) to cover your oldest open order, e.g. the last 3 months. | [T] · [V] [Orders report](https://woocommerce.com/document/woocommerce-analytics/orders-report/) |
| 3 | **Show** › **Advanced filters** › **Order status** › **Is** › tick **Processing** and **On hold**. | [T] (filter values seen: Pending payment, Processing, On hold, Completed, Cancelled, Refunded, Failed, Draft; *Is / Is Not*; *All / Any*) |
| 4 | Click **Update now**, then **Download**. | [T] |

⚠ If the data runs to **more than one page** (25 rows by default), the CSV is **not downloaded – it's emailed** to the logged-in admin [V]. A longer report can say "Your Revenue Report will be emailed to you." [T].
Set the rows-per-page menu at the bottom of the table to 100 first – the choices are 25/50/75/100 [T]; whether this avoids the email is [U].

Exact header row [T]: `Date,"Order #",Status,Customer,"Customer type",Product(s),"Items sold",Coupon(s),"Net sales",Attribution`
Example row [T]: `"2026-09-27 10:00:00",57,processing,"Test Customer2",new,"4× Hoodie - Green, No, 1× T-Shirt",5,,198,Unknown`

| WooCommerce | → Practical Stock Planner column | Notes |
|---|---|---|
| **Order #** | **Sales Order ID** | [T] |
| **Product(s)** | **SKU** (via name lookup) | ⚠ One cell per order, `quantity× product name`, with **names not SKUs** [T]. Split into one row per product (Excel below), then look up the SKU by name from the **Analytics › Stock** download (column *Product / Variation* – same names, e.g. `Hoodie - Green, No` [T]). |
| **Product(s)** quantity | **Open SO Qty** | The number before `×` [T]. Core doesn't track shipped quantities [U] – adjust part-shipped orders by hand. |
| **Date** | **Ship Date** | The order date [T] – there's no promised/ship date in core [T]. Past dates = past-due demand (deducted straight away), which is right for orders waiting to ship. Or add your usual dispatch days. |
| **Status** | – (check) | `processing` / `on-hold` [T]. |

**Excel – split the Product(s) cell.** ⚠ Variation names contain commas (`Hoodie - Green, No`), so you can't simply split at ", " [T].
In Excel 365: `=REGEXREPLACE(F2,", (?=\d+×)","|")` puts a `|` only before each new `n×` item; then *Data › Text to Columns* (delimiter `|`), unpivot (Power Query *Unpivot Columns*),
and split each item at the first `× ` into quantity and name. Then `=XLOOKUP(name, StockReport[Product / Variation], StockReport[SKU])`.

## Option B – Customer / Order / Coupon Export extension (paid, cleanest)

The official marketplace extension **Customer / Order / Coupon Export for WooCommerce** by SkyVerge: **1-year plan $79**, 2-year plan $126.40 [V]
([marketplace page](https://woocommerce.com/products/ordercustomer-csv-export/); currency shown as `$` – US dollars [U]); 30-day money-back guarantee [V].
It exports orders to CSV/XML "manually or on an automated schedule", with a **Default – One row per item CSV format** among its predefined formats [V]
([docs](https://woocommerce.com/document/ordercustomer-csv-exporter/)).

| # | Step | Status |
|---|---|---|
| 1 | **WooCommerce › Export** › *Manual Export* tab. **Output type** CSV, **Export type** orders, **Format** *Default – One row per item*. | [V] |
| 2 | In **Export Options**, target the orders – the marketplace page mentions filtering by "order status" [V]; pick Processing and On hold (labels [U]). Don't tick **Mark as exported** (it excludes them from future exports [V]). | [V] / [U] |
| 3 | Click **Export**; download from the admin notice or **WooCommerce › Exports › Export List** (kept 14 days) [V]. | [V] |

One row per order line gives order number, SKU and quantity per row. Check the column names in your file; a paid export can name them differently.
Not needed if you have few open orders – Option A works for free.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Analytics *Date type* = Date created; **Update now** clicked before downloading.
- [ ] Only Processing and On hold orders; one row per product, with the SKU looked up.
- [ ] Matches your SOH choice: orders listed here **only** if you added them back to SOH.
- [ ] SKUs exactly match your SKU_Details file.
- [ ] No open orders? Keep the header row and add no data rows. That means none are open.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

**Set the date format before you upload.** On the Load Data page, set **Date format in your files** to match your dates: **Day/Month/Year** (the default, e.g. 05/10/2026 = 5 October) or **Month/Day/Year** (US-style, e.g. 10/05/2026 = 5 October). Only Week Starting Date (Forecast), Ship Date (Open Sales Orders) and Due Date (Open Supply) are read as dates. Dates like 2026-10-05, 2026/10/05 and 13-Apr-2026 are always accepted, whichever setting you choose. If you change the setting, upload the file again. A date that can't fit the setting (e.g. US-style 10/13/2026 under Day/Month/Year) stops the upload, and the message names the file, column, row and value.

Questions? Contact support@practicalsupplychainplanning.com.
