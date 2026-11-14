# Shopify → Practical Stock Planner: File 3 – Open_SO (open customer orders)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just Shopify admin access and Excel._

**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against Shopify's official Help Center (link given), not separately tested. **[U]** = unverified – check on screen.
If a Shopify label differs slightly, pick the closest match.

**What this file is:** customer orders you haven't shipped yet. Columns: `Sales Order ID`, `SKU`, `Open SO Qty`, `Ship Date`.

---

## Before you start

1. **Download the Open_SO template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_Open_SO.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Export on the same day as your SOH file**, and use SOH = *On hand* − *Unavailable* (see the Shopify SOH guide). That way open orders are counted once.
3. **Quantities are in single units.**
4. **Duplicate rows are fine.** Rows for the same SKU and date are simply added up (the app sums by SKU per week, with weeks starting Monday).

> **Do you need order-by-order detail?** Each week, Practical Stock Planner plans for whichever is higher: your forecast or your open orders. If a SKU's open orders are below its forecast, they don't change the plan, so a single total line per SKU (Option A) is enough. Option B is only worth the effort when open orders are more than the forecast, for example a large one-off order. There's no need to go through the orders page by page otherwise.

Shopify orders have no "promised ship date", so there are two ways to do this. **Option A is quickest.**

---

## Option A – use the "Committed" quantity (quick)

Uses the inventory CSV you exported for SOH (**Products > Inventory › Export**, *All states* – [inventory CSV page](https://help.shopify.com/en/manual/products/inventory/setup/inventory-csv) [T]).

| Shopify column | → Practical Stock Planner column | Notes |
|---|---|---|
| *(type any label, e.g.)* `COMMITTED` | **Sales Order ID** | |
| **SKU** | **SKU** | [T] |
| **Committed (not editable)** | **Open SO Qty** | Shopify: "units that are set aside and can't be sold, such as units in an unfulfilled order, reserved in a draft order, or in a transfer that's marked as ready to ship" [V]. |
| *(leave blank)* | **Ship Date** | Blank → Practical Stock Planner uses the plan start date (i.e. "ship now"). |

Delete rows where Committed = 0 or `not stocked`. ⚠ Committed can include draft-order reservations and outbound transfers between your own locations. If those matter to you, use Option B.

## Option B – export unfulfilled orders (more detail)

| # | Step | Status |
|---|---|---|
| 1 | Go to **Orders** and filter by **fulfillment status**. The values offered are **Fulfilled, Unfulfilled, Partially fulfilled, Scheduled, On hold, Request declined** – tick **Unfulfilled** and **Partially fulfilled** (add *Scheduled* / *On hold* if you still intend to ship those). | [T] |
| 2 | From the Orders page, click **Export**. | [T] |
| 3 | In the **Export orders** window choose **Current page** – with a filter applied, this exports the filtered list. (The other options are **All orders** and **Selected: N orders**; there is no separate "filtered orders" option.) Choose CSV and click **Export orders**. | [T] |
| 4 | In the test the file (`orders_export_….csv`) **downloaded straight away**. Shopify's help says larger exports are emailed instead [V – [Exporting orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders)]. | [T] / [V] |

⚠ **Page-size risk:** *Current page* only exports the orders shown on the current page of the list. If you have more open orders than fit on one page,
either show more orders per page / work through each page, or choose **All orders** and delete the fulfilled and cancelled rows in Excel.
Always check that the number of orders in the file matches the count shown in Shopify.

| Shopify order CSV column | → Practical Stock Planner column | Notes |
|---|---|---|
| **Name** (order number, e.g. #1052) | **Sales Order ID** | Orders with several lines have one row per line; many order-level fields (e.g. *Fulfillment Status*) are blank on the extra rows [T] – *Name* is repeated on every row [T]. |
| **Lineitem sku** | **SKU** | Exact header is `Lineitem sku` (lower-case "sku") [T]. Blank for products without a SKU – delete those rows. |
| **Lineitem quantity** | **Open SO Qty** | [T] Keep only lines whose **Lineitem fulfillment status** is not `fulfilled` (unshipped lines show `pending` [T]). For a partly shipped line, check the quantity against the order and adjust by hand, or use Option A. |
| **Created at** | **Ship Date** | No promised date in Shopify. Format is e.g. `2026-10-01 22:54:40 -0400` [T] – use `=DATEVALUE(LEFT(P2,10))` to turn it into a date. Older orders become "past due" demand, which Practical Stock Planner deducts straight away (correct – the customer is waiting). |

Also remove cancelled orders (**Cancelled at** not blank – note the spelling) [T column].

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Option A: zero and `not stocked` rows removed. **Or** Option B: fulfilled, cancelled and blank-SKU rows removed, and the order count matches Shopify.
- [ ] *Ship Date* is a real date (or blank).
- [ ] SKUs exactly match your SKU_Details file.
- [ ] No open orders? Keep the header row and add no data rows. That means none are open.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

**Set the date format before you upload.** On the Load Data page, set **Date format in your files** to match your dates: **Day/Month/Year** (the default, e.g. 05/10/2026 = 5 October) or **Month/Day/Year** (US-style, e.g. 10/05/2026 = 5 October). Only Week Starting Date (Forecast), Ship Date (Open Sales Orders) and Due Date (Open Supply) are read as dates. Dates like 2026-10-05, 2026/10/05 and 13-Apr-2026 are always accepted, whichever setting you choose. If you change the setting, upload the file again. A date that can't fit the setting (e.g. US-style 10/13/2026 under Day/Month/Year) stops the upload, and the message names the file, column, row and value.

Questions? Contact support@practicalsupplychainplanning.com.
