// Home: "Explore Categories" - two auto-scrolling rows built from shared/config/categories.js.
// Motion is pure CSS (shared/styles/category-showcase.css); JS only builds the DOM once and
// handles pause-on-touch / off-screen pause. One delegated click listener serves every card.
import { CATEGORIES, CAT_BY_ID, catImg } from "../../shared/config/categories.js";

const root = document.querySelector("#category-showcase");
const message = document.querySelector("#category-message");

// each row holds the category set twice; the 2nd copy is decoration only (aria-hidden, not focusable)
function buildSet(list, decorative) {
  const ul = document.createElement("ul");
  ul.className = "cx-set";
  if (decorative) ul.setAttribute("aria-hidden", "true");
  list.forEach((c, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cx-card";
    b.dataset.cat = c.id;
    if (decorative) b.tabIndex = -1;
    const box = document.createElement("span");
    box.className = "cx-img";
    const img = catImg(c, "cx-pic");
    img.width = img.height = 512;
    if (!decorative && i < 5) img.loading = "eager";   // first cards are on screen at load; the rest lazy-load ahead of the slide
    box.appendChild(img);
    const name = document.createElement("span");
    name.className = "cx-name";
    name.textContent = c.en;
    b.append(box, name);
    li.appendChild(b);
    ul.appendChild(li);
  });
  return ul;
}

function buildRow(list, dir) {
  const row = document.createElement("div");
  row.className = "cx-row";
  row.dataset.dir = dir;               // rtl = moves right-to-left, ltr = left-to-right
  const track = document.createElement("div");
  track.className = "cx-track";
  track.append(buildSet(list, false), buildSet(list, true));
  row.appendChild(track);
  return row;
}

if (root) {
  const rows = root.querySelector(".cx-rows");
  const n = CATEGORIES.length;
  const shifted = CATEGORIES.slice(Math.ceil(n / 2)).concat(CATEGORIES.slice(0, Math.ceil(n / 2)));   // row 2 starts mid-list
  rows.append(buildRow(CATEGORIES, "rtl"), buildRow(shifted, "ltr"));

  // category click (existing behaviour: message; ids unchanged)
  rows.addEventListener("click", (e) => {
    const card = e.target.closest(".cx-card");
    const c = card && CAT_BY_ID[card.dataset.cat];
    if (c && message) message.textContent = c.en + " dukaanein dekhne ke liye login karein.";
  });

  // touch / pen hold pauses the row, resumes shortly after release
  const timers = new WeakMap();
  const hold = (e) => {
    const row = e.target.closest(".cx-row");
    if (!row || e.pointerType === "mouse") return;
    clearTimeout(timers.get(row));
    row.classList.add("held");
  };
  const release = (e) => {
    const row = e.target.closest(".cx-row");
    if (!row || e.pointerType === "mouse") return;
    timers.set(row, setTimeout(() => row.classList.remove("held"), 900));
  };
  rows.addEventListener("pointerdown", hold);
  rows.addEventListener("pointerup", release);
  rows.addEventListener("pointercancel", release);

  // no work while scrolled out of view or tab hidden
  let io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(([en]) => root.classList.toggle("off", !en.isIntersecting));
    io.observe(root);
  }
  window.addEventListener("pagehide", () => io && io.disconnect(), { once: true });
}
