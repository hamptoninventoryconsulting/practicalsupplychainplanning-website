# QuickBooks Online → Practical Stock Planner: File 1 – SKU Details (your product list)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a QuickBooks Online login with access to reports, and Excel._

**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = stated in Intuit's official help (link given), not separately tested. **[U]** = unverified – check on screen.
If a QuickBooks label differs slightly, pick the closest match.

**What this file is:** the product master. One row per SKU. Every other file links to it by SKU.

---

## Before you start

1. **Download the SKU_Details template** from the Practical Stock Planner sidebar (*📥 Templates*) – this is in Practical Stock Planner, not in QuickBooks [T]. Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SKU_Details.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Check your plan.** "Inventory features are available for QuickBooks Online **Plus and Advanced**. If you use QuickBooks Online Simple Start or Essentials … you can buy the **inventory add-on** or upgrade" [V]
   ([Set up and track your inventory](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-management/set-track-inventory-quickbooks-online/L22FZLBGN_US_en_US)). Your plan is under *Settings ⚙ › **Subscriptions and billing*** [T – menu label].
3. **Every inventory item needs a SKU.** SKU is an optional field on QuickBooks items [V]; the sample's inventory items had SKUs (e.g. `NB-1944`, `GB-823`, `WB-0025`) and its service items had none [T].
   Items without a SKU: use the **Product/Service full name** as the SKU, consistently in all files.
4. **Units.** QuickBooks Online counts each item in one unit; no unit-of-measure field appeared in the report or export [T].
5. ⚠ **Report exports are not a clean table.** The file starts with 2–4 title rows (company name, report name, date), then the header row, then **Service** rows mixed in, and a **TOTAL** row and timestamp line at the bottom [T]. Delete those extra rows before you paste into the template.

---

## Export steps

**Source:** the **Product/Service List** report.

| # | Step | Status |
|---|---|---|
| 1 | Go to **All apps › Sales & Get Paid › Products & services**. | [T] · [Export your QuickBooks Online data](https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/export-reports-lists-data-quickbooks-online/L1xleDrLp_US_en_US) |
| 2 | Select **More ▼ › Run report** (opens the **Product/Service List** report). | [T] |
| 3 | Click **Customize** and add the columns you need: **SKU**, **Preferred supplier name**, **Purchase description**. (*Type*, *Purchase price* and *Quantity on hand* are already shown.) | [T] |
| 4 | **Export ▼ › Export to Excel** (or *Export as CSV*). | [T] |
| *Alt.* | The **Products and services** page itself also has an **Export to Excel** button – but it exports that screen's columns, not your customised report. | [T] |

Actual header row of the export (row 4, after customising) [T]:
`Product/Service full name, Type, Memo/Description, Sales price, Purchase price, Quantity on hand, SKU, Preferred supplier name, Purchase description`

## Column mapping

| QuickBooks column | → Practical Stock Planner column | Notes |
|---|---|---|
| **Type** | – (filter) | Keep `Inventory` only; drop `Service` (and Non-inventory) rows [T]. |
| **SKU** (or *Product/Service full name* if no SKU) | **SKU** | [T]. ⚠ The full name includes parent/category prefixes separated by colons, e.g. `General services:Badges:Name Badges` [T]. |
| **Memo/Description** (or **Purchase description**) | **Description** | [T] |
| *(no field)* | **UoM** | Unit of measure: the unit you count and sell stock in. `EA` means "each", one single item. No unit field [T] – type `EA` (or leave blank – Practical Stock Planner fills `EA`). |
| *(no Category column)* | **Group** | No separate category column in the export [T]. The first part of *Product/Service full name* (before the first `:`, e.g. `General services`) can serve as a group – whether that prefix is a category or a parent item depends on your setup [U]. Blank → "Group TBD". |
| *(your choice)* | **Safety Stock Weeks** *(optional)* | How many weeks of extra cover you want held for this product. Leave blank to use the default Safety Stock Weeks you set in the app. |
| **Purchase price** | **Cost Price** | [T]. For the cost QuickBooks values stock at, use **Calc. Avg** from the Inventory Valuation Summary (steps in the QuickBooks SOH guide) [T]. Enter costs **excluding sales tax** (e.g. GST or VAT) – whether *Purchase price* includes tax depends on how you set up the item [U]. |
| *(your currency)* | **Cost Price Currency** | No currency column [T]. Type your currency, e.g. `USD`, on every row. Only one currency is allowed. ⚠ Blank → Practical Stock Planner assumes **USD**. |
| *(your decision)* | **Status** *(optional column)* | Type `Obsolete` for any product you won't buy again. Practical Stock Planner still shows its stock and demand, but creates no planned supply for it. Leave blank (or type `Active`) for everything else. |

**Keep this export.** It also gives *Quantity on hand*, *Preferred supplier name*, *Purchase description* and *Purchase price* – useful for SOH, Supplier_Details and SKU_Supplier_Details.

## Excel clean-up

1. Delete the title rows above the header and the **TOTAL** row (and timestamp line) at the bottom [T].
2. Filter **Type** = Inventory; delete the rest.
3. Check for blank and duplicate SKUs (*Conditional Formatting › Duplicate Values*); format the SKU column as *Text* to keep leading zeros.
4. Copy the finished columns into the **SKU_Details** template (paste as values).

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, header in row 1, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Title rows, *TOTAL* row and timestamp line removed.
- [ ] Only **Inventory**-type items.
- [ ] Every row has a SKU (or the full name, used the same way in every file), and no SKU appears twice.
- [ ] Costs excluding sales tax; one currency in *Cost Price Currency* (e.g. `USD`).
- [ ] Products you won't buy again marked `Obsolete`.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
