import { auth, db } from "../config/firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export async function signUp({ name, phone, email, password, role }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    name, phone, role, status: "active", createdAt: serverTimestamp()
  });
  return cred.user;
}

export const logIn = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

export const logOut = () => signOut(auth);

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export const dashboardFor = (role) => ({
  customer: "./customer.html",
  shopkeeper: "./shopkeeper.html",
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
  });
}
