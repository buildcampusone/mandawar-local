import test from "node:test";
import assert from "node:assert/strict";
import { haversineKm, isValidCoord, formatDistance } from "../shared/services/geo.js";
import { ShopAvailability as S, evaluateDeliveryEligibility as evalElig, sortEntries } from "../shared/services/nearby-core.js";
import { createLocationController, LocationState as L } from "../shared/services/location.js";

const C = { latitude: 10, longitude: 10 };
const shop = (over = {}) => ({
  id: "s", name: "Shop", status: "approved", isOpen: true, location: { latitude: 10.005, longitude: 10 },
  delivery: { enabled: true, radiusKm: 3, deliveryFee: 20, minimumOrderAmount: 100, estimatedPreparationMinutes: 15 }, ...over
});

test("geo: valid coordinates, haversine, formatDistance", () => {
  assert.equal(isValidCoord({ latitude: 91, longitude: 0 }), false);
  assert.equal(isValidCoord({ latitude: "1", longitude: 0 }), false);
  assert.equal(isValidCoord(null), false);
  assert.equal(isValidCoord({ latitude: 0, longitude: -180 }), true);
  assert.ok(Math.abs(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) - 111.19) < 0.1);
  assert.equal(haversineKm(C, { latitude: NaN, longitude: 1 }), null);
  assert.equal(haversineKm(C, C), 0);
  assert.equal(formatDistance(null), ""); assert.equal(formatDistance(NaN), ""); assert.equal(formatDistance(-1), "");
  assert.equal(formatDistance(0), "<50 m");
  assert.equal(formatDistance(0.5565), "560 m");
  assert.equal(formatDistance(0.9996), "1.0 km");
  assert.equal(formatDistance(1.234), "1.2 km");
  assert.equal(formatDistance(9.96), "10 km");
  assert.equal(formatDistance(12.6), "13 km");
});

test("eligibility: order of checks", () => {
  assert.equal(evalElig(shop({ status: "pending" }), C).status, S.PENDING_APPROVAL);
  assert.equal(evalElig(null, C).status, S.PENDING_APPROVAL);
  assert.equal(evalElig(shop({ location: undefined }), C).status, S.LOCATION_UNAVAILABLE);
  assert.equal(evalElig(shop({ location: { latitude: 200, longitude: 0 } }), C).status, S.LOCATION_UNAVAILABLE);
  assert.equal(evalElig(shop(), null).status, S.LOCATION_UNAVAILABLE);
  assert.equal(evalElig(shop({ delivery: undefined }), C).status, S.DELIVERY_UNAVAILABLE);
  assert.equal(evalElig(shop({ delivery: { enabled: true } }), C).status, S.DELIVERY_UNAVAILABLE);          // no radius
  assert.equal(evalElig(shop({ delivery: { enabled: true, radiusKm: 0 } }), C).status, S.DELIVERY_UNAVAILABLE);
  assert.equal(evalElig(shop({ delivery: { enabled: "yes", radiusKm: 3 } }), C).status, S.DELIVERY_UNAVAILABLE);  // must be exactly true
  assert.equal(evalElig(shop({ delivery: { enabled: false, radiusKm: 3 } }), C).status, S.DELIVERY_UNAVAILABLE);
  assert.equal(evalElig(shop({ delivery: { enabled: true, radiusKm: 0.1 }, location: { latitude: 10.1, longitude: 10 } }), C).status, S.OUTSIDE_DELIVERY_AREA);
  assert.equal(evalElig(shop({ isOpen: false }), C).status, S.CLOSED);
  assert.equal(evalElig(shop({ isOpen: undefined }), C).status, S.CLOSED);
  assert.equal(evalElig(shop({ delivery: { enabled: true, radiusKm: 3, suspended: true } }), C).status, S.TEMPORARILY_UNAVAILABLE);
  const ok = evalElig(shop(), C);
  assert.equal(ok.status, S.DELIVERABLE); assert.equal(ok.deliverable, true);
  assert.equal(ok.deliveryFee, 20); assert.equal(ok.minimumOrderAmount, 100); assert.equal(ok.estimatedPreparationMinutes, 15);
});

test("eligibility: a closed shop outside the radius is OUTSIDE, closed + inside is CLOSED", () => {
  assert.equal(evalElig(shop({ isOpen: false, delivery: { enabled: true, radiusKm: 0.1 }, location: { latitude: 10.1, longitude: 10 } }), C).status, S.OUTSIDE_DELIVERY_AREA);
  assert.equal(evalElig(shop({ isOpen: false }), C).status, S.CLOSED);
});

test("eligibility: exactly on the radius still delivers; bad numbers become null, never 0", () => {
  const dist = haversineKm({ latitude: 10.005, longitude: 10 }, C);
  assert.equal(evalElig(shop({ delivery: { enabled: true, radiusKm: dist } }), C).status, S.DELIVERABLE);
  const e = evalElig(shop({ delivery: { enabled: true, radiusKm: 3, deliveryFee: "20", minimumOrderAmount: -5, estimatedPreparationMinutes: 0 } }), C);
  assert.equal(e.deliveryFee, null); assert.equal(e.minimumOrderAmount, null); assert.equal(e.estimatedPreparationMinutes, null);
  assert.equal(evalElig(shop({ delivery: { enabled: true, radiusKm: 3, deliveryFee: 0 } }), C).deliveryFee, 0);
});

test("eligibility: outside area exposes only the shop's own radius", () => {
  const e = evalElig(shop({ delivery: { enabled: true, radiusKm: 0.5, deliveryFee: 10 }, location: { latitude: 10.1, longitude: 10 } }), C);
  assert.equal(e.radiusKm, 0.5); assert.equal(e.deliveryFee, null); assert.ok(e.distanceKm > 10);
});

test("sortEntries: deliverable first, then nearest, unknown distance last, input untouched", () => {
  const mk = (id, over) => { const s = shop({ id, name: id, ...over }); return { shop: s, eligibility: evalElig(s, C) }; };
  const list = [
    mk("far", { location: { latitude: 10.02, longitude: 10 } }),
    mk("closed", { isOpen: false }),
    mk("nowhere", { location: undefined }),
    mk("near", { location: { latitude: 10.001, longitude: 10 } })
  ];
  assert.deepEqual(sortEntries(list).map((e) => e.shop.id), ["near", "far", "closed", "nowhere"]);
  assert.equal(list[0].shop.id, "far");
  assert.deepEqual(sortEntries(null), []);
});

// ---- location controller (fake GPS + storage, no browser)
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const gps = () => { const g = { cb: null, getCurrentPosition(ok, err) { g.cb = { ok, err }; } }; return g; };
const fix = (latitude, longitude, accuracy = 25.4) => ({ coords: { latitude, longitude, accuracy } });

test("location: GPS success -> GRANTED, rounded, saved", () => {
  const g = gps(), store = memStore(), seen = [];
  const c = createLocationController({ geolocation: g, storage: store });
  c.subscribe((s) => seen.push(s.locationState));
  c.request();
  assert.equal(c.getState().locationState, L.REQUESTING);
  g.cb.ok(fix(26.123456789, 76.987654321));
  const s = c.getState();
  assert.equal(s.locationState, L.GRANTED);
  assert.deepEqual(s.location, { latitude: 26.12346, longitude: 76.98765, accuracy: 25, source: "gps" });
  assert.deepEqual(seen, [L.REQUESTING, L.GRANTED]);
  assert.ok(store.m.get("ml-loc"));
});

test("location: denied / unavailable / timeout / unsupported / garbage", () => {
  for (const [code, want] of [[1, L.DENIED], [2, L.UNAVAILABLE], [3, L.ERROR], [99, L.ERROR]]) {
    const g = gps(), c = createLocationController({ geolocation: g, storage: memStore() });
    c.request(); g.cb.err({ code });
    assert.equal(c.getState().locationState, want, "code " + code);
    assert.equal(typeof c.getState().locationError.message, "string");
    assert.equal(c.getState().location, null);
  }
  const none = createLocationController({ geolocation: null, storage: memStore() });
  none.request(); assert.equal(none.getState().locationState, L.UNAVAILABLE);
  const g = gps(), bad = createLocationController({ geolocation: g, storage: memStore() });
  bad.request(); g.cb.ok({ coords: { latitude: NaN, longitude: 1 } });
  assert.equal(bad.getState().locationState, L.ERROR);
});

test("location: a failed retry keeps the last good location; cancel ignores a late answer", () => {
  const g = gps(), c = createLocationController({ geolocation: g, storage: memStore() });
  c.request(); g.cb.ok(fix(10, 10));
  c.request(); g.cb.err({ code: 3 });
  assert.equal(c.getState().locationState, L.ERROR);
  assert.equal(c.getState().location.latitude, 10);
  c.request(); const late = g.cb; c.cancel();
  assert.equal(c.getState().locationState, L.GRANTED);   // had a location -> back to it
  late.ok(fix(55, 55));
  assert.equal(c.getState().location.latitude, 10);       // late answer ignored
  const g2 = gps(), c2 = createLocationController({ geolocation: g2, storage: memStore() });
  c2.request(); c2.cancel();
  assert.equal(c2.getState().locationState, L.NOT_REQUESTED);
});

test("location: saved position is reused, but dropped when old or corrupt", () => {
  let t0 = 1_000_000;
  const store = memStore();
  const a = createLocationController({ geolocation: null, storage: store, now: () => t0 });
  assert.equal(a.setManual(26.1, 76.9, "Bus stand"), true);
  assert.equal(a.getState().location.source, "manual");
  const b = createLocationController({ geolocation: null, storage: store, now: () => t0 + 60_000 });
  assert.equal(b.loadSaved(), true);
  assert.equal(b.getState().location.source, "saved");
  const old = createLocationController({ geolocation: null, storage: store, now: () => t0 + 7 * 3600_000 });
  assert.equal(old.loadSaved(), false);
  assert.equal(store.getItem("ml-loc"), null);
  store.setItem("ml-loc", "{not json");
  assert.equal(createLocationController({ geolocation: null, storage: store }).loadSaved(), false);
  assert.equal(a.setManual(200, 0), false);
  a.clear(); assert.equal(a.getState().location, null);
});
