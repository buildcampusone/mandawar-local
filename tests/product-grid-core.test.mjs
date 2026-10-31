import test from "node:test";
import assert from "node:assert/strict";
import {
  sortProducts, groupProducts, filterProducts, discountInfo, badgeFor, addCheck, cartSummary, DEFAULT_GROUP
} from "../modules/customer/product-grid-core.js";

const P = (o) => ({ id: o.name, price: 20, unit: "packet", stock: 10, active: true, ...o });

const D = (id, name) => ({ id, name, active: true });
const DEPTS = [D("dry", "Dry Fruits & Nuts"), D("masala", "Masala & Spices"), D("oil", "Oil & Ghee")];

test("groupProducts: departments in shelf order, empty ones skipped, the rest last under the default heading", () => {
  const g = groupProducts([
    P({ name: "Atta" }), P({ name: "Kaju", categoryId: "dry" }), P({ name: "Haldi", categoryId: "masala" }),
    P({ name: "Badam", categoryId: "dry" }), P({ name: "Old", categoryId: "gone" })
  ], DEPTS);
  assert.deepEqual(g.map((x) => x.title), ["Dry Fruits & Nuts", "Masala & Spices", DEFAULT_GROUP]);
  assert.deepEqual(g.map((x) => x.id), ["dry", "masala", ""]);
  assert.deepEqual(g[0].items.map((p) => p.name), ["Kaju", "Badam"]);
  assert.deepEqual(g[2].items.map((p) => p.name), ["Atta", "Old"]);     // no department, or a missing / inactive one
});

test("groupProducts: no departments at all keeps every product, under the default heading", () => {
  const g = groupProducts([P({ name: "A", categoryId: "dry" }), P({ name: "B" })], []);
  assert.deepEqual(g.map((x) => x.title), [DEFAULT_GROUP]);
  assert.equal(g[0].items.length, 2);
  assert.deepEqual(groupProducts([], DEPTS), []);
});

test("sortProducts puts sold-out items last", () => {
  const s = sortProducts([P({ name: "B", stock: 0 }), P({ name: "C" }), P({ name: "A" })]);
  assert.deepEqual(s.map((p) => p.name), ["A", "C", "B"]);
});

test("filterProducts matches name or department name, case-insensitive", () => {
  const l = [P({ name: "Kaju", categoryId: "dry" }), P({ name: "Atta" })];
  assert.deepEqual(filterProducts(l, "KAJ", DEPTS).map((p) => p.name), ["Kaju"]);
  assert.deepEqual(filterProducts(l, "dry", DEPTS).map((p) => p.name), ["Kaju"]);
  assert.deepEqual(filterProducts(l, "dry").map((p) => p.name), [], "department name needs the departments list");
  assert.equal(filterProducts(l, "  ", DEPTS).length, 2);
});

test("discountInfo needs mrp above price", () => {
  assert.deepEqual(discountInfo({ price: 22, mrp: 29 }), { off: 24, save: 7 });
  assert.equal(discountInfo({ price: 29, mrp: 29 }), null);
  assert.equal(discountInfo({ price: 30, mrp: 29 }), null);
  assert.equal(discountInfo({ price: 20 }), null);
  assert.equal(discountInfo({ price: 99.8, mrp: 100 }), null);   // under 1% is not shown
});

test("badgeFor: discount rotates, sold out and low stock are flagged, plain items have none", () => {
  const d = P({ name: "d", price: 22, mrp: 29 });
  assert.deepEqual(badgeFor(d, 0), { label: "Discount", value: "24% OFF", tone: "good" });
  assert.deepEqual(badgeFor(d, 1), { label: "You Save", value: "₹7", tone: "good" });
  assert.equal(badgeFor(P({ name: "x", stock: 0 })).label, "Stock khatam");
  assert.equal(badgeFor(P({ name: "x", stock: 3 })).label, "Sirf 3 bache");
  assert.equal(badgeFor(P({ name: "x" })), null);
});

test("addCheck respects stock and max quantity", () => {
  assert.equal(addCheck(P({ name: "a" }), 0, 20), "");
  assert.match(addCheck(P({ name: "a", stock: 0 }), 0, 20), /khatam/);
  assert.match(addCheck(P({ name: "a", stock: 3 }), 3, 20), /sirf 3/i);
  assert.match(addCheck(P({ name: "a", stock: 50 }), 20, 20), /20/);
});

test("cartSummary only counts the open store and skips unavailable items", () => {
  const prods = new Map([["a", P({ name: "a", price: 22 })], ["b", P({ name: "b", price: 10, stock: 0 })]]);
  const items = [{ productId: "a", qty: 2 }, { productId: "b", qty: 1 }];
  assert.deepEqual(cartSummary(items, "main", "main", prods), { count: 2, total: 44 });
  assert.deepEqual(cartSummary(items, "old-shop", "main", prods), { count: 0, total: 0 });
  assert.deepEqual(cartSummary([], null, null, prods), { count: 0, total: 0 });
});
