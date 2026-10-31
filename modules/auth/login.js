// Login page: email+password, Google, mobile OTP. Everything that needs a phone goes through ONE OTP screen (startOtp).
// Signing up (any method) ends with a users/{uid} profile whose phone must match the OTP-verified number
// (firestore.rules enforce that; this file is only the UX).
import {
  createAccount, createProfile, logIn, getProfile, dashboardFor, googleLogin, finishRedirect,
  sendOtp, confirmOtp, resetRecaptcha, isPhone, fromE164
} from "../../shared/services/auth.js";
import { onlyDigits, isCode } from "../../shared/services/phone-core.js";
import { auth } from "../../shared/config/firebase.js";
import { otpGuard, guardMessage } from "../../shared/services/otp-guard.js";
import { t, errText } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const VIEWS = ["v-main", "v-phone", "v-otp", "v-profile"];
let signupMode = false;
let pending = null;          // { phone, link, back, onDone, confirmation }
let tick = null;

function show(id) {
  VIEWS.forEach((v) => { $(v).hidden = v !== id; });
  if (id === "v-main") document.dispatchEvent(new CustomEvent("modechange"));
  else document.body.classList.remove("is-signup");
}
const say = (id, text, good) => { const e = $(id); e.textContent = text || ""; e.classList.toggle("good", !!good); };
const go = (role) => { location.href = dashboardFor(role); };

// ---------------------------------------------------------------- email form (login / signup)
function renderMode() {
  $("signup-fields").hidden = !signupMode;
  $("title").textContent = t(signupMode ? "signup" : "login");
  $("sub").textContent = t(signupMode ? "subSignup" : "sub");
  $("submit").textContent = t(signupMode ? "create" : "cont");
  $("toggle").textContent = t(signupMode ? "haveAcc" : "newAcc");
  $("phone-login-link").hidden = signupMode;
  $("password").autocomplete = signupMode ? "new-password" : "current-password";
  $("msg").textContent = "";
  document.dispatchEvent(new CustomEvent("modechange"));
}
$("toggle").addEventListener("click", (e) => { e.preventDefault(); signupMode = !signupMode; renderMode(); });
document.addEventListener("langchange", () => { renderMode(); if (pending) $("otp-to").textContent = t("otpSentTo", { n: "+91 " + pending.phone }); });

async function afterLogin(user) {
  const profile = await getProfile(user.uid);
  if (profile) return go(profile.role);
  openProfile(user);          // signed in (Google / phone / half-finished signup) but no profile yet
}

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("msg").textContent = t("wait");
  $("submit").disabled = true;
  try {
    const email = $("email").value.trim(), password = $("password").value;
    if (signupMode) {
      const name = $("name").value.trim(), phone = $("phone").value.trim(), role = $("role").value;
      if (!isPhone(phone)) { $("msg").textContent = t("e_phone"); $("submit").disabled = false; return; }
      // a half-finished signup (account made, OTP not done) is reused instead of failing with "email already in use"
      const user = auth.currentUser && auth.currentUser.email === email ? auth.currentUser : await createAccount(email, password);
      $("msg").textContent = "";
      startOtp({ phone, link: true, back: "v-main", onDone: async (u) => { await createProfile(u, { name, phone, role }); go(role); } });
    } else {
      const cred = await logIn(email, password);
      await afterLogin(cred.user);
    }
  } catch (err) {
    $("msg").textContent = errText(err.code);
    $("submit").disabled = false;
  }
});

// ---------------------------------------------------------------- Google
async function onGoogle(user) {
  if (user) await afterLogin(user);
}
$("google-btn").addEventListener("click", async () => {
  const b = $("google-btn");
  b.disabled = true; $("msg").textContent = "";
  try { await onGoogle(await googleLogin()); }
  catch (err) { $("msg").textContent = errText(err.code); }
  finally { b.disabled = false; }
});
finishRedirect().then(onGoogle).catch((err) => { $("msg").textContent = errText(err.code); });

// ---------------------------------------------------------------- mobile OTP login
$("phone-login-link").addEventListener("click", (e) => { e.preventDefault(); say("pl-msg", ""); show("v-phone"); $("pl-phone").focus(); });
document.querySelectorAll("[data-back]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); resetRecaptcha(); show("v-main"); }));
$("pl-phone").addEventListener("input", () => { $("pl-phone").value = onlyDigits($("pl-phone").value); $("pl-send").disabled = !isPhone($("pl-phone").value); });
$("pl-send").addEventListener("click", () => {
  const phone = $("pl-phone").value;
  startOtp({ phone, link: false, back: "v-phone", onDone: afterLogin });
});

// ---------------------------------------------------------------- the one OTP screen
function cooldown(sec) {
  clearInterval(tick);
  const b = $("otp-resend");
  let left = sec;
  const paint = () => {
    b.disabled = left > 0;
    b.textContent = left > 0 ? t("otpResendIn", { s: left }) : t("otpResend");
  };
  paint();
  if (!sec) return;
  tick = setInterval(() => { left -= 1; paint(); if (left <= 0) clearInterval(tick); }, 1000);
}

async function startOtp(p) {
  pending = p;
  show("v-otp");
  $("otp-to").textContent = t("otpSentTo", { n: "+91 " + p.phone });
  $("otp-code").value = "";
  $("otp-verify").disabled = true;
  $("otp-resend").disabled = true;
  const v = otpGuard.canSend(p.phone);
  if (!v.ok) { say("otp-msg", t(...guardMessage(v))); cooldown(v.reason === "wait" ? v.waitSec : 0); return; }
  if (navigator.onLine === false) { say("otp-msg", t("e_net")); cooldown(0); return; }
  say("otp-msg", t("otpSending"), true);
  try {
    p.confirmation = await sendOtp({ phone: p.phone, link: p.link });
    say("otp-msg", "");
    cooldown(otpGuard.recordSend(p.phone));
    $("otp-code").focus();
  } catch (err) {
    say("otp-msg", errText(err.code));
    cooldown(0);
  }
}

$("otp-code").addEventListener("input", () => {
  $("otp-code").value = $("otp-code").value.replace(/\D/g, "").slice(0, 6);
  $("otp-verify").disabled = !(pending && pending.confirmation) || !isCode($("otp-code").value);
});
$("otp-resend").addEventListener("click", () => { if (pending) startOtp(pending); });
$("otp-change").addEventListener("click", (e) => { e.preventDefault(); clearInterval(tick); resetRecaptcha(); show(pending ? pending.back : "v-main"); });
$("otp-verify").addEventListener("click", async () => {
  const code = $("otp-code").value;
  if (!pending || !pending.confirmation || !isCode(code)) return;
  $("otp-verify").disabled = true;
  say("otp-msg", t("wait"), true);
  try {
    const user = await confirmOtp(pending.confirmation, code);
    otpGuard.recordSuccess(pending.phone);
    await pending.onDone(user);
  } catch (err) {
    if (/invalid-verification-code/.test(err.code || "")) {
      const w = otpGuard.recordWrong(pending.phone);
      say("otp-msg", w.locked ? t(...guardMessage(otpGuard.canSend(pending.phone))) : t("otpLeft", { n: w.left }));
      if (w.locked) { pending.confirmation = null; clearInterval(tick); $("otp-resend").disabled = true; }
    } else {
      say("otp-msg", err.code ? errText(err.code) : t("err") + (err.message || ""));
    }
    $("otp-verify").disabled = !pending.confirmation ? true : false;
  }
});

// ---------------------------------------------------------------- profile completion (Google / phone login / unfinished signup)
let profileUser = null;
function profileValid() {
  const needPhone = !$("p-phone-field").hidden;
  return $("p-name").value.trim().length > 1 && (!needPhone || isPhone($("p-phone").value));
}
function openProfile(user) {
  profileUser = user;
  const verified = fromE164(user.phoneNumber);
  $("p-name").value = user.displayName || "";
  $("p-phone").value = verified;
  $("p-phone-field").hidden = !!verified;
  $("p-hint").textContent = verified ? "" : t("prNeedPhone");
  say("pr-msg", "");
  $("pr-submit").disabled = !profileValid();
  show("v-profile");
}
["p-name", "p-phone"].forEach((id) => $(id).addEventListener("input", () => {
  $("p-phone").value = onlyDigits($("p-phone").value);
  $("pr-submit").disabled = !profileValid();
}));
$("pr-submit").addEventListener("click", async () => {
  if (!profileUser || !profileValid()) return;
  const name = $("p-name").value.trim(), role = $("p-role").value;
  const verified = fromE164(profileUser.phoneNumber);
  const phone = verified || $("p-phone").value;
  const finish = async (u) => { await createProfile(u, { name, phone, role }); go(role); };
  $("pr-submit").disabled = true;
  if (verified) {
    try { await finish(profileUser); }
    catch (err) { say("pr-msg", t("saveFail") + (err.code || err.message)); $("pr-submit").disabled = false; }
  } else {
    startOtp({ phone, link: true, back: "v-profile", onDone: finish });
    $("pr-submit").disabled = false;
  }
});

renderMode();
