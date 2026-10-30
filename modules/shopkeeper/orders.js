import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { thumb } from "../../shared/components/thumb.js";
import { REACTIONS, REACTION_TEXT, TAGS } from "../customer/rate-order.js";

const NEXT = {
  placed: [["Accept", "accepted"], ["Reject", "rejected"]],
  accepted: [["Delivery ke liye nikla", "out_for_delivery"]],
  out_for_delivery: [["Delivered", "delivered"]]
};
const LABEL = {
  placed: "Naya order", accepted: "Accepted", rejected: "Rejected",
  out_for_delivery: "Delivery par", delivered: "Delivered", cancelled: "Customer ne cancel kiya"
};

export function initOrders(user) {
  const sec = document.getElementById("orders-section");
  const list = document.getElementById("order-list");
  sec.hidden = false;
  let products = new Map();   // productId -> product (for photos)
  let reviews = new Map();    // orderId -> review

  function ratingSummary() {
    const rs = [...reviews.values()];
    if (!rs.length) return null;
    const avg = (a) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
    const shopRs = rs.map((r) => r.shopRating).filter((n) => n > 0);
    const p = document.createElement("p");
    p.className = "rv-sum";
    p.textContent = "Customer rating: " + avg(rs.map((r) => r.rating)) + " / 5 (" + rs.length + " review" + (rs.length > 1 ? "s" : "") + ")" +
      (shopRs.length ? " | Dukaan stars: " + avg(shopRs) + " / 5" : "");
    return p;
  }

  async function refresh() {
    list.textContent = "Loading...";
    try {
      const [snap, pSnap, rSnap] = await Promise.all([
        getDocs(query(collection(db, "orders"), where("shopId", "==", user.uid))),
        getDocs(collection(db, "shops", user.uid, "products")).catch(() => null),
        getDocs(query(collection(db, "reviews"), where("shopId", "==", user.uid))).catch(() => null)
      ]);
      products = new Map(pSnap ? pSnap.docs.map((d) => [d.id, d.data()]) : []);
      reviews = new Map(rSnap ? rSnap.docs.map((d) => [d.id, d.data()]) : []);
      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      list.textContent = "";
      if (!orders.length) { list.textContent = "Abhi koi order nahi."; return; }
      const sum = ratingSummary();
      if (sum) list.appendChild(sum);
      orders.forEach((o) => list.appendChild(card(o)));
    } catch (e) {
      list.textContent = "Load nahi hua: " + e.message;
    }
  }

  function card(o) {
    const box = document.createElement("div");
    box.className = "shop-card";
    const when = o.createdAt ? o.createdAt.toDate().toLocaleString() : "";
    const head = document.createElement("p");
    head.style.fontWeight = "600";
    head.textContent = "#" + o.id.slice(0, 6) + " | " + (LABEL[o.status] || o.status) + " | " + when;
    box.appendChild(head);
    const strip = document.createElement("div");
    strip.className = "oc-thumbs";
    o.items.forEach((it) => {
      const th = thumb({ name: it.name, image: products.get(it.productId)?.image }, "sm");
      th.title = it.name;
      strip.appendChild(th);
    });
    box.appendChild(strip);
    o.items.forEach((it) => {
      const p = document.createElement("p");
      p.style.margin = "2px 0";
      p.textContent = it.name + " x " + it.qty + " " + it.unit + " (Rs " + it.price + ")";
      box.appendChild(p);
    });
    const t = document.createElement("p");
    t.textContent = "Total: Rs " + Number(o.total).toFixed(2) + " (COD) | Phone: " + o.phone;
    box.appendChild(t);
    const a = document.createElement("p");
    a.textContent = "Pata: " + o.address;
    box.appendChild(a);
    const rv = reviews.get(o.id);
    if (rv) {
      const chip = document.createElement("p");
      chip.className = "rv";
      const face = document.createElement("b");
      face.textContent = REACTIONS[rv.rating - 1] || "";
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
      const b = document.createElement("button");
      b.className = "category";
      b.textContent = label;
      b.onclick = async () => {
        if (status === "rejected" &&
            !confirm("Reject karein? Stock apne aap wapas nahi badhega, 'Stock badlo' se theek karna hoga.")) return;
        b.disabled = true;
        try {
          await updateDoc(doc(db, "orders", o.id), { status });
          refresh();
        } catch (e) {
          alert("Update nahi hua: " + e.message);
          b.disabled = false;
        }
      };
      box.appendChild(b);
    });
    return box;
  }

  refresh();
}
