// Pure phone helpers (no Firebase, no DOM) so they are unit-testable. Indian mobiles only: +91 and 10 digits starting 6-9.
export const PHONE_RE = /^[6-9][0-9]{9}$/;
export const isPhone = (p) => typeof p === "string" && PHONE_RE.test(p);
export const toE164 = (p10) => "+91" + p10;
// Firebase user.phoneNumber ("+919876543210") -> "9876543210", or "" if absent / not an Indian mobile.
export function fromE164(e164) {
  return typeof e164 === "string" && /^\+91[6-9][0-9]{9}$/.test(e164) ? e164.slice(3) : "";
}
export const onlyDigits = (s) => String(s || "").replace(/\D/g, "").slice(0, 10);
export const isCode = (c) => typeof c === "string" && /^\d{6}$/.test(c);
