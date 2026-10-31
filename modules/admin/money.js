// Admin: commission rate, shop dues + settlements, stuck-order cancel, block / unblock a user.
// Every change goes through a Cloud Function that re-checks admin and writes adminAudit/. DOM-safe: textContent only.
import { db, app } from "../../shared/config/firebase.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const fns = getFunctions(app, "asia-south1");
const call = (name) => httpsCallable(fns, name);
const mk = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const rs = (paise) => "Rs " + (Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const errMsg = (e) => (e && e.message) ? e.message : "Nahi ho paya. Dobara try karein.";

function field(label, input) { const l = mk("label", "", "fld"); l.append(mk("span", label), input); return l; }

export async function loadMoney(root) {
  root.textContent = "Loading...";
  let rate = "?", wallets = [], names = new Map();
  try {
    const [cfg, w, sh] = await Promise.all([
      getDoc(doc(db, "config", "platform")).catch(() => null),
      getDocs(collection(db, "wallets")),
      getDocs(collection(db, "shops"))
    ]);
    if (cfg && cfg.exists()) rate = String(cfg.data().commissionPercent);
    else rate = "0 (set nahi hai)";
    wallets = w.docs.map((d) => ({ id: d.id, ...d.data() }));
    sh.docs.forEach((d) => names.set(d.id, d.data().name || d.id));
  } catch (e) { root.textContent = "Load nahi hua: " + errMsg(e); return; }

  root.textContent = "";
  const note = mk("p", "", "sheet-msg"); note.setAttribute("role", "status");
  const say = (m, good) => { note.textContent = m; note.classList.toggle("good", !!good); };

  // --- commission rate
  root.append(mk("h2", "Commission rate"), mk("p", "Abhi: " + rate + " %. Dukaan ki bikri (delivery charge chhodkar) par lagta hai.", "muted"));
  const pct = mk("input"); pct.type = "number"; pct.min = "0"; pct.max = "30"; pct.step = "0.01"; pct.placeholder = "jaise 5";
  const setBtn = mk("button", "Rate save karein", "category"); setBtn.type = "button";
  setBtn.onclick = async () => {
    const v = Number(pct.value);
    if (!Number.isFinite(v) || pct.value === "" || v < 0 || v > 30) return say("0 se 30 ke beech rate daalein.");
    if (!confirm("Naye orders ka commission " + v + " % karein?")) return;
    setBtn.disabled = true;
    try { await call("setCommissionRate")({ percent: v }); say("Rate save ho gaya.", true); loadMoney(root); }
    catch (e) { say(errMsg(e)); setBtn.disabled = false; }
  };
  root.append(field("Naya rate (%)", pct), setBtn);

  // --- dues + settlements
  root.append(mk("h2", "Dukaan ka baaki commission"));
  const due = wallets.filter((w) => (w.commissionDuePaise || 0) > 0).sort((a, b) => b.commissionDuePaise - a.commissionDuePaise);
  if (!due.length) root.append(mk("p", "Abhi kisi dukaan ka commission baaki nahi.", "muted"));
  due.forEach((w) => {
    const box = mk("div", "", "shop-card");
    box.append(mk("p", names.get(w.id) || w.id)); box.firstChild.style.fontWeight = "600";
    box.append(mk("p", "Baaki: " + rs(w.commissionDuePaise) + " | Bikri: " + rs(w.totalSalesPaise) + " | Delivered: " + (w.deliveredOrders || 0)));
    const b = mk("button", "Payment mila (settle)", "category"); b.type = "button";
    b.onclick = async () => {
      const a = prompt("Kitne rupaye mile? (max " + (w.commissionDuePaise / 100) + ")");
      if (a === null) return;
      const rupees = Number(a), paise = Math.round(rupees * 100);
      if (!Number.isFinite(rupees) || paise <= 0 || paise > w.commissionDuePaise) return say("Sahi amount daalein (baaki se zyada nahi).");
      const memo = prompt("Note (optional): cash / UPI ref") || "";
      b.disabled = true;
      try { await call("recordSettlement")({ shopId: w.id, amountPaise: paise, memo }); say("Settlement darj ho gaya.", true); loadMoney(root); }
      catch (e) { say(errMsg(e)); b.disabled = false; }
    };
    box.append(b); root.append(box);
  });

  // --- stuck order
  root.append(mk("h2", "Atka hua order cancel karein"), mk("p", "Order ID (poora, order card ya Firestore se). Stock wapas ho jata hai aur customer ko notification jaati hai.", "muted"));
  const oid = mk("input"); oid.placeholder = "Order ID"; oid.maxLength = 40;
  const why = mk("input"); why.placeholder = "Wajah (optional)"; why.maxLength = 100;
  const cb = mk("button", "Order cancel karein", "category"); cb.type = "button";
  cb.onclick = async () => {
    if (!/^[A-Za-z0-9]{10,40}$/.test(oid.value.trim())) return say("Poora order ID daalein.");
    if (!confirm("Ye order cancel karein?")) return;
    cb.disabled = true;
    try { await call("adminCancelOrder")({ orderId: oid.value.trim(), reason: why.value }); say("Order cancel ho gaya.", true); oid.value = ""; }
    catch (e) { say(errMsg(e)); }
    cb.disabled = false;
  };
  root.append(field("Order ID", oid), field("Wajah", why), cb);

  // --- block user
  root.append(mk("h2", "User block / unblock"), mk("p", "Mobile number se dhundhein. Blocked user order, product ya dukaan ka koi kaam nahi kar sakta.", "muted"));
  const ph = mk("input"); ph.type = "tel"; ph.placeholder = "10 digit mobile"; ph.maxLength = 14;
  const fb = mk("button", "Dhundhein", "category"); fb.type = "button";
  const out = mk("div");
  fb.onclick = async () => {
    out.textContent = ""; fb.disabled = true;
    try {
      const r = await call("findUserByPhone")({ query: ph.value });
      const users = (r.data && r.data.users) || [];
      if (!users.length) say("Koi user nahi mila.");
      users.forEach((u) => {
        const row = mk("div", "", "shop-card");
        row.append(mk("p", u.name + " | " + u.role + " | " + (u.status || "active")));
        if (u.role !== "admin") {
          const next = u.status === "blocked" ? "active" : "blocked";
          const b = mk("button", next === "blocked" ? "Block karein" : "Unblock karein", "category"); b.type = "button";
          b.onclick = async () => {
            if (!confirm(u.name + " ko " + next + " karein?")) return;
            b.disabled = true;
            try { await call("setUserStatus")({ uid: u.uid, status: next }); say("Ho gaya: " + next, true); fb.onclick(); }
            catch (e) { say(errMsg(e)); b.disabled = false; }
          };
          row.append(b);
        }
        out.append(row);
      });
    } catch (e) { say(errMsg(e)); }
    fb.disabled = false;
  };
  root.append(field("Mobile", ph), fb, out, note);
}
