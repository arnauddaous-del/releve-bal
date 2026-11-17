/* Imprim Bal 2 — interface : Accueil (lieux), Photo (caméra, grille, lecture), Résultat (boîtes, partage), Réglages.
   Toute la lecture se fait sur le téléphone (js/lecteur.js) ; aucune photo n'est envoyée. */
import * as S from './stockage.js';
import * as V1 from './import-v1.js';
import * as Moteur from './moteur-client.js';
import * as Export from './export.js';
import { cameraPossible, ouvrirCamera } from './camera.js';
import { chargerPhoto, creerEditeur } from './grille.js';
import { BalNames } from './moteur/prenoms.mjs';

const $ = (s, r) => (r || document).querySelector(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ESC[c]);
const pluriel = (n, un, plusieurs) => n + ' ' + (n > 1 ? plusieurs : un);
function vibrer(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {} }
function jour(t) {
  const d = new Date(t || Date.now()), o = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  try { return new Intl.DateTimeFormat('fr-FR', o).format(d); } catch (e) { return d.toLocaleDateString(); }
}
const urlAccueil = () => location.pathname + location.search;

const app = $('#app');
const ecrans = { accueil: $('#ecran-accueil'), lieu: $('#ecran-lieu') };
const barreAccueil = $('#barre-accueil'), barreLieu = $('#barre-lieu'), ecranPhoto = $('#ecran-photo');
let ecranCourant = '', lieuCourant = '', lieuInterne = false, defilementAccueil = 0;

/* ---------- bandeau : message bref, avec « Annuler » quand une action peut être défaite ---------- */
const bandeauEl = $('#bandeau');
let bandeauFin = null, bandeauT = 0;
function fermerBandeau(anime) {
  clearTimeout(bandeauT);
  const fin = bandeauFin; bandeauFin = null;
  if (fin) fin();
  bandeauEl.classList.remove('visible');
  if (!anime) bandeauEl.hidden = true;
  else setTimeout(() => { if (!bandeauEl.classList.contains('visible')) bandeauEl.hidden = true; }, 260);
}
/* opt : { action, surAction, surFin (appelé si le bandeau se ferme sans appui sur l'action), duree (0 = reste affiché) } */
function bandeau(texte, opt) {
  opt = opt || {};
  fermerBandeau(false);
  bandeauEl.innerHTML = '<span>' + esc(texte) + '</span>' + (opt.action ? '<button type="button">' + esc(opt.action) + '</button>' : '');
  bandeauEl.classList.toggle('avec-action', !!opt.action);
  bandeauEl.hidden = false;
  void bandeauEl.offsetWidth;
  bandeauEl.classList.add('visible');
  bandeauFin = opt.surFin || null;
  const b = $('button', bandeauEl);
  if (b) b.addEventListener('click', () => { bandeauFin = null; fermerBandeau(true); if (opt.surAction) opt.surAction(); });
  if (opt.duree !== 0) bandeauT = setTimeout(() => fermerBandeau(true), opt.duree || (opt.action ? 5000 : 2600));
}

/* ---------- feuille qui monte du bas ---------- */
const voile = $('#voile'), feuille = $('#feuille'), corps = $('#feuille-corps');
let feuilleOuverte = false, focusAvant = null;
function ouvrirFeuille(html, titre) {
  // une feuille déjà ouverte change seulement de contenu (même entrée d'historique)
  if (feuilleOuverte) { corps.innerHTML = html; feuille.setAttribute('aria-label', titre); feuille.scrollTop = 0; feuille.focus({ preventScroll: true }); return; }
  corps.innerHTML = html;
  feuille.setAttribute('aria-label', titre);
  focusAvant = document.activeElement;
  voile.hidden = feuille.hidden = false;
  feuille.scrollTop = 0;
  void feuille.offsetWidth;
  voile.classList.add('visible'); feuille.classList.add('visible');
  app.inert = true;
  feuilleOuverte = true;
  history.pushState({ feuille: true }, '');
  feuille.focus({ preventScroll: true });
}
/* dejaRetire : l'entrée d'historique de la feuille est déjà partie (touche Retour) ou va être remplacée. */
function fermerFeuille(dejaRetire) {
  if (!feuilleOuverte) return;
  feuilleOuverte = false;
  voile.classList.remove('visible'); feuille.classList.remove('visible');
  app.inert = false;
  setTimeout(() => { if (!feuilleOuverte) { voile.hidden = feuille.hidden = true; corps.innerHTML = ''; } }, 300);
  if (focusAvant && focusAvant.isConnected) { try { focusAvant.focus({ preventScroll: true }); } catch (e) {} }
  focusAvant = null;
  if (!dejaRetire && history.state && history.state.feuille) history.back();
  apresCorrection();
}
voile.addEventListener('click', () => fermerFeuille());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && feuilleOuverte) fermerFeuille(); });

/* ---------- écrans ---------- */
function montrer(nom) {
  const change = nom !== ecranCourant;
  ecranCourant = nom;
  if (nom !== 'photo') fermerPhoto();
  Object.keys(ecrans).forEach(k => { ecrans[k].hidden = k !== nom; ecrans[k].classList.toggle('entre', change && k === nom); });
  barreAccueil.hidden = nom !== 'accueil';
  barreLieu.hidden = nom !== 'lieu';
  if (change && nom !== 'photo') window.scrollTo(0, nom === 'accueil' ? defilementAccueil : 0);
}
function route() {
  const m = /^#\/lieu\/([A-Za-z0-9_-]+)(\/photo)?$/.exec(location.hash), lieu = m ? S.lireLieu(m[1]) : null;
  if (lieu && m[2]) { lieuCourant = lieu.id; lieuInterne = true; ouvrirPhoto(lieu); return; }
  if (lieu) { montrerLieu(lieu); return; }
  if (location.hash) history.replaceState(history.state, '', urlAccueil());
  lieuCourant = '';
  libererUrls();
  rendreAccueil();
  montrer('accueil');
}
function ouvrirLieu(id) {
  defilementAccueil = window.scrollY;
  history.pushState({ interne: true }, '', '#/lieu/' + id);
  route();
}
function retourAccueil() {
  if (lieuInterne) history.back();
  else { history.replaceState(null, '', urlAccueil()); route(); }
}
window.addEventListener('popstate', () => { if (feuilleOuverte) fermerFeuille(true); route(); });

/* ---------- accueil ---------- */
const liste = $('#liste-lieux');
function metaLieu(l) {
  const p = [];
  if (l.tournee.trim()) p.push('Tournée ' + l.tournee.trim());
  p.push(pluriel(l.boxes.length, 'boîte', 'boîtes'));
  p.push(jour(l.updated || l.created));
  return p.join(' · ');
}
function rendreAccueil() {
  const lieux = S.listerLieux();
  liste.innerHTML = lieux.map(l =>
    '<li class="glisse" data-id="' + esc(l.id) + '"><div class="glisse-fond" aria-hidden="true">Supprimer</div>' +
    '<button class="carte" type="button"><span class="carte-nom">' + esc(l.address.trim() || 'Lieu sans nom') + '</span>' +
    '<span class="carte-meta">' + esc(metaLieu(l)) + '</span></button></li>').join('');
  const a = V1.aReprendre(), proposer = a.lieux > 0 && !V1.etat().vu;
  $('#zone-reprise').innerHTML = proposer
    ? '<section class="reprise" aria-labelledby="t-reprise"><h2 id="t-reprise">Reprendre mes lieux de la V1</h2>' +
      '<p>' + pluriel(a.lieux, 'lieu', 'lieux') + ' et ' + pluriel(a.boites, 'boîte', 'boîtes') + ' trouvés sur ce téléphone. Ils sont copiés ici ; rien ne change dans la V1.</p>' +
      '<div class="reprise-actions"><button class="principal compact" type="button" data-act="reprendre">Reprendre</button>' +
      '<button class="texte" type="button" data-act="plus-tard">Plus tard</button></div></section>'
    : '';
  $('#accueil-vide').hidden = lieux.length > 0 || proposer;
}

let repriseEnCours = false;
async function reprendre() {
  if (repriseEnCours) return;
  repriseEnCours = true;
  try {
    const r = await V1.reprendre();
    vibrer(12);
    bandeau(r.lieux ? pluriel(r.lieux, 'lieu repris', 'lieux repris') : 'Rien de nouveau à reprendre');
  } catch (e) {
    bandeau('La reprise n\'a pas pu se terminer. Réessayez.');
  }
  repriseEnCours = false;
  if (ecranCourant === 'accueil') rendreAccueil();
}
$('#zone-reprise').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  if (b.dataset.act === 'reprendre') { b.disabled = true; reprendre(); }
  else { V1.plusTard(); rendreAccueil(); bandeau('À retrouver dans les réglages'); }
});

/* Suppression d'un lieu : pas de question, un bandeau « Annuler » de 5 secondes. */
let supprime = null;
function finirSuppression() {
  if (!supprime) return;
  const id = supprime.id; supprime = null;
  S.supprimerImagesDuLieu(id).catch(() => {});
}
function supprimerLieu(id) {
  fermerBandeau(false);                                   // termine une suppression précédente encore annulable
  const lieu = S.retirerLieu(id); if (!lieu) return;
  supprime = lieu; vibrer(15);
  bandeau('Lieu supprimé', {
    action: 'Annuler', surFin: finirSuppression,
    surAction: () => {
      const l = supprime; supprime = null; if (!l) return;
      S.enregistrerLieu(l); vibrer(8);
      if (ecranCourant === 'accueil') rendreAccueil();
    }
  });
}

/* Toucher une carte ouvre le lieu ; la glisser vers la gauche le supprime. */
let glisse = null, clicIgnore = 0;
liste.addEventListener('click', e => {
  const li = e.target.closest('.glisse');
  if (li && Date.now() > clicIgnore) ouvrirLieu(li.dataset.id);
});
liste.addEventListener('pointerdown', e => {
  const li = e.target.closest('.glisse');
  if (!li || (e.pointerType === 'mouse' && e.button !== 0)) return;
  glisse = { li: li, carte: $('.carte', li), x: e.clientX, y: e.clientY, dx: 0, actif: false, pid: e.pointerId, largeur: li.offsetWidth };
});
liste.addEventListener('pointermove', e => {
  const s = glisse; if (!s || e.pointerId !== s.pid) return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (!s.actif) {
    if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { glisse = null; return; }
    if (!(dx < -10 && Math.abs(dx) > 1.5 * Math.abs(dy))) return;
    s.actif = true; s.li.classList.add('en-glisse', 'ouvert');
    try { s.carte.setPointerCapture(s.pid); } catch (err) {}
  }
  s.dx = Math.min(0, dx);
  s.carte.style.transform = 'translateX(' + s.dx + 'px)';
});
function finGlisse(e) {
  const s = glisse; if (!s || e.pointerId !== s.pid) return;
  glisse = null;
  if (!s.actif) return;
  clicIgnore = Date.now() + 400;
  s.li.classList.remove('en-glisse');
  if (e.type === 'pointerup' && s.dx < -Math.min(150, 0.4 * s.largeur)) {
    s.carte.style.transform = 'translateX(-110%)';
    s.li.classList.add('part');
    setTimeout(() => { supprimerLieu(s.li.dataset.id); rendreAccueil(); }, 200);
  } else {
    s.carte.style.transform = '';
    setTimeout(() => s.li.classList.remove('ouvert'), 260);
  }
}
liste.addEventListener('pointerup', finGlisse);
liste.addEventListener('pointercancel', finGlisse);

/* ---------- écran Résultat : les boîtes d'un lieu ---------- */
let urls = [];
function libererUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
function chargerMini(img) {
  S.lireImage('mini:' + img.dataset.mini).then(r => {
    if (!r || !r.blob || !img.isConnected) { img.remove(); return; }
    const u = URL.createObjectURL(r.blob); urls.push(u);
    img.onload = () => img.classList.add('prete');
    img.src = u;
  }).catch(() => img.remove());
}
const veille = 'IntersectionObserver' in window ? new IntersectionObserver(entrees => {
  entrees.forEach(en => { if (en.isIntersecting) { veille.unobserve(en.target); chargerMini(en.target); } });
}, { rootMargin: '300px' }) : null;
function observer(racine) { racine.querySelectorAll('img[data-mini]:not([src])').forEach(img => { if (veille) veille.observe(img); else chargerMini(img); }); }

const lieuActuel = () => (lieuCourant ? S.lireLieu(lieuCourant) : null);
function enregistrer(lieu) {
  lieu.updated = Date.now();
  try { S.enregistrerLieu(lieu); return true; }
  catch (e) { bandeau('Plus de place sur ce téléphone pour enregistrer.'); return false; }
}
const nomsDe = b => String(b.name || '').split('\n').map(x => x.trim()).filter(Boolean);
function nomsHTML(b) { const n = nomsDe(b); return n.length ? n.map(esc).join('<br>') : '<span class="sans-nom">BAL Sans Nom</span>'; }
function detailHTML(b, avecEtat) {
  return (b.apt ? '<span>Appt ' + esc(b.apt) + '</span>' : '') +
    (b.pub === 'STOP PUB' ? '<span class="pastille stop">STOP PUB</span>' : '') +
    (avecEtat && b.check ? '<span class="pastille doute">À vérifier</span>' : '');
}

/* Mémoire de noms du lieu (comme la V1) : les mots des boîtes confirmées aident les lectures suivantes. */
const SKIPW = /^(M|MR|MME|MMES|MLLE|MLLES|MONSIEUR|MADAME|MADEMOISELLE|ET|DE|DU|DES|LA|LE|LES|EPOUSE|NEE|APPT|APT|PAS|PUB|STOP|OK)$/;
const motsDe = t => String(t || '').split(/[\s\n\/]+/).map(w => w.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, '')).filter(Boolean);
function apprendre(lieu, b) {
  const lex = lieu.lex;
  motsDe(b.name).forEach(w => {
    const k = BalNames.key(w);
    if (k.length < 3 || SKIPW.test(k)) return;
    if (lex[k]) { lex[k].n = Math.min(999, lex[k].n + 1); lex[k].w = w; } else lex[k] = { w: w, n: 1 };
  });
  const cles = Object.keys(lex);
  if (cles.length > 800) cles.sort((x, y) => lex[x].n - lex[y].n).slice(0, cles.length - 800).forEach(k => { delete lex[k]; });
}
function confirmer(lieu, b) { b.ok = true; b.check = false; b.alt = []; b.sug = []; apprendre(lieu, b); }
const memoireDe = lieu => Object.keys(lieu.lex || {}).map(k => lieu.lex[k]);

function montrerLieu(lieu) {
  lieuCourant = lieu.id;
  lieuInterne = !!(history.state && history.state.interne);
  rendreLieu(lieu);
  montrer('lieu');
}
function rendreLieu(lieu) {
  $('#lieu-nom').textContent = lieu.address.trim() || 'Lieu sans nom';
  const n = lieu.boxes.length, aVerifier = lieu.boxes.filter(b => b.check), meta = [];
  if (lieu.tournee.trim()) meta.push('Tournée ' + lieu.tournee.trim());
  meta.push(pluriel(n, 'boîte', 'boîtes'));
  if (aVerifier.length) meta.push(aVerifier.length + ' à vérifier');
  $('#lieu-meta').textContent = meta.join(' · ');
  libererUrls();
  // les boîtes à vérifier d'abord, en grand, avec leur photo
  $('#zone-verif').hidden = !aVerifier.length;
  $('#liste-verif').innerHTML = aVerifier.map(b => {
    const i = lieu.boxes.indexOf(b), puces = (b.alt || []).map((a, k) =>
      '<button class="puce" type="button" data-act="alt" data-k="' + k + '">Autre lecture : <b>' + esc(a.replace(/\n/g, ' / ')) + '</b></button>').join('');
    return '<li class="verif" data-id="' + esc(b.id) + '">' +
      (b.mini ? '<img class="verif-photo" alt="Photo de la boîte ' + (i + 1) + '" data-mini="' + esc(b.id) + '">' : '') +
      '<div class="verif-texte"><span class="num">' + (i + 1) + '</span><p class="noms">' + nomsHTML(b) + '</p></div>' +
      '<p class="detail">' + detailHTML(b, false) + '</p>' +
      (puces ? '<div class="puces">' + puces + '</div>' : '') +
      '<div class="verif-actions"><button class="secondaire" type="button" data-act="corriger">Corriger</button>' +
      '<button class="principal" type="button" data-act="ok">C\'est bon</button></div></li>';
  }).join('');
  const ul = $('#liste-boites');
  $('#zone-boites').hidden = !n; $('#lieu-vide').hidden = n > 0;
  ul.innerHTML = lieu.boxes.map((b, i) => {
    const d = detailHTML(b, true);
    return '<li class="boite" data-id="' + esc(b.id) + '">' +
      '<button class="poignee" type="button" aria-label="Déplacer la boîte ' + (i + 1) + '" data-act="glisser">' +
      '<svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor" aria-hidden="true"><rect y="1" width="18" height="2" rx="1"/><rect y="6" width="18" height="2" rx="1"/><rect y="11" width="18" height="2" rx="1"/></svg></button>' +
      '<button class="boite-bouton" type="button" data-act="corriger"><span class="num">' + (i + 1) + '</span><span class="boite-texte">' +
      '<span class="noms" style="display:block">' + nomsHTML(b) + '</span>' + (d ? '<span class="detail">' + d + '</span>' : '') + '</span>' +
      (b.mini ? '<img class="mini" alt="" data-mini="' + esc(b.id) + '">' : '') + '</button></li>';
  }).join('');
  observer($('#ecran-lieu'));
  $('#btn-partager').hidden = !n;
  $('#btn-photo').className = n ? 'secondaire' : 'principal';
  $('#btn-photo').innerHTML = n ? PICTO_PHOTO : 'Prendre une photo';
}
const PICTO_PHOTO = $('#btn-photo').innerHTML;

$('#btn-retour').addEventListener('click', retourAccueil);
$('#btn-photo').addEventListener('click', () => { if (lieuCourant) { history.pushState({ interne: true }, '', '#/lieu/' + lieuCourant + '/photo'); route(); } });

$('#liste-verif').addEventListener('click', e => {
  const b0 = e.target.closest('button[data-act]'), li = e.target.closest('.verif'); if (!b0 || !li) return;
  const lieu = lieuActuel(); if (!lieu) return;
  const b = lieu.boxes.find(x => x.id === li.dataset.id); if (!b) return;
  if (b0.dataset.act === 'corriger') { ouvrirCorrection(b.id); return; }
  if (b0.dataset.act === 'alt') { const a = (b.alt || [])[+b0.dataset.k]; if (a == null) return; b.alt = b.alt.filter(x => x !== a).concat([b.name]).filter(Boolean); b.name = a; }
  if (b0.dataset.act === 'ok') { confirmer(lieu, b); vibrer(10); }
  enregistrer(lieu); rendreLieu(lieu);
});
$('#liste-boites').addEventListener('click', e => {
  const b = e.target.closest('button[data-act="corriger"]'), li = e.target.closest('.boite');
  if (b && li && Date.now() > clicIgnore) ouvrirCorrection(li.dataset.id);
});

/* Correction d'une boîte : feuille avec la photo de la boîte, les noms, l'appartement, la publicité. */
let corrId = '';
function ouvrirCorrection(id) {
  const lieu = lieuActuel(); if (!lieu) return;
  const i = lieu.boxes.findIndex(x => x.id === id); if (i < 0) return;
  const b = lieu.boxes[i];
  corrId = id;
  const puces = (b.alt || []).map((a, k) => '<button class="puce" type="button" data-act="c-alt" data-k="' + k + '">Autre lecture : <b>' + esc(a.replace(/\n/g, ' / ')) + '</b></button>').join('');
  ouvrirFeuille('<h2 class="feuille-titre">Boîte ' + (i + 1) + '</h2>' +
    (b.mini ? '<img class="corr-photo" alt="Photo de la boîte" data-mini="' + esc(b.id) + '">' : '') +
    '<label class="champ"><span>Noms, un par ligne</span><textarea id="c-noms" rows="' + Math.max(2, nomsDe(b).length) + '" placeholder="BAL Sans Nom" spellcheck="false" autocapitalize="words">' + esc(b.name) + '</textarea></label>' +
    (puces ? '<div class="puces">' + puces + '</div>' : '') +
    '<label class="champ"><span>Appartement</span><input id="c-apt" type="text" maxlength="20" autocomplete="off" autocapitalize="characters" value="' + esc(b.apt) + '"></label>' +
    '<div class="segments pub" role="radiogroup" aria-label="Publicité">' +
    ['OK PUB', 'STOP PUB'].map(v => '<button type="button" role="radio" data-pub="' + v + '" aria-checked="' + ((b.pub === 'STOP PUB') === (v === 'STOP PUB')) + '">' + v + '</button>').join('') + '</div>' +
    '<button class="principal large" type="button" data-act="c-ok">C\'est bon</button>' +
    '<ul class="groupe" style="margin-top:14px">' +
    '<li><button class="ligne" type="button" data-act="c-ajouter"><span class="ligne-texte"><span>Ajouter une boîte après celle-ci</span></span></button></li>' +
    '<li><button class="ligne danger" type="button" data-act="c-supprimer">Supprimer cette boîte</button></li></ul>', 'Boîte ' + (i + 1));
  observer(corps);
  const t = $('#c-noms');
  const ajuster = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  ajuster(); t.addEventListener('input', ajuster);
}
/* Les changements sont gardés au fil de la saisie, comme dans la V1. */
corps.addEventListener('input', e => {
  if (!corrId || (e.target.id !== 'c-noms' && e.target.id !== 'c-apt')) return;
  const lieu = lieuActuel(), b = lieu && lieu.boxes.find(x => x.id === corrId); if (!b) return;
  if (e.target.id === 'c-noms') b.name = e.target.value.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  else b.apt = e.target.value.trim();
  enregistrer(lieu);
});
function apresCorrection() { if (corrId) { corrId = ''; const l = lieuActuel(); if (l && ecranCourant === 'lieu') rendreLieu(l); } }

function actionCorrection(act, bouton) {
  const lieu = lieuActuel(), b = lieu && lieu.boxes.find(x => x.id === corrId); if (!b) return;
  if (act === 'c-alt') {
    const a = (b.alt || [])[+bouton.dataset.k]; if (a == null) return;
    b.alt = b.alt.filter(x => x !== a).concat([b.name]).filter(Boolean); b.name = a;
    enregistrer(lieu);
    const t = $('#c-noms'); if (t) { t.value = a; t.dispatchEvent(new Event('input')); }
    bouton.innerHTML = 'Autre lecture : <b>' + esc(b.alt[b.alt.length - 1].replace(/\n/g, ' / ')) + '</b>'; bouton.dataset.k = b.alt.length - 1;
    return;
  }
  if (act === 'c-ok') { confirmer(lieu, b); enregistrer(lieu); vibrer(10); fermerFeuille(); return; }
  if (act === 'c-ajouter') {
    const i = lieu.boxes.indexOf(b), nb = { id: S.uid(), photo: 0, row: 0, col: 0, name: '', apt: '', pub: 'OK PUB', check: false, empty: false, raw: '', alt: [], sug: [], orig: '', ok: false, mini: false };
    lieu.boxes.splice(i + 1, 0, nb); enregistrer(lieu);
    rendreLieu(lieu); ouvrirCorrection(nb.id);
    return;
  }
  if (act === 'c-supprimer') { const id = b.id; corrId = ''; fermerFeuille(); supprimerBoite(id); }
}

/* Supprimer une boîte : bandeau « Annuler » de 5 secondes. */
function supprimerBoite(id) {
  fermerBandeau(false);
  const lieu = lieuActuel(); if (!lieu) return;
  const i = lieu.boxes.findIndex(x => x.id === id); if (i < 0) return;
  const b = lieu.boxes.splice(i, 1)[0];
  enregistrer(lieu); rendreLieu(lieu); vibrer(15);
  bandeau('Boîte supprimée', {
    action: 'Annuler',
    surFin: () => { if (b.mini) S.supprimerImages(['mini:' + b.id]).catch(() => {}); },
    surAction: () => { const l = S.lireLieu(lieu.id); if (!l) return; l.boxes.splice(Math.min(i, l.boxes.length), 0, b); enregistrer(l); if (lieuCourant === l.id) rendreLieu(l); vibrer(8); }
  });
}

/* Glisser une boîte par sa poignée pour changer l'ordre de flashage. */
let tri = null;
$('#liste-boites').addEventListener('pointerdown', e => {
  const p = e.target.closest('.poignee'); if (!p) return;
  const li = p.closest('.boite'), ul = li.parentNode, items = Array.from(ul.children);
  tri = { li: li, ul: ul, items: items, de: items.indexOf(li), vers: items.indexOf(li), y: e.clientY, h: li.offsetHeight, pid: e.pointerId };
  try { p.setPointerCapture(e.pointerId); } catch (err) {}
  li.classList.add('saisie'); ul.classList.add('en-tri'); vibrer(8);
  e.preventDefault();
});
$('#liste-boites').addEventListener('pointermove', e => {
  if (!tri || e.pointerId !== tri.pid) return;
  const dy = e.clientY - tri.y, n = tri.items.length;
  tri.vers = Math.max(0, Math.min(n - 1, tri.de + Math.round(dy / tri.h)));
  tri.li.style.transform = 'translateY(' + dy + 'px) scale(1.02)';
  tri.items.forEach((x, k) => {
    if (x === tri.li) return;
    let d = 0;
    if (tri.vers > tri.de && k > tri.de && k <= tri.vers) d = -tri.h;
    if (tri.vers < tri.de && k < tri.de && k >= tri.vers) d = tri.h;
    x.style.transform = d ? 'translateY(' + d + 'px)' : '';
  });
  // défilement quand le doigt approche du bord
  if (e.clientY < 80) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 140) window.scrollBy(0, 12);
});
function finTri(e) {
  if (!tri || e.pointerId !== tri.pid) return;
  const t = tri; tri = null;
  t.items.forEach(x => { x.style.transform = ''; });
  t.li.classList.remove('saisie'); t.ul.classList.remove('en-tri');
  clicIgnore = Date.now() + 300;
  if (t.vers === t.de) return;
  const lieu = lieuActuel(); if (!lieu) return;
  const b = lieu.boxes.splice(t.de, 1)[0];
  lieu.boxes.splice(t.vers, 0, b);
  enregistrer(lieu); rendreLieu(lieu); vibrer(10);
}
$('#liste-boites').addEventListener('pointerup', finTri);
$('#liste-boites').addEventListener('pointercancel', finTri);

$('#btn-actions').addEventListener('click', () => {
  ouvrirFeuille('<ul class="groupe">' +
    '<li><button class="ligne" type="button" data-act="modifier-lieu"><span class="ligne-texte"><span>Modifier la tournée ou le lieu</span></span></button></li>' +
    '<li><button class="ligne danger" type="button" data-act="supprimer-lieu">Supprimer ce lieu</button></li></ul>' +
    '<button class="texte large" type="button" data-act="fermer">Annuler</button>', 'Actions');
});

/* ---------- partage : Excel ou CSV ---------- */
$('#btn-partager').addEventListener('click', () => {
  const lieu = lieuActuel(); if (!lieu) return;
  const n = lieu.boxes.filter(b => b.check).length;
  ouvrirFeuille('<h2 class="feuille-titre">Partager</h2>' +
    (n ? '<p class="note" style="margin:-8px 2px 14px">' + pluriel(n, 'boîte est encore', 'boîtes sont encore') + ' à vérifier.</p>' : '') +
    '<ul class="groupe">' +
    '<li><button class="ligne" type="button" data-act="exp-xlsx"><span class="ligne-texte"><span>Excel (.xlsx)</span><small>' + esc(Export.nomFichier(lieu)) + '.xlsx</small></span></button></li>' +
    '<li><button class="ligne" type="button" data-act="exp-csv"><span class="ligne-texte"><span>CSV</span><small>' + esc(Export.nomFichier(lieu)) + '.csv</small></span></button></li></ul>' +
    '<button class="texte large" type="button" data-act="fermer">Annuler</button>', 'Partager');
});
async function exporter(type) {
  const lieu = lieuActuel(); if (!lieu) return;
  const r = S.lireReglages();
  const blob = type === 'xlsx' ? Export.xlsx(lieu, r) : new Blob([Export.csv(lieu, r)], { type: 'text/csv;charset=utf-8' });
  fermerFeuille();
  const res = await Export.partager(blob, Export.nomFichier(lieu) + '.' + type);
  if (res === 'telecharge') bandeau('Fichier enregistré dans les téléchargements');
}

/* ---------- écran Photo : caméra, grille, lecture ---------- */
const P = {
  video: $('#video'), calque: $('#calque'), guide: $('#guide'), scene: $('#scene'), titre: $('#photo-titre'),
  basVisee: $('#bas-visee'), basGrille: $('#bas-grille'), lecture: $('#lecture'), torche: $('#btn-torche'),
  declencheur: $('#btn-declencher'), galerie: $('#f-galerie'), sansCamera: $('#sans-camera')
};
let camera = null, editeur = null, photoPrise = null, lectureEnCours = null, photoOuverte = false, ouvertureCamera = 0;

function ouvrirPhoto(lieu) {
  ecranCourant = 'photo';
  Object.keys(ecrans).forEach(k => { ecrans[k].hidden = true; });
  barreAccueil.hidden = barreLieu.hidden = true;
  ecranPhoto.hidden = false; photoOuverte = true;
  document.documentElement.style.overflow = 'hidden';
  P.titre.textContent = lieu.address.trim() || 'Lieu sans nom';
  modeVisee();
  // le moteur se prépare pendant la visée (les modèles se téléchargent la première fois)
  preparerMoteur(false);
}
function fermerPhoto() {
  if (!photoOuverte) return;
  photoOuverte = false;
  if (lectureEnCours) lectureEnCours.arret = true;
  arreterCamera();
  if (editeur) { editeur.detruire(); editeur = null; }
  photoPrise = null;
  ecranPhoto.hidden = true;
  document.documentElement.style.overflow = '';
}
function arreterCamera() { ouvertureCamera++; if (camera) { camera.arreter(); camera = null; } P.torche.hidden = true; P.torche.setAttribute('aria-pressed', 'false'); }

async function modeVisee() {
  if (editeur) { editeur.detruire(); editeur = null; }
  photoPrise = null;
  $('#visee').hidden = false; P.scene.hidden = true; P.basGrille.hidden = true; P.lecture.hidden = true; P.basVisee.hidden = false;
  P.guide.textContent = ''; P.guide.classList.remove('pret');
  P.sansCamera.hidden = true; P.declencheur.disabled = true;
  if (!cameraPossible()) { sansCamera('Cet appareil ne permet pas d\'utiliser la caméra ici.'); return; }
  const essai = ++ouvertureCamera;
  try {
    const c = await ouvrirCamera(P.video, P.calque, g => { P.guide.textContent = g.texte; P.guide.classList.toggle('pret', g.pret); });
    if (essai !== ouvertureCamera || !photoOuverte) { c.arreter(); return; }
    camera = c; P.declencheur.disabled = false;
    P.torche.hidden = !c.torchePossible;
  } catch (e) {
    if (essai !== ouvertureCamera) return;
    sansCamera(e && e.name === 'NotAllowedError'
      ? 'L\'accès à la caméra est refusé. Autorisez-le dans les réglages du navigateur, ou choisissez une photo.'
      : 'La caméra n\'a pas pu s\'ouvrir.');
  }
}
function sansCamera(texte) {
  P.declencheur.disabled = true;
  $('#sans-camera-texte').textContent = texte;
  P.sansCamera.hidden = false; P.guide.textContent = '';
}
P.torche.addEventListener('click', async () => {
  if (!camera) return;
  const actif = P.torche.getAttribute('aria-pressed') !== 'true';
  P.torche.setAttribute('aria-pressed', String(await camera.torche(actif)));
});
P.declencheur.addEventListener('click', async () => {
  if (!camera) return;
  P.declencheur.disabled = true; vibrer(12);
  try { const blob = await camera.prendre(); arreterCamera(); await modeGrille(blob); }
  catch (e) { P.declencheur.disabled = false; bandeau('La photo n\'a pas pu être prise. Réessayez.'); }
});
ecranPhoto.addEventListener('click', e => { if (e.target.closest('[data-act="galerie"]')) P.galerie.click(); });
P.galerie.addEventListener('change', async () => {
  const f = P.galerie.files && P.galerie.files[0]; P.galerie.value = '';
  if (!f) return;
  arreterCamera();
  await modeGrille(f);
});
$('#btn-fermer-photo').addEventListener('click', () => { if (lieuInterne) history.back(); else { history.replaceState({}, '', '#/lieu/' + lieuCourant); route(); } });
$('#btn-reprendre').addEventListener('click', () => modeVisee());

async function modeGrille(blob) {
  const lieu = lieuActuel(); if (!lieu) return;
  try { photoPrise = await chargerPhoto(blob); }
  catch (e) { bandeau('Cette image ne s\'ouvre pas. Reprenez la photo.'); modeVisee(); return; }
  if (!photoOuverte) return;
  $('#visee').hidden = true; P.basVisee.hidden = true; P.scene.hidden = false; P.basGrille.hidden = false;
  editeur = creerEditeur(P.scene, photoPrise, { sens: lieu.scan, surChange: majGrille });
  majSens(lieu.scan);
  majGrille();
}
function majGrille() {
  if (!editeur) return;
  $('#n-cols').textContent = editeur.cols(); $('#n-rangs').textContent = editeur.rangs();
  const n = editeur.nombre();
  $('#grille-info').textContent = pluriel(n, 'boîte', 'boîtes') + ' · touchez une case pour l\'ignorer';
  const b = $('#btn-lire'); b.textContent = 'Lire ' + pluriel(n, 'boîte', 'boîtes'); b.disabled = !n;
}
function majSens(sens) { P.basGrille.querySelectorAll('[data-sens]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.sens === (sens === 'v' ? 'v' : 'h')))); }
P.basGrille.addEventListener('click', e => {
  const pas = e.target.closest('[data-pas]'), sens = e.target.closest('[data-sens]');
  if (pas && editeur) {
    const [quoi, d] = pas.dataset.pas.split(':');
    editeur.compter(editeur.cols() + (quoi === 'cols' ? +d : 0), editeur.rangs() + (quoi === 'rangs' ? +d : 0));
  }
  if (sens && editeur) {
    const lieu = lieuActuel(); if (!lieu) return;
    lieu.scan = sens.dataset.sens; enregistrer(lieu);    // gardé par lieu
    editeur.sens(lieu.scan); majSens(lieu.scan);
  }
});

let moteurPret = null;
function preparerMoteur(attendre) {
  const r = S.lireReglages(), lieu = lieuActuel();
  const p = (async () => {
    if (!(await Moteur.modelesPresents(r.fort))) {
      if (!attendre) return null;                        // le téléchargement se lance au moment de lire, avec sa progression
      await Moteur.telechargerModeles(r.fort, (a, t) => lectureTexte('Préparation de la lecture · ' + Math.round(a / 1e6) + ' / ' + Math.round(t / 1e6) + ' Mo (une seule fois)', a / t));
    }
    return Moteur.demarrer({ fort: r.fort, memoire: lieu ? memoireDe(lieu) : [] });
  })();
  if (attendre) return p;
  p.catch(() => {});
  return null;
}
function lectureTexte(t, part) { $('#lecture-texte').textContent = t; if (part != null) $('#lecture-barre').style.width = Math.round(100 * part) + '%'; }

$('#btn-lire').addEventListener('click', async () => {
  const lieu = lieuActuel(); if (!lieu || !editeur || lectureEnCours) return;
  const cases = editeur.cases(); if (!cases.length) return;
  const etat = { arret: false }; lectureEnCours = etat;
  P.basGrille.hidden = true; P.lecture.hidden = false;
  lectureTexte('Préparation de la lecture…', 0);
  const debut = Date.now();
  let lus = [];
  try {
    await preparerMoteur(true);
    lectureTexte('Lecture des boîtes · 0 / ' + cases.length, 0);
    lus = await Moteur.lireCases(photoPrise.full, cases, {
      fort: S.lireReglages().fort, memoire: memoireDe(lieu), arret: () => etat.arret,
      surProgres: (i, n) => {
        const reste = (Date.now() - debut) / i * (n - i) / 1000;
        lectureTexte('Lecture des boîtes · ' + i + ' / ' + n + (i < n && i > 1 ? ' · encore ' + (reste < 60 ? Math.ceil(reste) + ' s' : Math.ceil(reste / 60) + ' min') : ''), i / n);
      }
    });
  } catch (e) {
    lectureEnCours = null;
    if (!photoOuverte) return;
    P.lecture.hidden = true; P.basGrille.hidden = false;
    bandeau('La lecture n\'a pas pu démarrer sur cet appareil. Réessayez.', { duree: 5000 });
    return;
  }
  lectureEnCours = null;
  if (!photoOuverte || !lus.length) { if (photoOuverte) { P.lecture.hidden = true; P.basGrille.hidden = false; } return; }
  // les boîtes lues rejoignent le lieu, à la suite des précédentes
  const l = S.lireLieu(lieu.id); if (!l) return;
  l.photoCount = (l.photoCount || 0) + 1;
  const nouvelles = Moteur.boites(lus, S.uid, l.photoCount);
  await S.mettreImages(nouvelles.map((b, i) => (lus[i].mini ? { id: 'mini:' + b.id, lieu: l.id, type: 'mini', blob: lus[i].mini, date: Date.now() } : null)).filter(Boolean)).catch(() => {
    nouvelles.forEach(b => { b.mini = false; });
  });
  l.boxes = l.boxes.concat(nouvelles);
  if (!enregistrer(l)) return;
  S.demanderPersistance(); vibrer(15);
  const chk = nouvelles.filter(b => b.check).length;
  history.back();                                         // retour à l'écran Résultat
  bandeau(pluriel(nouvelles.length, 'boîte ajoutée', 'boîtes ajoutées') + (chk ? ' · ' + chk + ' à vérifier' : '') + (etat.arret ? ' · lecture arrêtée' : ''));
});
$('#btn-arreter').addEventListener('click', () => { if (lectureEnCours) { lectureEnCours.arret = true; lectureTexte('Arrêt après la boîte en cours…'); } });

/* ---------- feuilles : nouveau relevé, réglages ---------- */
$('#btn-nouveau').addEventListener('click', () => {
  const r = S.lireReglages();
  ouvrirFeuille('<h2 class="feuille-titre">Nouveau relevé</h2><form id="f-nouveau" novalidate>' +
    '<label class="champ"><span>Tournée</span><input id="n-tournee" type="text" maxlength="20" autocomplete="off" autocapitalize="characters" enterkeyhint="next" value="' + esc(r.lastTournee) + '"></label>' +
    '<label class="champ"><span>Lieu</span><input id="n-lieu" type="text" maxlength="160" autocomplete="off" enterkeyhint="done" placeholder="Résidence Les Pins, 12 rue des Lilas"></label>' +
    '<button class="principal large" type="submit" disabled>Continuer</button></form>', 'Nouveau relevé');
  const t = $('#n-tournee'), l = $('#n-lieu'), ok = $('#f-nouveau button');
  l.addEventListener('input', () => { ok.disabled = !l.value.trim(); });
  t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); l.focus(); } });
  (r.lastTournee ? l : t).focus({ preventScroll: true });
});
corps.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'f-modifier') {
    const lieu = lieuActuel(), nom = $('#m-lieu').value.trim();
    if (!lieu || !nom) return;
    lieu.address = nom.slice(0, 160); lieu.tournee = $('#m-tournee').value.trim().slice(0, 20);
    enregistrer(lieu); fermerFeuille(); rendreLieu(lieu); vibrer(10);
    return;
  }
  if (e.target.id !== 'f-nouveau') return;
  const nom = $('#n-lieu').value.trim(), tournee = $('#n-tournee').value.trim();
  if (!nom) return;
  const lieu = S.nouveauLieu({ tournee: tournee, address: nom });
  try { S.enregistrerLieu(lieu); S.ecrireReglages({ lastTournee: lieu.tournee }); }
  catch (err) { bandeau('Plus de place sur ce téléphone pour enregistrer ce lieu.'); return; }
  S.demanderPersistance(); vibrer(12);
  defilementAccueil = 0;
  fermerFeuille(true);
  history.replaceState({ interne: true }, '', '#/lieu/' + lieu.id);   // l'entrée de la feuille devient celle du lieu
  history.pushState({ interne: true }, '', '#/lieu/' + lieu.id + '/photo');   // et on passe tout de suite à la photo
  route();
});

function versionInstallee() {
  return new Promise(ok => {
    const c = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!c) { ok(''); return; }
    const canal = new MessageChannel(), t = setTimeout(() => ok(''), 800);
    canal.port1.onmessage = e => { clearTimeout(t); ok(String(e.data || '').replace('imprimbal2-app-', '')); };
    try { c.postMessage({ type: 'version' }, [canal.port2]); } catch (e) { clearTimeout(t); ok(''); }
  });
}
/* Installation sur l'écran d'accueil : proposée dans les réglages quand le navigateur le permet. */
let invite = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); invite = e; });
window.addEventListener('appinstalled', () => { invite = null; });
const installee = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const surIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function ligne(act, titre, detail, inactif) {
  return '<li><button class="ligne" type="button" data-act="' + act + '"' + (inactif ? ' disabled' : '') + '>' +
    '<span class="ligne-texte"><span>' + esc(titre) + '</span>' + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</span></button></li>';
}
function interrupteur(act, titre, detail, actif) {
  return '<li><button class="interrupteur" type="button" role="switch" data-act="' + act + '" aria-checked="' + !!actif + '">' +
    '<span class="ligne-texte"><span>' + esc(titre) + '</span>' + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</span><i aria-hidden="true"></i></button></li>';
}
function ouvrirReglages() {
  const a = V1.aReprendre(), r = S.lireReglages(), lignes = [];
  if (invite && !installee()) lignes.push(ligne('installer', 'Installer sur ce téléphone', 'Icône sur l\'écran d\'accueil, plein écran'));
  if (a.total) lignes.push(ligne('reprendre', 'Reprendre mes lieux de la V1', a.lieux ? pluriel(a.lieux, 'nouveau lieu', 'nouveaux lieux') : 'Tout est repris', !a.lieux));
  ouvrirFeuille('<h2 class="feuille-titre">Réglages</h2>' +
    '<ul class="groupe">' +
    interrupteur('r-fort', 'Lecture renforcée', 'Plus juste sur l\'écriture à la main. ' + Moteur.MO_FORT + ' Mo de plus, un peu plus lente.', r.fort) +
    ligne('r-hors-ligne', 'Lecture sans réseau', 'Vérification…') + '</ul>' +
    '<ul class="groupe" style="margin-top:14px">' +
    interrupteur('r-lieu', 'Colonne « lieu » dans l\'export', 'En première colonne du fichier', r.addrCol) +
    '<li><div class="ligne"><span class="ligne-texte"><span>Séparateur du CSV</span></span><div class="segments" role="radiogroup" aria-label="Séparateur du CSV" style="flex:none;width:120px">' +
    [';', ','].map(v => '<button type="button" role="radio" data-sep="' + v + '" aria-checked="' + (r.sep === v) + '">' + v + '</button>').join('') + '</div></div></li></ul>' +
    (lignes.length ? '<ul class="groupe" style="margin-top:14px">' + lignes.join('') + '</ul>' : '') +
    (surIOS && !installee() ? '<p class="note">Pour installer l\'app : dans Safari, touchez Partager, puis « Sur l\'écran d\'accueil ».</p>' : '') +
    '<p class="note">Vos relevés et vos photos restent sur ce téléphone. La lecture se fait sur le téléphone : rien n\'est envoyé.</p>' +
    '<p class="note" id="version">Imprim Bal 2 · version d\'essai</p>', 'Réglages');
  versionInstallee().then(v => { const el = $('#version'); if (el && v) el.textContent += ' · ' + v; });
  majHorsLigne();
}
async function majHorsLigne() {
  const b = corps.querySelector('[data-act="r-hors-ligne"]'); if (!b) return;
  const r = S.lireReglages(), pret = await Moteur.modelesPresents(r.fort);
  const s = b.querySelector('small'); if (!s) return;
  s.textContent = pret ? 'Prête : les modèles sont sur ce téléphone' : 'Télécharger maintenant (' + (Moteur.MO_BASE + (r.fort ? Moteur.MO_FORT : 0)) + ' Mo, une seule fois)';
  b.disabled = pret;
}
$('#btn-reglages').addEventListener('click', ouvrirReglages);
corps.addEventListener('click', e => {
  const seg = e.target.closest('[data-pub], [data-sep]');
  if (seg) {
    seg.parentNode.querySelectorAll('[role="radio"]').forEach(x => x.setAttribute('aria-checked', String(x === seg)));
    if (seg.dataset.sep) { S.ecrireReglages({ sep: seg.dataset.sep }); return; }
    const lieu = lieuActuel(), bx = lieu && lieu.boxes.find(x => x.id === corrId);
    if (bx) { bx.pub = seg.dataset.pub; enregistrer(lieu); vibrer(8); }
    return;
  }
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act.indexOf('c-') === 0) { actionCorrection(act, b); return; }
  if (act === 'exp-xlsx' || act === 'exp-csv') { exporter(act === 'exp-xlsx' ? 'xlsx' : 'csv'); return; }
  if (act === 'r-fort' || act === 'r-lieu') {
    const on = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(on)); vibrer(8);
    S.ecrireReglages(act === 'r-fort' ? { fort: on } : { addrCol: on });
    if (act === 'r-fort') majHorsLigne();
    return;
  }
  if (act === 'r-hors-ligne') {
    b.disabled = true;
    const s = b.querySelector('small'), r = S.lireReglages();
    Moteur.telechargerModeles(r.fort, (x, t) => { if (s.isConnected) s.textContent = 'Téléchargement · ' + Math.round(x / 1e6) + ' / ' + Math.round(t / 1e6) + ' Mo'; })
      .then(() => majHorsLigne(), () => { if (s.isConnected) { s.textContent = 'Le téléchargement a échoué. Réessayez avec du réseau.'; b.disabled = false; } });
    return;
  }
  if (act === 'modifier-lieu') {
    const lieu = lieuActuel(); if (!lieu) return;
    ouvrirFeuille('<h2 class="feuille-titre">Modifier</h2><form id="f-modifier" novalidate>' +
        '<label class="champ"><span>Tournée</span><input id="m-tournee" type="text" maxlength="20" autocomplete="off" autocapitalize="characters" value="' + esc(lieu.tournee) + '"></label>' +
        '<label class="champ"><span>Lieu</span><input id="m-lieu" type="text" maxlength="160" autocomplete="off" value="' + esc(lieu.address) + '"></label>' +
        '<button class="principal large" type="submit">Enregistrer</button></form>', 'Modifier');
    return;
  }
  if (act === 'fermer') fermerFeuille();
  else if (act === 'reprendre') { fermerFeuille(); reprendre(); }
  else if (act === 'installer') {
    const i = invite; fermerFeuille();
    if (i) { i.prompt(); i.userChoice.then(() => { invite = null; }, () => {}); }
  }
  else if (act === 'supprimer-lieu') {
    const id = lieuCourant, interne = lieuInterne;
    fermerFeuille(true);
    supprimerLieu(id);
    if (interne) history.go(-2);                          // feuille puis lieu : retour à l'accueil
    else { history.replaceState(null, '', urlAccueil()); route(); }
  }
});

/* ---------- clavier : la feuille et le bandeau restent au-dessus ---------- */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const caler = () => {
    const k = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--clavier', (k > 60 ? Math.round(k) : 0) + 'px');
  };
  vv.addEventListener('resize', caler); vv.addEventListener('scroll', caler);
}

/* ---------- hors ligne et mises à jour ----------
   À l'ouverture, une nouvelle version s'installe toute seule. En cours d'utilisation, elle est proposée. */
function serviceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker, notre = new URL('sw.js', location.href).href;
  const controleParNous = !!(sw.controller && sw.controller.scriptURL === notre);
  const debut = Date.now();
  let recharge = false, touche = false;
  ['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, () => { touche = true; }, { once: true, capture: true }));
  sw.addEventListener('controllerchange', () => {
    if (!controleParNous || recharge) return;             // première installation : la page est déjà la bonne
    recharge = true; location.reload();
  });
  function proposer(reg, w) {
    if (!w || !reg.active || !controleParNous) return;
    if (!touche && Date.now() - debut < 6000) { w.postMessage('skipWaiting'); return; }
    bandeau('Nouvelle version prête', { action: 'Mettre à jour', duree: 0, surAction: () => w.postMessage('skipWaiting') });
  }
  function enregistrer() {
    sw.register('sw.js').then(reg => {
      if (reg.waiting) proposer(reg, reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') proposer(reg, w); });
      });
      const verifier = () => reg.update().catch(() => {});
      setInterval(verifier, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); });
    }).catch(() => {});
  }
  if (document.readyState === 'complete') enregistrer(); else window.addEventListener('load', enregistrer);
}

/* ---------- démarrage ---------- */
route();
S.purgerOrphelines().catch(() => {});
serviceWorker();
