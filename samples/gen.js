// Regenerates samples/difot_sample_po_lines.csv and samples/difot_sample_suppliers.csv.
// The random sequence matches the original sample, so the same suppliers, POs,
// and DIFOT outcomes are kept. On time still uses the old receipt date:
// Arrived at Your Site Date when the supplier delivers, Handed to Freight Date
// when you arrange the freight. The old arrived date becomes Arrived at Your Site Date
// for freight you arrange.
let s = 42;
const r = () => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return s / 2147483648;
};
const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
const iso = (d) => d.toISOString().slice(0, 10);
const add = (d, n) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const sup = [
  ["Brisbane Packaging Co", "Supplier delivers", "", {}],
  ["Coastal Fasteners", "Supplier delivers", "", { late: 1, early: 1 }],
  ["Southern Cross Hardware", "I arrange freight", "21", { late: 6, early: 3, short: 4, unrec: 2, damaged: 1 }],
  ["Harbour Electrical Supplies", "Supplier delivers", "", { late: 7, early: 2, short: 5, unrec: 2, damaged: 2 }],
  ["Outback Tools & Parts", "I arrange freight", "28", { late: 16, early: 6, short: 12, unrec: 5, damaged: 3 }],
];
const head =
  "PO Number,Supplier,SKU,Ordered Qty,Required Date,Arrived at Your Site Date,Received Qty,Damaged Qty,Damaged Reason,Handed to Freight Date";
const rows = [head];
let po = 4500;
sup.forEach(([name, fr, tr, fails], si) => {
  const plan = [];
  Object.entries(fails).forEach(([k, n]) => {
    for (let i = 0; i < n; i++) plan.push(k);
  });
  const slots = Array.from({ length: 80 }, (_, i) => i);
  for (let i = 79; i > 0; i--) {
    const j = ri(0, i);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const kind = {};
  plan.forEach((k, i) => (kind[slots[i]] = k));
  const clean = slots.slice(plan.length);
  kind[clean[0]] = "edge2early";
  kind[clean[1]] = "edge1early";
  if (si === 3) kind[clean[2]] = "split";
  // Outback has 9 purchase orders so the pooled DIFOT is not the average of the supplier figures.
  const poCount = si === 4 ? 9 : 10;
  for (let p = 0; p < poCount; p++) {
    po++;
    // This draw is unused. It stays so the random sequence matches the original sample.
    add(new Date(Date.UTC(2026, 5, 1)), ri(0, 110) + p * 0);
    const reqD = add(new Date(Date.UTC(2026, 5, 1)), Math.floor(p * 11 + ri(0, 5)));
    for (let l = 0; l < 8; l++) {
      const idx = p * 8 + l;
      const k = kind[idx] || "ok";
      const sku = "SKU-" + (si + 1) + String(100 + l * 37 + ri(0, 30));
      const q = [12, 24, 48, 50, 100, 120, 200, 250][ri(0, 7)];
      let rec = iso(add(reqD, -ri(0, 1)));
      let rq = q;
      let dq = "";
      let dr = "";
      let split = null;
      if (k === "late") rec = iso(add(reqD, ri(1, 12)));
      if (k === "early") rec = iso(add(reqD, -ri(3, 9)));
      if (k === "edge2early") rec = iso(add(reqD, -2));
      if (k === "edge1early") rec = iso(add(reqD, -1));
      if (k === "short") rq = Math.floor(q * (0.5 + r() * 0.4));
      if (k === "damaged") {
        dq = Math.max(1, Math.round(q * 0.05));
        dr = "Crushed carton";
      }
      if (k === "unrec") {
        rec = "";
        rq = "";
      }
      if (k === "split") {
        const a = Math.round(q * 0.6);
        split = [a, q - a];
      }
      const freightDays = fr.startsWith("I") && rec ? ri(+tr - 4, +tr + 5) : null;
      const id = "PO-" + po;
      if (split) {
        rows.push([id, name, sku, q, iso(reqD), iso(add(reqD, -1)), split[0], "", "", ""].join(","));
        rows.push([id, name, sku, q, iso(reqD), iso(reqD), split[1], "", "", ""].join(","));
      } else if (fr.startsWith("I")) {
        const handed = rec;
        const arrived = freightDays == null ? "" : iso(add(new Date(rec + "T00:00:00Z"), freightDays));
        rows.push([id, name, sku, q, iso(reqD), arrived, rq, dq, dr, handed].join(","));
      } else {
        rows.push([id, name, sku, q, iso(reqD), rec, rq, dq, dr, ""].join(","));
      }
    }
  }
});
const fs = require("fs");
const path = require("path");
const dir = __dirname;
fs.writeFileSync(path.join(dir, "difot_sample_po_lines.csv"), rows.join("\r\n") + "\r\n");
fs.writeFileSync(
  path.join(dir, "difot_sample_suppliers.csv"),
  ["Supplier,Freight arranged by,Expected transit days", ...sup.map((x) => [x[0], x[1], x[2]].join(","))].join("\r\n") +
    "\r\n"
);
