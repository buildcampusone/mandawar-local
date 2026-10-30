import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const LABEL = {
  placed: ["Order bheja gaya", ""], accepted: ["Dukaan ne accept kiya", ""],
  rejected: ["Dukaan ne reject kiya", "bad"], out_for_delivery: ["Delivery par", ""],
  delivered: ["Delivered", ""], cancelled: ["Cancel kiya", "bad"]
};

export function initMyOrders(user) {
  const list = document.getElementById("my-order-list");

  function mk(tag, text, cls) {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function card(o, refresh) {
    const box = mk("div", "", "shop-card");
    const [txt, tone] = LABEL[o.status] || [o.status, ""];
    const head = mk("p", "");
    head.style.fontWeight = "600";
    head.textContent = (o.shopName || "Dukaan") + "  ";
    head.appendChild(mk("span", txt, "badge " + tone));
    box.appendChild(head);
    box.appendChild(mk("p", "#" + o.id.slice(0, 6) + (o.createdAt ? " | " + o.createdAt.toDate().toLocaleString() : ""), "muted"));
    o.items.forEach((it) => box.appendChild(mk("p", it.name + " x " + it.qty + " " + it.unit + " (Rs " + it.price + ")")));
    box.appendChild(mk("p", "Total: Rs " + Number(o.total).toFixed(2) + " (COD)"));
    if (o.status === "placed") {
      const b = mk("button", "Order cancel karein", "category");
      b.onclick = async () => {
        if (!confirm("Ye order cancel karein?")) return;
        b.disabled = true;
        try { await updateDoc(doc(db, "orders", o.id), { status: "cancelled" }); refresh(); }
        catch (e) { alert("Cancel nahi hua: " + e.message); b.disabled = false; }
      };
      box.appendChild(b);
    }
    return box;
  }

  async function refresh() {
    list.textContent = "Loading...";
    try {
      const snap = await getDocs(query(collection(db, "orders"), where("customerUid", "==", user.uid)));
      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      list.textContent = "";
      if (!orders.length) { list.appendChild(mk("div", "Abhi tak koi order nahi diya.", "empty")); return; }
      orders.forEach((o) => list.appendChild(card(o, refresh)));
    } catch (e) {
      list.textContent = "Load nahi hua: " + e.message;
    }
  }
  return refresh;
}
