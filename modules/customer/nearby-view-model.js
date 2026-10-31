// Phase 3A: pure presentation logic for the Nearby dashboard. No DOM, no Firebase, no i18n import,
// so it runs in Node tests. It never creates data: every fact shown comes from the shop document or
// from evaluateDeliveryEligibility(); anything missing stays null and the UI simply omits it.
import { formatDistance } from "../../shared/services/geo.js";
import { ShopAvailability as S } from "../../shared/services/nearby-core.js";
import { catLabel } from "../../shared/config/categories.js";

export const Screen = Object.freeze({
  NEEDS_LOCATION: "needs-location",   // nothing asked yet: explain, then let the user act
  LOCATING: "locating",               // GPS read in progress (no earlier location to show)
  LOCATION_PROBLEM: "location-problem", // denied / unavailable / error and no usable location
  LOADING: "loading",                 // location known, shops being fetched (skeletons)
  LOAD_ERROR: "load-error",           // fetch failed: NEVER the same as "no shops"
  EMPTY_NONE: "empty-none",           // fetch succeeded, no shops in this area
  EMPTY_SEARCH: "empty-search",       // shops exist, none match search / category
  RESULTS: "results"
});

const TONE = {
  [S.DELIVERABLE]: "ok",
  [S.CLOSED]: "warn",
  [S.TEMPORARILY_UNAVAILABLE]: "warn"
};
export const statusTone = (status) => TONE[status] || "muted";
export const statusLabelKey = (status) => "nbStatus_" + (S[status] ? status : "LOCATION_UNAVAILABLE");

/** Entries are { shop, eligibility } from discoverNearbyShops(). Query matches name, category label, address. */
export function filterEntries(entries, { query = "", category = "all" } = {}) {
  const q = String(query).trim().toLowerCase();
  return (Array.isArray(entries) ? entries : []).filter(({ shop }) => {
    if (category && category !== "all" && shop.category !== category) return false;
    if (!q) return true;
    return [shop.name, catLabel(shop.category), shop.address]
      .some((v) => String(v ?? "").toLowerCase().includes(q));
  });
}

/** { deliverable, other } counts for the list header. */
export function summarizeEntries(entries) {
  let deliverable = 0, other = 0;
  for (const e of Array.isArray(entries) ? entries : []) (e.eligibility.deliverable ? deliverable++ : other++);
  return { deliverable, other };
}

const money = (n) => "Rs " + (Number.isInteger(n) ? n : n.toFixed(2));

/**
 * Card data. `facts` = [{ key, vars }] i18n keys the UI translates; only facts the shop really provides.
 * Delivery facts are shown only where the shop actually delivers to this customer (or is paused/closed
 * but within its radius). Outside the radius we show the shop's own radius, nothing else.
 */
export function toCardModel(entry) {
  const { shop, eligibility: e } = entry;
  const facts = [];
  const delivers = e.status === S.DELIVERABLE || e.status === S.CLOSED || e.status === S.TEMPORARILY_UNAVAILABLE;
  if (delivers) {
    if (e.deliveryFee === 0) facts.push({ key: "nbFeeFree" });
    else if (e.deliveryFee > 0) facts.push({ key: "nbFee", vars: { n: money(e.deliveryFee) } });
    if (e.minimumOrderAmount > 0) facts.push({ key: "nbMinOrder", vars: { n: money(e.minimumOrderAmount) } });
    if (e.estimatedPreparationMinutes) facts.push({ key: "nbPrep", vars: { n: e.estimatedPreparationMinutes } });
  } else if (e.status === S.OUTSIDE_DELIVERY_AREA && e.radiusKm) {
    facts.push({ key: "nbRadius", vars: { n: e.radiusKm } });
  }
  return {
    id: shop.id,
    name: String(shop.name ?? ""),
    category: shop.category,
    categoryLabel: catLabel(shop.category),
    address: String(shop.address ?? ""),
    status: e.status,
    statusKey: statusLabelKey(e.status),
    tone: statusTone(e.status),
    deliverable: e.deliverable === true,
    distance: formatDistance(e.distanceKm) || null,   // straight-line, never road distance
    facts,
    canOpen: e.deliverable === true,                   // only DELIVERABLE shops get "View items"
    mappable: e.status !== S.LOCATION_UNAVAILABLE && e.status !== S.PENDING_APPROVAL   // has a real marker position
  };
}

/**
 * Which screen to show. input:
 *  locationState - LocationState string from location.js; location - selected location or null
 *  discovery     - { status: 'idle'|'loading'|'error'|'ready', entries }
 *  query, category - current filters
 */
export function resolveScreen({ locationState, location, discovery, query = "", category = "all" } = {}) {
  if (!location) {
    if (locationState === "REQUESTING") return Screen.LOCATING;
    if (["DENIED", "UNAVAILABLE", "ERROR"].includes(locationState)) return Screen.LOCATION_PROBLEM;
    return Screen.NEEDS_LOCATION;
  }
  const d = discovery || { status: "idle" };
  if (d.status === "error") return Screen.LOAD_ERROR;
  if (d.status !== "ready") return Screen.LOADING;
  const all = Array.isArray(d.entries) ? d.entries : [];
  if (!all.length) return Screen.EMPTY_NONE;
  return filterEntries(all, { query, category }).length ? Screen.RESULTS : Screen.EMPTY_SEARCH;
}
