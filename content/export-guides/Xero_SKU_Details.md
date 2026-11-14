# Xero → Practical Stock Planner: File 1 – SKU Details (your product list)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a Xero login and Excel._

**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against Xero Central (link given), not separately tested. **[U]** = unverified – check on screen.
If a Xero label differs slightly, pick the closest match.

**What this file is:** the product master. One row per SKU. Every other file links to it by SKU.
Use this guide if you track your stock in Xero's **Products and services**. If your products live in an add-on such as Cin7 or Unleashed, export from the add-on instead.

---

## Before you start

1. **Download the SKU_Details template** from the Practical Stock Planner sidebar (*📥 Templates*) – this is in Practical Stock Planner, not in Xero [T]. Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SKU_Details.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Every item you plan needs a unique item Code.** The Xero item **Code** is your SKU. Xero suggests using "SKU, ASIN, ISBN, MPN, UPC, EAN, GTIN or another standard reference code" as the item code; codes can be up to
   30 characters and names up to 50 characters [V] ([Add an inventory item](https://central.xero.com/s/article/Add-an-inventory-item), [Import inventory items](https://central.xero.com/s/article/Import-inventory-items-into-Xero)).
   Codes can contain spaces and hyphens (e.g. `TSS - Black` in the demo [T]) – copy them exactly.
3. **Your user role.** Exporting the item list needs the administrator or standard role (or permission to view items) [V].
4. **Units.** Xero items have no unit-of-measure field [T]. Everything is counted in single units (the unit you buy and sell the item in).

---

## Export steps

**Source:** the **Products and services** CSV export. (Don't use the *Inventory Item Details* report – it has no separate Item Code column [T].)

| # | Step | Status |
|---|---|---|
| 1 | In the **Sales** menu, select **Products and services**. | [T] · [Export inventory items out of Xero](https://central.xero.com/s/article/Export-inventory-items-out-of-Xero) |
| 2 | *(Optional)* The list opens with a **Status = Active** filter; use **Add filter** to change which items are shown. Keep *Active* to leave out items you no longer use. After you export, check the CSV only contains the items you meant to include. | [T] |
| 3 | Click **Export**, then select **CSV**. The file downloads straight away (e.g. `InventoryItems-20261003.csv`). | [T] |

Actual header row of the CSV [T]:
`*ItemCode, ItemName, Quantity, PurchasesDescription, PurchasesUnitPrice, PurchasesAccount, PurchasesTaxRate, SalesDescription, SalesUnitPrice, SalesAccount, SalesTaxRate, InventoryAssetAccount, CostOfGoodsSoldAccount, Status, InventoryType`

## Column mapping

| Xero CSV column | → Practical Stock Planner column | Notes |
|---|---|---|
| **\*ItemCode** (the header includes the asterisk) | **SKU** | Must be unique. [T] |
| **ItemName** (or **PurchasesDescription** / **SalesDescription**) | **Description** | ItemName is max 50 characters [V]. [T] |
| *(not held)* | **UoM** | Unit of measure: the unit you count and sell stock in. `EA` means "each", one single item. No unit field in Xero [T] – type `EA` (or leave blank – Practical Stock Planner fills `EA`). |
| *(not held)* | **Group** | No category field [T]. Type your own groups, or leave blank → "Group TBD". |
| *(not held)* | **Safety Stock Weeks** | Type your target in weeks (e.g. 2), or leave blank to use the default Safety Stock Weeks you set in the app. |
| **PurchasesUnitPrice** – *or better, tracked items' average cost* | **Cost Price** | PurchasesUnitPrice = "The price you pay for the item in your base currency" (tax-inclusive if you enter bills tax-inclusive) [V] – use the price excluding sales tax (e.g. GST or VAT). For tracked items, use **Total Value ÷ Quantity** from the **Inventory Item List** report (steps in the Xero SOH guide) – the average cost Xero uses for stock [V]. |
| *(your base currency)* | **Cost Price Currency** | Xero item prices are in your **base currency** [V] – e.g. type `USD` on every row. Only one currency is allowed. ⚠ If blank, Practical Stock Planner assumes **USD**. |
| **InventoryType** (`Tracked` / `Untracked`) | – | Values seen in the test [T]. Handy for spotting untracked items; tracked items also have **InventoryAssetAccount** filled [T]. |
| *(your decision)* | **Status** *(optional column)* | Type `Obsolete` for any product you won't buy again. Practical Stock Planner still shows its stock and demand, but creates no planned supply for it. Leave blank (or type `Active`) for everything else. (Xero's own **Status** column shows `Active` [T] – don't copy it across.) |
| **Quantity** | – | Filled for tracked items only [T]. Use the Xero SOH guide for stock on hand. |

## Excel clean-up

1. Delete rows for services and non-stock items you don't plan (e.g. freight, labour) – Xero keeps them in the same list (the demo file includes *Development work* and *Training* rows [T]).
2. Check for duplicate codes: *Home › Conditional Formatting › Highlight Cells Rules › Duplicate Values* on the ItemCode column.
3. Watch for codes that Excel changes – e.g. leading zeros dropped or codes turned into dates (Xero warns about this when importing too [V]). Open the CSV via
   *Data › From Text/CSV* and set the ItemCode column to *Text*. Long descriptions can contain line breaks [T] – *From Text/CSV* handles these correctly.
4. Copy the finished columns into the **SKU_Details** template (paste as values), with header **SKU** (not `*ItemCode`).

**Keep the CSV.** Its **PurchasesDescription** and **PurchasesUnitPrice** columns help with the SKU_Supplier_Details file later.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Services and non-stock items removed.
- [ ] Every row has a SKU, no SKU appears twice, and codes are exactly as in Xero (no lost leading zeros).
- [ ] Cost Price excluding sales tax (average cost for tracked items).
- [ ] One currency in *Cost Price Currency* (your Xero base currency, e.g. `USD`).
- [ ] Products you won't buy again marked `Obsolete`.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
