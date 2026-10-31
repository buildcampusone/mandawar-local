// Which caching strategy the service worker uses for a request. Plain script (no import/export) so it
// loads with importScripts() inside the service worker AND with require() in node tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SWRoutes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var CODE_EXT = /\.(?:js|css|html|json|webmanifest)$/i;
  var MEDIA_EXT = /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?)$/i;

  // returns "network-first" | "cache-first" | "stale-while-revalidate" | null (null = do not touch, go straight to network)
  function strategyFor(req) {
    if (!req || req.method !== "GET") return null;
    var u;
    try { u = new URL(req.url); } catch (e) { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;

    if (u.origin === req.origin) {
      if (u.pathname.indexOf("/__/") === 0) return null;            // Firebase Hosting reserved URLs (auth helpers)
      if (/\/service-worker\.js$/.test(u.pathname)) return null;    // the browser updates this one itself
      if (req.mode === "navigate") return "network-first";
      if (MEDIA_EXT.test(u.pathname)) return "cache-first";
      // Code stays network-first: after a deploy a stale module next to fresh HTML could break the page.
      if (CODE_EXT.test(u.pathname)) return "network-first";
      return null;
    }
    // Cross-origin: only the Firebase SDK files (versioned URLs, never change) and the Google Fonts.
    // Firestore / Auth / Functions API calls are NOT listed, so they are never cached or intercepted.
    if (u.hostname === "www.gstatic.com" && u.pathname.indexOf("/firebasejs/") === 0) return "cache-first";
    if (u.hostname === "fonts.googleapis.com") return "stale-while-revalidate";
    if (u.hostname === "fonts.gstatic.com") return "cache-first";
    return null;
  }

  return { strategyFor: strategyFor };
});
