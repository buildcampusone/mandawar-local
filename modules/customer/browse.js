// Mandawar Mart has ONE store. This screen loads it (storeSettings/main), its active departments (categories)
// and its active products, and hands them to the product grid. No shop list, no back button.
import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, orderBy, limit, getDocs, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initProductGrid } from "./product-grid.js";
import { STORE_ID, activeDepartments } from "../../shared/config/departments.js";
import { locationLabel } from "./home-core.js";
import { t } from "../../shared/i18n/i18n.js";

const $ = (id) => document.getElementById(id);

export function initBrowse(user, profile) {
  const grid = initProductGrid();   // product screen (tiles, cards, ADD stepper, cart bar)
  let store = null;                 // { id, ...storeSettings } once loaded

  $("product-search").oninput = () => grid.search($("product-search").value);

  function say(text) { $("shop-list").textContent = text; }

  // "Deliver to ..." line in the header (tap = open the address screen, wired in customer.html)
  function paintLocation() {
    const a = profile && profile.address;
    $("loc-txt").textContent = a && String(a).trim() ? locationLabel(a) : t("hmAddAddress");
  }
  paintLocation();

  // "Home" tab: the store if it is loaded, otherwise the loading / empty message
  function showHome() {
    $("shops-view").hidden = !!store;
    $("products-view").hidden = !store;
    document.body.classList.toggle("mart-home", !!store);   // green header replaces the topbar + welcome banner (mart.css)
  }

  async function load() {
    say(t("hmStoreLoading"));
    try {
      const snap = await getDoc(doc(db, "storeSettings", STORE_ID));
      if (!snap.exists()) { say(t("hmStoreNotReady")); return; }
      store = { id: STORE_ID, ...snap.data() };
      $("shop-title").textContent = store.name;
      $("product-search").value = "";
      showHome();
      grid.loading();
      // Departments, earlier orders and banners are optional extras: if one cannot be read the products still show.
      const [ps, cs, os, bs] = await Promise.all([
        getDocs(query(collection(db, "products"), where("active", "==", true))),
        getDocs(query(collection(db, "categories"), where("active", "==", true))).catch(() => null),
        user ? getDocs(query(collection(db, "orders"), where("customerUid", "==", user.uid), orderBy("createdAt", "desc"), limit(20))).catch(() => null) : null,
        getDocs(query(collection(db, "banners"), where("active", "==", true))).catch(() => null)
      ]);
      const products = ps.docs.map((p) => ({ id: p.id, ...p.data() }));
      products.sort((a, b) => a.name.localeCompare(b.name));
      const depts = cs ? activeDepartments(cs.docs.map((d) => ({ id: d.id, ...d.data() }))) : [];
      grid.show(store, products, depts, {
        orders: os ? os.docs.map((d) => d.data()) : [],
        banners: bs ? bs.docs.map((d) => ({ id: d.id, ...d.data() })) : []
      });
    } catch (e) {
      if (store) grid.error(t("hmLoadFail"), load);   // store known: keep the header, retry in place
      else say(t("hmLoadFail"));
    }
  }
  load();
  return { showHome, paintLocation };
}
