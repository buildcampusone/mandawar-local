// Customer cart: photo, price, +/- stepper, per-item total, stock warnings, live "can I order?" state.
// Cart contents live in cart.js (localStorage); product facts are read fresh each time the cart is opened.
import { db } from "../../shared/config/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getCart, setQty, removeItem, MAX_QTY } from "./cart.js";
import { placeOrder } from "./checkout.js";
import { thumb } from "../../shared/components/thumb.js";
import { STORE_ID } from "../../shared/config/departments.js";
import { summarizeCart, blockReason, deliveryQuote } from "./cart-core.js";

const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
function mk(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null && text !== "") e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

export function initCartView(user, profile, { onPlaced } = {}) {
  const list = $("cart-list");
  let products = new Map();   // productId -> product data | null
  let shopName = "";
  let shopData = null;       // storeSettings/main (delivery fee / minimum order live here)
  let busy = false;
  let flash = null;           // { text, good } message that outranks the "why disabled" line

  const track = mk("button", "Order track karein", "category");
  track.type = "button";
  track.hidden = true;
  $("order-msg").after(track);
  track.onclick = () => { track.hidden = true; onPlaced?.(); };

  function badge() {
    const b = $("cart-btn");
    const n = getCart().items.length;
    b.textContent = "Cart";
    if (n) b.appendChild(mk("span", String(n), "cart-count"));
  }

  function refreshBtn() {
    const sum = summarizeCart(getCart().items, products);
    const reason = blockReason({ summary: sum, online: navigator.onLine, quote: deliveryQuote(shopData, sum.total) });
    const m = $("order-msg");
    const shown = flash || (reason ? { text: reason, good: false } : null);
    m.textContent = shown ? shown.text : "";
    m.style.color = shown && shown.good ? "var(--primary)" : "var(--danger)";
    $("order-btn").disabled = busy || !!reason;
    $("order-btn").hidden = !getCart().items.length;
  }

  function stepper(l) {
    const row = mk("div", "", "stp");
    const minus = mk("button", "−", "");
    const plus = mk("button", "+", "");
    [minus, plus].forEach((b) => { b.type = "button"; });
    minus.setAttribute("aria-label", l.name + " kam karein");
    plus.setAttribute("aria-label", l.name + " badhayein");
    minus.disabled = l.qty <= 1;
    plus.disabled = l.qty >= MAX_QTY || l.qty >= l.stock;
    minus.onclick = () => { setQty(l.productId, l.qty - 1); flash = null; paint(); };
    plus.onclick = () => { setQty(l.productId, l.qty + 1); flash = null; paint(); };
    row.append(minus, mk("span", String(l.qty), "stp-n"), plus);
    return row;
  }

  function lineCard(l) {
    const box = mk("div", "", "shop-card");
    if (l.status === "unavailable") {
      box.appendChild(mk("p", "Ye product ab available nahi hai.", "cv-bad"));
    } else {
      const prow = mk("div", "", "prow");
      prow.appendChild(thumb({ name: l.name, image: l.image }));
      const txt = mk("div", "", "pr-txt");
      txt.appendChild(mk("p", l.name)).style.fontWeight = "600";
      txt.appendChild(mk("p", money(l.price) + " / " + l.unit, "muted"));
      if (l.status === "soldout") txt.appendChild(mk("p", "Stock khatam ho gaya.", "cv-bad"));
      else if (l.status === "low-stock") txt.appendChild(mk("p", "Stock sirf " + l.stock + " bacha hai. Quantity kam karein.", "cv-bad"));
      else txt.appendChild(mk("p", "Total: " + money(l.subtotal)));
      if (l.status !== "soldout") txt.appendChild(stepper(l));
      prow.appendChild(txt);
      box.appendChild(prow);
    }
    const r = mk("button", "Hatayein", "category");
    r.type = "button";
    r.onclick = () => { removeItem(l.productId); flash = null; paint(); };
    box.appendChild(r);
    return box;
  }

  function paint() {
    badge();
    list.textContent = "";
    const c = getCart();
    if (!c.items.length) {
      const empty = mk("div", "", "empty");
      empty.appendChild(mk("p", "Cart khali hai."));
      const go = mk("button", "Saaman dekhein", "category");
      go.type = "button";
      go.onclick = () => $("cart-back").click();
      empty.appendChild(go);
      list.appendChild(empty);
      $("cart-total").textContent = "";
      refreshBtn();
      return;
    }
    const sum = summarizeCart(c.items, products);
    list.appendChild(mk("h3", shopName || "Dukaan"));
    sum.lines.forEach((l) => list.appendChild(lineCard(l)));
    const q = deliveryQuote(shopData, sum.total);
    $("cart-total").textContent = "Saaman: " + money(sum.total) + " + Delivery: " + (q.fee > 0 ? money(q.fee) : "Free") +
      " = Total " + money(q.total) + " (COD). Final price order ke waqt verify hogi." +
      (q.min > 0 ? " Minimum order " + money(q.min) + "." : "");
    refreshBtn();
  }

  async function load() {
    badge();
    const c = getCart();
    if (!c.items.length) { products = new Map(); paint(); return; }
    list.textContent = "Loading...";
    const [shop, ...snaps] = await Promise.allSettled([
      getDoc(doc(db, "storeSettings", STORE_ID)),
      ...c.items.map((i) => getDoc(doc(db, "products", i.productId)))
    ]);
    if (snaps.every((s) => s.status === "rejected")) {
      list.textContent = "";
      const box = mk("div", "", "empty");
      box.appendChild(mk("p", "Cart load nahi hua. Internet jaanchein."));
      const retry = mk("button", "Dobara try karein", "category");
      retry.type = "button";
      retry.onclick = load;
      box.appendChild(retry);
      list.appendChild(box);
      return;
    }
    shopData = shop.status === "fulfilled" && shop.value.exists() ? shop.value.data() : null;
    shopName = shopData ? shopData.name : "";
    products = new Map(c.items.map((it, i) => {
      const s = snaps[i];
      return [it.productId, s.status === "fulfilled" && s.value.exists() ? s.value.data() : null];
    }));
    paint();
  }

  $("cart-btn").onclick = () => {
    $("shops-view").hidden = true;
    $("products-view").hidden = true;
    $("cart-view").hidden = false;
    $("order-address").value = profile.address || "";
    $("order-phone").value = profile.phone || "";
    flash = null;
    track.hidden = true;
    load();
  };
  $("cart-back").onclick = () => {
    $("cart-view").hidden = true;
    $("shops-view").hidden = false;
  };
  $("order-btn").onclick = async () => {
    if (busy) return;
    busy = true;
    flash = { text: "Order ho raha hai...", good: true };
    refreshBtn();
    const r = await placeOrder(user, $("order-address").value, $("order-phone").value);
    busy = false;
    if (r.error) {
      flash = { text: r.error, good: false };
      await load();                       // stock / price may have changed: show the fresh state
      return;
    }
    flash = { text: "Order place ho gaya! Total " + money(r.total) + (r.deliveryFee > 0 ? " (delivery " + money(r.deliveryFee) + " shamil)" : "") + " (COD).", good: true };
    products = new Map();
    paint();
    track.hidden = false;
  };
  window.addEventListener("cart-changed", badge);
  window.addEventListener("online", () => { if (!$("cart-view").hidden) refreshBtn(); });
  window.addEventListener("offline", () => { if (!$("cart-view").hidden) refreshBtn(); });
  badge();
}
