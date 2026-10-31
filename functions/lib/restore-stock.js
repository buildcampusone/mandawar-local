// Pure order/stock logic, kept free of firebase imports so it can be unit-tested without the SDK.
// index.js injects the real Firestore handle and FieldValue.serverTimestamp.

const RESTORE_STATUSES = new Set(["rejected", "cancelled"]);
const MAX_STOCK = 100000; // same cap as validProduct() in firestore.rules

// True only on the transition INTO rejected/cancelled (not on later edits of an already-closed order).
function shouldRestore(before, after) {
  if (!before || !after) return false;
  return !RESTORE_STATUSES.has(before.status) && RESTORE_STATUSES.has(after.status);
}

// Sum qty per productId so a malformed order with a repeated product can't double-write one doc.
function qtyByProduct(items) {
  const m = new Map();
  if (!Array.isArray(items)) return m;
  for (const it of items) {
    if (!it || typeof it.productId !== "string" || !it.productId) continue;
    if (!Number.isInteger(it.qty) || it.qty < 1) continue;
    m.set(it.productId, (m.get(it.productId) || 0) + it.qty);
  }
  return m;
}

// Gives the ordered quantities back to stock, exactly once per order.
// Idempotent: Cloud Functions delivers events at-least-once, so the order doc itself carries a
// `stockRestoredAt` marker that is checked and set inside the same transaction as the stock writes.
async function restoreStockForOrder({ db, orderId, now }) {
  const orderRef = db.collection("orders").doc(orderId);
  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return { restored: false, reason: "order-missing" };
    const order = orderSnap.data();
    // Re-check live state, not the event payload: a stale/retried event must not act on old data.
    if (!RESTORE_STATUSES.has(order.status)) return { restored: false, reason: "not-closed" };
    if (order.stockRestoredAt) return { restored: false, reason: "already-restored" };

    const qty = qtyByProduct(order.items);
    const entries = [...qty.entries()].map(([productId, n]) => ({
      productId, n,
      ref: db.collection("products").doc(productId)   // top-level products (single store, Phase 4)
    }));
    // All reads first (Firestore transactions require reads before writes).
    const snaps = await Promise.all(entries.map((e) => tx.get(e.ref)));

    const restored = [];
    entries.forEach((e, k) => {
      if (!snaps[k].exists) return; // product removed since the order; nothing to give back to
      const cur = Number.isInteger(snaps[k].data().stock) ? snaps[k].data().stock : 0;
      tx.update(e.ref, { stock: Math.min(cur + e.n, MAX_STOCK) });
      restored.push(e.productId);
    });
    tx.update(orderRef, { stockRestoredAt: now() });
    return { restored: true, products: restored };
  });
}

module.exports = { shouldRestore, restoreStockForOrder, qtyByProduct, RESTORE_STATUSES, MAX_STOCK };
