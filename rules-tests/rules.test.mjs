// Firestore rules tests (emulator). NOT run in the build environment that produced them: run `npm i && npm test` here.
import test from "node:test";
import fs from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "demo-mandawar", firestore: { rules: fs.readFileSync("../firestore.rules", "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((c) => fn(c.firestore()));
const as = (uid, token = {}) => env.authenticatedContext(uid, token).firestore();
test.beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, "users/cust"), { name: "C", phone: "9876543210", role: "customer", status: "active" });
    await setDoc(doc(db, "users/bad"), { name: "B", phone: "9876543211", role: "customer", status: "blocked" });
    await setDoc(doc(db, "users/rider"), { name: "R", phone: "9876543212", role: "delivery", status: "active" });
    await setDoc(doc(db, "users/owner"), { name: "O", phone: "9876543219", role: "admin", status: "active" });
    await setDoc(doc(db, "users/rider2"), { name: "R2", phone: "9876543213", role: "delivery", status: "active" });
    await setDoc(doc(db, "orders/o1"), { customerUid: "cust", shopId: "shop", status: "accepted", total: 10 });
    await setDoc(doc(db, "orders/o2"), { customerUid: "cust", shopId: "shop", status: "out_for_delivery", deliveryBoyId: "rider", riderName: "R", riderPhone: "9876543212" });
  });
});

test("customer can cancel an accepted order nobody claimed", async () => {
  await assertSucceeds(updateDoc(doc(as("cust"), "orders/o1"), { status: "cancelled" }));
});
test("customer cannot cancel once a rider has it", async () => {
  await assertFails(updateDoc(doc(as("cust"), "orders/o2"), { status: "cancelled" }));
});
test("rider can hand an order back; another rider cannot", async () => {
  const { deleteField } = await import("firebase/firestore");
  const back = { status: "accepted", deliveryBoyId: deleteField(), riderName: deleteField(), riderPhone: deleteField() };
  await assertFails(updateDoc(doc(as("rider2"), "orders/o2"), back));
  await assertSucceeds(updateDoc(doc(as("rider"), "orders/o2"), back));
});
test("blocked user loses role-gated actions", async () => {
  await assertFails(setDoc(doc(as("bad", { phone_number: "+919876543211" }), "orders/x"), { customerUid: "bad" }));
});
test("clients cannot touch config, settlements or wallets", async () => {
  const db = as("cust");
  await assertFails(setDoc(doc(db, "config/platform"), { commissionPercent: 0 }));
  await assertFails(setDoc(doc(db, "settlements/s"), { shopId: "cust" }));
  await assertFails(setDoc(doc(db, "wallets/cust"), { commissionDuePaise: 0 }));
});
test("push token: only own doc, no reads", async () => {
  const tok = "x".repeat(40);
  await assertSucceeds(setDoc(doc(as("cust"), "pushTokens/cust"), { token: tok, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(as("cust"), "pushTokens/rider"), { token: tok, updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(as("cust"), "pushTokens/cust")));
});
const storeDoc = (extra = {}) => ({ ownerUid: "owner", name: "Mandawar Mart", address: "Main Bazaar, Mandawar", phone: "9876543210", isOpen: true, createdAt: serverTimestamp(), ...extra });
test("single owner store: only the admin creates storeSettings/main, for themselves", async () => {
  await assertFails(setDoc(doc(as("cust"), "storeSettings/main"), storeDoc({ ownerUid: "cust" })));    // customers cannot open a store
  await assertFails(setDoc(doc(as("owner"), "storeSettings/other"), storeDoc()));                      // only the id "main"
  await assertFails(setDoc(doc(as("owner"), "storeSettings/main"), storeDoc({ ownerUid: "cust" })));   // ownerUid must be the caller
  await assertFails(setDoc(doc(as("owner"), "storeSettings/main"), storeDoc({ category: "kirana" })));  // no extra fields
  await assertFails(setDoc(doc(as("owner"), "shops/owner"), storeDoc()));                              // the old shops collection is closed
  await assertSucceeds(setDoc(doc(as("owner"), "storeSettings/main"), storeDoc()));
});
test("storeSettings: signed-in users read it, only the owner updates fee / open flag", async () => {
  await seed((db) => setDoc(doc(db, "storeSettings/main"), { ownerUid: "owner", name: "Mandawar Mart", address: "Main Bazaar", phone: "9876543210", isOpen: true }));
  await assertSucceeds(getDoc(doc(as("cust"), "storeSettings/main")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "storeSettings/main")));
  await assertFails(updateDoc(doc(as("cust"), "storeSettings/main"), { delivery: { deliveryFee: 0 } }));
  await assertFails(updateDoc(doc(as("owner"), "storeSettings/main"), { delivery: { deliveryFee: 9999 } }));
  await assertSucceeds(updateDoc(doc(as("owner"), "storeSettings/main"), { isOpen: false, delivery: { deliveryFee: 20, minimumOrderAmount: 100 } }));
});
test("signup: customer only; nobody can self-register as shopkeeper or admin", async () => {
  const base = { name: "N", phone: "9876543218", status: "active", createdAt: serverTimestamp() };
  await assertFails(setDoc(doc(as("new1"), "users/new1"), { ...base, role: "shopkeeper" }));
  await assertFails(setDoc(doc(as("new2"), "users/new2"), { ...base, role: "admin" }));
  await assertSucceeds(setDoc(doc(as("new3"), "users/new3"), { ...base, role: "customer" }));
});
const dept = (extra = {}) => ({ name: "Atta & Flour", order: 1, active: true, createdAt: serverTimestamp(), ...extra });
test("departments: owner creates / edits / deactivates, nobody deletes, customers read only active ones", async () => {
  await assertFails(setDoc(doc(as("cust"), "categories/atta-flour"), dept()));
  await assertFails(setDoc(doc(as("owner"), "categories/bad"), dept({ name: "x" })));                   // name 2-30
  await assertFails(setDoc(doc(as("owner"), "categories/bad"), dept({ seller: "s1" })));                // no extra fields
  await assertSucceeds(setDoc(doc(as("owner"), "categories/atta-flour"), dept()));
  await assertSucceeds(updateDoc(doc(as("owner"), "categories/atta-flour"), { order: 2, name: "Atta, Flour" }));
  await assertFails(updateDoc(doc(as("cust"), "categories/atta-flour"), { active: false }));
  const { deleteDoc, getDocs, collection, query, where } = await import("firebase/firestore");
  await assertFails(deleteDoc(doc(as("owner"), "categories/atta-flour")));
  await assertSucceeds(updateDoc(doc(as("owner"), "categories/atta-flour"), { active: false }));
  await assertSucceeds(getDocs(query(collection(as("cust"), "categories"), where("active", "==", true))));
  await assertFails(getDoc(doc(as("cust"), "categories/atta-flour")));                                   // inactive: hidden from customers
  await assertSucceeds(getDoc(doc(as("owner"), "categories/atta-flour")));
});
test("products: top-level, only the owner writes them, department must exist, customers cannot change price or stock", async () => {
  await seed((db) => setDoc(doc(db, "categories/atta-flour"), { name: "Atta & Flour", order: 1, active: true }));
  const p = { name: "Atta 5kg", price: 250, unit: "packet", stock: 10, active: true, createdAt: serverTimestamp() };
  await assertFails(setDoc(doc(as("cust"), "products/p1"), p));
  await assertFails(setDoc(doc(as("owner"), "products/p1"), { ...p, categoryId: "no-such-dept" }));
  await assertFails(setDoc(doc(as("owner"), "products/p1"), { ...p, group: "Old group field" }));
  await assertSucceeds(setDoc(doc(as("owner"), "products/p1"), { ...p, categoryId: "atta-flour", mrp: 280 }));
  await assertFails(updateDoc(doc(as("cust"), "products/p1"), { price: 1 }));
  await assertFails(updateDoc(doc(as("cust"), "products/p1"), { stock: 0, lastOrderId: "nope" }));       // no matching order
  await assertSucceeds(updateDoc(doc(as("owner"), "products/p1"), { stock: 5 }));
  await assertSucceeds(updateDoc(doc(as("owner"), "products/p1"), { bestSeller: true, featured: false }));
  await assertFails(updateDoc(doc(as("owner"), "products/p1"), { bestSeller: "yes" }));
  await assertFails(setDoc(doc(as("owner"), "shops/owner/products/p1"), p));                            // the old path is closed
});
test("banners: customers read active ones only, only the owner writes", async () => {
  const b = (x = {}) => ({ title: "Diwali Sale", order: 1, active: true, createdAt: serverTimestamp(), ...x });
  await assertFails(setDoc(doc(as("cust"), "banners/b1"), b()));
  await assertFails(setDoc(doc(as("owner"), "banners/b1"), b({ title: "x" })));
  await assertFails(setDoc(doc(as("owner"), "banners/b1"), b({ image: "http://evil/x.png" })));
  await assertSucceeds(setDoc(doc(as("owner"), "banners/b1"), b({ target: "deals", subtitle: "Flat 20% off" })));
  await assertSucceeds(setDoc(doc(as("owner"), "banners/b2"), b({ active: false })));
  const { getDocs, collection, query, where } = await import("firebase/firestore");
  await assertSucceeds(getDocs(query(collection(as("cust"), "banners"), where("active", "==", true))));
  await assertFails(getDoc(doc(as("cust"), "banners/b2")));
});
test.after(() => env.cleanup());

// ---- Phase 6: coupons + banners (owner screens)
const couponDoc = (extra = {}) => ({ code: "SAVE10", type: "percent", value: 10, minOrder: 199, active: true, createdAt: serverTimestamp(), ...extra });
test("coupons: only the owner creates / lists; shape is enforced; code must equal the doc id", async () => {
  await assertFails(setDoc(doc(as("cust"), "coupons/SAVE10"), couponDoc()));                              // customer cannot create
  await assertFails(setDoc(doc(as("owner"), "coupons/OTHER"), couponDoc()));                              // id != code
  await assertFails(setDoc(doc(as("owner"), "coupons/save10"), couponDoc({ code: "save10" })));           // lower-case code
  await assertFails(setDoc(doc(as("owner"), "coupons/SAVE10"), couponDoc({ value: 95 })));                // percent above 90
  await assertFails(setDoc(doc(as("owner"), "coupons/SAVE10"), couponDoc({ value: 10.5 })));              // percent must be whole
  await assertFails(setDoc(doc(as("owner"), "coupons/SAVE10"), couponDoc({ type: "flat", value: 6000 }))); // flat above 5000
  await assertFails(setDoc(doc(as("owner"), "coupons/SAVE10"), couponDoc({ type: "flat", value: 50, maxDiscount: 20 }))); // cap is percent-only
  await assertFails(setDoc(doc(as("owner"), "coupons/SAVE10"), couponDoc({ usedCount: 5 })));             // no extra fields
  await assertSucceeds(setDoc(doc(as("owner"), "coupons/SAVE10"), couponDoc({ maxDiscount: 50 })));
});
test("coupons: customer can read ONE active coupon by code but cannot list or read a paused one", async () => {
  const { getDocs, collection } = await import("firebase/firestore");
  await seed(async (db) => {
    await setDoc(doc(db, "coupons/LIVE10"), { code: "LIVE10", type: "percent", value: 10, minOrder: 0, active: true });
    await setDoc(doc(db, "coupons/OFF10"), { code: "OFF10", type: "percent", value: 10, minOrder: 0, active: false });
  });
  await assertSucceeds(getDoc(doc(as("cust"), "coupons/LIVE10")));
  await assertFails(getDoc(doc(as("cust"), "coupons/OFF10")));
  await assertFails(getDocs(collection(as("cust"), "coupons")));
  await assertSucceeds(getDocs(collection(as("owner"), "coupons")));
});
test("coupons: owner can pause and delete; customer cannot", async () => {
  await seed((db) => setDoc(doc(db, "coupons/LIVE10"), { code: "LIVE10", type: "percent", value: 10, minOrder: 0, active: true, createdAt: new Date(0) }));
  const { deleteDoc } = await import("firebase/firestore");
  await assertFails(updateDoc(doc(as("cust"), "coupons/LIVE10"), { active: false }));
  await assertFails(deleteDoc(doc(as("cust"), "coupons/LIVE10")));
  await assertSucceeds(updateDoc(doc(as("owner"), "coupons/LIVE10"), { active: false }));
  await assertSucceeds(deleteDoc(doc(as("owner"), "coupons/LIVE10")));
});
test("banners: owner manages them, customers only read active ones", async () => {
  const { deleteDoc } = await import("firebase/firestore");
  const b = (extra = {}) => ({ title: "Diwali Sale", order: 0, active: true, createdAt: serverTimestamp(), ...extra });
  await assertFails(setDoc(doc(as("cust"), "banners/b1"), b()));
  await assertFails(setDoc(doc(as("owner"), "banners/b1"), b({ title: "x" })));                           // title too short
  await assertFails(setDoc(doc(as("owner"), "banners/b1"), b({ image: "data:image/png;base64,AAAA" })));  // jpeg only
  await assertSucceeds(setDoc(doc(as("owner"), "banners/b1"), b({ image: "data:image/jpeg;base64,AAAA", target: "deals" })));
  await seed((db) => setDoc(doc(db, "banners/paused"), { title: "Hidden", order: 1, active: false }));
  await assertSucceeds(getDoc(doc(as("cust"), "banners/b1")));
  await assertFails(getDoc(doc(as("cust"), "banners/paused")));
  await assertFails(deleteDoc(doc(as("cust"), "banners/b1")));
  await assertSucceeds(deleteDoc(doc(as("owner"), "banners/b1")));
});

// =====================================================================================================================
// AUDIT 1 Nov 2026 - tests for the REAL app flows: checkout batch (checkout.js), rider queries (delivery/jobs.js),
// reviews (rate-order.js), products get vs list (cart-view.js) and Console-made banners.
// Written where the Firebase emulator was NOT available, so they have never been run. Run `npm test` once. A failure means
// "look at this test AND the rule" - it is not automatic proof that the app is broken.
import { writeBatch, collection, query, where, getDocs } from "firebase/firestore";

const VERIFIED = { email_verified: true };
const PRODUCTS = {
  atta: { name: "Atta 5kg", price: 250, unit: "packet", stock: 10 },
  rice: { name: "Rice 1kg", price: 60, unit: "kg", stock: 3 },
  off:  { name: "Old item", price: 10, unit: "piece", stock: 5 }      // seeded as inactive
};
async function seedShop() {
  await seed(async (db) => {
    await setDoc(doc(db, "users/cust"), { name: "C", phone: "9876543210", role: "customer", status: "active", createdAt: new Date(0) });
    await setDoc(doc(db, "storeSettings/main"), { ownerUid: "owner", name: "Mandawar Mart", address: "Main Bazaar", phone: "9876543210", isOpen: true, delivery: { deliveryFee: 20, minimumOrderAmount: 100 } });
    for (const [id, p] of Object.entries(PRODUCTS))
      await setDoc(doc(db, "products/" + id), { ...p, active: id !== "off", createdAt: new Date(0) });
  });
}
// Same batch as checkout.js: ONE order + one stock update per product, committed together.
// opts.order overrides order fields, opts.stock = false skips the stock updates, opts.newStock(item) overrides the new stock value.
function place(db, lines, opts = {}) {
  const items = lines.map(([id, qty]) => ({ productId: id, name: PRODUCTS[id].name, price: PRODUCTS[id].price, unit: PRODUCTS[id].unit, qty }));
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const ref = doc(collection(db, "orders"));
  const b = writeBatch(db);
  b.set(ref, {
    customerUid: "cust", shopId: "main", shopName: "Mandawar Mart", items, subtotal, deliveryFee: 20, total: subtotal + 20,
    address: "Main Bazaar, Mandawar", phone: "9876543210", paymentMethod: "COD", status: "placed", createdAt: serverTimestamp(),
    ...(opts.order || {})
  });
  if (opts.stock !== false) items.forEach((i) => b.update(doc(db, "products", i.productId), {
    stock: opts.newStock ? opts.newStock(i) : PRODUCTS[i.productId].stock - i.qty, lastOrderId: ref.id
  }));
  return b.commit();
}

test("checkout: a normal order (order + stock decrement in one batch) succeeds", async () => {
  await seedShop();
  await assertSucceeds(place(as("cust", VERIFIED), [["atta", 2], ["rice", 1]]));
});
test("checkout: e-mail not verified -> refused", async () => {
  await seedShop();
  await assertFails(place(as("cust"), [["atta", 1]]));
});
test("checkout: wrong total, wrong delivery fee, below minimum order, closed store -> refused", async () => {
  await seedShop();
  const db = as("cust", VERIFIED);
  await assertFails(place(db, [["atta", 2]], { order: { total: 1 } }));
  await assertFails(place(db, [["atta", 2]], { order: { deliveryFee: 0, total: 500 } }));    // store fee is 20
  await assertFails(place(db, [["rice", 1]]));                                                // 60 < minimum 100
  await seed((s) => updateDoc(doc(s, "storeSettings/main"), { isOpen: false }));
  await assertFails(place(db, [["atta", 2]]));
});
test("checkout: more than the stock, or an inactive product -> refused", async () => {
  await seedShop();
  const db = as("cust", VERIFIED);
  await assertFails(place(db, [["rice", 4]]));       // stock is 3
  await assertFails(place(db, [["off", 20]]));       // inactive
});
test("stock can only go down by exactly the ordered quantity, and only together with the order", async () => {
  await seedShop();
  const db = as("cust", VERIFIED);
  await assertFails(place(db, [["atta", 2]], { newStock: (i) => 10 - i.qty - 1 }));          // takes too much
  await assertFails(place(db, [["atta", 2]], { newStock: () => 10 }));                       // raises / keeps stock
  await assertFails(updateDoc(doc(db, "products/atta"), { stock: 9, lastOrderId: "no-order" }));   // no order in the batch
  await assertFails(updateDoc(doc(db, "products/atta"), { price: 1 }));
});
test("products: ONE product can be read by id even when inactive, but only active ones are listed (cart-view.js)", async () => {
  await seedShop();
  const c = as("cust", VERIFIED);
  await assertSucceeds(getDoc(doc(c, "products/off")));
  await assertSucceeds(getDocs(query(collection(c, "products"), where("active", "==", true))));
  await assertFails(getDocs(collection(c, "products")));
  await assertSucceeds(getDocs(collection(as("owner"), "products")));
});

test("orders: rider sees only the open pool and own orders; customer only own orders", async () => {
  await seedShop();
  const r = as("rider"), c = as("cust", VERIFIED);
  await assertSucceeds(getDocs(query(collection(r, "orders"), where("status", "==", "accepted"))));
  await assertSucceeds(getDocs(query(collection(r, "orders"), where("deliveryBoyId", "==", "rider"))));
  await assertFails(getDocs(collection(r, "orders")));
  await assertSucceeds(getDocs(query(collection(c, "orders"), where("customerUid", "==", "cust"))));
  await assertFails(getDocs(query(collection(c, "orders"), where("customerUid", "==", "someone-else"))));
});
test("orders: rider claim needs own name + phone, only one rider wins, only the holder marks delivered", async () => {
  await seedShop();
  const claim = { status: "out_for_delivery", deliveryBoyId: "rider", riderName: "R", riderPhone: "9876543212" };
  await assertFails(updateDoc(doc(as("rider"), "orders/o1"), { ...claim, riderName: "Someone else" }));
  await assertSucceeds(updateDoc(doc(as("rider"), "orders/o1"), claim));
  await assertFails(updateDoc(doc(as("rider2"), "orders/o1"), { ...claim, deliveryBoyId: "rider2", riderName: "R2", riderPhone: "9876543213" }));
  await assertFails(updateDoc(doc(as("rider2"), "orders/o1"), { status: "delivered" }));
  await assertSucceeds(updateDoc(doc(as("rider"), "orders/o1"), { status: "delivered" }));
});
test("orders: owner only accepts / rejects a new order", async () => {
  await seedShop();
  await seed((s) => setDoc(doc(s, "orders/o3"), { customerUid: "cust", shopId: "main", status: "placed", items: [] }));
  await assertFails(updateDoc(doc(as("owner"), "orders/o3"), { status: "delivered" }));
  await assertSucceeds(updateDoc(doc(as("owner"), "orders/o3"), { status: "accepted" }));
  await assertFails(updateDoc(doc(as("cust", VERIFIED), "orders/o3"), { status: "placed" }));
});

test("reviews: only for a delivered own order; step 2 fills the details once, then it is locked", async () => {
  await seedShop();
  await seed((s) => setDoc(doc(s, "orders/d1"), { customerUid: "cust", shopId: "main", status: "delivered", items: [{ productId: "atta", name: "Atta 5kg", price: 250, unit: "packet", qty: 1 }] }));
  const db = as("cust", VERIFIED);
  const rv = (orderId, extra = {}) => ({ orderId, customerUid: "cust", shopId: "main", rating: 4, tags: [], comment: "", shopRating: 0, itemRatings: [], detailsDone: false, createdAt: serverTimestamp(), ...extra });
  await assertFails(setDoc(doc(db, "reviews/o1"), rv("o1")));                       // o1 is only accepted, not delivered
  await assertSucceeds(setDoc(doc(db, "reviews/d1"), rv("d1")));
  await assertSucceeds(updateDoc(doc(db, "reviews/d1"), { rating: 5, tags: ["quality", "speed"], comment: "Good", shopRating: 5, itemRatings: [5], detailsDone: true }));
  await assertFails(updateDoc(doc(db, "reviews/d1"), { rating: 1 }));               // locked after detailsDone
  await assertSucceeds(getDoc(doc(as("owner"), "reviews/d1")));
  await assertFails(getDoc(doc(as("rider"), "reviews/d1")));
});

test("profile + feedback: own name / address / phone format enforced, role cannot change", async () => {
  await seedShop();
  const db = as("cust", VERIFIED);
  await assertSucceeds(updateDoc(doc(db, "users/cust"), { name: "New Name", phone: "9876543210" }));
  await assertSucceeds(updateDoc(doc(db, "users/cust"), { address: "Main Bazaar, Mandawar" }));
  await assertFails(updateDoc(doc(db, "users/cust"), { phone: "12345" }));
  await assertFails(updateDoc(doc(db, "users/cust"), { role: "admin" }));
  await assertFails(getDoc(doc(as("rider"), "users/cust")));
  const fb = { uid: "cust", role: "customer", rating: 5, comment: "Nice", lang: "hi", createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db, "feedback/f1"), fb));
  await assertFails(setDoc(doc(db, "feedback/f2"), { ...fb, uid: "someone-else" }));
  await assertFails(getDoc(doc(db, "feedback/f1")));
});

test("banners added by hand in the Console WITHOUT createdAt can still be paused by the owner", async () => {
  await seedShop();
  await seed((s) => setDoc(doc(s, "banners/c1"), { title: "Console banner", order: 1, active: true }));
  await assertSucceeds(updateDoc(doc(as("owner"), "banners/c1"), { active: false }));
  await assertFails(updateDoc(doc(as("owner"), "banners/c1"), { createdAt: new Date() }));   // a createdAt cannot be invented later
});
