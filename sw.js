/* Offline cache: after the first load the game keeps working even if the
   bazaar Wi-Fi drops. Bump VERSION whenever you deploy changes. */
var VERSION = "mcc-v1";
var CORE = [
  "./", "index.html", "css/style.css", "manifest.webmanifest",
  "js/config.js", "js/progression.js", "js/game.js", "js/input.js", "js/audio.js",
  "js/leaderboard.js", "js/cup-renderer.js", "js/fx.js", "js/admin.js", "js/main.js",
  "assets/cup.webp", "assets/lime.webp", "assets/monty.webp", "assets/pile.webp",
  "assets/ice_tex.webp", "assets/ice_atlas.webp", "assets/lemoncrush.webp", "assets/logo.webp",
  "fonts/fredoka-500.woff2", "fonts/fredoka-600.woff2", "fonts/fredoka-700.woff2",
  "icons/icon-192.png", "icons/icon-512.png"
];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // never touch Google Sheets calls
  // network first (fresh deploys), cache fallback (offline)
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone();
    caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () {
    return caches.match(e.request).then(function (m) { return m || caches.match("index.html"); });
  }));
});
