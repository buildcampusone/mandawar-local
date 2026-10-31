// Grocery departments (Phase 4). Stored in the top-level `categories` collection; the owner (admin) can add, rename,
// reorder and deactivate them. These 17 are only the STARTING set: the owner's "17 departments jodein" button writes them
// once (document id = id below), after that Firestore is the source of truth.
// Pure helpers only (no DOM, no Firebase) so they can be unit-tested.

export const STORE_ID = "main";   // storeSettings/main - the one store. Orders still carry shopId = "main" until Phase 7.

export const DEFAULT_DEPARTMENTS = [
  { id: "fruits-vegetables", name: "Fruits & Vegetables" },
  { id: "dairy-bread-eggs", name: "Dairy, Bread & Eggs" },
  { id: "atta-flour", name: "Atta & Flour" },
  { id: "rice-grains", name: "Rice & Grains" },
  { id: "dal-pulses", name: "Dal & Pulses" },
  { id: "oil-ghee", name: "Oil & Ghee" },
  { id: "masala-spices", name: "Masala & Spices" },
  { id: "dry-fruits-nuts", name: "Dry Fruits & Nuts" },
  { id: "snacks-namkeen", name: "Snacks & Namkeen" },
  { id: "biscuits-bakery", name: "Biscuits & Bakery" },
  { id: "tea-coffee", name: "Tea & Coffee" },
  { id: "sugar-salt", name: "Sugar & Salt" },
  { id: "packaged-foods", name: "Packaged Foods" },
  { id: "beverages", name: "Beverages" },
  { id: "personal-care", name: "Personal Care" },
  { id: "household-essentials", name: "Household Essentials" },
  { id: "cleaning-products", name: "Cleaning Products" }
];

// Tile icons for the customer home (not stored in Firestore). New departments the owner adds get the basket.
const EMOJI = {
  "fruits-vegetables": "🥦", "dairy-bread-eggs": "🥛", "atta-flour": "🌾", "rice-grains": "🍚", "dal-pulses": "🫘",
  "oil-ghee": "🫙", "masala-spices": "🌶️", "dry-fruits-nuts": "🥜", "snacks-namkeen": "🍿", "biscuits-bakery": "🍪",
  "tea-coffee": "☕", "sugar-salt": "🧂", "packaged-foods": "📦", "beverages": "🧃", "personal-care": "🧴",
  "household-essentials": "🏠", "cleaning-products": "🧽"
};
export const deptEmoji = (id) => EMOJI[id] || "🛒";

export const NAME_MIN = 2, NAME_MAX = 30;   // same limits as firestore.rules (categories)

export function cleanName(v) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** "Dairy, Bread & Eggs" -> "dairy-bread-eggs" (document ids for new departments). Empty when nothing usable is left. */
export function slugify(name) {
  return cleanName(name).toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** -> "" when fine, otherwise a short Hinglish message. `existing` = current departments (to catch duplicates). */
export function nameProblem(name, existing = [], ownId = null) {
  const n = cleanName(name);
  if (n.length < NAME_MIN || n.length > NAME_MAX) return "Department ka naam " + NAME_MIN + " se " + NAME_MAX + " akshar ka ho.";
  const dup = existing.some((d) => d.id !== ownId && cleanName(d.name).toLowerCase() === n.toLowerCase());
  return dup ? "Is naam ka department pehle se hai." : "";
}

/** Departments in shelf order (order, then name). Bad or missing order goes last. */
export function sortDepartments(list) {
  const ord = (d) => (Number.isFinite(d.order) ? d.order : Number.MAX_SAFE_INTEGER);
  return (list || []).slice().sort((a, b) => ord(a) - ord(b) || String(a.name).localeCompare(String(b.name)));
}

export const activeDepartments = (list) => sortDepartments((list || []).filter((d) => d.active === true));

/** Next free `order` value (end of the shelf). */
export function nextOrder(list) {
  return (list || []).reduce((m, d) => (Number.isFinite(d.order) ? Math.max(m, d.order) : m), 0) + 1;
}

/**
 * Move department `id` one place up (-1) or down (+1). -> [{ id, order }] writes to make (empty at the ends / unknown id).
 * The whole shelf is renumbered 1..n so duplicate or missing order values heal themselves.
 */
export function moveDepartment(list, id, dir) {
  const s = sortDepartments(list);
  const i = s.findIndex((d) => d.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= s.length) return [];
  [s[i], s[j]] = [s[j], s[i]];
  return s.map((d, k) => ({ id: d.id, order: k + 1 })).filter((w) => {
    const old = list.find((d) => d.id === w.id);
    return !old || old.order !== w.order;
  });
}

/** Defaults the shelf does not have yet, with their order numbers. -> [{ id, name, order, active:true }] */
export function missingDefaults(list) {
  const have = new Set((list || []).map((d) => d.id));
  let order = nextOrder(list);
  return DEFAULT_DEPARTMENTS.filter((d) => !have.has(d.id)).map((d) => ({ id: d.id, name: d.name, order: order++, active: true }));
}
