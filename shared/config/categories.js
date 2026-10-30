// Single source of truth for shop categories (login animation, filters, shop register, home).
// img = file in assets/images/categories/ (real photo shown instead of an emoji).
// NOTE: ids must match firestore.rules -> shops.create -> category list.
export const CATEGORIES = [
  { id: "kirana", img: "kirana.webp", en: "Kirana",             hi: "किराना" },
  { id: "sabzi-fruit", img: "sabzi-fruit.webp", en: "Sabzi / Fruit",      hi: "सब्ज़ी / फल" },
  { id: "dairy", img: "dairy.webp", en: "Dairy",              hi: "डेयरी" },
  { id: "bakery", img: "bakery.webp", en: "Bakery",             hi: "बेकरी" },
  { id: "sweets", img: "sweets-namkeen.webp", en: "Sweets / Namkeen",   hi: "मिठाई / नमकीन" },
  { id: "restaurant", img: "restaurant-dhaba.webp", en: "Restaurant / Dhaba", hi: "होटल / ढाबा" },
  { id: "medical", img: "medical.webp", en: "Medical",            hi: "मेडिकल" },
  { id: "clothes", img: "clothes.webp", en: "Clothes",            hi: "कपड़े" },
  { id: "footwear", img: "footwear.webp", en: "Footwear",           hi: "जूते-चप्पल" },
  { id: "electronics", img: "mobile-electronics.webp", en: "Mobile / Electronics", hi: "मोबाइल / इलेक्ट्रॉनिक्स" },
  { id: "hardware", img: "hardware.webp", en: "Hardware",           hi: "हार्डवेयर" },
  { id: "stationery", img: "stationery.webp", en: "Stationery",         hi: "स्टेशनरी" },
  { id: "salon", img: "salon-beauty.webp", en: "Salon / Beauty",     hi: "सैलून / ब्यूटी" },
  { id: "jewellery", img: "jewellery.webp", en: "Jewellery",          hi: "ज्वेलरी" },
  { id: "pooja", img: "pooja-samagri.webp", en: "Pooja Samagri",      hi: "पूजा सामग्री" },
  { id: "agri", img: "beej-khad.webp", en: "Beej / Khad",        hi: "बीज / खाद" },
  { id: "other", img: "other.webp", en: "Other",              hi: "अन्य" }
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catLabel = (id) => (CAT_BY_ID[id] ? CAT_BY_ID[id].en : id);
export const catFull = (id) => (CAT_BY_ID[id] ? CAT_BY_ID[id].en : id);

export const CAT_IMG_DIR = "./assets/images/categories/";
// <img> element with the category photo; `cls` is the css class (cat-pic, chip-pic, pic ...)
export function catImg(c, cls = "cat-pic") {
  const i = document.createElement("img");
  i.className = cls;
  i.src = CAT_IMG_DIR + c.img;
  i.alt = "";
  i.loading = cls === "pic" ? "eager" : "lazy";   // login marquee tiles slide in from off-screen, so no lazy there
  i.decoding = "async";
  return i;
}

// Must match firestore.rules -> validProduct -> unit list.
export const UNITS = ["kg", "g", "litre", "piece", "packet", "dozen", "pair", "box", "metre"];
