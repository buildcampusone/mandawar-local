import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDeliveryEligibility } from "../shared/services/nearby-core.js";
import {
  Screen, resolveScreen, filterEntries, summarizeEntries, toCardModel, statusTone, statusLabelKey
} from "../modules/customer/nearby-view-model.js";

// Synthetic test data only (never used by the app). Coordinates are arbitrary test numbers.
const CUSTOMER = { latitude: 10, longitude: 10 };
const mkShop = (id, over = {}) => ({
  id, name: "Shop " + id, category: "kirana", address: "Main road " + id, status: "approved", isOpen: true,
  location: { latitude: 10.005, longitude: 10 },
  delivery: { enabled: true, radiusKm: 3, deliveryFee: 20, minimumOrderAmount: 100, estimatedPreparationMinutes: 15 },
  ...over
});
const entry = (shop) => ({ shop, eligibility: evaluateDeliveryEligibility(shop, CUSTOMER) });

test("toCardModel: deliverable shop shows only facts the shop provides", () => {
  const c = toCardModel(entry(mkShop("a")));
  assert.equal(c.deliverable, true); assert.equal(c.canOpen, true); assert.equal(c.mappable, true); assert.equal(c.tone, "ok");
  assert.equal(c.statusKey, "nbStatus_DELIVERABLE");
  assert.match(c.distance, /m$/);
  assert.deepEqual(c.facts.map((f) => f.key), ["nbFee", "nbMinOrder", "nbPrep"]);
  assert.equal(c.facts[0].vars.n, "Rs 20");
});

test("toCardModel: missing delivery fields produce NO facts (nothing invented)", () => {
  const c = toCardModel(entry(mkShop("a", { delivery: { enabled: true, radiusKm: 3 } })));
  assert.deepEqual(c.facts, []);
});

test("toCardModel: free delivery only when fee is exactly 0; min order 0 is omitted", () => {
  const c = toCardModel(entry(mkShop("a", { delivery: { enabled: true, radiusKm: 3, deliveryFee: 0, minimumOrderAmount: 0 } })));
  assert.deepEqual(c.facts.map((f) => f.key), ["nbFeeFree"]);
});

test("toCardModel: shop without coordinates is LOCATION_UNAVAILABLE, not deliverable, no distance", () => {
  const c = toCardModel(entry(mkShop("a", { location: undefined })));
  assert.equal(c.status, "LOCATION_UNAVAILABLE"); assert.equal(c.deliverable, false);
  assert.equal(c.canOpen, false); assert.equal(c.mappable, false); assert.equal(c.distance, null); assert.deepEqual(c.facts, []);
});

test("toCardModel: closed / paused / outside / delivery off are never openable", () => {
  const cases = {
    CLOSED: mkShop("a", { isOpen: false }),
    TEMPORARILY_UNAVAILABLE: mkShop("b", { delivery: { enabled: true, radiusKm: 3, suspended: true } }),
    OUTSIDE_DELIVERY_AREA: mkShop("c", { delivery: { enabled: true, radiusKm: 0.5 }, location: { latitude: 10.1, longitude: 10 } }),
    DELIVERY_UNAVAILABLE: mkShop("d", { delivery: { enabled: false, radiusKm: 3 } }),
    // isOpen missing counts as closed
    CLOSED2: mkShop("e", { isOpen: undefined })
  };
  for (const [want, shop] of Object.entries(cases)) {
    const c = toCardModel(entry(shop));
    assert.equal(c.status, want.replace("2", ""), want);
    assert.equal(c.canOpen, false, want);
  }
});

test("toCardModel: outside area shows the shop's own radius only", () => {
  const c = toCardModel(entry(mkShop("c", { delivery: { enabled: true, radiusKm: 0.5, deliveryFee: 10 }, location: { latitude: 10.1, longitude: 10 } })));
  assert.deepEqual(c.facts, [{ key: "nbRadius", vars: { n: 0.5 } }]);
});

test("tone / label key helpers fall back safely", () => {
  assert.equal(statusTone("CLOSED"), "warn"); assert.equal(statusTone("OUTSIDE_DELIVERY_AREA"), "muted");
  assert.equal(statusLabelKey("SOMETHING_NEW"), "nbStatus_LOCATION_UNAVAILABLE");
});

test("filterEntries: query matches name / category label / address, category filter, tolerant of bad input", () => {
  const list = [entry(mkShop("a", { name: "Sharma Dairy", category: "dairy", address: "Bus stand" })),
                entry(mkShop("b", { name: "Gupta Store", category: "kirana", address: "Station road" }))];
  assert.equal(filterEntries(list, { query: "sharma" }).length, 1);
  assert.equal(filterEntries(list, { query: "STATION" })[0].shop.id, "b");
  assert.equal(filterEntries(list, { query: "dairy" })[0].shop.id, "a");   // category label
  assert.equal(filterEntries(list, { category: "kirana" }).length, 1);
  assert.equal(filterEntries(list, { query: "zzz" }).length, 0);
  assert.equal(filterEntries(null).length, 0);
});

test("summarizeEntries counts deliverable vs other", () => {
  const list = [entry(mkShop("a")), entry(mkShop("b", { isOpen: false })), entry(mkShop("c", { location: undefined }))];
  assert.deepEqual(summarizeEntries(list), { deliverable: 1, other: 2 });
});

test("resolveScreen: location phases", () => {
  assert.equal(resolveScreen({ locationState: "NOT_REQUESTED", location: null }), Screen.NEEDS_LOCATION);
  assert.equal(resolveScreen({ locationState: "REQUESTING", location: null }), Screen.LOCATING);
  for (const s of ["DENIED", "UNAVAILABLE", "ERROR"])
    assert.equal(resolveScreen({ locationState: s, location: null }), Screen.LOCATION_PROBLEM);
  assert.equal(resolveScreen(), Screen.NEEDS_LOCATION);
});

test("resolveScreen: with a location, a fetch error is LOAD_ERROR and never EMPTY", () => {
  const loc = { latitude: 1, longitude: 1 };
  assert.equal(resolveScreen({ locationState: "GRANTED", location: loc, discovery: { status: "error" } }), Screen.LOAD_ERROR);
  assert.equal(resolveScreen({ locationState: "GRANTED", location: loc, discovery: { status: "loading" } }), Screen.LOADING);
  assert.equal(resolveScreen({ locationState: "GRANTED", location: loc }), Screen.LOADING);
});

test("resolveScreen: ready -> empty / empty-search / results; a stale location error does not hide a known location", () => {
  const loc = { latitude: 1, longitude: 1 };
  const e = entry(mkShop("a", { name: "Alpha" }));
  const base = { locationState: "ERROR", location: loc };   // retry failed but earlier location still usable
  assert.equal(resolveScreen({ ...base, discovery: { status: "ready", entries: [] } }), Screen.EMPTY_NONE);
  assert.equal(resolveScreen({ ...base, discovery: { status: "ready", entries: [e] }, query: "nope" }), Screen.EMPTY_SEARCH);
  assert.equal(resolveScreen({ ...base, discovery: { status: "ready", entries: [e] }, query: "alp" }), Screen.RESULTS);
});
