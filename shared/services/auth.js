import { auth, db } from "../config/firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendEmailVerification, sendPasswordResetEmail, reload,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp, terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { isPhone, fromE164 } from "./phone-core.js";
export { isPhone, fromE164 };

// E-mail signup: the login account first, then createProfile (users/{uid}), then a verification e-mail.
// No SMS / OTP anywhere: the mobile number is contact information for delivery only.
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

// ---- E-mail verification ----
// Verified = Google account, a clicked e-mail link, or an older account that once verified its phone by OTP.
export const isVerified = (user) => !!user && (user.emailVerified === true || !!user.phoneNumber);
export const sendVerification = (user) => sendEmailVerification(user);

// Re-read the account from Firebase and refresh the ID token: the email_verified claim that firestore.rules check
// only appears in a token issued AFTER the link was clicked.
export async function refreshVerification(user) {
  await reload(user);
  if (user.emailVerified) await user.getIdToken(true);
  return isVerified(user);
}
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

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
    // Customers must verify their e-mail first; the login page shows the "check your mail" screen.
    if (allowedRole === "customer" && !isVerified(user)) {
      return (location.href = "./login.html");
    }
    onReady(user, profile);
  });
}
