# WooCommerce → Practical Stock Planner: File 1 – SKU Details (your product list)

_Practical Stock Planner – Time-phased inventory planning. One short guide for one file. No IT skills needed – just a WordPress login with the Administrator or Shop Manager role, and Excel._

**Checked:** against WooCommerce's official docs (woocommerce.com/document, wordpress.org, read 2 Oct 2026) and in a live test on a WooCommerce 11.1.2 test site (2 Oct 2026).
**Tags:** **[T]** = tested on screen or in the exported file. **[V]** = checked against WooCommerce's official docs (link given), not tested. **[U]** = unverified – check on screen.
Excel tips are general Excel and are not tagged. If a WooCommerce label differs slightly, pick the closest match.

**What this file is:** the product master. One row per SKU. Every other file links to it by SKU.

---

## Before you start

1. **Download the SKU_Details template** from the Practical Stock Planner sidebar (*📥 Templates*). Practical Stock Planner accepts **CSV files only** – one CSV file per input file; this one starts from `template_SKU_Details.csv`. **Keep the template's header row exactly as it is.** After filling it in Excel, save it with **File › Save As › CSV UTF-8 (Comma delimited)**.
2. **Every product you plan needs a unique SKU.** Duplicate SKUs make the upload fail. Products without a SKU can't be planned.
3. **Units.** WooCommerce has **no unit-of-measure field** – the product export has no UoM column [T]. Everything is counted in the unit you sell.
4. **Currency.** The export has no currency column [T]. Type your store currency (e.g. `USD`).
5. **Switch on cost (optional, recommended).** *WooCommerce › Settings › Advanced › Features* › tick **Cost of Goods Sold** › *Save changes* [V] ([COGS](https://woocommerce.com/document/woocommerce-cost-of-goods-sold-cogs/)).
   Products then get a **Cost of Goods** field on the *General* tab. For variable products it holds "a default value inherited by all variations", which each variation can override [V].
   COGS "comes to core" in WooCommerce 10.3 [V] ([WooCommerce 10.3 release post](https://developer.woocommerce.com/2025/10/22/woocommerce-10-3-cogs-comes-to-core-and-mcp-beta/)), and the product CSV export includes it [V] [T].

---

## Export steps

| # | Step | Status |
|---|---|---|
| 1 | Go to **Products › All Products** and click **Export** (at the top, next to **Add new product** and **Import**). | [T] · [V] [Product CSV Importer & Exporter](https://woocommerce.com/document/product-csv-importer-exporter/) |
| 2 | The **Export Products** screen opens ("Export products to a CSV file"). Leave **Which columns should be exported?** empty (= all columns). | [T] |
| 3 | **Which product types should be exported?** leave empty (all), or pick **Simple product** and **Product variations** (the types you stock). Choices: Simple product, Grouped product, External/Affiliate product, Variable product, Product variations. | [T] |
| 4 | Leave **Which product category should be exported?** empty, and leave **Export custom meta?** (*Yes, export all custom meta*) unticked – unless you use a cost-of-goods plugin (see below). | [T] |
| 5 | Click **Generate CSV**. The file downloads straight away, named like `wc-product-export-2-10-2026-1790918166944.csv` (day-month-year + a number). | [T] |

The columns you need are **Type, SKU, Name, Low stock amount, Categories, Parent** and (with COGS on) **Cost of goods** [T]. The file has many more columns – ignore them.
**Keep this file** – its **Stock** column is your SOH (see the WooCommerce SOH guide).

## Column mapping

| WooCommerce export column | → Practical Stock Planner column | Notes |
|---|---|---|
| **Type** | – (filter) | Values seen: `simple`, `variable`, `variation`, `grouped`, `external` [T]. Keep `simple` and `variation` rows (they hold the stock). Delete `variable` (parent), `grouped` and `external`. |
| **SKU** | **SKU** | [T]. Keep it exactly – SKUs keep their case (the sample has `Woo-tshirt-logo` next to `woo-tshirt`) [T]. Variations have their own SKU [T]. |
| **Name** | **Description** | [T]. Variation rows have their own name, e.g. *V-Neck T-Shirt - Red* [T]. |
| *(no field)* | **UoM** | Unit of measure: the unit you count and sell stock in. `EA` means "each", one single item. Type `EA` (or leave blank – Practical Stock Planner fills `EA`). |
| **Categories** | **Group** | Sub-categories are shown with `>`, e.g. `Clothing > Tshirts` [T] [V]; several categories are comma-separated [V]. ⚠ **Variation rows have a blank Categories cell** [T] – look up the parent's category using the **Parent** column (= the parent product's SKU [T] [V]). Blank → "Group TBD". |
| **Low stock amount** | **Safety Stock Weeks** *(optional)* | Only a low-stock alert level, in units [T column]. Convert: Low stock amount ÷ average weekly sales. Or leave blank to use the default Safety Stock Weeks you set in the app. |
| **Cost of goods** | **Cost Price** | Only if COGS is switched on [T]. ⚠ On **variation** rows it's **blank when the variation uses the parent's default cost** [T] (e.g. parent `woo-vneck-tee` 12, variation blank) – copy the parent's value down via **Parent**. Use the cost excluding sales tax (e.g. GST or VAT). |
| *(your currency)* | **Cost Price Currency** | Type your store currency, e.g. `USD`, on every row. Only one currency is allowed. ⚠ Blank → Practical Stock Planner assumes **USD**. |
| *(your decision)* | **Status** *(optional column)* | Type `Obsolete` for any product you won't buy again. Practical Stock Planner still shows its stock and demand, but creates no planned supply for it. Leave blank (or type `Active`) for everything else. |
| **Regular price** | – | Selling price – not a cost. Don't use it as Cost Price. |

**No COGS feature (older WooCommerce, or you use a plugin)?** The paid **Cost of Goods** extension by SkyVerge (US$79/year on the WooCommerce Marketplace [V], [Cost of Goods](https://woocommerce.com/products/woocommerce-cost-of-goods/)) stores cost as product meta:
**`Meta: _wc_cog_cost`** for simple products and variations (and `_wc_cog_cost_variable` for variable parents) [V] ([Cost of Goods docs](https://woocommerce.com/document/cost-of-goods-sold/)).
Tick **Yes, export all custom meta** in step 4 to get these columns – custom meta columns are exported with a `meta:` prefix [V] ([Product CSV Importer & Exporter](https://woocommerce.com/document/product-csv-importer-exporter/)); exact header [U].
Other cost plugins use their own meta names [U]. If you run both, WooCommerce warns "you will see two cost totals" [V] – pick one.

## Excel clean-up

1. Open via *Data › From Text/CSV* (the file is UTF-8 with a byte-order mark [T], which Excel reads correctly) and set the **SKU** column to *Text* to keep leading zeros.
2. Filter **Type** to `simple` and `variation`. Delete virtual/downloadable products you don't stock.
3. For variation rows, fill **Categories** and **Cost of goods** from the parent (`=XLOOKUP(Parent, SKU, Categories)`).
4. Check for blank or duplicate SKUs (*Conditional Formatting › Duplicate Values*).
5. Copy the finished columns into the **SKU_Details** template (paste as values).

> **Keep leading zeros in SKUs.** Format the SKU column as *Text* before you type or paste SKUs, then save with *File › Save As › CSV UTF-8 (Comma delimited)*. If you open a CSV directly in Excel (e.g. by double-clicking it), Excel can strip leading zeros (`00123` becomes `123`) – import it via *Data › From Text/CSV* instead and set the SKU column to *Text*. In Google Sheets: select the SKU column and choose *Format › Number › Plain text* before you type or paste, then save with *File › Download › Comma-separated values (.csv)*.

## Checklist

- [ ] Template header row unchanged, saved as a CSV file (*File › Save As › CSV UTF-8 (Comma delimited)*).
- [ ] Only `simple` and `variation` rows. Variable parents, grouped and external products removed.
- [ ] Every row has a SKU, and no SKU appears twice (WooCommerce SKUs keep their case – watch `Woo-…` vs `woo-…`).
- [ ] Variation categories and costs copied from the parent where blank.
- [ ] One currency in *Cost Price Currency* (e.g. `USD` on every row).
- [ ] Products you won't buy again marked `Obsolete`.

**If an upload fails:** the message *"Please upload a CSV file... Save As CSV UTF-8"* means you uploaded an Excel workbook (`.xlsx`). Open it in Excel, choose *File › Save As › CSV UTF-8 (Comma delimited)*, and upload the `.csv` file instead.

**Using Google Sheets instead of Excel?** Save each file with *File › Download › Comma-separated values (.csv)*. To keep leading zeros, select the SKU column and choose *Format › Number › Plain text* before you type or paste SKUs.

Questions? Contact support@practicalsupplychainplanning.com.
