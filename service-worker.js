// Mandawar service worker: installable app + works offline.
//  - App shell (pages, CSS, JS, icons) is pre-cached; HTML/JS/CSS are network-first (fresh after a deploy,
//    cached copy when the network is down or slow); images/icons/SDK files are cache-first.
//  - Firestore / Auth / Functions traffic is never touched (see shared/services/sw-routes.js).
//  - A new version waits until the user taps "Update" (the page sends SKIP_WAITING).
//  - If you add a .js/.css file under shared/ or modules/, add it to PRECACHE too (tests/sw.test.mjs checks this),
//    and bump VERSION when you want everyone's cache rebuilt.
importScripts("./shared/services/sw-routes.js");

const VERSION = "mandawar-v4";
const NAV_TIMEOUT_MS = 5000;   // slow network + cached page -> show the cached page
const ASSET_TIMEOUT_MS = 8000;

/* PRECACHE:START */
const PRECACHE = [
  "./",
  "./index.html",
  "./login.html",
  "./customer.html",
  "./shopkeeper.html",
  "./delivery.html",
  "./admin.html",
  "./offline.html",
  "./manifest.json",
  "./modules/admin/delivery-partners-core.js",
  "./modules/admin/delivery-partners.js",
  "./modules/admin/shops.js",
  "./modules/auth/i18n.js",
  "./modules/auth/login-visual.js",
  "./modules/auth/login.js",
  "./modules/customer/address.js",
  "./modules/customer/browse.js",
  "./modules/customer/cart-core.js",
  "./modules/customer/cart-view.js",
  "./modules/customer/cart.js",
  "./modules/customer/checkout.js",
  "./modules/customer/home.js",
  "./modules/customer/my-orders.js",
  "./modules/customer/nearby-ui.js",
  "./modules/customer/nearby-view-model.js",
  "./modules/customer/nearby.js",
  "./modules/customer/order-alerts.js",
  "./modules/customer/rate-order.js",
  "./modules/delivery/jobs.js",
  "./modules/shopkeeper/orders.js",
  "./modules/shopkeeper/products.js",
  "./modules/shopkeeper/shop-register.js",
  "./modules/shopkeeper/shop-settings.js",
  "./shared/components/shell.js",
  "./shared/components/splash.js",
  "./shared/components/thumb.js",
  "./shared/components/toast.js",
  "./shared/components/verify-phone.js",
  "./shared/config/brand.js",
  "./shared/config/categories.js",
  "./shared/config/firebase.js",
  "./shared/i18n/i18n.js",
  "./shared/services/auth.js",
  "./shared/services/geo.js",
  "./shared/services/image.js",
  "./shared/services/location.js",
  "./shared/services/nearby-core.js",
  "./shared/services/nearby.js",
  "./shared/services/notify.js",
  "./shared/services/order-events.js",
  "./shared/services/otp-guard.js",
  "./shared/services/phone-core.js",
  "./shared/services/pwa.js",
  "./shared/services/sw-routes.js",
  "./shared/styles/category-showcase.css",
  "./shared/styles/global.css",
  "./shared/styles/login.css",
  "./shared/styles/nearby.css",
  "./shared/styles/orders.css",
  "./shared/styles/pwa.css",
  "./shared/styles/shell.css",
  "./shared/styles/tokens.css",
  "./favicon.ico",
  "./assets/icons/icon-192.png",
  "./assets/icons/favicon-32.png",
  "./assets/brand/mark.png",
  "./assets/brand/logo.png"
];
/* PRECACHE:END */

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // one missing file must not block the whole install; offline.html is the only hard requirement
    await Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" }))));
    if (!(await cache.match("./offline.html"))) throw new Error("offline.html not cached");
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

const storable = (res) => res && (res.ok || res.type === "opaque");

async function networkFirst(req, isNav) {
  const cache = await caches.open(VERSION);
  const net = fetch(req).then((res) => { if (storable(res)) cache.put(req, res.clone()); return res; });
  net.catch(() => {});   // never an unhandled rejection if the timeout wins
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), isNav ? NAV_TIMEOUT_MS : ASSET_TIMEOUT_MS));
  try {
    return await Promise.race([net, timeout]);
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: isNav });
    if (hit) return hit;
    try { return await net; } catch (err) {
      if (isNav) return (await cache.match("./offline.html")) || Response.error();
      throw err;
    }
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (storable(res)) cache.put(req, res.clone()); return res; });
  net.catch(() => {});
  return hit || net;
}

self.addEventListener("fetch", (event) => {
  const r = event.request;
  const strategy = self.SWRoutes.strategyFor({ url: r.url, method: r.method, mode: r.mode, origin: self.location.origin });
  if (!strategy) return;
  const isNav = r.mode === "navigate";
  event.respondWith(
    strategy === "network-first" ? networkFirst(r, isNav)
      : strategy === "cache-first" ? cacheFirst(r)
      : staleWhileRevalidate(r)
  );
});

// Tapping a system notification brings the app to the front (or opens it).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
