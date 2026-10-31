// OTP abuse guard (browser side). Pure logic + a tiny storage adapter, so it is unit-tested in tests/otp-guard.test.mjs.
// Honest scope: this stops accidents, hammering of the Send button and one phone cycling through numbers (every SMS costs
// money). It is NOT a security boundary: someone can clear localStorage. The real limits are Firebase's own quotas,
// the India-only SMS region policy and App Check (see DEPLOY.md Step 10).
export const LIMITS = {
  baseWaitSec: 30,        // wait after the 1st OTP to a number; doubles each time: 30, 60, 120, 240, 480
  maxWaitSec: 600,
  perPhoneHour: 5,        // OTPs to ONE number per rolling hour
  perDeviceHour: 8,       // OTPs to ANY number per rolling hour from this browser
  maxWrongCodes: 5,       // wrong codes for one number before a lock
  lockSec: 15 * 60
};
const HOUR = 3600;

export function createOtpGuard({ load, save, now = () => Math.floor(Date.now() / 1000) }) {
  const read = () => { try { const s = load(); return s && typeof s === "object" ? s : {}; } catch (e) { return {}; } };
  const state = () => {
    const s = read(), t = now();
    const sends = Array.isArray(s.sends) ? s.sends.filter((x) => x && typeof x.at === "number" && t - x.at < HOUR) : [];
    const wrong = s.wrong && typeof s.wrong === "object" ? s.wrong : {};
    return { sends, wrong };
  };
  const put = (s) => { try { save(s); } catch (e) { /* storage full / private mode: guard degrades to a no-op */ } };

  function waitFor(phone, sends, t) {
    const mine = sends.filter((x) => x.phone === phone);
    if (!mine.length) return 0;
    const wait = Math.min(LIMITS.baseWaitSec * 2 ** (mine.length - 1), LIMITS.maxWaitSec);
    return Math.max(0, mine[mine.length - 1].at + wait - t);
  }

  return {
    // -> { ok, waitSec, reason: "" | "wait" | "phone-limit" | "device-limit" | "locked" }
    canSend(phone) {
      const { sends, wrong } = state(), t = now();
      const w = wrong[phone];
      if (w && w.lockedUntil > t) return { ok: false, waitSec: w.lockedUntil - t, reason: "locked" };
      const mine = sends.filter((x) => x.phone === phone);
      if (mine.length >= LIMITS.perPhoneHour) return { ok: false, waitSec: mine[0].at + HOUR - t, reason: "phone-limit" };
      if (sends.length >= LIMITS.perDeviceHour) return { ok: false, waitSec: sends[0].at + HOUR - t, reason: "device-limit" };
      const wait = waitFor(phone, sends, t);
      return wait > 0 ? { ok: false, waitSec: wait, reason: "wait" } : { ok: true, waitSec: 0, reason: "" };
    },
    // call right after an OTP was really sent; returns how long the Resend button must stay disabled
    recordSend(phone) {
      const { sends, wrong } = state(), t = now();
      sends.push({ phone, at: t });
      put({ sends, wrong });
      return waitFor(phone, sends, t);
    },
    nextWait(phone) { const { sends } = state(); return waitFor(phone, sends, now()); },
    // -> { locked, left }  (left = wrong tries remaining before the lock)
    recordWrong(phone) {
      const { sends, wrong } = state(), t = now();
      const w = wrong[phone] && wrong[phone].lockedUntil > t - 1 ? wrong[phone] : { count: (wrong[phone] && wrong[phone].count) || 0, lockedUntil: 0 };
      w.count += 1;
      let locked = false;
      if (w.count >= LIMITS.maxWrongCodes) { w.lockedUntil = t + LIMITS.lockSec; w.count = 0; locked = true; }
      wrong[phone] = w;
      put({ sends, wrong });
      return { locked, left: locked ? 0 : LIMITS.maxWrongCodes - w.count };
    },
    recordSuccess(phone) {
      const { sends, wrong } = state();
      delete wrong[phone];
      put({ sends, wrong });
    }
  };
}

// default instance for the pages (localStorage, with an in-memory fallback)
let memory = {};
export const otpGuard = createOtpGuard({
  load: () => { try { return JSON.parse(localStorage.getItem("mandawar.otpg") || "{}"); } catch (e) { return memory; } },
  save: (s) => { memory = s; try { localStorage.setItem("mandawar.otpg", JSON.stringify(s)); } catch (e) { /* ignore */ } }
});

// guard verdict -> i18n key + vars for t()
export function guardMessage(v) {
  const m = Math.max(1, Math.ceil(v.waitSec / 60));
  if (v.reason === "wait") return ["otpWait", { s: v.waitSec }];
  if (v.reason === "phone-limit") return ["otpPhoneLimit", { m }];
  if (v.reason === "device-limit") return ["otpDeviceLimit", { m }];
  if (v.reason === "locked") return ["otpLocked", { m }];
  return ["err", {}];
}
