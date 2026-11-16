/* Imprim Bal 2 — squelette (étape 1) : accueil, lieux, reprise des lieux de la V1, mises à jour.
   La photo, la lecture et le partage arrivent aux étapes suivantes. */
import * as S from './stockage.js';
import * as V1 from './import-v1.js';

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
const barreAccueil = $('#barre-accueil');
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
}
voile.addEventListener('click', () => fermerFeuille());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && feuilleOuverte) fermerFeuille(); });

/* ---------- écrans ---------- */
function montrer(nom) {
  const change = nom !== ecranCourant;
  ecranCourant = nom;
  Object.keys(ecrans).forEach(k => { ecrans[k].hidden = k !== nom; ecrans[k].classList.toggle('entre', change && k === nom); });
  barreAccueil.hidden = nom !== 'accueil';
  if (change) window.scrollTo(0, nom === 'accueil' ? defilementAccueil : 0);
}
function route() {
  const m = /^#\/lieu\/([A-Za-z0-9_-]+)$/.exec(location.hash), lieu = m ? S.lireLieu(m[1]) : null;
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

/* ---------- un lieu (pour l'instant : ses boîtes, en lecture seule) ---------- */
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

function montrerLieu(lieu) {
  lieuCourant = lieu.id;
  lieuInterne = !!(history.state && history.state.interne);
  $('#lieu-nom').textContent = lieu.address.trim() || 'Lieu sans nom';
  const n = lieu.boxes.length, doute = lieu.boxes.filter(b => b.check).length, meta = [];
  if (lieu.tournee.trim()) meta.push('Tournée ' + lieu.tournee.trim());
  meta.push(pluriel(n, 'boîte', 'boîtes'));
  if (doute) meta.push(doute + ' à vérifier');
  $('#lieu-meta').textContent = meta.join(' · ');
  libererUrls();
  const ul = $('#liste-boites');
  ul.hidden = !n; $('#lieu-vide').hidden = n > 0;
  ul.innerHTML = lieu.boxes.map((b, i) => {
    const noms = String(b.name || '').split('\n').map(x => x.trim()).filter(Boolean);
    const detail = (b.apt ? '<span>Appt ' + esc(b.apt) + '</span>' : '') +
      (b.pub === 'STOP PUB' ? '<span class="pastille stop">STOP PUB</span>' : '') +
      (b.check ? '<span class="pastille doute">À vérifier</span>' : '');
    return '<li class="boite"><span class="num">' + (i + 1) + '</span><div class="boite-texte">' +
      '<p class="noms">' + (noms.length ? noms.map(esc).join('<br>') : '<span class="sans-nom">BAL Sans Nom</span>') + '</p>' +
      (detail ? '<p class="detail">' + detail + '</p>' : '') + '</div>' +
      (b.mini ? '<img class="mini" alt="" data-mini="' + esc(b.id) + '">' : '') + '</li>';
  }).join('');
  ul.querySelectorAll('img[data-mini]').forEach(img => { if (veille) veille.observe(img); else chargerMini(img); });
  montrer('lieu');
}
$('#btn-retour').addEventListener('click', retourAccueil);
$('#btn-actions').addEventListener('click', () => {
  ouvrirFeuille('<ul class="groupe"><li><button class="ligne danger" type="button" data-act="supprimer-lieu">Supprimer ce lieu</button></li></ul>' +
    '<button class="texte large" type="button" data-act="fermer">Annuler</button>', 'Actions');
});

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
$('#btn-reglages').addEventListener('click', () => {
  const a = V1.aReprendre(), lignes = [];
  if (invite && !installee()) lignes.push(ligne('installer', 'Installer sur ce téléphone', 'Icône sur l\'écran d\'accueil, plein écran'));
  if (a.total) lignes.push(ligne('reprendre', 'Reprendre mes lieux de la V1', a.lieux ? pluriel(a.lieux, 'nouveau lieu', 'nouveaux lieux') : 'Tout est repris', !a.lieux));
  ouvrirFeuille('<h2 class="feuille-titre">Réglages</h2>' +
    (lignes.length ? '<ul class="groupe">' + lignes.join('') + '</ul>' : '') +
    (surIOS && !installee() ? '<p class="note">Pour installer l\'app : dans Safari, touchez Partager, puis « Sur l\'écran d\'accueil ».</p>' : '') +
    '<p class="note">Vos relevés et vos photos restent sur ce téléphone. Rien n\'est envoyé.</p>' +
    '<p class="note" id="version">Imprim Bal 2 · version en préparation</p>', 'Réglages');
  versionInstallee().then(v => { const el = $('#version'); if (el && v) el.textContent += ' · ' + v; });
});
corps.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const act = b.dataset.act;
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
