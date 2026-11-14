# QuickBooks Online → Practical Stock Planner: File 2 – SOH (stock on hand)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a QuickBooks Online login with access to reports, and Excel._

**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = stated in Intuit's official help (link given), not separately tested. **[U]** = unverified – check on screen.
If a QuickBooks label differs slightly, pick the closest match.

**What this file is:** how many units of each SKU you hold today. Columns: `SKU`, `SOH`.

---

## Before you start

1. **Download the SOH template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SOH.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Inventory needs Plus or Advanced** (or the inventory add-on) [V] ([Set up and track your inventory](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-management/set-track-inventory-quickbooks-online/L22FZLBGN_US_en_US)). No inventory → no SOH from QuickBooks; count stock outside it.
3. **Inventory tracking must be on.** In *Settings ⚙ › Account and settings › Sales › Products and services*, turn on **Track quantity and price/rate** and **Track inventory quantity on hand** [V].
   Only items of type **Inventory** have a quantity on hand [T].
4. **Export on the day you plan.** Do it first thing in the morning, and set Practical Stock Planner's *Plan Start Date* to that day (Practical Stock Planner's glossary: the plan start date "should match when the SOH data is captured"). See the date warning below.
5. **One site.** Keep one quantity per SKU. If you use more than one location, keep one row per SKU per location; the rows are added up.
6. ⚠ **Report exports are not a clean table.** The file has title rows, then the header row, then **category heading rows**, **Total for …** rows, a **TOTAL** row and a timestamp line [T]. Delete those extra rows before you paste into the template.

---

## Option A (recommended) – Inventory Valuation Summary

| # | Step | Status |
|---|---|---|
| 1 | **Reports › Standard reports** › search **Inventory Valuation Summary**. | [T] |
| 2 | Check the date – it defaults to **As of** today. | [T] (see ⚠ below) |
| 3 | **Export ▼ › Export to Excel** (or CSV/PDF). | [T] |

Actual header row (row 5) [T]: `SKU, Qty, Asset Value, Calc. Avg` – with the **product name in column A** (no header), plus **category heading rows**, **Total for …** rows and a **TOTAL** row [T]. Delete those.
⚠ **Check the "As of" date in the file:** on screen the report said *As of October 3, 2026*, but the Excel title said *As of 2 Oct., 2026* [T]. Check the date line in your export matches your plan start date, and re-run if not.

## Column mapping

| QuickBooks | → Practical Stock Planner | Notes |
|---|---|---|
| **SKU** | **SKU** | [T]. Group heading rows show `Not specified` here – delete them. |
| **Qty** | **SOH** | Quantity on hand [T]. |
| **Calc. Avg** | → **Cost Price** in SKU_Details | Average cost = Asset Value ÷ Qty (e.g. 7,500 ÷ 5,000 = 1.50) [T]. |

## Option B – the Product/Service List

Use the **Quantity on hand** column of the Product/Service List (steps in the QuickBooks SKU Details guide) [T]. One export fewer – **but** ⚠ the two reports can disagree. **Compare both for a few items before relying on Option B**, and prefer Option A.

**What changes "on hand"?** Invoices and sales receipts reduce the quantity on hand [U]. A **sales order** reserves items and may leave **Quantity on hand** unchanged [V]. Use the quantity you physically hold.
Bills/cheques/expenses that receive a PO increase on hand – "the quantity on hand automatically increases by the number of items you receive" [V] ([Set up and track your inventory](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-management/set-track-inventory-quickbooks-online/L22FZLBGN_US_en_US)).

**Physical count sheet:** if Standard reports has no stock-take worksheet, count on your own sheet.

## Excel clean-up

1. Delete the title rows, category headings (`Not specified`), *Total for …* and *TOTAL* rows, and the timestamp line.
2. Keep only Inventory items with a SKU.
3. Paste **SKU** and **SOH** into the **SOH** template. Rows for the same SKU are simply added up.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, header in row 1, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] SOH from the Inventory Valuation Summary, with its "As of" date checked.
- [ ] All heading, total and timestamp rows removed.
- [ ] SKUs exactly match your SKU_Details file.
- [ ] Plan Start Date in Practical Stock Planner = the day you ran the Inventory Valuation Summary.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
