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
test.after(() => env.cleanup());
