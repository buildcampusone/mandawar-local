const test = require("node:test");
const assert = require("node:assert/strict");
const { decide, enforceOrderLimits, LIMITS } = require("../lib/abuse");

test("decide: normal customers pass, flooding is blocked", () => {
  assert.equal(decide({ recentOthers: 0, openOthers: 0 }).block, false);
  assert.equal(decide({ recentOthers: LIMITS.maxRecent - 1, openOthers: LIMITS.maxOpen - 1 }).block, false);
  assert.deepEqual(decide({ recentOthers: 0, openOthers: LIMITS.maxOpen }), { block: true, reason: "too-many-open" });
  assert.deepEqual(decide({ recentOthers: LIMITS.maxRecent, openOthers: 0 }), { block: true, reason: "too-many-recent" });
});

test("decide: bad numbers never cancel an order", () => {
  for (const bad of [{ recentOthers: -1, openOthers: 0 }, { recentOthers: 1.5, openOthers: 0 }, { recentOthers: "9", openOthers: 0 }, {}])
    assert.equal(decide(bad).block, false);
});

function fakeDb({ recent, open }) {
  const updates = [];
  const q = (kind) => ({
    where(field) { return q(field === "createdAt" ? "recent" : field === "status" ? "open" : kind); },
    count() { return { get: async () => ({ data: () => ({ count: kind === "recent" ? recent : open }) }) }; }
  });
  return {
    updates,
    collection: () => ({ where: () => q("base"), doc: (id) => ({ update: async (d) => updates.push([id, d]) }) })
  };
}
const order = { customerUid: "C1", status: "placed" };

test("enforce: flood -> the new order is cancelled with a reason", async () => {
  const db = fakeDb({ recent: 7, open: 2 });          // includes itself: 6 others in the window
  const r = await enforceOrderLimits({ db, orderId: "O9", order });
  assert.equal(r.block, true);
  assert.deepEqual(db.updates, [["O9", { status: "cancelled", cancelReason: "abuse-limit:too-many-recent" }]]);
});

test("enforce: normal order is left alone; non-placed or malformed orders are skipped", async () => {
  const db = fakeDb({ recent: 1, open: 1 });
  assert.equal((await enforceOrderLimits({ db, orderId: "O1", order })).block, false);
  assert.equal(db.updates.length, 0);
  assert.equal((await enforceOrderLimits({ db, orderId: "O1", order: { ...order, status: "accepted" } })).checked, false);
  assert.equal((await enforceOrderLimits({ db, orderId: "O1", order: {} })).checked, false);
});
