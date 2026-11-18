/* Imprim Bal 2 — côté page : télécharge les modèles (une fois, avec la progression), pilote le Worker de lecture
   (js/lecteur.js), découpe les cases de la photo et assemble les boîtes. Tout reste sur le téléphone. */
import { BalCore as C } from './moteur/regles.mjs';
import { lireBloc } from './moteur/bloc.mjs';
import { appliquer, produit, deformer } from './moteur/redresser.mjs';

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
/* Photo d'une boîte en pleine définition, découpée dans la photo d'origine (pixels du capteur, sans réduction ;
   3000 px au plus de côté, au-delà rien ne se voit de plus à l'écran). */
const HD_MAX = 3000;
/* Photo redressée : la case (rectangle sur la photo redressée) est un quadrilatère sur la photo d'origine. On découpe
   ce quadrilatère en pleine définition et on le remet droit. vers : pixels de la photo redressée → pixels d'origine. */
function photoBoiteRedressee(origine, full, vers, c) {
  const FW = full.width, FH = full.height, x0 = c.x0 * FW, y0 = c.y0 * FH, w = (c.x1 - c.x0) * FW, h = (c.y1 - c.y0) * FH;
  const q = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(p => appliquer(vers, p[0], p[1]));
  const bx0 = Math.max(0, Math.floor(Math.min(...q.map(p => p[0])))), by0 = Math.max(0, Math.floor(Math.min(...q.map(p => p[1]))));
  const bx1 = Math.min(origine.naturalWidth, Math.ceil(Math.max(...q.map(p => p[0])))), by1 = Math.min(origine.naturalHeight, Math.ceil(Math.max(...q.map(p => p[1]))));
  // définition native : longueur des côtés du quadrilatère sur la photo d'origine
  const lw = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
  const lh = (Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) + Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])) / 2;
  const k = Math.min(1, HD_MAX / Math.max(lw, lh)), OW = Math.max(1, Math.round(lw * k)), OH = Math.max(1, Math.round(lh * k));
  const kb = Math.min(1, HD_MAX * 1.5 / Math.max(bx1 - bx0, by1 - by0, 1));
  const src = document.createElement('canvas');
  src.width = Math.max(1, Math.round((bx1 - bx0) * kb)); src.height = Math.max(1, Math.round((by1 - by0) * kb));
  src.getContext('2d').drawImage(origine, bx0, by0, bx1 - bx0, by1 - by0, 0, 0, src.width, src.height);
  // pixel de sortie → pixel de la photo redressée → pixel d'origine → pixel du morceau découpé
  const Hs = produit([kb, 0, -bx0 * kb, 0, kb, -by0 * kb, 0, 0, 1], produit(vers, [w / OW, 0, x0, 0, h / OH, y0, 0, 0, 1]));
  const out = deformer(src.getContext('2d').getImageData(0, 0, src.width, src.height), Hs, OW, OH, 'bord');
  src.width = src.height = 0;
  const cv = document.createElement('canvas');
  cv.width = OW; cv.height = OH;
  cv.getContext('2d').putImageData(new ImageData(out.data, OW, OH), 0, 0);
  return cv;
}
function photoBoite(origine, W, H, c) {
  const cx = c.x0 * W, cy = c.y0 * H, cw = (c.x1 - c.x0) * W, ch = (c.y1 - c.y0) * H;
  const k = Math.min(1, HD_MAX / Math.max(cw, ch)), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(cw * k)); cv.height = Math.max(1, Math.round(ch * k));
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(origine, cx, cy, cw, ch, 0, 0, cv.width, cv.height);
  return cv;
}
const enJPEG = (cv, q) => new Promise(ok => cv.toBlob(b => ok(b), 'image/jpeg', q));
function miniature(cv) {
  const t = document.createElement('canvas'), k = 480 / cv.width;
  t.width = 480; t.height = Math.max(1, Math.round(cv.height * k));
  t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
  return new Promise(ok => t.toBlob(b => ok(b), 'image/jpeg', 0.72));
}

/* Lit les cases (dans l'ordre de flashage). opts : { fort, memoire, surProgres(i, n), arret: () => bool,
   origine: { image, largeur, hauteur, versOrigine, redressee } (photo d'origine, pour la photo de chaque boîte en
   pleine définition ; versOrigine si la photo a été redressée) }.
   Renvoie [{ c, lignes, mini, hd, hdTaille }] pour les cases lues (moins si la lecture a été arrêtée). */
export async function lireCases(full, cases, opts) {
  await regler(opts);
  const out = [];
  for (let i = 0; i < cases.length; i++) {
    if (opts.arret && opts.arret()) break;
    const cv = decouper(full, cases[i]), img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    const o = opts.origine;
    let hdCv = cv;
    if (o) { try { hdCv = o.redressee ? photoBoiteRedressee(o.image, full, o.versOrigine, cases[i]) : photoBoite(o.image, o.largeur, o.hauteur, cases[i]); } catch (e) { hdCv = cv; } }
    const [r, mini, hd] = await Promise.all([appel({ type: 'lire', buf: img.data.buffer, w: img.width, h: img.height }, [img.data.buffer]), miniature(hdCv), enJPEG(hdCv, 0.92)]);
    out.push({ c: cases[i], lignes: r.lignes, mini: mini, hd: hd, hdTaille: hdCv.width + ' × ' + hdCv.height });
    if (hdCv !== cv) hdCv.width = hdCv.height = 0;
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
      alt: alt, sug: [], orig: name, ok: false, mini: !!l.mini, hd: !!l.hd, hdTaille: l.hdTaille || ''
    };
  });
}
