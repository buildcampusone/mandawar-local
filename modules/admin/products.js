import { db } from "../../shared/config/firebase.js";
import {
  collection, addDoc, getDocs, doc, updateDoc,
  query, orderBy, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { photoToDataUrl } from "../../shared/services/image.js";
import { thumb } from "../../shared/components/thumb.js";
import { fetchCategories } from "./categories.js";

export function initProducts() {
  const sec = document.getElementById("products-section");
  const form = document.getElementById("product-form");
  const list = document.getElementById("product-list");
  const msg = document.getElementById("product-msg");
  const pcat = document.getElementById("p-category");
  const col = collection(db, "products");          // top-level: one store, one inventory
  let cats = [];                                    // departments, shelf order (active and inactive)
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || "";
  sec.hidden = false;

  // Department list for the form select; also reloaded after the owner edits departments.
  async function loadCats() {
    try { cats = await fetchCategories(); } catch (e) { cats = []; }
    const keep = pcat.value;
    pcat.textContent = "";
    pcat.add(new Option("Department chunein (optional)", ""));
    cats.filter((c) => c.active).forEach((c) => pcat.add(new Option(c.name, c.id)));
    pcat.value = [...pcat.options].some((o) => o.value === keep) ? keep : "";
    refresh();
  }
  window.addEventListener("categories-changed", loadCats);

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
    const top = document.createElement("div");
    top.className = "prow";
    top.appendChild(thumb(p));
    const info = document.createElement("p");
    info.className = "pr-txt";
    info.textContent = p.name + " | Rs " + p.price + "/" + p.unit +
      (p.mrp ? " (MRP Rs " + p.mrp + ")" : "") + " | Stock: " + p.stock +
      (catName(p.categoryId) ? " | " + catName(p.categoryId) : "") + " | " + (p.active ? "Active" : "Inactive") +
      (p.bestSeller ? " | Best seller" : "") + (p.featured ? " | Featured" : "");
    top.appendChild(info);
    box.appendChild(top);
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
    box.appendChild(btn("MRP badlo", async () => {
      const v = prompt("MRP / asli keemat (Rs). Khaali chhodein to hat jayegi:", p.mrp || "");
      if (v === null) return;
      if (v.trim() === "") return save(id, { mrp: deleteField() });
      const n = Number(v);
      if (!(n > 0 && n <= 100000)) return alert("MRP 0 se zyada aur 1,00,000 tak ho.");
      await save(id, { mrp: n });
    }));
    box.appendChild(btn("Department badlo", () => {
      const names = cats.filter((c) => c.active).map((c, i) => (i + 1) + ". " + c.name).join("\n");
      if (!names) return alert("Pehle Departments tab me departments jodein.");
      const v = prompt("Department ka number likhein (khaali = hata dein):\n" + names, "");
      if (v === null) return;
      if (v.trim() === "") return save(id, { categoryId: deleteField() });
      const c = cats.filter((x) => x.active)[Number(v) - 1];
      if (!c) return alert("Sahi number likhein.");
      save(id, { categoryId: c.id });
    }));
    box.appendChild(btn(p.bestSeller ? "Best seller hatao" : "Best seller banao", () => save(id, { bestSeller: !p.bestSeller })));
    box.appendChild(btn(p.featured ? "Featured hatao" : "Featured banao", () => save(id, { featured: !p.featured })));
    const pick = document.createElement("input");
    pick.type = "file"; pick.accept = "image/*"; pick.hidden = true;
    pick.onchange = async () => {
      if (!pick.files[0]) return;
      try { await save(id, { image: await photoToDataUrl(pick.files[0]) }); }
      catch (e) { alert(e.message); }
    };
    box.appendChild(pick);
    box.appendChild(btn(p.image ? "Photo badlo" : "Photo jodein", () => pick.click()));
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
    const mrpRaw = document.getElementById("p-mrp").value.trim();
    const categoryId = pcat.value;

    if (name.length < 2 || name.length > 80) { msg.textContent = "Naam 2 se 80 akshar ka ho."; return; }
    if (!(price > 0 && price <= 100000)) { msg.textContent = "Price 0 se zyada aur 1,00,000 tak ho."; return; }
    if (!Number.isInteger(stock) || stock < 0) { msg.textContent = "Stock poora number (0 ya zyada) ho."; return; }

    if (mrpRaw && !(Number(mrpRaw) > 0 && Number(mrpRaw) <= 100000)) { msg.textContent = "MRP 0 se zyada aur 1,00,000 tak ho."; return; }

    const b = form.querySelector("button");
    b.disabled = true;
    try {
      const doc1 = { name, price, unit, stock, active: true, createdAt: serverTimestamp() };
      if (mrpRaw) doc1.mrp = Number(mrpRaw);
      if (categoryId) doc1.categoryId = categoryId;
      const file = document.getElementById("p-photo").files[0];
      if (file) doc1.image = await photoToDataUrl(file);
      await addDoc(col, doc1);
      form.reset();
      refresh();
    } catch (e) {
      msg.textContent = "Save nahi hua: " + e.message;
    }
    b.disabled = false;
  };

  loadCats();
}
