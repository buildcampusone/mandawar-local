// Categories screen: pure helpers (no DOM, no Firebase). Groups the owner's departments into shelves like the design:
// Grocery / Snacks & Drinks / Fresh & Dairy / Home & Care. Departments the owner adds later land in "More".
export const GROUPS = [
  { key: "grocery", title: "Grocery", ids: ["atta-flour", "oil-ghee", "dal-pulses", "rice-grains", "dry-fruits-nuts", "sugar-salt", "masala-spices"] },
  { key: "snacks", title: "Snacks & Drinks", ids: ["snacks-namkeen", "biscuits-bakery", "packaged-foods", "beverages", "tea-coffee"] },
  { key: "fresh", title: "Fresh & Dairy", ids: ["fruits-vegetables", "dairy-bread-eggs"] },
  { key: "home", title: "Home & Care", ids: ["personal-care", "household-essentials", "cleaning-products"] }
];
export const ICONS = {
  "atta-flour": "🌾", "oil-ghee": "🫙", "dal-pulses": "🫘", "rice-grains": "🍚", "dry-fruits-nuts": "🥜", "sugar-salt": "🧂",
  "masala-spices": "🌶️", "snacks-namkeen": "🥨", "biscuits-bakery": "🍪", "packaged-foods": "🍜", "beverages": "🥤", "tea-coffee": "☕",
  "fruits-vegetables": "🥬", "dairy-bread-eggs": "🥛", "personal-care": "🧴", "household-essentials": "🧺", "cleaning-products": "🧼"
};
const TONES = { grocery: "peach", snacks: "blue", fresh: "mint", home: "cream", more: "cream" };

/** depts: [{id, name}] in shelf order; q: optional search text -> [{key, title, tone, items:[{id, name, icon}]}] (empty groups dropped). */
export function groupDepartments(depts, q = "") {
  const needle = String(q || "").trim().toLowerCase();
  const list = (Array.isArray(depts) ? depts : []).filter((d) => d && typeof d.id === "string" && typeof d.name === "string")
    .filter((d) => !needle || d.name.toLowerCase().includes(needle));
  const known = new Set(GROUPS.flatMap((g) => g.ids));
  const pick = (g) => list.filter((d) => (g.ids ? g.ids.includes(d.id) : !known.has(d.id)))
    .map((d) => ({ id: d.id, name: d.name, icon: ICONS[d.id] || d.name.trim().charAt(0).toUpperCase() }));
  return [...GROUPS, { key: "more", title: "More" }]
    .map((g) => ({ key: g.key, title: g.title, tone: TONES[g.key], items: pick(g) }))
    .filter((g) => g.items.length);
}
// Top tab strip of the design. `to` = a key the home screen can scroll to ("d:<id>" = a department).
export const TABS = [
  { id: "deals", label: "Deals", to: "deals" },
  { id: "fresh", label: "Fresh", to: "d:fruits-vegetables" },
  { id: "categories", label: "Categories", to: null },
  { id: "rice", label: "Rice", to: "d:rice-grains" },
  { id: "kirana", label: "Kirana", to: "essentials" }
];
