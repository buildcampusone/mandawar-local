const test = require("node:test");
const assert = require("node:assert/strict");
const { aggregateOrders, listCustomers, MAX_CUSTOMERS } = require("../lib/customers-admin");

// Minimal Firestore fake: where(==) / orderBy(desc) / limit / get.
function fakeDb(seed) {
  const query = (col, filters = [], desc = null, lim = Infinity) => ({
    where: (f, op, v) => { assert.equal(op, "=="); return query(col, [...filters, [f, v]], desc, lim); },
    orderBy: (f, dir) => query(col, filters, [f, dir], lim),
    limit: (n) => query(col, filters, desc, n),
    async get() {
      let rows = Object.entries(seed).filter(([p]) => p.startsWith(col + "/")).map(([p, d]) => ({ id: p.split("/")[1], d }));
      rows = rows.filter((r) => filters.every(([f, v]) => r.d[f] === v));
      if (desc) rows.sort((a, b) => (desc[1] === "desc" ? -1 : 1) * ((a.d[desc[0]] || 0) - (b.d[desc[0]] || 0)));
      const docs = rows.slice(0, lim).map((r) => ({ id: r.id, data: () => structuredClone(r.d) }));
      return { docs, size: docs.length };
    }
  });
  return { collection: (c) => query(c) };
}

const seed = () => ({
  "users/c1": { name: "Ram", phone: "9876543210", role: "customer", status: "active", createdAt: 100, email: "secret@x.in", address: "hidden" },
  "users/c2": { name: "Sita", phone: "9876543211", role: "customer", status: "blocked", createdAt: 300 },
  "users/c3": { name: "Gita", phone: "9876543212", role: "customer", createdAt: 200 },
  "users/r1": { name: "Rider", phone: "9811111111", role: "delivery", status: "active", createdAt: 50 },
  "users/a1": { name: "Owner", phone: "9000000001", role: "admin", status: "active", createdAt: 10 },
  "orders/o1": { customerUid: "c1", status: "delivered", total: 120, createdAt: 1000 },
  "orders/o2": { customerUid: "c1", status: "delivered", total: 80.4, createdAt: 2000 },
  "orders/o3": { customerUid: "c1", status: "placed", total: 999, createdAt: 3000 },
  "orders/o4": { customerUid: "c1", status: "cancelled", total: 500, createdAt: 4000 },
  "orders/o5": { customerUid: "c2", status: "rejected", total: 70, createdAt: 5000 }
});

test("aggregateOrders: cancelled / rejected are not orders, only delivered counts as spend", () => {
  const m = aggregateOrders(Object.values(seed()).filter((x) => x.customerUid));
  assert.deepEqual(m.get("c1"), { orders: 3, delivered: 2, spent: 200.4, lastOrderAt: 3000 });
  assert.equal(m.has("c2"), false);
});

test("aggregateOrders survives junk rows and Firestore timestamp shapes", () => {
  const m = aggregateOrders([null, {}, { customerUid: 5 }, { customerUid: "x", status: "delivered", total: "abc", createdAt: { _seconds: 2 } }]);
  assert.deepEqual(m.get("x"), { orders: 1, delivered: 1, spent: 0, lastOrderAt: 2000 });
});

test("listCustomers: customers only, newest first, stats merged, no private fields", async () => {
  const { customers, truncated } = await listCustomers({ db: fakeDb(seed()) });
  assert.deepEqual(customers.map((c) => c.uid), ["c2", "c3", "c1"]);
  assert.deepEqual(customers.find((c) => c.uid === "c1"), {
    uid: "c1", name: "Ram", phone: "9876543210", status: "active", joinedAt: 100, orders: 3, delivered: 2, spent: 200, lastOrderAt: 3000
  });
  assert.equal(customers.find((c) => c.uid === "c3").status, "active");           // missing status = active
  assert.equal(customers.find((c) => c.uid === "c2").status, "blocked");
  assert.deepEqual(customers.find((c) => c.uid === "c3"), {
    uid: "c3", name: "Gita", phone: "9876543212", status: "active", joinedAt: 200, orders: 0, delivered: 0, spent: 0, lastOrderAt: 0
  });
  for (const c of customers) assert.deepEqual(Object.keys(c).sort(), ["delivered", "joinedAt", "lastOrderAt", "name", "orders", "phone", "spent", "status", "uid"]);
  assert.equal(truncated, false);
});

test("listCustomers flags truncation at the cap", async () => {
  const big = {};
  for (let i = 0; i < MAX_CUSTOMERS + 5; i++) big["users/u" + i] = { name: "U" + i, phone: "9000000000", role: "customer", createdAt: i };
  const { customers, truncated } = await listCustomers({ db: fakeDb(big) });
  assert.equal(customers.length, MAX_CUSTOMERS);
  assert.equal(truncated, true);
});
