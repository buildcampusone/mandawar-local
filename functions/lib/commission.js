// Commission ledger + shopkeeper wallet logic. Pure (no firebase imports) so it is unit-testable.
// Everything money-related is stored as integer PAISE to avoid floating point drift.
//
// Model (COD only, which is all the app supports today):
//   The shopkeeper collects the full cash from the customer, so the shopkeeper OWES the platform
//   its commission. wallets/{shopId}.commissionDuePaise is that running amount.
//   ledger/{orderId} is one immutable row per delivered order (doc id = orderId => at most one).

const MAX_RATE_PERCENT = 100;

function toPaise(rupees) {
  if (typeof rupees !== "number" || !Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

// Config doc `config/platform` { commissionPercent: number } is edited only from the Firebase
// console / Admin SDK (client rules deny it). Missing or invalid => 0%, never a guess.
function parseRatePercent(cfg) {
  const r = cfg && cfg.commissionPercent;
  if (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > MAX_RATE_PERCENT) return 0;
  return Math.round(r * 100) / 100; // at most 2 decimals
}

function computeCommissionPaise(totalPaise, ratePercent) {
  const bps = Math.round(ratePercent * 100); // percent -> basis points
  return Math.round((totalPaise * bps) / 10000);
}

function shouldRecord(before, after) {
  if (!before || !after) return false;
  return before.status !== "delivered" && after.status === "delivered";
}

async function recordCommissionForOrder({ db, orderId, now }) {
  const orderRef = db.collection("orders").doc(orderId);
  const ledgerRef = db.collection("ledger").doc(orderId);
  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return { recorded: false, reason: "order-missing" };
    const order = orderSnap.data();
    if (order.status !== "delivered") return { recorded: false, reason: "not-delivered" };
    if (typeof order.shopId !== "string" || !order.shopId) return { recorded: false, reason: "no-shop" };
    const totalPaise = toPaise(order.total);
    if (totalPaise === null) return { recorded: false, reason: "bad-total" };
    if (order.paymentMethod !== "COD") return { recorded: false, reason: "unsupported-payment-method" };

    const walletRef = db.collection("wallets").doc(order.shopId);
    const cfgRef = db.collection("config").doc("platform");
    // All reads before any write.
    const [ledgerSnap, walletSnap, cfgSnap] = await Promise.all([
      tx.get(ledgerRef), tx.get(walletRef), tx.get(cfgRef)
    ]);
    if (ledgerSnap.exists) return { recorded: false, reason: "already-recorded" };

    const ratePercent = parseRatePercent(cfgSnap.exists ? cfgSnap.data() : null);
    const commissionPaise = computeCommissionPaise(totalPaise, ratePercent);
    const w = walletSnap.exists ? walletSnap.data() : {};
    const num = (v) => (Number.isInteger(v) ? v : 0);

    tx.set(ledgerRef, {
      orderId, shopId: order.shopId, type: "commission", paymentMethod: order.paymentMethod,
      orderTotalPaise: totalPaise, ratePercent, commissionPaise, createdAt: now()
    });
    tx.set(walletRef, {
      shopId: order.shopId,
      commissionDuePaise: num(w.commissionDuePaise) + commissionPaise,
      totalCommissionPaise: num(w.totalCommissionPaise) + commissionPaise,
      totalSalesPaise: num(w.totalSalesPaise) + totalPaise,
      deliveredOrders: num(w.deliveredOrders) + 1,
      updatedAt: now()
    });
    return { recorded: true, commissionPaise, ratePercent };
  });
}

module.exports = { toPaise, parseRatePercent, computeCommissionPaise, shouldRecord, recordCommissionForOrder };
