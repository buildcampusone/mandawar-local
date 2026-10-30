import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { addItem } from "./cart.js";
import { thumb } from "../../shared/components/thumb.js";

import { CATEGORIES, catLabel, catImg } from "../../shared/config/categories.js";

const CHIPS = [{ id: "all", en: "Sab" }, ...CATEGORIES];
const $ = (id) => document.getElementById(id);

export async function initBrowse() {
  let shops = [];
  let cat = "all";
  let products = [];
  let currentShop = null;

  const chips = $("cat-chips");
  CHIPS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "category";
    b.type = "button";
    if (c.img) b.appendChild(catImg(c, "chip-pic"));
    b.appendChild(document.createTextNode(c.en));
    b.onclick = () => {
      cat = c.id;
      chips.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      showShops();
    };
    if (c.id === "all") b.classList.add("on");
    chips.appendChild(b);
  });

  function showShops() {
    const list = $("shop-list");
    const q = $("shop-search").value.trim().toLowerCase();
    list.textContent = "";
    const found = shops.filter((s) =>
      (cat === "all" || s.category === cat) &&
      (!q || s.name.toLowerCase().includes(q)));
    if (!found.length) { const e = document.createElement("div"); e.className = "empty"; e.textContent = "Koi dukaan nahi mili."; list.appendChild(e); return; }
    found.forEach((s) => {
      const box = document.createElement("div");
      box.className = "shop-card";
      const p = document.createElement("p");
      p.textContent = s.name + " | " + catLabel(s.category) + " | " + s.address;
      box.appendChild(p);
      const b = document.createElement("button");
      b.className = "category";
      b.textContent = "Saaman / items dekhein";
      b.onclick = () => openShop(s);
      box.appendChild(b);
      list.appendChild(box);
    });
  }

  async function openShop(s) {
    currentShop = s;
    $("shops-view").hidden = true;
    $("products-view").hidden = false;
    $("shop-title").textContent = s.name;
    $("product-search").value = "";
    $("product-list").textContent = "Loading...";
    try {
      const snap = await getDocs(query(
        collection(db, "shops", s.id, "products"),
        where("active", "==", true)));
      products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      products.sort((a, b) => a.name.localeCompare(b.name));
      showProducts();
    } catch (e) {
      $("product-list").textContent = "Load nahi hua: " + e.message;
    }
  }

  function showProducts() {
    const list = $("product-list");
    const q = $("product-search").value.trim().toLowerCase();
    list.textContent = "";
    const found = products.filter((p) => !q || p.name.toLowerCase().includes(q));
    if (!found.length) { list.textContent = "Koi product nahi mila."; return; }
    found.forEach((p) => {
      const box = document.createElement("div");
      box.className = "shop-card";
      const row = document.createElement("div");
      row.className = "prow";
      row.appendChild(thumb(p));
      const txt = document.createElement("div");
      txt.className = "pr-txt";
      const t = document.createElement("p");
      t.textContent = p.name + " | Rs " + p.price + "/" + p.unit +
        (p.stock > 0 ? "" : " | Stock khatam");
      txt.appendChild(t);
      if (p.stock > 0) {
        const q = document.createElement("input");
        q.type = "number"; q.min = "1"; q.max = "20"; q.value = "1";
        q.style.cssText = "width:70px;padding:8px;margin-right:8px";
        const a = document.createElement("button");
        a.className = "category";
        a.textContent = "Cart mein jodein";
        a.onclick = () => {
          const r = addItem(currentShop.id, p.id, q.value);
          alert(r || "Cart mein jod diya.");
        };
        txt.appendChild(q);
        txt.appendChild(a);
      }
      row.appendChild(txt);
      box.appendChild(row);
      list.appendChild(box);
    });
  }

  $("shop-search").oninput = showShops;
  $("product-search").oninput = showProducts;
  $("back-btn").onclick = () => {
    $("products-view").hidden = true;
    $("shops-view").hidden = false;
  };

  try {
    const snap = await getDocs(query(
      collection(db, "shops"), where("status", "==", "approved")));
    shops = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    showShops();
  } catch (e) {
    $("shop-list").textContent = "Load nahi hua: " + e.message;
  }
}
