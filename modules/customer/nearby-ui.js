// Phase 3A: Nearby dashboard UI (presentation only).
// No Firebase, no GPS, no Leaflet here: data and actions are injected, so Phase 3B can wire
// location.js / nearby.js and Phase 3C can mount the map into getMapContainer().
// All text is set with textContent (shop names/addresses are user data, never innerHTML).
//
//   const ui = createNearbyDashboard(rootEl, { onRequestLocation, onCancelLocation, onPickOnMap, onChangeLocation,
//                                              onRetry, onBrowseAll, onSelectShop, onOpenShop, onSearch, onCategory });
//   ui.setState({ locationState, location, locationError, discovery, mapStatus, selectedId })
//   discovery = { status: 'idle'|'loading'|'error'|'ready', entries: [{shop, eligibility}], stats }
//   mapStatus = 'pending' | 'ready' | 'failed' | 'off'   ('failed' => list-only + "map could not load" note; 'off' => list-only, no map at all)
//   onPickOnMap is optional: without it the "Choose on map" buttons are not drawn.
import { t, getLang } from "../../shared/i18n/i18n.js";
import { CATEGORIES, catImg } from "../../shared/config/categories.js";
import { Screen, resolveScreen, filterEntries, summarizeEntries, toCardModel } from "./nearby-view-model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  chevron: "M6 9l6 6 6-6",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3"
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function icon(name) {
  const s = document.createElementNS(SVG_NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "nb-ico");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", ICONS[name]);
  s.appendChild(p);
  return s;
}
function btn(cls, label, onClick, { primary = false } = {}) {
  const b = el("button", (primary ? "nb-btn nb-btn--primary " : "nb-btn ") + cls, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

export function createNearbyDashboard(root, handlers = {}) {
  const h = (name) => (...a) => { if (typeof handlers[name] === "function") handlers[name](...a); };
  let state = { locationState: "NOT_REQUESTED", location: null, locationError: null,
                discovery: { status: "idle", entries: [] }, mapStatus: "pending", selectedId: null };
  let query = "", category = "all", view = "list";     // view: which pane shows on narrow screens

  // ---------------------------------------------------------------- static shell (built once)
  root.textContent = "";
  root.classList.add("nb");
  root.setAttribute("aria-live", "polite");

  const locBtn = el("button", "nb-loc");
  locBtn.type = "button";
  const locText = el("span", "nb-loc-text");
  const locLabel = el("span", "nb-loc-label");
  const locName = el("strong", "nb-loc-name");
  locText.append(locLabel, locName);
  const locChange = el("span", "nb-loc-change");
  locBtn.append(icon("pin"), locText, locChange, icon("chevron"));
  locBtn.addEventListener("click", () => h("onChangeLocation")());

  const searchWrap = el("label", "nb-search");
  const searchInput = el("input");
  searchInput.type = "search"; searchInput.autocomplete = "off"; searchInput.maxLength = 60;
  searchInput.addEventListener("input", () => { query = searchInput.value; renderBody(); h("onSearch")(query); });
  searchWrap.append(icon("search"), searchInput);

  const chips = el("div", "nb-chips");
  chips.setAttribute("role", "group");
  const chipBtns = new Map();
  function addChip(id, label, cat) {
    const b = el("button", "nb-chip");
    b.type = "button";
    if (cat && cat.img) b.appendChild(catImg(cat, "chip-pic"));
    const txt = el("span", null, label);
    b.appendChild(txt);
    b.addEventListener("click", () => { category = id; paintChips(); renderBody(); h("onCategory")(id); });
    chips.appendChild(b);
    chipBtns.set(id, { b, txt, cat });
  }
  addChip("all", "", null);
  CATEGORIES.forEach((c) => addChip(c.id, c.en, c));

  const toggle = el("div", "nb-toggle");
  toggle.setAttribute("role", "group");
  const tList = el("button", "nb-toggle-btn"), tMap = el("button", "nb-toggle-btn");
  tList.type = tMap.type = "button";
  tList.append(icon("list"), el("span"));
  tMap.append(icon("map"), el("span"));
  tList.addEventListener("click", () => setView("list"));
  tMap.addEventListener("click", () => setView("map"));
  toggle.append(tList, tMap);

  const body = el("div", "nb-body");
  const layout = el("div", "nb-layout");
  const listCol = el("section", "nb-listcol");
  const mapCol = el("section", "nb-mapcol");
  const mapSlot = el("div", "md-map nb-map");           // Phase 3C: adapter.initializeMap(ui.getMapContainer(), ...)
  const mapNote = el("p", "nb-map-note");
  mapNote.hidden = true;
  mapCol.append(mapSlot, mapNote);
  layout.append(listCol, mapCol);
  const centered = el("div", "nb-centered");           // full-width state panels (no map yet)
  body.append(layout, centered);

  root.append(locBtn, searchWrap, chips, toggle, body);

  // ---------------------------------------------------------------- painting
  function setView(v) {
    view = v;
    paintToggle();
    if (v === "map") queueMicrotask(() => h("onMapShown")());   // 3C: map.invalidateSize()
  }
  function paintToggle() {
    const mapOk = mapOn();
    toggle.hidden = !mapOk || !hasLocation();
    if (!mapOk && view === "map") view = "list";
    tList.setAttribute("aria-pressed", String(view === "list"));
    tMap.setAttribute("aria-pressed", String(view === "map"));
    layout.dataset.view = view;
  }
  function paintChips() {
    chipBtns.forEach(({ b, txt, cat }, id) => {
      if (id === "all") txt.textContent = t("nbAllCats");
      else if (cat) txt.textContent = getLang() === "hi" && cat.hi ? cat.hi : cat.en;
      const on = id === category;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }
  function locationTitle() {
    const l = state.location;
    if (!l) return "";
    if (l.label) return l.label;
    return t(l.source === "manual" ? "nbLocManual" : l.source === "saved" ? "nbLocSaved" : "nbLocGps");
  }
  function paintStaticText() {
    locLabel.textContent = t("nbDeliverTo");
    locName.textContent = hasLocation() ? locationTitle() : t("nbNeedTitle");
    locChange.textContent = t("nbChange");
    locBtn.setAttribute("aria-label", t("nbChange") + ": " + (hasLocation() ? locationTitle() : t("nbAllow")));
    searchInput.placeholder = t("nbSearchPh");
    searchInput.setAttribute("aria-label", t("nbSearchPh"));
    tList.lastChild.textContent = t("nbList");
    tMap.lastChild.textContent = t("nbMap");
    chips.setAttribute("aria-label", t("nbAllCats"));
    paintChips();
    paintToggle();
  }
  const hasLocation = () => !!state.location;
  const mapOn = () => state.mapStatus !== "failed" && state.mapStatus !== "off";

  // -- state panels
  function panel(kind, title, bodyText, actions) {
    const p = el("div", "nb-panel nb-panel--" + kind);
    p.appendChild(el("h2", "nb-panel-title", title));
    if (bodyText) p.appendChild(el("p", "nb-panel-body", bodyText));
    actions = actions.filter(Boolean);
    if (actions.length) { const a = el("div", "nb-panel-actions"); a.append(...actions); p.appendChild(a); }
    return p;
  }
  const browseAll = () => btn("nb-btn--ghost", t("nbBrowseAll"), () => h("onBrowseAll")());
  const pickOnMap = (primary = false) => typeof handlers.onPickOnMap === "function"
    ? btn(primary ? "" : "nb-btn--ghost", t("nbPickMap"), () => h("onPickOnMap")(), { primary }) : null;

  function skeletons() {
    const wrap = el("div", "nb-skeletons");
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-busy", "true");
    wrap.appendChild(el("span", "nb-sr", t("nbLoadingA11y")));
    for (let i = 0; i < 4; i++) {
      const c = el("div", "nb-card nb-skel");
      c.setAttribute("aria-hidden", "true");
      c.append(el("span", "nb-skel-line nb-skel-w60"), el("span", "nb-skel-line nb-skel-w90"), el("span", "nb-skel-line nb-skel-w40"));
      wrap.appendChild(c);
    }
    return wrap;
  }

  function card(entry) {
    const m = toCardModel(entry);
    const a = el("article", "nb-card" + (m.deliverable ? "" : " is-unavailable") + (m.id === state.selectedId ? " is-selected" : ""));
    a.dataset.shopId = m.id;
    if (m.id === state.selectedId) a.setAttribute("aria-current", "true");
    a.addEventListener("click", () => h("onSelectShop")(m.id, entry));

    const top = el("div", "nb-card-top");
    top.append(el("h3", "nb-card-name", m.name),
               el("span", "nb-badge nb-badge--" + m.tone, t(m.statusKey)));
    const meta = el("p", "nb-card-meta");
    meta.textContent = [m.categoryLabel, m.distance ? t("nbAway", { d: m.distance }) : ""].filter(Boolean).join(" · ");
    a.append(top, meta);
    if (m.address) a.appendChild(el("p", "nb-card-addr", m.address));
    if (m.facts.length) {
      const ul = el("ul", "nb-facts");
      m.facts.forEach((f) => ul.appendChild(el("li", null, t(f.key, f.vars))));
      a.appendChild(ul);
    }
    const actions = el("div", "nb-card-actions");
    if (m.canOpen) {
      const open = btn("", t("nbView"), (e) => { e.stopPropagation(); h("onOpenShop")(m.id, entry); }, { primary: true });
      open.setAttribute("aria-label", t("nbView") + ": " + m.name);
      actions.appendChild(open);
    }
    if (mapOn() && m.mappable) {
      const show = btn("nb-btn--ghost nb-show-map", t("nbShowOnMap"), (e) => {
        e.stopPropagation(); h("onSelectShop")(m.id, entry); setView("map");
      });
      show.setAttribute("aria-label", t("nbShowOnMap") + ": " + m.name);
      actions.appendChild(show);
    }
    if (actions.childNodes.length) a.appendChild(actions);
    return a;
  }

  function renderBody() {
    const d = state.discovery || { status: "idle", entries: [] };
    const screen = resolveScreen({ locationState: state.locationState, location: state.location, discovery: d, query, category });
    listCol.textContent = "";
    centered.textContent = "";
    const withMap = hasLocation();
    layout.hidden = !withMap;
    centered.hidden = withMap;
    root.dataset.screen = screen;
    searchWrap.hidden = chips.hidden = !withMap;
    paintStaticText();

    const errMsg = state.locationError && state.locationError.message;
    switch (screen) {
      case Screen.NEEDS_LOCATION:
        centered.appendChild(panel("info", t("nbNeedTitle"), t("nbNeedBody"), [
          btn("", t("nbAllow"), () => h("onRequestLocation")(), { primary: true }),
          pickOnMap(),
          browseAll()]));
        break;
      case Screen.LOCATING:
        centered.appendChild(panel("info", t("nbLocating"), "", [btn("nb-btn--ghost", t("nbCancel"), () => h("onCancelLocation")())]));
        break;
      case Screen.LOCATION_PROBLEM:
        centered.appendChild(panel("error", t("nbProblemTitle"), errMsg || "", [
          btn("", t("nbRetry"), () => h("onRequestLocation")(), { primary: true }),
          pickOnMap(),
          browseAll()]));
        break;
      case Screen.LOADING:
        listCol.appendChild(skeletons());
        break;
      case Screen.LOAD_ERROR:
        listCol.appendChild(panel("error", t("nbErrTitle"), t("nbErrBody"), [
          btn("", t("nbRetry"), () => h("onRetry")(), { primary: true }), browseAll()]));
        break;
      case Screen.EMPTY_NONE:
        listCol.appendChild(panel("empty", t("nbEmptyTitle"), t("nbEmptyBody"), [
          pickOnMap(true), browseAll()]));
        break;
      case Screen.EMPTY_SEARCH:
        listCol.appendChild(panel("empty", t("nbEmptySearchTitle"), t("nbEmptySearchBody"), [
          btn("", t("nbClearFilters"), clearFilters, { primary: true })]));
        break;
      case Screen.RESULTS: {
        const shown = filterEntries(d.entries, { query, category });
        const sum = summarizeEntries(shown);
        const head = el("div", "nb-summary");
        head.appendChild(el("p", "nb-summary-main", sum.deliverable ? t("nbSummary", { n: sum.deliverable }) : t("nbNoneDeliver")));
        if (sum.other) head.appendChild(el("p", "nb-summary-sub", t("nbSummaryOther", { n: sum.other })));
        head.appendChild(el("p", "nb-summary-note", t("nbDistNote") + (d.stats && d.stats.truncated ? " " + t("nbTruncated") : "")));
        listCol.appendChild(head);
        const list = el("div", "nb-list");
        shown.forEach((e) => list.appendChild(card(e)));
        listCol.appendChild(list);
        break;
      }
    }
    mapNote.hidden = state.mapStatus !== "failed";
    mapNote.textContent = t("nbMapUnavailable");
    mapCol.classList.toggle("is-failed", state.mapStatus === "failed");
    mapCol.classList.toggle("is-off", state.mapStatus === "off");
  }

  function clearFilters() {
    query = ""; category = "all"; searchInput.value = "";
    renderBody();
    h("onSearch")(""); h("onCategory")("all");
  }

  document.addEventListener("langchange", renderBody);
  renderBody();

  return {
    /** Merge a partial state and re-render. */
    setState(patch) { state = { ...state, ...patch }; renderBody(); },
    /** Highlight a card (e.g. after a map marker click) and bring it into view. */
    setSelected(id, { scroll = true } = {}) {
      state = { ...state, selectedId: id };
      listCol.querySelectorAll(".nb-card[data-shop-id]").forEach((c) => {
        const on = c.dataset.shopId === id;
        c.classList.toggle("is-selected", on);
        if (on) { c.setAttribute("aria-current", "true"); if (scroll) c.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
        else c.removeAttribute("aria-current");
      });
    },
    /** Entries currently visible after search/category filtering (for the map to mirror). */
    getVisibleEntries() { return filterEntries((state.discovery || {}).entries, { query, category }); },
    getMapContainer: () => mapSlot,
    showMapPane: () => setView("map"),
    destroy() { document.removeEventListener("langchange", renderBody); root.textContent = ""; root.classList.remove("nb"); }
  };
}
