// Pure logic for the customer home (no DOM, no Firebase), unit-tested in tests/home-core.test.mjs.
// Builds the list of sections the home screen shows, in this order:
//   Previously bought, Best Sellers, Deals, Featured, Daily Essentials, then one section per department.
import { discountInfo, groupProducts } from "./product-grid-core.js";

export const ESSENTIAL_DEPARTMENTS = ["atta-flour", "rice-grains", "dal-pulses", "oil-ghee", "sugar-salt"];
export const MAX_SPECIAL = 12;           // cap per special section (View All opens the sheet with all of them)
const DONE_BAD = new Set(["rejected", "cancelled"]);   // such orders never count as "bought"

const inStock = (p) => p && p.active !== false && p.stock > 0;

/** Discounted, in-stock products, biggest discount first. */
export function dealsOf(products) {
  return (products || [])
    .filter((p) => inStock(p) && discountInfo(p))
    .sort((a, b) => discountInfo(b).off - discountInfo(a).off || String(a.name).localeCompare(String(b.name)))
    .slice(0, MAX_SPECIAL);
}

/** Products the owner flagged `flag` ("bestSeller" | "featured"); in-stock only, keeps the incoming order. */
export function flagged(products, flag) {
  return (products || []).filter((p) => p && p[flag] === true && inStock(p)).slice(0, MAX_SPECIAL);
}

/** Essentials = products from the staple departments (atta, rice, dal, oil, sugar & salt). */
export function dailyEssentials(products, depts) {
  const ok = new Set(ESSENTIAL_DEPARTMENTS.filter((id) => (depts || []).some((d) => d.id === id)));
  return (products || []).filter((p) => inStock(p) && ok.has(p.categoryId)).slice(0, MAX_SPECIAL);
}

/**
 * "Previously bought": products from the customer's own earlier orders that are still on sale.
 * Most-ordered first, then most recent. orders: [{ status, items:[{productId, qty}] }] newest first.
 */
export function previouslyBought(orders, products, max = 9) {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const seen = new Map();   // productId -> { times, firstSeen }
  (orders || []).forEach((o, idx) => {
    if (!o || DONE_BAD.has(o.status) || !Array.isArray(o.items)) return;
    const once = new Set();
    for (const it of o.items) {
      if (!it || typeof it.productId !== "string" || once.has(it.productId)) continue;
      once.add(it.productId);
      const s = seen.get(it.productId) || { times: 0, firstSeen: idx };
      s.times += 1;
      seen.set(it.productId, s);
    }
  });
  return [...seen.entries()]
    .filter(([id]) => inStock(byId.get(id)))
    .sort((a, b) => b[1].times - a[1].times || a[1].firstSeen - b[1].firstSeen)
    .slice(0, max)
    .map(([id]) => byId.get(id));
}

/**
 * -> { sections, quick }
 *  sections: [{ key, title, items }]   key = "previous" | "best" | "deals" | "featured" | "essentials" | "d:<departmentId>" | "d:"
 *  quick:    [{ label, key }]          the header chips (Deals, Fresh, Categories, Rice, Kirana); only chips that lead somewhere.
 * `depts` = ACTIVE departments in shelf order, `orders` = the customer's earlier orders (may be empty).
 */
export function buildHome({ products = [], depts = [], orders = [] } = {}) {
  const special = [
    { key: "previous", title: "Previously bought", items: previouslyBought(orders, products) },
    { key: "best", title: "Best Sellers", items: flagged(products, "bestSeller") },
    { key: "deals", title: "Deals", items: dealsOf(products) },
    { key: "featured", title: "Featured", items: flagged(products, "featured") },
    { key: "essentials", title: "Daily Essentials", items: dailyEssentials(products, depts) }
  ].filter((s) => s.items.length);
  const groups = groupProducts(products, depts).map((g) => ({ key: "d:" + g.id, title: g.title, items: g.items }));
  const sections = [...special, ...groups];
  const has = (k) => sections.some((s) => s.key === k);
  const quick = [];
  if (has("deals")) quick.push({ label: "Deals", key: "deals" });
  if (has("d:fruits-vegetables")) quick.push({ label: "Fresh", key: "d:fruits-vegetables" });
  if (depts.length) quick.push({ label: "Categories", key: "tiles" });
  if (has("d:rice-grains")) quick.push({ label: "Rice", key: "d:rice-grains" });
  if (has("essentials")) quick.push({ label: "Kirana", key: "essentials" });
  return { sections, quick };
}

/** Banner docs -> active ones in order, with safe fields only. */
export function activeBanners(list) {
  return (list || [])
    .filter((b) => b && b.active === true && typeof b.title === "string" && b.title)
    .sort((a, b) => (Number.isFinite(a.order) ? a.order : 1e9) - (Number.isFinite(b.order) ? b.order : 1e9))
    .slice(0, 6);
}

/** Header line: where the order will go. Long addresses are cut at a word. */
export function locationLabel(address, max = 34) {
  const a = typeof address === "string" ? address.replace(/\s+/g, " ").trim() : "";
  if (!a) return "Delivery address jodein";
  if (a.length <= max) return a;
  const cut = a.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 12)).replace(/[,\s]+$/, "") + "…";
}
