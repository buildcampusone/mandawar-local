// Shared app shell: sidebar (drawer on mobile, fixed on desktop) + profile screen.
// Used by customer.html, shopkeeper.html and admin.html.
//
// Sections in the page opt in with   data-panel="viewId [viewId2 ...]"
// Only sections that match the active view are shown (class .panel-off hides the rest),
// so existing code that toggles `hidden` on those sections keeps working untouched.
//
// All visible text goes through t() from shared/i18n, so the language switch works everywhere
// the shell is used. Nav items pass i18n keys (key / shortKey).

import { BRAND } from "../config/brand.js";
import { db } from "../config/firebase.js";
import { t, getLang, langName, setLang, applyLang, LANGS } from "../i18n/i18n.js";
import {
  doc, updateDoc, addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/>',
  headset: '<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20c0 1.5-2 2-5 2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const ROLE_KEY = { customer: "roleCustomer", shopkeeper: "roleShopkeeper", admin: "roleAdmin" };

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
const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

/**
 * mountShell({
 *   role, user, profile,
 *   items: [{ id, icon, key, shortKey }],  // nav entries (Profile is added automatically); key = i18n key
 *   initial,                               // first view id
 *   locked: [ids], lockedTo,               // optional: items that redirect to another view
 *   profileRows: () => [[label, value]],   // extra rows for the profile info card (call t() inside)
 *   onEnter: (id) => {},                   // called when a view is opened from nav / hash
 *   onLogout: async () => {}
 * })
 * returns { go(id, {silent}), setLocked(ids, to), current() }
 */
export function mountShell(cfg) {
  const { role, user, profile, onEnter, onLogout } = cfg;
  const items = [...cfg.items, { id: "profile", icon: "profile", key: "navProfile", shortKey: "shAccount" }];
  let locked = new Set(cfg.locked || []);
  let lockedTo = cfg.lockedTo || cfg.initial;
  let current = null;

  const lbl = (it) => (it.key ? t(it.key) : it.label);
  const shortLbl = (it) => (it.shortKey ? t(it.shortKey) : it.short || lbl(it));
  const roleLabel = () => t(ROLE_KEY[role] || "user");

  document.body.classList.add("has-sidebar");

  // --- hamburger in topbar
  const topbar = document.querySelector(".topbar");
  const menuBtn = el("button", "menu-btn");
  menuBtn.type = "button";
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.appendChild(svg("menu"));
  if (topbar) topbar.insertBefore(menuBtn, topbar.firstChild);

  // --- sidebar
  const scrim = el("div", "scrim");
  const aside = el("aside", "sidebar");

  const head = el("div", "sb-head");
  const avatar = el("div", "sb-avatar");
  const sbName = el("div", "sb-name");
  const sbRole = el("span", "sb-role");
  const sbPhone = el("div", "sb-phone");
  head.append(avatar, sbName, sbRole, sbPhone);
  aside.appendChild(head);

  function paintHead() {
    avatar.textContent = initial(profile.name);
    sbName.textContent = profile.name || t("user");
    sbRole.textContent = roleLabel();
    sbPhone.textContent = profile.phone ? "+91 " + profile.phone : "";
    sbPhone.hidden = !profile.phone;
  }

  const nav = el("nav", "sb-nav");
  const navBtns = {}, navLabels = {};
  items.forEach((it) => {
    const b = el("button", "sb-item");
    b.type = "button";
    b.dataset.view = it.id;
    b.appendChild(svg(it.icon));
    navLabels[it.id] = el("span", "sb-label");
    b.appendChild(navLabels[it.id]);
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
  const outLabel = el("span", "sb-label");
  out.appendChild(outLabel);
  out.onclick = async () => { out.disabled = true; try { await onLogout?.(); } finally { out.disabled = false; } };
  foot.appendChild(out);
  foot.appendChild(el("div", "sb-ver", BRAND.name + " · " + BRAND.tagline));
  aside.appendChild(foot);

  // --- bottom navigation (mobile quick access)
  const bn = el("nav", "bottom-nav");
  const bnBtns = {}, bnLabels = {};
  (cfg.bottom || [...cfg.items.slice(0, 3).map((i) => i.id), "profile"]).forEach((id) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const b = el("button", "bn-item");
    b.type = "button";
    b.appendChild(svg(it.icon));
    bnLabels[id] = el("span");
    b.appendChild(bnLabels[id]);
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

  // ------------------------------------------------------------------ bottom sheets
  let closeSheet = null;
  function openSheet(title, build) {
    closeSheet?.();
    const back = el("div", "sheet-back");
    const sh = el("div", "sheet");
    sh.setAttribute("role", "dialog");
    sh.setAttribute("aria-modal", "true");
    sh.setAttribute("aria-label", title);
    const hd = el("div", "sheet-head");
    hd.appendChild(el("h3", "", title));
    const x = el("button", "sheet-x");
    x.type = "button";
    x.setAttribute("aria-label", t("close"));
    x.appendChild(svg("close"));
    hd.appendChild(x);
    const body = el("div", "sheet-body");
    sh.append(hd, body);
    back.appendChild(sh);
    document.body.appendChild(back);
    document.body.classList.add("no-scroll");

    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() {
      document.removeEventListener("keydown", onKey);
      back.remove();
      document.body.classList.remove("no-scroll");
      if (closeSheet === close) closeSheet = null;
    }
    closeSheet = close;
    x.onclick = close;
    back.onclick = (e) => { if (e.target === back) close(); };
    document.addEventListener("keydown", onKey);
    build(body, close);
    requestAnimationFrame(() => back.classList.add("show"));
  }
  const msgLine = () => { const m = el("p", "sheet-msg"); m.setAttribute("role", "status"); return m; };
  const setMsg = (m, text, bad) => { m.textContent = text; m.classList.toggle("bad", !!bad); };
  const field = (labelText, input) => {
    const l = el("label", "fld");
    l.appendChild(el("span", "", labelText));
    l.appendChild(input);
    return l;
  };
  const btn = (text, cls = "category") => { const b = el("button", cls + " sheet-btn", text); b.type = "button"; return b; };

  // --- Choose App Language
  function openLang() {
    openSheet(t("langTitle"), (body, close) => {
      body.appendChild(el("p", "sheet-hint", t("langHint")));
      LANGS.forEach((l) => {
        const b = el("button", "opt" + (l.code === getLang() ? " on" : ""));
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(l.code === getLang()));
        b.appendChild(el("span", "opt-name", l.name));
        b.appendChild(svg("check"));
        b.onclick = () => { setLang(l.code); close(); };
        body.appendChild(b);
      });
    });
  }

  // --- Edit profile (name + mobile)
  function openEdit() {
    openSheet(t("editProfile"), (body, close) => {
      const nameI = el("input"); nameI.value = profile.name || ""; nameI.maxLength = 60; nameI.autocomplete = "name";
      const phoneI = el("input"); phoneI.value = profile.phone || ""; phoneI.maxLength = 10;
      phoneI.inputMode = "numeric"; phoneI.autocomplete = "tel-national";
      const m = msgLine();
      const save = btn(t("save"));
      save.onclick = async () => {
        const name = nameI.value.trim(), phone = phoneI.value.trim();
        if (name.length < 2 || name.length > 60) return setMsg(m, t("badName"), true);
        if (!/^[6-9][0-9]{9}$/.test(phone)) return setMsg(m, t("badPhone"), true);
        save.disabled = true;
        try {
          await updateDoc(doc(db, "users", user.uid), { name, phone });
          profile.name = name; profile.phone = phone;
          paintHead();
          if (current === "profile") renderProfile();
          close();
        } catch (e) {
          setMsg(m, t("saveFail") + (e.message || e.code || ""), true);
          save.disabled = false;
        }
      };
      body.append(field(t("name"), nameI), field(t("phone"), phoneI), m, save);
    });
  }

  // --- Account Privacy
  function openPrivacy() {
    openSheet(t("privTitle"), (body) => {
      body.appendChild(el("p", "sheet-hint", t("privIntro")));
      const rows = [[t("name"), profile.name || "—"], [t("mobile"), profile.phone ? "+91 " + profile.phone : "—"], [t("email"), user.email || "—"]];
      if (role === "customer") rows.push([t("address"), profile.address || t("notSaved")]);
      const dl = el("dl", "pc-rows");
      rows.forEach(([k, v]) => { dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); });
      body.appendChild(dl);
      body.appendChild(el("p", "sheet-hint", t("privNote")));
      const m = msgLine();
      const dlBtn = btn(t("privDownload"));
      dlBtn.onclick = () => {
        const data = { name: profile.name, phone: profile.phone, email: user.email, role, address: profile.address || null };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        a.download = "mandawar-my-data.json";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        setMsg(m, t("privDownloaded"));
      };
      body.append(dlBtn, m, el("p", "sheet-hint", t("privDeleteHint")));
    });
  }

  // --- Help and Support
  function openHelp() {
    openSheet(t("helpTitle"), (body) => {
      body.appendChild(el("p", "sheet-hint", t("helpIntro")));
      let any = false;
      const link = (text, href, icon) => {
        const a = el("a", "category sheet-btn sheet-link");
        a.href = href;
        if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
        a.appendChild(svg(icon));
        a.appendChild(el("span", "", text));
        body.appendChild(a);
        any = true;
      };
      const ph = String(BRAND.supportPhone || "").replace(/\D/g, "");
      if (/^[6-9][0-9]{9}$/.test(ph)) {
        link(t("helpCall"), "tel:+91" + ph, "headset");
        link(t("helpWhatsapp"), "https://wa.me/91" + ph, "headset");
      }
      if (BRAND.supportEmail) link(t("helpEmail"), "mailto:" + BRAND.supportEmail, "info");
      if (!any) body.appendChild(el("p", "sheet-hint", t("helpNoContact")));
    });
  }

  // --- Rate the app
  function openRate() {
    openSheet(t("rateTitle"), (body, close) => {
      body.appendChild(el("p", "sheet-hint", t("rateAsk")));
      let rating = 0;
      const stars = el("div", "stars");
      const starBtns = [1, 2, 3, 4, 5].map((n) => {
        const b = el("button", "star");
        b.type = "button";
        b.setAttribute("aria-label", t("starAria", { n }));
        b.appendChild(svg("star"));
        b.onclick = () => { rating = n; paint(); };
        stars.appendChild(b);
        return b;
      });
      const paint = () => starBtns.forEach((b, i) => b.classList.toggle("on", i < rating));
      const ta = el("textarea"); ta.rows = 3; ta.maxLength = 300; ta.placeholder = t("rateComment");
      const m = msgLine();
      const send = btn(t("rateSend"));
      send.onclick = async () => {
        if (!rating) return setMsg(m, t("ratePick"), true);
        send.disabled = true;
        try {
          await addDoc(collection(db, "feedback"), {
            uid: user.uid, role, rating, comment: ta.value.trim().slice(0, 300), lang: getLang(), createdAt: serverTimestamp()
          });
          setMsg(m, t("rateThanks"));
          setTimeout(close, 1300);
        } catch (e) {
          setMsg(m, t("saveFail") + (e.message || e.code || ""), true);
          send.disabled = false;
        }
      };
      body.append(stars, ta, m, send);
    });
  }

  // --- About
  function openAbout() {
    openSheet(t("aboutTitle"), (body) => {
      body.appendChild(el("p", "sheet-hint", t("aboutText")));
      const dl = el("dl", "pc-rows");
      [[t("aboutPlace"), BRAND.place], [t("version"), "v" + BRAND.version]].forEach(([k, v]) => {
        dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v));
      });
      body.appendChild(dl);
      [[t("terms2"), BRAND.termsUrl], [t("terms4"), BRAND.privacyUrl]].forEach(([text, href]) => {
        if (!href) return;
        const a = el("a", "category sheet-btn sheet-link", text);
        a.href = href; a.target = "_blank"; a.rel = "noopener";
        body.appendChild(a);
      });
    });
  }

  // ------------------------------------------------------------------ profile screen
  const main = document.querySelector("main.container") || document.body;
  const pSec = el("section", "");
  pSec.dataset.panel = "profile";
  pSec.id = "profile-section";
  main.appendChild(pSec);

  function profileRow(r) {
    const b = el("button", "pf-row");
    b.type = "button";
    const ic = el("span", "pf-ico"); ic.appendChild(svg(r.icon));
    const tx = el("span", "pf-txt");
    tx.appendChild(el("span", "pf-t", t(r.t)));
    tx.appendChild(el("span", "pf-s", r.sub ? r.sub() : t(r.s)));
    const ch = svg("chevron"); ch.classList.add("pf-chev");
    b.append(ic, tx, ch);
    b.onclick = r.on;
    return b;
  }

  function renderProfile() {
    pSec.textContent = "";
    pSec.classList.add("pf");

    // header card
    const hc = el("div", "pf-card pf-head");
    hc.appendChild(el("div", "pc-avatar", initial(profile.name)));
    const who = el("div", "pf-who");
    who.appendChild(el("div", "pc-name", profile.name || t("user")));
    who.appendChild(el("div", "pf-phone", profile.phone || user.email || ""));
    hc.appendChild(who);
    const ed = el("button", "pf-edit");
    ed.type = "button";
    ed.setAttribute("aria-label", t("editAria"));
    ed.appendChild(svg("pencil"));
    ed.onclick = openEdit;
    hc.appendChild(ed);
    pSec.appendChild(hc);

    // extra info (email + role specific rows from the page)
    const rows = [[t("email"), user.email || "—"]].concat(cfg.profileRows ? cfg.profileRows() : []);
    const info = el("div", "pf-card pf-info");
    const dl = el("dl", "pc-rows");
    rows.forEach(([k, v]) => { dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); });
    info.appendChild(dl);
    pSec.appendChild(info);

    const sections = [];
    if (role === "customer") {
      sections.push({ title: "secShopping", rows: [
        { icon: "orders", t: "myOrders", s: "myOrdersSub", on: () => go("orders") },
        { icon: "address", t: "savedAddress", s: "savedAddressSub", on: () => go("address") }
      ] });
    }
    sections.push({ title: "secPrefs", rows: [
      { icon: "globe", t: "chooseLang", sub: () => langName() + " · " + t("changeLang"), on: openLang },
      { icon: "shield", t: "accPrivacy", s: "accPrivacySub", on: openPrivacy }
    ] });
    sections.push({ title: "secSupport", rows: [
      { icon: "headset", t: "help", s: "helpSub", on: openHelp },
      { icon: "star", t: "rate", s: "rateSub", on: openRate },
      { icon: "info", t: "about", s: "aboutSub", on: openAbout }
    ] });

    sections.forEach((s) => {
      pSec.appendChild(el("h3", "pf-sec", t(s.title)));
      const g = el("div", "pf-card pf-group");
      s.rows.forEach((r) => g.appendChild(profileRow(r)));
      pSec.appendChild(g);
    });

    const lo = el("button", "pf-card pf-row pf-logout");
    lo.type = "button";
    const lic = el("span", "pf-ico"); lic.appendChild(svg("logout"));
    lo.append(lic, el("span", "pf-t", t("logout")));
    lo.onclick = () => onLogout?.();
    pSec.appendChild(lo);

    pSec.appendChild(el("p", "pf-ver", BRAND.name + " v" + BRAND.version));
  }

  // ------------------------------------------------------------------ labels (re-run on language change)
  function paintLabels() {
    menuBtn.setAttribute("aria-label", t("menuOpen"));
    aside.setAttribute("aria-label", t("mainMenu"));
    bn.setAttribute("aria-label", t("quickNav"));
    outLabel.textContent = t("logout");
    items.forEach((it) => { navLabels[it.id].textContent = lbl(it); });
    Object.keys(bnLabels).forEach((id) => { bnLabels[id].textContent = shortLbl(items.find((x) => x.id === id)); });
    paintHead();
  }
  document.addEventListener("langchange", () => {
    paintLabels();
    if (current === "profile") renderProfile();
  });
  paintLabels();

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

  // translate any data-i18n markup on the page for the saved language
  applyLang();

  return {
    go,
    current: () => current,
    setLocked(ids, to) { locked = new Set(ids); if (to) lockedTo = to; refreshNav(); }
  };
}
