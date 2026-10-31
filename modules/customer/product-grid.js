// Product screen of the store: department tiles, products grouped by department in 3-up cards, ADD / + - stepper,
// rotating discount tag, "View All" sheet, voice search and a floating cart bar. The cart itself is cart.js
// (localStorage); this file only draws it and calls addItem / setQty / removeItem.
// DOM-safe: every store-supplied string goes in with textContent.
import { getCart, addItem, setQty, removeItem, MAX_QTY } from "./cart.js";
import { thumb } from "../../shared/components/thumb.js";
import { toast } from "../../shared/components/toast.js";
import { deptEmoji } from "../../shared/config/departments.js";
import {
  sortProducts, filterProducts, badgeFor, discountInfo, addCheck, cartSummary
} from "./product-grid-core.js";
import { buildHome, activeBanners } from "./home-core.js";

const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
function mk(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null && text !== "") e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function btn(text, cls, act, label) {
  const b = mk("button", text, cls);
  b.type = "button";
  if (act) b.dataset.act = act;
  if (label) b.setAttribute("aria-label", label);
  return b;
}

export function initProductGrid() {
  const view = $("products-view"), list = $("product-list"), nav = $("group-nav");
  const bar = $("mart-bar"), sheet = $("mart-sheet"), scrim = $("mart-scrim");
  let shop = null, byId = new Map(), products = [], sections = [], quick = [], banners = [], depts = [], query = "", mode = 0, bannerTimer = 0;

  const qtyOf = (id) => {
    const c = getCart();
    if (!shop || c.shopId !== shop.id) return 0;
    const it = c.items.find((i) => i.productId === id);
    return it ? it.qty : 0;
  };

  /* ---------- card ---------- */
  function control(p) {
    if (!(p.stock > 0)) return mk("span", "Stock khatam", "mc-out");
    const q = qtyOf(p.id);
    if (!q) return btn("ADD", "mc-addbtn", "add", p.name + " cart mein jodein");
    const s = mk("div", "", "mc-stp");
    s.append(btn("−", "", "minus", p.name + " kam karein"), mk("span", String(q)), btn("+", "", "plus", p.name + " badhayein"));
    return s;
  }

  function paintBadge(card, p) {
    const tag = card.querySelector(".mc-tag span");
    const b = badgeFor(p, mode);
    tag.className = b ? b.tone : "none";
    tag.replaceChildren();
    if (b) { tag.append(b.label); if (b.value) tag.appendChild(mk("small", b.value)); }
  }

  function card(p) {
    const el = mk("article", "", "mc");
    el.dataset.id = p.id;
    const img = mk("div", "", "mc-img");
    img.append(thumb(p), mk("div", "", "mc-slot"));
    img.lastChild.appendChild(control(p));
    const pr = mk("div", "", "mc-pr");
    pr.appendChild(mk("b", money(p.price)));
    if (discountInfo(p)) pr.appendChild(mk("s", money(p.mrp)));
    const info = mk("div", "", "mc-info");
    info.append(pr, mk("p", p.name, "mc-nm"), mk("p", "per " + p.unit, "mc-wt"), mk("div", "", "mc-tag"));
    info.lastChild.appendChild(mk("span"));
    el.append(img, info);
    paintBadge(el, p);
    return el;
  }

  const row = (items) => { const r = mk("div", "", "mc-row"); items.forEach((p) => r.appendChild(card(p))); return r; };

  /* ---------- list ---------- */
  function renderList() {
    list.textContent = "";
    const q = query.trim();
    nav.hidden = !!q || !quick.length;
    if (q) {
      const found = filterProducts(products, q, depts);
      if (!found.length) { list.appendChild(mk("div", "Koi product nahi mila.", "empty")); return; }
      const sec = mk("section", "", "mc-sec");
      sec.append(mk("h3", found.length + " product mile"), row(found));
      list.appendChild(sec);
      return;
    }
    if (!products.length) { list.appendChild(mk("div", "Abhi koi product nahi hai. Thodi der baad dekhein.", "empty")); return; }
    if (banners.length) list.appendChild(bannerStrip());
    if (depts.length) list.appendChild(tiles());
    sections.forEach((g, i) => {
      const sec = mk("section", "", "mc-sec");
      sec.id = "mc-g" + i;
      sec.append(mk("h3", g.title), row(g.items.slice(0, 3)));
      if (g.items.length > 3) {
        const all = btn("", "mc-all", "all");
        all.dataset.group = String(i);
        const stack = mk("span", "", "mc-stack");
        g.items.slice(0, 3).forEach((p) => stack.appendChild(thumb(p, "sm")));
        all.append(stack, mk("span", "View All Products"), mk("span", "›"));
        all.lastChild.setAttribute("aria-hidden", "true");
        sec.appendChild(all);
      }
      list.appendChild(sec);
    });
  }

  // "Shop by category": one tile per active department. Tap = jump to its products (or say it is empty).
  function tiles() {
    const sec = mk("section", "", "mc-sec mc-depts");
    sec.id = "mc-tiles";
    sec.appendChild(mk("h3", "Shop by category"));
    const grid = mk("div", "", "mc-dgrid");
    depts.forEach((d) => {
      const at = sections.findIndex((g) => g.key === "d:" + d.id);
      const b = btn("", "mc-dtile", "dept", d.name);
      b.dataset.go = String(at);
      const ic = mk("span", deptEmoji(d.id), "mc-dico");
      ic.setAttribute("aria-hidden", "true");
      b.append(ic, mk("span", d.name, "mc-dnm"));
      if (at < 0) b.classList.add("empty");
      grid.appendChild(b);
    });
    sec.appendChild(grid);
    return sec;
  }

  function renderNav() {
    nav.textContent = "";
    const mkChip = (label, go, on) => {
      const b = btn(label, "", "jump");
      if (on) b.setAttribute("aria-current", "true");
      b.dataset.go = go;
      return b;
    };
    nav.appendChild(mkChip("Sab", "top", true));
    quick.forEach((q) => nav.appendChild(mkChip(q.label, q.key, false)));
  }

  // where a section key lives on the page (null when it is not shown)
  function anchorFor(key) {
    if (key === "top") return view;
    if (key === "tiles") return $("mc-tiles");
    const i = sections.findIndex((s) => s.key === key);
    return i >= 0 ? $("mc-g" + i) : null;
  }

  /* ---------- banners (collection `banners`, managed by the owner) ---------- */
  function bannerStrip() {
    const wrap = mk("section", "", "mc-bn-wrap");
    const strip = mk("div", "", "mc-bn");
    strip.setAttribute("role", "region");
    strip.setAttribute("aria-label", "Offers");
    banners.forEach((b, i) => {
      const s = btn("", "mc-bn-slide", "banner", b.title);
      s.dataset.target = typeof b.target === "string" ? b.target : "";
      s.classList.add("tone" + (i % 3));
      if (typeof b.image === "string" && b.image.startsWith("data:image/jpeg;base64,")) {
        const im = document.createElement("img");
        im.src = b.image; im.alt = ""; im.loading = "lazy";
        s.appendChild(im);
      }
      const tx = mk("span", "", "mc-bn-tx");
      tx.appendChild(mk("b", b.title));
      if (b.subtitle) tx.appendChild(mk("small", b.subtitle));
      s.appendChild(tx);
      strip.appendChild(s);
    });
    wrap.appendChild(strip);
    clearInterval(bannerTimer);
    if (banners.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      bannerTimer = setInterval(() => {
        if (view.hidden || document.hidden || !strip.isConnected) return;
        const w = strip.clientWidth;
        const next = strip.scrollLeft + w >= strip.scrollWidth - 4 ? 0 : strip.scrollLeft + w;
        strip.scrollTo({ left: next, behavior: "smooth" });
      }, 4500);
    }
    return wrap;
  }

  // grey placeholder cards while the store loads (replaced by show() / error())
  function loading() {
    list.textContent = "";
    nav.hidden = true;
    const sec = mk("section", "", "mc-sec");
    sec.setAttribute("aria-busy", "true");
    sec.append(mk("div", "", "mc-skel-h"));
    const r = mk("div", "", "mc-row");
    for (let i = 0; i < 6; i++) { const c = mk("div", "", "mc-skel"); c.appendChild(mk("span")); r.appendChild(c); }
    sec.appendChild(r);
    list.appendChild(sec);
  }
  function failed(text, retry) {
    list.textContent = "";
    nav.hidden = true;
    const box = mk("div", "", "empty");
    box.appendChild(mk("p", text));
    if (retry) { const b = btn("Dobara try karein", "category"); b.onclick = retry; box.appendChild(b); }
    list.appendChild(box);
  }

  /* ---------- sheet (View All) ---------- */
  function openGroup(i) {
    const g = sections[i];
    if (!g) return;
    $("mart-sheet-title").textContent = g.title;
    const body = $("mart-sheet-body");
    body.textContent = "";
    body.appendChild(row(g.items));
    sheet.hidden = false; scrim.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add("on"); scrim.classList.add("on"); });
    document.body.classList.add("no-scroll");
    $("mart-sheet-x").focus();
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove("on"); scrim.classList.remove("on");
    document.body.classList.remove("no-scroll");
    setTimeout(() => { if (!sheet.classList.contains("on")) { sheet.hidden = true; scrim.hidden = true; } }, 260);
  }

  /* ---------- cart sync ---------- */
  function paintBar() {
    const c = getCart();
    const s = cartSummary(c.items, c.shopId, shop && shop.id, byId);
    bar.hidden = !s.count;
    if (!s.count) return;
    const l = $("mart-bar-l");
    l.replaceChildren(mk("b", s.count + " item" + (s.count > 1 ? "s" : "")), mk("small", money(s.total)));
  }
  function refresh() {
    document.querySelectorAll("#products-view .mc").forEach((el) => {
      const p = byId.get(el.dataset.id);
      if (!p) return;
      el.querySelector(".mc-slot").replaceChildren(control(p));
    });
    paintBar();
  }

  /* ---------- actions ---------- */
  function onAct(e) {
    const b = e.target.closest("[data-act]");
    if (!b || !shop) return;
    const act = b.dataset.act;
    if (act === "all") return openGroup(Number(b.dataset.group));
    if (act === "dept") {
      const at = Number(b.dataset.go);
      if (!(at >= 0)) return toast("Is department me abhi saaman nahi hai.", { ms: 2500 });
      const target = $("mc-g" + at);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (act === "banner") {   // target = a section key ("deals", "best", ...) or a department id; empty = nothing to open
      const t = b.dataset.target;
      const target = t && (anchorFor(t) || anchorFor("d:" + t));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (act === "jump") {
      nav.querySelectorAll("button").forEach((x) => x.removeAttribute("aria-current"));
      b.setAttribute("aria-current", "true");
      const target = anchorFor(b.dataset.go);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const card = b.closest("[data-id]");
    const p = card && byId.get(card.dataset.id);
    if (!p) return;
    if (act === "minus") {
      const q = qtyOf(p.id);
      if (q <= 1) removeItem(p.id); else setQty(p.id, q - 1);
      return;
    }
    // add / plus
    const why = addCheck(p, qtyOf(p.id), MAX_QTY);
    if (why) return toast(why, { tone: "bad", ms: 3000 });
    const r = addItem(shop.id, p.id, 1);
    if (r) toast(r, { tone: "bad", ms: 4000 });
  }
  list.addEventListener("click", onAct);
  sheet.addEventListener("click", onAct);
  nav.addEventListener("click", onAct);
  scrim.addEventListener("click", closeSheet);
  $("mart-sheet-x").addEventListener("click", closeSheet);
  $("mart-cart").addEventListener("click", () => $("cart-btn").click());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  window.addEventListener("cart-changed", refresh);
  // leaving the shop screen (sidebar, cart) must not leave the sheet / scroll lock behind
  new MutationObserver(() => { if (view.hidden) closeSheet(); }).observe(view, { attributes: true, attributeFilter: ["hidden"] });

  // rotating tag: Discount -> You Save (paused off-screen, in a hidden tab, or with reduced motion)
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(() => {
      if (view.hidden || document.hidden || !shop) return;
      mode = mode ? 0 : 1;
      document.querySelectorAll("#products-view .mc").forEach((el) => { const p = byId.get(el.dataset.id); if (p) paintBadge(el, p); });
    }, 2600);
  }

  // voice search (Hindi); the button is hidden where the browser has no speech recognition
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("mic-btn");
  if (!SR) mic.hidden = true;
  else mic.onclick = () => {
    try {
      const rec = new SR();
      rec.lang = "hi-IN";
      rec.onresult = (ev) => { $("product-search").value = ev.results[0][0].transcript; api.search($("product-search").value); };
      rec.onerror = () => toast("Awaaz nahi sunai di. Dobara try karein.", { tone: "bad", ms: 3000 });
      rec.start();
    } catch (e) { toast("Voice search abhi nahi chal raha.", { tone: "bad", ms: 3000 }); }
  };

  const api = {
    // s = { id, name, ... } (storeSettings/main), ps = active products, ds = ACTIVE departments in shelf order
    // extra = { orders: [the customer's earlier orders, newest first], banners: [banner docs] } (both optional)
    show(s, ps, ds = [], extra = {}) {
      shop = s;
      depts = ds;
      products = sortProducts(ps);
      byId = new Map(products.map((p) => [p.id, p]));
      ({ sections, quick } = buildHome({ products, depts, orders: extra.orders || [] }));
      banners = activeBanners(extra.banners);
      query = "";
      $("product-search").value = "";
      renderNav();
      renderList();
      paintBar();
      window.scrollTo({ top: 0 });
    },
    search(q) { query = q || ""; renderList(); },
    loading, error: failed,
  };
  return api;
}
