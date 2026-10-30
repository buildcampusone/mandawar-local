import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDI1lDEQm8SkX5nVNcadA9D_cgBuRZMD58",
  authDomain: "mandawar-local.firebaseapp.com",
  projectId: "mandawar-local",
  storageBucket: "mandawar-local.firebasestorage.app",
  messagingSenderId: "244132794567",
  appId: "1:244132794567:web:07b7742a5e9c7899752ee2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
