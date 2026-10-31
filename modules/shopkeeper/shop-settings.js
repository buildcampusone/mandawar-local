// Shopkeeper: open/closed, delivery settings and shop location. This is what makes a shop appear as
// "delivers to you" in the customer's Nearby tab. Only approved shops can save (see firestore.rules);
// the rules re-check every range below, so these checks are for friendly messages, not security.
import { db } from "../../shared/config/firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { t } from "../../shared/i18n/i18n.js";
import { isValidCoord } from "../../shared/services/geo.js";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function initShopSettings(user, shop) {
  const root = document.getElementById("shop-settings");
  if (!root || !shop || shop.status !== "approved") return;
  root.hidden = false;

  const d = (shop.delivery && typeof shop.delivery === "object") ? shop.delivery : {};
  const draft = {
    isOpen: shop.isOpen === true,
    location: isValidCoord(shop.location) ? { latitude: shop.location.latitude, longitude: shop.location.longitude } : null,
    accuracy: null,
    enabled: d.enabled === true, suspended: d.suspended === true,
    radiusKm: d.radiusKm ?? "", deliveryFee: d.deliveryFee ?? "",
    minimumOrderAmount: d.minimumOrderAmount ?? "", estimatedPreparationMinutes: d.estimatedPreparationMinutes ?? ""
  };
  let msgText = "", msgBad = false, locating = false;

  function check(label) {                         // label wraps an input so the whole row is tappable
    return (key, field) => {
      const row = el("label", "fld"), cb = el("input");
      cb.type = "checkbox"; cb.checked = !!draft[field];
      cb.addEventListener("change", () => { draft[field] = cb.checked; });
      row.append(cb, document.createTextNode(" " + t(key)));
      row.style.display = "flex"; row.style.gap = "8px"; row.style.alignItems = "center";
      return row;
    };
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

  function useGps() {
    if (!navigator.geolocation) { msgText = t("nbLocUnavailable"); msgBad = true; return build(); }
    locating = true; msgText = ""; build();
    navigator.geolocation.getCurrentPosition((pos) => {
      locating = false;
      const c = pos && pos.coords;
      if (isValidCoord(c)) {
        draft.location = { latitude: Math.round(c.latitude * 1e5) / 1e5, longitude: Math.round(c.longitude * 1e5) / 1e5 };
        draft.accuracy = Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null;
        msgText = ""; msgBad = false;
      } else { msgText = t("nbLocError"); msgBad = true; }
      build();
    }, (err) => {
      locating = false; msgBad = true;
      msgText = t(err && err.code === 1 ? "nbLocDenied" : err && err.code === 3 ? "nbLocTimeout" : "nbLocUnavailable");
      build();
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  /** -> { error } or { payload } ready for updateDoc. */
  function validate() {
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const radius = num(draft.radiusKm), fee = num(draft.deliveryFee), min = num(draft.minimumOrderAmount), prep = num(draft.estimatedPreparationMinutes);
    if (radius !== null && !(Number.isFinite(radius) && radius > 0 && radius <= 50)) return { error: t("ssBadRadius") };
    if (draft.enabled && radius === null) return { error: t("ssBadRadius") };
    if (fee !== null && !(Number.isFinite(fee) && fee >= 0 && fee <= 500)) return { error: t("ssBadFee") };
    if (min !== null && !(Number.isFinite(min) && min >= 0 && min <= 10000)) return { error: t("ssBadMin") };
    if (prep !== null && !(Number.isInteger(prep) && prep >= 0 && prep <= 240)) return { error: t("ssBadPrep") };
    if (draft.enabled && !draft.location) return { error: t("ssNeedLoc") };
    const delivery = { enabled: draft.enabled, suspended: draft.suspended };
    if (radius !== null) delivery.radiusKm = radius;
    if (fee !== null) delivery.deliveryFee = fee;
    if (min !== null) delivery.minimumOrderAmount = min;
    if (prep !== null) delivery.estimatedPreparationMinutes = prep;
    const payload = { isOpen: draft.isOpen, delivery };
    if (draft.location) payload.location = { latitude: draft.location.latitude, longitude: draft.location.longitude };
    return { payload };
  }

  async function save(btn) {
    const v = validate();
    if (v.error) { msgText = v.error; msgBad = true; return build(); }
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "shops", user.uid), v.payload);
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
    const mk = check();
    root.append(mk("ssOpen", "isOpen"), mk("ssDelivery", "enabled"), mk("ssPaused", "suspended"));

    const locBox = el("div", "fld");
    locBox.appendChild(el("p", null, draft.location
      ? t("ssLocSet") + ": " + draft.location.latitude.toFixed(5) + ", " + draft.location.longitude.toFixed(5) + (draft.accuracy != null ? " (" + t("ssAccuracy", { n: draft.accuracy }) + ")" : "")
      : t("ssLocNotSet")));
    const gpsBtn = el("button", "category", locating ? t("ssLocating") : t("ssUseGps"));
    gpsBtn.type = "button"; gpsBtn.disabled = locating;
    gpsBtn.addEventListener("click", useGps);
    locBox.append(gpsBtn, el("p", "muted", t("ssGpsHint")));
    root.appendChild(locBox);

    root.append(
      numberField("ssRadius", "radiusKm", { min: "0.5", max: "50", step: "0.5" }),
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
