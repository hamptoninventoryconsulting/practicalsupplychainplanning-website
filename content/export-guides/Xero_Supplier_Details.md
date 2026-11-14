# Xero → Practical Stock Planner: File 5 – Supplier_Details (your supplier list)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a Xero login and Excel._

**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against Xero Central (link given), not separately tested.

**What this file is:** one row per supplier. Practical Stock Planner shows these on planned supply orders and checks minimum order values.
Columns: `Supplier Code`, `Supplier Name`, `Supplier Contact`, `Minimum Order Value`, `Currency`.

---

## Before you start

1. **Download the Supplier_Details template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_Supplier_Details.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **There's no supplier export on the current screen** [T]. **Contacts › Suppliers** lists your suppliers, but its **Actions** menu has no Export option, and no CSV could be downloaded [T].
   Xero Central's *Export contacts* article describes a menu-icon › Export route [V] ([Export contacts](https://central.xero.com/s/article/Export-contacts-out-of-Xero)). If you don't see Export, type the supplier list in (step 3).
3. **So you type it in.** Most small businesses buy from a handful of suppliers, so this is quick. Type it once and keep it.

---

## Steps

| # | Step | Status |
|---|---|---|
| 1 | Go to **Contacts › Suppliers** – use the list as your checklist. (The **Supplier** column on **Purchases › Purchase orders** also shows who you buy from.) | [T] |
| 2 | Open each supplier you plan for, and copy the contact person, email or phone. | – |
| 3 | Type one row per supplier into the **Supplier_Details** template. | – |

## Column mapping

| Practical Stock Planner column | What to type | Notes |
|---|---|---|
| **Supplier Code** | Your own short code (e.g. `BAYSIDE`) or the supplier name | Must be unique, and must match the *Supplier Code* in your SKU_Supplier_Details file exactly. |
| **Supplier Name** | The contact name as shown in Xero (e.g. *Bayside Wholesale*) [T] | Blank → "Supplier TBC". |
| **Supplier Contact** | Person, email or phone – open the contact in Xero to copy it | Optional. Shown only on Planned Order Details, not on the Draft PO. |
| **Minimum Order Value** | The supplier's minimum order, if any | Blank → 0. It only marks lines Recommended Yes/No (a 0 marks every line No); it does not change order quantities. |
| **Currency** | The currency you buy in, e.g. `USD` | ⚠ Blank → USD. |

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] One row per supplier you buy stock from; no Supplier Code appears twice.
- [ ] Supplier Codes typed exactly the same as in your SKU_Supplier_Details file.
- [ ] Currency filled on every row (blank means USD).

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
