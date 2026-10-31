// Firestore side of "Delivery partner management". Pure of firebase imports: index.js injects the
// Admin SDK Firestore handle (`db`) and `now` (FieldValue.serverTimestamp), same pattern as restore-stock.js.
const { validateInput, validateTransition, canRemoveRider, MESSAGES } = require("./roles");

const MAX_RESULTS = 20;   // search cap
const MAX_RIDERS = 50;    // rider list cap
const fail = (code) => ({ ok: false, code, message: MESSAGES[code] });
const str = (v) => (typeof v === "string" ? v : "");

// Caller must be an admin per the LIVE users/{uid} doc, never per anything the client sent.
async function isAdmin(db, uid) {
  if (typeof uid !== "string" || !uid) return false;
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists && snap.data().role === "admin";
}

// One transaction: re-check admin, read target, validate transition, check active orders, write role + audit.
// Only the `role` field of users/{uid} is touched: firestore.rules lets the owner update only a fixed key
// set, so adding extra fields here would break that user's later profile edits.
async function changeDeliveryRole({ db, actorUid, targetUid, makeDelivery, now }) {
  const input = validateInput({ actorUid, targetUid, makeDelivery });
  if (!input.ok) return input;
  const actorRef = db.collection("users").doc(actorUid);
  const targetRef = db.collection("users").doc(targetUid);
  return db.runTransaction(async (tx) => {
    const actorSnap = await tx.get(actorRef);
    if (!actorSnap.exists || actorSnap.data().role !== "admin") return fail("not-admin");
    const targetSnap = await tx.get(targetRef);
    const targetRole = targetSnap.exists ? targetSnap.data().role : null;
    const verdict = validateTransition({ actorUid, targetUid, targetRole, makeDelivery });
    if (!verdict.ok) return verdict;
    if (!makeDelivery) {
      const active = await tx.get(db.collection("orders")
        .where("deliveryBoyId", "==", targetUid)
        .where("status", "==", "out_for_delivery")
        .limit(1));
      const gate = canRemoveRider({ activeOrderCount: active.size });
      if (!gate.ok) return gate;
    }
    tx.update(targetRef, { role: verdict.to });
    tx.create(db.collection("roleAudit").doc(), {
      actorUid, targetUid, from: verdict.from, to: verdict.to, createdAt: now()
    });
    return { ok: true, uid: targetUid, from: verdict.from, to: verdict.to };
  });
}

// Whitelisted shape: nothing but uid/name/phone/role ever leaves the server.
const publicUser = (d) => ({ uid: d.id, name: str(d.data().name), phone: str(d.data().phone), role: str(d.data().role) });

// parsed = result of parseSearchQuery(). Phone = exact match. Name = prefix match (case-sensitive in
// Firestore), so we also try the first-letter-capitalised form. Max 20 rows.
async function findUsers({ db, parsed, limit = MAX_RESULTS }) {
  const cap = Math.min(limit, MAX_RESULTS);
  const users = db.collection("users");
  const seen = new Map();
  if (parsed.type === "phone") {
    const snap = await users.where("phone", "==", parsed.value).limit(cap).get();
    snap.docs.forEach((d) => seen.set(d.id, publicUser(d)));
  } else {
    const v = parsed.value;
    const variants = [...new Set([v, v.charAt(0).toUpperCase() + v.slice(1)])];
    for (const p of variants) {
      const snap = await users.where("name", ">=", p).where("name", "<", p + "\uf8ff").limit(cap).get();
      snap.docs.forEach((d) => seen.set(d.id, publicUser(d)));
    }
  }
  return [...seen.values()].slice(0, cap);
}

async function listRiders({ db, limit = MAX_RIDERS }) {
  const snap = await db.collection("users").where("role", "==", "delivery").limit(Math.min(limit, MAX_RIDERS)).get();
  return snap.docs
    .map((d) => ({ uid: d.id, name: str(d.data().name), phone: str(d.data().phone), status: str(d.data().status) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { MAX_RESULTS, MAX_RIDERS, isAdmin, changeDeliveryRole, findUsers, listRiders };
