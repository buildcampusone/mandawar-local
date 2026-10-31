// Loaded on every page: registers the service worker, shows the offline banner and the "new version" prompt.
import { toast } from "../components/toast.js";

const css = document.createElement("link");
css.rel = "stylesheet";
css.href = new URL("../styles/pwa.css", import.meta.url).href;
document.head.appendChild(css);

// ---- offline banner
const banner = document.createElement("div");
banner.className = "net-banner";
banner.setAttribute("role", "status");
banner.hidden = navigator.onLine !== false;
banner.textContent = "Internet nahi hai. Dikhaya gaya data purana ho sakta hai.";
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(banner));
if (document.body) document.body.appendChild(banner);
const sync = () => { banner.hidden = navigator.onLine !== false; };
window.addEventListener("online", () => { sync(); toast("Internet wapas aa gaya.", { tone: "good", ms: 3000 }); });
window.addEventListener("offline", sync);

// ---- install prompt (kept for a future "Install app" button; never nags)
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; });
export const canInstall = () => !!deferredInstall;
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const r = await deferredInstall.userChoice.catch(() => null);
  deferredInstall = null;
  return !!r && r.outcome === "accepted";
}

// ---- service worker
const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
if ("serviceWorker" in navigator && secure) {
  const hadController = !!navigator.serviceWorker.controller;   // first-ever install must not trigger a reload
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  const askUpdate = (worker) => toast("Mandawar Mart ka naya version aaya hai.", {
    ms: 0, actionLabel: "Update", onAction: () => worker.postMessage({ type: "SKIP_WAITING" })
  });

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(new URL("../../service-worker.js", import.meta.url).href);
      if (reg.waiting && navigator.serviceWorker.controller) askUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) askUpdate(w);
        });
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch (e) {
      console.warn("service worker not registered:", e);
    }
  });
}
