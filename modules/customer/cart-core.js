// Pure cart maths (no DOM, no Firebase). The server rules still re-check price/stock/total at order time.

// items: [{productId, qty}] from the cart; products: Map(productId -> product doc data, or null when missing/unreadable)
export function summarizeCart(items, products) {
  const lines = (items || []).map((it) => {
    const p = products.get(it.productId) || null;
    if (!p || p.active !== true) return { productId: it.productId, qty: it.qty, status: "unavailable", subtotal: 0 };
    const stock = Number.isFinite(p.stock) ? p.stock : 0;
    const base = { productId: it.productId, qty: it.qty, name: p.name, price: p.price, unit: p.unit, stock, image: p.image };
    if (stock < 1) return { ...base, status: "soldout", subtotal: 0 };
    if (it.qty > stock) return { ...base, status: "low-stock", subtotal: 0 };
    return { ...base, status: "ok", subtotal: Math.round(p.price * it.qty * 100) / 100 };
  });
  const total = Math.round(lines.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
  const problems = lines.filter((l) => l.status !== "ok").length;
  return { lines, total, problems, canOrder: lines.length > 0 && problems === 0 };
}

// Delivery charge + minimum order come from the SHOP (shops/{id}.delivery). Same defaults as firestore.rules:
// a missing or invalid setting means 0. `itemsTotal` is the items-only sum; the order total is itemsTotal + fee.
export function deliveryQuote(shop, itemsTotal) {
  const d = shop && typeof shop.delivery === "object" && shop.delivery ? shop.delivery : {};
  const ok = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const fee = ok(d.deliveryFee) ? d.deliveryFee : 0;
  const min = ok(d.minimumOrderAmount) ? d.minimumOrderAmount : 0;
  const items = Number.isFinite(itemsTotal) ? itemsTotal : 0;
  const shortBy = items < min ? Math.round((min - items) * 100) / 100 : 0;
  return { fee, min, items, total: items + fee, belowMin: shortBy > 0, shortBy };
}

// Why the Order button is disabled -> one short Hinglish line (empty string when it is fine).
export function blockReason({ summary, online, quote }) {
  if (!summary.lines.length) return "Cart khali hai.";
  if (online === false) return "Internet nahi hai. Order karne ke liye internet chalu karein.";
  if (summary.problems) return "Lal nishan wale items hatayein ya quantity kam karein, tab order ho paayega.";
  if (quote && quote.belowMin) return "Is dukaan ka minimum order ₹" + quote.min + " hai. Abhi ₹" + quote.shortBy + " ka aur saaman jodein.";
  return "";
}
