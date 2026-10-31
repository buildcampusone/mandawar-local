// Mandawar Cloud Functions (server-side logic that must never trust the browser).
//   Step 3  orders/{id} status trigger -> restore stock on rejected/cancelled  (done, below)
//   Step 4  orders/{id} delivered -> commission ledger row + shopkeeper wallet (done, below)
//   Step 6  Admin delivery-partner management: setDeliveryRole / findUserByPhone / listDeliveryPartners (below)
// Planned, in order:
//   Step 5  Razorpay order creation + webhook verification
const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { shouldRestore, restoreStockForOrder } = require("./lib/restore-stock");
const { shouldRecord, recordCommissionForOrder } = require("./lib/commission");
const { parseSearchQuery, httpsCodeFor } = require("./lib/roles");
const { isAdmin, changeDeliveryRole, findUsers, listRiders } = require("./lib/delivery-admin");
const { enforceOrderLimits } = require("./lib/abuse");

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

// A customer flooding the shops with orders (bot, or a prank) gets the newest order cancelled automatically.
// Limits live in lib/abuse.js. Needs the composite index customerUid + createdAt (firestore.indexes.json).
exports.guardOrderFlood = onDocumentCreated("orders/{orderId}", async (event) => {
  const order = event.data && event.data.data();
  const res = await enforceOrderLimits({ db: getFirestore(), orderId: event.params.orderId, order });
  if (res.block) logger.warn("guardOrderFlood cancelled an order", { orderId: event.params.orderId, customer: order.customerUid, reason: res.reason });
});

// ---- Admin: delivery partners (rider role) ------------------------------------------------------
// users/{uid} is not readable by other users (firestore.rules), so admin search and role changes
// go through these callables. Each one re-checks users/{caller}.role == "admin" in Firestore.
// maxInstances is a hard cost/abuse cap: a compromised admin session still cannot fan out.
// ENFORCE_APP_CHECK is read from functions/.env. Keep it 0 until the website sends App Check tokens
// (shared/config/firebase.js has a site key), then set 1 and redeploy: callables then reject anything without a valid token.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === "1";
const ADMIN_CALL = { region: "asia-south1", maxInstances: 3, timeoutSeconds: 30, enforceAppCheck: ENFORCE_APP_CHECK };

async function requireAdmin(request, fn) {
  if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "Pehle login karein.");
  if (!(await isAdmin(getFirestore(), request.auth.uid))) {
    logger.warn(fn + " denied: caller is not admin", { uid: request.auth.uid });
    throw new HttpsError("permission-denied", "Sirf admin ye kar sakta hai.", { reason: "not-admin" });
  }
  return request.auth.uid;
}

exports.setDeliveryRole = onCall(ADMIN_CALL, async (request) => {
  if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "Pehle login karein.");
  const data = request.data && typeof request.data === "object" ? request.data : {};
  const res = await changeDeliveryRole({
    db: getFirestore(), actorUid: request.auth.uid, targetUid: data.uid,
    makeDelivery: data.makeDelivery, now: () => FieldValue.serverTimestamp()
  });
  if (!res.ok) {
    logger.warn("setDeliveryRole refused", { actor: request.auth.uid, target: data.uid, code: res.code });
    throw new HttpsError(httpsCodeFor(res.code), res.message, { reason: res.code });
  }
  logger.info("setDeliveryRole", { actor: request.auth.uid, target: res.uid, from: res.from, to: res.to });
  return { ok: true, uid: res.uid, from: res.from, to: res.to };
});

exports.findUserByPhone = onCall(ADMIN_CALL, async (request) => {
  await requireAdmin(request, "findUserByPhone");
  const data = request.data && typeof request.data === "object" ? request.data : {};
  const parsed = parseSearchQuery(data.query);
  if (!parsed.ok) throw new HttpsError("invalid-argument", parsed.message, { reason: parsed.code });
  return { users: await findUsers({ db: getFirestore(), parsed }) };   // max 20, only uid/name/phone/role
});

exports.listDeliveryPartners = onCall(ADMIN_CALL, async (request) => {
  await requireAdmin(request, "listDeliveryPartners");
  return { riders: await listRiders({ db: getFirestore() }) };         // max 50, uid/name/phone/status
});
