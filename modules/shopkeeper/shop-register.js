import { db } from "../../shared/config/firebase.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const STATUS_TEXT = {
  pending: "Aapki dukaan ka approval pending hai. Admin check karke approve karega.",
  approved: "Aapki dukaan approved hai.",
  rejected: "Aapki dukaan reject ho gayi. Admin se sampark karein."
};

function showStatus(el, shop) {
  el.textContent = shop.name + " - " + (STATUS_TEXT[shop.status] || shop.status);
  el.hidden = false;
}

export async function initShop(user, profile) {
  const form = document.getElementById("shop-form");
  const status = document.getElementById("shop-status");
  const msg = document.getElementById("shop-msg");

  try {
    const snap = await getDoc(doc(db, "shops", user.uid));
    if (snap.exists()) {
      showStatus(status, snap.data());
      return snap.data();
    }
  } catch (e) {
    status.textContent = "Shop load nahi hui: " + e.message;
    status.hidden = false;
    return;
  }

  form.hidden = false;
  document.getElementById("shop-phone").value = profile.phone || "";

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    msg.textContent = "";

    const name = document.getElementById("shop-name").value.trim();
    const address = document.getElementById("shop-address").value.trim();
    const category = document.getElementById("shop-category").value;
    let phone = document.getElementById("shop-phone").value.replace(/\D/g, "");
    if (phone.length > 10) phone = phone.slice(-10);

    if (name.length < 2 || name.length > 60) {
      msg.textContent = "Dukaan ka naam 2 se 60 akshar ka hona chahiye.";
      return;
    }
    if (address.length < 5 || address.length > 200) {
      msg.textContent = "Pata 5 se 200 akshar ka hona chahiye.";
      return;
    }
    if (!/^[6-9][0-9]{9}$/.test(phone)) {
      msg.textContent = "10 digit ka sahi mobile number daalein.";
      return;
    }

    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const data = {
        ownerUid: user.uid,
        name, address, category, phone,
        status: "pending",
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, "shops", user.uid), data);
      form.hidden = true;
      showStatus(status, data);
    } catch (e) {
      msg.textContent = "Save nahi hua: " + e.message;
      btn.disabled = false;
    }
  };
}
