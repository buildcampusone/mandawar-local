// Mandawar Cloud Functions (server-side logic that must never trust the browser).
//   Step 3  orders/{id} status trigger -> restore stock on rejected/cancelled  (done, below)
//   Step 4  orders/{id} delivered -> commission ledger row + shopkeeper wallet (done, below)
// Planned, in order:
//   Step 5  Razorpay order creation + webhook verification
const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { shouldRestore, restoreStockForOrder } = require("./lib/restore-stock");
const { shouldRecord, recordCommissionForOrder } = require("./lib/commission");

initializeApp();

// Mumbai: closest region to Dausa, Rajasthan. maxInstances caps cost if something loops.
setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

// Customer places an order -> stock is decremented in the browser batch (see firestore.rules).
// When the order is later rejected (shopkeeper) or cancelled (customer) the stock must go back.
// Clients cannot do this themselves: rules only let them lower stock, never raise it.
exports.restoreStockOnClose = onDocumentUpdated("orders/{orderId}", async (event) => {
  const before = event.data && event.data.before.data();
  const after = event.data && event.data.after.data();
  if (!shouldRestore(before, after)) return;
  const orderId = event.params.orderId;
  const res = await restoreStockForOrder({
    db: getFirestore(), orderId, now: () => FieldValue.serverTimestamp()
  });
  logger.info("restoreStockOnClose", { orderId, status: after.status, ...res });
});

// Order delivered -> one immutable ledger/{orderId} row and a running total in wallets/{shopId}.
// Both collections are write-denied for clients in firestore.rules; only this function writes them.
exports.recordCommissionOnDelivered = onDocumentUpdated("orders/{orderId}", async (event) => {
  const before = event.data && event.data.before.data();
  const after = event.data && event.data.after.data();
  if (!shouldRecord(before, after)) return;
  const orderId = event.params.orderId;
  const res = await recordCommissionForOrder({
    db: getFirestore(), orderId, now: () => FieldValue.serverTimestamp()
  });
  if (!res.recorded && res.reason !== "already-recorded")
    logger.warn("recordCommissionOnDelivered skipped", { orderId, ...res });
  else logger.info("recordCommissionOnDelivered", { orderId, ...res });
});
