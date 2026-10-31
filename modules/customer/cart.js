import { STORE_ID } from "../../shared/config/departments.js";
const KEY = "ml_cart";
export const MAX_ITEMS = 5;
export const MAX_QTY = 20;

export function getCart() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    // a cart saved by the old multi-shop app (another shopId) is dropped: its product ids no longer exist
    if (c && c.shopId === STORE_ID && Array.isArray(c.items)) return c;
  } catch (e) {}
  return { shopId: null, items: [] };
}

function save(c) {
  try {
    if (c.items.length) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch (e) {}
  window.dispatchEvent(new Event("cart-changed"));
}

export function clearCart() { save({ shopId: null, items: [] }); }

export function addItem(shopId, productId, qty) {
  qty = Number(qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY)
    return "Quantity 1 se 20 ke beech poora number ho.";
  let c = getCart();
  if (c.shopId && c.shopId !== shopId) {
    if (!confirm("Cart mein doosri dukaan ka saaman hai. Purana cart khali karein?"))
      return "Cart nahi badla.";
    c = { shopId: null, items: [] };
  }
  const ex = c.items.find((i) => i.productId === productId);
  if (ex) {
    ex.qty = Math.min(MAX_QTY, ex.qty + qty);
  } else {
    if (c.items.length >= MAX_ITEMS)
      return "Is order mein 5 se zyada items nahi ja sakte, baaki alag order mein karein.";
    c.items.push({ productId, qty });
  }
  c.shopId = shopId;
  save(c);
  return "";
}

export function setQty(productId, qty) {
  qty = Number(qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return false;
  const c = getCart();
  const it = c.items.find((i) => i.productId === productId);
  if (!it) return false;
  it.qty = qty;
  save(c);
  return true;
}

export function removeItem(productId) {
  const c = getCart();
  c.items = c.items.filter((i) => i.productId !== productId);
  save(c);
}

// Reorder: replace the whole cart with items from an earlier order (caller has already checked availability).
export function replaceCart(shopId, items) {
  const clean = [];
  for (const i of items) {
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(i.qty)) || 1));
    if (i.productId && !clean.some((c) => c.productId === i.productId)) clean.push({ productId: i.productId, qty });
    if (clean.length >= MAX_ITEMS) break;
  }
  save({ shopId: clean.length ? shopId : null, items: clean });
  return clean.length;
}
