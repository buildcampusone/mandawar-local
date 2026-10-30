import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { catFull } from "../../shared/config/categories.js";

const TONE = { pending: "warn", approved: "", rejected: "bad" };
const NAME = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

function mk(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

export async function loadPendingShops(listEl) {
  await load(listEl, query(collection(db, "shops"), where("status", "==", "pending")),
    "Koi pending dukaan nahi.", () => loadPendingShops(listEl));
}

export async function loadAllShops(listEl) {
  await load(listEl, query(collection(db, "shops")),
    "Abhi tak koi dukaan register nahi hui.", () => loadAllShops(listEl));
}

async function load(listEl, q, emptyText, reload) {
  listEl.textContent = "Loading...";
  try {
    const snap = await getDocs(q);
    listEl.textContent = "";
    if (snap.empty) { listEl.appendChild(mk("div", emptyText, "empty")); return; }
    snap.forEach((d) => listEl.appendChild(card(d.id, d.data(), reload)));
  } catch (e) {
    listEl.textContent = "Load nahi hua: " + e.message;
  }
}

function card(id, s, reload) {
  const box = mk("div", "", "shop-card");
  const head = mk("p", "");
  head.style.fontWeight = "600";
  head.textContent = s.name + "  ";
  head.appendChild(mk("span", NAME[s.status] || s.status, "badge " + (TONE[s.status] || "")));
  box.appendChild(head);
  box.appendChild(mk("p", catFull(s.category) + " | " + s.phone));
  box.appendChild(mk("p", s.address, "muted"));
  if (s.status !== "approved") box.appendChild(btn("Approve", () => setStatus(id, "approved", reload)));
  if (s.status !== "rejected") box.appendChild(btn("Reject", () => setStatus(id, "rejected", reload)));
  return box;
}

function btn(label, fn) {
  const b = mk("button", label, "category");
  b.type = "button";
  b.onclick = fn;
  return b;
}

async function setStatus(id, status, reload) {
  try {
    await updateDoc(doc(db, "shops", id), { status });
    reload();
  } catch (e) {
    alert("Update nahi hua: " + e.message);
  }
}
