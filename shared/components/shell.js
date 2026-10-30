// Shared app shell: sidebar (drawer on mobile, fixed on desktop) + profile view.
// Used by customer.html, shopkeeper.html and admin.html.
//
// Sections in the page opt in with   data-panel="viewId [viewId2 ...]"
// Only sections that match the active view are shown (class .panel-off hides the rest),
// so existing code that toggles `hidden` on those sections keeps working untouched.

import { BRAND } from "../config/brand.js";

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 11.5a1 1 0 00.8.8h9.2a1 1 0 001-.8L21 7H6"/>',
  orders: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6"/>',
  address: '<path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  products: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  shop: '<path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M9 20v-6h6v6"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  pending: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shops: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'
};
const ROLE_LABEL = { customer: "Grahak (Customer)", shopkeeper: "Dukaandaar", admin: "Admin" };

function svg(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || ICONS.home;   // static icon markup only, never user data
  return s;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * mountShell({
 *   role, user, profile,
 *   items: [{ id, icon, label }],       // nav entries (Profile is added automatically)
 *   initial,                            // first view id
 *   locked: [ids], lockedTo,            // optional: items that redirect to another view
 *   profileRows: () => [[label, value]],// extra rows for the profile card
 *   onEnter: (id) => {},                // called when a view is opened from nav / hash
 *   onLogout: async () => {}
 * })
 * returns { go(id, {silent}), setLocked(ids, to), current() }
 */
export function mountShell(cfg) {
  const { role, user, profile, onEnter, onLogout } = cfg;
  const items = [...cfg.items, { id: "profile", icon: "profile", label: "Mera Profile", short: "Account" }];
  let locked = new Set(cfg.locked || []);
  let lockedTo = cfg.lockedTo || cfg.initial;
  let current = null;

  document.body.classList.add("has-sidebar");

  // --- hamburger in topbar
  const topbar = document.querySelector(".topbar");
  const menuBtn = el("button", "menu-btn");
  menuBtn.type = "button";
  menuBtn.setAttribute("aria-label", "Menu kholein");
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.appendChild(svg("menu"));
  if (topbar) topbar.insertBefore(menuBtn, topbar.firstChild);

  // --- sidebar
  const scrim = el("div", "scrim");
  const aside = el("aside", "sidebar");
  aside.setAttribute("aria-label", "Main menu");

  const head = el("div", "sb-head");
  const avatar = el("div", "sb-avatar", (profile.name || "?").trim().charAt(0).toUpperCase());
  head.appendChild(avatar);
  head.appendChild(el("div", "sb-name", profile.name || "User"));
  head.appendChild(el("span", "sb-role", ROLE_LABEL[role] || role));
  if (profile.phone) head.appendChild(el("div", "sb-phone", "+91 " + profile.phone));
  aside.appendChild(head);

  const nav = el("nav", "sb-nav");
  const navBtns = {};
  items.forEach((it) => {
    const b = el("button", "sb-item");
    b.type = "button";
    b.dataset.view = it.id;
    b.appendChild(svg(it.icon));
    b.appendChild(el("span", "sb-label", it.label));
    const lock = svg("lock"); lock.classList.add("sb-lock");
    b.appendChild(lock);
    b.onclick = () => go(it.id);
    nav.appendChild(b);
    navBtns[it.id] = b;
  });
  aside.appendChild(nav);

  const foot = el("div", "sb-foot");
  const out = el("button", "sb-item sb-logout");
  out.type = "button";
  out.appendChild(svg("logout"));
  out.appendChild(el("span", "sb-label", "Logout"));
  out.onclick = async () => { out.disabled = true; try { await onLogout?.(); } finally { out.disabled = false; } };
  foot.appendChild(out);
  foot.appendChild(el("div", "sb-ver", BRAND.name + " · " + BRAND.tagline));
  aside.appendChild(foot);

  // --- bottom navigation (mobile quick access)
  const bn = el("nav", "bottom-nav");
  bn.setAttribute("aria-label", "Quick navigation");
  const bnBtns = {};
  (cfg.bottom || [...cfg.items.slice(0, 3).map((i) => i.id), "profile"]).forEach((id) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const b = el("button", "bn-item");
    b.type = "button";
    b.appendChild(svg(it.icon));
    b.appendChild(el("span", "", it.short || it.label));
    b.onclick = () => go(id);
    bn.appendChild(b);
    bnBtns[id] = b;
  });
  document.body.appendChild(bn);

  document.body.appendChild(scrim);
  document.body.appendChild(aside);

  // --- drawer behaviour
  const setOpen = (open) => {
    aside.classList.toggle("open", open);
    scrim.classList.toggle("show", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("no-scroll", open && window.innerWidth < 900);
  };
  menuBtn.onclick = () => setOpen(!aside.classList.contains("open"));
  scrim.onclick = () => setOpen(false);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  window.addEventListener("resize", () => { if (window.innerWidth >= 900) setOpen(false); });

  // --- profile panel
  const main = document.querySelector("main.container") || document.body;
  const pSec = el("section", "");
  pSec.dataset.panel = "profile";
  pSec.id = "profile-section";
  main.appendChild(pSec);

  function renderProfile() {
    pSec.textContent = "";
    pSec.appendChild(el("h2", "", "Mera Profile"));
    const card = el("div", "profile-card");
    const top = el("div", "pc-top");
    top.appendChild(el("div", "pc-avatar", (profile.name || "?").trim().charAt(0).toUpperCase()));
    const who = el("div");
    who.appendChild(el("div", "pc-name", profile.name || "User"));
    who.appendChild(el("span", "badge", ROLE_LABEL[role] || role));
    top.appendChild(who);
    card.appendChild(top);
    const rows = [["Mobile", profile.phone ? "+91 " + profile.phone : "—"], ["Email", user.email || "—"]]
      .concat(cfg.profileRows ? cfg.profileRows() : []);
    const dl = el("dl", "pc-rows");
    rows.forEach(([k, v]) => { dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); });
    card.appendChild(dl);
    const lo = el("button", "category pc-logout", "Logout");
    lo.type = "button";
    lo.onclick = () => onLogout?.();
    card.appendChild(lo);
    pSec.appendChild(card);
  }

  // --- navigation
  function applyPanels(id) {
    document.querySelectorAll("[data-panel]").forEach((p) => {
      p.classList.toggle("panel-off", !p.dataset.panel.split(/\s+/).includes(id));
    });
  }
  function refreshNav() {
    Object.entries(bnBtns).forEach(([id, b]) => {
      b.classList.toggle("active", id === current);
      b.classList.toggle("locked", locked.has(id));
    });
    Object.entries(navBtns).forEach(([id, b]) => {
      b.classList.toggle("active", id === current);
      b.classList.toggle("locked", locked.has(id));
      if (id === current) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }
  function go(id, opts = {}) {
    if (!navBtns[id]) id = cfg.initial;
    if (locked.has(id)) id = lockedTo;
    current = id;
    if (id === "profile") renderProfile();
    applyPanels(id);
    refreshNav();
    setOpen(false);
    if (!opts.silent) window.scrollTo({ top: 0 });
    if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    if (!opts.silent) onEnter?.(id);
  }
  window.addEventListener("popstate", () => {
    const h = location.hash.slice(1);
    if (h && h !== current) go(h);
  });

  const fromHash = location.hash.slice(1);
  go(navBtns[fromHash] && !locked.has(fromHash) ? fromHash : cfg.initial);

  return {
    go,
    current: () => current,
    setLocked(ids, to) { locked = new Set(ids); if (to) lockedTo = to; refreshNav(); }
  };
}
