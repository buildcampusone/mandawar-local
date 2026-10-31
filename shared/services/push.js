// Real push notifications (app CLOSED too) through Firebase Cloud Messaging.
// Needs ONE setting: VAPID_KEY in shared/config/firebase.js (Firebase Console -> Project settings -> Cloud Messaging ->
// Web Push certificates -> "Generate key pair"). While it is empty this module does nothing and the in-app alerts keep working.
// The token is stored in pushTokens/{uid}; the Cloud Functions pushOnOrderCreated / pushOnOrderUpdated send to it.
import { app, auth, db, VAPID_KEY } from "../config/firebase.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const pushConfigured = () => !!VAPID_KEY;
let busy = false;

export async function syncPush() {
  if (busy || !VAPID_KEY || !auth.currentUser) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return false;
  busy = true;
  try {
    const m = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js");
    if (!(await m.isSupported())) return false;
    const reg = await navigator.serviceWorker.ready;
    const token = await m.getToken(m.getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return false;
    await setDoc(doc(db, "pushTokens", auth.currentUser.uid), { token, updatedAt: serverTimestamp() });
    return true;
  } catch (e) { return false; }     // push is a bonus: never break the page
  finally { busy = false; }
}
