// Owner: the one store record, storeSettings/main. Created once by the owner (admin); there is no seller approval.
import { db } from "../../shared/config/firebase.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { STORE_ID } from "../../shared/config/departments.js";

/** -> the store data, or null when it has not been created yet (the create form is then shown). */
export async function ensureStore(user, profile) {
  const form = document.getElementById("shop-form");
  const status = document.getElementById("shop-status");
  const msg = document.getElementById("shop-msg");
  const ref = doc(db, "storeSettings", STORE_ID);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) { status.textContent = snap.data().name + " - store chalu hai."; status.hidden = false; return snap.data(); }
  } catch (e) {
    status.textContent = "Store load nahi hua: " + e.message;
    status.hidden = false;
    return null;
  }

  form.hidden = false;
  document.getElementById("shop-name").value = "Mandawar Mart";
  document.getElementById("shop-phone").value = profile.phone || "";

  return new Promise((resolve) => {
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      msg.textContent = "";
      const name = document.getElementById("shop-name").value.trim();
      const address = document.getElementById("shop-address").value.trim();
      let phone = document.getElementById("shop-phone").value.replace(/\D/g, "");
      if (phone.length > 10) phone = phone.slice(-10);
      if (name.length < 2 || name.length > 60) { msg.textContent = "Store ka naam 2 se 60 akshar ka hona chahiye."; return; }
      if (address.length < 5 || address.length > 200) { msg.textContent = "Pata 5 se 200 akshar ka hona chahiye."; return; }
      if (!/^[6-9][0-9]{9}$/.test(phone)) { msg.textContent = "10 digit ka sahi mobile number daalein."; return; }
      const btn = form.querySelector("button");
      btn.disabled = true;
      try {
        const data = { ownerUid: user.uid, name, address, phone, isOpen: true, createdAt: serverTimestamp() };
        await setDoc(ref, data);
        form.hidden = true;
        status.textContent = name + " - store chalu hai.";
        status.hidden = false;
        resolve({ ...data });
      } catch (e) {
        msg.textContent = "Save nahi hua: " + e.message;
        btn.disabled = false;
      }
    };
  });
}
