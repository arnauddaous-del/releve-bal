/* Imprim Bal 2 : le dictionnaire qui aide le décodage (prénoms de la V1, noms de famille).
   Règle : le dictionnaire suggère, il n'écrase jamais. Il propose des mots voisins de ce que le modèle a lu et donne
   un petit bonus, borné, aux mots connus. C'est toujours la probabilité du modèle (ctc.mjs) qui tranche : un nom rare
   lu nettement n'est pas remplacé par un nom courant. */

export function plier(w) {
  return String(w).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}
function sansAccent(c) { return c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function masque(w) {
  let m = 0;
  for (let i = 0; i < w.length; i++) m |= 1 << (w.charCodeAt(i) - 97);
  return m;
}
function bits(x) {
  x = x - ((x >> 1) & 0x55555555); x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
/* Distance d'édition, abandonnée dès qu'elle dépasse max. */
export function distance(a, b, max) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prec = new Int32Array(n + 1), cour = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) prec[j] = j;
  for (let i = 1; i <= m; i++) {
    cour[0] = i; let mini = cour[0];
    for (let j = 1; j <= n; j++) {
      let v = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      cour[j] = v; if (v < mini) mini = v;
    }
    if (mini > max) return max + 1;
    const x = prec; prec = cour; cour = x;
  }
  return prec[n];
}

/* prenoms : BalNames (prenoms.mjs). nomsTexte : une ligne par nom de famille, « nom occurrences », du plus courant
   au plus rare (fichier fabriqué par outils/lexique_noms.py). bonusMax borne ce que le dictionnaire peut peser. */
export function creerLexique(prenoms, nomsTexte, reglages) {
  reglages = reglages || {};
  const BONUS_PRENOM = reglages.prenom != null ? reglages.prenom : 2, BONUS_MAX = reglages.max != null ? reglages.max : 2.5;
  const index = new Map();
  const poser = (mot, bonus, canon, prenom) => {
    if (mot.length < 3) return;
    const e = index.get(mot);
    if (!e) index.set(mot, { mot: mot, bonus: bonus, canon: canon || null, prenom: !!prenom });
    else { if (bonus > e.bonus) e.bonus = bonus; if (canon && !e.canon) e.canon = canon; if (prenom) e.prenom = true; }
  };
  if (prenoms && prenoms.list) prenoms.list.forEach(n => String(n).split(/[\s-]+/).forEach(p => poser(plier(p), BONUS_PRENOM, p, true)));
  if (nomsTexte) {
    for (const ligne of nomsTexte.split('\n')) {
      const k = ligne.lastIndexOf(' ');
      if (k < 1) continue;
      const occ = parseInt(ligne.slice(k + 1), 10) || 1, bonus = Math.min(BONUS_MAX, 0.5 + 0.5 * Math.log10(occ));
      for (const partie of ligne.slice(0, k).split(/[\s'-]+/)) poser(plier(partie), bonus, null, false);
    }
  }
  const mots = Array.from(index.keys()), masques = new Int32Array(mots.length), longs = new Uint8Array(mots.length);
  mots.forEach((w, i) => { masques[i] = masque(w); longs[i] = Math.min(255, w.length); });

  function trouver(mot) { return index.get(plier(mot)) || null; }

  /* Mots du dictionnaire à au plus dmax fautes du mot lu. */
  function voisins(mot, dmax, combien) {
    const w = plier(mot), m = masque(w), n = w.length, out = [];
    if (n < 3) return out;
    for (let i = 0; i < mots.length; i++) {
      if (longs[i] < n - dmax || longs[i] > n + dmax) continue;
      if (bits(masques[i] ^ m) > 2 * dmax) continue;
      const d = distance(w, mots[i], dmax);
      if (d > 0 && d <= dmax) out.push({ e: index.get(mots[i]), d: d });
    }
    out.sort((a, b) => (a.d - b.d) || (b.e.bonus - a.e.bonus));
    return out.slice(0, combien || 8);
  }

  /* Bonus d'un mot tel qu'il est écrit. Seuls comptent les mots écrits comme des noms : EN CAPITALES ou avec une
     Majuscule initiale (« pace », « LOvy » ne gagnent rien). Les noms de famille très courts gagnent peu ou rien :
     il en existe tant que n'importe quel reste de trois lettres en serait un. Un prénom connu avec ses accents
     (« Noémie ») vaut autant écrit sans accent (« Noemie »), moitié moins avec d'autres accents (« Noèmie »). */
  function bonusMot(mot) {
    const lettres = mot.replace(/[^A-Za-zÀ-ɏ]/g, '');
    if (lettres.length < 3) return 0;
    const majuscules = lettres === lettres.toUpperCase();
    if (!majuscules && lettres !== lettres.charAt(0).toUpperCase() + lettres.slice(1).toLowerCase()) return 0;
    const e = index.get(plier(lettres));
    if (!e) return 0;
    if (e.canon) {
      const attendu = majuscules ? e.canon.toUpperCase() : e.canon.toLowerCase(), ecrit = majuscules ? lettres : lettres.toLowerCase();
      if (ecrit !== attendu && ecrit !== sansAccent(attendu)) return e.bonus * 0.5;
    }
    if (!e.prenom) { if (lettres.length === 3) return 0; if (lettres.length === 4) return e.bonus * 0.6; }
    return e.bonus;
  }
  /* Bonus d'un texte : la somme des bonus de ses mots. Un mot en capitales qui porte un accent sans être un prénom
     connu écrit ainsi (« DUPONTÉ ») perd un point par accent : les noms en capitales en portent rarement. */
  function bonusTexte(texte) {
    let s = 0;
    for (const mot of texte.split(/[^A-Za-zÀ-ɏ]+/)) {
      if (!mot) continue;
      s += bonusMot(mot);
      if (mot.length >= 3 && mot === mot.toUpperCase()) {
        const accents = (mot.match(/[À-ɏ]/g) || []).length, e = index.get(plier(mot));
        if (accents && !(e && e.canon && e.canon.toUpperCase() === mot)) s -= accents;
      }
    }
    return s;
  }

  /* Écrit un mot du dictionnaire à la manière du mot qu'il remplace (MAJUSCULES, Majuscule initiale, minuscules).
     Renvoie une ou deux écritures : en capitales, un prénom accentué se propose avec et sans accents. */
  function habiller(e, modele) {
    const lettres = modele.replace(/[^A-Za-zÀ-ɏ]/g, '');
    const base = e.canon || (e.mot.charAt(0).toUpperCase() + e.mot.slice(1));
    if (lettres && lettres === lettres.toUpperCase() && lettres.length > 1) {
      const a = base.toUpperCase(), b = e.mot.toUpperCase();
      return a === b ? [a] : [b, a];
    }
    if (lettres && lettres.charAt(0) === lettres.charAt(0).toUpperCase()) return [base];
    return [base.toLowerCase()];
  }

  return { taille: mots.length, trouver: trouver, voisins: voisins, bonusMot: bonusMot, bonusTexte: bonusTexte, habiller: habiller };
}
