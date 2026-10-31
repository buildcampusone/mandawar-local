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
