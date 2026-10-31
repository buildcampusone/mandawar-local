// Mandawar Mart has ONE store. This screen loads it (storeSettings/main), its active departments (categories)
// and its active products, and hands them to the product grid. No shop list, no back button.
import { db } from "../../shared/config/firebase.js";
import {
  collection, query, where, orderBy, limit, getDocs, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initProductGrid } from "./product-grid.js";
import { STORE_ID, activeDepartments } from "../../shared/config/departments.js";
import { locationLabel } from "./home-core.js";

const $ = (id) => document.getElementById(id);

export function initBrowse(user, profile) {
  const grid = initProductGrid();   // product screen (tiles, cards, ADD stepper, cart bar)
  let store = null;                 // { id, ...storeSettings } once loaded

  $("back-btn").hidden = true;      // nothing to go back to: there is only one store
  $("product-search").oninput = () => grid.search($("product-search").value);

  function say(text) { $("shop-list").textContent = text; }

  // "Deliver to ..." line in the header (tap = open the address screen, wired in customer.html)
  function paintLocation() { $("loc-txt").textContent = locationLabel(profile && profile.address); }
  paintLocation();

  // "Home" tab: the store if it is loaded, otherwise the loading / empty message
  function showHome() {
    $("shops-view").hidden = !!store;
    $("products-view").hidden = !store;
  }

  async function load() {
    say("Store khul raha hai...");
    try {
      const snap = await getDoc(doc(db, "storeSettings", STORE_ID));
      if (!snap.exists()) { say("Store abhi taiyaar nahi hai. Thodi der baad dekhein."); return; }
      store = { id: STORE_ID, ...snap.data() };
      $("shop-title").textContent = store.name;
      $("product-search").value = "";
      $("group-nav").hidden = true;
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
      if (store) grid.error("Load nahi hua. Internet jaanchkar dobara try karein.", load);   // store known: keep the header, retry in place
      else say("Load nahi hua: " + e.message);
    }
  }
  load();
  return { showHome, paintLocation };
}
