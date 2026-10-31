import test from "node:test";
import assert from "node:assert/strict";
import { isPhone, toE164, fromE164, onlyDigits, isCode } from "../shared/services/phone-core.js";

test("isPhone / toE164 / fromE164", () => {
  assert.equal(isPhone("9876543210"), true);
  for (const bad of ["5876543210", "987654321", "98765432101", "98765 43210", "", null, 9876543210]) assert.equal(isPhone(bad), false, String(bad));
  assert.equal(toE164("9876543210"), "+919876543210");
  assert.equal(fromE164("+919876543210"), "9876543210");
  for (const bad of ["+15551234567", "+915876543210", "9876543210", "", null, undefined]) assert.equal(fromE164(bad), "", String(bad));
});

test("onlyDigits and isCode", () => {
  assert.equal(onlyDigits("+91 98765-43210 99"), "9198765432");
  assert.equal(isCode("123456"), true);
  for (const bad of ["12345", "1234567", "12345a", "", null]) assert.equal(isCode(bad), false, String(bad));
});
