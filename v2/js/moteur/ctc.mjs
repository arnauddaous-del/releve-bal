/* Imprim Bal 2 : décodage des sorties du modèle de reconnaissance (CTC).
   La V1 ne gardait que la lettre la plus probable à chaque pas. Ici on garde tout le tableau de probabilités,
   réduit aux caractères utiles (latin, chiffres, ponctuation), ce qui permet :
   - de proposer plusieurs lectures d'un même morceau de texte (recherche en faisceau) ;
   - de donner à n'importe quelle lecture candidate sa vraie probabilité selon le modèle (somme sur tous les
     alignements), donc de comparer honnêtement « DUPONO » et « DUPONT » ;
   - de réunir plusieurs modèles ou plusieurs versions de l'image en additionnant ces notes.
   Aucune dépendance : les mêmes fonctions tournent dans le Worker du téléphone et dans le banc d'essai (Node). */

const MOINS_INFINI = -Infinity;

function sommeLog(a, b) {
  if (a === MOINS_INFINI) return b;
  if (b === MOINS_INFINI) return a;
  return a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
}

/* Alphabet réduit. dict : les caractères du modèle (classe k = dict[k - 1], classe 0 = « rien »).
   latin : la fonction de la V1 qui ramène les sosies grecs ou cyrilliques vers la lettre latine.
   Plusieurs classes du modèle peuvent donner le même caractère : leurs probabilités s'additionnent. */
export function creerAlphabet(dict, latin) {
  const cars = [''], rang = new Map(), classes = [], symboles = [];
  for (let k = 0; k < dict.length; k++) {
    let c = dict[k];
    if (!c) continue;
    if (latin) c = latin(c);
    if (c.length !== 1) continue;
    const code = c.charCodeAt(0);
    if (!((code >= 0x20 && code <= 0x24F) || c === '’')) continue;
    let s = rang.get(c);
    if (s === undefined) { s = cars.length; cars.push(c); rang.set(c, s); }
    classes.push(k + 1); symboles.push(s);
  }
  return { cars: cars, rang: rang, classes: Int32Array.from(classes), symboles: Int32Array.from(symboles), taille: cars.length };
}

/* Tableau réduit pour une sortie du modèle (T pas, C classes).
   P : probabilités telles que le modèle les donne ; L : leur logarithme, ramené à un total de 1 par pas. */
export function matrice(sortie, T, C, alpha) {
  const A = alpha.taille, P = new Float32Array(T * A), L = new Float32Array(T * A), cls = alpha.classes, sym = alpha.symboles;
  for (let t = 0; t < T; t++) {
    const o = t * C, p = t * A;
    P[p] = sortie[o];
    for (let j = 0; j < cls.length; j++) P[p + sym[j]] += sortie[o + cls[j]];
    let z = 0;
    for (let a = 0; a < A; a++) z += P[p + a];
    z = Math.max(z, 1e-12);
    for (let a = 0; a < A; a++) L[p + a] = Math.log(Math.max(P[p + a], 1e-9) / z);
  }
  return { T: T, A: A, P: P, L: L };
}

export function enSuite(texte, alpha) {
  const s = new Int32Array(texte.length);
  for (let i = 0; i < texte.length; i++) {
    const r = alpha.rang.get(texte[i]);
    if (r === undefined) return null;
    s[i] = r;
  }
  return s;
}
export function enTexte(suite, alpha) {
  let t = '';
  for (let i = 0; i < suite.length; i++) t += alpha.cars[suite[i]];
  return t;
}

/* Lecture « au plus probable à chaque pas » : exactement celle de la V1, avec sa note de confiance. */
export function glouton(m, alpha) {
  const T = m.T, A = m.A, P = m.P, suite = [];
  let dernier = -1, conf = 0, n = 0, minc = 1;
  for (let t = 0; t < T; t++) {
    let best = 0, bv = -1;
    for (let a = 0; a < A; a++) if (P[t * A + a] > bv) { bv = P[t * A + a]; best = a; }
    if (best !== 0 && best !== dernier) { suite.push(best); conf += bv; n++; if (bv < minc) minc = bv; }
    dernier = best;
  }
  return { texte: enTexte(suite, alpha).trim(), conf: n ? conf / n : 0, minc: n ? minc : 0 };
}

/* Recherche en faisceau sur les préfixes : les meilleures lectures et leur log-probabilité.
   largeur : nombre de préfixes gardés à chaque pas ; parPas : nombre de caractères essayés à chaque pas. */
export function faisceau(m, alpha, largeur, parPas) {
  largeur = largeur || 16; parPas = parPas || 5;
  const T = m.T, A = m.A, L = m.L, SEUIL = Math.log(2e-3);
  let actuels = new Map([['', { suite: [], b: 0, nb: MOINS_INFINI }]]);
  const choix = new Int32Array(parPas);
  for (let t = 0; t < T; t++) {
    const o = t * A;
    // les caractères les plus probables de ce pas, du plus probable au moins probable
    let nc = 0;
    for (let a = 1; a < A; a++) {
      const v = L[o + a];
      if (v < SEUIL) continue;
      if (nc === parPas && v <= L[o + choix[nc - 1]]) continue;
      let i = nc < parPas ? nc++ : parPas - 1;
      choix[i] = a;
      while (i > 0 && L[o + choix[i]] > L[o + choix[i - 1]]) { const x = choix[i]; choix[i] = choix[i - 1]; choix[i - 1] = x; i--; }
    }
    const suivants = new Map();
    const ajouter = (cle, suite, b, nb) => {
      const e = suivants.get(cle);
      if (e) { e.b = sommeLog(e.b, b); e.nb = sommeLog(e.nb, nb); } else suivants.set(cle, { suite: suite, b: b, nb: nb });
    };
    for (const [cle, e] of actuels) {
      const tot = sommeLog(e.b, e.nb), dernier = e.suite.length ? e.suite[e.suite.length - 1] : -1;
      ajouter(cle, e.suite, tot + L[o], MOINS_INFINI);
      if (dernier > 0) ajouter(cle, e.suite, MOINS_INFINI, e.nb + L[o + dernier]);
      for (let i = 0; i < nc; i++) {
        const a = choix[i], p = L[o + a];
        const nb = a === dernier ? e.b + p : tot + p;
        if (nb === MOINS_INFINI) continue;
        ajouter(cle + ',' + a, e.suite.concat(a), MOINS_INFINI, nb);
      }
    }
    let liste = Array.from(suivants);
    if (liste.length > largeur) {
      liste.sort((x, y) => sommeLog(y[1].b, y[1].nb) - sommeLog(x[1].b, x[1].nb));
      liste.length = largeur;
    }
    actuels = new Map(liste);
  }
  // deux préfixes qui ne diffèrent que par des espaces au bord donnent le même texte
  const parTexte = new Map();
  for (const e of actuels.values()) {
    const texte = enTexte(e.suite, alpha).replace(/\s+/g, ' ').trim(), lp = sommeLog(e.b, e.nb);
    parTexte.set(texte, parTexte.has(texte) ? sommeLog(parTexte.get(texte), lp) : lp);
  }
  return Array.from(parTexte, x => ({ texte: x[0], lp: x[1] })).sort((x, y) => y.lp - x.lp);
}

/* Log-probabilité exacte d'un texte selon le tableau (somme sur tous les alignements possibles). */
export function vraisemblance(m, suite) {
  const T = m.T, A = m.A, L = m.L, n = suite.length, S = 2 * n + 1;
  if (n > T) return MOINS_INFINI;
  let a = new Float64Array(S).fill(MOINS_INFINI), b = new Float64Array(S);
  a[0] = L[0];
  if (n) a[1] = L[suite[0]];
  for (let t = 1; t < T; t++) {
    const o = t * A, debut = Math.max(0, S - 2 * (T - t)), fin = Math.min(S - 1, 2 * t + 1);
    b.fill(MOINS_INFINI);
    for (let s = debut; s <= fin; s++) {
      let v = a[s];
      if (s > 0) v = sommeLog(v, a[s - 1]);
      if (s & 1) {
        const c = suite[s >> 1];
        if (s > 1 && suite[(s >> 1) - 1] !== c) v = sommeLog(v, a[s - 2]);
        b[s] = v === MOINS_INFINI ? v : v + L[o + c];
      } else b[s] = v === MOINS_INFINI ? v : v + L[o];
    }
    const x = a; a = b; b = x;
  }
  return n ? sommeLog(a[S - 1], a[S - 2]) : a[0];
}

/* Meilleur alignement d'un texte sur le tableau, puis la confiance « façon V1 » : la probabilité de chaque lettre
   au pas où elle apparaît, en moyenne (conf) et au plus bas (minc). Pour la lecture au plus probable, c'est
   exactement le calcul de la V1 ; pour une autre lecture, c'est la même mesure appliquée à cette lecture. */
export function confiance(m, suite) {
  const T = m.T, A = m.A, L = m.L, P = m.P, n = suite.length, S = 2 * n + 1;
  if (!n || n > T) return { conf: 0, minc: 0 };
  const d = new Float64Array(T * S).fill(MOINS_INFINI), d0 = new Int8Array(T * S);
  d[0] = L[0]; d[1] = L[suite[0]];
  for (let t = 1; t < T; t++) {
    const o = t * A, p = (t - 1) * S, q = t * S;
    for (let s = 0; s < S; s++) {
      let v = d[p + s], de = 0;
      if (s > 0 && d[p + s - 1] > v) { v = d[p + s - 1]; de = 1; }
      if ((s & 1) && s > 1 && suite[(s >> 1) - 1] !== suite[s >> 1] && d[p + s - 2] > v) { v = d[p + s - 2]; de = 2; }
      if (v === MOINS_INFINI) continue;
      d[q + s] = v + L[o + ((s & 1) ? suite[s >> 1] : 0)];
      d0[q + s] = de;
    }
  }
  let s = d[(T - 1) * S + S - 1] >= d[(T - 1) * S + S - 2] ? S - 1 : S - 2;
  if (d[(T - 1) * S + s] === MOINS_INFINI) return { conf: 0, minc: 0 };
  // premier pas de chaque lettre le long du chemin
  const premier = new Int32Array(n).fill(-1);
  for (let t = T - 1; t >= 0; t--) {
    if (s & 1) premier[s >> 1] = t;
    s -= d0[t * S + s];
  }
  let conf = 0, minc = 1;
  for (let i = 0; i < n; i++) {
    const v = premier[i] < 0 ? 0 : P[premier[i] * A + suite[i]];
    conf += v; if (v < minc) minc = v;
  }
  return { conf: conf / n, minc: minc };
}

/* Note d'un texte selon plusieurs tableaux (plusieurs modèles, plusieurs versions de l'image) : moyenne pondérée des
   log-probabilités. Une moyenne et non une somme : les lectures d'une même image ne sont pas indépendantes. */
export function noter(sources, texte, alpha) {
  const suite = enSuite(texte, alpha);
  if (!suite) return MOINS_INFINI;
  let s = 0, w = 0;
  for (const src of sources) {
    const v = vraisemblance(src.m, suite);
    s += (src.poids || 1) * Math.max(v, -60); w += (src.poids || 1);
  }
  return w ? s / w : MOINS_INFINI;
}

/* Transforme des notes en probabilités qui font 1 au total sur la liste des candidats. */
export function probabilites(notes) {
  let z = MOINS_INFINI;
  for (const v of notes) z = sommeLog(z, v);
  return notes.map(v => (z === MOINS_INFINI ? 0 : Math.exp(v - z)));
}
