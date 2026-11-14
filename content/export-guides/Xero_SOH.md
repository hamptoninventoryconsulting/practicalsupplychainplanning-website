# Xero → Practical Stock Planner: File 2 – SOH (stock on hand)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a Xero login with access to reports, and Excel._

**Checked:** against Xero Central help pages (central.xero.com, Australian versions, read 2 Oct 2026) and in a live test in Xero's Demo Company (AU) (3 Oct 2026).
**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against Xero Central (link given), not separately tested. **[U]** = unverified – check on screen. **Not yet checked** = couldn't be tested in the demo company.
Excel tips are general Excel and are not tagged. If a Xero label differs slightly, pick the closest match.

**What this file is:** how many units of each SKU you hold today. Columns: `SKU`, `SOH`.
Use this guide if you track your stock in Xero's **Products and services**. If your stock lives in an add-on such as Cin7 or Unleashed, export from the add-on instead.

---

## Before you start

1. **Download the SOH template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SOH.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Tracked vs untracked items.** Only **tracked** inventory items have a stock quantity, average cost and total value in Xero [V] ([About tracked inventory](https://central.xero.com/s/article/Track-your-inventory)); in the test, untracked items showed a blank or zero quantity [T].
   Untracked items can still be planned, but you count their stock outside Xero. To make an item tracked, tick **Track inventory item** and choose an Inventory Asset account [V] ([Add an inventory item](https://central.xero.com/s/article/Add-an-inventory-item)) – talk to your accountant first, because it changes your accounts.
3. **Your user role.** Xero Central says reports need the *administrator*, *standard + reports* or *viewer* role [V]. Not yet checked on screen – the test login showed no role warnings.
4. **Export on the day you plan.** Do it first thing in the morning, and set Practical Stock Planner's *Plan Start Date* to that day (Practical Stock Planner's glossary: the plan start date "should match when the SOH data is captured"). The report opens on today's date by default [T].
5. **One site, single units.** Xero's built-in inventory keeps one quantity per item [T] – this matches Practical Stock Planner's single site.
6. ⚠ **Report exports are not a clean table.** The Excel file starts with 4–7 title rows (report name, organisation, date and filters), then the header row, then **group heading rows** and **Total / Opening Balance / Closing Balance** rows [T]. Delete those extra rows before you paste into the template.

---

## Export steps

**Source:** the **Inventory Item List** report (tracked items only).

| # | Step | Status |
|---|---|---|
| 1 | In the **Reporting** menu, select **All reports**, then find and open **Inventory Item List** (use the search field). | [T] · [Inventory Item List report](https://central.xero.com/s/article/Inventory-Item-List-report-New) |
| 2 | Check the **Date** – it defaults to *Today* – and click **Update**. | [T] |
| 3 | *(Optional)* Click **Columns** to choose columns. | [T] |
| 4 | Click **Export** and choose **Excel** (the other choices are **PDF** and **Google Sheets**). | [T] |

Actual header row of the export [T]: `Item Code, Item Name, Purchases Description, Inventory Type, Unit Cost Price, Unit Sale Price, Total Value, Quantity`.
The report lists **untracked items too** (with 0 quantity and value), grouped into an untracked block and a block per inventory account (e.g. *630 - Inventory*), each with
*Opening Balance*, *Total* and *Closing Balance* rows [T]. **Keep only rows where Inventory Type = `Tracked`** and delete the rest.

## Column mapping

| Xero report column | → Practical Stock Planner column | Notes |
|---|---|---|
| **Item Code** | **SKU** | [T] |
| **Quantity** (if **zero or more**) | **SOH** | [T]. If the number is **negative**, the item is on backorder – put **0** here (see *Backorders* below). Negative quantities: not yet checked (no backorders in the demo). |
| **Total Value** ÷ **Quantity** | → **Cost Price** in SKU_Details | Total value = "Quantity x Average cost" [V]. In the test this equalled *Unit Cost Price* for every tracked item [T]. |

Xero Central says the report shows "the quantity of each item available to sell", with quantity available "calculated as quantity on hand minus open backorders" [V]. The exported column is simply called **Quantity** [T].

**Why this number is right for Practical Stock Planner:** Xero reduces a tracked item's quantity as soon as a sales **invoice is approved** (there is no separate
dispatch step) – Quantity = "Opening balance + adjustments + approved purchases - approved sales" [V] ([Search and view inventory items](https://central.xero.com/s/article/View-inventory-items)).
So stock already invoiced is *already* out of this figure. **Don't** load approved invoices again as open orders in your Open_SO file – they'd be counted twice.

⚠ **Goods received but not yet billed** aren't in the quantity yet, because Xero adds stock when the bill is approved and has no goods-receipt step
("Requires purchase order receipting" is a reason Xero gives for tracked inventory not suiting you [V]). If stock has arrived but the supplier's bill isn't in Xero yet,
either enter the bill first, or add the quantity by hand (and leave that PO line out of your Open_Supply file).

**Backorders:** if you approve an invoice for more than you have, Xero records a **backorder** and the quantity goes **negative** [V] ([About backorders](https://central.xero.com/s/article/About-backorders-for-tracked-inventory)).
Set SOH to 0 and put the outstanding quantity in your Open_SO file. **Reporting › All reports › Open Backorders** lists them [T] ([Open Backorders report](https://central.xero.com/s/article/Open-Backorders-report)).

**Untracked items:** Xero has no quantity for them. Count them and type `SKU` + `SOH` into the template.

## Excel clean-up

1. Delete the title rows, group headings and *Opening Balance / Total / Closing Balance* rows.
2. Keep only rows where **Inventory Type** = `Tracked`. Add untracked items you counted by hand.
3. Change negative quantities to 0.
4. Paste **SKU** and **SOH** into the **SOH** template. Rows for the same SKU are simply added up.

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, header in row 1, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Xero's title rows, group headings and total rows removed.
- [ ] Only **tracked** rows from the report; untracked items counted by hand.
- [ ] Negative *Quantity* set to 0, with the backorders in Open_SO.
- [ ] Goods received but not yet billed handled (bill entered first, or added by hand).
- [ ] SKUs exactly match your SKU_Details file.
- [ ] Plan Start Date in Practical Stock Planner = the day you ran the Inventory Item List report.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
