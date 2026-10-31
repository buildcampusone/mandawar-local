const test = require("node:test");
const assert = require("node:assert/strict");
const { toPaise, parseRatePercent, computeCommissionPaise, shouldRecord, recordCommissionForOrder } = require("../lib/commission");

function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  const mk = (path) => ({ path, collection: (c) => ({ doc: (id) => mk(path + "/" + id) }) });
  return {
    store,
    collection: (c) => ({ doc: (id) => mk(c + "/" + id) }),
    async runTransaction(fn) {
      const writes = []; let wrote = false;
      const tx = {
        async get(ref) {
          if (wrote) throw new Error("read after write");
          const has = store.has(ref.path);
          return { exists: has, data: () => (has ? structuredClone(store.get(ref.path)) : undefined) };
        },
        set(ref, data) { wrote = true; writes.push([ref.path, data]); }
      };
      const out = await fn(tx);
      writes.forEach(([p, d]) => store.set(p, d));
      return out;
    }
  };
}
const now = () => "TS";
const base = (o = {}) => ({ "orders/O1": { shopId: "S1", status: "delivered", total: 250, paymentMethod: "COD", ...o } });

test("money helpers", () => {
  assert.equal(toPaise(199.99), 19999);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(toPaise(-1), null); assert.equal(toPaise("5"), null); assert.equal(toPaise(NaN), null);
  assert.equal(parseRatePercent(null), 0);
  assert.equal(parseRatePercent({ commissionPercent: 5 }), 5);
  assert.equal(parseRatePercent({ commissionPercent: -1 }), 0);
  assert.equal(parseRatePercent({ commissionPercent: 101 }), 0);
  assert.equal(parseRatePercent({ commissionPercent: "5" }), 0);
  assert.equal(computeCommissionPaise(25000, 5), 1250);
  assert.equal(computeCommissionPaise(3333, 2.5), 83); // 83.325 -> 83
  assert.equal(computeCommissionPaise(25000, 0), 0);
});

test("shouldRecord: only on transition into delivered", () => {
  assert.equal(shouldRecord({ status: "out_for_delivery" }, { status: "delivered" }), true);
  assert.equal(shouldRecord({ status: "delivered" }, { status: "delivered" }), false);
  assert.equal(shouldRecord({ status: "placed" }, { status: "accepted" }), false);
  assert.equal(shouldRecord(undefined, { status: "delivered" }), false);
});

test("records ledger row and creates wallet", async () => {
  const db = fakeDb({ ...base(), "config/platform": { commissionPercent: 5 } });
  const r = await recordCommissionForOrder({ db, orderId: "O1", now });
  assert.deepEqual(r, { recorded: true, commissionPaise: 1250, ratePercent: 5 });
  assert.deepEqual(db.store.get("ledger/O1"), {
    orderId: "O1", shopId: "S1", type: "commission", paymentMethod: "COD",
    orderTotalPaise: 25000, itemsPaise: 25000, deliveryFeePaise: 0, riderId: null,
    ratePercent: 5, commissionPaise: 1250, createdAt: "TS"
  });
  assert.deepEqual(db.store.get("wallets/S1"), {
    shopId: "S1", commissionDuePaise: 1250, totalCommissionPaise: 1250,
    totalSalesPaise: 25000, deliveredOrders: 1, updatedAt: "TS"
  });
});

test("accumulates into an existing wallet", async () => {
  const db = fakeDb({ ...base(), "config/platform": { commissionPercent: 10 },
    "wallets/S1": { shopId: "S1", commissionDuePaise: 500, totalCommissionPaise: 900, totalSalesPaise: 9000, deliveredOrders: 4 } });
  await recordCommissionForOrder({ db, orderId: "O1", now });
  const w = db.store.get("wallets/S1");
  assert.equal(w.commissionDuePaise, 3000); // 500 + 2500
  assert.equal(w.totalCommissionPaise, 3400);
  assert.equal(w.totalSalesPaise, 34000);
  assert.equal(w.deliveredOrders, 5);
});

test("idempotent: a retried event is not counted twice", async () => {
  const db = fakeDb({ ...base(), "config/platform": { commissionPercent: 5 } });
  await recordCommissionForOrder({ db, orderId: "O1", now });
  const r = await recordCommissionForOrder({ db, orderId: "O1", now });
  assert.equal(r.reason, "already-recorded");
  assert.equal(db.store.get("wallets/S1").deliveredOrders, 1);
  assert.equal(db.store.get("wallets/S1").commissionDuePaise, 1250);
});

test("no config doc => 0% commission, still recorded", async () => {
  const db = fakeDb(base());
  const r = await recordCommissionForOrder({ db, orderId: "O1", now });
  assert.equal(r.commissionPaise, 0);
  assert.equal(db.store.get("wallets/S1").totalSalesPaise, 25000);
});

test("skips: not delivered, missing order, bad total, non-COD", async () => {
  const run = (seed) => recordCommissionForOrder({ db: fakeDb(seed), orderId: "O1", now });
  assert.equal((await run(base({ status: "accepted" }))).reason, "not-delivered");
  assert.equal((await run({})).reason, "order-missing");
  assert.equal((await run(base({ total: -5 }))).reason, "bad-total");
  assert.equal((await run(base({ paymentMethod: "ONLINE" }))).reason, "unsupported-payment-method");
  assert.equal((await run(base({ shopId: "" }))).reason, "no-shop");
});

test("delivery fee is not part of commission or shop sales; rider is recorded", async () => {
  const db = fakeDb({ ...base({ subtotal: 250, deliveryFee: 30, total: 280, deliveryBoyId: "R1" }),
    "config/platform": { commissionPercent: 10 } });
  const r = await recordCommissionForOrder({ db, orderId: "O1", now });
  assert.deepEqual(r, { recorded: true, commissionPaise: 2500, ratePercent: 10 }); // 10% of 250, not of 280
  const row = db.store.get("ledger/O1");
  assert.equal(row.orderTotalPaise, 28000);
  assert.equal(row.itemsPaise, 25000);
  assert.equal(row.deliveryFeePaise, 3000);
  assert.equal(row.riderId, "R1");
  assert.equal(db.store.get("wallets/S1").totalSalesPaise, 25000);
});

test("subtotal + deliveryFee must equal total, otherwise nothing is recorded", async () => {
  const run = (o) => recordCommissionForOrder({ db: fakeDb(base(o)), orderId: "O1", now });
  assert.equal((await run({ subtotal: 250, deliveryFee: 30, total: 250 })).reason, "bad-total");
  assert.equal((await run({ subtotal: 250, total: 250 })).reason, "bad-total");        // fee missing but subtotal present
  assert.equal((await run({ subtotal: -1, deliveryFee: 0, total: 250 })).reason, "bad-total");
});
