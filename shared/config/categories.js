// Single source of truth for shop categories (login animation, filters, shop register, home).
// NOTE: ids must match firestore.rules -> shops.create -> category list.
export const CATEGORIES = [
  { id: "kirana",       icon: "🛒", en: "Kirana",             hi: "किराना" },
  { id: "sabzi-fruit",  icon: "🥬", en: "Sabzi / Fruit",      hi: "सब्ज़ी / फल" },
  { id: "dairy",        icon: "🥛", en: "Dairy",              hi: "डेयरी" },
  { id: "bakery",       icon: "🍞", en: "Bakery",             hi: "बेकरी" },
  { id: "sweets",       icon: "🍬", en: "Sweets / Namkeen",   hi: "मिठाई / नमकीन" },
  { id: "restaurant",   icon: "🍽️", en: "Restaurant / Dhaba", hi: "होटल / ढाबा" },
  { id: "medical",      icon: "💊", en: "Medical",            hi: "मेडिकल" },
  { id: "clothes",      icon: "👕", en: "Clothes",            hi: "कपड़े" },
  { id: "footwear",     icon: "👟", en: "Footwear",           hi: "जूते-चप्पल" },
  { id: "electronics",  icon: "📱", en: "Mobile / Electronics", hi: "मोबाइल / इलेक्ट्रॉनिक्स" },
  { id: "hardware",     icon: "🔧", en: "Hardware",           hi: "हार्डवेयर" },
  { id: "stationery",   icon: "✏️", en: "Stationery",         hi: "स्टेशनरी" },
  { id: "salon",        icon: "💈", en: "Salon / Beauty",     hi: "सैलून / ब्यूटी" },
  { id: "jewellery",    icon: "💍", en: "Jewellery",          hi: "ज्वेलरी" },
  { id: "pooja",        icon: "🪔", en: "Pooja Samagri",      hi: "पूजा सामग्री" },
  { id: "agri",         icon: "🌾", en: "Beej / Khad",        hi: "बीज / खाद" },
  { id: "other",        icon: "🏪", en: "Other",              hi: "अन्य" }
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catLabel = (id) => (CAT_BY_ID[id] ? CAT_BY_ID[id].en : id);
export const catFull = (id) => (CAT_BY_ID[id] ? CAT_BY_ID[id].icon + " " + CAT_BY_ID[id].en : id);

// Must match firestore.rules -> validProduct -> unit list.
export const UNITS = ["kg", "g", "litre", "piece", "packet", "dozen", "pair", "box", "metre"];
