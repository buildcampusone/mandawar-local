// Pure geo helpers (no DOM, no Firebase). Distances are straight-line (great-circle), never road distance.
const EARTH_RADIUS_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

/** True for { latitude, longitude } with finite numbers inside the valid ranges. */
export function isValidCoord(c) {
  return !!c
    && typeof c.latitude === "number" && Number.isFinite(c.latitude) && Math.abs(c.latitude) <= 90
    && typeof c.longitude === "number" && Number.isFinite(c.longitude) && Math.abs(c.longitude) <= 180;
}

/** Great-circle distance in km between two valid coordinates; null if either one is invalid. */
export function haversineKm(a, b) {
  if (!isValidCoord(a) || !isValidCoord(b)) return null;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "<50 m" / "560 m" / "1.2 km" / "13 km". Returns "" when the distance is unknown (so the UI can omit it). */
export function formatDistance(km) {
  if (typeof km !== "number" || !Number.isFinite(km) || km < 0) return "";
  const meters = Math.round((km * 1000) / 10) * 10;
  if (meters < 50) return "<50 m";
  if (meters < 1000) return meters + " m";
  const r = Math.round(km * 10) / 10;
  return r < 10 ? r.toFixed(1) + " km" : Math.round(km) + " km";
}
