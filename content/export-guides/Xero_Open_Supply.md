# Xero → Practical Stock Planner: File 4 – Open_Supply (stock you've ordered but not yet received)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a Xero login and Excel._

**Checked:** against Xero Central help pages (central.xero.com, Australian versions, read 2 Oct 2026) and in a live test in Xero's Demo Company (AU) (3 Oct 2026).
**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against Xero Central (link given), not separately tested. **[U]** = unverified – check on screen. **Not yet checked** = couldn't be tested in the demo company.
Excel tips are general Excel and are not tagged. If a Xero label differs slightly, pick the closest match.

**What this file is:** your open purchase orders – what's still to arrive, and when. Columns: `Supply Order ID`, `SKU`, `Supply Qty`, `Due Date`.

---

## Before you start

1. **Download the Open_Supply template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_Open_Supply.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Xero has no export of purchase orders** [T]. The **Purchase orders** list has no export (its *more options* menu has only *Compact view* and *Give feedback*); an open PO has **Print** and **Email** only; the **Purchases overview** has no export either [T].
   Xero also says it "doesn't include your purchase order in any inventory reports" [V] ([Create a purchase order](https://central.xero.com/s/article/Create-purchase-orders)).
   So you **read your open POs on screen and type them into the template**. Small businesses often have only a handful of open POs.
3. **Update overdue dates first.** Supply dated **before** the plan start date is ignored. Update overdue *Expected arrival* dates in Xero before you start.
4. **Single units.** *Supply Qty* is in single units. If you order in cartons, multiply by the carton quantity.
5. **Duplicate rows are fine.** Rows for the same SKU and date are simply added up (the app sums by SKU per week, with weeks starting Monday).

### How Xero tracks "still to receive"
- Purchase orders sit on the tabs **All, Draft, Awaiting approval, Approved, Billed** [T]. **Approved** = ordered, not fully billed.
- When only part arrives, you **create a bill for part of the order**; the PO stays approved [V] ([Account for a part supply](https://central.xero.com/s/article/Account-for-unsupplied-goods-in-purchase-orders)).
  An open PO shows **Ordered**, **Billed** and **remaining** quantities per line (e.g. *Ordered 1, Billed 0, 1 remaining*) [T].
- If the rest will never come, **Close short** – "the remaining quantity is removed from the inventory item's quantity on order balance" [V] ([Close a purchase order short](https://central.xero.com/s/article/Close-a-purchase-order-short)).
- Dates: each PO has a **Delivery date** and an **Expected arrival** date (set on the open PO with **Expected arrival › + Add date**) [T]. Keep *Expected arrival* up to date – it's your best Due Date.

---

## Option A (recommended) – type the open PO lines from the Approved tab

| # | Step | Status |
|---|---|---|
| 1 | Go to **Purchases › Purchase orders** (or from the **Purchases overview**, click **See all** next to purchase orders) and open the **Approved** tab. | [T] |
| 2 | The list shows **Number, Supplier, Reference, Date raised, Delivery date, Expected arrival, Sent, Amount, Files** – use it as your checklist of open POs. | [T] |
| 3 | Open each PO and note, per line, the item and the **remaining** quantity (Ordered − Billed). | [T] |
| 4 | Type one row per open line into the **Open_Supply** template. | – |

## Column mapping

| From the PO | → Practical Stock Planner column | Notes |
|---|---|---|
| **Number** (e.g. `PO-0006`) | **Supply Order ID** | [T] |
| Item code on the line | **SKU** | Lines with no item (description-only) can't be planned – skip them. |
| **Remaining** quantity | **Supply Qty** | [T]. Convert cartons to single units. |
| **Expected arrival** (else **Delivery date**) | **Due Date** | [T]. Both can be blank (the demo PO had neither) – blank → plan start + default lead time. |

## Option B – weekly totals instead of PO lines (many POs)

If you have too many open PO lines to type, enter **weekly totals** instead – Practical Stock Planner adds supply up per SKU per week anyway.
From the Approved tab, total the remaining quantity **per SKU per expected-arrival week**, and enter one row per SKU per week:
**Supply Order ID** = a label such as `POs wk 2026-10-12`, **SKU**, **Supply Qty** = total remaining, **Due Date** = the Monday of that week.
You lose the link to individual PO numbers, but the plan is the same.

**Check total quantities:** each tracked item's record shows **Quantity on order** – "the number of items in approved purchase orders" [V]
([Search and view inventory items](https://central.xero.com/s/article/View-inventory-items)), and the Open Backorders report has **Total On Order** [V]. Your
Open_Supply total per SKU should match (not yet checked on screen).

**Goods received but not yet billed:** if you added them to SOH by hand, leave that PO line out of this file.

> **Not recommended – Payable Invoice Detail › Outstanding purchase orders detail.** This report *can* be exported to Excel [T], but in the test it was unreliable for planning:
> its default filters mix payable invoices with POs; even filtered to *Source contains Purchase Order* and *Status contains Approved* the PO line had a **blank Item Code**
> and a **Quantity of −1**, and it has no Delivery date or Expected arrival column [T]. Use it only as a rough cross-check of which POs are open.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Open POs taken from the **Approved** tab, **remaining** quantity only, in single units.
- [ ] *Expected arrival* dates up to date in Xero – nothing overdue.
- [ ] Description-only lines skipped.
- [ ] SKUs exactly match your SKU_Details file.
- [ ] At least one data row. No open POs at all? Contact support@practicalsupplychainplanning.com about an "empty" Open_Supply file.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

**Set the date format before you upload.** On the Load Data page, set **Date format in your files** to match your dates: **Day/Month/Year** (the default, e.g. 05/10/2026 = 5 October) or **Month/Day/Year** (US-style, e.g. 10/05/2026 = 5 October). Only Week Starting Date (Forecast), Ship Date (Open Sales Orders) and Due Date (Open Supply) are read as dates. Dates like 2026-10-05, 2026/10/05 and 13-Apr-2026 are always accepted, whichever setting you choose. If you change the setting, upload the file again. A date that can't fit the setting (e.g. US-style 10/13/2026 under Day/Month/Year) stops the upload, and the message names the file, column, row and value.

Questions? Contact support@practicalsupplychainplanning.com.
