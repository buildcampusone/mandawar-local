// In-app alerts: toast + short beep + vibration + (if allowed and the tab is hidden) a system notification.
// This works while the app is open or in the background. Real push to a CLOSED app needs Firebase Cloud
// Messaging (VAPID key + a sender function) and is not part of this module.
import { toast } from "../components/toast.js";

const supported = () => typeof Notification !== "undefined";
export const permission = () => (supported() ? Notification.permission : "unsupported");

export async function requestPermission() {
  if (!supported() || Notification.permission !== "default") return permission();
  try { return await Notification.requestPermission(); } catch (e) { return permission(); }
}

// Browsers only allow sound after a tap, so the audio context is created on the first touch/click.
let ctx = null;
function unlock() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !ctx) ctx = new AC();
    if (ctx && ctx.state === "suspended") ctx.resume();
  } catch (e) { /* no sound is fine */ }
}
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });

function beep() {
  try {
    if (!ctx || ctx.state !== "running") return;
    [0, 0.2].forEach((at, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = i ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.16);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.18);
    });
  } catch (e) { /* ignore */ }
}

export async function alertUser({ title, body = "", tag = "", tone = "" }) {
  toast(body ? title + " — " + body : title, { tone, ms: 8000 });
  beep();
  try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) { /* ignore */ }
  if (document.hidden && permission() === "granted") {
    try {
      const opts = { body, tag, icon: "./assets/icons/icon-192.png", badge: "./assets/icons/favicon-32.png", data: { url: location.href } };
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    } catch (e) { /* ignore */ }
  }
}

// "(3) Orders" in the browser tab / app title while orders are waiting.
const baseTitle = document.title;
export function setPendingBadge(n) { document.title = (n > 0 ? "(" + n + ") " : "") + baseTitle; }

// A small "turn on alerts" strip. Hidden when notifications are unsupported, already allowed or blocked.
export function notifyPrompt() {
  const box = document.createElement("div");
  box.className = "np";
  const txt = document.createElement("span");
  txt.textContent = "Order alerts chahiye? App khula ho tab phone par notification aayega.";
  const b = document.createElement("button");
  b.type = "button"; b.className = "category"; b.textContent = "Alerts chalu karein";
  b.onclick = async () => { b.disabled = true; await requestPermission(); box.hidden = permission() !== "default"; b.disabled = false; };
  box.append(txt, b);
  box.hidden = permission() !== "default";
  return box;
}
