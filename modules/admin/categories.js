// Owner: grocery departments (collection `categories`). Add, rename, reorder (up / down) and deactivate.
// Departments are never deleted (firestore.rules), so a product can never point at a missing department.
// The pure rules for names / order live in shared/config/departments.js (unit-tested); firestore.rules re-check everything.
import { db } from "../../shared/config/firebase.js";
import {
  collection, getDocs, doc, addDoc, updateDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  sortDepartments, nameProblem, cleanName, nextOrder, moveDepartment, missingDefaults, DEFAULT_DEPARTMENTS
} from "../../shared/config/departments.js";

const col = collection(db, "categories");
const changed = () => window.dispatchEvent(new Event("categories-changed"));

/** All departments (active and inactive) in shelf order: [{ id, name, order, active }]. */
export async function fetchCategories() {
  const snap = await getDocs(col);
  return sortDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

function mk(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null && text !== "") e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function btn(label, fn, disabled) {
  const b = mk("button", label, "category");
  b.type = "button";
  b.disabled = !!disabled;
  b.onclick = fn;
  return b;
}

export function initCategories() {
  const sec = document.getElementById("categories-section");
  const list = document.getElementById("category-list");
  const form = document.getElementById("category-form");
  const input = document.getElementById("category-name");
  const msg = document.getElementById("category-msg");
  const seedBox = document.getElementById("category-seed");
  sec.hidden = false;
  let items = [];

  const say = (t) => { msg.textContent = t || ""; };

  async function run(fn, failText) {
    try { await fn(); await refresh(); changed(); }
    catch (e) { alert(failText + (e.message || e.code)); await refresh(); }
  }

  function paintSeed() {
    seedBox.textContent = "";
    const missing = missingDefaults(items);
    if (!missing.length) return;
    const all = !items.length;
    seedBox.appendChild(mk("p", all
      ? "Abhi koi department nahi. Ek tap me " + DEFAULT_DEPARTMENTS.length + " grocery departments jod sakte hain; baad me naam, order ya active/inactive badal sakte hain."
      : "Kuch default departments nahi hain (" + missing.length + "). Chaho to unhe jod sakte hain.", "muted"));
    seedBox.appendChild(btn(all ? DEFAULT_DEPARTMENTS.length + " departments jodein" : missing.length + " default jodein", (ev) => {
      ev.currentTarget.disabled = true;
      run(async () => {
        const batch = writeBatch(db);
        missingDefaults(items).forEach((d) =>
          batch.set(doc(col, d.id), { name: d.name, order: d.order, active: true, createdAt: serverTimestamp() }));
        await batch.commit();
      }, "Departments nahi jude: ");
    }));
  }

  function row(d, i) {
    const box = mk("div", "", "shop-card");
    box.appendChild(mk("p", (i + 1) + ". " + d.name + " | " + (d.active ? "Active" : "Inactive")));
    box.appendChild(btn("▲", () => move(d.id, -1), i === 0));
    box.appendChild(btn("▼", () => move(d.id, 1), i === items.length - 1));
    box.appendChild(btn("Naam badlo", () => {
      const v = prompt("Department ka naya naam:", d.name);
      if (v === null) return;
      const why = nameProblem(v, items, d.id);
      if (why) return alert(why);
      run(() => updateDoc(doc(col, d.id), { name: cleanName(v) }), "Naam nahi badla: ");
    }));
    box.appendChild(btn(d.active ? "Inactive karein" : "Active karein",
      () => run(() => updateDoc(doc(col, d.id), { active: !d.active }), "Update nahi hua: ")));
    return box;
  }

  function move(id, dir) {
    const writes = moveDepartment(items, id, dir);
    if (!writes.length) return;
    run(async () => {
      const batch = writeBatch(db);
      writes.forEach((w) => batch.update(doc(col, w.id), { order: w.order }));
      await batch.commit();
    }, "Order nahi badla: ");
  }

  function paint() {
    list.textContent = "";
    if (!items.length) { list.appendChild(mk("div", "Abhi koi department nahi.", "empty")); return; }
    items.forEach((d, i) => list.appendChild(row(d, i)));
  }

  async function refresh() {
    try { items = await fetchCategories(); }
    catch (e) { list.textContent = "Load nahi hua: " + (e.message || e.code); return; }
    paintSeed();
    paint();
  }

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    say("");
    const why = nameProblem(input.value, items);
    if (why) return say(why);
    const b = form.querySelector("button");
    b.disabled = true;
    try {
      await addDoc(col, { name: cleanName(input.value), order: nextOrder(items), active: true, createdAt: serverTimestamp() });
      form.reset();
      await refresh();
      changed();
    } catch (e) {
      say("Save nahi hua: " + (e.message || e.code));
    }
    b.disabled = false;
  };

  list.textContent = "Loading...";
  refresh();
}
