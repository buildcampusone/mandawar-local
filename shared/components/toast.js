// Small non-blocking message at the bottom of the screen. DOM-safe: text goes in with textContent.
let host = null;
function ensureHost() {
  if (host && host.isConnected) return host;
  host = document.createElement("div");
  host.className = "mt-host";
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

// toast("Naya order aaya", { tone: "good"|"bad"|"", ms: 6000, actionLabel, onAction })
export function toast(text, { tone = "", ms = 6000, actionLabel = "", onAction = null } = {}) {
  const el = document.createElement("div");
  el.className = "mt" + (tone ? " " + tone : "");
  const msg = document.createElement("span");
  msg.textContent = text;
  el.appendChild(msg);
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); };
  if (actionLabel && onAction) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = actionLabel;
    b.onclick = () => { onAction(); close(); };
    el.appendChild(b);
  }
  const host = ensureHost();
  while (host.children.length >= 3) host.firstChild.remove();   // never pile up
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  if (ms > 0) setTimeout(close, ms);
  return close;
}
