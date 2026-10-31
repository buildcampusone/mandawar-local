// Shopkeeper orders: LIVE list (no refresh needed), Chalu / Purane tabs, alert + beep on a new order,
// one-tap call to the customer. Status changes still go through firestore.rules (shop owner only).
import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, getDocs, doc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { thumb } from "../../shared/components/thumb.js";
import { REACTIONS, REACTION_TEXT, TAGS } from "../customer/rate-order.js";
import { createWatcher, messageFor, pendingCount } from "../../shared/services/order-events.js";
import { alertUser, notifyPrompt, setPendingBadge } from "../../shared/services/notify.js";

// The shop only accepts / rejects. A rider claims an accepted order and marks it delivered
// (firestore.rules enforces this: a shopkeeper cannot move an order past `accepted`).
const NEXT = {
  placed: [["Accept", "accepted"], ["Reject", "rejected"]]
};
const LABEL = {
  placed: "Naya order", accepted: "Accepted - rider ka intezaar", rejected: "Rejected",
  out_for_delivery: "Delivery par", delivered: "Delivered", cancelled: "Customer ne cancel kiya"
};
const ACTIVE = new Set(["placed", "accepted", "out_for_delivery"]);

function mk(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

export function initOrders(user) {
  const sec = document.getElementById("orders-section");
  const list = document.getElementById("order-list");
  sec.hidden = false;
  sec.insertBefore(notifyPrompt(), list);

  let orders = [];
  let products = new Map();   // productId -> product (for photos)
  let reviews = new Map();    // orderId -> review
  let tab = null;             // "active" | "past"
  const watcher = createWatcher("shopkeeper");

  async function loadExtras() {
    const [pSnap, rSnap] = await Promise.all([
      getDocs(collection(db, "shops", user.uid, "products")).catch(() => null),
      getDocs(query(collection(db, "reviews"), where("shopId", "==", user.uid))).catch(() => null)
    ]);
    if (pSnap) products = new Map(pSnap.docs.map((d) => [d.id, d.data()]));
    if (rSnap) reviews = new Map(rSnap.docs.map((d) => [d.id, d.data()]));
  }

  function ratingSummary() {
    const rs = [...reviews.values()];
    if (!rs.length) return null;
    const avg = (a) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
    const shopRs = rs.map((r) => r.shopRating).filter((n) => n > 0);
    return mk("p", "Customer rating: " + avg(rs.map((r) => r.rating)) + " / 5 (" + rs.length + " review" + (rs.length > 1 ? "s" : "") + ")" +
      (shopRs.length ? " | Dukaan stars: " + avg(shopRs) + " / 5" : ""), "rv-sum");
  }

  function card(o) {
    const box = mk("div", "", "shop-card");
    const when = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toLocaleString() : "";
    const head = mk("p", "#" + o.id.slice(0, 6) + " | " + (LABEL[o.status] || o.status) + " | " + when);
    head.style.fontWeight = "600";
    box.appendChild(head);
    const strip = mk("div", "", "oc-thumbs");
    o.items.forEach((it) => {
      const th = thumb({ name: it.name, image: products.get(it.productId)?.image }, "sm");
      th.title = it.name;
      strip.appendChild(th);
    });
    box.appendChild(strip);
    o.items.forEach((it) => {
      const p = mk("p", it.name + " x " + it.qty + " " + it.unit + " (Rs " + it.price + ")");
      p.style.margin = "2px 0";
      box.appendChild(p);
    });
    if (typeof o.deliveryFee === "number" && o.deliveryFee > 0)
      box.appendChild(mk("p", "Saaman: Rs " + Number(o.subtotal).toFixed(2) + " | Delivery: Rs " + Number(o.deliveryFee).toFixed(2)));
    box.appendChild(mk("p", "Total: Rs " + Number(o.total).toFixed(2) + " (COD, rider cash lega) | Phone: " + o.phone));
    if (o.deliveryBoyId) box.appendChild(mk("p", "Rider: " + (o.riderName || "-") + (o.riderPhone ? " (" + o.riderPhone + ")" : "")));
    box.appendChild(mk("p", "Pata: " + o.address));
    const rv = reviews.get(o.id);
    if (rv) {
      const chip = mk("p", "", "rv");
      const face = mk("b", REACTIONS[rv.rating - 1] || "");
      face.title = REACTION_TEXT[rv.rating - 1] || "";
      const names = (rv.tags || []).map((id) => (TAGS.find((x) => x.id === id) || {}).label).filter(Boolean);
      const extra = [];
      if (names.length) extra.push(names.join(", "));
      if (rv.shopRating) extra.push("Dukaan: " + rv.shopRating + "/5 stars");
      if (rv.comment) extra.push("\u201C" + rv.comment + "\u201D");
      chip.append(face, extra.join(" | ") || REACTION_TEXT[rv.rating - 1] || "");
      box.appendChild(chip);
    }
    (NEXT[o.status] || []).forEach(([label, status]) => {
      const b = mk("button", label, "category");
      b.type = "button";
      b.onclick = async () => {
        if (status === "rejected" && !confirm("Reject karein? Order ka saaman stock mein apne aap wapas jud jayega.")) return;
        b.disabled = true;
        try {
          await updateDoc(doc(db, "orders", o.id), { status });   // the live listener repaints the list
        } catch (e) {
          alert("Update nahi hua: " + e.message);
          b.disabled = false;
        }
      };
      box.appendChild(b);
    });
    // phone was validated by firestore.rules (^[6-9][0-9]{9}$), re-checked here before it goes into a tel: link
    if (ACTIVE.has(o.status) && /^[6-9][0-9]{9}$/.test(o.phone || "")) {
      const call = mk("a", "Customer ko call karein", "category");
      call.href = "tel:" + o.phone;
      box.appendChild(call);
    }
    return box;
  }

  function render() {
    list.textContent = "";
    const activeN = orders.filter((o) => ACTIVE.has(o.status)).length;
    if (!orders.length) { list.appendChild(mk("div", "Abhi koi order nahi.", "empty")); return; }
    if (!tab) tab = activeN ? "active" : "past";
    const seg = mk("div", "", "seg");
    seg.setAttribute("role", "tablist");
    [["active", "Chalu orders" + (activeN ? " (" + activeN + ")" : "")], ["past", "Purane orders"]].forEach(([id, label]) => {
      const b = mk("button", label, id === tab ? "on" : "");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(id === tab));
      b.onclick = () => { tab = id; render(); };
      seg.appendChild(b);
    });
    list.appendChild(seg);
    const sum = ratingSummary();
    if (sum) list.appendChild(sum);
    const shown = orders.filter((o) => ACTIVE.has(o.status) === (tab === "active"));
    if (!shown.length) {
      list.appendChild(mk("div", tab === "active" ? "Abhi koi chalu order nahi hai." : "Abhi tak koi purana order nahi hai.", "empty"));
      return;
    }
    shown.forEach((o) => list.appendChild(card(o)));
  }

  list.textContent = "Loading...";
  loadExtras().then(render);
  onSnapshot(
    query(collection(db, "orders"), where("shopId", "==", user.uid)),
    (snap) => {
      orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const events = watcher.feed(orders, { fromCache: snap.metadata.fromCache });
      events.forEach((ev) => alertUser(messageFor(ev)));
      if (events.some((e) => e.type === "new-order")) { tab = "active"; loadExtras().then(render); }   // fresh stock + photos
      setPendingBadge(pendingCount(orders));
      render();
    },
    (e) => { list.textContent = "Live orders load nahi hue: " + (e.message || e.code); }
  );
}
