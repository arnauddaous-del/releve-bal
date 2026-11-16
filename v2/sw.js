/* Imprim Bal 2 — service worker. Portée : ce dossier (v2/) uniquement.
   Ses caches commencent par « imprimbal2- » : la V1 (caches « releve-bal- ») ne les efface pas,
   et celui-ci n'efface jamais ceux de la V1.
   APP et COQUILLE sont réécrits par outils/maj_sw.py : ne pas les modifier à la main. */
var APP = 'imprimbal2-app-972aa85ac1';
var COQUILLE = ["css/app.css", "icons/apple-touch-icon.png", "icons/favicon-48.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "index.html", "js/app.js", "js/import-v1.js", "js/stockage.js", "manifest.webmanifest"];
var PREFIXE_APP = 'imprimbal2-app-';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(APP).then(function (c) {
    // « reload » : toujours la copie du serveur, jamais celle du cache HTTP du navigateur
    return c.addAll(COQUILLE.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf(PREFIXE_APP) === 0 && k !== APP; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
  else if (e.data && e.data.type === 'version' && e.ports && e.ports[0]) e.ports[0].postMessage(APP);
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url), portee = new URL(self.registration.scope);
  // tout ce qui n'est pas dans v2/ (la V1, les autres sites) passe sans être touché
  if (url.origin !== portee.origin || url.pathname.indexOf(portee.pathname) !== 0) return;
  e.respondWith(caches.open(APP).then(function (c) {
    return req.mode === 'navigate' ? c.match('index.html') : c.match(req, { ignoreSearch: true });
  }).then(function (hit) { return hit || fetch(req); }));
});
