import { db, auth } from "../../shared/config/firebase.js";
import {
  doc, collection, getDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getCart, clearCart } from "./cart.js";
import { deliveryQuote } from "./cart-core.js";

let inFlight = false;            // a second tap while an order is being sent must never create a second order
const SLOW_MS = 30000;

export async function placeOrder(user, address, phoneRaw) {
  if (inFlight) return { error: "Order bheja ja raha hai, thoda ruko." };
  if (navigator.onLine === false) return { error: "Internet nahi hai. Internet chalu karke dobara try karein." };
  if (!auth.currentUser || !auth.currentUser.phoneNumber)
    return { error: "Order se pehle apna mobile number OTP se verify karein (upar ka banner)." };
  inFlight = true;
  try { return await send(user, address, phoneRaw); } finally { inFlight = false; }
}

async function send(user, address, phoneRaw) {
  const c = getCart();
  if (!c.items.length) return { error: "Cart khali hai." };
  address = address.trim();
  let phone = phoneRaw.replace(/\D/g, "");
  if (phone.length > 10) phone = phone.slice(-10);
  if (address.length < 5 || address.length > 200)
    return { error: "Pata 5 se 200 akshar ka ho." };
  if (!/^[6-9][0-9]{9}$/.test(phone))
    return { error: "10 digit ka sahi mobile number daalein." };

  try {
    const shopSnap = await getDoc(doc(db, "shops", c.shopId));
    if (!shopSnap.exists() || shopSnap.data().status !== "approved")
      return { error: "Ye dukaan abhi available nahi hai." };

    const refs = c.items.map((i) => doc(db, "shops", c.shopId, "products", i.productId));
    const snaps = await Promise.all(refs.map((r) => getDoc(r)));

    const items = [];
    for (let k = 0; k < c.items.length; k++) {
      const s = snaps[k];
      const qty = c.items[k].qty;
      if (!s.exists() || !s.data().active)
        return { error: "Cart ka ek product ab available nahi hai. Use hatayein." };
      const p = s.data();
      if (p.stock < qty)
        return { error: p.name + ": stock sirf " + p.stock + " bacha hai." };
      items.push({ productId: c.items[k].productId, name: p.name,
                   price: p.price, unit: p.unit, qty });
    }

    // Same left-to-right sums as firestore.rules, so the totals match exactly.
    let subtotal = 0;
    items.forEach((it) => { subtotal = subtotal + it.price * it.qty; });
    const q = deliveryQuote(shopSnap.data(), subtotal);
    if (q.belowMin)
      return { error: "Is dukaan ka minimum order ₹" + q.min + " hai. Abhi ₹" + q.shortBy + " ka aur saaman jodein." };
    const deliveryFee = q.fee;
    const total = subtotal + deliveryFee;

    const orderRef = doc(collection(db, "orders"));
    const batch = writeBatch(db);
    batch.set(orderRef, {
      customerUid: user.uid, shopId: c.shopId, shopName: shopSnap.data().name,
      items, subtotal, deliveryFee, total, address, phone,
      paymentMethod: "COD", status: "placed", createdAt: serverTimestamp()
    });
    items.forEach((it, k) => {
      batch.update(refs[k], {
        stock: snaps[k].data().stock - it.qty,
        lastOrderId: orderRef.id
      });
    });
    // On a very slow line commit() can take long. Wait a while, then tell the truth instead of hanging forever.
    const commit = batch.commit().then(() => { clearCart(); return "ok"; });
    const slow = new Promise((r) => setTimeout(() => r("slow"), SLOW_MS));
    if ((await Promise.race([commit, slow])) === "slow") {
      commit.catch(() => {});   // if it lands later the cart still gets cleared above
      return { error: "Network bahut slow hai. 'Mere orders' mein dekh lein ki order gaya ya nahi; pakka na ho to dobara order na karein." };
    }
    return { id: orderRef.id, total, deliveryFee };
  } catch (e) {
    if (e.code === "permission-denied")
      return { error: "Order reject hua (price ya stock badal gaya ho sakta hai). Cart dobara kholkar try karein." };
    if (e.code === "unavailable") return { error: "Server tak pahunch nahi paaye. Internet jaanchkar dobara try karein." };
    return { error: "Order nahi hua. Dobara try karein." };
  }
}
