import { CATEGORIES } from "../../shared/config/categories.js";

const grid = document.querySelector("#category-grid");
const message = document.querySelector("#category-message");

CATEGORIES.forEach((c) => {
  const b = document.createElement("button");
  b.className = "category";
  b.type = "button";
  const ico = document.createElement("span");
  ico.className = "cat-ico";
  ico.textContent = c.icon;
  const lbl = document.createElement("span");
  lbl.textContent = c.en;
  b.append(ico, lbl);
  b.addEventListener("click", () => {
    message.textContent = c.en + " dukaanein dekhne ke liye login karein.";
  });
  grid.appendChild(b);
});
