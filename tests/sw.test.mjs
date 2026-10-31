import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { strategyFor } = require("../shared/services/sw-routes.js");
const ROOT = new URL("..", import.meta.url).pathname;
const O = "https://mandawar-local.web.app";
const req = (url, o = {}) => ({ url, method: "GET", mode: "cors", origin: O, ...o });

test("pages are network-first, images cache-first, code network-first", () => {
  assert.equal(strategyFor(req(O + "/customer.html", { mode: "navigate" })), "network-first");
  assert.equal(strategyFor(req(O + "/", { mode: "navigate" })), "network-first");
  assert.equal(strategyFor(req(O + "/modules/customer/cart.js")), "network-first");
  assert.equal(strategyFor(req(O + "/shared/styles/global.css")), "network-first");
  assert.equal(strategyFor(req(O + "/assets/images/categories/dairy.webp")), "cache-first");
  assert.equal(strategyFor(req(O + "/assets/icons/icon-192.png")), "cache-first");
});

test("Firebase SDK + fonts are cached, Firestore/Auth/Functions traffic never is", () => {
  assert.equal(strategyFor(req("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js")), "cache-first");
  assert.equal(strategyFor(req("https://fonts.googleapis.com/css2?family=Poppins")), "stale-while-revalidate");
  assert.equal(strategyFor(req("https://fonts.gstatic.com/s/poppins/x.woff2")), "cache-first");
  for (const u of [
    "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel",
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
    "https://asia-south1-mandawar-local.cloudfunctions.net/setDeliveryRole",
    "https://www.gstatic.com/other/thing.js",
    "https://evil.example/x.js"
  ]) assert.equal(strategyFor(req(u)), null, u);
});

test("POST, the service worker itself, /__/ and odd schemes are left alone", () => {
  assert.equal(strategyFor(req(O + "/customer.html", { method: "POST" })), null);
  assert.equal(strategyFor(req(O + "/service-worker.js")), null);
  assert.equal(strategyFor(req(O + "/__/auth/handler")), null);
  assert.equal(strategyFor(req("chrome-extension://abc/x.js")), null);
  assert.equal(strategyFor(req("not a url")), null);
  assert.equal(strategyFor(null), null);
});

test("PRECACHE lists real files and covers every js/css under shared/ and modules/", () => {
  const src = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const block = src.match(/PRECACHE:START \*\/\s*const PRECACHE = (\[[\s\S]*?\]);\s*\/\* PRECACHE:END/)[1];
  const list = JSON.parse(block);
  for (const u of list) if (u !== "./") assert.ok(fs.existsSync(path.join(ROOT, u)), "missing file in PRECACHE: " + u);
  assert.ok(list.includes("./offline.html"));
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(d + "/" + e.name) : /\.(js|css)$/.test(e.name) ? ["./" + d + "/" + e.name] : []);
  const missing = [...walk("shared"), ...walk("modules")].filter((f) => !list.includes(f));
  assert.deepEqual(missing, [], "add these to PRECACHE in service-worker.js: " + missing.join(", "));
});
