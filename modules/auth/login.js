// Login page: e-mail + password, Google. NO SMS / OTP (Firebase Spark plan, nothing paid).
// Flow: signup -> account + profile (name, mobile, role) -> verification e-mail -> "check your mail" screen -> dashboard.
// Customers must have a verified e-mail before they can use the app; firestore.rules also check
// email_verified for placing orders and registering a shop. The mobile number is contact information only.
import {
  createAccount, createProfile, logIn, getProfile, dashboardFor, googleLogin, finishRedirect,
  isPhone, isVerified, sendVerification, refreshVerification, resetPassword, logOut
} from "../../shared/services/auth.js";
import { onlyDigits } from "../../shared/services/phone-core.js";
import { auth } from "../../shared/config/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { t, errText } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const VIEWS = ["v-main", "v-verify", "v-profile"];
let signupMode = false;
let verifyUser = null;
let tick = null;

function show(id) {
  VIEWS.forEach((v) => { $(v).hidden = v !== id; });
  if (id === "v-main") document.dispatchEvent(new CustomEvent("modechange"));
  else document.body.classList.remove("is-signup");
}
const say = (id, text, good) => { const e = $(id); e.textContent = text || ""; e.classList.toggle("good", !!good); };
const go = (role) => { location.href = dashboardFor(role); };
const gated = (profile) => !profile || profile.role === "customer";

// ---------------------------------------------------------------- email form (login / signup)
function renderMode() {
  $("signup-fields").hidden = !signupMode;
  $("title").textContent = t(signupMode ? "signup" : "login");
  $("sub").textContent = t(signupMode ? "subSignup" : "sub");
  $("submit").textContent = t(signupMode ? "create" : "cont");
  $("toggle").textContent = t(signupMode ? "haveAcc" : "newAcc");
  $("forgot-link").hidden = signupMode;
  $("password").autocomplete = signupMode ? "new-password" : "current-password";
  $("msg").textContent = "";
  document.dispatchEvent(new CustomEvent("modechange"));
}
$("toggle").addEventListener("click", (e) => { e.preventDefault(); signupMode = !signupMode; renderMode(); });
document.addEventListener("langchange", () => { renderMode(); if (verifyUser) paintVerify(); });

// Where does a signed-in person go next?
async function afterLogin(user) {
  const profile = await getProfile(user.uid);
  if (gated(profile) && !isVerified(user)) return openVerify(user, false);
  if (profile) return go(profile.role);
  openProfile(user);          // Google / half-finished signup: no profile yet
}

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("msg").textContent = t("wait");
  $("submit").disabled = true;
  try {
    const email = $("email").value.trim(), password = $("password").value;
    if (signupMode) {
      const name = $("name").value.trim(), phone = $("phone").value.trim(), role = "customer";   // public signup is customers only; the owner account is made by hand in the Console
      if (!isPhone(phone)) { $("msg").textContent = t("e_phone"); $("submit").disabled = false; return; }
      // a half-finished signup (account made, profile/e-mail step not done) is reused instead of failing
      const user = auth.currentUser && auth.currentUser.email === email ? auth.currentUser : await createAccount(email, password);
      if (!(await getProfile(user.uid))) await createProfile(user, { name, phone, role });
      $("msg").textContent = "";
      if (!isVerified(user)) { await safeSend(user); return openVerify(user, true); }
      return go(role);
    }
    const cred = await logIn(email, password);
    await afterLogin(cred.user);
  } catch (err) {
    $("msg").textContent = errText(err.code);
    $("submit").disabled = false;
  }
});

$("forgot-link").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  if (!$("email").checkValidity() || !email) { $("msg").classList.remove("good"); $("msg").textContent = t("e_resetEmail"); return; }
  try { await resetPassword(email); $("msg").classList.add("good"); $("msg").textContent = t("resetSent"); }
  catch (err) {
    if (/user-not-found/.test(err.code || "")) { $("msg").classList.add("good"); $("msg").textContent = t("resetSent"); }   // do not reveal who has an account
    else { $("msg").classList.remove("good"); $("msg").textContent = errText(err.code); }
  }
});

// ---------------------------------------------------------------- Google (its e-mail is already verified by Google)
async function onGoogle(user) { if (user) await afterLogin(user); }
$("google-btn").addEventListener("click", async () => {
  const b = $("google-btn");
  b.disabled = true; $("msg").textContent = "";
  try { await onGoogle(await googleLogin()); }
  catch (err) { $("msg").textContent = errText(err.code); }
  finally { b.disabled = false; }
});
finishRedirect().then(onGoogle).catch((err) => { $("msg").textContent = errText(err.code); });

// Someone who is signed in but not verified (closed the tab, came back later) lands on the "check your mail" screen.
const stop = onAuthStateChanged(auth, async (user) => {
  stop();
  if (user && !isVerified(user) && !verifyUser) { try { await afterLogin(user); } catch (e) { /* stay on the form */ } }
});

// ---------------------------------------------------------------- "check your mail" screen
async function safeSend(user) { try { await sendVerification(user); return true; } catch (e) { return false; } }

function paintVerify() { $("vf-to").textContent = t("vfSub", { email: verifyUser.email || "" }); }

function cooldown(sec) {
  clearInterval(tick);
  const b = $("vf-resend");
  let left = sec;
  const paint = () => { b.disabled = left > 0; b.textContent = left > 0 ? t("vfResendIn", { s: left }) : t("vfResend"); };
  paint();
  if (!sec) return;
  tick = setInterval(() => { left -= 1; paint(); if (left <= 0) clearInterval(tick); }, 1000);
}

function openVerify(user, justSent) {
  verifyUser = user;
  paintVerify();
  say("vf-msg", justSent ? t("vfSent") : "", justSent);
  cooldown(justSent ? 60 : 0);
  show("v-verify");
}

async function checkNow(silent) {
  if (!verifyUser) return;
  $("vf-check").disabled = true;
  try {
    if (await refreshVerification(verifyUser)) { say("vf-msg", ""); verifyUser = null; await afterLogin(auth.currentUser); return; }
    if (!silent) say("vf-msg", t("vfNotYet"));
  } catch (err) { if (!silent) say("vf-msg", errText(err.code)); }
  $("vf-check").disabled = false;
}
$("vf-check").addEventListener("click", () => checkNow(false));
// coming back from the mail app: check by itself
document.addEventListener("visibilitychange", () => { if (!document.hidden && verifyUser) checkNow(true); });

$("vf-resend").addEventListener("click", async () => {
  if (!verifyUser) return;
  $("vf-resend").disabled = true;
  try { await sendVerification(verifyUser); say("vf-msg", t("vfSent"), true); cooldown(60); }
  catch (err) { say("vf-msg", errText(err.code)); cooldown(/too-many-requests/.test(err.code || "") ? 120 : 0); }
});
$("vf-out").addEventListener("click", async (e) => { e.preventDefault(); verifyUser = null; clearInterval(tick); await logOut(); location.reload(); });

// ---------------------------------------------------------------- profile completion (Google login / unfinished signup)
let profileUser = null;
const profileValid = () => $("p-name").value.trim().length > 1 && isPhone($("p-phone").value);
function openProfile(user) {
  profileUser = user;
  $("p-name").value = user.displayName || "";
  $("p-phone").value = "";
  $("p-phone-field").hidden = false;
  $("p-hint").textContent = t("prNeedPhone");
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
  const name = $("p-name").value.trim(), role = "customer", phone = $("p-phone").value;
  $("pr-submit").disabled = true;
  try {
    await createProfile(profileUser, { name, phone, role });
    if (!isVerified(profileUser)) { await safeSend(profileUser); return openVerify(profileUser, true); }
    go(role);
  } catch (err) { say("pr-msg", t("saveFail") + (err.code || err.message)); $("pr-submit").disabled = false; }
});

renderMode();
