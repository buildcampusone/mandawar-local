// Customer location (GPS / manual / saved). One tiny state machine, no map and no Firebase.
// States match what modules/customer/nearby-view-model.js expects. A failed retry keeps the last good location.
import { t } from "../i18n/i18n.js";
import { isValidCoord } from "./geo.js";

export const LocationState = Object.freeze({
  NOT_REQUESTED: "NOT_REQUESTED", REQUESTING: "REQUESTING", GRANTED: "GRANTED",
  DENIED: "DENIED", UNAVAILABLE: "UNAVAILABLE", ERROR: "ERROR"
});
const L = LocationState;
const SAVED_MAX_AGE_MS = 6 * 60 * 60 * 1000;   // a saved position older than this is dropped: people move
const round5 = (n) => Math.round(n * 1e5) / 1e5;   // ~1 m

function defaultStorage() { try { return globalThis.localStorage || null; } catch { return null; } }

/** Options are injectable for tests: { storageKey, geolocation, storage, now }. */
export function createLocationController({ storageKey = "ml-loc", geolocation, storage, now = () => Date.now() } = {}) {
  const geo = geolocation !== undefined ? geolocation : ((globalThis.navigator && globalThis.navigator.geolocation) || null);
  const store = storage !== undefined ? storage : defaultStorage();
  let state = { locationState: L.NOT_REQUESTED, location: null, locationError: null };
  let seq = 0;                       // invalidates a pending GPS read after cancel()
  const listeners = new Set();

  const getState = () => ({ ...state });
  const set = (patch) => { state = { ...state, ...patch }; const s = getState(); listeners.forEach((fn) => fn(s)); };
  const persist = (loc) => {
    try { store && store.setItem(storageKey, JSON.stringify({ latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, at: now() })); } catch {}
  };
  const fail = (locationState, key, code) => set({ locationState, locationError: { code, message: t(key) } });

  function request() {
    if (state.locationState === L.REQUESTING) return;
    if (!geo || typeof geo.getCurrentPosition !== "function") return fail(L.UNAVAILABLE, "nbLocUnavailable", "unsupported");
    const id = ++seq;
    set({ locationState: L.REQUESTING, locationError: null });
    geo.getCurrentPosition(
      (pos) => {
        if (id !== seq) return;
        const c = pos && pos.coords;
        if (!isValidCoord(c)) return fail(L.ERROR, "nbLocError", "bad-position");
        const loc = {
          latitude: round5(c.latitude), longitude: round5(c.longitude),
          accuracy: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null, source: "gps"
        };
        persist(loc);
        set({ locationState: L.GRANTED, location: loc, locationError: null });
      },
      (err) => {
        if (id !== seq) return;
        const code = err && err.code;
        if (code === 1) fail(L.DENIED, "nbLocDenied", code);
        else if (code === 2) fail(L.UNAVAILABLE, "nbLocUnavailable", code);
        else if (code === 3) fail(L.ERROR, "nbLocTimeout", code);
        else fail(L.ERROR, "nbLocError", code);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  }

  function cancel() {
    if (state.locationState !== L.REQUESTING) return;
    seq++;
    set({ locationState: state.location ? L.GRANTED : L.NOT_REQUESTED, locationError: null });
  }

  /** Manually chosen point (for a future map picker). Returns false if the coordinates are invalid. */
  function setManual(latitude, longitude, label = "") {
    const c = { latitude, longitude };
    if (!isValidCoord(c)) return false;
    seq++;
    const loc = { latitude: round5(latitude), longitude: round5(longitude), accuracy: null, source: "manual", label: String(label || "") };
    persist(loc);
    set({ locationState: L.GRANTED, location: loc, locationError: null });
    return true;
  }

  /** Reuse a recent position without asking again. Returns true if one was loaded. */
  function loadSaved() {
    if (state.location || state.locationState === L.REQUESTING) return false;
    try {
      const raw = store && store.getItem(storageKey);
      if (!raw) return false;
      const o = JSON.parse(raw);
      const age = now() - o.at;
      if (!isValidCoord(o) || typeof o.at !== "number" || age > SAVED_MAX_AGE_MS || age < -60000) {
        store.removeItem(storageKey);
        return false;
      }
      set({ locationState: L.GRANTED, location: { latitude: o.latitude, longitude: o.longitude, accuracy: Number.isFinite(o.accuracy) ? o.accuracy : null, source: "saved" }, locationError: null });
      return true;
    } catch { return false; }
  }

  function clear() {
    seq++;
    try { store && store.removeItem(storageKey); } catch {}
    set({ locationState: L.NOT_REQUESTED, location: null, locationError: null });
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  return { getState, subscribe, request, cancel, setManual, loadSaved, clear };
}
