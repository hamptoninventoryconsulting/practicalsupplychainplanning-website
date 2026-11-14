# Shopify → Practical Stock Planner: File 1 – SKU Details (your product list)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just Shopify admin access and Excel._

**Checked:** against Shopify Help Center pages (read 25 Sep 2026) and in a live test in a Shopify development store (2 Oct 2026).
**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against Shopify's official Help Center (link given), not separately tested. **[U]** = unverified – check on screen.
Excel tips are general Excel and are not tagged. If a Shopify label differs slightly, pick the closest match.

**What this file is:** the product master. One row per SKU. Every other file links to it by SKU.

---

## Before you start

1. **Download the SKU_Details template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SKU_Details.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Every product you plan needs a SKU in Shopify, and SKUs must be unique.** Duplicate SKUs make the upload fail. Products without a SKU can't be planned.
   (Shopify describes SKU as "the Stock Keeping Unit (SKU) of a variant, used to track inventory" – [Using CSV files for products](https://help.shopify.com/en/manual/products/import-export/using-csv) [V].)
3. **Check your email.** The product export is **emailed to the store owner as a download link** – it does not download straight away [T]. If you are not the store owner, ask them to forward the email (or the file).

---

## Export steps

| # | Step | Status |
|---|---|---|
| 1 | From your Shopify admin, go to **Products**. | [T] · [Exporting products](https://help.shopify.com/en/manual/products/import-export/export-products) |
| 2 | Click **Export**. | [T] |
| 3 | Choose **All products** (or *Products that match your search and filters* if you only want some – e.g. filter out gift cards). | [V] same page |
| 4 | Choose **CSV for Excel, Numbers, or other spreadsheet programs**. | [T] |
| 5 | Click **Export products**. The file is **emailed to the store owner as a download link** – open the email and click the link to download the CSV (`products_export_1.csv`). | [T] |

## Column mapping

| Shopify product CSV column | → Practical Stock Planner column | Notes |
|---|---|---|
| **Variant SKU** | **SKU** | Must be filled and unique. [T] |
| **Title** + **Option1 Value** (+ Option2/3 Value) | **Description** | e.g. "Strawberry Jam – 250 g". Products without variants show `Default Title` in Option1 Value [T]. |
| *(not held in Shopify)* | **UoM** | Unit of measure: the unit you count and sell stock in. `EA` means "each", one single item. Type `EA` (or leave blank – Practical Stock Planner fills `EA`). |
| **Type** (your own product type label) | **Group** | Shopify: "A label that describes the product if you need a custom category…" [V]. Blank → Practical Stock Planner uses "Group TBD". |
| *(not held)* | **Safety Stock Weeks** | Type your target in weeks (e.g. 2), or leave blank to use the default Safety Stock Weeks you set in the app. |
| **Cost per item** | **Cost Price** | "How much it costs you to make or acquire the product or variant" [V]; column present [T]. Blank → 0. |
| *(your store currency)* | **Cost Price Currency** | Type your store currency, e.g. `USD`, on every row. Only one currency is allowed. ⚠ If blank, Practical Stock Planner assumes **USD**. |
| *(your decision)* | **Status** *(optional column)* | Type `Obsolete` for any product you won't buy again. Practical Stock Planner still shows its stock and demand, but creates no planned supply for it. Leave blank (or type `Active`) for everything else. |

The **Variant Inventory Tracker** column shows `shopify` when inventory tracking is on for a product, and is blank when it isn't [T]. Switch tracking on for the products you plan.

## Excel clean-up

1. **Fill down product-level fields.** A product with several variants has its details on the first row only; the following rows leave **Title, Vendor, Type, Tags and Status** blank [T].
   Select those columns → *Home › Find & Select › Go To Special › Blanks* → type `=` and the cell above → **Ctrl+Enter**.
2. **Remove image-only rows** – rows with no Variant SKU and no Option1 Value (extra images add extra rows) [V].
3. Build Description: `=B2&" – "&J2` (Title & Option1 Value – adjust the column letters to your file). Delete " – Default Title" where the product has no variants.
4. Check for duplicate SKUs: *Home › Conditional Formatting › Highlight Cells Rules › Duplicate Values* on the Variant SKU column.
5. Copy the finished columns into the **SKU_Details** template (paste as values).

**Keep the product CSV.** Its **Vendor** and **Cost per item** columns help with the SKU_Supplier_Details file later.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Every row has a SKU, and no SKU appears twice.
- [ ] Image-only rows removed; Title and Type filled down on variant rows.
- [ ] One currency in *Cost Price Currency* (e.g. `USD` on every row).
- [ ] Products you won't buy again marked `Obsolete`.
- [ ] SKUs typed exactly the same as in your other files (watch spaces, leading zeros, upper/lower case).

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
