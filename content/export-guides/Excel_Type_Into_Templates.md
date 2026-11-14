# Excel → Practical Stock Planner: typing your data into the templates (any file)

_Practical Stock Planner – Time-phased inventory planning. One short guide for all 7 templates. No IT skills needed – just Excel._

**Use this guide when** your system doesn't hold the data, or you only have a few rows – for example open purchase orders kept in email, a short supplier list, or a business that has no system guide yet.

---

## Before you start

1. **Download the template you need** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file, from the templates `template_SKU_Details.csv`, `template_SOH.csv`, `template_Open_SO.csv`, `template_Open_Supply.csv`, `template_Supplier_Details.csv`, `template_SKU_Supplier_Details.csv` and `template_Forecast.csv`. **Keep the header row exactly as it is.** After filling a template in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**. Extra columns are ignored.
2. **All 7 files are needed**, and each needs at least one data row. Nothing to enter in a file? Contact support@practicalsupplychainplanning.com.
3. **SKUs must match exactly** across all files (upper/lower case, spaces and leading zeros count). Format SKU columns as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel, it can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*.
4. **Single units.** Quantities in SOH, Open_SO, Open_Supply and Forecast are in each SKU's UoM (unit of measure, e.g. `EA` = each). Only the buying terms in SKU_Supplier_Details are in supplier packs.
5. **Dates** must be real Excel dates, not text. Practical Stock Planner moves every date to the Monday of its week.
6. **Duplicate rows are fine** in SOH, Open_SO, Open_Supply and Forecast. Rows for the same SKU and date are simply added up (the app sums by SKU per week, with weeks starting Monday).
7. **One site.** Add up stock from several locations, or enter one row per location – SOH rows are added up per SKU.

---

## File 1 – SKU_Details (one row per product)

| Column | What to type | Blank means |
|---|---|---|
| **SKU** | Your product code. **Must be unique.** | – (required) |
| **Description** | Product name | "<SKU> - Description" |
| **UoM** | Unit of measure: the unit you count and sell stock in. `EA` means "each", one single item. | `EA` |
| **Group** | Your product group or category | "Group TBD" |
| **Safety Stock Weeks** | Your target in weeks (e.g. 2) | The default Safety Stock Weeks you set in the app |
| **Cost Price** | Unit cost, excluding sales tax. Not negative. | 0 |
| **Cost Price Currency** | e.g. `USD`. **One currency only** across all rows. | ⚠ USD |
| **Status** *(optional)* | Type `Obsolete` for any product you won't buy again – Practical Stock Planner still shows its stock and demand, but creates no planned supply for it. Otherwise leave blank or type `Active`. | Active |

## File 2 – SOH (stock on hand)

| Column | What to type | Blank means |
|---|---|---|
| **SKU** | Product code | – |
| **SOH** | Good stock you physically hold today, in single units. Don't subtract open customer orders – they go in Open_SO. | 0 |

Set Practical Stock Planner's *Plan Start Date* to the day you counted.

## File 3 – Open_SO (customer orders not yet shipped)

| Column | What to type | Blank means |
|---|---|---|
| **Sales Order ID** | Order number (one row per order line is fine). The column must be there, but the plan never uses it. | Fine – not used |
| **SKU** | Product code | – |
| **Open SO Qty** | Quantity still to ship | 0 |
| **Ship Date** | Promised ship date. Past dates count as past-due demand. | Plan start date, moved to the Monday of that week, with a warning |

Each week, Practical Stock Planner plans for whichever is higher: your forecast or your open orders. If a SKU's open orders are below its forecast, they don't change the plan, so one total line per SKU is enough. Order-by-order detail only matters when open orders are more than the forecast, for example a large one-off order.

## File 4 – Open_Supply (purchase orders not yet received)

| Column | What to type | Blank means |
|---|---|---|
| **Supply Order ID** | PO number. The column must be there, but the plan never uses it. | Fine – not used |
| **SKU** | Product code | Row is dropped |
| **Supply Qty** | Quantity still to receive, in single units (cartons × units per carton) | 0 |
| **Due Date** | Expected arrival date. ⚠ Dates before the plan start are **ignored** – update overdue dates first. | Plan start + the Default Lead Time (Weeks) setting (starts at 3, not the product's own lead time), with a warning |

## File 5 – Supplier_Details (one row per supplier)

| Column | What to type | Blank means |
|---|---|---|
| **Supplier Code** | Your short code, e.g. `BAYSIDE`. **Must be unique.** | – |
| **Supplier Name** | Supplier's name | "Supplier TBC" |
| **Supplier Contact** | Person, email or phone. Shown only on Planned Order Details (and its export), not on the Draft PO. | Blank |
| **Minimum Order Value** | Supplier's minimum order value. Only marks planned lines Recommended Yes/No; doesn't change quantities. | 0 (every line Recommended No) |
| **Currency** | Currency you buy in, e.g. `USD` | ⚠ USD |

## File 6 – SKU_Supplier_Details (buying terms per SKU)

Columns: **SKU**, **Supplier Code**, **Supplier Part**, **Supplier Part Description**, **Lead Time Weeks**, **Supplier UoM** (the pack you buy in, e.g. `CTN` = carton), **Supplier UoM Conversion** (units per pack, never 0), **MOQ Supplier UoM**, **Lot Size Supplier UoM**, **Price per Supplier UoM**.
One supplier per SKU – the first row wins. Full details: the *Excel – SKU_Supplier_Details* guide.

## File 7 – Forecast (expected weekly sales)

| Column | What to type | Blank means |
|---|---|---|
| **SKU** | Product code | – |
| **Forecast Qty** | Expected units sold that week | 0 |
| **Week Starting Date** | The Monday of the week | Row not used, with a warning |

One row per SKU per week. Full details: the *Excel – Forecast* guide.

## Checklist

- [ ] Header rows unchanged; each file saved as its own CSV (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Every file has at least one data row.
- [ ] SKUs identical across files; every SKU is in SKU_Details.
- [ ] Supplier Codes identical in Supplier_Details and SKU_Supplier_Details.
- [ ] One currency in *Cost Price Currency*; currency filled in for every supplier.
- [ ] Dates are real dates; no overdue PO dates.
- [ ] Plan Start Date in Practical Stock Planner = the day your SOH was counted.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

**Set the date format before you upload.** On the Load Data page, set **Date format in your files** to match your dates: **Day/Month/Year** (the default, e.g. 05/10/2026 = 5 October) or **Month/Day/Year** (US-style, e.g. 10/05/2026 = 5 October). Only Week Starting Date (Forecast), Ship Date (Open Sales Orders) and Due Date (Open Supply) are read as dates. Dates like 2026-10-05, 2026/10/05 and 13-Apr-2026 are always accepted, whichever setting you choose. If you change the setting, upload the file again. A date that can't fit the setting (e.g. US-style 10/13/2026 under Day/Month/Year) stops the upload, and the message names the file, column, row and value.

Questions? Contact support@practicalsupplychainplanning.com.
