/* Mandawar Mart splash screen. Classic (non-module) script, placed right after <body> so it paints first.
   Shown once per browser session; artwork: assets/brand/splash.jpg (styles: #splash in global.css). */
(function () {
  try { if (sessionStorage.getItem("mdw-splash")) return; sessionStorage.setItem("mdw-splash", "1"); } catch (e) {}
  var d = document.createElement("div");
  d.id = "splash";
  d.setAttribute("aria-hidden", "true");
  /* logo and tagline are part of the splash artwork; nothing else to draw */
  document.body.appendChild(d);
  var t0 = Date.now(), done = false;
  function hide() {
    if (done) return; done = true;
    d.classList.add("out");
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 500);
  }
  window.addEventListener("load", function () { setTimeout(hide, Math.max(0, 1500 - (Date.now() - t0))); });
  setTimeout(hide, 3500);
})();
