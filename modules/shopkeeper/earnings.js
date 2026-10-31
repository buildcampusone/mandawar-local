// Shopkeeper: my sales, commission still owed to the platform, and the last delivered orders (read-only).
// wallets/{shopId} and ledger/* are written only by Cloud Functions; the owner can read them (firestore.rules).
import { db } from "../../shared/config/firebase.js";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const mk = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const rs = (paise) => "Rs " + (Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function initEarnings(user) {
  const sec = document.getElementById("earnings-section");
  const box = document.getElementById("earnings-body");
  sec.hidden = false;
  const paint = (w, rows) => {
    box.textContent = "";
    const d = mk("div", "", "shop-card");
    d.append(mk("p", "Commission baaki: " + rs(w.commissionDuePaise)));
    d.firstChild.style.fontWeight = "600";
    d.append(
      mk("p", "Kul bikri (saaman): " + rs(w.totalSalesPaise)),
      mk("p", "Kul commission: " + rs(w.totalCommissionPaise) + " | Chukaya: " + rs(w.totalSettledPaise)),
      mk("p", "Delivered orders: " + (w.deliveredOrders || 0)),
      mk("p", "Delivery mein rider customer se cash leta hai. Commission admin ko dena hota hai; payment milne par admin ise 'settle' karta hai.", "muted"));
    box.append(d);
    if (rows.length) box.append(mk("h3", "Pichhle delivered orders"));
    rows.forEach((r) => {
      const when = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleDateString() : "";
      box.append(mk("p", "#" + r.id.slice(0, 6).toUpperCase() + " | " + when + " | Bikri " + rs(r.itemsPaise) + " | Commission " + rs(r.commissionPaise) + " (" + r.ratePercent + "%)"));
    });
  };
  async function rows() {
    try {
      const s = await getDocs(query(collection(db, "ledger"), where("shopId", "==", user.uid), orderBy("createdAt", "desc"), limit(30)));
      return s.docs.map((x) => ({ id: x.id, ...x.data() }));
    } catch (e) { return []; }
  }
  onSnapshot(doc(db, "wallets", user.uid), async (s) => paint(s.exists() ? s.data() : {}, await rows()),
    () => { box.textContent = "Kamai abhi load nahi hui."; });
}
