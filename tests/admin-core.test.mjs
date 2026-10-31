import test from "node:test";
import assert from "node:assert/strict";
import { stockState, filterInventory, inventorySummary, parseStock, adjustStock } from "../modules/admin/inventory-core.js";
import { rangeFor, summarize, dailySeries, topProducts, statusCounts, toDate, rupees } from "../modules/admin/analytics-core.js";
import { targetOptions, cleanBanner, moveBanner, nextBannerOrder, activeWarning, sortBanners } from "../modules/admin/banners-core.js";
import { cleanCoupon, discountFor, couponState, cleanCode } from "../modules/admin/coupons-core.js";

const P = (name, o = {}) => ({ id: name, name, price: 10, stock: 20, active: true, ...o });

// ---------------------------------------------------------------- inventory
test("stockState: 0 out, 1..5 low, above ok, junk counts as out", () => {
  assert.equal(stockState({ stock: 0 }), "out");
  assert.equal(stockState({ stock: 1 }), "low");
  assert.equal(stockState({ stock: 5 }), "low");
  assert.equal(stockState({ stock: 6 }), "ok");
  assert.equal(stockState({ stock: "x" }), "out");
  assert.equal(stockState(null), "out");
});

test("filterInventory: active first (out, low, rest A-Z), inactive last; filters combine", () => {
  const l = [P("Zeera"), P("Atta", { stock: 3 }), P("Besan", { stock: 0 }), P("Chana", { stock: 2, active: false }), P("Dal", { categoryId: "dal" })];
  assert.deepEqual(filterInventory(l).map((p) => p.name), ["Besan", "Atta", "Dal", "Zeera", "Chana"]);
  assert.deepEqual(filterInventory(l, { state: "low" }).map((p) => p.name), ["Atta"]);          // inactive Chana is not an alert
  assert.deepEqual(filterInventory(l, { state: "inactive" }).map((p) => p.name), ["Chana"]);
  assert.deepEqual(filterInventory(l, { q: " ZEE " }).map((p) => p.name), ["Zeera"]);
  assert.deepEqual(filterInventory(l, { categoryId: "dal" }).map((p) => p.name), ["Dal"]);
  assert.deepEqual(filterInventory(null), []);
});

test("inventorySummary counts only active products", () => {
  const s = inventorySummary([P("a", { stock: 0 }), P("b", { stock: 3, price: 100 }), P("c", { active: false, stock: 0 }), P("d", { stock: 10, price: 2.5 })]);
  assert.deepEqual(s, { total: 4, active: 3, out: 1, low: 1, stockValue: 325 });
});

test("parseStock / adjustStock keep stock a whole number in range", () => {
  assert.deepEqual(parseStock(" 12 "), { ok: true, value: 12 });
  assert.equal(parseStock("0").value, 0);
  for (const bad of ["", "-1", "1.5", "abc", "100001", "1e3", null]) assert.equal(parseStock(bad).ok, false, String(bad));
  assert.equal(adjustStock(0, -1), 0);
  assert.equal(adjustStock(5, 1), 6);
  assert.equal(adjustStock(100000, 1), 100000);
  assert.equal(adjustStock(undefined, 1), 1);
});

// ---------------------------------------------------------------- analytics
const NOW = new Date(2026, 9, 31, 15, 0);                 // 31 Oct 2026, 15:00 local
const at = (d, h = 12) => new Date(2026, 9, d, h, 0);
const O = (status, total, day, items = []) => ({ status, total, items, createdAt: at(day) });

test("rangeFor: today = since midnight, 7d = seven calendar days ending today", () => {
  const t = rangeFor("today", NOW);
  assert.equal(t.days, 1); assert.equal(t.start.getDate(), 31); assert.equal(t.end.getMonth(), 10);
  const w = rangeFor("7d", NOW);
  assert.equal(w.days, 7); assert.equal(w.start.getDate(), 25);
  assert.equal(rangeFor("nonsense", NOW).days, 7);
});

test("summarize: revenue is delivered only; lost = rejected + cancelled; outside range ignored", () => {
  const r = rangeFor("7d", NOW);
  const orders = [
    O("delivered", 100, 31, [{ qty: 2 }, { qty: 1 }]), O("delivered", 250, 30), O("placed", 999, 31), O("rejected", 50, 29), O("cancelled", 70, 28),
    O("delivered", 5000, 10),                              // too old
    { status: "delivered", total: 1, createdAt: null }, null
  ];
  const s = summarize(orders, r);
  assert.deepEqual(s, { orders: 5, delivered: 2, active: 1, lost: 2, revenue: 350, avgOrder: 175, cancelRate: 40, itemsSold: 3 });
  assert.deepEqual(summarize([], r), { orders: 0, delivered: 0, active: 0, lost: 0, revenue: 0, avgOrder: 0, cancelRate: 0, itemsSold: 0 });
});

test("dailySeries: one row per day, zero days kept, delivered only", () => {
  const rows = dailySeries([O("delivered", 100, 31), O("delivered", 40, 31), O("delivered", 60, 29), O("placed", 500, 30)], rangeFor("7d", NOW));
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((x) => x.label).slice(-3), ["29/10", "30/10", "31/10"]);
  assert.deepEqual(rows.slice(-3).map((x) => [x.orders, x.revenue]), [[1, 60], [0, 0], [2, 140]]);
});

test("topProducts: by units then revenue, delivered only, capped", () => {
  const it = (productId, qty, price) => ({ productId, name: productId.toUpperCase(), qty, price });
  const orders = [O("delivered", 0, 31, [it("a", 2, 10), it("b", 5, 3)]), O("delivered", 0, 30, [it("a", 3, 10)]), O("cancelled", 0, 30, [it("c", 99, 1)])];
  const top = topProducts(orders, rangeFor("7d", NOW), 2);
  assert.deepEqual(top.map((x) => [x.productId, x.qty, x.revenue]), [["a", 5, 50], ["b", 5, 15]]);
});

test("statusCounts keeps a fixed order and drops empty statuses", () => {
  assert.deepEqual(statusCounts([O("delivered", 1, 31), O("placed", 1, 31), O("delivered", 1, 30)], rangeFor("7d", NOW)),
    [{ status: "placed", count: 1 }, { status: "delivered", count: 2 }]);
});

test("toDate understands Date, Timestamp-like and ms; rupees groups the Indian way", () => {
  assert.equal(toDate({ toDate: () => at(1) }).getDate(), 1);
  assert.equal(toDate({ seconds: 86400 }).getTime(), 86400000);
  assert.equal(toDate(5).getTime(), 5);
  assert.equal(toDate("x"), null);
  assert.equal(rupees(123456), "Rs 1,23,456");
  assert.equal(rupees("junk"), "Rs 0");
});

// ---------------------------------------------------------------- banners
test("cleanBanner trims, drops empty optionals, enforces the rules' limits", () => {
  assert.deepEqual(cleanBanner({ title: "  Diwali   Sale ", subtitle: "", target: "deals" }), { data: { title: "Diwali Sale", target: "deals" } });
  assert.deepEqual(cleanBanner({ title: "Ab", subtitle: " 10% off ", target: "" }).data, { title: "Ab", subtitle: "10% off" });
  assert.ok(cleanBanner({ title: "A" }).error);
  assert.ok(cleanBanner({ title: "x".repeat(41) }).error);
  assert.ok(cleanBanner({ title: "Ok title", subtitle: "x".repeat(61) }).error);
});

test("targetOptions: fixed sections plus ACTIVE departments only", () => {
  const o = targetOptions([{ id: "atta-flour", name: "Atta", active: true }, { id: "old", name: "Old", active: false }]);
  assert.deepEqual(o.map((x) => x.value), ["", "deals", "best", "essentials", "atta-flour"]);
});

test("moveBanner swaps neighbours, renumbers ties, does nothing at the ends", () => {
  const l = [{ id: "a", order: 0 }, { id: "b", order: 1 }, { id: "c", order: 2 }];
  assert.deepEqual(moveBanner(l, "b", -1), [{ id: "b", order: 0 }, { id: "a", order: 1 }]);
  assert.deepEqual(moveBanner(l, "a", -1), []);
  assert.deepEqual(moveBanner(l, "c", 1), []);
  const ties = [{ id: "a", order: 5 }, { id: "b", order: 5 }];
  assert.deepEqual(moveBanner(ties, "b", -1), [{ id: "b", order: 0 }, { id: "a", order: 1 }]);
  assert.equal(nextBannerOrder(l), 3);
  assert.equal(nextBannerOrder([]), 0);
  assert.deepEqual(sortBanners([{ id: "x", order: 2 }, { id: "y" }, { id: "z", order: 1 }]).map((b) => b.id), ["z", "x", "y"]);
});

test("activeWarning only above six active banners", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: "b" + i, active: true }));
  assert.equal(activeWarning(mk(6)), "");
  assert.match(activeWarning(mk(7)), /7 active/);
});

// ---------------------------------------------------------------- coupons
const form = (o = {}) => ({ code: " save 10 ", type: "percent", value: "10", minOrder: "199", maxDiscount: "50", expiresAt: "", active: true, ...o });

test("cleanCoupon: normalises the code and builds exactly the fields the rules allow", () => {
  assert.equal(cleanCode(" save 10 "), "SAVE10");
  assert.deepEqual(cleanCoupon(form()), { code: "SAVE10", data: { code: "SAVE10", type: "percent", value: 10, minOrder: 199, active: true, maxDiscount: 50 } });
  const flat = cleanCoupon(form({ type: "flat", value: "30", maxDiscount: "9" }));
  assert.deepEqual(flat.data, { code: "SAVE10", type: "flat", value: 30, minOrder: 199, active: true });   // maxDiscount is percent-only
  assert.ok(cleanCoupon(form({ expiresAt: "2026-12-31" })).data.expiresAt instanceof Date);
});

test("cleanCoupon rejects bad input", () => {
  for (const bad of [
    { code: "ab" }, { code: "x".repeat(17) }, { code: "A-B-C" }, { type: "bogus" }, { value: "0" }, { value: "-5" },
    { value: "91" }, { value: "10.5" }, { type: "flat", value: "5001" }, { minOrder: "-1" }, { minOrder: "10001" },
    { maxDiscount: "0" }, { type: "flat", value: "300", minOrder: "100" }, { expiresAt: "not a date" }
  ]) assert.ok(cleanCoupon(form(bad)).error, JSON.stringify(bad));
});

test("discountFor: percent with cap, flat, minimum order, expiry, paused, never above subtotal", () => {
  const pct = { active: true, type: "percent", value: 10, minOrder: 200, maxDiscount: 50 };
  assert.deepEqual(discountFor(pct, 300), { ok: true, discount: 30 });
  assert.deepEqual(discountFor(pct, 1000), { ok: true, discount: 50 });          // capped
  assert.equal(discountFor(pct, 199).ok, false);                                  // below minimum
  assert.deepEqual(discountFor({ active: true, type: "flat", value: 80, minOrder: 0 }, 60), { ok: true, discount: 60 });
  assert.equal(discountFor({ ...pct, active: false }, 500).ok, false);
  const NOW = Date.UTC(2026, 9, 31);
  assert.equal(discountFor({ ...pct, expiresAt: new Date(NOW - 1) }, 500, NOW).ok, false);
  assert.equal(discountFor({ ...pct, expiresAt: new Date(NOW + 1) }, 500, NOW).ok, true);
  assert.equal(discountFor(pct, 0).ok, false);
  assert.equal(discountFor(null, 500).ok, false);
});

test("couponState: expired beats active; paused otherwise", () => {
  const NOW = 1000;
  assert.equal(couponState({ active: true, expiresAt: { seconds: 0 } }, NOW), "expired");
  assert.equal(couponState({ active: true }, NOW), "active");
  assert.equal(couponState({ active: false }, NOW), "paused");
});
