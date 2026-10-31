const test = require("node:test");
const assert = require("node:assert/strict");
const { validateTransition, canRemoveRider, parseSearchQuery, validateInput, httpsCodeFor } = require("../lib/roles");

const base = { actorUid: "admin1", targetUid: "user1" };

test("customer -> delivery is allowed", () => {
  const r = validateTransition({ ...base, targetRole: "customer", makeDelivery: true });
  assert.deepEqual(r, { ok: true, from: "customer", to: "delivery" });
});

test("delivery -> customer is allowed", () => {
  const r = validateTransition({ ...base, targetRole: "delivery", makeDelivery: false });
  assert.deepEqual(r, { ok: true, from: "delivery", to: "customer" });
});

test("making a rider who is already a rider is refused", () => {
  assert.equal(validateTransition({ ...base, targetRole: "delivery", makeDelivery: true }).code, "already-delivery");
});

test("removing a customer (not a rider) is refused", () => {
  assert.equal(validateTransition({ ...base, targetRole: "customer", makeDelivery: false }).code, "not-a-rider");
});

test("an admin target is never changed, in either direction", () => {
  assert.equal(validateTransition({ ...base, targetRole: "admin", makeDelivery: true }).code, "protected-role");
  assert.equal(validateTransition({ ...base, targetRole: "admin", makeDelivery: false }).code, "protected-role");
});

test("a shopkeeper target is never changed, in either direction", () => {
  assert.equal(validateTransition({ ...base, targetRole: "shopkeeper", makeDelivery: true }).code, "protected-role");
  assert.equal(validateTransition({ ...base, targetRole: "shopkeeper", makeDelivery: false }).code, "protected-role");
});

test("unknown / odd roles are protected", () => {
  for (const role of ["owner", "Customer", "DELIVERY", " customer"])
    assert.equal(validateTransition({ ...base, targetRole: role, makeDelivery: true }).ok, false, role);
});

test("changing your own role is blocked, even for a rider-eligible role value", () => {
  const r = validateTransition({ actorUid: "u1", targetUid: "u1", targetRole: "customer", makeDelivery: true });
  assert.equal(r.code, "self-change");
});

test("missing target doc is refused", () => {
  assert.equal(validateTransition({ ...base, targetRole: null, makeDelivery: true }).code, "target-missing");
  assert.equal(validateTransition({ ...base, targetRole: undefined, makeDelivery: false }).code, "target-missing");
  assert.equal(validateTransition({ ...base, targetRole: "", makeDelivery: false }).code, "target-missing");
});

test("bad input: uid must be a clean string, makeDelivery a real boolean", () => {
  const bad = [
    { ...base, targetUid: 123, targetRole: "customer", makeDelivery: true },
    { ...base, targetUid: "", targetRole: "customer", makeDelivery: true },
    { ...base, targetUid: "a/b", targetRole: "customer", makeDelivery: true },
    { ...base, targetUid: "x".repeat(129), targetRole: "customer", makeDelivery: true },
    { ...base, targetRole: "customer", makeDelivery: "true" },
    { ...base, targetRole: "customer", makeDelivery: 1 },
    { ...base, targetRole: "customer" },
    { actorUid: null, targetUid: "u", targetRole: "customer", makeDelivery: true }
  ];
  for (const b of bad) assert.equal(validateTransition(b).code, "bad-input", JSON.stringify(b));
  assert.equal(validateTransition().code, "bad-input");
});

test("canRemoveRider: no active order -> ok, active order -> rejected with clear message", () => {
  assert.deepEqual(canRemoveRider({ activeOrderCount: 0 }), { ok: true });
  const r = canRemoveRider({ activeOrderCount: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "active-order");
  assert.match(r.message, /delivery/i);
});

test("canRemoveRider fails closed on a bad count", () => {
  for (const n of [undefined, null, -1, 1.5, "0", NaN])
    assert.equal(canRemoveRider({ activeOrderCount: n }).code, "check-failed", String(n));
});

test("parseSearchQuery: phone formats", () => {
  for (const q of ["9876543210", " 98765 43210 ", "+91 98765-43210", "919876543210"])
    assert.deepEqual(parseSearchQuery(q), { ok: true, type: "phone", value: "9876543210" }, q);
});

test("parseSearchQuery: bad phones are refused, not treated as names", () => {
  for (const q of ["12345", "5876543210", "98765432101", "+1 9876543210"])
    assert.equal(parseSearchQuery(q).ok, false, q);
});

test("parseSearchQuery: names (Hindi too), length limits, junk", () => {
  assert.deepEqual(parseSearchQuery("  Ram   Lal "), { ok: true, type: "name", value: "Ram Lal" });
  assert.equal(parseSearchQuery("राम").value, "राम");
  for (const q of ["a", "", "   ", "x".repeat(41), "bad\u0000name", 42, null, undefined, {}])
    assert.equal(parseSearchQuery(q).ok, false, String(q));
});

test("httpsCodeFor maps to callable error codes and defaults safely", () => {
  assert.equal(httpsCodeFor("active-order"), "failed-precondition");
  assert.equal(httpsCodeFor("self-change"), "permission-denied");
  assert.equal(httpsCodeFor("target-missing"), "not-found");
  assert.equal(httpsCodeFor("anything-else"), "internal");
  assert.equal(validateInput({ actorUid: "a", targetUid: "b", makeDelivery: false }).ok, true);
});
