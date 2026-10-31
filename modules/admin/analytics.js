// Owner analytics: sales for today / 7 days / 30 days from the orders collection (admin may read all orders, firestore.rules).
// All the maths is in analytics-core.js (unit-tested). One series (daily revenue) -> one hue, no legend; a table view is always available.
import { db } from "../../shared/config/firebase.js";
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { rangeFor, summarize, dailySeries, topProducts, statusCounts, rupees } from "./analytics-core.js";

const MAX_ORDERS = 2000;
const PERIODS = [["today", "Aaj"], ["7d", "7 din"], ["30d", "30 din"]];
const STATUS_TXT = { placed: "Naye", accepted: "Accepted", out_for_delivery: "Delivery par", delivered: "Delivered", rejected: "Rejected", cancelled: "Cancelled" };
const SVGNS = "http://www.w3.org/2000/svg";

const mk = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null && text !== "") e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const sv = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
};

let root = null, period = "7d", orders = null, failed = "", capped = false, showTable = false, token = 0;

export function initAnalytics(el) { root = el; load(); }
export function reloadAnalytics() { if (root) load(); }

async function load() {
  const my = ++token;
  orders = null; failed = ""; paint();
  try {
    const r = rangeFor("30d");                      // one read covers all three periods
    const snap = await getDocs(query(collection(db, "orders"), where("createdAt", ">=", Timestamp.fromDate(r.start)), orderBy("createdAt", "desc"), limit(MAX_ORDERS)));
    if (my !== token) return;
    orders = snap.docs.map((d) => d.data());
    capped = snap.size >= MAX_ORDERS;
  } catch (e) {
    if (my !== token) return;
    failed = (e && (e.message || e.code)) || "Load nahi hua.";
  }
  paint();
}

function paint() {
  root.textContent = "";
  root.appendChild(mk("h2", "Analytics"));
  root.appendChild(mk("p", "Bikri ka hisaab. Kamai sirf Delivered orders se gini jaati hai.", "muted"));
  const seg = mk("div", "", "seg");
  PERIODS.forEach(([id, label]) => {
    const b = mk("button", label); b.type = "button";
    if (period === id) b.classList.add("on");
    b.onclick = () => { period = id; paint(); };
    seg.appendChild(b);
  });
  root.appendChild(seg);
  if (failed) {
    root.appendChild(mk("p", "Analytics load nahi hui: " + failed, "cv-bad"));
    const b = mk("button", "Dobara try karein", "category"); b.type = "button"; b.onclick = load; root.appendChild(b);
    return;
  }
  if (!orders) { root.appendChild(mk("p", "Loading...", "muted")); return; }
  if (capped) root.appendChild(mk("p", "Pichhle 30 din me " + MAX_ORDERS + " se zyada order hain; sabse naye " + MAX_ORDERS + " ginti me liye gaye.", "muted"));

  const range = rangeFor(period);
  const s = summarize(orders, range);
  const tiles = mk("div", "", "kpis");
  [["Kamai", rupees(s.revenue)], ["Delivered orders", s.delivered], ["Average order", rupees(s.avgOrder)], ["Cancel / reject", s.cancelRate + "%"]]
    .forEach(([l, v]) => { const t = mk("div", "", "kpi"); t.append(mk("b", String(v)), mk("span", l)); tiles.appendChild(t); });
  root.appendChild(tiles);
  if (s.active) root.appendChild(mk("p", s.active + " order abhi chal rahe hain (kamai me nahi jude).", "muted"));
  if (!s.orders) { root.appendChild(mk("div", "Is period me koi order nahi.", "empty")); return; }

  const series = dailySeries(orders, range);
  const card = mk("section", "", "an-card");
  card.appendChild(mk("h3", "Roz ki kamai"));
  if (series.length > 1) {
    card.appendChild(chart(series));
    const tg = mk("button", showTable ? "Chart dikhayein" : "Table dikhayein", "category ghost"); tg.type = "button";
    tg.onclick = () => { showTable = !showTable; paint(); };
    card.appendChild(tg);
    if (showTable) card.appendChild(table(series));
  } else {
    card.appendChild(mk("p", rupees(series[0].revenue) + " | " + series[0].orders + " delivered", "muted"));
  }
  root.appendChild(card);

  const top = topProducts(orders, range, 5);
  const tc = mk("section", "", "an-card");
  tc.appendChild(mk("h3", "Sabse zyada bikne wale"));
  if (!top.length) tc.appendChild(mk("p", "Abhi koi delivered order nahi.", "muted"));
  const maxQ = top.reduce((m, r) => Math.max(m, r.qty), 1);
  top.forEach((r, i) => {
    const line = mk("div", "", "an-top");
    line.appendChild(mk("span", (i + 1) + ". " + r.name, "an-name"));
    line.appendChild(mk("span", r.qty + " bika | " + rupees(r.revenue), "muted"));
    const bar = mk("span", "", "an-bar"); const fill = mk("span"); fill.style.width = Math.max(4, Math.round((r.qty / maxQ) * 100)) + "%"; bar.appendChild(fill);
    line.appendChild(bar);
    tc.appendChild(line);
  });
  root.appendChild(tc);

  const sc = mk("section", "", "an-card");
  sc.appendChild(mk("h3", "Orders ki halat"));
  const ul = mk("ul", "", "an-status");
  statusCounts(orders, range).forEach((r) => ul.appendChild(mk("li", (STATUS_TXT[r.status] || r.status) + ": " + r.count)));
  sc.appendChild(ul);
  root.appendChild(sc);
}

/** Bars for daily revenue. Thin rounded-top bars anchored to the baseline, max labelled, per-bar <title> as the hover/tap tooltip. */
function chart(rows) {
  const W = 320, H = 150, L = 4, R = 4, T = 14, B = 22;
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  const iw = W - L - R, slot = iw / rows.length, bw = Math.max(3, Math.min(18, slot * 0.6)), ih = H - T - B;
  const svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", class: "an-chart", preserveAspectRatio: "xMidYMid meet" });
  svg.setAttribute("aria-label", "Roz ki kamai ka bar chart. Sabse zyada " + rupees(max));
  svg.appendChild(sv("line", { x1: L, x2: W - R, y1: T + ih, y2: T + ih, class: "an-axis" }));
  const top = sv("text", { x: L, y: 10, class: "an-lbl" }); top.textContent = rupees(max); svg.appendChild(top);
  const every = Math.ceil(rows.length / 6);
  rows.forEach((r, i) => {
    const h = r.revenue > 0 ? Math.max(2, (r.revenue / max) * ih) : 0;
    const x = L + slot * i + (slot - bw) / 2, y = T + ih - h, rad = Math.min(4, bw / 2, h);
    if (h > 0) {
      const p = sv("path", { class: "an-bar-mark", d: "M" + x + "," + (y + h) + "V" + (y + rad) + "Q" + x + "," + y + " " + (x + rad) + "," + y + "H" + (x + bw - rad) + "Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + rad) + "V" + (y + h) + "Z" });
      const t = sv("title"); t.textContent = r.label + ": " + rupees(r.revenue) + " (" + r.orders + " order)"; p.appendChild(t);
      svg.appendChild(p);
    }
    if (i % every === 0 || i === rows.length - 1) {
      const tx = sv("text", { x: x + bw / 2, y: H - 6, class: "an-lbl", "text-anchor": "middle" }); tx.textContent = r.label; svg.appendChild(tx);
    }
  });
  return svg;
}

function table(rows) {
  const t = mk("table", "", "an-table");
  const head = mk("tr");
  ["Din", "Order", "Kamai"].forEach((h) => head.appendChild(mk("th", h)));
  t.appendChild(head);
  [...rows].reverse().forEach((r) => {
    const tr = mk("tr");
    tr.append(mk("td", r.label), mk("td", String(r.orders)), mk("td", rupees(r.revenue)));
    t.appendChild(tr);
  });
  return t;
}
