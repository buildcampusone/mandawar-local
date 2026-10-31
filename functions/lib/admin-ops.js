// Admin-only safety operations (cancel a stuck order, block / unblock a user). Validators are pure (unit-tested); the *Tx functions run inside one Firestore
// transaction and ALWAYS re-check users/{actor}.role == "admin" there. Every action leaves a row in adminAudit/.
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const OID_RE = /^[A-Za-z0-9]{10,40}$/;
const CANCELLABLE = new Set(["placed", "accepted", "out_for_delivery"]);

const MESSAGES = {
  "bad-input": "Galat input.", "not-admin": "Sirf admin ye kar sakta hai.", "not-found": "Nahi mila.",
  "self-change": "Apne upar ye nahi kar sakte.", "protected-role": "Admin ko block nahi kar sakte.",
  "not-cancellable": "Ye order ab cancel nahi ho sakta."
};
const fail = (code) => ({ ok: false, code, message: MESSAGES[code] });
const HTTPS = { "bad-input": "invalid-argument", "not-admin": "permission-denied", "not-found": "not-found",
  "self-change": "permission-denied", "protected-role": "permission-denied", "not-cancellable": "failed-precondition" };
const httpsCode = (c) => HTTPS[c] || "internal";
const note = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100) : "");

function checkCancel({ orderId, reason }) { return OID_RE.test(orderId || "") ? { ok: true, reason: note(reason) } : fail("bad-input"); }
function checkStatus({ targetUid, status }) {
  return UID_RE.test(targetUid || "") && (status === "active" || status === "blocked") ? { ok: true } : fail("bad-input");
}

async function adminOnly(tx, db, actorUid) {
  const s = await tx.get(db.collection("users").doc(actorUid));
  return s.exists && s.data().role === "admin";
}
const audit = (tx, db, now, row) => tx.create(db.collection("adminAudit").doc(), { ...row, createdAt: now() });

async function cancelOrderTx({ db, actorUid, orderId, reason, now }) {
  const v = checkCancel({ orderId, reason }); if (!v.ok) return v;
  return db.runTransaction(async (tx) => {
    if (!(await adminOnly(tx, db, actorUid))) return fail("not-admin");
    const ref = db.collection("orders").doc(orderId);
    const s = await tx.get(ref);
    if (!s.exists) return fail("not-found");
    if (!CANCELLABLE.has(s.data().status)) return fail("not-cancellable");
    tx.update(ref, { status: "cancelled", cancelReason: "admin:" + v.reason, cancelledBy: actorUid });
    audit(tx, db, now, { type: "cancel-order", actorUid, orderId, from: s.data().status, reason: v.reason });
    return { ok: true, from: s.data().status };
  });
}

async function setUserStatusTx({ db, actorUid, targetUid, status, now }) {
  const v = checkStatus({ targetUid, status }); if (!v.ok) return v;
  if (actorUid === targetUid) return fail("self-change");
  return db.runTransaction(async (tx) => {
    if (!(await adminOnly(tx, db, actorUid))) return fail("not-admin");
    const ref = db.collection("users").doc(targetUid);
    const s = await tx.get(ref);
    if (!s.exists) return fail("not-found");
    if (s.data().role === "admin") return fail("protected-role");
    tx.update(ref, { status });
    audit(tx, db, now, { type: "user-status", actorUid, targetUid, to: status });
    return { ok: true, status };
  });
}

module.exports = { checkCancel, checkStatus, httpsCode, cancelOrderTx, setUserStatusTx, CANCELLABLE };
