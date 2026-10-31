// Coupons (collection `coupons`, document id = the code). Pure helpers, unit-tested.
// Phase 6 = the owner creates / pauses / deletes coupons. APPLYING a coupon at checkout (and the matching order-rule check)
// comes with the checkout work in Phase 7; discountFor() below is the one function it will use, so the maths is already fixed and tested.
export const CODE_RE = /^[A-Z0-9]{3,16}$/;
export const TYPES = ["percent", "flat"];

export const cleanCode = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();

/** Form values -> { error } or { code, data } for Firestore (no createdAt: the caller adds serverTimestamp). */
export function cleanCoupon(f) {
  const code = cleanCode(f.code);
  if (!CODE_RE.test(code)) return { error: "Code 3 se 16 akshar/number ka ho (jaise SAVE10)." };
  if (!TYPES.includes(f.type)) return { error: "Percent ya flat chunein." };
  const value = Number(f.value);
  if (!(value > 0)) return { error: "Discount 0 se zyada ho." };
  if (f.type === "percent" && (!Number.isInteger(value) || value > 90)) return { error: "Percent 1 se 90 ke beech poora number ho." };
  if (f.type === "flat" && value > 5000) return { error: "Flat discount Rs 5000 se zyada nahi ho sakta." };
  const minOrder = f.minOrder === "" || f.minOrder == null ? 0 : Number(f.minOrder);
  if (!(minOrder >= 0 && minOrder <= 10000)) return { error: "Minimum order 0 se 10,000 ke beech ho." };
  const data = { code, type: f.type, value, minOrder, active: f.active !== false };
  if (f.type === "percent" && f.maxDiscount !== "" && f.maxDiscount != null) {
    const m = Number(f.maxDiscount);
    if (!(m > 0 && m <= 5000)) return { error: "Max discount 0 se zyada aur Rs 5000 tak ho." };
    data.maxDiscount = m;
  }
  if (f.type === "flat" && value > minOrder && minOrder > 0) return { error: "Flat discount minimum order se bada nahi ho sakta." };
  if (f.expiresAt) {
    const d = f.expiresAt instanceof Date ? f.expiresAt : new Date(f.expiresAt + "T23:59:59");
    if (Number.isNaN(d.getTime())) return { error: "Aakhri tareekh galat hai." };
    data.expiresAt = d;
  }
  return { code, data };
}

const toMs = (v) => (v instanceof Date ? v.getTime() : v && typeof v.toMillis === "function" ? v.toMillis() : v && typeof v.seconds === "number" ? v.seconds * 1000 : null);

export function isExpired(c, now = Date.now()) {
  const ms = toMs(c && c.expiresAt);
  return ms != null && ms < now;
}

/** -> "active" | "paused" | "expired" for the owner list. */
export function couponState(c, now = Date.now()) {
  if (isExpired(c, now)) return "expired";
  return c && c.active === true ? "active" : "paused";
}

/** Discount (whole rupees, never more than the subtotal) or { ok:false, reason } in Hinglish. */
export function discountFor(c, subtotal, now = Date.now()) {
  if (!c || c.active !== true) return { ok: false, reason: "Ye coupon abhi chalu nahi hai." };
  if (isExpired(c, now)) return { ok: false, reason: "Ye coupon expire ho chuka hai." };
  const sub = Number(subtotal);
  if (!(sub > 0)) return { ok: false, reason: "Cart khaali hai." };
  if (sub < (Number(c.minOrder) || 0)) return { ok: false, reason: "Is coupon ke liye kam se kam Rs " + c.minOrder + " ka order chahiye." };
  let d = c.type === "percent" ? Math.floor((sub * Number(c.value)) / 100) : Number(c.value);
  if (c.type === "percent" && Number(c.maxDiscount) > 0) d = Math.min(d, Number(c.maxDiscount));
  d = Math.min(d, Math.floor(sub));
  return d > 0 ? { ok: true, discount: d } : { ok: false, reason: "Is order par discount nahi banta." };
}

export function describe(c) {
  const v = c.type === "percent" ? c.value + "% off" + (c.maxDiscount ? " (max Rs " + c.maxDiscount + ")" : "") : "Rs " + c.value + " off";
  return v + (c.minOrder ? " | Min Rs " + c.minOrder : "");
}
