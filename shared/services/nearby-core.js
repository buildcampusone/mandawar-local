// Pure delivery-eligibility logic for the Nearby dashboard (no DOM, no Firebase).
// It never invents data: every number comes from the shop document, and anything missing stays null.
import { haversineKm, isValidCoord } from "./geo.js";

export const ShopAvailability = Object.freeze({
  DELIVERABLE: "DELIVERABLE",                       // open, delivers, customer is inside the radius
  CLOSED: "CLOSED",                                 // inside the radius but the shop is closed (isOpen missing counts as closed)
  TEMPORARILY_UNAVAILABLE: "TEMPORARILY_UNAVAILABLE", // inside the radius, shop paused delivery (delivery.suspended)
  OUTSIDE_DELIVERY_AREA: "OUTSIDE_DELIVERY_AREA",   // customer is farther than the shop's own radius
  DELIVERY_UNAVAILABLE: "DELIVERY_UNAVAILABLE",     // shop has not turned delivery on / has no valid radius
  LOCATION_UNAVAILABLE: "LOCATION_UNAVAILABLE",     // shop (or customer) has no usable coordinates
  PENDING_APPROVAL: "PENDING_APPROVAL"              // shop is not approved
});
const S = ShopAvailability;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function result(status, extra = {}) {
  return {
    status, deliverable: status === S.DELIVERABLE,
    distanceKm: null, radiusKm: null, deliveryFee: null, minimumOrderAmount: null, estimatedPreparationMinutes: null,
    ...extra
  };
}

/**
 * Decide what a customer at `customer` can do with `shop`. Checks run in this fixed order:
 * approval -> coordinates -> delivery on -> inside radius -> open -> not paused.
 * Returns { status, deliverable, distanceKm, radiusKm, deliveryFee, minimumOrderAmount, estimatedPreparationMinutes }.
 */
export function evaluateDeliveryEligibility(shop, customer) {
  if (!shop || shop.status !== "approved") return result(S.PENDING_APPROVAL);
  const shopLoc = shop.location;
  if (!isValidCoord(shopLoc) || !isValidCoord(customer)) return result(S.LOCATION_UNAVAILABLE);

  const distanceKm = haversineKm(shopLoc, customer);
  const d = shop.delivery && typeof shop.delivery === "object" ? shop.delivery : null;
  const radiusKm = d ? num(d.radiusKm) : null;
  if (!d || d.enabled !== true || radiusKm === null || radiusKm <= 0) return result(S.DELIVERY_UNAVAILABLE, { distanceKm });

  const fee = num(d.deliveryFee), min = num(d.minimumOrderAmount), prep = num(d.estimatedPreparationMinutes);
  const facts = {
    distanceKm, radiusKm,
    deliveryFee: fee !== null && fee >= 0 ? fee : null,
    minimumOrderAmount: min !== null && min >= 0 ? min : null,
    estimatedPreparationMinutes: prep !== null && prep > 0 ? prep : null
  };
  if (distanceKm > radiusKm) return result(S.OUTSIDE_DELIVERY_AREA, { distanceKm, radiusKm });   // outside: only the shop's own radius
  if (shop.isOpen !== true) return result(S.CLOSED, facts);
  if (d.suspended === true) return result(S.TEMPORARILY_UNAVAILABLE, facts);
  return result(S.DELIVERABLE, facts);
}

/** Deliverable shops first, then nearest first (unknown distance last), then by name. Returns a new array. */
export function sortEntries(entries) {
  const dist = (e) => (typeof e.eligibility.distanceKm === "number" ? e.eligibility.distanceKm : Infinity);
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) =>
    (b.eligibility.deliverable === true) - (a.eligibility.deliverable === true)
    || dist(a) - dist(b)
    || String(a.shop.name ?? "").localeCompare(String(b.shop.name ?? "")));
}
