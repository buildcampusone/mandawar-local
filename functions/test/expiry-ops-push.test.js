const test = require("node:test"); const assert = require("node:assert/strict");
const { expiryReason, LIMITS } = require("../lib/expiry");
const ops = require("../lib/admin-ops");
const { pushForCreate, pushForUpdate } = require("../lib/push");
const M = 60000;

test("expiry: placed waits 15 min, accepted-without-rider 30 min, claimed orders never expire", () => {
  const base = { createdMs: 0, changedMs: 0 };
  assert.equal(expiryReason({ ...base, status: "placed", hasRider: false }, 14 * M), "");
  assert.equal(expiryReason({ ...base, status: "placed", hasRider: false }, 15 * M), "expired:no-response");
  assert.equal(expiryReason({ ...base, status: "accepted", hasRider: false }, 29 * M), "");
  assert.equal(expiryReason({ ...base, status: "accepted", hasRider: false }, 30 * M), "expired:no-rider");
  assert.equal(expiryReason({ ...base, status: "accepted", hasRider: true }, 99 * M), "");
  assert.equal(expiryReason({ ...base, status: "out_for_delivery", hasRider: true }, 999 * M), "");
  assert.equal(expiryReason({ status: "placed", createdMs: NaN, changedMs: 0 }, 99 * M), "", "bad data never cancels");
  assert.ok(LIMITS.placedMs < LIMITS.acceptedMs);
});

test("admin ops validators", () => {
  assert.equal(ops.checkCancel({ orderId: "abc123XYZ789" }).ok, true);
  assert.equal(ops.checkCancel({ orderId: "a/b" }).ok, false);
  assert.equal(ops.checkStatus({ targetUid: "u1", status: "blocked" }).ok, true);
  assert.equal(ops.checkStatus({ targetUid: "u1", status: "admin" }).ok, false);
});

test("push: who hears about what", () => {
  assert.equal(pushForCreate({ status: "placed", shopId: "main", total: 120, items: [1, 2] }, "o1")[0].target, "admins");
  const o = { customerUid: "C", shopId: "main", shopName: "Mandawar Mart", total: 50 };
  const acc = pushForUpdate({ ...o, status: "placed" }, { ...o, status: "accepted" }, "o1");
  assert.deepEqual(acc.map((x) => x.target), ["customer", "riders"]);
  assert.equal(pushForUpdate({ ...o, status: "placed" }, { ...o, status: "cancelled" }, "o1")[0].target, "admins");
  assert.equal(pushForUpdate({ ...o, status: "accepted" }, { ...o, status: "cancelled", cancelReason: "expired:no-rider" }, "o1")[0].target, "customer");
  assert.deepEqual(pushForUpdate({ ...o, status: "out_for_delivery" }, { ...o, status: "accepted" }, "o1").map((x) => x.target), ["riders"]);
  assert.deepEqual(pushForUpdate({ ...o, status: "placed" }, { ...o, status: "placed" }, "o1"), []);
});
