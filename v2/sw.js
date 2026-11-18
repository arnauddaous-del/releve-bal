/* Imprim Bal 2 — service worker. Portée : ce dossier (v2/) uniquement.
   Ses caches commencent par « imprimbal2- » : la V1 (caches « releve-bal- ») ne les efface pas,
   et celui-ci n'efface jamais ceux de la V1.
   APP et COQUILLE sont réécrits par outils/maj_sw.py : ne pas les modifier à la main. */
var APP = 'imprimbal2-app-4126e5782d';
var COQUILLE = ["css/app.css", "icons/apple-touch-icon.png", "icons/favicon-48.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "index.html", "js/app.js", "js/camera.js", "js/export.js", "js/grille.js", "js/import-v1.js", "js/lecteur.js", "js/moteur-client.js", "js/moteur/bloc.mjs", "js/moteur/ctc.mjs", "js/moteur/lecture.mjs", "js/moteur/lexique.mjs", "js/moteur/lignes.mjs", "js/moteur/prenoms.mjs", "js/moteur/redresser.mjs", "js/moteur/regles.mjs", "js/stockage.js", "manifest.webmanifest"];
var PREFIXE_APP = 'imprimbal2-app-';
/* Les modèles de lecture (dossier modeles/, environ 26 Mo, 64 Mo avec la lecture renforcée) ont leur propre cache,
   rempli au premier usage et gardé d'une version de l'app à l'autre. Un modèle qui change doit changer de nom. */
var MODELES = 'imprimbal2-modeles-1';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(APP).then(function (c) {
    // « reload » : toujours la copie du serveur, jamais celle du cache HTTP du navigateur
    return c.addAll(COQUILLE.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return (k.indexOf(PREFIXE_APP) === 0 && k !== APP) || (k.indexOf('imprimbal2-modeles-') === 0 && k !== MODELES); })
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
  if (url.pathname.indexOf(portee.pathname + 'modeles/') === 0) {
    e.respondWith(caches.open(MODELES).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
  e.respondWith(caches.open(APP).then(function (c) {
    return req.mode === 'navigate' ? c.match('index.html') : c.match(req, { ignoreSearch: true });
  }).then(function (hit) { return hit || fetch(req); }));
});
