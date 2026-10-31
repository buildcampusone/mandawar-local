// Pure logic: turns a stream of order snapshots into "something happened" events (no DOM, no Firebase).
// Used by the owner orders screen (new order / customer cancelled) and the customer order alerts.

const CUSTOMER_STATUSES = new Set(["accepted", "rejected", "out_for_delivery", "delivered"]);

// role: "owner" | "customer" | "rider".
// feed(orders, { fromCache }) -> events[]. Nothing is announced until the first snapshot that really came from the
// server has been seen (that one is the baseline), so opening the app never replays old orders as alerts.
export function createWatcher(role) {
  let ready = false;
  let known = new Map();
  return {
    isReady: () => ready,
    feed(orders, { fromCache = false } = {}) {
      const list = Array.isArray(orders) ? orders : [];
      if (!ready) {
        known = new Map(list.map((o) => [o.id, o.status]));
        if (!fromCache) ready = true;
        return [];
      }
      const events = [];
      for (const o of list) {
        const prev = known.get(o.id);
        if (prev === undefined) {
          if (role === "owner" && o.status === "placed") events.push({ type: "new-order", order: o });
          if (role === "rider" && o.status === "accepted") events.push({ type: "new-delivery", order: o });
        } else if (prev !== o.status) {
          if (role === "rider" && o.status === "accepted") events.push({ type: "new-delivery", order: o });
          if (role === "owner" && o.status === "cancelled") events.push({ type: "cancelled", order: o, from: prev });
          if (role === "customer" && CUSTOMER_STATUSES.has(o.status)) events.push({ type: "status", order: o, from: prev, to: o.status });
        }
        known.set(o.id, o.status);
      }
      return events;
    }
  };
}

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const short = (o) => "#" + String(o.id || "").slice(0, 6).toUpperCase();

// event -> { title, body, tone, tag } (Hinglish, like the rest of the order screens)
export function messageFor(ev) {
  const o = ev.order || {};
  const n = Array.isArray(o.items) ? o.items.length : 0;
  const tag = String(o.id || "order");
  if (ev.type === "new-order") return { title: "Naya order aaya!", body: money(o.total) + " • " + n + " item" + (n === 1 ? "" : "s"), tone: "good", tag };
  if (ev.type === "new-delivery") return { title: "Naya delivery order!", body: (o.shopName || "Dukaan") + " • " + money(o.total), tone: "good", tag };
  if (ev.type === "cancelled") return { title: "Customer ne order cancel kiya", body: short(o), tone: "bad", tag };
  const shop = o.shopName || "Dukaan";
  const by = {
    accepted: ["Order accept ho gaya", "good"],
    rejected: ["Dukaan ne order reject kiya", "bad"],
    out_for_delivery: ["Order delivery par nikal gaya", "good"],
    delivered: ["Order deliver ho gaya", "good"]
  }[ev.to] || ["Order update hua", ""];
  return { title: by[0], body: shop + " • " + short(o), tone: by[1], tag };
}

export const pendingCount = (orders) => (orders || []).filter((o) => o.status === "placed").length;
