import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCart, blockReason } from "../modules/customer/cart-core.js";

const P = (o = {}) => ({ name: "Atta", price: 55.5, unit: "kg", stock: 10, active: true, ...o });
const cart = (...ids) => ids.map((id, i) => ({ productId: id, qty: i + 1 }));

test("all fine: totals add up with paise-safe rounding", () => {
  const s = summarizeCart([{ productId: "a", qty: 3 }], new Map([["a", P({ price: 0.1 })]]));
  assert.equal(s.total, 0.3);
  assert.equal(s.canOrder, true);
  assert.equal(s.problems, 0);
});

test("missing or inactive product is unavailable and blocks ordering", () => {
  const s = summarizeCart(cart("a", "b"), new Map([["a", P()], ["b", null]]));
  assert.equal(s.lines[1].status, "unavailable");
  assert.equal(s.canOrder, false);
  assert.equal(summarizeCart(cart("a"), new Map([["a", P({ active: false })]])).lines[0].status, "unavailable");
});

test("sold out and low stock are told apart, and neither counts in the total", () => {
  const s = summarizeCart([{ productId: "a", qty: 2 }, { productId: "b", qty: 5 }, { productId: "c", qty: 1 }],
    new Map([["a", P({ stock: 0 })], ["b", P({ stock: 3 })], ["c", P()]]));
  assert.deepEqual(s.lines.map((l) => l.status), ["soldout", "low-stock", "ok"]);
  assert.equal(s.total, 55.5);
  assert.equal(s.problems, 2);
});

test("exactly the stock is fine", () => {
  assert.equal(summarizeCart([{ productId: "a", qty: 10 }], new Map([["a", P()]])).lines[0].status, "ok");
});

test("empty cart cannot be ordered", () => {
  const s = summarizeCart([], new Map());
  assert.equal(s.canOrder, false);
  assert.equal(s.total, 0);
});

test("blockReason: empty, offline, problems, fine", () => {
  const ok = summarizeCart([{ productId: "a", qty: 1 }], new Map([["a", P()]]));
  const bad = summarizeCart([{ productId: "a", qty: 1 }], new Map([["a", null]]));
  assert.match(blockReason({ summary: summarizeCart([], new Map()), online: true }), /khali/);
  assert.match(blockReason({ summary: ok, online: false }), /Internet/);
  assert.match(blockReason({ summary: bad, online: true }), /hatayein/);
  assert.equal(blockReason({ summary: ok, online: true }), "");
  assert.equal(blockReason({ summary: ok }), "");
});

import { deliveryQuote, blockReason as _block, summarizeCart as _sum } from "../modules/customer/cart-core.js";

test("deliveryQuote: fee and minimum come from the shop, bad or missing settings mean 0", () => {
  assert.deepEqual(deliveryQuote({ delivery: { deliveryFee: 30, minimumOrderAmount: 200 } }, 250),
    { fee: 30, min: 200, items: 250, total: 280, belowMin: false, shortBy: 0 });
  const low = deliveryQuote({ delivery: { deliveryFee: 30, minimumOrderAmount: 200 } }, 150);
  assert.equal(low.belowMin, true); assert.equal(low.shortBy, 50);
  for (const shop of [null, {}, { delivery: null }, { delivery: { deliveryFee: -5, minimumOrderAmount: "x" } }])
    assert.deepEqual(deliveryQuote(shop, 100), { fee: 0, min: 0, items: 100, total: 100, belowMin: false, shortBy: 0 });
});

test("blockReason: below the shop minimum disables ordering with the shortfall", () => {
  const summary = _sum([{ productId: "p", qty: 1 }], new Map([["p", { active: true, stock: 5, name: "X", price: 150, unit: "kg" }]]));
  const quote = deliveryQuote({ delivery: { minimumOrderAmount: 200 } }, summary.total);
  assert.match(_block({ summary, online: true, quote }), /minimum order ₹200.*₹50/);
  assert.equal(_block({ summary, online: true, quote: deliveryQuote({}, summary.total) }), "");
});
