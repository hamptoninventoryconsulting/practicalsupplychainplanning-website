# QuickBooks Online → Practical Stock Planner: File 4 – Open_Supply (stock you've ordered but not yet received)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a QuickBooks Online login with access to reports, and Excel._

**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = stated in Intuit's official help (link given), not separately tested. **[U]** = unverified – check on screen.
If a QuickBooks label differs slightly, pick the closest match.

**What this file is:** your open purchase orders – what's still to arrive, and when. Columns: `Supply Order ID`, `SKU`, `Supply Qty`, `Due Date`.

---

## Before you start

1. **Download the Open_Supply template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_Open_Supply.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Purchase orders need Plus or Advanced.** "Purchase orders are only available in QuickBooks Online Plus and QuickBooks Online Advanced" [V] ([Run purchase order reports](https://quickbooks.intuit.com/learn-support/en-us/help-article/vendor-management/run-purchase-order-reports/L9o7cz3sj_US_en_US)).
   *Open Purchase Order Detail* is ticked for **Plus** in Intuit's report table [V] ([Reports included in your subscription](https://quickbooks.intuit.com/learn-support/en-us/help-article/purchase-orders/reports-included-quickbooks-online-subscription/L0s4KrGgr_US_en_US)). On another plan, type your open POs into the template.
3. **Have your Product/Service List export ready** (QuickBooks SKU Details guide). This report has no SKU column, so you look the SKU up by name.
4. **No due date on purchase orders.** The report has a **Transaction date** but **no due/expected date** column [T]. You type the expected arrival date.
5. **Update overdue dates.** Supply dated **before** the plan start date is ignored.
6. **Duplicate rows are fine.** Rows for the same SKU and date are simply added up (the app sums by SKU per week, with weeks starting Monday).
7. ⚠ **Report exports are not a clean table** (title rows, heading rows, *Total for …* and *TOTAL* rows) and **dates come out as text** in `DD/MM/YYYY` form [T]. Convert them (*Data › Text to Columns › Finish*, with DMY dates; or `=DATEVALUE()`). For the upload itself, DD/MM/YYYY text is fine with **Date format in your files** = **Day/Month/Year**; a US export in MM/DD/YYYY needs **Month/Day/Year**.

> ⚠ **Don't use "Open Purchase Order List by Supplier".** It's one row per PO with **amounts only** – header `Date, No., Memo, Ship via, Amount, Open Balance` – **no product and no quantity columns** [T]. It can't give you Supply Qty.

---

## Export steps

**Source:** the **Open Purchase Order Detail** report – one row per open PO line with the date, PO number, supplier, product, quantity, billed, received and backordered quantities and the open balance [T].

| # | Step | Status |
|---|---|---|
| 1 | **Reports › Standard reports**. | [T] · [Run purchase order reports](https://quickbooks.intuit.com/learn-support/en-us/help-article/vendor-management/run-purchase-order-reports/L9o7cz3sj_US_en_US) |
| 2 | Search **Open Purchase Order** and open **Open Purchase Order Detail** (not *Open Purchase Order List by Supplier*). | [T] |
| 3 | Set the date range to **All Dates**. ⚠ The default range can leave out an older open purchase order – with *All Dates* it is included [T]. | [T] |
| 4 | No customising needed – the quantity columns are there by default [T]. | [T] |
| 5 | **Export ▼ › Export to Excel** (or CSV/PDF). | [T] |

Actual header row (row 5) [T]:
`Transaction date, No., Supplier display name, Product/Service full name, Account Name, Quantity, Billed quantity, Received quantity, Backordered quantity, Total amount, Received amount, PO open balance`
Data rows start in column B; column A holds product/category heading rows, then **Total for …** and **TOTAL** rows [T]. Example: `24/12/2025 | 1005 | Hall's Promotional International | Promotional items:Misc | … | 100 | 0 | 0 | 100 | 113.43 | 0 | 113.43`.

## Column mapping

| QuickBooks (Open Purchase Order Detail) | → Practical Stock Planner | Notes |
|---|---|---|
| **No.** (PO number) | **Supply Order ID** | [T] |
| **Product/Service full name** | **SKU** | There's **no SKU column** by default [T] – look the SKU up from your Product/Service List by full name (`=XLOOKUP(E6, ProductList!A:A, ProductList!G:G)`). If *Customize* does not offer a SKU column, keep using that lookup. Drop lines whose product isn't an Inventory item. |
| **Backordered quantity** | **Supply Qty** | The quantity still to come [T] (for example: ordered 100, received 0, backordered 100). Cross-check: Quantity − Received quantity. |
| *(no due date column)* | **Due Date** | Type the expected date, or leave blank → plan start + default lead time. Don't use *Transaction date* – that's the order date. |

**How "still to receive" works:** you receive a PO by adding it to a **bill, cheque or expense** [V – article [Add purchase orders to expenses, bills, or checks](https://quickbooks.intuit.com/learn-support/en-us/help-article/purchase-orders/add-purchase-orders-expenses-bills-checks-online/L9pRK49uC_US_en_US)].
For a part-received purchase order, use **Backordered quantity** as the quantity still to come. If that figure does not match what you still expect, open the purchase order and type the remaining quantity.

## Excel clean-up

1. Delete the title rows, heading rows in column A, *Total for …* and *TOTAL* rows.
2. Delete lines that aren't Inventory items.
3. Add the SKU by lookup; keep **No.**, SKU, **Backordered quantity**, and type the **Due Date**.
4. Paste into the **Open_Supply** template (paste as values).

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, header in row 1, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] From **Open Purchase Order Detail** with **All Dates** – *not* from Open Purchase Order List by Supplier.
- [ ] Supply Qty = **Backordered quantity**, in single units.
- [ ] Due dates typed (or blank) – none before the plan start date.
- [ ] SKUs exactly match your SKU_Details file.
- [ ] No open purchase orders? Keep the header row and add no data rows. That means none are open.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

**Set the date format before you upload.** On the Load Data page, set **Date format in your files** to match your dates: **Day/Month/Year** (the default, e.g. 05/10/2026 = 5 October) or **Month/Day/Year** (US-style, e.g. 10/05/2026 = 5 October). Only Week Starting Date (Forecast), Ship Date (Open Sales Orders) and Due Date (Open Supply) are read as dates. Dates like 2026-10-05, 2026/10/05 and 13-Apr-2026 are always accepted, whichever setting you choose. If you change the setting, upload the file again. A date that can't fit the setting (e.g. US-style 10/13/2026 under Day/Month/Year) stops the upload, and the message names the file, column, row and value.

Questions? Contact support@practicalsupplychainplanning.com.
