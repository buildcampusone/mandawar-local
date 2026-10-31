// Owner analytics: pure functions over order documents (no DOM, no Firebase), unit-tested.
// An order's `createdAt` may be a Date, a Firestore Timestamp ({ toDate() } / { seconds }) or a number (ms).
// Revenue = DELIVERED orders only. Rejected / cancelled orders are never money.

export const RANGES = { today: 1, "7d": 7, "30d": 30 };
const CLOSED_BAD = new Set(["rejected", "cancelled"]);
const ACTIVE = new Set(["placed", "accepted", "out_for_delivery"]);

export function toDate(v) {
  if (v instanceof Date) return v;
  if (v && typeof v.toDate === "function") return v.toDate();
  if (v && typeof v.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  return null;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

/** -> { start, end, days }: "today" = since midnight, "7d" / "30d" = that many calendar days including today. */
export function rangeFor(key, now = new Date()) {
  const days = RANGES[key] || RANGES["7d"];
  const today = startOfDay(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  return { start, end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), days };
}

function inRange(o, range) {
  const d = toDate(o && o.createdAt);
  return d && d >= range.start && d < range.end ? d : null;
}

const money = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

/** Headline numbers for the period. */
export function summarize(orders, range) {
  const s = { orders: 0, delivered: 0, active: 0, lost: 0, revenue: 0, avgOrder: 0, cancelRate: 0, itemsSold: 0 };
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o || !inRange(o, range)) continue;
    s.orders++;
    if (o.status === "delivered") {
      s.delivered++;
      s.revenue += money(o.total);
      for (const it of Array.isArray(o.items) ? o.items : []) s.itemsSold += Math.max(0, Number(it && it.qty) || 0);
    } else if (ACTIVE.has(o.status)) s.active++;
    else if (CLOSED_BAD.has(o.status)) s.lost++;
  }
  s.revenue = Math.round(s.revenue * 100) / 100;
  s.avgOrder = s.delivered ? Math.round(s.revenue / s.delivered) : 0;
  s.cancelRate = s.orders ? Math.round((s.lost / s.orders) * 100) : 0;
  return s;
}

/** One row per calendar day in the range (zeros included, oldest first): { day, label, orders, revenue }. */
export function dailySeries(orders, range) {
  const rows = [];
  const byKey = new Map();
  for (let i = 0; i < range.days; i++) {
    const d = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + i);
    const row = { day: dayKey(d), label: d.getDate() + "/" + (d.getMonth() + 1), orders: 0, revenue: 0 };
    rows.push(row); byKey.set(row.day, row);
  }
  for (const o of Array.isArray(orders) ? orders : []) {
    const d = o && inRange(o, range);
    if (!d || o.status !== "delivered") continue;
    const row = byKey.get(dayKey(d));
    if (!row) continue;
    row.orders++; row.revenue += money(o.total);
  }
  rows.forEach((r) => { r.revenue = Math.round(r.revenue * 100) / 100; });
  return rows;
}

/** Best sellers by units, from delivered orders: [{ productId, name, qty, revenue }], top `n`. */
export function topProducts(orders, range, n = 5) {
  const m = new Map();
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o || o.status !== "delivered" || !inRange(o, range)) continue;
    for (const it of Array.isArray(o.items) ? o.items : []) {
      if (!it || typeof it.productId !== "string") continue;
      const qty = Math.max(0, Number(it.qty) || 0);
      const row = m.get(it.productId) || { productId: it.productId, name: String(it.name || it.productId), qty: 0, revenue: 0 };
      row.qty += qty;
      row.revenue += qty * money(it.price);
      m.set(it.productId, row);
    }
  }
  return [...m.values()]
    .map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** Orders per status inside the range, in a fixed display order, zero rows dropped. */
export function statusCounts(orders, range) {
  const order = ["placed", "accepted", "out_for_delivery", "delivered", "rejected", "cancelled"];
  const c = Object.fromEntries(order.map((k) => [k, 0]));
  for (const o of Array.isArray(orders) ? orders : []) if (o && inRange(o, range) && o.status in c) c[o.status]++;
  return order.filter((k) => c[k] > 0).map((k) => ({ status: k, count: c[k] }));
}

/** Indian digit grouping: 123456 -> "1,23,456". */
export function rupees(n) {
  return "Rs " + Math.round(money(n)).toLocaleString("en-IN");
}
