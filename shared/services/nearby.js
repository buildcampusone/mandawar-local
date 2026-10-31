// Firestore side of Nearby: read approved shops once, decide eligibility locally, sort.
// Rules already let anyone signed in read approved shops; shop coordinates/delivery settings are
// written only by the shop owner (see firestore.rules). No shop is ever created or changed from here.
import { db } from "../config/firebase.js";
import { collection, query, where, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { evaluateDeliveryEligibility, sortEntries } from "./nearby-core.js";

export const MAX_SHOPS = 200;   // one town; if this is ever hit the UI says some shops may be missing

/** -> { entries: [{ shop, eligibility }], stats: { total, truncated } }. Throws on a failed read (never returns "empty" for an error). */
export async function discoverNearbyShops(location) {
  const snap = await getDocs(query(collection(db, "shops"), where("status", "==", "approved"), limit(MAX_SHOPS + 1)));
  const docs = snap.docs.slice(0, MAX_SHOPS);
  const entries = docs.map((d) => {
    const shop = { id: d.id, ...d.data() };
    return { shop, eligibility: evaluateDeliveryEligibility(shop, location) };
  });
  return { entries: sortEntries(entries), stats: { total: docs.length, truncated: snap.size > MAX_SHOPS } };
}
