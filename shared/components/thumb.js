// Square product thumbnail: the real photo when the product has one, otherwise a coloured letter tile.
// `p` needs { name, image? }. Only data:image/jpeg URLs are ever used as src (matches firestore.rules).
const TONES = ["#E3F3E8", "#FFF1C7", "#E6EEFB", "#FBE6EC", "#EFE7FA", "#E2F4F3", "#FCE9DA"];
const INK = ["#0B5A2D", "#6B4C00", "#1E4E9C", "#9B2B4C", "#5B3A9E", "#0F6663", "#9A4A12"];

export function thumb(p, cls = "") {
  const box = document.createElement("span");
  box.className = "thumb " + cls;
  const img = p && typeof p.image === "string" && p.image.startsWith("data:image/jpeg;base64,") ? p.image : "";
  if (img) {
    const i = document.createElement("img");
    i.alt = ""; i.loading = "lazy"; i.decoding = "async"; i.src = img;
    box.appendChild(i);
  } else {
    const name = (p && p.name) || "?";
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    box.textContent = name.trim().charAt(0).toUpperCase();
    box.style.background = TONES[h % TONES.length];
    box.style.color = INK[h % INK.length];
  }
  return box;
}
