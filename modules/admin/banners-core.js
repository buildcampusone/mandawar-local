// Owner banners (collection `banners`, shown on the customer home). Pure helpers, unit-tested.
// Limits mirror firestore.rules validBanner and the customer strip (home-core activeBanners shows at most 6).
export const MAX_ACTIVE = 6;
export const LIMITS = { title: 40, subtitle: 60 };

/** Where a banner tap scrolls on the customer home: a special section or a department id. */
export function targetOptions(depts = []) {
  return [
    { value: "", label: "Kuch nahi (sirf dikhana)" },
    { value: "deals", label: "Deals" },
    { value: "best", label: "Best Sellers" },
    { value: "essentials", label: "Daily Essentials" },
    ...depts.filter((d) => d && d.active && typeof d.id === "string").map((d) => ({ value: d.id, label: "Department: " + d.name }))
  ];
}

/** Form values -> { error } or { data } (data has only the fields the rules allow; empty optionals are left out). */
export function cleanBanner({ title, subtitle, target }) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  const s = String(subtitle || "").replace(/\s+/g, " ").trim();
  const g = String(target || "").trim();
  if (t.length < 2 || t.length > LIMITS.title) return { error: "Title 2 se " + LIMITS.title + " akshar ka ho." };
  if (s.length > LIMITS.subtitle) return { error: "Subtitle " + LIMITS.subtitle + " akshar se chhota ho." };
  if (g.length > 40) return { error: "Target galat hai." };
  const data = { title: t };
  if (s) data.subtitle = s;
  if (g) data.target = g;
  return { data };
}

export const sortBanners = (list) =>
  [...list].sort((a, b) => (Number.isFinite(a.order) ? a.order : 1e9) - (Number.isFinite(b.order) ? b.order : 1e9) || String(a.id).localeCompare(String(b.id)));

export const nextBannerOrder = (list) => list.reduce((m, b) => Math.max(m, Number.isFinite(b.order) ? b.order : 0), -1) + 1;

/** Swap with the neighbour: -> [{ id, order }] writes (empty at the ends). Orders are renumbered 0..n-1 so ties heal. */
export function moveBanner(list, id, dir) {
  const a = sortBanners(list);
  const i = a.findIndex((b) => b.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= a.length) return [];
  [a[i], a[j]] = [a[j], a[i]];
  return a.map((b, k) => ({ id: b.id, order: k })).filter((w, k) => a[k].order !== w.order);
}

/** Warning when more banners are active than the customer strip can show. */
export function activeWarning(list) {
  const n = list.filter((b) => b.active === true).length;
  return n > MAX_ACTIVE ? "Customer ko sirf pehle " + MAX_ACTIVE + " active banner dikhte hain (abhi " + n + " active)." : "";
}
