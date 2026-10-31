// Customer: live listener on my orders. When the shop accepts / rejects / sends / delivers an order,
// show an alert (toast, beep, system notification if allowed) and tell the orders screen to refresh.
import { db } from "../../shared/config/firebase.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { createWatcher, messageFor } from "../../shared/services/order-events.js";
import { alertUser } from "../../shared/services/notify.js";

// returns the unsubscribe function
export function startOrderAlerts(user, { onChange } = {}) {
  const watcher = createWatcher("customer");
  return onSnapshot(
    query(collection(db, "orders"), where("customerUid", "==", user.uid)),
    (snap) => {
      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const events = watcher.feed(orders, { fromCache: snap.metadata.fromCache });
      events.forEach((ev) => alertUser(messageFor(ev)));
      if (events.length) onChange?.(orders);
    },
    (e) => console.warn("order alerts are off:", e.code || e.message)
  );
}
