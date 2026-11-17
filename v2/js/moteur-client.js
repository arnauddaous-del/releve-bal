/* Imprim Bal 2 — côté page : télécharge les modèles (une fois, avec la progression), pilote le Worker de lecture
   (js/lecteur.js), découpe les cases de la photo et assemble les boîtes. Tout reste sur le téléphone. */
import { BalCore as C } from './moteur/regles.mjs';
import { lireBloc } from './moteur/bloc.mjs';

const BASE = new URL('../modeles/', import.meta.url).href;
const CACHE = 'imprimbal2-modeles-1';
const BASE_FICHIERS = ['ort.wasm.min.js', 'ort-wasm-simd.wasm', 'det.wasm', 'rec6s.wasm', 'dict6.txt'];
const FORT_FICHIERS = ['rec6m-1.wasm', 'rec6m-2.wasm', 'rec6m-3.wasm'];
// tailles en octets, pour afficher la progression même sans en-tête Content-Length
const TAILLES = { 'ort.wasm.min.js': 145070, 'ort-wasm-simd.wasm': 10551547, 'det.wasm': 4745517, 'rec6s.wasm': 10670034, 'dict6.txt': 74948,
  'rec6m-1.wasm': 12794703, 'rec6m-2.wasm': 12794703, 'rec6m-3.wasm': 12794702 };
export const MO_BASE = Math.round(BASE_FICHIERS.reduce((n, f) => n + TAILLES[f], 0) / 1e6);
export const MO_FORT = Math.round(FORT_FICHIERS.reduce((n, f) => n + TAILLES[f], 0) / 1e6);

async function dejaLa(f) {
  try { if (!(await caches.has(CACHE))) return false; const c = await caches.open(CACHE); return !!(await c.match(BASE + f)); } catch (e) { return false; }
}
export async function modelesPresents(fort) {
  for (const f of BASE_FICHIERS.concat(fort ? FORT_FICHIERS : [])) if (!(await dejaLa(f))) return false;
  return true;
}
/* Télécharge ce qui manque. Le service worker range chaque fichier dans son cache des modèles.
   surProgres(octetsRecus, octetsTotal) ; renvoie true s'il a fallu télécharger. */
export async function telechargerModeles(fort, surProgres) {
  const fichiers = BASE_FICHIERS.concat(fort ? FORT_FICHIERS : []), manque = [];
  for (const f of fichiers) if (!(await dejaLa(f))) manque.push(f);
  if (!manque.length) return false;
  const total = manque.reduce((n, f) => n + TAILLES[f], 0);
  let recu = 0;
  for (const f of manque) {
    const r = await fetch(BASE + f, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + f);
    const morceaux = [];
    if (r.body && r.body.getReader) {
      const lecteur = r.body.getReader();
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        morceaux.push(value); recu += value.length;
        if (surProgres) surProgres(Math.min(recu, total), total);
      }
    } else { morceaux.push(new Uint8Array(await r.arrayBuffer())); recu += TAILLES[f]; if (surProgres) surProgres(recu, total); }
    // sans service worker actif (toute première visite), on range le fichier soi-même
    if (!(navigator.serviceWorker && navigator.serviceWorker.controller)) {
      try { const c = await caches.open(CACHE); await c.put(BASE + f, new Response(new Blob(morceaux))); } catch (e) {}
    }
  }
  return true;
}

/* ---------- Worker ---------- */
let worker = null, demarrage = null, seq = 0, avecFort = false;
const attente = {};
function appel(msg, transfert) {
  return new Promise((ok, ko) => { msg.id = ++seq; attente[msg.id] = { ok: ok, ko: ko }; worker.postMessage(msg, transfert || []); });
}
function nouveauWorker() {
  worker = new Worker(new URL('./lecteur.js', import.meta.url));
  worker.onmessage = e => {
    const m = e.data, cb = attente[m.id]; if (!cb) return;
    delete attente[m.id];
    if (m.ok) cb.ok(m); else cb.ko(new Error(m.error));
  };
  worker.onerror = e => {
    Object.keys(attente).forEach(k => { attente[k].ko(new Error(e.message || 'erreur du moteur de lecture')); delete attente[k]; });
    worker = null; demarrage = null;
  };
}
/* Démarre le moteur (sans attendre : peut être appelé dès l'ouverture de l'écran Photo). */
export function demarrer(opts) {
  opts = opts || {};
  if (!demarrage) {
    nouveauWorker();
    demarrage = appel({ type: 'init', fort: !!opts.fort, memoire: opts.memoire || [] })
      .then(r => { avecFort = !!r.fort; return r; })
      .catch(e => { try { worker.terminate(); } catch (x) {} worker = null; demarrage = null; throw e; });
  }
  return demarrage;
}
async function regler(opts) {
  await demarrer(opts);
  if (opts.fort && !avecFort) { await appel({ type: 'fort' }); avecFort = true; }
  else if (!opts.fort && avecFort) { await appel({ type: 'sansFort' }); avecFort = false; }
  await appel({ type: 'lexique', memoire: opts.memoire || [] });
}

/* ---------- lecture d'une photo ---------- */
function decouper(full, c) {
  const FW = full.width, FH = full.height;
  const cx = c.x0 * FW, cy = c.y0 * FH, cw = (c.x1 - c.x0) * FW, ch = (c.y1 - c.y0) * FH;
  // même découpe que la V1 : pleine définition jusqu'à 1400 px, les petites cases agrandies à 700 px
  const k = Math.min(1400 / Math.max(cw, ch), Math.max(1, 700 / Math.max(cw, ch)));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(cw * k)); cv.height = Math.max(1, Math.round(ch * k));
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(full, cx, cy, cw, ch, 0, 0, cv.width, cv.height);
  return cv;
}
function miniature(cv) {
  const t = document.createElement('canvas'), k = 480 / cv.width;
  t.width = 480; t.height = Math.max(1, Math.round(cv.height * k));
  t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
  return new Promise(ok => t.toBlob(b => ok(b), 'image/jpeg', 0.72));
}

/* Lit les cases (dans l'ordre de flashage). opts : { fort, memoire, surProgres(i, n), arret: () => bool }.
   Renvoie [{ c, lignes, mini }] pour les cases lues (moins si la lecture a été arrêtée). */
export async function lireCases(full, cases, opts) {
  await regler(opts);
  const out = [];
  for (let i = 0; i < cases.length; i++) {
    if (opts.arret && opts.arret()) break;
    const cv = decouper(full, cases[i]), img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    const [r, mini] = await Promise.all([appel({ type: 'lire', buf: img.data.buffer, w: img.width, h: img.height }, [img.data.buffer]), miniature(cv)]);
    out.push({ c: cases[i], lignes: r.lignes, mini: mini });
    if (opts.surProgres) opts.surProgres(i + 1, cases.length);
  }
  return out;
}

/* Assemble les boîtes : règles V2, recoupements du bloc, « à vérifier », autres lectures. */
export function boites(lus, uid, numeroPhoto) {
  const accord = lireBloc(lus.map(l => ({ lines: l.lignes })), C.parseLabel);
  return lus.map((l, i) => {
    const lines = l.lignes, p = accord[i].p, name = p.names.join('\n'), rien = !name && !p.apt;
    const doute = lines.some(x => x.alts && x.alts.length && x.conf < 80);
    // une autre lecture d'une ligne hésitante à la fois, proposée d'un geste (comme la V1)
    const alt = [];
    if (!p.panel && !rien) lines.forEach((ln, k) => (ln.alts || []).forEach(a => {
      if (alt.length >= 2) return;
      const copie = lines.map((x, q) => (q === k ? Object.assign({}, x, { text: a, conf: 60, p: 0.3 }) : x));
      const n2 = C.parseLabel(copie, { v2: true }).names.join('\n');
      if (n2 && n2 !== name && alt.indexOf(n2) < 0) alt.push(n2);
    }));
    return {
      id: uid(), photo: numeroPhoto, row: l.c.r + 1, col: l.c.c + 1, name: name, apt: p.apt, pub: p.pub, raw: p.raw || '',
      empty: rien && !p.raw, check: (rien && !!lines.length) || (!rien && (p.conf < 75 || doute)) || !!accord[i].verifier || !!p.hors,
      alt: alt, sug: [], orig: name, ok: false, mini: !!l.mini
    };
  });
}
