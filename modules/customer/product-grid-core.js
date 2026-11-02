// Pure logic for the product grid (no DOM, no Firebase) so it can be unit-tested like cart-core.js.
// Product docs come from the top-level `products` collection. Optional fields feed the grid:
//   mrp        - the "original" price; when it is higher than price the card shows a Discount / You Save badge
//   categoryId - the grocery department (document id in `categories`); products with the same department sit in one row block

export const DEFAULT_GROUP = "Saaman";

const money2 = (n) => Math.round(n * 100) / 100;
export const fmt = (n) => String(money2(Number(n)));

// In-stock first, then by name (the caller usually sorts by name already; this keeps sold-out items at the end).
export function sortProducts(list) {
  return (list || []).slice().sort((a, b) => {
    const sa = a.stock > 0 ? 0 : 1, sb = b.stock > 0 ? 0 : 1;
    return sa - sb || String(a.name).localeCompare(String(b.name));
  });
}

// -> [{ id, title, items }] in department shelf order (`depts` = ACTIVE departments, already sorted).
// Products with no department, or one that is inactive / unknown, go last under DEFAULT_GROUP. Empty departments are skipped.
export function groupProducts(list, depts = []) {
  const byDept = new Map(depts.map((d) => [d.id, []]));
  const rest = [];
  for (const p of list || []) {
    if (p && typeof p.categoryId === "string" && byDept.has(p.categoryId)) byDept.get(p.categoryId).push(p);
    else rest.push(p);
  }
  const out = depts.filter((d) => byDept.get(d.id).length).map((d) => ({ id: d.id, title: d.name, items: byDept.get(d.id) }));
  if (rest.length) out.push({ id: "", title: DEFAULT_GROUP, items: rest });
  return out;
}

const deptName = (p, depts) => {
  const d = (depts || []).find((x) => x.id === p.categoryId);
  return d ? d.name.toLowerCase() : "";
};

// Search matches the product name or its department name.
export function filterProducts(list, q, depts = []) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return list || [];
  return (list || []).filter((p) =>
    String(p.name).toLowerCase().includes(s) || deptName(p, depts).includes(s));
}

// null when there is no real discount
export function discountInfo(p) {
  const price = Number(p && p.price), mrp = Number(p && p.mrp);
  if (!(price > 0) || !(mrp > price)) return null;
  const off = Math.round((1 - price / mrp) * 100);
  if (off < 1) return null;
  return { off, save: money2(mrp - price) };
}

// "" when one more unit may be added, otherwise a short Hinglish reason
export function addCheck(p, inCart, maxQty) {
  if (!(p && p.stock > 0)) return "Stock khatam ho gaya.";
  if (inCart >= p.stock) return "Stock sirf " + p.stock + " bacha hai.";
  if (inCart >= maxQty) return "Ek item ki quantity " + maxQty + " se zyada nahi ho sakti.";
  return "";
}

// Floating cart bar numbers: only for the store that is currently open (cartShopId is "main" for the one store).
// cartItems: [{productId, qty}], products: Map(productId -> product doc)
export function cartSummary(cartItems, cartShopId, shopId, products) {
  if (!shopId || cartShopId !== shopId) return { count: 0, total: 0 };
  let total = 0;
  for (const it of cartItems || []) {
    const p = products.get(it.productId);
    if (p && p.active !== false && p.stock > 0) total += p.price * it.qty;
  }
  return { count: (cartItems || []).length, total: money2(total) };
}
