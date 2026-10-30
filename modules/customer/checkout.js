import { db } from "../../shared/config/firebase.js";
import {
  doc, collection, getDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getCart, clearCart } from "./cart.js";

export async function placeOrder(user, address, phoneRaw) {
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

    let total = 0;
    items.forEach((it) => { total = total + it.price * it.qty; });

    const orderRef = doc(collection(db, "orders"));
    const batch = writeBatch(db);
    batch.set(orderRef, {
      customerUid: user.uid, shopId: c.shopId, shopName: shopSnap.data().name,
      items, total, address, phone,
      paymentMethod: "COD", status: "placed", createdAt: serverTimestamp()
    });
    items.forEach((it, k) => {
      batch.update(refs[k], {
        stock: snaps[k].data().stock - it.qty,
        lastOrderId: orderRef.id
      });
    });
    await batch.commit();
    clearCart();
    return { id: orderRef.id, total };
  } catch (e) {
    if (e.code === "permission-denied")
      return { error: "Order reject hua (price ya stock badal gaya ho sakta hai). Cart dobara kholkar try karein. " + e.message };
    return { error: "Order nahi hua: " + e.message };
  }
}
