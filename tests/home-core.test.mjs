import test from "node:test";
import assert from "node:assert/strict";
import {
  dealsOf, flagged, dailyEssentials, previouslyBought, buildHome, activeBanners, locationLabel, lastOrder, deliveryLine, tileLetter, MAX_SPECIAL
} from "../modules/customer/home-core.js";

const P = (id, o = {}) => ({ id, name: id, price: 50, unit: "packet", stock: 5, active: true, ...o });
const D = (id) => ({ id, name: id.toUpperCase(), active: true });

test("dealsOf: only real discounts in stock, biggest first, capped", () => {
  const out = dealsOf([P("a", { mrp: 60 }), P("b", { mrp: 100 }), P("c"), P("d", { mrp: 90, stock: 0 }), P("e", { mrp: 50 })]);
  assert.deepEqual(out.map((p) => p.id), ["b", "a"]);
  const many = Array.from({ length: 30 }, (_, i) => P("p" + i, { mrp: 80 }));
  assert.equal(dealsOf(many).length, MAX_SPECIAL);
});

test("flagged: only owner-flagged, in-stock products", () => {
  const l = [P("a", { bestSeller: true }), P("b", { bestSeller: true, stock: 0 }), P("c"), P("d", { featured: true })];
  assert.deepEqual(flagged(l, "bestSeller").map((p) => p.id), ["a"]);
  assert.deepEqual(flagged(l, "featured").map((p) => p.id), ["d"]);
});

test("dailyEssentials: only staple departments that exist", () => {
  const l = [P("a", { categoryId: "atta-flour" }), P("b", { categoryId: "beverages" }), P("c", { categoryId: "rice-grains" }), P("d")];
  assert.deepEqual(dailyEssentials(l, [D("atta-flour"), D("beverages")]).map((p) => p.id), ["a"]);
  assert.deepEqual(dailyEssentials(l, []).map((p) => p.id), []);
});

test("previouslyBought: most ordered first, then most recent; skips cancelled and gone products", () => {
  const products = [P("a"), P("b"), P("c"), P("gone", { active: false }), P("out", { stock: 0 })];
  const orders = [   // newest first
    { status: "delivered", items: [{ productId: "b" }, { productId: "gone" }] },
    { status: "cancelled", items: [{ productId: "c" }, { productId: "c" }] },
    { status: "delivered", items: [{ productId: "a" }, { productId: "b" }, { productId: "out" }] },
    { status: "placed", items: [{ productId: "a" }, { productId: "a" }] }       // twice in one order counts once
  ];
  assert.deepEqual(previouslyBought(orders, products).map((p) => p.id), ["b", "a"]);
  assert.deepEqual(previouslyBought([], products), []);
  assert.deepEqual(previouslyBought([{ status: "delivered", items: "bad" }, null], products), []);
});

test("previouslyBought: repeat purchase beats recency", () => {
  const orders = [
    { status: "delivered", items: [{ productId: "new" }] },
    { status: "delivered", items: [{ productId: "old" }] },
    { status: "delivered", items: [{ productId: "old" }] }
  ];
  assert.deepEqual(previouslyBought(orders, [P("new"), P("old")]).map((p) => p.id), ["old", "new"]);
});

test("buildHome: empty special sections vanish, departments follow, quick chips only lead somewhere", () => {
  const depts = [D("fruits-vegetables"), D("rice-grains"), D("beverages")];
  const products = [
    P("apple", { categoryId: "fruits-vegetables", mrp: 80, bestSeller: true }),
    P("basmati", { categoryId: "rice-grains" }), P("loose")
  ];
  const { sections, quick } = buildHome({ products, depts });
  assert.deepEqual(sections.map((s) => s.key), ["best", "deals", "essentials", "d:fruits-vegetables", "d:rice-grains", "d:"]);
  assert.deepEqual(quick.map((q) => q.label), ["Deals", "Fresh", "Categories", "Rice", "Kirana"]);
});

test("buildHome: no products -> nothing; no deals / no departments -> fewer chips", () => {
  assert.deepEqual(buildHome({}), { sections: [], quick: [] });
  const { quick } = buildHome({ products: [P("a")], depts: [] });
  assert.deepEqual(quick, []);
  const r = buildHome({ products: [P("a")], depts: [D("beverages")] });
  assert.deepEqual(r.quick.map((q) => q.label), ["Categories"]);
});

test("buildHome: previously bought comes first when the customer has orders", () => {
  const products = [P("a", { categoryId: "beverages" })];
  const { sections } = buildHome({ products, depts: [D("beverages")], orders: [{ status: "delivered", items: [{ productId: "a" }] }] });
  assert.equal(sections[0].key, "previous");
});

test("activeBanners: active only, ordered, capped, needs a title", () => {
  const l = [
    { id: "x", title: "B", order: 2, active: true }, { id: "y", title: "A", order: 1, active: true },
    { id: "z", title: "Off", order: 0, active: false }, { id: "n", title: "", order: 0, active: true }, null
  ];
  assert.deepEqual(activeBanners(l).map((b) => b.id), ["y", "x"]);
  assert.equal(activeBanners(Array.from({ length: 10 }, (_, i) => ({ id: "" + i, title: "t", order: i, active: true }))).length, 6);
});

test("locationLabel: placeholder, short as is, long cut at a word", () => {
  assert.equal(locationLabel(""), "Delivery address jodein");
  assert.equal(locationLabel(undefined), "Delivery address jodein");
  assert.equal(locationLabel("  Main  Bazaar "), "Main Bazaar");
  const long = "House 12, Gandhi Nagar, Near Hanuman Mandir, Mandawar, Dausa, Rajasthan";
  const out = locationLabel(long);
  assert.ok(out.length <= 35 && out.endsWith("…") && !out.includes(",…"), out);
});

test("lastOrder: newest usable order, names from the order, today's prices, gone items dropped, qty capped to stock", () => {
  const products = [P("a", { price: 100, stock: 5 }), P("b", { price: 20, stock: 1 }), P("c", { price: 7 }), P("d", { price: 9 }), P("gone", { active: false })];
  const stamp = { toDate: () => new Date(2026, 9, 28) };
  const orders = [
    { status: "cancelled", items: [{ productId: "a", qty: 1 }] },
    { status: "delivered", createdAt: stamp, items: [
      { productId: "a", name: "Atta 5 kg", qty: 2 }, { productId: "b", name: "Milk", qty: 3 }, { productId: "c", name: "Salt", qty: 1 },
      { productId: "d", name: "Soap", qty: 1 }, { productId: "gone", name: "Old", qty: 1 }, { productId: "a", name: "Atta again", qty: 9 }
    ] }
  ];
  const r = lastOrder(orders, products);
  assert.deepEqual(r.names, ["Atta 5 kg", "Milk", "Salt"]);
  assert.equal(r.more, 1);
  assert.equal(r.total, 100 * 2 + 20 * 1 + 7 + 9);          // milk capped to the 1 in stock
  assert.deepEqual(r.lines, [{ productId: "a", qty: 2 }, { productId: "b", qty: 1 }, { productId: "c", qty: 1 }, { productId: "d", qty: 1 }]);
  assert.equal(r.when.getDate(), 28);
});

test("lastOrder: skips orders with nothing left, null when none usable, cart limit caps the lines", () => {
  assert.equal(lastOrder([], [P("a")]), null);
  assert.equal(lastOrder([{ status: "delivered", items: [{ productId: "x", qty: 1 }] }], [P("a")]), null);
  const older = { status: "delivered", items: [{ productId: "a", qty: 1 }] };
  const newer = { status: "delivered", items: [{ productId: "x", qty: 1 }] };
  assert.deepEqual(lastOrder([newer, older], [P("a")]).lines, [{ productId: "a", qty: 1 }]);
  const many = { status: "delivered", items: "abcdefg".split("").map((id) => ({ productId: id, qty: 1 })) };
  const r = lastOrder([many], "abcdefg".split("").map((id) => P(id)), { maxItems: 5 });
  assert.equal(r.lines.length, 5);
  assert.equal(r.when, null);
});

test("deliveryLine: only what the owner set; null when nothing", () => {
  assert.equal(deliveryLine(null), null);
  assert.equal(deliveryLine({ delivery: {} }), null);
  assert.deepEqual(deliveryLine({ delivery: { estimatedPreparationMinutes: 45, deliveryFee: 0, minimumOrderAmount: 100 } }), { mins: 45, fee: 0, min: 100 });
  assert.deepEqual(deliveryLine({ delivery: { deliveryFee: 20 } }), { mins: null, fee: 20, min: null });
});

test("tileLetter: first letter, Devanagari conjunct stays whole, empty gets a dot", () => {
  assert.equal(tileLetter("dairy & bread"), "D");
  assert.equal(tileLetter("  चावल"), "चा");
  assert.equal(tileLetter("चाय और कॉफ़ी"), "चा");
  assert.equal(tileLetter(""), "•");
});
