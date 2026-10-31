/* Keeps page content out from under the phone's status bar (time, network, battery).
   Classic script, loaded in <head> of every page so the value is set before first paint.
   --safe-top = the real notch/status-bar inset (env) when the browser reports one. Some Android installed apps / WebViews
   draw edge-to-edge but report 0, so on a phone-sized screen that looks like a full-screen app we use a 36px minimum.
   A normal browser tab (address bar visible) never gets the extra space. */
(function () {
  try {
    var root = document.documentElement;
    var probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)";
    root.appendChild(probe);
    var real = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    root.removeChild(probe);
    var mq = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
    var phone = mq("(max-width: 820px)") && mq("(pointer: coarse)");
    var appLike = mq("(display-mode: standalone)") || mq("(display-mode: fullscreen)") || mq("(display-mode: minimal-ui)") ||
      window.navigator.standalone === true || (window.screen && window.screen.height - window.innerHeight < 70);
    var top = real > 0 ? real : (phone && appLike ? 36 : 0);
    root.style.setProperty("--safe-top", top + "px");
  } catch (e) { /* CSS fallback below keeps env() */ }
})();
