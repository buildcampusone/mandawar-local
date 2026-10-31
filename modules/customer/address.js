import { db } from "../../shared/config/firebase.js";
import {
  doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

export function initAddress(user, profile) {
  const form = $("address-form");
  const input = $("address-input");
  const msg = $("address-msg");
  const saved = $("address-saved");

  function render(addr) {
    saved.textContent = addr
      ? "Saved address: " + addr
      : "Abhi koi address save nahi hai.";
    input.value = addr || "";
  }
  render(profile.address);

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    msg.textContent = "";
    const addr = input.value.trim();
    if (addr.length < 5 || addr.length > 200) {
      msg.textContent = "Pata 5 se 200 akshar ka hona chahiye.";
      return;
    }
    const b = form.querySelector("button");
    b.disabled = true;
    try {
      await updateDoc(doc(db, "users", user.uid), { address: addr });
      profile.address = addr;
      render(addr);
      msg.style.color = "var(--primary)";
      msg.textContent = "Address save ho gaya.";
    } catch (e) {
      msg.style.color = "var(--danger)";
      msg.textContent = "Save nahi hua: " + e.message;
    }
    b.disabled = false;
  };
}
