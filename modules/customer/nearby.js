// Phase 3B: wires the Nearby dashboard (nearby-ui.js) to GPS (location.js) and Firestore (nearby.js).
// Nothing is requested until the customer opens the Nearby tab (activate), and the browser only asks for
// GPS when the customer presses "Use my location". Map is not built yet, so the UI runs list-only (mapStatus "off").
import { createNearbyDashboard } from "./nearby-ui.js";
import { createLocationController } from "../../shared/services/location.js";
import { discoverNearbyShops } from "../../shared/services/nearby.js";

const REFRESH_AFTER_MS = 60_000;   // coming back to the tab re-reads shops (open/closed changes) after this long

/** handlers: { root, onOpenShop(shop), onBrowseAll() } -> { activate(), destroy() } */
export function initNearby({ root, onOpenShop, onBrowseAll }) {
  const loc = createLocationController();
  let discovery = { status: "idle", entries: [], stats: null };
  let loadSeq = 0, loadedFor = null, loadedAt = 0, started = false;

  const ui = createNearbyDashboard(root, {
    onRequestLocation: () => loc.request(),
    onChangeLocation: () => loc.request(),
    onCancelLocation: () => loc.cancel(),
    onRetry: () => load(true),
    onBrowseAll: () => onBrowseAll && onBrowseAll(),
    onOpenShop: (id, entry) => onOpenShop && onOpenShop(entry.shop)
  });
  ui.setState({ mapStatus: "off", ...loc.getState() });

  async function load(force = false) {
    const { location } = loc.getState();
    if (!location) return;
    const key = location.latitude + "," + location.longitude;
    if (!force && key === loadedFor && discovery.status !== "error") return;   // same place, already loading/loaded
    const id = ++loadSeq;
    loadedFor = key;
    discovery = { status: "loading", entries: [], stats: null };
    ui.setState({ discovery });
    try {
      const r = await discoverNearbyShops(location);
      if (id !== loadSeq) return;                       // a newer load replaced this one
      discovery = { status: "ready", entries: r.entries, stats: r.stats };
      loadedAt = Date.now();
    } catch (e) {
      if (id !== loadSeq) return;
      console.error("Nearby: could not load shops", e);
      loadedFor = null;                                 // allow a retry for the same place
      discovery = { status: "error", entries: [], stats: null };
    }
    ui.setState({ discovery });
  }

  const unsubscribe = loc.subscribe((s) => { ui.setState(s); load(); });

  return {
    activate() {
      if (!started) { started = true; loc.loadSaved(); return; }
      if (discovery.status === "ready" && Date.now() - loadedAt > REFRESH_AFTER_MS) load(true);
    },
    destroy() { unsubscribe(); ui.destroy(); }
  };
}
