// Stale-order sweeper (pure decision + Firestore pass). A scheduled function calls sweepStaleOrders every few minutes.
//  - `placed` and the shop never answered        -> cancelled ("expired:no-response")
//  - `accepted` and no rider took it             -> cancelled ("expired:no-rider")
// Cancelling goes through the normal status change, so restoreStockOnClose gives the stock back and the customer gets a push.
const LIMITS = { placedMs: 15 * 60 * 1000, acceptedMs: 30 * 60 * 1000, batch: 200 };

// ms values are epoch milliseconds. Returns "" (keep) or the cancelReason.
function expiryReason({ status, hasRider, createdMs, changedMs }, nowMs, limits = LIMITS) {
  if (![createdMs, changedMs, nowMs].every(Number.isFinite)) return "";
  if (status === "placed" && nowMs - createdMs >= limits.placedMs) return "expired:no-response";
  if (status === "accepted" && !hasRider && nowMs - changedMs >= limits.acceptedMs) return "expired:no-rider";
  return "";
}

async function sweepStaleOrders({ db, now = Date.now, limits = LIMITS }) {
  const t = now();
  const out = { cancelled: 0 };
  const orders = db.collection("orders");
  const [placed, accepted] = await Promise.all([
    orders.where("status", "==", "placed").where("createdAt", "<=", new Date(t - limits.placedMs)).limit(limits.batch).get(),
    orders.where("status", "==", "accepted").limit(limits.batch).get()
  ]);
  const jobs = [];
  for (const d of [...placed.docs, ...accepted.docs]) {
    const o = d.data();
    const reason = expiryReason({
      status: o.status, hasRider: typeof o.deliveryBoyId === "string" && !!o.deliveryBoyId,
      createdMs: o.createdAt && o.createdAt.toMillis ? o.createdAt.toMillis() : NaN,
      changedMs: d.updateTime ? d.updateTime.toMillis() : NaN
    }, t, limits);
    if (reason) jobs.push(d.ref.update({ status: "cancelled", cancelReason: reason }).then(() => { out.cancelled++; }, () => {}));
  }
  await Promise.all(jobs);
  return out;
}

module.exports = { LIMITS, expiryReason, sweepStaleOrders };
