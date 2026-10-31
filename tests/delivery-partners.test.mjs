import test from "node:test";
import assert from "node:assert/strict";
import { parseQuery, actionFor, roleKey, errorKey } from "../modules/admin/delivery-partners-core.js";

test("parseQuery: phone in common formats", () => {
  for (const q of ["9876543210", " 98765 43210", "+91-98765-43210", "919876543210"])
    assert.deepEqual(parseQuery(q), { ok: true, type: "phone", value: "9876543210" }, q);
});

test("parseQuery: bad phone / empty / too short / non-string", () => {
  for (const q of ["12345", "1234567890", "", "  ", "a", 5, null, undefined])
    assert.equal(parseQuery(q).ok, false, String(q));
});

test("parseQuery: names, including Devanagari", () => {
  assert.deepEqual(parseQuery("  Ram  Lal "), { ok: true, type: "name", value: "Ram Lal" });
  assert.equal(parseQuery("राम").type, "name");
  assert.equal(parseQuery("x".repeat(41)).ok, false);
});

test("actionFor: only customer and delivery get a button", () => {
  assert.equal(actionFor("customer"), "make");
  assert.equal(actionFor("delivery"), "remove");
  for (const r of ["admin", "shopkeeper", "", undefined, null, "owner"]) assert.equal(actionFor(r), null, String(r));
});

test("roleKey maps every known role, falls back to generic", () => {
  assert.equal(roleKey("delivery"), "roleDelivery");
  assert.equal(roleKey("admin"), "roleAdmin");
  assert.equal(roleKey("weird"), "user");
});

test("errorKey prefers server reason, then code, never raw text", () => {
  assert.equal(errorKey({ code: "functions/failed-precondition", details: { reason: "active-order" } }), "rdErrActive");
  assert.equal(errorKey({ code: "functions/permission-denied", details: { reason: "self-change" } }), "rdErrSelf");
  assert.equal(errorKey({ code: "functions/permission-denied" }), "rdErrPerm");
  assert.equal(errorKey({ code: "functions/unauthenticated" }), "rdErrPerm");
  assert.equal(errorKey({ code: "functions/unavailable" }), "rdErrNet");
  assert.equal(errorKey({ code: "functions/internal", message: "<img onerror=x>" }), "rdErrGeneric");
  assert.equal(errorKey(null), "rdErrGeneric");
});

test("every i18n key the panel uses exists in both hi and en", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../shared/i18n/i18n.js", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../modules/admin/delivery-partners.js", import.meta.url), "utf8")
    + fs.readFileSync(new URL("../modules/admin/delivery-partners-core.js", import.meta.url), "utf8");
  const keys = new Set([...ui.matchAll(/["'](rd[A-Z]\w*|navRiders|shRiders|roleDelivery)["']/g)].map((m) => m[1]));
  const [hi, en] = src.split(/\n  en: \{/);
  assert.ok(keys.size > 20);
  for (const k of keys) {
    assert.match(hi, new RegExp("\\b" + k + ":"), "hi missing " + k);
    assert.match(en, new RegExp("\\b" + k + ":"), "en missing " + k);
  }
});
