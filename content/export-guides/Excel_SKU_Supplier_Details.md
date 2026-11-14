# Excel → Practical Stock Planner: File 6 – SKU_Supplier_Details (how each product is bought)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just Excel._

**Tags (in the "Where to find it" table):** **[T]** = tested on screen or in the exported file during our live tests (Shopify 2 Oct 2026, Xero and QuickBooks Online AU 3 Oct 2026, WooCommerce 11.1.2 2 Oct 2026). **[V]** = checked against the system's official help (link given), not separately tested.

**What this file is:** the buying terms for each SKU – who you buy it from, lead time, pack size, minimum order and price.
Shopify, WooCommerce, Xero and QuickBooks Online don't hold most of these terms, so you build this file once in Excel and update it when buying terms change.

---

## Before you start

1. **Download the SKU_Supplier_Details template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SKU_Supplier_Details.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Finish SKU_Details and Supplier_Details first.** Every SKU here must be in SKU_Details, and every Supplier Code must match Supplier_Details exactly.
3. **One supplier per SKU.** Practical Stock Planner uses only the **first** row for each SKU. If you list alternates, put the preferred supplier first.
4. **SKUs with no row** still get planned, with defaults: no supplier, the default lead time and MOQ 1.

---

## Steps

1. Copy the **SKU** column from your SKU_Details file into the template.
2. Fill in **Supplier Code** for each SKU (see *Where to find it* below).
3. Type the buying terms. Leave a cell blank to use the default shown in the table.
4. Check for duplicates: the same SKU + Supplier Code twice, or the same Supplier Code + Supplier Part twice.

## Column mapping

| Practical Stock Planner column | What to enter | Blank means |
|---|---|---|
| **SKU** | Your product code, exactly as in SKU_Details | – (required) |
| **Supplier Code** | The supplier you buy this SKU from. Must match *Supplier Code* in Supplier_Details. | Supplier shows as "Supplier TBC" |
| **Supplier Part** | The supplier's own item code | Description, then SKU. ⚠ Two blank Supplier Parts for the same supplier may be flagged as duplicates – safest to put your own SKU here. |
| **Supplier Part Description** | The supplier's description | Your product description |
| **Lead Time Weeks** | Order-to-receipt time, in whole weeks | The default lead time setting |
| **Supplier UoM** | The unit you buy in from your supplier, e.g. `CTN` for a carton | "BASE EA" (you buy single items) |
| **Supplier UoM Conversion** | Units per supplier pack (carton of 12 → `12`). **Never 0.** | 1 |
| **MOQ Supplier UoM** | Minimum order, in supplier packs | 1 |
| **Lot Size Supplier UoM** | Order multiple above the MOQ, in supplier packs | 1 |
| **Price per Supplier UoM** | Purchase price per supplier pack, excluding sales tax = unit cost × conversion | 0 |

## Where to find it in your system

| System | Supplier Code | Supplier Part / Description | Price per Supplier UoM |
|---|---|---|---|
| **Shopify** | Product CSV **Vendor** – one vendor per product; fill down on variant rows [T]. Use the same text as the Supplier Code. | Supplier SKU is on **purchase-order lines** and the PO PDF, with no CSV export [V] [T] ([Creating purchase orders](https://help.shopify.com/en/manual/products/inventory/purchase-orders/creating-purchase-orders)) | Product CSV **Cost per item** × conversion [T] |
| **WooCommerce** | Not held – the product export has no supplier column [T]. Type it. | Not held – type it | Product CSV **Cost of goods** × conversion [T], or your supplier price list |
| **Xero** | Not on the item. **Inventory Item Details** report: rows with **Source** = *Payable Invoice* show the supplier in the **Contact** column [T]. Or check recent POs. | **PurchasesDescription** in the Products and services CSV [T] | **PurchasesUnitPrice** × conversion – use the price excluding sales tax (e.g. GST or VAT) [V] |
| **QuickBooks Online** | **Preferred supplier name** on the Product/Service List report [T – column] | **Purchase description** [T] | **Purchase price** × conversion [T – column] |

None of these systems holds lead time, MOQ, lot size or supplier pack size. Type them.
**Xero tip:** compare PO *Date raised* with bill dates for a rough lead time.

**Shopify tip – keep buying data in Shopify:** add **product metafields** (e.g. "Lead time weeks", "MOQ", "Carton qty") under **Settings → Metafields and metaobjects → Products → Add definition** [T].
Product metafields come out in the **product CSV export** as extra columns named like `Lead time weeks (product.metafields.custom.lead_time_weeks)` [T].
⚠ **Variant** metafields are *not* in the product CSV [V – [Using CSV files for products](https://help.shopify.com/en/manual/products/import-export/using-csv)], so this works best when buying terms are the same for all variants of a product.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Every SKU is in SKU_Details; every Supplier Code is in Supplier_Details (exact match).
- [ ] Preferred supplier first where a SKU has more than one row.
- [ ] Supplier UoM Conversion never 0; MOQ, lot size and price in supplier packs.
- [ ] Prices excluding sales tax.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
