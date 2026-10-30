// Customer "Mere orders": Chalu / Purane tabs, product photo strip, status, emoji rating, Reorder.
// Reviews live in reviews/{orderId} (see rate-order.js + firestore.rules).
import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, getDocs, getDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { thumb } from "../../shared/components/thumb.js";
import { openRating, REACTIONS, REACTION_TEXT } from "./rate-order.js";
import { getCart, replaceCart } from "./cart.js";

// status -> [label, tone, icon]
const LABEL = {
  placed: ["Order bheja gaya", "warn", "clock"], accepted: ["Dukaan ne accept kiya", "", "clock"],
  rejected: ["Dukaan ne reject kiya", "bad", "cross"], out_for_delivery: ["Delivery par", "", "clock"],
  delivered: ["Delivered", "", "check"], cancelled: ["Cancel kiya", "bad", "cross"]
};
const ACTIVE = new Set(["placed", "accepted", "out_for_delivery"]);
const ICON = {
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cross: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'
};
const MAX_THUMBS = 3;

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICON[name]; // static markup only
  return s;
}
function whenText(ts) {
  if (!ts) return "";
  const d = ts.toDate();
  const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/am|pm/i, (m) => m.toUpperCase());
  return day + ", " + time;
}
const money = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function initMyOrders(user, { onReorder } = {}) {
  const list = document.getElementById("my-order-list");
  let orders = [];
  let reviews = new Map();           // orderId -> review data
  let tab = null;                    // "active" | "past" (chosen on first load)
  const products = new Map();        // "shopId/productId" -> product data | null (unreadable / removed)
  const pending = new Map();         // "shopId/productId" -> in-flight promise

  // ---------------------------------------------------------------- product photos (cached)
  const pkey = (o, it) => o.shopId + "/" + it.productId;
  function fetchProduct(o, it) {
    const k = pkey(o, it);
    if (products.has(k)) return Promise.resolve(products.get(k));
    if (!pending.has(k)) {
      pending.set(k, getDoc(doc(db, "shops", o.shopId, "products", it.productId))
        .then((s) => (s.exists() ? s.data() : null), () => null)
        .then((p) => { products.set(k, p); pending.delete(k); return p; }));
    }
    return pending.get(k);
  }
  const fetchItems = (o, items) => Promise.all(items.map((it) => fetchProduct(o, it)));
  // Map productId -> product data, as expected by openRating()
  const productMap = (o) => new Map(o.items.map((it) => [it.productId, products.get(pkey(o, it)) || undefined]));

  function paintThumbs(box, o) {
    box.textContent = "";
    const many = o.items.length > MAX_THUMBS + 1;
    const shown = many ? o.items.slice(0, MAX_THUMBS) : o.items;
    shown.forEach((it) => {
      const t = thumb({ name: it.name, image: products.get(pkey(o, it))?.image });
      t.title = it.name;
      box.appendChild(t);
    });
    if (many) {
      const more = mk("span", "thumb more", "+" + (o.items.length - MAX_THUMBS));
      more.setAttribute("aria-label", (o.items.length - MAX_THUMBS) + " aur items");
      box.appendChild(more);
    }
  }

  // ---------------------------------------------------------------- actions
  async function cancelOrder(o, b) {
    if (!confirm("Ye order cancel karein?")) return;
    b.disabled = true;
    try { await updateDoc(doc(db, "orders", o.id), { status: "cancelled" }); await refresh(); }
    catch (e) { alert("Cancel nahi hua: " + (e.message || e.code)); b.disabled = false; }
  }

  async function reorder(o, b) {
    b.disabled = true;
    try {
      const shop = await getDoc(doc(db, "shops", o.shopId));
      if (!shop.exists() || shop.data().status !== "approved") { alert("Ye dukaan abhi available nahi hai."); return; }
      await fetchItems(o, o.items);
      const ok = [], skipped = [];
      o.items.forEach((it) => {
        const p = products.get(pkey(o, it));
        if (p && p.active && p.stock >= 1) ok.push({ productId: it.productId, qty: Math.min(it.qty, p.stock) });
        else skipped.push(it.name);
      });
      if (!ok.length) { alert("Is order ke items abhi available nahi hain."); return; }
      if (getCart().items.length && !confirm("Aapke cart ka purana saaman hat jayega. Reorder karein?")) return;
      replaceCart(o.shopId, ok);
      if (skipped.length) alert("Ye items abhi available nahi hain, isliye nahi jode: " + skipped.join(", "));
      onReorder?.();
    } catch (e) {
      alert("Reorder nahi hua: " + (e.message || e.code));
    } finally {
      b.disabled = false;
    }
  }

  async function rate(o, initial) {
    await fetchItems(o, o.items);   // photos for the sheet
    openRating({
      order: o, review: reviews.get(o.id) || null, user, products: productMap(o), initial,
      onSaved: (r) => { reviews.set(o.id, r); render(); }
    });
  }

  // ---------------------------------------------------------------- one order card
  function ratingBlock(o) {
    const r = reviews.get(o.id);
    const wrap = mk("div", "oc-rate");
    if (r && r.detailsDone) {
      wrap.appendChild(mk("h4", "", "Aapka rating"));
      const done = mk("span", "emo-done", REACTIONS[r.rating - 1]);
      done.title = REACTION_TEXT[r.rating - 1];
      wrap.appendChild(done);
    } else if (r) {
      wrap.appendChild(mk("h4", "", "Continue Rating"));
      const more = mk("button", "oc-link", "Tell us More");
      more.type = "button";
      more.onclick = () => rate(o);
      wrap.append(more, " ", mk("span", "emo-done", REACTIONS[r.rating - 1]));
    } else {
      wrap.appendChild(mk("h4", "", "Rate Your Order"));
      const row = mk("div", "emo");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Order rating");
      REACTIONS.forEach((em, i) => {
        const b = mk("button", "", em);
        b.type = "button";
        b.setAttribute("aria-label", REACTION_TEXT[i]);
        b.onclick = () => rate(o, i + 1);
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  function card(o) {
    const [txt, tone, ic] = LABEL[o.status] || [o.status, "", "clock"];
    const box = mk("article", "oc");
    box.appendChild(mk("p", "oc-shop", o.shopName || "Dukaan"));

    const thumbs = mk("div", "oc-thumbs");
    paintThumbs(thumbs, o);
    box.appendChild(thumbs);
    const need = (o.items.length > MAX_THUMBS + 1 ? o.items.slice(0, MAX_THUMBS) : o.items)
      .filter((it) => !products.has(pkey(o, it)));
    if (need.length) fetchItems(o, need).then(() => { if (thumbs.isConnected) paintThumbs(thumbs, o); });

    const row = mk("div", "oc-row");
    const main = mk("div", "oc-main");
    main.appendChild(mk("p", "oc-when", [whenText(o.createdAt), money(o.total)].filter(Boolean).join(" • ")));
    main.appendChild(mk("p", "oc-id", "Order ID #" + o.id.slice(0, 6).toUpperCase() + " • COD"));
    const state = mk("span", "oc-state " + tone);
    state.append(icon(ic), txt);
    row.append(main, state);
    box.appendChild(row);

    const lines = mk("ul", "oc-lines");
    o.items.forEach((it) => lines.appendChild(mk("li", "", it.name + " × " + it.qty + " " + it.unit + " (" + money(it.price) + ")")));
    lines.hidden = true;
    const toggle = mk("button", "oc-link", "Items dekhein");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.onclick = () => {
      lines.hidden = !lines.hidden;
      toggle.setAttribute("aria-expanded", String(!lines.hidden));
      toggle.textContent = lines.hidden ? "Items dekhein" : "Items chhupayein";
    };
    box.append(toggle, lines);

    box.appendChild(document.createElement("hr"));
    const foot = mk("div", "oc-foot");
    if (o.status === "delivered") {
      foot.appendChild(ratingBlock(o));
    } else if (o.status === "placed") {
      const c = mk("button", "btn-soft danger", "Cancel");
      c.type = "button";
      c.onclick = () => cancelOrder(o, c);
      foot.appendChild(c);
    }
    const again = mk("button", "btn-soft", "Reorder");
    again.type = "button";
    again.onclick = () => reorder(o, again);
    foot.appendChild(again);
    box.appendChild(foot);
    return box;
  }

  // ---------------------------------------------------------------- list + tabs
  function render() {
    list.textContent = "";
    const activeN = orders.filter((o) => ACTIVE.has(o.status)).length;
    const seg = mk("div", "seg");
    seg.setAttribute("role", "tablist");
    [["active", "Chalu orders" + (activeN ? " (" + activeN + ")" : "")], ["past", "Purane orders"]].forEach(([id, label]) => {
      const b = mk("button", id === tab ? "on" : "", label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(id === tab));
      b.onclick = () => { tab = id; render(); };
      seg.appendChild(b);
    });
    list.appendChild(seg);

    const shown = orders.filter((o) => ACTIVE.has(o.status) === (tab === "active"));
    if (!shown.length) {
      list.appendChild(mk("div", "empty", tab === "active" ? "Abhi koi chalu order nahi hai." : "Abhi tak koi purana order nahi hai."));
      return;
    }
    shown.forEach((o) => list.appendChild(card(o)));
  }

  async function refresh() {
    list.textContent = "Loading...";
    try {
      const [oSnap, rSnap] = await Promise.all([
        getDocs(query(collection(db, "orders"), where("customerUid", "==", user.uid))),
        getDocs(query(collection(db, "reviews"), where("customerUid", "==", user.uid))).catch(() => null)
      ]);
      orders = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      reviews = new Map();
      if (rSnap) rSnap.docs.forEach((d) => reviews.set(d.id, d.data()));
      if (!orders.length) { list.textContent = ""; list.appendChild(mk("div", "empty", "Abhi tak koi order nahi diya.")); return; }
      if (!tab || !orders.some((o) => ACTIVE.has(o.status) === (tab === "active"))) {
        tab = orders.some((o) => ACTIVE.has(o.status)) ? "active" : "past";
      }
      render();
    } catch (e) {
      list.textContent = "Load nahi hua: " + (e.message || e.code);
    }
  }
  return refresh;
}
