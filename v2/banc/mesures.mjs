/* Mesures du banc : compare un relevé lu au relevé corrigé à la main (la vérité terrain).
   Une boîte, des deux côtés : { noms: [un destinataire par entrée], apt, pub: 'STOP PUB' | 'OK PUB', check? }. */

/* Distance d'édition (nombre de lettres à ajouter, retirer ou changer). */
export function distance(a, b) {
  a = Array.from(a); b = Array.from(b);
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let avant = new Array(b.length + 1), cour = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) avant[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cour[0] = i;
    for (let j = 1; j <= b.length; j++) cour[j] = Math.min(avant[j] + 1, cour[j - 1] + 1, avant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [avant, cour] = [cour, avant];
  }
  return avant[b.length];
}

const propre = s => String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim();
const plie = s => propre(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const SANS_NOM = 'BAL Sans Nom';
/* Texte d'une boîte (un destinataire par ligne, ou séparés par « / ») -> liste de destinataires. */
export function listeNoms(texte) {
  const t = propre(String(texte == null ? '' : texte).replace(/\n/g, ' / '));
  if (!t || t === SANS_NOM) return [];
  return t.split(/\s*\/\s*/).map(propre).filter(Boolean);
}
/* La case « noms_prenoms » telle qu'elle est exportée (sans le « BAL Sans Nom » des boîtes vides). */
export const caseNoms = noms => noms.join(' / ');
/* Même chose sans tenir compte des capitales, des accents, de la ponctuation ni de l'ordre des destinataires. */
export const caseNomsTolerante = noms => noms.map(plie).filter(Boolean).sort().join(' / ');
export const caseApt = apt => propre(apt).toUpperCase().replace(/\s+/g, '');
export const estStop = pub => propre(pub).toUpperCase() === 'STOP PUB';

export function comparer(lu, vrai) {
  const a = caseNoms(lu.noms), b = caseNoms(vrai.noms);
  const noms = a === b, nomsTol = caseNomsTolerante(lu.noms) === caseNomsTolerante(vrai.noms);
  const apt = caseApt(lu.apt) === caseApt(vrai.apt), pub = estStop(lu.pub) === estStop(vrai.pub);
  return { noms, nomsTol, apt, pub, juste: noms && apt && pub, justeTol: nomsTol && apt && pub, ecart: distance(a, b), lettres: Array.from(b).length };
}

/* ---------- alignement des boîtes lues sur les boîtes du relevé ----------
   Même nombre de boîtes : une pour une, dans l'ordre. Sinon (grille mal comptée, boîte ajoutée à la main…) :
   le meilleur appariement qui garde l'ordre ; les boîtes sans vis-à-vis sont « manquantes » ou « en trop ». */
function ressemblance(lu, vrai) {
  const x = caseNomsTolerante(lu.noms), y = caseNomsTolerante(vrai.noms);
  if (!x && !y) return caseApt(lu.apt) === caseApt(vrai.apt) ? 1 : 0.8;
  if (!x || !y) return 0;
  return 1 - distance(x, y) / Math.max(x.length, y.length);
}
export function aligner(lus, vrais) {
  if (lus.length === vrais.length) return { direct: true, paires: lus.map((_, i) => [i, i]) };
  const TROU = 0.6, n = lus.length, m = vrais.length;
  const cout = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) cout[i][0] = i * TROU;
  for (let j = 1; j <= m; j++) cout[0][j] = j * TROU;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    cout[i][j] = Math.min(cout[i - 1][j - 1] + 1 - ressemblance(lus[i - 1], vrais[j - 1]), cout[i - 1][j] + TROU, cout[i][j - 1] + TROU);
  }
  const paires = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(cout[i][j] - (cout[i - 1][j - 1] + 1 - ressemblance(lus[i - 1], vrais[j - 1]))) < 1e-9) { paires.push([i - 1, j - 1]); i--; j--; }
    else if (i > 0 && Math.abs(cout[i][j] - (cout[i - 1][j] + TROU)) < 1e-9) { paires.push([i - 1, null]); i--; }
    else { paires.push([null, j - 1]); j--; }
  }
  return { direct: false, paires: paires.reverse() };
}

/* ---------- compteurs ---------- */
export function compteur() {
  return { boites: 0, justes: 0, justesTol: 0, ecart: 0, lettres: 0, apt: 0, aptAttendus: 0, aptTrouves: 0, pub: 0, stopAttendus: 0, stopTrouves: 0,
    signalees: 0, signaleesFausses: 0, fausses: 0, faussesSignalees: 0, manquantes: 0, enTrop: 0 };
}
/* Ajoute une boîte du relevé (vrai) et sa lecture (lu, ou null si aucune boîte lue ne lui correspond). Renvoie le détail. */
export function compter(c, lu, vrai) {
  c.boites++;
  const attenduApt = !!caseApt(vrai.apt), attenduStop = estStop(vrai.pub);
  if (attenduApt) c.aptAttendus++;
  if (attenduStop) c.stopAttendus++;
  if (!lu) {
    c.manquantes++; c.fausses++;
    const l = Array.from(caseNoms(vrai.noms)).length; c.ecart += l; c.lettres += l;
    return { manquante: true, juste: false };
  }
  const r = comparer(lu, vrai);
  if (r.juste) c.justes++;
  if (r.justeTol) c.justesTol++;
  c.ecart += r.ecart; c.lettres += r.lettres;
  if (r.apt) { c.apt++; if (attenduApt) c.aptTrouves++; }
  if (r.pub) { c.pub++; if (attenduStop) c.stopTrouves++; }
  if (lu.check) { c.signalees++; if (!r.juste) c.signaleesFausses++; }
  if (!r.juste) { c.fausses++; if (lu.check) c.faussesSignalees++; }
  return r;
}
export function ajouter(total, c) { for (const k of Object.keys(c)) total[k] = (total[k] || 0) + c[k]; return total; }

const part = (a, b) => b ? a / b : null;
/* Les indicateurs du cahier des charges, en parts (0 à 1) ; null = non mesurable (dénominateur nul). */
export function indicateurs(c) {
  return {
    boites: c.boites,
    justes: part(c.justes, c.boites),                         // boîtes entièrement justes : noms, appartement et pub
    justesTolerant: part(c.justesTol, c.boites),              // idem sans compter capitales, accents, ponctuation, ordre
    erreursLettres: part(c.ecart, c.lettres),                 // taux d'erreur par caractère sur les noms
    appartement: part(c.apt, c.boites),
    appartementTrouve: part(c.aptTrouves, c.aptAttendus),     // parmi les boîtes qui ont un numéro
    pub: part(c.pub, c.boites),
    stopTrouve: part(c.stopTrouves, c.stopAttendus),          // parmi les boîtes STOP PUB
    signaleesFausses: part(c.signaleesFausses, c.signalees),  // boîtes « à vérifier » qui étaient vraiment fausses
    faussesSignalees: part(c.faussesSignalees, c.fausses),    // boîtes fausses que l'app avait signalées
    faussesNonSignalees: part(c.fausses - c.faussesSignalees, c.boites),   // erreurs silencieuses
    manquantes: c.manquantes, enTrop: c.enTrop
  };
}
