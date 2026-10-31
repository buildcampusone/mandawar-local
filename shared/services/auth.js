import { auth, db } from "../config/firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  RecaptchaVerifier, linkWithPhoneNumber, signInWithPhoneNumber,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp, terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { isPhone, toE164, fromE164 } from "./phone-core.js";
export { isPhone, fromE164 };

// Step 1 of email signup: only the login account. The profile (users/{uid}) is written AFTER the phone OTP is
// confirmed, because firestore.rules require the token's phone_number to match the profile phone.
export const createAccount = async (email, password) =>
  (await createUserWithEmailAndPassword(auth, email, password)).user;

export async function createProfile(user, { name, phone, role }) {
  await setDoc(doc(db, "users", user.uid), {
    name, phone, role, status: "active", createdAt: serverTimestamp()
  });
}

// "Continue with Google". Popup first; where a popup cannot open (some in-app browsers / installed PWAs) fall back to
// a full-page redirect and finishRedirect() picks the result up on the next page load.
export async function googleLogin() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return (await signInWithPopup(auth, provider)).user;
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw e;
  }
}
export async function finishRedirect() {
  const r = await getRedirectResult(auth);
  return r ? r.user : null;
}

// ---- Phone OTP (Firebase Phone Auth + invisible reCAPTCHA) ----
let verifier = null;
export function resetRecaptcha() {
  try { verifier && verifier.clear(); } catch (e) { /* already gone */ }
  verifier = null;
}
function freshVerifier() {
  resetRecaptcha();
  let box = document.getElementById("recaptcha-box");
  if (!box) { box = document.createElement("div"); box.id = "recaptcha-box"; document.body.appendChild(box); }
  box.textContent = "";
  verifier = new RecaptchaVerifier(auth, box, { size: "invisible" });
  return verifier;
}

// link = true  -> attach the number to the CURRENT account (signup / profile completion / "verify my number").
// link = false -> sign in with the number (an account that already has this number is signed into).
export async function sendOtp({ phone, link }) {
  if (!isPhone(phone)) { const e = new Error("bad phone"); e.code = "app/bad-phone"; throw e; }
  const v = freshVerifier();
  try {
    return link && auth.currentUser
      ? await linkWithPhoneNumber(auth.currentUser, toE164(phone), v)
      : await signInWithPhoneNumber(auth, toE164(phone), v);
  } catch (e) { resetRecaptcha(); throw e; }
}

// Confirm the SMS code, then refresh the ID token: the phone_number claim that firestore.rules check only
// appears in a token issued AFTER the phone was attached.
export async function confirmOtp(confirmation, code) {
  const cred = await confirmation.confirm(code);
  await cred.user.getIdToken(true);
  return cred.user;
}

export const logIn = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

// Sign out, then best-effort wipe of the offline Firestore cache so the next person on a shared phone sees nothing.
export async function logOut() {
  await signOut(auth);
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { /* another tab still open: fine */ }
}

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export const dashboardFor = (role) => ({
  customer: "./customer.html",
  shopkeeper: "./shopkeeper.html",
  delivery: "./delivery.html",
  admin: "./admin.html"
}[role] || "./login.html");

export function requireRole(allowedRole, onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return (location.href = "./login.html");
    const profile = await getProfile(user.uid);
    if (!profile || profile.role !== allowedRole) {
      return (location.href = dashboardFor(profile?.role));
    }
    onReady(user, profile);
    // Accounts made before OTP existed have no verified number yet: show a "verify" banner (customers and shops only).
    if (allowedRole === "customer" || allowedRole === "shopkeeper")
      import("../components/verify-phone.js").then((m) => m.mountVerifyBanner(user, profile)).catch(() => {});
  });
}
