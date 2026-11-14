# Shopify → Practical Stock Planner: File 2 – SOH (stock on hand)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just Shopify admin access and Excel._

**Checked:** against Shopify Help Center pages (read 25 Sep 2026) and in a live test in a Shopify development store (2 Oct 2026).
**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against Shopify's official Help Center (link given), not separately tested. **[U]** = unverified – check on screen.
Excel tips are general Excel and are not tagged. If a Shopify label differs slightly, pick the closest match.

**What this file is:** how many units of each SKU you hold today. Columns: `SKU`, `SOH`.

---

## Before you start

1. **Download the SOH template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SOH.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Export on the day you plan.** Do it first thing in the morning, and set Practical Stock Planner's *Plan Start Date* to that day (Practical Stock Planner's glossary: the plan start date "should match when the SOH data is captured").
3. **One site.** Practical Stock Planner plans one site. If you have several Shopify locations, the steps below add them together.
4. **Single units.** SOH is counted in single units (Shopify's normal unit).
5. **Check your email.** The inventory export is **emailed to the store owner as a download link** – it does not download straight away [T].

---

## Export steps

| # | Step | Status |
|---|---|---|
| 1 | From your Shopify admin, go to **Products > Inventory**. | [T] · [Exporting and importing inventory with a CSV file](https://help.shopify.com/en/manual/products/inventory/setup/inventory-csv) |
| 2 | Click **Export**. | [T] |
| 3 | In **Export from**, choose **All locations** (or just your warehouse if only one location is the planning site). | [V] same page |
| 4 | Under **Inventory states shown**, choose **All states**. | [V] same page (the test file contained all the state columns below [T]) |
| 5 | Under **Export**, choose **All variants**, choose the CSV format, then click **Export variants**. | Button name [T]; other options [V] |
| 6 | The file is **emailed to the store owner as a download link** – download `inventory_export_1.csv` from the email. | [T] |

The *All states* file has one row per variant **per location** (column **Location**), with the columns
**Incoming (not editable)**, **Unavailable (not editable)**, **Committed (not editable)**, **Available (not editable)**,
**On hand (current)** and **On hand (new)** [T]. Locations where a variant isn't stocked show the text `not stocked` [T].
**Keep this file** – the quick option in the Shopify Open_SO guide uses it too.

## Column mapping

| Shopify inventory CSV column | → Practical Stock Planner column | Notes |
|---|---|---|
| **SKU** | **SKU** | [T] (the inventory file says **SKU**, the product file says **Variant SKU**) |
| **On hand (current)** − **Unavailable (not editable)** | **SOH** | Shopify definitions [V]: *On hand* = units at the location; *Unavailable* = e.g. damaged, quality hold; *Committed* = units in unfulfilled orders etc.; *Available* excludes committed and unavailable. Ignore **On hand (new)** – it is only for importing changes. |

**Why not "Available"?** Practical Stock Planner loads your open customer orders separately (File 3 – Open_SO). *Available* already subtracts *Committed*, so those orders would be counted twice. Use **On hand minus Unavailable** – the good stock you physically hold.

## Excel clean-up

1. Add a column `SOH` = `On hand (current)` − `Unavailable (not editable)`. If a cell says `not stocked`, treat it as 0 (or delete that row).
2. Several locations? No need to add them up. Rows for the same SKU are simply added up – Practical Stock Planner **sums SOH per SKU automatically**. Paste one row per SKU per location.
3. Delete rows with a blank SKU (products without a SKU can't be planned).
4. Paste **SKU** and **SOH** into the **SOH** template.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] SOH = On hand (current) − Unavailable (not *Available*).
- [ ] `not stocked` cells set to 0 or removed; blank-SKU rows removed.
- [ ] SKUs exactly match your SKU_Details file.
- [ ] Plan Start Date in Practical Stock Planner = the day you exported this file.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
