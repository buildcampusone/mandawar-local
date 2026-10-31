// Owner inventory: pure helpers (no DOM, no Firebase) so they can be unit-tested.
export const LOW_STOCK = 5;          // stock 1..5 counts as "low"
export const MAX_STOCK = 100000;     // same ceiling as firestore.rules validProduct

/** "out" (0), "low" (1..LOW_STOCK) or "ok". */
export function stockState(p, low = LOW_STOCK) {
  const s = Number(p && p.stock);
  if (!Number.isFinite(s) || s <= 0) return "out";
  return s <= low ? "low" : "ok";
}

const ORDER = { out: 0, low: 1, ok: 2 };

/**
 * Inventory view: optional text search (name), state filter ("out" | "low" | "ok" | "inactive" | "all"),
 * department filter. Sorted: active products first (out of stock, then low, then the rest, A-Z); inactive products last.
 */
export function filterInventory(products, { q = "", state = "all", categoryId = "" } = {}) {
  const needle = String(q).trim().toLowerCase();
  return (Array.isArray(products) ? products : [])
    .filter((p) => p && typeof p.name === "string")
    .filter((p) => !needle || p.name.toLowerCase().includes(needle))
    .filter((p) => !categoryId || p.categoryId === categoryId)
    .filter((p) => {
      if (state === "all") return true;
      if (state === "inactive") return p.active !== true;
      return p.active === true && stockState(p) === state;
    })
    .sort((a, b) => (a.active === true ? 0 : 1) - (b.active === true ? 0 : 1)
      || ORDER[stockState(a)] - ORDER[stockState(b)] || a.name.localeCompare(b.name));
}

/** Numbers for the summary tiles. Only ACTIVE products count towards stock alerts and value. */
export function inventorySummary(products) {
  const list = Array.isArray(products) ? products : [];
  const active = list.filter((p) => p && p.active === true);
  return {
    total: list.length,
    active: active.length,
    out: active.filter((p) => stockState(p) === "out").length,
    low: active.filter((p) => stockState(p) === "low").length,
    stockValue: Math.round(active.reduce((s, p) => s + (Number(p.price) || 0) * Math.max(0, Number(p.stock) || 0), 0))
  };
}

/** Text typed by the owner -> { ok, value } or { ok:false, message }. Whole numbers 0..MAX_STOCK only. */
export function parseStock(text) {
  const s = String(text == null ? "" : text).trim();
  if (!/^\d{1,6}$/.test(s)) return { ok: false, message: "Poora number likhein (0 ya zyada)." };
  const n = Number(s);
  if (n > MAX_STOCK) return { ok: false, message: "Stock 1,00,000 se zyada nahi ho sakta." };
  return { ok: true, value: n };
}

/** +/- buttons: never below 0, never above MAX_STOCK. */
export function adjustStock(current, delta) {
  const c = Number.isFinite(Number(current)) ? Number(current) : 0;
  return Math.min(MAX_STOCK, Math.max(0, Math.trunc(c + delta)));
}
