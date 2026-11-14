# WooCommerce → Practical Stock Planner: File 2 – SOH (stock on hand)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a WordPress login with the Administrator or Shop Manager role, and Excel._

**Checked:** against WooCommerce's official docs (woocommerce.com/document, read 2 Oct 2026) and in a live test on a WooCommerce 11.1.2 test site (2 Oct 2026).
**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against WooCommerce's official docs (link given), not tested. **[U]** = unverified – check on screen.
Excel tips are general Excel and are not tagged. If a WooCommerce label differs slightly, pick the closest match.

**What this file is:** how many units of each SKU you hold today. Columns: `SKU`, `SOH`.

---

## Before you start

1. **Download the SOH template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SOH.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Stock management must be on.** A product's **Stock** is only a number when stock management is switched on for it; otherwise the **Stock** column of the export is blank [T] [V] ([Product CSV Importer & Exporter](https://woocommerce.com/document/product-csv-importer-exporter/)).
   Switch it on (product › *Inventory* tab, *Manage stock* [U label]) or count those products outside WooCommerce.
3. **Export on the day you plan.** Do it first thing in the morning, and set Practical Stock Planner's *Plan Start Date* to that day (Practical Stock Planner's glossary: the plan start date "should match when the SOH data is captured").
4. **One site, single units.** WooCommerce core has **one stock number per product** (a single *Stock* column, no locations) [T]. Everything is counted in the unit you sell.

---

## Option A – the product export (recommended)

Use the **Stock** column of the product CSV: **Products › All Products › Export › Generate CSV** (full steps in the WooCommerce SKU Details guide) [T].
It's a number for products with stock management on, blank otherwise [T] [V]. **In stock?** is `1` for in stock [T].
It downloads straight away and is never emailed [T].

## Option B – Analytics › Stock

| # | Step | Status |
|---|---|---|
| 1 | **Analytics › Stock**. | [T] · [V] [Stock report](https://woocommerce.com/document/woocommerce-analytics/stock-report/) |
| 2 | **Show** › **All products** (other choices: Out of stock, Low stock, In stock, On backorder [V]). | [T] |
| 3 | Click **Update now** (Data status), then **Download** (top right of the table). | [T] |

Exact header row [T]: `"Product / Variation",SKU,Status,Stock`
⚠ Products **without stock management show "N/A" on screen but `0` in the CSV** [T] – don't load those zeros as real stock. Variable parents, grouped and external products are listed too [T] – delete them.
⚠ More than 25 rows → the CSV is emailed to the logged-in admin instead of downloading [V] ([Analytics](https://woocommerce.com/document/woocommerce-analytics/)). So Option A is easier.

## Column mapping

| WooCommerce | → Practical Stock Planner column | Notes |
|---|---|---|
| **SKU** | **SKU** | [T]. Keep only `simple` and `variation` rows. |
| **Stock** | **SOH** | **But see the warning below.** |

## ⚠ Avoid double counting open orders

WooCommerce reduces stock when an order becomes **Processing** or **On hold** – before you ship [T] [V] ([Order statuses](https://woocommerce.com/document/managing-orders/order-statuses/)).
On the test site stock fell as soon as orders were set to Processing **or On hold** (e.g. Polo 30 → 25 for an On hold order) [T]. Practical Stock Planner deducts open orders itself (File 3 – Open_SO). Choose **one** of:

- **(a) Recommended – dated demand:** **SOH = WooCommerce Stock + quantity on Processing and On hold orders** (the orders not yet shipped), and list those orders in your Open_SO file.
  In the test, Belt showed 23 = 28 on the shelf − 3 (Processing) − 2 (Completed, shipped) [T]; the physical stock for planning is 23 + 3 = 26.
- **(b) Simple:** **SOH = WooCommerce Stock as it is**, and **leave Processing / On hold orders out of Open_SO** (they're already deducted). You lose their dates, but nothing is counted twice.

**Pending payment** orders don't reduce stock (no payment yet) [V]; WooCommerce's *Hold Stock* setting only reserves stock for a while [V]. Leave them out, or treat them as open orders under (a).
**Completed** = shipped [V] – already out of stock and not open. Cancelled/failed orders return stock [V].

## Excel clean-up

1. Keep only `simple` and `variation` rows with stock management on (a number in **Stock**).
2. Apply (a) or (b) above.
3. Products without stock management: count them and type `SKU` + `SOH` by hand.
4. Paste **SKU** and **SOH** into the **SOH** template. Rows for the same SKU are simply added up.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Only `simple` and `variation` rows; untracked products (blank Stock, or `0` in the Stock report CSV) counted by hand or left out.
- [ ] SOH is **either** Stock + Processing/On hold quantities (with those orders in Open_SO) **or** Stock as it is (with those orders left out) – not both.
- [ ] SKUs exactly match your SKU_Details file.
- [ ] Plan Start Date in Practical Stock Planner = the day you exported this file.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
