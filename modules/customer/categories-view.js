// Categories screen (bottom-nav "Categories"): green header (delivery line, search, tab strip) + departments grouped in 4-column tiles.
// Tap a tile / tab = go to Home and scroll to that department (event "mart-open", handled in product-grid.js).
import { db } from "../../shared/config/firebase.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { activeDepartments } from "../../shared/config/departments.js";
import { locationLabel } from "./home-core.js";
import { groupDepartments, TABS } from "./categories-core.js";

const ICON = {
  deals: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  fresh: '<path d="M12 7c-3-3-8-1-8 4 0 5 4 9 8 9s8-4 8-9c0-5-5-7-8-4z"/><path d="M12 7c0-2 1-3 3-4"/>',
  categories: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  rice: '<path d="M12 21v-9M12 12c-4 0-6-3-6-7 4 0 6 3 6 7zM12 12c4 0 6-3 6-7-4 0-6 3-6 7z"/>',
  kirana: '<path d="M3 9l2-5h14l2 5M4 9v11h16V9M9 20v-6h6v6"/>'
};
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svg = (p) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = p; return s; };

export function initCategories(profile, { onOpen } = {}) {
  const root = document.getElementById("categories-view");
  let depts = null, q = "", loading = false, failed = false;

  const header = mk("div", "cv-head");
  const loc = mk("p", "cv-loc");
  const search = mk("div", "cv-search");
  const input = mk("input"); input.type = "search"; input.placeholder = 'Search for "Atta"'; input.autocomplete = "off"; input.setAttribute("aria-label", "Search departments");
  search.append(svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'), input);
  const tabs = mk("nav", "cv-tabs"); tabs.setAttribute("aria-label", "Shortcuts");
  TABS.forEach((tb) => {
    const b = mk("button", "cv-tab" + (tb.to ? "" : " on")); b.type = "button";
    if (!tb.to) b.setAttribute("aria-current", "page");
    b.append(svg(ICON[tb.id]), mk("span", "", tb.label));
    if (tb.to) b.onclick = () => onOpen?.(tb.to);
    tabs.appendChild(b);
  });
  header.append(loc, search, tabs);
  const body = mk("div", "cv-body");
  root.append(header, body);

  function paint() {
    loc.textContent = "";
    loc.append(svg('<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'), mk("b", "", locationLabel(profile && profile.address)));
    body.textContent = "";
    if (failed) {
      const box = mk("div", "empty"); box.appendChild(mk("p", "", "Categories load nahi hui. Internet jaanchein."));
      const r = mk("button", "category", "Dobara try karein"); r.type = "button"; r.onclick = refresh; box.appendChild(r); body.appendChild(box); return;
    }
    if (!depts) { for (let i = 0; i < 8; i++) body.appendChild(mk("div", "cv-skel")); return; }
    const groups = groupDepartments(depts, q);
    if (!groups.length) { body.appendChild(mk("div", "empty", depts.length ? "Is naam ki koi category nahi mili." : "Abhi koi category nahi hai.")); return; }
    groups.forEach((g) => {
      const sec = mk("section", "cv-sec"); sec.appendChild(mk("h3", "", g.title));
      const grid = mk("div", "cv-grid");
      g.items.forEach((d) => {
        const b = mk("button", "cv-tile"); b.type = "button";
        const ic = mk("span", "cv-ic " + g.tone, d.icon); ic.setAttribute("aria-hidden", "true");
        b.append(ic, mk("span", "cv-nm", d.name)); b.onclick = () => onOpen?.("d:" + d.id);
        grid.appendChild(b);
      });
      sec.appendChild(grid); body.appendChild(sec);
    });
  }
  async function refresh() {
    if (loading) return; loading = true; failed = false; paint();
    try {
      const s = await getDocs(query(collection(db, "categories"), where("active", "==", true)));
      depts = activeDepartments(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { failed = true; }
    loading = false; paint();
  }
  input.addEventListener("input", () => { q = input.value; if (depts) paint(); });
  paint();
  return { refresh, repaint: paint };
}
