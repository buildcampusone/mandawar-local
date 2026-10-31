import test from "node:test";
import assert from "node:assert/strict";
import { createOtpGuard, LIMITS } from "../shared/services/otp-guard.js";

function mk() {
  let store = {}, t = 1000;
  const g = createOtpGuard({ load: () => store, save: (s) => { store = s; }, now: () => t });
  return { g, tick: (n) => { t += n; }, wipe: () => { store = {}; } };
}
const P = "9876543210", Q = "9123456780";

test("first OTP is allowed, then the wait doubles: 30, 60, 120 ...", () => {
  const { g, tick } = mk();
  assert.equal(g.canSend(P).ok, true);
  assert.equal(g.recordSend(P), 30);
  assert.deepEqual(g.canSend(P), { ok: false, waitSec: 30, reason: "wait" });
  tick(30); assert.equal(g.canSend(P).ok, true);
  assert.equal(g.recordSend(P), 60);
  tick(60); assert.equal(g.recordSend(P), 120);
});

test("max 5 OTPs per number per hour, then free again after the hour", () => {
  const { g, tick } = mk();
  for (let i = 0; i < LIMITS.perPhoneHour; i++) { g.recordSend(P); tick(600); }
  const r = g.canSend(P);
  assert.equal(r.ok, false); assert.equal(r.reason, "phone-limit");
  tick(r.waitSec + 1);
  assert.equal(g.canSend(P).ok, true);
});

test("one device cannot cycle through many numbers (8 per hour)", () => {
  const { g } = mk();
  for (let i = 0; i < LIMITS.perDeviceHour; i++) g.recordSend("98765" + String(10000 + i));
  const r = g.canSend(Q);
  assert.equal(r.ok, false); assert.equal(r.reason, "device-limit");
});

test("5 wrong codes lock the number for 15 minutes; success clears the counter", () => {
  const { g, tick } = mk();
  g.recordSend(P);
  for (let i = 1; i <= 4; i++) assert.deepEqual(g.recordWrong(P), { locked: false, left: 5 - i });
  assert.deepEqual(g.recordWrong(P), { locked: true, left: 0 });
  tick(60);
  const r = g.canSend(P);
  assert.equal(r.ok, false); assert.equal(r.reason, "locked"); assert.equal(r.waitSec, LIMITS.lockSec - 60);
  tick(LIMITS.lockSec);
  assert.equal(g.canSend(P).reason !== "locked", true);
  g.recordWrong(P); g.recordSuccess(P);
  assert.deepEqual(g.recordWrong(P), { locked: false, left: 4 });
});

test("broken or missing storage never throws", () => {
  const g = createOtpGuard({ load: () => { throw new Error("denied"); }, save: () => { throw new Error("full"); } });
  assert.equal(g.canSend(P).ok, true);
  assert.doesNotThrow(() => g.recordSend(P));
  assert.doesNotThrow(() => g.recordWrong(P));
});
