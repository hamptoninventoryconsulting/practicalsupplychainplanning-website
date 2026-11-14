# Practical Stock Planner – which data-export guide do I need?

_Practical Stock Planner – Time-phased inventory planning. Start here._

Practical Stock Planner needs **7 input files**. Each short guide covers **one system and one file**, and is named *System_File* (e.g. `Xero_SOH.pdf`).
**Take each kind of data from the system where it really lives** – for example products and stock from Shopify, suppliers and purchase orders from Xero. You can mix systems, as long as SKUs match exactly in every file (case, spaces and leading zeros count). Work through the files in the order below.

| # | File | Type | What it holds | Guides (pick one) |
|---|---|---|---|---|
| 1 | **SKU Details** | Master | Your product list | Shopify · WooCommerce · Xero · QuickBooks · or Excel |
| 2 | **SOH** | Transactional | Stock on hand today | Shopify · WooCommerce · Xero · QuickBooks · or Excel |
| 3 | **Open_SO** | Transactional | Customer orders not yet shipped | Shopify · WooCommerce · or Excel |
| 4 | **Open_Supply** | Transactional | Purchase orders not yet received | Xero · QuickBooks · or Excel |
| 5 | **Supplier_Details** | Master | Your supplier list | Xero · QuickBooks · or Excel |
| 6 | **SKU_Supplier_Details** | Master | Buying terms per SKU (supplier, lead time, pack, MOQ, price) | Excel_SKU_Supplier_Details |
| 7 | **Forecast** | Forecast | Expected sales per SKU per week | Excel_Forecast |

**Master data** (SKU Details, Supplier_Details, SKU_Supplier_Details) is set up once and only changes when you add or change a SKU or supplier. **Transactional data** (SOH, Open_SO, Open_Supply) changes every day, so export it fresh each time you plan. Update the **Forecast** whenever you review it.

"Excel" in rows 1–5 means **Excel_Type_Into_Templates** – one guide that covers typing any file straight into its template.

- **Products in two systems** (e.g. Shopify and Xero): pick one as your master source for SKU Details and use it every time, so codes and descriptions stay consistent.
- **Xero / QuickBooks Online:** use their SOH guide only if you track stock there. If your shop holds your stock, take SOH from the shop.
- **Orders kept in Xero or QuickBooks Online** (quotes, draft invoices, sales orders): neither exports an order list – type them into the Open_SO template.
- **MYOB:** MYOB guides are on the way. Until then, use Excel_Type_Into_Templates.

**Rules for every file**

- **Download the 7 templates** from the Practical Stock Planner sidebar (*📥 Templates*): `template_SKU_Details.csv`, `template_SOH.csv`, `template_Open_SO.csv`, `template_Open_Supply.csv`, `template_Supplier_Details.csv`, `template_SKU_Supplier_Details.csv` and `template_Forecast.csv`. Upload **CSV files only** – one CSV file per input file (comma or semicolon separated). Keep each template's **header row** exactly as it is. In Excel, save with *File › Save As › CSV UTF-8 (Comma delimited)*.
- **Keep leading zeros in SKUs:** format the SKU column as *Text* before you type or paste SKUs, then Save As CSV UTF-8. Opening a CSV directly in Excel can strip leading zeros – import it via *Data › From Text/CSV* and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.
- **Upload refused?** The message *"Please upload a CSV file... Save As CSV UTF-8"* means the file is an Excel workbook (`.xlsx`). Save it with *File › Save As › CSV UTF-8 (Comma delimited)* and upload the `.csv`.
- **Google Sheets:** save each file with *File › Download › Comma-separated values (.csv)*.
- **Date format:** on the Load Data page, set **Date format in your files** to **Day/Month/Year** (default) or **Month/Day/Year** (US-style) to match your files. Dates like 2026-10-05, 2026/10/05 and 13-Apr-2026 always work. Change it? Upload the file again.
- **All 7 files are needed**, each with at least one data row. Nothing to enter? Contact support@practicalsupplychainplanning.com.
- **Single units** everywhere (UoM = unit of measure, e.g. `EA` = each), except the buying terms in SKU_Supplier_Details (e.g. `CTN` = carton).
- **Export everything on one day** and make it the *Plan Start Date*. Weeks start Monday; rows for the same SKU and date are added up.
