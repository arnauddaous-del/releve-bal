/* Imprim Bal 2 — stockage, séparé de celui de la V1.
   - Lieux, boîtes, mémoire de noms, réglages : localStorage, clés préfixées « imprimbal2: ».
   - Photos et miniatures : base IndexedDB « imprimbal2 ».
   Toute écriture passe par ecrire() / retirer(), qui refusent une clé sans le préfixe :
   la clé de la V1 (« releve-bal-v4 ») ne peut donc pas être écrite d'ici. */

export const PREFIXE = 'imprimbal2:';
const K_INDEX = PREFIXE + 'lieux';
const K_REGLAGES = PREFIXE + 'reglages';
const cleLieu = id => PREFIXE + 'lieu:' + id;

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function lire(cle, defaut) {
  try { const v = JSON.parse(localStorage.getItem(cle)); return v == null ? defaut : v; } catch (e) { return defaut; }
}
function ecrire(cle, valeur) {
  if (cle.indexOf(PREFIXE) !== 0) throw new Error('Écriture refusée hors du stockage de la V2 : ' + cle);
  localStorage.setItem(cle, JSON.stringify(valeur));
}
function retirer(cle) {
  if (cle.indexOf(PREFIXE) !== 0) throw new Error('Suppression refusée hors du stockage de la V2 : ' + cle);
  localStorage.removeItem(cle);
}

/* ---------- petits états nommés (ex. « import-v1 ») ---------- */
export function lireEtat(nom, defaut) { return lire(PREFIXE + nom, defaut); }
export function ecrireEtat(nom, valeur) { ecrire(PREFIXE + nom, valeur); }

/* ---------- réglages ---------- */
const REGLAGES_DEFAUT = { addrCol: false, sep: ';', lastTournee: '' };
export function reglagesExistent() { return localStorage.getItem(K_REGLAGES) != null; }
export function lireReglages() {
  const r = lire(K_REGLAGES, {}) || {};
  return {
    addrCol: r.addrCol === true,
    sep: r.sep === ',' ? ',' : ';',
    lastTournee: typeof r.lastTournee === 'string' ? r.lastTournee.slice(0, 20) : ''
  };
}
export function ecrireReglages(partiel) { ecrire(K_REGLAGES, Object.assign({}, REGLAGES_DEFAUT, lireReglages(), partiel)); }

/* ---------- lieux ----------
   Un lieu : { id, v1id?, tournee, address, created, updated, scan: 'h'|'v', photoCount, boxes: [...], lex: {...} }
   Une boîte garde la forme de la V1 (name avec un destinataire par ligne, apt, pub, check, ok…),
   sans sa miniature : celle-ci est dans IndexedDB sous « mini:<id de la boîte> » quand box.mini est vrai. */
export function nouveauLieu(champs) {
  const t = Date.now(), c = champs || {};
  return { id: uid(), tournee: String(c.tournee || '').slice(0, 20), address: String(c.address || '').slice(0, 160),
    created: t, updated: t, scan: 'h', photoCount: 0, boxes: [], lex: {} };
}
export function idsLieux() {
  const a = lire(K_INDEX, []);
  return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
}
export function lireLieu(id) {
  const l = lire(cleLieu(id), null);
  if (!l || typeof l !== 'object' || l.id !== id) return null;
  if (!Array.isArray(l.boxes)) l.boxes = [];
  if (!l.lex || typeof l.lex !== 'object') l.lex = {};
  l.tournee = String(l.tournee || ''); l.address = String(l.address || '');
  return l;
}
/* Les lieux, le plus récemment modifié en premier. */
export function listerLieux() {
  return idsLieux().map(lireLieu).filter(Boolean).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export function enregistrerLieu(lieu) {
  ecrire(cleLieu(lieu.id), lieu);
  const ids = idsLieux();
  if (ids.indexOf(lieu.id) < 0) { ids.push(lieu.id); ecrire(K_INDEX, ids); }
}
/* Retire le lieu et le renvoie (pour « Annuler »). Ses images restent jusqu'à supprimerImagesDuLieu(). */
export function retirerLieu(id) {
  const lieu = lireLieu(id);
  ecrire(K_INDEX, idsLieux().filter(x => x !== id));
  retirer(cleLieu(id));
  return lieu;
}

/* ---------- images (IndexedDB) ----------
   Un enregistrement : { id, lieu, type: 'mini'|'photo', blob, date } */
const BASE = 'imprimbal2', MAGASIN = 'images';
let basePromise = null;
function base() {
  if (basePromise) return basePromise;
  basePromise = new Promise((ok, ko) => {
    if (!('indexedDB' in self)) { ko(new Error('IndexedDB indisponible')); return; }
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(MAGASIN, { keyPath: 'id' }).createIndex('lieu', 'lieu'); };
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); basePromise = null; }; ok(r.result); };
    r.onerror = () => ko(r.error || new Error('IndexedDB'));
  }).catch(e => { basePromise = null; throw e; });
  return basePromise;
}
function transaction(mode, travail) {
  return base().then(db => new Promise((ok, ko) => {
    const t = db.transaction(MAGASIN, mode);
    let resultat;
    t.oncomplete = () => ok(resultat);
    t.onerror = t.onabort = () => ko(t.error || new Error('IndexedDB'));
    travail(t.objectStore(MAGASIN), v => { resultat = v; });
  }));
}
export function mettreImages(images) {
  if (!images.length) return Promise.resolve();
  return transaction('readwrite', s => { images.forEach(i => s.put(i)); });
}
export function lireImage(id) {
  return transaction('readonly', (s, rendre) => { const r = s.get(id); r.onsuccess = () => rendre(r.result || null); });
}
export function compterImages() {
  return transaction('readonly', (s, rendre) => { const r = s.count(); r.onsuccess = () => rendre(r.result); });
}
function supprimerSi(garder) {
  return transaction('readwrite', s => {
    const r = s.index('lieu').openKeyCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return; if (!garder(c.key)) s.delete(c.primaryKey); c.continue(); };
  });
}
export function supprimerImagesDuLieu(idLieu) { return supprimerSi(lieu => lieu !== idLieu); }
/* Ménage au démarrage : images d'un lieu qui n'existe plus (suppression non annulée, app fermée entre-temps). */
export function purgerOrphelines() {
  const ids = idsLieux();
  return supprimerSi(lieu => ids.indexOf(lieu) >= 0);
}

/* Demande au navigateur de ne pas effacer ces données quand le téléphone manque de place. */
export function demanderPersistance() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
}
