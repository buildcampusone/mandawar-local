import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDI1lDEQm8SkX5nVNcadA9D_cgBuRZMD58",
  authDomain: "mandawar-local.firebaseapp.com",
  projectId: "mandawar-local",
  storageBucket: "mandawar-local.firebasestorage.app",
  messagingSenderId: "244132794567",
  appId: "1:244132794567:web:07b7742a5e9c7899752ee2"
};

export const app = initializeApp(firebaseConfig);

// App Check: proves requests come from THIS website (reCAPTCHA v3), not a script using the public API key.
// Paste the reCAPTCHA v3 SITE key (not the secret) from Firebase Console -> App Check -> Apps. While it is empty
// nothing changes. Turn on "Enforce" in the Console only after the app has been sending tokens for a while (DEPLOY.md Step 10).
export const APP_CHECK_SITE_KEY = "";
if (APP_CHECK_SITE_KEY) {
  // local testing: open the page on localhost once, copy the debug token from the console into Console -> App Check -> Manage debug tokens
  if (["localhost", "127.0.0.1"].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  const ac = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js");
  ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
// Web Push key pair (public key) from Firebase Console -> Cloud Messaging -> Web Push certificates. Empty = push off.
export const VAPID_KEY = "";
export const auth = getAuth(app);
// Local (IndexedDB) cache so shops, products and past orders still open when the network drops.
// Orders themselves are blocked while offline (modules/customer/checkout.js). Cache is wiped on logout (auth.js).
// If the browser has no IndexedDB (private mode, very old WebView) we silently use the plain in-memory Firestore.
function makeDb() {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    return getFirestore(app);
  }
}
export const db = makeDb();
