// Mandawar Mart Cloud Functions (server-side logic that must never trust the browser).
//   Step 3  orders/{id} status trigger -> restore stock on rejected/cancelled  (done, below)
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
const { parseSearchQuery, httpsCodeFor } = require("./lib/roles");
const { isAdmin, changeDeliveryRole, findUsers, listRiders } = require("./lib/delivery-admin");
const { enforceOrderLimits } = require("./lib/abuse");
const { sweepStaleOrders } = require("./lib/expiry");
const ops = require("./lib/admin-ops");
const { pushForCreate, pushForUpdate } = require("./lib/push");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// Mumbai: closest region to Dausa, Rajasthan. maxInstances caps cost if something loops.
setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

// Customer places an order -> stock is decremented in the browser batch (see firestore.rules).
// When the order is later rejected (owner) or cancelled (customer) the stock must go back.
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

// ---- Stale orders: nobody may stay stuck forever -------------------------------------------------
exports.expireStaleOrdersJob = onSchedule({ schedule: "every 5 minutes", region: "asia-south1", timeZone: "Asia/Kolkata", maxInstances: 1 }, async () => {
  const res = await sweepStaleOrders({ db: getFirestore() });
  if (res.cancelled) logger.info("expireStaleOrdersJob", res);
});

// ---- Admin: cancel stuck order, block users -------------------------
function adminCallable(name, run) {
  return onCall(ADMIN_CALL, async (request) => {
    const uid = await requireAdmin(request, name);
    const data = request.data && typeof request.data === "object" ? request.data : {};
    const res = await run({ db: getFirestore(), actorUid: uid, data, now: () => FieldValue.serverTimestamp() });
    if (!res.ok) throw new HttpsError(ops.httpsCode(res.code), res.message, { reason: res.code });
    logger.info(name, { actor: uid });
    return res;
  });
}
exports.adminCancelOrder = adminCallable("adminCancelOrder", ({ data, ...r }) => ops.cancelOrderTx({ ...r, orderId: data.orderId, reason: data.reason }));
exports.setUserStatus = adminCallable("setUserStatus", ({ data, ...r }) => ops.setUserStatusTx({ ...r, targetUid: data.uid, status: data.status }));

// ---- Push notifications (works with the app CLOSED). Tokens live in pushTokens/{uid} (client: shared/services/push.js).
async function sendPush(items) {
  const db = getFirestore();
  for (const it of items) {
    let uids = [];
    if (it.target === "riders" || it.target === "admins") {
      const s = await db.collection("users").where("role", "==", it.target === "riders" ? "delivery" : "admin").limit(50).get();
      uids = s.docs.map((d) => d.id);
    } else if (typeof it.uid === "string" && it.uid) uids = [it.uid];
    if (!uids.length) continue;
    const snaps = await Promise.all(uids.map((u) => db.collection("pushTokens").doc(u).get()));
    const rows = snaps.filter((s) => s.exists && typeof s.data().token === "string").map((s) => ({ uid: s.id, token: s.data().token }));
    if (!rows.length) continue;
    // data-only message: the service worker shows it (see service-worker.js "push" handler)
    const res = await getMessaging().sendEachForMulticast({
      tokens: rows.map((r) => r.token),
      data: { title: it.title, body: it.body || "", tag: it.tag || "", url: "./" },
      webpush: { headers: { Urgency: "high", TTL: "3600" } }
    });
    await Promise.all(res.responses.map((r, i) => (!r.success && r.error && /registration-token-not-registered|invalid-argument|invalid-registration/.test(r.error.code || ""))
      ? db.collection("pushTokens").doc(rows[i].uid).delete().catch(() => {}) : null));
  }
}
exports.pushOnOrderCreated = onDocumentCreated("orders/{orderId}", async (event) => {
  try { await sendPush(pushForCreate(event.data && event.data.data(), event.params.orderId)); }
  catch (e) { logger.warn("pushOnOrderCreated failed", { err: String(e) }); }
});
exports.pushOnOrderUpdated = onDocumentUpdated("orders/{orderId}", async (event) => {
  try {
    await sendPush(pushForUpdate(event.data && event.data.before.data(), event.data && event.data.after.data(), event.params.orderId));
  } catch (e) { logger.warn("pushOnOrderUpdated failed", { err: String(e) }); }
});
