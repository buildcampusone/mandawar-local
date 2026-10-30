import { applyLang, toggleLang, getLang } from "./i18n.js";
import { CATEGORIES, CAT_BY_ID } from "../../shared/config/categories.js";

/* ---------- Shop-category marquee ----------
   Every kind of local shop (not just grocery) - list lives in shared/config/categories.js.
   Optional image per category: assets/categories/<id>.png (emoji is the fallback). */
const ROWS = 9;          // diagonal rows
const PER_ROW = 9;       // tiles per row (row is duplicated so the -50% loop is seamless)
const hasImg = {};       // id -> true once its png loaded

function labelOf(c) { return getLang() === "hi" ? c.hi : c.en; }

function tile(c) {
  const d = document.createElement("div");
  d.className = "tile";
  d.dataset.cat = c.id;
  const emo = document.createElement("span");
  emo.className = "emo";
  emo.textContent = c.icon;
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  lbl.textContent = labelOf(c);
  d.append(emo, lbl);
  if (hasImg[c.id]) useImage(d, c.id);
  return d;
}
function useImage(tileEl, id) {
  const emo = tileEl.querySelector(".emo");
  if (!emo) return;
  const img = new Image();
  img.alt = ""; img.className = "pic"; img.src = `./assets/categories/${id}.png`;
  emo.replaceWith(img);
}

function buildStage() {
  const stage = document.getElementById("stage");
  const n = CATEGORIES.length;
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement("div");
    row.className = "row" + (r % 2 ? " right" : "");     // alternate: left, right, left ...
    row.style.setProperty("--dur", `${38 + (r % 3) * 8}s`);
    row.style.marginLeft = `${(r % 2) * -64}px`;
    const start = (r * 5) % n;                           // different order per row
    for (let k = 0; k < 2; k++)
      for (let i = 0; i < PER_ROW; i++) row.appendChild(tile(CATEGORIES[(start + i * 2) % n]));
    stage.appendChild(row);
  }
}
buildStage();

// probe optional images once; swap them in only for categories that have one
CATEGORIES.forEach((c) => {
  const probe = new Image();
  probe.onload = () => {
    hasImg[c.id] = true;
    document.querySelectorAll(`.tile[data-cat="${c.id}"]`).forEach((t) => useImage(t, c.id));
  };
  probe.src = `./assets/categories/${c.id}.png`;
});

// labels follow the language pill
document.addEventListener("langchange", () => {
  document.querySelectorAll(".tile").forEach((t) => {
    const c = CAT_BY_ID[t.dataset.cat];
    if (c) t.querySelector(".lbl").textContent = labelOf(c);
  });
});

/* ---------- Language ---------- */
document.getElementById("lang-btn").addEventListener("click", toggleLang);
applyLang();

/* ---------- Password eye ---------- */
const pw = document.getElementById("password");
const eye = document.getElementById("eye");
eye.addEventListener("click", () => {
  const show = pw.type === "password";
  pw.type = show ? "text" : "password";
  eye.classList.toggle("on", show);
});

/* ---------- Continue button enable/disable ---------- */
const $ = (id) => document.getElementById(id);
const signupFields = $("signup-fields");
function valid() {
  const okLogin = $("email").checkValidity() && $("email").value.trim() && pw.value.length >= 6;
  if (signupFields.hidden) return okLogin;
  return okLogin && $("name").value.trim().length > 1 && /^\d{10}$/.test($("phone").value.trim());
}
function refresh() {
  $("submit").disabled = !valid();
  document.body.classList.toggle("is-signup", !signupFields.hidden);
}
$("auth-form").addEventListener("input", () => {
  $("phone").value = $("phone").value.replace(/\D/g, "");
  refresh();
});
document.addEventListener("modechange", refresh);
document.addEventListener("langchange", refresh);
refresh();
