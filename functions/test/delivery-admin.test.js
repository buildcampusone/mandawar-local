const test = require("node:test");
const assert = require("node:assert/strict");
const { changeDeliveryRole, findUsers, listRiders, isAdmin } = require("../lib/delivery-admin");

// In-memory Firestore fake: docs, auto-id create, where/limit queries, transactions (reads before writes).
function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  let auto = 0;
  const docRef = (path) => ({
    path, id: path.split("/").pop(),
    async get() { return snap(path); }
  });
  const snap = (path) => ({
    id: path.split("/").pop(), exists: store.has(path),
    data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined)
  });
  const query = (col, filters = [], lim = Infinity) => ({
    where: (f, op, v) => query(col, [...filters, [f, op, v]], lim),
    limit: (n) => query(col, filters, n),
    async get() {
      const docs = [...store.keys()]
        .filter((p) => p.startsWith(col + "/") && !p.slice(col.length + 1).includes("/"))
        .filter((p) => filters.every(([f, op, v]) => {
          const x = store.get(p)[f];
          if (op === "==") return x === v;
          if (op === ">=") return typeof x === "string" && x >= v;
          if (op === "<") return typeof x === "string" && x < v;
          throw new Error("op " + op);
        }))
        .slice(0, lim).map(snap);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
  });
  const db = {
    store,
    collection: (c) => ({ ...query(c), doc: (id) => docRef(c + "/" + (id || "auto" + ++auto)) }),
    async runTransaction(fn) {
      const writes = []; let wrote = false;
      const tx = {
        async get(x) { if (wrote) throw new Error("read after write"); return x.path ? snap(x.path) : x.get(); },
        update(ref, patch) { wrote = true; if (!store.has(ref.path)) throw new Error("missing " + ref.path); writes.push(["u", ref.path, patch]); },
        create(ref, data) { wrote = true; if (store.has(ref.path)) throw new Error("exists"); writes.push(["c", ref.path, data]); }
      };
      const out = await fn(tx);
      for (const [k, p, d] of writes) store.set(p, k === "u" ? { ...store.get(p), ...d } : d);
      return out;
    }
  };
  return db;
}

const seed = () => ({
  "users/admin1": { name: "Admin", phone: "9000000001", role: "admin", status: "active" },
  "users/cust1": { name: "Ram Lal", phone: "9876543210", role: "customer", status: "active" },
  "users/cust2": { name: "Ramesh", phone: "9876543211", role: "customer", status: "active" },
  "users/rider1": { name: "Bheem", phone: "9811111111", role: "delivery", status: "active" },
  "users/shop1": { name: "Shyam Store", phone: "9822222222", role: "shopkeeper", status: "active" },
  "users/cust3": { name: "Nobody", phone: "9833333333", role: "customer", status: "active" }
});
const NOW = () => "TS";
const run = (db, o) => changeDeliveryRole({ db, now: NOW, actorUid: "admin1", ...o });
const audits = (db) => [...db.store.keys()].filter((k) => k.startsWith("roleAudit/"));

test("admin makes a customer a rider: only role changes, audit row written", async () => {
  const db = fakeDb(seed());
  const r = await run(db, { targetUid: "cust1", makeDelivery: true });
  assert.deepEqual(r, { ok: true, uid: "cust1", from: "customer", to: "delivery" });
  assert.deepEqual(db.store.get("users/cust1"), { name: "Ram Lal", phone: "9876543210", role: "delivery", status: "active" });
  const [a] = audits(db);
  assert.deepEqual(db.store.get(a), { actorUid: "admin1", targetUid: "cust1", from: "customer", to: "delivery", createdAt: "TS" });
});

test("non-admin caller is refused and nothing is written", async () => {
  const db = fakeDb(seed());
  for (const actor of ["cust2", "rider1", "shop1", "ghost"]) {
    const r = await run(db, { actorUid: actor, targetUid: "cust1", makeDelivery: true });
    assert.equal(r.code, "not-admin", actor);
  }
  assert.equal(db.store.get("users/cust1").role, "customer");
  assert.equal(audits(db).length, 0);
});

test("admin and shopkeeper targets are untouched", async () => {
  const db = fakeDb({ ...seed(), "users/admin2": { name: "A2", phone: "9000000002", role: "admin" } });
  for (const uid of ["admin2", "shop1"])
    for (const makeDelivery of [true, false])
      assert.equal((await run(db, { targetUid: uid, makeDelivery })).code, "protected-role");
  assert.equal(db.store.get("users/admin2").role, "admin");
  assert.equal(db.store.get("users/shop1").role, "shopkeeper");
  assert.equal(audits(db).length, 0);
});

test("admin cannot change own role", async () => {
  const db = fakeDb(seed());
  assert.equal((await run(db, { targetUid: "admin1", makeDelivery: true })).code, "self-change");
  assert.equal(db.store.get("users/admin1").role, "admin");
});

test("unknown target uid -> target-missing; bad input -> bad-input", async () => {
  const db = fakeDb(seed());
  assert.equal((await run(db, { targetUid: "nope", makeDelivery: true })).code, "target-missing");
  assert.equal((await run(db, { targetUid: "cust1", makeDelivery: "yes" })).code, "bad-input");
  assert.equal((await run(db, { targetUid: undefined, makeDelivery: true })).code, "bad-input");
});

test("removing a rider with no active order works", async () => {
  const db = fakeDb({ ...seed(), "orders/o1": { deliveryBoyId: "rider1", status: "delivered" }, "orders/o2": { deliveryBoyId: "other", status: "out_for_delivery" } });
  const r = await run(db, { targetUid: "rider1", makeDelivery: false });
  assert.deepEqual(r, { ok: true, uid: "rider1", from: "delivery", to: "customer" });
  assert.equal(db.store.get("users/rider1").role, "customer");
  assert.equal(audits(db).length, 1);
});

test("removing a rider with an out_for_delivery order is rejected, role and audit unchanged", async () => {
  const db = fakeDb({ ...seed(), "orders/o1": { deliveryBoyId: "rider1", status: "out_for_delivery" } });
  const r = await run(db, { targetUid: "rider1", makeDelivery: false });
  assert.equal(r.ok, false);
  assert.equal(r.code, "active-order");
  assert.equal(db.store.get("users/rider1").role, "delivery");
  assert.equal(audits(db).length, 0);
});

test("findUsers: phone is exact, returns only uid/name/phone/role/status", async () => {
  const s = seed(); s["users/cust1"].secret = "x"; s["users/cust1"].address = "home";
  const db = fakeDb(s);
  const out = await findUsers({ db, parsed: { type: "phone", value: "9876543210" } });
  assert.deepEqual(out, [{ uid: "cust1", name: "Ram Lal", phone: "9876543210", role: "customer", status: "active" }]);
});

test("findUsers: name prefix, also matches when typed in lower case, capped at 20", async () => {
  const s = seed();
  for (let i = 0; i < 30; i++) s["users/bulk" + i] = { name: "Ram" + i, phone: "9" + String(i).padStart(9, "0"), role: "customer" };
  const db = fakeDb(s);
  const lower = await findUsers({ db, parsed: { type: "name", value: "ramesh" } });
  assert.deepEqual(lower.map((u) => u.uid), ["cust2"]);
  const many = await findUsers({ db, parsed: { type: "name", value: "Ram" } });
  assert.equal(many.length, 20);
});

test("listRiders: only delivery role, sorted by name, shape is uid/name/phone/status", async () => {
  const s = seed(); s["users/rider2"] = { name: "Arjun", phone: "9844444444", role: "delivery", status: "active", address: "x" };
  const out = await listRiders({ db: fakeDb(s) });
  assert.deepEqual(out, [
    { uid: "rider2", name: "Arjun", phone: "9844444444", status: "active" },
    { uid: "rider1", name: "Bheem", phone: "9811111111", status: "active" }
  ]);
});

test("isAdmin reads the live role", async () => {
  const db = fakeDb(seed());
  assert.equal(await isAdmin(db, "admin1"), true);
  assert.equal(await isAdmin(db, "cust1"), false);
  assert.equal(await isAdmin(db, "ghost"), false);
  assert.equal(await isAdmin(db, ""), false);
});
