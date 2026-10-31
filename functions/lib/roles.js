// Pure role-change rules for "Delivery partner management" (no firebase imports, unit-testable).
// The server (functions/index.js) is the only place that applies these; the browser copy in
// modules/admin/delivery-partners-core.js is for UX only and is never trusted.

const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;   // Firebase Auth uids; also keeps "/" out of doc paths
const PHONE_RE = /^[6-9][0-9]{9}$/;        // same pattern firestore.rules uses for phones
const MIN_NAME = 2;
const MAX_NAME = 40;

const MESSAGES = {
  "bad-input": "Galat input.",
  "not-admin": "Sirf admin ye kar sakta hai.",
  "self-change": "Apna role nahi badal sakte.",
  "target-missing": "User nahi mila.",
  "protected-role": "Is user ka role yahan se nahi badla ja sakta.",
  "already-delivery": "Ye pehle se rider hai.",
  "not-a-rider": "Ye rider nahi hai.",
  "active-order": "Rider ki delivery abhi chal rahi hai. Pehle use poori hone dein.",
  "check-failed": "Active order jaanch nahi ho paayi. Dobara try karein."
};

const HTTPS_CODE = {
  "bad-input": "invalid-argument",
  "not-admin": "permission-denied",
  "self-change": "permission-denied",
  "protected-role": "permission-denied",
  "target-missing": "not-found",
  "already-delivery": "failed-precondition",
  "not-a-rider": "failed-precondition",
  "active-order": "failed-precondition",
  "check-failed": "internal"
};

const fail = (code) => ({ ok: false, code, message: MESSAGES[code] });
const isValidUid = (v) => typeof v === "string" && UID_RE.test(v);
const httpsCodeFor = (code) => HTTPS_CODE[code] || "internal";

// uid strings + a real boolean. Anything else is rejected before any database read.
function validateInput({ actorUid, targetUid, makeDelivery } = {}) {
  if (!isValidUid(actorUid) || !isValidUid(targetUid)) return fail("bad-input");
  if (typeof makeDelivery !== "boolean") return fail("bad-input");
  return { ok: true };
}

// Only customer -> delivery and delivery -> customer. targetRole is the LIVE role read from
// Firestore (null/undefined when the user doc does not exist). Everything else is refused,
// including admin and unknown roles.
function validateTransition({ actorUid, targetUid, targetRole, makeDelivery } = {}) {
  const input = validateInput({ actorUid, targetUid, makeDelivery });
  if (!input.ok) return input;
  if (actorUid === targetUid) return fail("self-change");
  if (typeof targetRole !== "string" || !targetRole) return fail("target-missing");
  if (makeDelivery) {
    if (targetRole === "customer") return { ok: true, from: "customer", to: "delivery" };
    if (targetRole === "delivery") return fail("already-delivery");
    return fail("protected-role");
  }
  if (targetRole === "delivery") return { ok: true, from: "delivery", to: "customer" };
  if (targetRole === "customer") return fail("not-a-rider");
  return fail("protected-role");
}

// activeOrderCount = orders with deliveryBoyId == rider AND status == "out_for_delivery".
// Fails closed: if the count is not a clean non-negative integer we refuse.
function canRemoveRider({ activeOrderCount } = {}) {
  if (!Number.isInteger(activeOrderCount) || activeOrderCount < 0) return fail("check-failed");
  if (activeOrderCount > 0) return fail("active-order");
  return { ok: true };
}

// Search box -> { ok, type: "phone"|"name", value }. Accepts "98765 43210", "+91-9876543210", "919876543210".
function parseSearchQuery(raw) {
  if (typeof raw !== "string") return fail("bad-input");
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return fail("bad-input");
  if (/^[+\d\s-]+$/.test(s)) {
    let d = s.replace(/[\s-]/g, "");
    if (d.startsWith("+91")) d = d.slice(3);
    else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    return PHONE_RE.test(d) ? { ok: true, type: "phone", value: d } : fail("bad-input");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return fail("bad-input");
  const len = [...s].length;
  if (len < MIN_NAME || len > MAX_NAME) return fail("bad-input");
  return { ok: true, type: "name", value: s };
}

module.exports = {
  MESSAGES, isValidUid, httpsCodeFor, validateInput, validateTransition, canRemoveRider, parseSearchQuery
};
