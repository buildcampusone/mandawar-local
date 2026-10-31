// Owner customers: who ordered, how much, call / block. Data comes from the `listCustomers` Cloud Function
// (users/{uid} is not readable from the browser). Blocking reuses the existing `setUserStatus` function (audited server-side).
import { app } from "../../shared/config/firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const fns = getFunctions(app, "asia-south1");
const callList = httpsCallable(fns, "listCustomers");
const callStatus = httpsCallable(fns, "setUserStatus");

const mk = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null && text !== "") e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const SORTS = { recent: "Naye pehle", spent: "Sabse zyada kharch", orders: "Sabse zyada order" };
const day = (ms) => (ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-");

let root = null, data = null, q = "", sort = "recent", failed = "", busy = new Set();

export function initCustomers(el) { root = el; load(); }
export function reloadCustomers() { if (root && !data) load(); }

async function load() {
  failed = ""; data = null; paint();
  try { data = (await callList()).data; }
  catch (e) { failed = (e && e.message) || "Load nahi hua."; }
  paint();
}

function visible() {
  const needle = q.trim().toLowerCase();
  const rows = data.customers.filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.includes(needle));
  const by = { recent: (a, b) => b.joinedAt - a.joinedAt, spent: (a, b) => b.spent - a.spent, orders: (a, b) => b.orders - a.orders };
  return rows.sort(by[sort] || by.recent);
}

function paint() {
  const keep = document.activeElement && document.activeElement.id === "cu-q";
  root.textContent = "";
  root.appendChild(mk("h2", "Customers"));
  root.appendChild(mk("p", "Aapke customers, unke order aur kharch. Block karne par customer naya order nahi de sakta.", "muted"));
  if (failed) {
    root.appendChild(mk("p", failed, "cv-bad"));
    const b = mk("button", "Dobara try karein", "category"); b.type = "button"; b.onclick = load; root.appendChild(b);
    return;
  }
  if (!data) { root.appendChild(mk("p", "Loading...", "muted")); return; }

  const bar = mk("div", "", "inv-bar");
  const search = mk("input"); search.id = "cu-q"; search.type = "search"; search.placeholder = "Naam ya mobile se dhoondhein"; search.value = q; search.maxLength = 40;
  search.setAttribute("aria-label", "Customer dhoondhein");
  search.oninput = () => { q = search.value; paintList(); };
  const sel = mk("select"); sel.setAttribute("aria-label", "Sort");
  Object.entries(SORTS).forEach(([v, l]) => sel.add(new Option(l, v)));
  sel.value = sort;
  sel.onchange = () => { sort = sel.value; paintList(); };
  bar.append(search, sel);
  root.appendChild(bar);
  if (data.truncated) root.appendChild(mk("p", "Sirf pehle " + data.customers.length + " customers aur haal ke orders ginti me liye gaye hain; aankde adhoore ho sakte hain.", "muted"));
  const list = mk("div"); list.id = "cu-list"; root.appendChild(list);
  paintList();
  if (keep) { search.focus(); search.setSelectionRange(q.length, q.length); }
}

function paintList() {
  const list = root.querySelector("#cu-list");
  if (!list) return;
  list.textContent = "";
  list.appendChild(mk("p", data.customers.length + " customers", "muted"));
  const rows = visible();
  if (!rows.length) { list.appendChild(mk("div", data.customers.length ? "Koi customer nahi mila." : "Abhi koi customer nahi.", "empty")); return; }
  rows.forEach((c) => list.appendChild(row(c)));
}

function row(c) {
  const box = mk("div", "", "shop-card");
  const head = mk("p", "", "inv-name");
  head.appendChild(document.createTextNode((c.name || "(naam nahi)") + " "));
  if (c.status === "blocked") head.appendChild(mk("span", "Blocked", "inv-badge inv-out"));
  box.appendChild(head);
  box.appendChild(mk("p", c.orders + " order | " + c.delivered + " delivered | Rs " + c.spent.toLocaleString("en-IN") + " kharch", "muted"));
  box.appendChild(mk("p", "Join: " + day(c.joinedAt) + " | Aakhri order: " + day(c.lastOrderAt), "muted"));
  if (/^[6-9][0-9]{9}$/.test(c.phone)) {
    const a = mk("a", "Call: " + c.phone, "category"); a.href = "tel:+91" + c.phone; box.appendChild(a);
  }
  const b = mk("button", c.status === "blocked" ? "Unblock karein" : "Block karein", "category" + (c.status === "blocked" ? "" : " ghost"));
  b.type = "button"; b.disabled = busy.has(c.uid);
  b.onclick = async () => {
    const to = c.status === "blocked" ? "active" : "blocked";
    if (to === "blocked" && !confirm((c.name || "Is customer") + " ko block karein? Wo naya order nahi de payega.")) return;
    busy.add(c.uid); paintList();
    try { await callStatus({ uid: c.uid, status: to }); c.status = to; }
    catch (e) { alert("Nahi hua: " + ((e && e.message) || "")); }
    busy.delete(c.uid); paintList();
  };
  box.appendChild(b);
  return box;
}
