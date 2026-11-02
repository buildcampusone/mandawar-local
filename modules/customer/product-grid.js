// Customer home / product screen: offer banners, "order again" card, category tiles, products grouped in 3-up cards,
// ADD / + - stepper, "See all" sheet, voice search and a floating cart bar. The cart itself is cart.js (localStorage);
// this file only draws it and calls addItem / setQty / removeItem. Layout: shared/styles/mart.css.
// DOM-safe: every store-supplied string goes in with textContent.
import { getCart, addItem, setQty, removeItem, MAX_QTY } from "./cart.js";
import { thumb } from "../../shared/components/thumb.js";
import { toast } from "../../shared/components/toast.js";
import { t, getLang } from "../../shared/i18n/i18n.js";
import { sortProducts, filterProducts, discountInfo, fmt, addCheck, cartSummary } from "./product-grid-core.js";
import { buildHome, activeBanners, lastOrder, deliveryLine, tileLetter } from "./home-core.js";

const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const TILES_SHOWN = 8;   // 2 rows of 4; "See all" shows the rest
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
const unitText = (u) => { const s = t("u_" + u); return s.startsWith("u_") ? String(u) : s; };
const SECTION_TITLE = { deals: "hmDeals", best: "hmBest", featured: "hmFeatured", essentials: "hmEssentials" };

export function initProductGrid() {
  const view = $("products-view"), list = $("product-list");
  const bar = $("mart-bar"), sheet = $("mart-sheet"), scrim = $("mart-scrim");
  let shop = null, byId = new Map(), products = [], sections = [], banners = [], depts = [], orders = [];
  let query = "", allTiles = false, again = null;

  const qtyOf = (id) => {
    const c = getCart();
    if (!shop || c.shopId !== shop.id) return 0;
    const it = c.items.find((i) => i.productId === id);
    return it ? it.qty : 0;
  };

  /* ---------- card ---------- */
  function control(p) {
    if (!(p.stock > 0)) return mk("span", t("hmOut"), "mc-out");
    const q = qtyOf(p.id);
    if (!q) return btn(t("hmAdd"), "mc-addbtn", "add", t("hmAddAria", { p: p.name }));
    const s = mk("div", "", "mc-stp");
    s.append(btn("−", "", "minus", t("hmMinusAria", { p: p.name })), mk("span", String(q)), btn("+", "", "plus", t("hmPlusAria", { p: p.name })));
    return s;
  }

  function card(p) {
    const el = mk("article", "", "mc");
    el.dataset.id = p.id;
    const img = mk("div", "", "mc-img");
    img.appendChild(thumb(p));
    const d = discountInfo(p);
    if (p.stock > 0 && d) img.appendChild(mk("span", t("hmSave", { n: fmt(d.save) }), "mc-tag"));
    else if (p.stock > 0 && p.stock <= 5) img.appendChild(mk("span", t("hmOnlyLeft", { n: p.stock }), "mc-tag warn"));
    const pr = mk("div", "", "mc-pr");
    pr.appendChild(mk("span", money(p.price)));
    if (d) pr.appendChild(mk("s", money(p.mrp)));
    const slot = mk("div", "", "mc-slot");
    slot.appendChild(control(p));
    const info = mk("div", "", "mc-info");
    info.append(mk("p", p.name, "mc-nm"), mk("p", "1 " + unitText(p.unit), "mc-wt"), pr, slot);
    el.append(img, info);
    return el;
  }

  const row = (items) => { const r = mk("div", "", "mc-row"); items.forEach((p) => r.appendChild(card(p))); return r; };

  function head(title, linkText, act, extra) {
    const h = mk("div", "", "mc-hd");
    h.appendChild(mk("h3", title));
    if (extra) h.appendChild(mk("span", extra));
    if (linkText) { const b = btn(linkText, "mc-link", act); h.appendChild(b); return { h, link: b }; }
    return { h, link: null };
  }

  const titleOf = (g) => (SECTION_TITLE[g.key] ? t(SECTION_TITLE[g.key]) : g.key === "d:" ? t("hmOther") : g.title);

  /* ---------- list ---------- */
  function renderList() {
    list.textContent = "";
    const q = query.trim();
    if (q) {
      const found = filterProducts(products, q, depts);
      if (!found.length) { list.appendChild(mk("div", t("hmNone"), "empty")); return; }
      const sec = mk("section", "", "mc-sec");
      sec.append(head(t("hmFound", { n: found.length })).h, row(found));
      list.appendChild(sec);
      return;
    }
    if (!products.length) { list.appendChild(mk("div", t("hmEmpty"), "empty")); return; }
    if (banners.length) list.appendChild(bannerStrip());
    if (again) list.appendChild(reorderCard());
    if (depts.length) list.appendChild(tiles());
    // "Previously bought" is the order-again card above; Deals come first among the product sections (as in the design)
    const shown = sections.map((g, i) => ({ g, i })).filter((x) => x.g.key !== "previous")
      .sort((a, b) => (b.g.key === "deals") - (a.g.key === "deals"));
    shown.forEach(({ g, i }) => {
      const sec = mk("section", "", "mc-sec");
      sec.id = "mc-g" + i;
      const { h, link } = head(titleOf(g), g.items.length > 3 ? t("hmSeeAll") : "", "all");
      if (link) link.dataset.group = String(i);
      sec.append(h, row(g.items.slice(0, 3)));
      list.appendChild(sec);
    });
  }

  // "Order again": the last order that still has stock, one tap puts it in the cart
  function reorderCard() {
    const sec = mk("section", "", "mc-sec");
    sec.id = "mc-again";
    const when = again.when ? new Intl.DateTimeFormat(getLang() === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" }).format(again.when) : "";
    sec.appendChild(head(t("hmReorder"), "", "", when ? t("hmLastOrder", { d: when }) : "").h);
    const box = mk("div", "", "mc-re");
    const tx = mk("div", "", "mc-re-tx");
    tx.appendChild(document.createTextNode(again.names.join(", ") + " "));
    if (again.more) tx.appendChild(mk("span", t("hmMore", { n: again.more })));
    tx.appendChild(mk("b", money(again.total)));
    box.append(tx, btn(t("hmAddToCart"), "mc-re-btn", "reorder"));
    sec.appendChild(box);
    return sec;
  }

  // "Shop by category": one tile per active department (letter tiles, mint / cream). Tap = jump to its products.
  function tiles() {
    const sec = mk("section", "", "mc-sec");
    sec.id = "mc-tiles";
    const more = depts.length > TILES_SHOWN;
    const { h } = head(t("hmShopByCat"), more ? (allTiles ? t("hmSeeLess") : t("hmSeeAll")) : "", "tiles");
    const grid = mk("div", "", "mc-dgrid");
    (allTiles ? depts : depts.slice(0, TILES_SHOWN)).forEach((d) => {
      const at = sections.findIndex((g) => g.key === "d:" + d.id);
      const b = btn("", "mc-dtile", "dept", d.name);
      b.dataset.go = String(at);
      const box = mk("span", tileLetter(d.name), "mc-dbox");
      box.setAttribute("aria-hidden", "true");
      b.append(box, mk("span", d.name, "mc-dnm"));
      if (at < 0) b.classList.add("empty");
      grid.appendChild(b);
    });
    sec.append(h, grid);
    return sec;
  }

  // Categories screen / its tab strip: scroll to a section key ("deals", "essentials") or a department ("d:<id>")
  window.addEventListener("mart-open", (e) => {
    const key = String(e.detail || "");
    const a = anchorFor(key) || anchorFor("d:" + key);
    if (a) a.scrollIntoView({ behavior: "smooth", block: "start" }); else toast(t("hmNoStockDept"), { ms: 2500 });
  });

  // where a section key lives on the page (null when it is not shown)
  function anchorFor(key) {
    if (key === "top") return view;
    if (key === "tiles") return $("mc-tiles");
    const i = sections.findIndex((s) => s.key === key);
    return i >= 0 ? $("mc-g" + i) : null;
  }

  /* ---------- banners (collection `banners`, managed by the owner) ---------- */
  let bannerTimer = 0;
  function bannerStrip() {
    const wrap = mk("section", "", "mc-bn-wrap");
    const strip = mk("div", "", "mc-bn");
    strip.setAttribute("role", "region");
    strip.setAttribute("aria-label", t("hmOffers"));
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
      tx.append(mk("span", t("hmOffer"), "mc-bn-eb"), mk("b", b.title));
      if (b.subtitle) tx.appendChild(mk("small", b.subtitle));
      if (s.dataset.target) tx.appendChild(mk("span", t("hmSeeNow"), "mc-bn-cta"));
      s.appendChild(tx);
      strip.appendChild(s);
    });
    wrap.appendChild(strip);
    clearInterval(bannerTimer);
    if (banners.length > 1) {
      const dots = mk("div", "", "mc-dots");
      dots.setAttribute("aria-hidden", "true");
      banners.forEach(() => dots.appendChild(mk("span")));
      const paint = () => {
        const at = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
        [...dots.children].forEach((d, i) => d.classList.toggle("on", i === at));
      };
      paint();
      strip.addEventListener("scroll", paint, { passive: true });
      wrap.appendChild(dots);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        bannerTimer = setInterval(() => {
          if (view.hidden || document.hidden || !strip.isConnected) return;
          const w = strip.clientWidth;
          const next = strip.scrollLeft + w >= strip.scrollWidth - 4 ? 0 : strip.scrollLeft + w;
          strip.scrollTo({ left: next, behavior: "smooth" });
        }, 4500);
      }
    }
    return wrap;
  }

  // grey placeholder cards while the store loads (replaced by show() / error())
  function loading() {
    list.textContent = "";
    const sec = mk("section", "", "mc-sec");
    sec.setAttribute("aria-busy", "true");
    sec.append(mk("div", "", "mc-skel-h"));
    const r = mk("div", "", "mc-row");
    for (let i = 0; i < 6; i++) r.appendChild(mk("div", "", "mc-skel"));
    sec.appendChild(r);
    list.appendChild(sec);
  }
  function failed(text, retry) {
    list.textContent = "";
    const box = mk("div", "", "empty");
    box.appendChild(mk("p", text));
    if (retry) { const b = btn(t("hmRetry"), "category"); b.onclick = retry; box.appendChild(b); }
    list.appendChild(box);
  }

  /* ---------- header extras: open pill + delivery strip ---------- */
  function paintStore() {
    if (!shop) return;
    const open = shop.isOpen !== false;
    const pill = $("open-pill");
    pill.textContent = t(open ? "hmOpen" : "hmClosed");
    pill.classList.toggle("closed", !open);
    const d = deliveryLine(shop);
    const parts = [];
    if (d) {
      if (d.mins !== null && d.mins > 0) parts.push(t("hmEta", { m: d.mins }));
      if (d.fee !== null) parts.push(d.fee === 0 ? t("hmFeeFree") : t("hmFee", { f: fmt(d.fee) }));
      if (d.min !== null && d.min > 0) parts.push(t("hmMin", { m: fmt(d.min) }));
    }
    $("mart-promo").hidden = !parts.length;
    const tx = $("promo-tx");
    tx.textContent = "";
    if (parts.length) { tx.appendChild(mk("b", parts[0])); if (parts.length > 1) tx.appendChild(document.createTextNode(" · " + parts.slice(1).join(" · "))); }
  }

  /* ---------- sheet (See all) ---------- */
  function openGroup(i) {
    const g = sections[i];
    if (!g) return;
    $("mart-sheet-title").textContent = titleOf(g);
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
    $("mart-bar-l").replaceChildren(mk("small", t("hmItems", { n: s.count })), mk("b", money(s.total)));
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
  function reorder() {
    if (!again) return;
    let missed = false;
    for (const l of again.lines) {
      const p = byId.get(l.productId);
      if (!p) { missed = true; continue; }
      const have = qtyOf(p.id);
      const qty = Math.min(l.qty, MAX_QTY - have, p.stock - have);
      if (qty < 1) { missed = true; continue; }
      if (addItem(shop.id, p.id, qty)) { missed = true; break; }   // a non-empty reply = limit reached, stop
    }
    toast(missed ? t("hmReorderLimit") : t("hmReordered"), { tone: missed ? "bad" : undefined, ms: 3000 });
  }

  function onAct(e) {
    const b = e.target.closest("[data-act]");
    if (!b || !shop) return;
    const act = b.dataset.act;
    if (act === "all") return openGroup(Number(b.dataset.group));
    if (act === "reorder") return reorder();
    if (act === "tiles") { allTiles = !allTiles; renderList(); return; }
    if (act === "dept") {
      const at = Number(b.dataset.go);
      if (!(at >= 0)) return toast(t("hmNoStockDept"), { ms: 2500 });
      const target = $("mc-g" + at);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (act === "banner") {   // target = a section key ("deals", "best", ...) or a department id; empty = nothing to open
      const tg = b.dataset.target;
      const target = tg && (anchorFor(tg) || anchorFor("d:" + tg));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const cardEl = b.closest("[data-id]");
    const p = cardEl && byId.get(cardEl.dataset.id);
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
  scrim.addEventListener("click", closeSheet);
  $("mart-sheet-x").addEventListener("click", closeSheet);
  $("mart-cart").addEventListener("click", () => $("cart-btn").click());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  window.addEventListener("cart-changed", refresh);
  // language switch: redraw the dynamic parts (static markup is translated by applyLang)
  document.addEventListener("langchange", () => { if (shop) { paintStore(); renderList(); paintBar(); } });
  // leaving the shop screen (sidebar, cart) must not leave the sheet / scroll lock behind
  new MutationObserver(() => { if (view.hidden) closeSheet(); }).observe(view, { attributes: true, attributeFilter: ["hidden"] });

  // voice search; the button is hidden where the browser has no speech recognition
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("mic-btn");
  if (!SR) mic.hidden = true;
  else mic.onclick = () => {
    try {
      const rec = new SR();
      rec.lang = getLang() === "hi" ? "hi-IN" : "en-IN";
      rec.onresult = (ev) => { $("product-search").value = ev.results[0][0].transcript; api.search($("product-search").value); };
      rec.onerror = () => toast(t("hmVoiceFail"), { tone: "bad", ms: 3000 });
      rec.start();
    } catch (e) { toast(t("hmVoiceOff"), { tone: "bad", ms: 3000 }); }
  };

  const api = {
    // s = { id, name, ... } (storeSettings/main), ps = active products, ds = ACTIVE departments in shelf order
    // extra = { orders: [the customer's earlier orders, newest first], banners: [banner docs] } (both optional)
    show(s, ps, ds = [], extra = {}) {
      shop = s;
      depts = ds;
      orders = extra.orders || [];
      products = sortProducts(ps);
      byId = new Map(products.map((p) => [p.id, p]));
      ({ sections } = buildHome({ products, depts, orders }));
      again = lastOrder(orders, products, { maxQty: MAX_QTY });
      banners = activeBanners(extra.banners);
      query = "";
      allTiles = false;
      $("product-search").value = "";
      paintStore();
      renderList();
      paintBar();
      window.scrollTo({ top: 0 });
    },
    search(q) { query = q || ""; renderList(); },
    loading, error: failed,
  };
  return api;
}
