import { applyLang, toggleLang, getLang } from "./i18n.js";

/* The old 17-category tile marquee is gone (Phase 3). Grocery departments get their own tiles in Phase 4. */

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
