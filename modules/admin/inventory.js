// Owner inventory screen: stock at a glance (out / low), quick +/- and exact stock edits.
// Reads the same `products` collection as the Products tab; only `stock` is written (firestore.rules validProduct re-checks).
import { db } from "../../shared/config/firebase.js";
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { thumb } from "../../shared/components/thumb.js";
import { fetchCategories } from "./categories.js";
import { filterInventory, inventorySummary, stockState, parseStock, adjustStock, LOW_STOCK } from "./inventory-core.js";

const mk = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null && text !== "") e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const FILTERS = [["all", "Sab"], ["out", "Khatam"], ["low", "Kam (≤" + LOW_STOCK + ")"], ["ok", "Theek"], ["inactive", "Inactive"]];
const BADGE = { out: ["Khatam", "inv-out"], low: ["Kam stock", "inv-low"], ok: ["", ""] };

let root = null, products = [], cats = [], state = "all", q = "", categoryId = "", loaded = false, loading = false;

export function initInventory(el) { root = el; paint(); load(); }
export function reloadInventory() { if (root) load(); }
window.addEventListener("categories-changed", () => { if (root) load(); });

async function load() {
  if (loading) return;
  loading = true;
  try {
    const [snap, c] = await Promise.all([getDocs(collection(db, "products")), fetchCategories().catch(() => [])]);
    products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cats = c;
    loaded = true;
    paint();
  } catch (e) {
    root.textContent = "";
    root.appendChild(mk("p", "Inventory load nahi hui: " + (e.message || e.code), "cv-bad"));
    const b = mk("button", "Dobara try karein", "category"); b.type = "button"; b.onclick = () => { loading = false; load(); };
    root.appendChild(b);
  }
  loading = false;
}

function paint() {
  const keepFocus = document.activeElement && document.activeElement.id === "inv-q";
  root.textContent = "";
  root.appendChild(mk("h2", "Inventory"));
  root.appendChild(mk("p", "Kaunsa saaman khatam ya kam hai, yahan ek nazar me. Stock yahin se badal sakte hain.", "muted"));
  if (!loaded) { root.appendChild(mk("p", "Loading...", "muted")); return; }

  const s = inventorySummary(products);
  const tiles = mk("div", "", "kpis");
  [["Active products", s.active], ["Khatam", s.out, s.out ? "bad" : ""], ["Kam stock", s.low, s.low ? "warn" : ""], ["Stock ki keemat", "Rs " + s.stockValue.toLocaleString("en-IN")]]
    .forEach(([l, v, tone]) => {
      const t = mk("div", "", "kpi" + (tone ? " " + tone : ""));
      t.append(mk("b", String(v)), mk("span", l));
      tiles.appendChild(t);
    });
  root.appendChild(tiles);

  const seg = mk("div", "", "seg");
  FILTERS.forEach(([id, label]) => {
    const b = mk("button", label); b.type = "button";
    if (state === id) b.classList.add("on");
    b.onclick = () => { state = id; paint(); };
    seg.appendChild(b);
  });
  root.appendChild(seg);

  const bar = mk("div", "", "inv-bar");
  const search = mk("input"); search.id = "inv-q"; search.type = "search"; search.placeholder = "Product dhoondhein"; search.value = q; search.maxLength = 40;
  search.setAttribute("aria-label", "Product dhoondhein");
  search.oninput = () => { q = search.value; paintList(); };
  const sel = mk("select"); sel.setAttribute("aria-label", "Department");
  sel.add(new Option("Saare departments", ""));
  cats.forEach((c) => sel.add(new Option(c.name, c.id)));
  sel.value = categoryId;
  sel.onchange = () => { categoryId = sel.value; paintList(); };
  bar.append(search, sel);
  root.appendChild(bar);

  const list = mk("div"); list.id = "inv-list";
  root.appendChild(list);
  paintList();
  if (keepFocus) { search.focus(); search.setSelectionRange(q.length, q.length); }
}

function paintList() {
  const list = root.querySelector("#inv-list");
  if (!list) return;
  list.textContent = "";
  const rows = filterInventory(products, { q, state, categoryId });
  if (!rows.length) { list.appendChild(mk("div", products.length ? "Is filter me koi product nahi." : "Abhi koi product nahi.", "empty")); return; }
  rows.forEach((p) => list.appendChild(row(p)));
}

function row(p) {
  const box = mk("div", "", "shop-card inv-row");
  const top = mk("div", "", "prow");
  top.appendChild(thumb(p));
  const info = mk("div", "", "pr-txt");
  info.appendChild(mk("p", p.name, "inv-name"));
  const st = stockState(p);
  const meta = mk("p", "Rs " + p.price + "/" + p.unit + (p.active ? "" : " | Inactive"), "muted");
  info.appendChild(meta);
  if (BADGE[st][0] && p.active) info.appendChild(mk("span", BADGE[st][0], "inv-badge " + BADGE[st][1]));
  top.appendChild(info);
  box.appendChild(top);

  const stp = mk("div", "", "stp");
  const minus = mk("button", "−"); minus.type = "button"; minus.setAttribute("aria-label", p.name + " stock ghatao");
  const n = mk("span", String(p.stock), "stp-n");
  const plus = mk("button", "+"); plus.type = "button"; plus.setAttribute("aria-label", p.name + " stock badhao");
  minus.disabled = p.stock <= 0;
  minus.onclick = () => save(p, adjustStock(p.stock, -1), box);
  plus.onclick = () => save(p, adjustStock(p.stock, 1), box);
  stp.append(minus, n, plus);
  box.appendChild(stp);
  const exact = mk("button", "Stock likhein", "category"); exact.type = "button";
  exact.onclick = () => {
    const v = prompt("Naya stock (poora number):", p.stock);
    if (v === null) return;
    const r = parseStock(v);
    if (!r.ok) return alert(r.message);
    save(p, r.value, box);
  };
  box.appendChild(exact);
  return box;
}

async function save(p, value, box) {
  if (value === p.stock) return;
  box.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  try {
    await updateDoc(doc(db, "products", p.id), { stock: value });
    p.stock = value;
    paint();
  } catch (e) {
    alert("Stock update nahi hua: " + (e.message || e.code));
    paint();
  }
}
