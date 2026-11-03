/* Imprim Bal service worker. App shell cached per version; reading models cached once. */
var APP = 'releve-bal-app-610b62f146';
var MODELS = 'releve-bal-models-a92b252c7d';
var FONTS = 'releve-bal-fonts';
var SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-48.png", "ocr/ort.wasm.min.js", "ocr/bal-worker.js"];
var CORE_MODELS = ["ocr/ort-wasm-simd.wasm", "ocr/det.wasm", "ocr/rec6s.wasm", "ocr/dict6.txt"];

self.addEventListener('install', function (e) {
  e.waitUntil(Promise.all([
    caches.open(APP).then(function (c) { return c.addAll(SHELL); }),
    caches.open(MODELS).then(function (c) {
      return Promise.all(CORE_MODELS.map(function (u) {
        return c.match(u).then(function (hit) { return hit || c.add(u); });
      }));
    })
  ]));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('releve-bal-') === 0 && k !== APP && k !== MODELS && k !== FONTS; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then(function (hit) { return hit || fetch(req); }));
    return;
  }
  var isModel = url.pathname.indexOf('/ocr/') !== -1 && /\.(wasm|txt)$/.test(url.pathname);
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (r) {
      if (r && r.ok && isModel) { var copy = r.clone(); caches.open(MODELS).then(function (c) { c.put(req, copy); }); }
      return r;
    });
  }));
});
