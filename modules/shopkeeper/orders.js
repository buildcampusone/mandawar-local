import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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

  async function refresh() {
    list.textContent = "Loading...";
    try {
      const snap = await getDocs(query(collection(db, "orders"),
        where("shopId", "==", user.uid)));
      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      list.textContent = "";
      if (!orders.length) { list.textContent = "Abhi koi order nahi."; return; }
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
