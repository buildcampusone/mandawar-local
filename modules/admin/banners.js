// Owner banners: the swipe strip on the customer home. Add (with a wide photo), edit text / tap target, reorder, pause, delete.
// firestore.rules validBanner re-checks every field; the pure form logic is in banners-core.js (unit-tested).
import { db } from "../../shared/config/firebase.js";
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { photoToDataUrl } from "../../shared/services/image.js";
import { fetchCategories } from "./categories.js";
import { targetOptions, cleanBanner, sortBanners, nextBannerOrder, moveBanner, activeWarning, LIMITS } from "./banners-core.js";

const col = collection(db, "banners");
const mk = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null && text !== "") e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const btn = (label, fn, disabled, cls = "category") => {
  const b = mk("button", label, cls); b.type = "button"; b.disabled = !!disabled; b.onclick = fn; return b;
};
const BANNER_W = 480, BANNER_H = 180;     // 8:3, ~15 KB as JPEG; rules allow up to 40,000 characters

let root = null, items = [], depts = [], editing = null;   // editing: null | "new" | banner id
const label = (v) => (targetOptions(depts).find((o) => o.value === v) || { label: v ? "Department: " + v : "Kuch nahi" }).label;

export function initBanners(el) { root = el; load(); }
window.addEventListener("categories-changed", () => { if (root) load(); });

async function load() {
  root.textContent = "";
  root.appendChild(mk("p", "Loading...", "muted"));
  try {
    const [snap, c] = await Promise.all([getDocs(col), fetchCategories().catch(() => [])]);
    items = sortBanners(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    depts = c;
    paint();
  } catch (e) {
    root.textContent = "";
    root.appendChild(mk("p", "Banners load nahi hue: " + (e.message || e.code), "cv-bad"));
    root.appendChild(btn("Dobara try karein", load));
  }
}

async function run(fn, failText) {
  try { await fn(); await load(); }
  catch (e) { alert(failText + (e.message || e.code)); await load(); }
}

function paint() {
  root.textContent = "";
  root.appendChild(mk("h2", "Banners"));
  root.appendChild(mk("p", "Customer home ke upar ghoomne wali offer strip. Pehle " + 6 + " active banner dikhte hain. Photo na ho to hari background dikhegi.", "muted"));
  const warn = activeWarning(items);
  if (warn) root.appendChild(mk("p", warn, "cv-bad"));
  if (editing === null) root.appendChild(btn("+ Naya banner", () => { editing = "new"; paint(); }));
  else root.appendChild(form(editing === "new" ? null : items.find((b) => b.id === editing)));
  const list = mk("div");
  if (!items.length) list.appendChild(mk("div", "Abhi koi banner nahi.", "empty"));
  items.forEach((b, i) => list.appendChild(row(b, i)));
  root.appendChild(list);
}

function row(b, i) {
  const box = mk("div", "", "shop-card");
  const top = mk("div", "", "prow");
  const ph = mk("div", "", "bn-thumb");
  if (typeof b.image === "string" && b.image.startsWith("data:image/jpeg;base64,")) {
    const im = document.createElement("img"); im.src = b.image; im.alt = ""; ph.appendChild(im);
  }
  top.appendChild(ph);
  const info = mk("div", "", "pr-txt");
  info.appendChild(mk("p", (i + 1) + ". " + b.title, "inv-name"));
  if (b.subtitle) info.appendChild(mk("p", b.subtitle, "muted"));
  info.appendChild(mk("p", "Tap: " + label(b.target || "") + " | " + (b.active ? "Active" : "Band"), "muted"));
  top.appendChild(info);
  box.appendChild(top);
  box.appendChild(btn("▲", () => move(b.id, -1), i === 0));
  box.appendChild(btn("▼", () => move(b.id, 1), i === items.length - 1));
  box.appendChild(btn("Badlo", () => { editing = b.id; paint(); root.scrollIntoView({ behavior: "smooth" }); }));
  box.appendChild(btn(b.active ? "Band karein" : "Chalu karein", () => run(() => updateDoc(doc(col, b.id), { active: !b.active }), "Update nahi hua: ")));
  box.appendChild(btn("Hatayein", () => {
    if (!confirm("Banner \"" + b.title + "\" hamesha ke liye hata dein?")) return;
    run(() => deleteDoc(doc(col, b.id)), "Banner nahi hata: ");   // gaps in `order` are harmless: the strip only sorts
  }));
  return box;
}

function move(id, dir) {
  const writes = moveBanner(items, id, dir);
  if (!writes.length) return;
  run(async () => {
    const batch = writeBatch(db);
    writes.forEach((w) => batch.update(doc(col, w.id), { order: w.order }));
    await batch.commit();
  }, "Order nahi badla: ");
}

function form(b) {
  const f = mk("form", "", "bn-form");
  f.noValidate = true;
  f.appendChild(mk("h3", b ? "Banner badlo" : "Naya banner"));
  const title = mk("input"); title.placeholder = "Title (jaise Diwali Sale)"; title.maxLength = LIMITS.title; title.value = b ? b.title : "";
  title.setAttribute("aria-label", "Title");
  const sub = mk("input"); sub.placeholder = "Subtitle (optional)"; sub.maxLength = LIMITS.subtitle; sub.value = b && b.subtitle ? b.subtitle : "";
  sub.setAttribute("aria-label", "Subtitle");
  const tgt = mk("select"); tgt.setAttribute("aria-label", "Tap karne par kahan jaye");
  targetOptions(depts).forEach((o) => tgt.add(new Option(o.label, o.value)));
  const cur = b && b.target ? b.target : "";
  if (cur && ![...tgt.options].some((o) => o.value === cur)) tgt.add(new Option("Department: " + cur, cur));   // keep an old / inactive target visible
  tgt.value = cur;
  const file = mk("input"); file.type = "file"; file.accept = "image/*";
  const fl = mk("label", "", "fld");
  fl.append(mk("span", b && b.image ? "Nayi photo (khaali = purani rahegi)" : "Photo (optional, chaudi photo achhi lagti hai)"), file);
  const msg = mk("p", "", "sheet-msg"); msg.setAttribute("role", "status");
  const save = mk("button", b ? "Save karein" : "Banner jodein", "category"); save.type = "submit";
  const cancel = btn("Raddh karein", () => { editing = null; paint(); }, false, "category ghost");
  f.append(title, sub, tgt, fl, msg, save, cancel);

  f.onsubmit = async (ev) => {
    ev.preventDefault();
    msg.classList.remove("bad"); msg.textContent = "";
    const r = cleanBanner({ title: title.value, subtitle: sub.value, target: tgt.value });
    if (r.error) { msg.classList.add("bad"); msg.textContent = r.error; return; }
    save.disabled = true;
    try {
      const data = { ...r.data };
      if (file.files[0]) data.image = await photoToDataUrl(file.files[0], BANNER_W, BANNER_H);
      if (b) {
        if (!data.subtitle) data.subtitle = deleteField();
        if (!data.target) data.target = deleteField();
        await updateDoc(doc(col, b.id), data);
      } else {
        await addDoc(col, { ...data, order: nextBannerOrder(items), active: true, createdAt: serverTimestamp() });
      }
      editing = null;
      await load();
    } catch (e) {
      msg.classList.add("bad"); msg.textContent = "Save nahi hua: " + (e.message || e.code);
      save.disabled = false;
    }
  };
  return f;
}
