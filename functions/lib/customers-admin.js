// Admin "Customers" list. users/{uid} is not readable by other users (firestore.rules), so the owner screen calls this
// through a Cloud Function. Pure of firebase imports: index.js injects the Admin SDK Firestore handle (`db`).
// Only name / phone / status / joined / order stats leave the server. Never e-mail, address or tokens.
const MAX_CUSTOMERS = 200;     // customers returned
const MAX_ORDERS = 2000;       // newest orders used for the stats
const BAD = new Set(["rejected", "cancelled"]);

const str = (v) => (typeof v === "string" ? v : "");
function ms(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (v && typeof v._seconds === "number") return v._seconds * 1000;
  if (v && typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}

/** orders[] -> Map(customerUid -> { orders, delivered, spent, lastOrderAt }). Rejected / cancelled are not counted as orders. */
function aggregateOrders(orders) {
  const m = new Map();
  for (const o of orders) {
    if (!o || typeof o.customerUid !== "string" || BAD.has(o.status)) continue;
    const r = m.get(o.customerUid) || { orders: 0, delivered: 0, spent: 0, lastOrderAt: 0 };
    r.orders++;
    if (o.status === "delivered") { r.delivered++; r.spent += Number(o.total) || 0; }
    r.lastOrderAt = Math.max(r.lastOrderAt, ms(o.createdAt));
    m.set(o.customerUid, r);
  }
  return m;
}

/** Newest customers first. `truncated` = more customers / orders exist than were read, so the owner is told the numbers may be partial. */
async function listCustomers({ db }) {
  const [uSnap, oSnap] = await Promise.all([
    db.collection("users").where("role", "==", "customer").limit(MAX_CUSTOMERS).get(),
    db.collection("orders").orderBy("createdAt", "desc").limit(MAX_ORDERS).get()
  ]);
  const stats = aggregateOrders(oSnap.docs.map((d) => d.data()));
  const customers = uSnap.docs.map((d) => {
    const u = d.data(), s = stats.get(d.id) || { orders: 0, delivered: 0, spent: 0, lastOrderAt: 0 };
    return {
      uid: d.id, name: str(u.name), phone: str(u.phone), status: u.status === "blocked" ? "blocked" : "active",
      joinedAt: ms(u.createdAt), orders: s.orders, delivered: s.delivered, spent: Math.round(s.spent), lastOrderAt: s.lastOrderAt
    };
  }).sort((a, b) => b.joinedAt - a.joinedAt || a.name.localeCompare(b.name));
  return { customers, truncated: uSnap.size >= MAX_CUSTOMERS || oSnap.size >= MAX_ORDERS };
}

module.exports = { MAX_CUSTOMERS, MAX_ORDERS, aggregateOrders, listCustomers };
