// Owner coupons: create, pause / resume, delete. Document id = the code (so a code is unique by construction).
// Customers will be able to apply them at checkout in Phase 7; until then they are stored and visible here only.
import { db } from "../../shared/config/firebase.js";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { cleanCoupon, couponState, describe } from "./coupons-core.js";

const col = collection(db, "coupons");
const mk = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null && text !== "") e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const btn = (label, fn, cls = "category") => { const b = mk("button", label, cls); b.type = "button"; b.onclick = fn; return b; };
const STATE_TXT = { active: "Active", paused: "Band", expired: "Expire ho gaya" };
const fmtDate = (v) => {
  const d = v && typeof v.toDate === "function" ? v.toDate() : null;
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
};

let root = null, items = [], adding = false;

export function initCoupons(el) { root = el; load(); }

async function load() {
  root.textContent = "";
  root.appendChild(mk("p", "Loading...", "muted"));
  try {
    const snap = await getDocs(col);
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt && b.createdAt.seconds || 0) - (a.createdAt && a.createdAt.seconds || 0));
    paint();
  } catch (e) {
    root.textContent = "";
    root.appendChild(mk("p", "Coupons load nahi hue: " + (e.message || e.code), "cv-bad"));
    root.appendChild(btn("Dobara try karein", load));
  }
}

async function run(fn, failText) {
  try { await fn(); } catch (e) { alert(failText + (e.message || e.code)); }
  await load();
}

function paint() {
  root.textContent = "";
  root.appendChild(mk("h2", "Coupons"));
  root.appendChild(mk("p", "Discount codes banayein. Customer ke checkout par coupon lagane ka option agle phase me aayega; tab tak yahan code taiyaar rakh sakte hain.", "muted"));
  root.appendChild(adding ? form() : btn("+ Naya coupon", () => { adding = true; paint(); }));
  const list = mk("div");
  if (!items.length) list.appendChild(mk("div", "Abhi koi coupon nahi.", "empty"));
  items.forEach((c) => list.appendChild(row(c)));
  root.appendChild(list);
}

function row(c) {
  const st = couponState(c);
  const box = mk("div", "", "shop-card");
  const head = mk("p", "", "inv-name");
  head.append(mk("span", c.id, "cp-code"), document.createTextNode(" "), mk("span", STATE_TXT[st], "inv-badge " + (st === "active" ? "inv-ok" : "inv-low")));
  box.appendChild(head);
  box.appendChild(mk("p", describe(c) + (c.expiresAt ? " | Aakhri tareekh: " + fmtDate(c.expiresAt) : ""), "muted"));
  if (st !== "expired") box.appendChild(btn(c.active ? "Band karein" : "Chalu karein", () => run(() => updateDoc(doc(col, c.id), { active: !c.active }), "Update nahi hua: ")));
  box.appendChild(btn("Hatayein", () => {
    if (!confirm("Coupon " + c.id + " hata dein?")) return;
    run(() => deleteDoc(doc(col, c.id)), "Coupon nahi hata: ");
  }));
  return box;
}

function form() {
  const f = mk("form", "", "bn-form");
  f.noValidate = true;
  f.appendChild(mk("h3", "Naya coupon"));
  const inp = (ph, attrs = {}) => { const i = mk("input"); i.placeholder = ph; i.setAttribute("aria-label", ph); Object.entries(attrs).forEach(([k, v]) => i.setAttribute(k, v)); return i; };
  const code = inp("Code (jaise SAVE10)", { maxlength: 16, autocapitalize: "characters", autocomplete: "off" });
  const type = mk("select"); type.setAttribute("aria-label", "Discount ka tarika");
  type.add(new Option("Percent (%) off", "percent")); type.add(new Option("Flat Rs off", "flat"));
  const value = inp("Discount (percent ya Rs)", { type: "number", inputmode: "decimal", min: 1, step: "any" });
  const min = inp("Minimum order Rs (optional)", { type: "number", inputmode: "decimal", min: 0 });
  const max = inp("Max discount Rs (sirf percent, optional)", { type: "number", inputmode: "decimal", min: 1 });
  const exp = inp("Aakhri tareekh (optional)", { type: "date" });
  const el = mk("label", "", "fld"); el.append(mk("span", "Aakhri tareekh (optional)"), exp);
  type.onchange = () => { max.hidden = type.value !== "percent"; };
  const msg = mk("p", "", "sheet-msg"); msg.setAttribute("role", "status");
  const save = mk("button", "Coupon banayein", "category"); save.type = "submit";
  f.append(code, type, value, min, max, el, msg, save, btn("Raddh karein", () => { adding = false; paint(); }, "category ghost"));

  f.onsubmit = async (ev) => {
    ev.preventDefault();
    msg.classList.remove("bad"); msg.textContent = "";
    const r = cleanCoupon({ code: code.value, type: type.value, value: value.value, minOrder: min.value, maxDiscount: max.value, expiresAt: exp.value, active: true });
    if (r.error) { msg.classList.add("bad"); msg.textContent = r.error; return; }
    if (items.some((c) => c.id === r.code)) { msg.classList.add("bad"); msg.textContent = "Ye code pehle se hai."; return; }
    save.disabled = true;
    try {
      await setDoc(doc(col, r.code), { ...r.data, createdAt: serverTimestamp() });
      adding = false;
      await load();
    } catch (e) {
      msg.classList.add("bad"); msg.textContent = "Save nahi hua: " + (e.message || e.code);
      save.disabled = false;
    }
  };
  return f;
}
