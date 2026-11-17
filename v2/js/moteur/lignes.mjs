/* Imprim Bal 2 : lecture des lignes de texte d'une boîte, nouvelle manière.
   Même détection et même découpe en lignes que la V1 (lecture.mjs). Ce qui change : chaque morceau de texte garde
   son tableau de probabilités ; plusieurs lectures candidates sont comparées par leur vraie probabilité, sur une ou
   plusieurs versions de l'image et un ou deux modèles ; le dictionnaire peut proposer des mots voisins.
   Chaque nouveauté est une option, pour pouvoir la mesurer seule sur le banc d'essai. */
import { BalPaddle as P } from './lecture.mjs';
import { creerAlphabet, matrice, glouton, faisceau, vraisemblance, probabilites, confiance, enSuite } from './ctc.mjs';

export function alphabetPour(dict) { return creerAlphabet(dict, P.latin); }

/* Passe un morceau d'image dans un modèle de reconnaissance et renvoie son tableau réduit. Même préparation que la V1. */
export async function tableau(ort, sess, img, alpha) {
  const H = 48, W = Math.max(16, Math.min(960, Math.round(img.width * H / img.height)));
  const r = P.resize(img, W, H), n = W * H, t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) t[c * n + i] = (r.data[i * 4 + (2 - c)] / 255 - 0.5) / 0.5;
  const feeds = {}; feeds[sess.inputNames[0]] = new ort.Tensor('float32', t, [1, 3, H, W]);
  const o = (await sess.run(feeds))[sess.outputNames[0]];
  return matrice(o.data, o.dims[1], o.dims[2], alpha);
}

const MOT = /[A-Za-zÀ-ɏ]+/g;

/* Lectures voisines proposées par le dictionnaire pour un texte : un mot remplacé à la fois. */
function propositions(texte, lex) {
  const out = [];
  let m; MOT.lastIndex = 0;
  while ((m = MOT.exec(texte))) {
    const mot = m[0], debut = m.index, fin = debut + mot.length;
    if (mot.length < 4) continue;
    const dmax = mot.length >= 7 ? 2 : 1;
    for (const v of lex.voisins(mot, dmax, 8))
      for (const ecrit of lex.habiller(v.e, mot)) out.push(texte.slice(0, debut) + ecrit + texte.slice(fin));
    // deux mots collés (« DURANDLUCIE ») : couper là où les deux moitiés sont connues
    if (mot.length >= 7) {
      for (let k = 3; k <= mot.length - 3; k++) {
        const a = lex.trouver(mot.slice(0, k)), b = lex.trouver(mot.slice(k));
        if (a && b && (a.prenom || b.prenom)) out.push(texte.slice(0, debut) + mot.slice(0, k) + ' ' + mot.slice(k) + texte.slice(fin));
      }
    }
  }
  return out;
}

/* Lit un morceau de texte (une boîte de la détection). Renvoie le texte retenu, sa confiance « façon V1 » (0 à 1),
   la probabilité que ce soit la bonne lecture parmi les candidates (p) et les autres lectures plausibles. */
async function lireMorceau(ctx, crop1, opts) {
  const alpha = ctx.alpha, sources = [];
  const voir = async (sess, img, poids) => { const m = await tableau(ctx.ort, sess, img, alpha); sources.push({ m: m, poids: poids, g: glouton(m, alpha) }); };
  await voir(ctx.rec, crop1, 1);
  const g0 = sources[0].g, faible = g0.conf < 0.85 || g0.minc < 0.5, fort = opts.fort ? ctx.fort : null;
  if (fort && (opts.fort === 'tout' || faible)) await voir(fort, crop1, opts.poidsFort || 1);
  if (faible && opts.relire !== false) {
    let e1 = null, e2 = null;
    try { e1 = P.enhance(crop1, 'clahe'); if (!fort) e2 = P.enhance(crop1, 'bin'); } catch (err) { e1 = null; e2 = null; }
    if (e1) await voir(fort || ctx.rec, e1, fort ? (opts.poidsFort || 1) : 1);
    if (e2) await voir(ctx.rec, e2, 1);
  }
  // candidates : les meilleures lectures de chaque tableau
  const vus = new Map();
  const poser = t => { if (t && !vus.has(t)) vus.set(t, { texte: t, lp: null }); };
  for (const s of sources) {
    poser(s.g.texte);
    for (const c of faisceau(s.m, alpha, opts.largeur || 16, 5).slice(0, opts.combien || 6)) poser(c.texte);
  }
  if (!vus.size) return null;
  const lex = opts.lexique || null, poidsLex = opts.poidsLexique != null ? opts.poidsLexique : 1;
  /* Vote pondéré : chaque tableau répartit sa confiance entre toutes les candidates (selon leur probabilité chez lui,
     et le bonus du dictionnaire), puis on fait la moyenne des tableaux. Une version d'image illisible ne peut donc
     pas faire tomber une lecture que les autres voient nettement. */
  const classer = () => {
    const cands = Array.from(vus.values());
    for (const c of cands) {
      if (c.lp) continue;
      const suite = enSuite(c.texte, alpha);
      c.lp = sources.map(s => (suite ? Math.max(vraisemblance(s.m, suite), -80) : -80));
      c.bonus = lex ? poidsLex * lex.bonusTexte(c.texte) : 0;
    }
    let total = 0;
    cands.forEach(c => { c.p = 0; });
    sources.forEach((s, k) => {
      const ps = probabilites(cands.map(c => c.lp[k] + c.bonus));
      cands.forEach((c, i) => { c.p += s.poids * ps[i]; });
      total += s.poids;
    });
    cands.forEach(c => { c.p /= total; });
    return cands.sort((x, y) => y.p - x.p);
  };
  let cands = classer();
  if (lex && (faible || opts.lexiquePartout || cands[0].p < 0.95)) {
    for (let tour = 0; tour < 2; tour++) {
      // au deuxième tour on repart de la meilleure lecture : deux mots peuvent être corrigés l'un après l'autre
      for (const c of cands.slice(0, tour ? 1 : 2)) for (const t of propositions(c.texte, lex)) poser(t);
      cands = classer();
    }
  }
  if (!cands.length) return null;
  const best = cands[0], suite = enSuite(best.texte, alpha);
  let conf = 0, minc = 0, accord = 0;
  for (const s of sources) {
    const c = confiance(s.m, suite);
    if (c.conf + c.minc > conf + minc) { conf = c.conf; minc = c.minc; }
    if (s.g.texte === best.texte) accord++;
  }
  return {
    texte: best.texte, conf: conf, minc: minc, p: best.p, accord: accord, lectures: sources.length, faible: faible,
    autres: cands.slice(1).filter(c => c.p >= 0.02).slice(0, 5).map(c => ({ texte: c.texte, p: c.p })),
    detail: opts.detail ? { sources: sources.map(x => x.g), cands: cands.slice(0, 8).map(c => ({ texte: c.texte, p: c.p, lp: c.lp, bonus: c.bonus })) } : undefined
  };
}

/* Lit toutes les lignes d'une boîte. ctx : { ort, det, rec, fort, alpha }. Renvoie des lignes comme celles de la V1
   ({ text, conf de 0 à 100, alts, agree }) avec en plus : p (probabilité que la ligne soit juste), box (place de la
   ligne dans la boîte, de 0 à 1) et h (hauteur des lettres, de 0 à 1). */
export async function lireLignes(ctx, img, opts) {
  opts = opts || {};
  const boxes = (await P.detect(ctx.ort, ctx.det, img, 960)).filter(b => b.w > 6 && b.h > 5).slice(0, 24);
  const groupes = P.groupLines(boxes), out = [];
  for (const g of groupes) {
    const morceaux = [];
    for (const b of g.items) {
      const r = await lireMorceau(ctx, P.crop(img, b.x, b.y, b.w, b.h), opts);
      if (r && r.texte) { r.b = b; morceaux.push(r); }
    }
    if (!morceaux.length) continue;
    const textes = morceaux.map(m => m.texte);
    const ligne = {
      text: textes.join(' '), conf: 100 * morceaux.reduce((a, m) => a + m.conf, 0) / morceaux.length, alts: [],
      agree: Math.min.apply(null, morceaux.map(m => m.accord)),
      p: morceaux.reduce((a, m) => a * m.p, 1)
    };
    // autres lectures de la ligne : un morceau hésitant remplacé à la fois, le moins sûr d'abord
    morceaux.map((m, k) => k).sort((a, b) => morceaux[a].p - morceaux[b].p).forEach(k => {
      for (const a of morceaux[k].autres) {
        if (ligne.alts.length >= 2) return;
        const alt = textes.map((t, q) => (q === k ? a.texte : t)).join(' ');
        if (alt !== ligne.text && ligne.alts.indexOf(alt) < 0) ligne.alts.push(alt);
      }
    });
    // les mêmes, plus nombreuses et avec leur probabilité, pour les recoupements à l'échelle du bloc (bloc.mjs)
    ligne.autres = [];
    morceaux.forEach((m, k) => m.autres.forEach(a => ligne.autres.push({ text: textes.map((t, q) => (q === k ? a.texte : t)).join(' '), p: a.p })));
    ligne.autres.sort((a, b) => b.p - a.p); ligne.autres.length = Math.min(ligne.autres.length, 5);
    const x0 = Math.min.apply(null, morceaux.map(m => m.b.cx)), x1 = Math.max.apply(null, morceaux.map(m => m.b.cx + m.b.cw));
    const y0 = Math.min.apply(null, morceaux.map(m => m.b.cy)), y1 = Math.max.apply(null, morceaux.map(m => m.b.cy + m.b.ch));
    ligne.box = { x0: x0 / img.width, y0: y0 / img.height, x1: x1 / img.width, y1: y1 / img.height };
    ligne.h = morceaux.map(m => m.b.ch).sort((a, b) => a - b)[morceaux.length >> 1] / img.height;
    if (opts.detail) ligne.morceaux = morceaux;
    out.push(ligne);
  }
  return out;
}
