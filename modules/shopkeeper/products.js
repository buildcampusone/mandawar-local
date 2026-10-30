import { db } from "../../shared/config/firebase.js";
import {
  collection, addDoc, getDocs, doc, updateDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function initProducts(user) {
  const sec = document.getElementById("products-section");
  const form = document.getElementById("product-form");
  const list = document.getElementById("product-list");
  const msg = document.getElementById("product-msg");
  const col = collection(db, "shops", user.uid, "products");
  sec.hidden = false;

  async function refresh() {
    list.textContent = "Loading...";
    try {
      const snap = await getDocs(query(col, orderBy("createdAt", "desc")));
      list.textContent = "";
      if (snap.empty) { list.textContent = "Abhi koi product nahi."; return; }
      snap.forEach((d) => list.appendChild(row(d.id, d.data())));
    } catch (e) {
      list.textContent = "Load nahi hua: " + e.message;
    }
  }

  function row(id, p) {
    const box = document.createElement("div");
    box.className = "shop-card";
    const info = document.createElement("p");
    info.textContent = p.name + " | Rs " + p.price + "/" + p.unit +
      " | Stock: " + p.stock + " | " + (p.active ? "Active" : "Inactive");
    box.appendChild(info);
    box.appendChild(btn("Stock badlo", async () => {
      const v = prompt("Naya stock (poora number):", p.stock);
      if (v === null) return;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return alert("Sahi number daalein.");
      await save(id, { stock: n });
    }));
    box.appendChild(btn("Price badlo", async () => {
      const v = prompt("Nayi price (Rs):", p.price);
      if (v === null) return;
      const n = Number(v);
      if (!(n > 0)) return alert("Price 0 se zyada honi chahiye.");
      await save(id, { price: n });
    }));
    box.appendChild(btn(p.active ? "Inactive karein" : "Active karein",
      () => save(id, { active: !p.active })));
    return box;
  }

  function btn(label, fn) {
    const b = document.createElement("button");
    b.className = "category";
    b.textContent = label;
    b.onclick = fn;
    return b;
  }

  async function save(id, change) {
    try {
      await updateDoc(doc(col, id), change);
      refresh();
    } catch (e) {
      alert("Update nahi hua: " + e.message);
    }
  }

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    msg.textContent = "";
    const name = document.getElementById("p-name").value.trim();
    const price = Number(document.getElementById("p-price").value);
    const unit = document.getElementById("p-unit").value;
    const stock = Number(document.getElementById("p-stock").value);

    if (name.length < 2 || name.length > 80) { msg.textContent = "Naam 2 se 80 akshar ka ho."; return; }
    if (!(price > 0 && price <= 100000)) { msg.textContent = "Price 0 se zyada aur 1,00,000 tak ho."; return; }
    if (!Number.isInteger(stock) || stock < 0) { msg.textContent = "Stock poora number (0 ya zyada) ho."; return; }

    const b = form.querySelector("button");
    b.disabled = true;
    try {
      await addDoc(col, { name, price, unit, stock, active: true, createdAt: serverTimestamp() });
      form.reset();
      refresh();
    } catch (e) {
      msg.textContent = "Save nahi hua: " + e.message;
    }
    b.disabled = false;
  };

  refresh();
}
