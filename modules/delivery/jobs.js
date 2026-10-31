// Rider screen: open pool (accepted orders nobody has taken) + my deliveries.
//  - "Delivery lein" claims an order: status -> out_for_delivery AND deliveryBoyId = me in ONE write.
//    firestore.rules lets only one rider win; the other gets "kisi aur rider ne le liya".
//  - "Delivered" is allowed only for the rider holding the order. The rider collects the COD cash (items + delivery).
import { db } from "../../shared/config/firebase.js";
import { collection, query, where, doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { createWatcher, messageFor } from "../../shared/services/order-events.js";
import { alertUser, notifyPrompt } from "../../shared/services/notify.js";

const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const PHONE_RE = /^[6-9][0-9]{9}$/;   // same pattern firestore.rules enforces before it goes into a tel: link

function mk(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

export function initJobs(user, profile) {
  const sec = document.getElementById("jobs-section");
  const list = document.getElementById("job-list");
  sec.hidden = false;
  sec.insertBefore(notifyPrompt(), list);

  let pool = [], mine = [], tab = null;
  const watcher = createWatcher("rider");

  async function claim(o, b) {
    b.disabled = true;
    try {
      await updateDoc(doc(db, "orders", o.id), {
        status: "out_for_delivery", deliveryBoyId: user.uid,
        riderName: profile.name, riderPhone: profile.phone
      });
      tab = "mine";
    } catch (e) {
      alert(e.code === "permission-denied"
        ? "Ye order kisi aur rider ne le liya ya cancel ho gaya."
        : "Order nahi mila: " + (e.message || e.code));
      b.disabled = false;
    }
  }

  async function deliver(o, b) {
    if (!confirm("Customer se " + money(o.total) + " cash lekar order deliver kar diya?")) return;
    b.disabled = true;
    try { await updateDoc(doc(db, "orders", o.id), { status: "delivered" }); }
    catch (e) { alert("Update nahi hua: " + (e.message || e.code)); b.disabled = false; }
  }

  function card(o, mode) {
    const box = mk("div", "", "shop-card");
    box.appendChild(mk("p", "#" + o.id.slice(0, 6).toUpperCase() + " | " + (o.shopName || "Dukaan"))).style.fontWeight = "600";
    (o.items || []).forEach((it) => box.appendChild(mk("p", it.name + " x " + it.qty + " " + it.unit)).style.margin = "2px 0");
    box.appendChild(mk("p", "Cash lena hai: " + money(o.total) +
      (o.deliveryFee > 0 ? " (saaman " + money(o.subtotal) + " + delivery " + money(o.deliveryFee) + ")" : "")));
    box.appendChild(mk("p", "Pata: " + o.address));
    if (mode === "mine" && o.status === "out_for_delivery") {
      if (PHONE_RE.test(o.phone || "")) {
        const call = mk("a", "Customer ko call karein", "category");
        call.href = "tel:" + o.phone;
        box.appendChild(call);
      }
      const map = mk("a", "Map mein pata dekhein", "category");
      map.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.address + ", Mandawar, Dausa, Rajasthan");
      map.target = "_blank"; map.rel = "noopener";
      box.appendChild(map);
      const done = mk("button", "Delivered", "category");
      done.type = "button";
      done.onclick = () => deliver(o, done);
      box.appendChild(done);
    } else if (mode === "pool") {
      const take = mk("button", "Delivery lein", "category");
      take.type = "button";
      take.onclick = () => claim(o, take);
      box.appendChild(take);
    }
    return box;
  }

  function render() {
    list.textContent = "";
    const active = mine.filter((o) => o.status === "out_for_delivery");
    const past = mine.filter((o) => o.status !== "out_for_delivery");
    if (!tab) tab = active.length ? "mine" : "pool";
    const seg = mk("div", "", "seg");
    seg.setAttribute("role", "tablist");
    [["pool", "Naye orders (" + pool.length + ")"], ["mine", "Meri delivery (" + active.length + ")"], ["past", "Purane"]].forEach(([id, label]) => {
      const b = mk("button", label, id === tab ? "on" : "");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(id === tab));
      b.onclick = () => { tab = id; render(); };
      seg.appendChild(b);
    });
    list.appendChild(seg);
    const shown = tab === "pool" ? pool : tab === "mine" ? active : past;
    if (!shown.length) {
      list.appendChild(mk("div", tab === "pool" ? "Abhi koi naya order nahi hai." : tab === "mine" ? "Abhi aapke paas koi delivery nahi hai." : "Abhi tak koi purani delivery nahi hai.", "empty"));
      return;
    }
    shown.forEach((o) => list.appendChild(card(o, tab === "past" ? "past" : tab)));
  }

  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const fail = (e) => { list.textContent = "Orders load nahi hue: " + (e.message || e.code); };

  list.textContent = "Loading...";
  onSnapshot(query(collection(db, "orders"), where("status", "==", "accepted")), (snap) => {
    pool = rows(snap);
    watcher.feed(pool, { fromCache: snap.metadata.fromCache }).forEach((ev) => alertUser(messageFor(ev)));
    render();
  }, fail);
  onSnapshot(query(collection(db, "orders"), where("deliveryBoyId", "==", user.uid)), (snap) => {
    mine = rows(snap);
    render();
  }, fail);
}
