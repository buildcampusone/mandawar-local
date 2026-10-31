// Owner: store open/closed and delivery settings (fee, minimum order, preparation time, pause deliveries).
// firestore.rules re-check every range below, so these checks are for friendly messages, not security.
import { db } from "../../shared/config/firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { t } from "../../shared/i18n/i18n.js";
import { STORE_ID } from "../../shared/config/departments.js";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function initStoreSettings(user, shop) {
  const root = document.getElementById("shop-settings");
  if (!root || !shop) return;
  root.hidden = false;

  const d = (shop.delivery && typeof shop.delivery === "object") ? shop.delivery : {};
  const draft = {
    isOpen: shop.isOpen === true, suspended: d.suspended === true,
    deliveryFee: d.deliveryFee ?? "", minimumOrderAmount: d.minimumOrderAmount ?? "",
    estimatedPreparationMinutes: d.estimatedPreparationMinutes ?? ""
  };
  let msgText = "", msgBad = false;

  function checkRow(key, field) {                 // label wraps the input so the whole row is tappable
    const row = el("label", "fld"), cb = el("input");
    cb.type = "checkbox"; cb.checked = !!draft[field];
    cb.addEventListener("change", () => { draft[field] = cb.checked; });
    row.append(cb, document.createTextNode(" " + t(key)));
    row.style.display = "flex"; row.style.gap = "8px"; row.style.alignItems = "center";
    return row;
  }
  function numberField(key, field, attrs) {
    const row = el("label", "fld"), inp = el("input");
    inp.type = "number"; inp.inputMode = "decimal";
    Object.entries(attrs).forEach(([k, v]) => inp.setAttribute(k, v));
    inp.value = draft[field] === "" ? "" : String(draft[field]);
    inp.addEventListener("input", () => { draft[field] = inp.value; });
    row.append(el("span", null, t(key)), inp);
    return row;
  }

  /** -> { error } or { payload } ready for updateDoc. */
  function validate() {
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const fee = num(draft.deliveryFee), min = num(draft.minimumOrderAmount), prep = num(draft.estimatedPreparationMinutes);
    if (fee !== null && !(Number.isFinite(fee) && fee >= 0 && fee <= 500)) return { error: t("ssBadFee") };
    if (min !== null && !(Number.isFinite(min) && min >= 0 && min <= 10000)) return { error: t("ssBadMin") };
    if (prep !== null && !(Number.isInteger(prep) && prep >= 0 && prep <= 240)) return { error: t("ssBadPrep") };
    const delivery = { suspended: draft.suspended };
    if (fee !== null) delivery.deliveryFee = fee;
    if (min !== null) delivery.minimumOrderAmount = min;
    if (prep !== null) delivery.estimatedPreparationMinutes = prep;
    return { payload: { isOpen: draft.isOpen, delivery } };
  }

  async function save(btn) {
    const v = validate();
    if (v.error) { msgText = v.error; msgBad = true; return build(); }
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "storeSettings", STORE_ID), v.payload);
      msgText = t("ssSaved"); msgBad = false;
    } catch (e) {
      msgText = t("saveFail") + e.message; msgBad = true;
    }
    build();
  }

  function build() {
    root.textContent = "";
    root.style.maxWidth = "420px";
    root.appendChild(el("h2", null, t("ssTitle")));
    root.appendChild(el("p", "muted", t("ssIntro")));
    root.append(checkRow("ssOpen", "isOpen"), checkRow("ssPaused", "suspended"));
    root.append(
      numberField("ssFee", "deliveryFee", { min: "0", max: "500", step: "1" }),
      numberField("ssMin", "minimumOrderAmount", { min: "0", max: "10000", step: "1" }),
      numberField("ssPrep", "estimatedPreparationMinutes", { min: "0", max: "240", step: "1" })
    );
    const msg = el("p", null, msgText);
    msg.setAttribute("role", "status");
    msg.style.color = msgBad ? "var(--danger)" : "var(--primary)";
    const saveBtn = el("button", "category", t("ssSave"));
    saveBtn.type = "button";
    saveBtn.addEventListener("click", () => save(saveBtn));
    root.append(msg, saveBtn);
  }

  document.addEventListener("langchange", build);
  build();
}
