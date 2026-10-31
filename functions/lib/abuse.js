// Order-flood guard (pure). firestore.rules cannot count a customer's recent orders, so a Cloud Function does it
// right after an order is created and cancels the new order if the customer is flooding. Cancelling goes through the
// normal status change, so restoreStockOnClose puts the stock back.
const LIMITS = {
  windowMs: 10 * 60 * 1000,   // look-back window
  maxRecent: 5,               // OTHER orders by the same customer in the window
  maxOpen: 3                  // OTHER orders by the same customer still waiting for the shop (`placed`)
};

// recentOthers / openOthers are counts that EXCLUDE the order being checked.
function decide({ recentOthers, openOthers }, limits = LIMITS) {
  if (!Number.isInteger(recentOthers) || !Number.isInteger(openOthers) || recentOthers < 0 || openOthers < 0)
    return { block: false, reason: "bad-input" };            // never cancel on bad data
  if (openOthers >= limits.maxOpen) return { block: true, reason: "too-many-open" };
  if (recentOthers >= limits.maxRecent) return { block: true, reason: "too-many-recent" };
  return { block: false, reason: "" };
}

// db = Admin SDK Firestore. Counting uses aggregation queries, so no documents are downloaded.
async function enforceOrderLimits({ db, orderId, order, now = Date.now, limits = LIMITS }) {
  if (!order || order.status !== "placed" || typeof order.customerUid !== "string" || !order.customerUid)
    return { checked: false, block: false, reason: "skip" };
  const since = new Date(now() - limits.windowMs);
  const orders = db.collection("orders").where("customerUid", "==", order.customerUid);
  const [recent, open] = await Promise.all([
    orders.where("createdAt", ">=", since).count().get(),
    orders.where("status", "==", "placed").count().get()
  ]);
  // both counts include the new order itself
  const verdict = decide({ recentOthers: recent.data().count - 1, openOthers: open.data().count - 1 }, limits);
  if (verdict.block) {
    await db.collection("orders").doc(orderId).update({ status: "cancelled", cancelReason: "abuse-limit:" + verdict.reason });
  }
  return { checked: true, ...verdict };
}

module.exports = { LIMITS, decide, enforceOrderLimits };
