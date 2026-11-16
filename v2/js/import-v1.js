/* Imprim Bal 2 — « Reprendre mes lieux de la V1 ».
   La clé de la V1 (« releve-bal-v4 ») est seulement LUE ici, par localStorage.getItem.
   Les lieux sont copiés dans le stockage de la V2 ; la V1 garde tout, inchangé. */
import * as S from './stockage.js';

const CLE_V1 = 'releve-bal-v4';
const ETAT = 'import-v1';

function texte(v, max) { return String(v == null ? '' : v).slice(0, max); }
function textes(a, n, max) {
  return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x).slice(0, n).map(x => x.slice(0, max)) : [];
}
function suggestions(a) {
  return Array.isArray(a) ? a.filter(x => x && typeof x.f === 'string' && typeof x.t === 'string' && x.f && x.t)
    .slice(0, 3).map(x => ({ f: x.f.slice(0, 60), t: x.t.slice(0, 60) })) : [];
}
function memoire(l) {
  const out = {};
  if (!l || typeof l !== 'object') return out;
  Object.keys(l).slice(0, 800).forEach(k => {
    const e = l[k];
    if (k.length <= 40 && e && typeof e.w === 'string' && e.w && e.w.length <= 40) out[k] = { w: e.w, n: Math.max(1, Math.min(999, +e.n || 1)) };
  });
  return out;
}
/* Une boîte de la V1 -> { box: boîte V2 sans image, thumb: miniature (data URL) ou '' } */
function boite(b) {
  const box = {
    id: S.uid(), photo: +b.photo || 0, row: +b.row || 0, col: +b.col || 0,
    name: texte(b.name, 600).replace(/\s*\/\s*/g, '\n'), apt: texte(b.apt, 40),
    pub: b.pub === 'STOP PUB' ? 'STOP PUB' : 'OK PUB',
    check: !!b.check, empty: !!b.empty, raw: texte(b.raw, 1000),
    alt: textes(b.alt, 2, 200), sug: suggestions(b.sug), ok: b.ok === true
  };
  if (typeof b.orig === 'string') box.orig = b.orig.slice(0, 600);
  return { box: box, thumb: typeof b.thumb === 'string' ? b.thumb : '' };
}
function projet(p) {
  const st = p.state && typeof p.state === 'object' ? p.state : {};
  const boites = (Array.isArray(st.boxes) ? st.boxes : []).filter(b => b && typeof b === 'object').map(boite);
  return {
    v1id: texte(p.id, 60), tournee: texte(p.tournee, 20), address: texte(p.address, 160),
    created: +p.created || Date.now(), scan: st.scan === 'v' ? 'v' : 'h', photoCount: +st.photoCount || 0,
    addrCol: st.addrCol === true, sep: st.sep === ',' ? ',' : ';',
    boites: boites, lex: memoire(p.lex)
  };
}
/* Les lieux de la V1 présents dans ce navigateur (les lieux vides et sans nom sont ignorés). */
function lireV1() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(CLE_V1) || 'null'); } catch (e) { s = null; }
  if (!s || !Array.isArray(s.projects)) return { projets: [], courant: '' };
  const projets = s.projects.filter(p => p && typeof p === 'object' && p.id).map(projet)
    .filter(p => p.address.trim() || p.boites.length);
  return { projets: projets, courant: texte(s.cur, 60) };
}

export function etat() {
  const e = S.lireEtat(ETAT, null) || {};
  return { vu: e.vu === true, v1ids: Array.isArray(e.v1ids) ? e.v1ids.filter(x => typeof x === 'string') : [] };
}
/* Ce qui reste à reprendre : { lieux, boites, total } (total = lieux présents dans la V1). */
export function aReprendre() {
  const deja = etat().v1ids, v1 = lireV1();
  const nouveaux = v1.projets.filter(p => deja.indexOf(p.v1id) < 0);
  return { lieux: nouveaux.length, boites: nouveaux.reduce((n, p) => n + p.boites.length, 0), total: v1.projets.length };
}
/* L'utilisateur a répondu « Plus tard » : on ne repose plus la question à l'accueil (elle reste dans Réglages). */
export function plusTard() { const e = etat(); e.vu = true; S.ecrireEtat(ETAT, e); }

function blobDepuisDataURL(u) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(u);
  if (!m) return null;
  try {
    const bin = atob(m[2]), n = bin.length, a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  } catch (e) { return null; }
}

/* Copie dans la V2 les lieux de la V1 pas encore repris. Renvoie { lieux, boites }.
   Un lieu déjà repris n'est ni recopié ni modifié. */
export async function reprendre() {
  const e = etat(), v1 = lireV1(), premiereFois = !S.reglagesExistent();
  let lieux = 0, boites = 0;
  for (const p of v1.projets) {
    if (e.v1ids.indexOf(p.v1id) >= 0) continue;
    const lieu = S.nouveauLieu({ tournee: p.tournee, address: p.address });
    lieu.v1id = p.v1id; lieu.created = p.created; lieu.updated = p.created;
    lieu.scan = p.scan; lieu.photoCount = p.photoCount; lieu.lex = p.lex;
    const images = [];
    lieu.boxes = p.boites.map(x => {
      const blob = x.thumb ? blobDepuisDataURL(x.thumb) : null;
      if (blob) { x.box.mini = true; images.push({ id: 'mini:' + x.box.id, lieu: lieu.id, type: 'mini', blob: blob, date: Date.now() }); }
      return x.box;
    });
    // les images d'abord : si elles ne peuvent pas être écrites, le lieu est repris sans miniatures
    try { await S.mettreImages(images); } catch (err) { lieu.boxes.forEach(b => { delete b.mini; }); }
    S.enregistrerLieu(lieu);
    e.v1ids.push(p.v1id);
    S.ecrireEtat(ETAT, { vu: true, v1ids: e.v1ids, date: Date.now() });
    lieux++; boites += lieu.boxes.length;
  }
  if (lieux && premiereFois) {
    // premiers réglages de la V2 : ceux du lieu ouvert dans la V1
    const cur = v1.projets.find(p => p.v1id === v1.courant) || v1.projets[0];
    if (cur) S.ecrireReglages({ addrCol: cur.addrCol, sep: cur.sep, lastTournee: cur.tournee });
  }
  if (!lieux) S.ecrireEtat(ETAT, { vu: true, v1ids: e.v1ids, date: Date.now() });
  if (lieux) S.demanderPersistance();
  return { lieux: lieux, boites: boites };
}
