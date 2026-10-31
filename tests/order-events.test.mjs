import test from "node:test";
import assert from "node:assert/strict";
import { createWatcher, messageFor, pendingCount } from "../shared/services/order-events.js";

const o = (id, status, extra = {}) => ({ id, status, total: 250, items: [{}, {}], shopName: "Sharma Kirana", ...extra });

test("shopkeeper: the first server snapshot is a silent baseline", () => {
  const w = createWatcher("shopkeeper");
  assert.deepEqual(w.feed([o("a", "placed"), o("b", "accepted")], { fromCache: false }), []);
  assert.equal(w.isReady(), true);
});

test("shopkeeper: a cached first snapshot does not count; the server one after it is the baseline", () => {
  const w = createWatcher("shopkeeper");
  assert.deepEqual(w.feed([o("a", "placed")], { fromCache: true }), []);
  assert.equal(w.isReady(), false);
  assert.deepEqual(w.feed([o("a", "placed"), o("b", "placed")], { fromCache: false }), []);   // b arrived while closed: baseline, no replay
  const ev = w.feed([o("a", "placed"), o("b", "placed"), o("c", "placed")]);
  assert.deepEqual(ev.map((e) => [e.type, e.order.id]), [["new-order", "c"]]);
});

test("shopkeeper: customer cancelling is announced, own accept/reject is not", () => {
  const w = createWatcher("shopkeeper");
  w.feed([o("a", "placed"), o("b", "placed")]);
  const ev = w.feed([o("a", "cancelled"), o("b", "accepted")]);
  assert.deepEqual(ev.map((e) => [e.type, e.order.id]), [["cancelled", "a"]]);
});

test("the same change is announced only once", () => {
  const w = createWatcher("shopkeeper");
  w.feed([]);
  assert.equal(w.feed([o("a", "placed")]).length, 1);
  assert.equal(w.feed([o("a", "placed")]).length, 0);
});

test("customer: accepted / rejected / out_for_delivery / delivered are announced, own cancel and new order are not", () => {
  const w = createWatcher("customer");
  w.feed([o("a", "placed"), o("b", "placed"), o("c", "placed"), o("d", "placed")]);
  const ev = w.feed([o("a", "accepted"), o("b", "rejected"), o("c", "cancelled"), o("d", "placed"), o("e", "placed")]);
  assert.deepEqual(ev.map((e) => e.to), ["accepted", "rejected"]);
  assert.equal(w.feed([o("a", "out_for_delivery")])[0].to, "out_for_delivery");
  assert.equal(w.feed([o("a", "delivered")])[0].to, "delivered");
});

test("bad input never throws", () => {
  const w = createWatcher("customer");
  assert.deepEqual(w.feed(null), []);
  assert.deepEqual(w.feed(undefined), []);
});

test("messageFor: Hinglish text, tone and tag", () => {
  const n = messageFor({ type: "new-order", order: o("abc123def", "placed") });
  assert.equal(n.title, "Naya order aaya!");
  assert.match(n.body, /₹250/); assert.match(n.body, /2 items/);
  assert.equal(n.tag, "abc123def");
  assert.equal(messageFor({ type: "status", to: "rejected", order: o("x1y2z3", "rejected") }).tone, "bad");
  assert.match(messageFor({ type: "status", to: "delivered", order: o("x1y2z3", "delivered") }).body, /Sharma Kirana/);
  assert.equal(messageFor({ type: "cancelled", order: o("q", "cancelled") }).tone, "bad");
  assert.equal(messageFor({ type: "new-order", order: { id: "z", items: [{}] } }).body.includes("1 item"), true);
});

test("pendingCount counts only placed orders", () => {
  assert.equal(pendingCount([o("a", "placed"), o("b", "accepted"), o("c", "placed")]), 2);
  assert.equal(pendingCount(null), 0);
});

test("rider: an order that becomes accepted (or appears accepted) is announced once; claimed orders are not", () => {
  const w = createWatcher("rider");
  w.feed([o("a", "accepted")]);                                   // baseline
  assert.deepEqual(w.feed([o("a", "accepted"), o("b", "accepted")]).map((e) => [e.type, e.order.id]), [["new-delivery", "b"]]);
  assert.deepEqual(w.feed([o("a", "accepted"), o("b", "accepted")]), []);
  assert.equal(messageFor({ type: "new-delivery", order: o("b", "accepted") }).title, "Naya delivery order!");
});
