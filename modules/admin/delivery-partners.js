// Admin: Delivery partners. Search a user (phone / name), make or remove a rider, list current riders.
// All reads/writes go through Cloud Functions (users/{uid} is not readable by other users).
// DOM-safe: every piece of user data is set with textContent, never innerHTML.
import { app } from "../../shared/config/firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { t } from "../../shared/i18n/i18n.js";
import { openSheet, btn as sheetBtn, msgLine, setMsg } from "../../shared/components/shell.js";
import { parseQuery, actionFor, roleKey, errorKey } from "./delivery-partners-core.js";

const fns = getFunctions(app, "asia-south1");
const callSetRole = httpsCallable(fns, "setDeliveryRole");
const callFind = httpsCallable(fns, "findUserByPhone");
const callList = httpsCallable(fns, "listDeliveryPartners");

const mk = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

let rootEl = null;
let built = false;
const S = {
  tab: "search", query: "",
  search: { state: "idle", results: [], errKey: "" },     // idle | loading | empty | error | done
  riders: { state: "loading", list: [] },                  // loading | error | done
  notice: ""
};
const pending = new Set();   // uids with a role change in flight
let searchBusy = false;

// ---------------------------------------------------------------- rendering
function build() {
  rootEl.textContent = "";
  rootEl.classList.add("rd");
  rootEl.appendChild(mk("h2", t("rdTitle")));
  rootEl.appendChild(mk("p", t("rdSub"), "muted"));

  const seg = mk("div", "", "seg");
  [["search", "rdTabSearch"], ["riders", "rdTabRiders"]].forEach(([id, key]) => {
    const b = mk("button", t(key));
    b.type = "button";
    if (S.tab === id) b.classList.add("on");
    b.onclick = () => { S.tab = id; build(); if (id === "riders") refreshRiders(); };
    seg.appendChild(b);
  });
  rootEl.appendChild(seg);

  const notice = mk("p", S.notice, "sheet-msg");
  notice.id = "rd-notice";
  notice.setAttribute("role", "status");
  rootEl.appendChild(notice);

  if (S.tab === "search") buildSearch(); else buildRiders();
}

function buildSearch() {
  const row = mk("form", "", "rd-search");
  row.noValidate = true;
  const input = mk("input");
  input.type = "search"; input.maxLength = 40; input.autocomplete = "off"; input.enterKeyHint = "search";
  input.placeholder = t("rdSearchPh");
  input.setAttribute("aria-label", t("rdSearchPh"));
  input.value = S.query;
  const go = mk("button", t(searchBusy ? "rdSearching" : "rdSearchBtn"), "category");
  go.type = "submit"; go.disabled = searchBusy;
  row.append(input, go);
  row.onsubmit = (e) => { e.preventDefault(); S.query = input.value; runSearch(); };
  rootEl.appendChild(row);

  const out = mk("div", "", "rd-out");
  out.id = "rd-results";
  rootEl.appendChild(out);
  renderResults();
}

function renderResults() {
  const out = document.getElementById("rd-results");
  if (!out) return;
  out.textContent = "";
  const r = S.search;
  if (r.state === "idle") out.appendChild(mk("div", t("rdSearchHint"), "empty"));
  else if (r.state === "loading") out.appendChild(mk("div", t("rdSearching"), "empty"));
  else if (r.state === "empty") out.appendChild(mk("div", t("rdNoResult"), "empty"));
  else if (r.state === "error") out.appendChild(errorBox(r.errKey, runSearch));
  else r.results.forEach((u) => out.appendChild(userCard(u, false)));
}

function buildRiders() {
  const out = mk("div", "", "rd-out");
  out.id = "rd-riders";
  rootEl.appendChild(out);
  renderRiders();
}

function renderRiders() {
  const out = document.getElementById("rd-riders");
  if (!out) return;
  out.textContent = "";
  const r = S.riders;
  if (r.state === "loading") out.appendChild(mk("div", t("rdLoading"), "empty"));
  else if (r.state === "error") out.appendChild(errorBox("rdLoadFail", refreshRiders));
  else if (!r.list.length) out.appendChild(mk("div", t("rdRidersEmpty"), "empty"));
  else r.list.forEach((u) => out.appendChild(userCard({ ...u, role: "delivery" }, true)));
}

function errorBox(key, retry) {
  const box = mk("div", "", "empty");
  box.appendChild(mk("p", t(key)));
  const b = mk("button", t("rdRetry"), "category");
  b.type = "button";
  b.onclick = retry;
  box.appendChild(b);
  return box;
}

function userCard(u, fromRiderList) {
  const box = mk("div", "", "shop-card");
  const head = mk("p", u.name || "—");
  head.style.fontWeight = "600";
  head.appendChild(document.createTextNode("  "));
  head.appendChild(mk("span", fromRiderList && u.status ? (u.status === "active" ? t("rdActive") : u.status) : t(roleKey(u.role)),
    "badge" + (u.role === "delivery" ? "" : u.role === "customer" ? " warn" : " bad")));
  box.appendChild(head);
  box.appendChild(mk("p", u.phone || "—", "muted"));

  const action = actionFor(u.role);
  if (!action) { box.appendChild(mk("p", t("rdLocked"), "muted")); return box; }
  const b = mk("button", t(action === "make" ? "rdMake" : "rdRemove"), "category");
  b.type = "button";
  b.disabled = pending.has(u.uid);
  b.onclick = () => confirmChange(u, action === "make");
  box.appendChild(b);
  return box;
}

// ---------------------------------------------------------------- actions
function runSearch() { S.notice = ""; return doSearch(); }

// doSearch keeps S.notice so the "now a rider" message survives the automatic re-search after a change.
async function doSearch() {
  if (searchBusy) return;
  const parsed = parseQuery(S.query);
  if (!parsed.ok) { S.search = { state: "error", results: [], errKey: "rdBadQuery" }; build(); return; }
  searchBusy = true;
  S.search = { state: "loading", results: [], errKey: "" };
  build();
  try {
    const res = await callFind({ query: S.query });
    const users = (res.data && Array.isArray(res.data.users)) ? res.data.users : [];
    S.search = { state: users.length ? "done" : "empty", results: users, errKey: "" };
  } catch (e) {
    S.search = { state: "error", results: [], errKey: errorKey(e) };
  }
  searchBusy = false;
  build();
}

async function refreshRiders() {
  S.riders = { state: "loading", list: [] };
  renderRiders();
  try {
    const res = await callList();
    S.riders = { state: "done", list: (res.data && Array.isArray(res.data.riders)) ? res.data.riders : [] };
  } catch (e) {
    S.riders = { state: "error", list: [] };
  }
  renderRiders();
}

function confirmChange(u, makeDelivery) {
  if (pending.has(u.uid)) return;
  openSheet(t(makeDelivery ? "rdConfirmMake" : "rdConfirmRemove"), (body, close) => {
    const vars = { name: u.name || "—", phone: u.phone || "—" };
    body.appendChild(mk("p", t(makeDelivery ? "rdConfirmMakeSub" : "rdConfirmRemoveSub", vars)));
    const msg = msgLine();
    const yes = sheetBtn(t("rdYes"));
    const no = sheetBtn(t("cancel"), "category ghost");
    no.onclick = close;
    yes.onclick = async () => {
      if (pending.has(u.uid)) return;
      pending.add(u.uid);
      yes.disabled = true; no.disabled = true;
      setMsg(msg, t("rdWorking"));
      try {
        await callSetRole({ uid: u.uid, makeDelivery });
        close();
        S.notice = t(makeDelivery ? "rdMadeOk" : "rdRemovedOk", vars);
        // the row we just changed is stale: re-run the search / reload riders from the server
        if (S.tab === "search" && S.search.state === "done") { pending.delete(u.uid); await doSearch(); }
        else { pending.delete(u.uid); build(); if (S.tab === "riders") refreshRiders(); }
      } catch (e) {
        pending.delete(u.uid);
        yes.disabled = false; no.disabled = false;
        setMsg(msg, t(errorKey(e)), true);
      }
    };
    body.append(msg, yes, no);
  });
}

// ---------------------------------------------------------------- entry point
export function loadDeliveryPartners(root) {
  rootEl = root;
  if (!built) {
    built = true;
    document.addEventListener("langchange", () => { if (rootEl) build(); });
  }
  build();
  refreshRiders();
}
