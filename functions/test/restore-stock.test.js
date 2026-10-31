const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldRestore, restoreStockForOrder, qtyByProduct } = require("../lib/restore-stock");

// Minimal in-memory Firestore fake: collection/doc paths, runTransaction with read-then-write check.
function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  const mk = (path) => ({ path, collection: (c) => mkCol(path + "/" + c) });
  const mkCol = (path) => ({ doc: (id) => mk(path + "/" + id), collection: undefined });
  const db = {
    store,
    collection: (c) => mkCol(c),
    async runTransaction(fn) {
      const writes = []; let wrote = false;
      const tx = {
        async get(ref) {
          if (wrote) throw new Error("read after write");
          const has = store.has(ref.path);
          return { exists: has, data: () => (has ? structuredClone(store.get(ref.path)) : undefined) };
        },
        update(ref, patch) {
          wrote = true;
          if (!store.has(ref.path)) throw new Error("update of missing doc " + ref.path);
          writes.push([ref.path, patch]);
        }
      };
      const out = await fn(tx);
      writes.forEach(([p, patch]) => store.set(p, { ...store.get(p), ...patch }));
      return out;
    }
  };
  return db;
}
const now = () => "TS";
const order = (over = {}) => ({
  shopId: "main", status: "rejected",
  items: [{ productId: "a", qty: 2 }, { productId: "b", qty: 1 }], ...over
});
const seed = (o) => ({
  "orders/O1": o, "products/a": { stock: 3 }, "products/b": { stock: 0 }
});

test("shouldRestore: only on transition into rejected/cancelled", () => {
  assert.equal(shouldRestore({ status: "placed" }, { status: "rejected" }), true);
  assert.equal(shouldRestore({ status: "placed" }, { status: "cancelled" }), true);
  assert.equal(shouldRestore({ status: "placed" }, { status: "accepted" }), false);
  assert.equal(shouldRestore({ status: "accepted" }, { status: "out_for_delivery" }), false);
  assert.equal(shouldRestore({ status: "rejected" }, { status: "rejected", x: 1 }), false);
  assert.equal(shouldRestore(undefined, { status: "rejected" }), false);
});

test("restores stock and marks the order", async () => {
  const db = fakeDb(seed(order()));
  const r = await restoreStockForOrder({ db, orderId: "O1", now });
  assert.equal(r.restored, true);
  assert.equal(db.store.get("products/a").stock, 5);
  assert.equal(db.store.get("products/b").stock, 1);
  assert.equal(db.store.get("orders/O1").stockRestoredAt, "TS");
});

test("idempotent: a retried event does not restore twice", async () => {
  const db = fakeDb(seed(order()));
  await restoreStockForOrder({ db, orderId: "O1", now });
  const r = await restoreStockForOrder({ db, orderId: "O1", now });
  assert.deepEqual(r, { restored: false, reason: "already-restored" });
  assert.equal(db.store.get("products/a").stock, 5);
});

test("skips orders that are not closed (stale event)", async () => {
  const db = fakeDb(seed(order({ status: "placed" })));
  const r = await restoreStockForOrder({ db, orderId: "O1", now });
  assert.equal(r.reason, "not-closed");
  assert.equal(db.store.get("products/a").stock, 3);
});

test("deleted product is skipped, others still restored", async () => {
  const s = seed(order()); delete s["products/b"];
  const db = fakeDb(s);
  const r = await restoreStockForOrder({ db, orderId: "O1", now });
  assert.deepEqual(r.products, ["a"]);
  assert.equal(db.store.get("products/a").stock, 5);
});

test("stock never exceeds the 100000 cap", async () => {
  const s = seed(order()); s["products/a"] = { stock: 99999 };
  const db = fakeDb(s);
  await restoreStockForOrder({ db, orderId: "O1", now });
  assert.equal(db.store.get("products/a").stock, 100000);
});

test("malformed items are ignored; duplicate productIds are summed", () => {
  const m = qtyByProduct([{ productId: "a", qty: 1 }, { productId: "a", qty: 2 },
    { productId: "", qty: 1 }, { productId: "b", qty: 0 }, { productId: "c", qty: 1.5 }, null]);
  assert.deepEqual([...m], [["a", 3]]);
});

test("missing order is a no-op", async () => {
  const r = await restoreStockForOrder({ db: fakeDb({}), orderId: "NOPE", now });
  assert.equal(r.reason, "order-missing");
});
