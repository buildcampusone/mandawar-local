// Pure helpers for the Delivery partners panel (no DOM, no Firebase) so they can be unit-tested in node.
// The server (functions/lib/roles.js) re-validates everything; this file only shapes the UX.

const PHONE_RE = /^[6-9][0-9]{9}$/;

// Search box text -> { ok, type: "phone" | "name", value }.
export function parseQuery(raw) {
  if (typeof raw !== "string") return { ok: false };
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { ok: false };
  if (/^[+\d\s-]+$/.test(s)) {
    let d = s.replace(/[\s-]/g, "");
    if (d.startsWith("+91")) d = d.slice(3);
    else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    return PHONE_RE.test(d) ? { ok: true, type: "phone", value: d } : { ok: false };
  }
  const len = [...s].length;
  return len >= 2 && len <= 40 ? { ok: true, type: "name", value: s } : { ok: false };
}

// Which button a result row gets. Admin / anything else: none (server refuses them anyway).
export function actionFor(role) {
  if (role === "customer") return "make";
  if (role === "delivery") return "remove";
  return null;
}

const ROLE_KEYS = { customer: "roleCustomer", admin: "roleAdmin", delivery: "roleDelivery" };
export const roleKey = (role) => ROLE_KEYS[role] || "user";

const REASON_KEYS = {
  "active-order": "rdErrActive", "self-change": "rdErrSelf", "protected-role": "rdErrProtected",
  "already-delivery": "rdErrAlready", "not-a-rider": "rdErrNotRider", "target-missing": "rdErrNotFound",
  "not-admin": "rdErrPerm", "bad-input": "rdBadQuery"
};

// Callable error -> i18n key. Prefers the server's machine-readable `details.reason`; never shows raw server text.
export function errorKey(err) {
  const reason = err && err.details && err.details.reason;
  if (reason && REASON_KEYS[reason]) return REASON_KEYS[reason];
  const code = String((err && err.code) || "");
  if (/unauthenticated|permission-denied/.test(code)) return "rdErrPerm";
  if (/unavailable|deadline-exceeded|network/.test(code)) return "rdErrNet";
  return "rdErrGeneric";
}
