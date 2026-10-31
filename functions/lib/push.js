// Which push notifications an order change should produce (pure). index.js sends them with FCM.
// target: "customer" | "shop" | "riders"
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const short = (id) => "#" + String(id || "").slice(0, 6).toUpperCase();

function pushForCreate(order, orderId) {
  if (!order || order.status !== "placed" || typeof order.shopId !== "string") return [];
  const n = Array.isArray(order.items) ? order.items.length : 0;
  return [{ target: "shop", uid: order.shopId, title: "Naya order aaya!", body: money(order.total) + " • " + n + " item" + (n === 1 ? "" : "s"), tag: orderId }];
}

function pushForUpdate(before, after, orderId) {
  if (!before || !after || before.status === after.status) return [];
  const shop = after.shopName || "Dukaan", tag = orderId, out = [];
  const toCustomer = (title) => out.push({ target: "customer", uid: after.customerUid, title, body: shop + " • " + short(orderId), tag });
  if (after.status === "accepted") {
    toCustomer("Order accept ho gaya");
    out.push({ target: "riders", title: "Naya delivery order!", body: shop + " • " + money(after.total), tag });
  } else if (after.status === "rejected") toCustomer("Dukaan ne order reject kiya");
  else if (after.status === "out_for_delivery") toCustomer("Order delivery par nikal gaya");
  else if (after.status === "delivered") toCustomer("Order deliver ho gaya");
  else if (after.status === "cancelled") {
    const byCustomer = !after.cancelReason;
    if (byCustomer) out.push({ target: "shop", uid: after.shopId, title: "Customer ne order cancel kiya", body: short(orderId), tag });
    else toCustomer("Order cancel ho gaya (" + (String(after.cancelReason).startsWith("expired") ? "dukaan/rider nahi mila" : "admin") + ")");
  }
  // a rider handed the order back to the pool
  if (before.status === "out_for_delivery" && after.status === "accepted")
    return [{ target: "riders", title: "Order wapas pool mein", body: shop + " • " + money(after.total), tag }];
  return out.filter((x) => x.target === "riders" || typeof x.uid === "string");
}

module.exports = { pushForCreate, pushForUpdate };
