# QuickBooks Online → Practical Stock Planner: File 5 – Supplier_Details (your supplier list)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a QuickBooks Online login with access to reports, and Excel._

**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = stated in Intuit's official help, not separately tested.
If a QuickBooks label differs slightly, pick the closest match.

**What this file is:** one row per supplier. Practical Stock Planner shows these on planned supply orders and checks minimum order values.
Columns: `Supplier Code`, `Supplier Name`, `Supplier Contact`, `Minimum Order Value`, `Currency`.

---

## Before you start

1. **Download the Supplier_Details template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_Supplier_Details.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. ⚠ **Report exports are not a clean table.** The file has title rows above the header and a timestamp line at the bottom [T]. Delete them before you paste into the template.

---

## Export steps

| # | Step | Status |
|---|---|---|
| 1 | **Reports › Standard reports** › search **Supplier Contact List**. In a US company the report may be named *Vendor Contact List* [V]. | [T] |
| 2 | The default columns are enough. If you buy in a currency that is not on the report, type it into the template. | [T] |
| 3 | **Export ▼ › Export to Excel**. | [T] |

Actual header row (row 4) [T]: `Supplier, Phone numbers, Email, Full name, Billing address, Account No.` – no currency column [T].

## Column mapping

| QuickBooks | → Practical Stock Planner column | Notes |
|---|---|---|
| **Supplier** (display name) | **Supplier Code** | [T]. Must be unique. It matches *Supplier display name* on the Open Purchase Order Detail report [T] and should match *Preferred supplier name* on the Product/Service List, so your SKU_Supplier_Details file links without a lookup. |
| **Supplier** (or **Full name**) | **Supplier Name** | [T]. *Full name* is the contact person (e.g. `Christina  Hall` – note double spaces in the export [T]; use *TRIM*). |
| **Full name** / **Phone numbers** / **Email** | **Supplier Contact** | [T] |
| *(not held)* | **Minimum Order Value** | Type it if needed, else blank (→ 0). It only sets Recommended Yes/No; a 0 marks every line No. |
| *(no currency column)* | **Currency** | Type the currency you buy in, e.g. `USD`. ⚠ Blank → USD. |

The list contains **all** suppliers (banks, utilities, individuals) [T] – keep only the ones you buy stock from.

## Checklist

- [ ] Template header row unchanged, header in row 1, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Title rows and timestamp line removed.
- [ ] Only suppliers you buy stock from; no Supplier Code appears twice.
- [ ] Supplier Codes match the Preferred supplier names used in your SKU_Supplier_Details file.
- [ ] Currency filled on every row (blank means USD).

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
