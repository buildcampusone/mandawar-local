import { db } from "../../shared/config/firebase.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getCart, setQty, removeItem } from "./cart.js";
import { placeOrder } from "./checkout.js";

const $ = (id) => document.getElementById(id);

export function initCartView(user, profile) {
  const list = $("cart-list");

  function badge() {
    const b = $("cart-btn");
    const n = getCart().items.length;
    b.textContent = "Cart";
    if (n) b.appendChild(mk("span", String(n), "cart-count"));
  }

  function mk(tag, text, cls) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  async function render() {
    badge();
    const c = getCart();
    $("cart-total").textContent = "";
    if (!c.items.length) { list.textContent = "Cart khali hai."; return; }
    list.textContent = "Loading...";
    try {
      const shop = await getDoc(doc(db, "shops", c.shopId)).catch(() => null);
      const snaps = await Promise.all(c.items.map((i) =>
        getDoc(doc(db, "shops", c.shopId, "products", i.productId)).catch(() => null)));
      list.textContent = "";
      list.appendChild(mk("h3", shop && shop.exists() ? shop.data().name : "Dukaan"));
      let total = 0;
      c.items.forEach((it, idx) => {
        const box = mk("div", "", "shop-card");
        const snap = snaps[idx];
        if (!snap || !snap.exists() || !snap.data().active) {
          box.appendChild(mk("p", "Ye product ab available nahi hai."));
        } else {
          const p = snap.data();
          total += p.price * it.qty;
          box.appendChild(mk("p", p.name + " | Rs " + p.price + "/" + p.unit +
            " x " + it.qty + " = Rs " + (p.price * it.qty).toFixed(2)));
          if (it.qty > p.stock)
            box.appendChild(mk("p", "Stock sirf " + p.stock + " bacha hai.")).style.color = "var(--danger)";
          const q = mk("input");
          q.type = "number"; q.min = "1"; q.max = "20"; q.value = it.qty;
          q.style.cssText = "width:70px;padding:8px;margin-right:8px";
          q.onchange = () => {
            if (!setQty(it.productId, q.value)) alert("Quantity 1 se 20 ke beech poora number ho.");
            render();
          };
          box.appendChild(q);
        }
        const r = mk("button", "Hatayein", "category");
        r.onclick = () => { removeItem(it.productId); render(); };
        box.appendChild(r);
        list.appendChild(box);
      });
      $("cart-total").textContent =
        "Anumaan total: Rs " + total.toFixed(2) + " (final price order ke waqt verify hogi)";
    } catch (e) {
      list.textContent = "Load nahi hua: " + e.message;
    }
  }

  $("cart-btn").onclick = () => {
    $("shops-view").hidden = true;
    $("products-view").hidden = true;
    $("cart-view").hidden = false;
    $("order-address").value = profile.address || "";
    $("order-phone").value = profile.phone || "";
    $("order-msg").textContent = "";
    render();
  };
  $("cart-back").onclick = () => {
    $("cart-view").hidden = true;
    $("shops-view").hidden = false;
  };
  $("order-btn").onclick = async () => {
    const m = $("order-msg");
    const b = $("order-btn");
    m.style.color = "var(--danger)";
    m.textContent = "Order ho raha hai...";
    b.disabled = true;
    const r = await placeOrder(user, $("order-address").value, $("order-phone").value);
    b.disabled = false;
    if (r.error) { m.textContent = r.error; return; }
    m.style.color = "var(--primary)";
    m.textContent = "Order place ho gaya! Total Rs " + r.total.toFixed(2) + " (COD).";
    render();
  };
  window.addEventListener("cart-changed", badge);
  badge();
}
