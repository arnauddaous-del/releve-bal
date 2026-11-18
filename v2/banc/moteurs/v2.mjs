/* Moteur de la V2 pour le banc : les modules de v2/js/moteur/ (ceux que chargera le Worker du téléphone), avec la
   même découpe de la photo en boîtes que la V1. Chaque étape du nouveau moteur est une option : le banc mesure
   les configurations une par une (voir CONFIGS dans banc.mjs). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BalNames } from '../../js/moteur/prenoms.mjs';
import { BalCore as C } from '../../js/moteur/regles.mjs';
import { BalPaddle as P } from '../../js/moteur/lecture.mjs';
import { lireLignes, alphabetPour } from '../../js/moteur/lignes.mjs';
import { creerLexique } from '../../js/moteur/lexique.mjs';
import { lireBloc } from '../../js/moteur/bloc.mjs';
import { estimer, redresserPixels } from '../../js/moteur/redresser.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { dessiner, pixels } from '../image.mjs';
import { avecMemoire } from '../memoire.mjs';

const ort = createRequire(import.meta.url)('onnxruntime-node');
const ICI = path.dirname(fileURLToPath(import.meta.url)), DEPOT = path.resolve(ICI, '..', '..', '..');
const LOCAL = path.join(ICI, '..', 'local');

/* options : socle (lecture de la V1 telle quelle, depuis les modules de la V2), fort ('faible' ou 'tout' : deuxième
   modèle), lexique ('prenoms' ou 'noms'), memoire (garder les calculs des modèles), fils. */
export async function creerV2(options = {}) {
  const fils = options.fils || 1, ocr = path.join(DEPOT, 'ocr'), fichier = n => path.join(ocr, n);
  const session = async (buf, nom, seuil) => {
    const s = await ort.InferenceSession.create(buf, { executionProviders: ['cpu'], intraOpNumThreads: fils, interOpNumThreads: 1 });
    return options.memoire ? avecMemoire(s, nom, path.join(LOCAL, 'memoire'), seuil) : s;
  };
  // pour l'instant les modèles de la V1, lus dans ocr/ (la V2 aura les siens dans v2/modeles/ quand ils changeront)
  const det = await session(fs.readFileSync(fichier('det.wasm')), 'det4', 1e-3);
  const rec = await session(fs.readFileSync(fichier('rec6s.wasm')), 'rec6s', 1e-5);
  const dict = fs.readFileSync(fichier('dict6.txt'), 'utf8').split('\n');
  if (dict[dict.length - 1] === '') dict.pop();
  const avecFort = !!options.fort || !!options.renforcee;
  const fort = avecFort ? await session(Buffer.concat([1, 2, 3].map(i => fs.readFileSync(fichier('rec6m-' + i + '.wasm')))), 'rec6m', 1e-5) : null;
  const alpha = alphabetPour(dict);
  let lexique = null;
  if (options.lexique) {
    const f = path.join(LOCAL, 'noms-famille.txt');
    if (options.lexique === 'noms' && !fs.existsSync(f)) throw new Error('liste des noms de famille absente : ' + f + ' (voir v2/outils/lexique_noms.py)');
    lexique = creerLexique(BalNames, options.lexique === 'noms' ? fs.readFileSync(f, 'utf8') : '', options.reglagesLexique);
  }
  const ctx = { ort: ort, det: det, rec: rec, fort: fort, alpha: alpha };

  const telecharge = ['ocr/ort.wasm.min.js', 'ocr/ort-wasm-simd.wasm', 'ocr/det.wasm', 'ocr/rec6s.wasm', 'ocr/dict6.txt']
    .concat(avecFort ? ['ocr/rec6m-1.wasm', 'ocr/rec6m-2.wasm', 'ocr/rec6m-3.wasm'] : []);
  let poids = telecharge.reduce((n, f) => n + fs.statSync(path.join(DEPOT, f)).size, 0);
  for (const f of ['prenoms.mjs', 'regles.mjs', 'lecture.mjs', 'lignes.mjs', 'ctc.mjs', 'lexique.mjs', 'bloc.mjs']) poids += fs.statSync(path.join(DEPOT, 'v2', 'js', 'moteur', f)).size;
  if (options.lexique === 'noms') poids += fs.statSync(path.join(LOCAL, 'noms-famille.txt')).size;

  // même découpe que la V1 (moteurs/v1.mjs), avec les fonctions de v2/js/moteur/regles.mjs
  function grille(photo, forcee, petite) {
    const k = Math.min(1, 4200 / Math.max(photo.width, photo.height));
    let full = k === 1 ? photo.canvas : dessiner(photo.canvas, 0, 0, photo.width, photo.height, Math.round(photo.width * k), Math.round(photo.height * k));
    const reduire = c => pixels(dessiner(c, 0, 0, c.width, c.height, 700, Math.max(1, Math.round(c.height * 700 / c.width)), 'high'));
    let small = petite || reduire(full), redresse = null;
    // photo prise de biais : redressée avant le comptage et la lecture (redresser.mjs)
    if (options.redresser && !petite) {
      const r = estimer(small);
      if (r) {
        const red = redresserPixels(pixels(full), r, 4200), c = createCanvas(red.image.width, red.image.height), g = c.getContext('2d'), id = g.createImageData(c.width, c.height);
        id.data.set(red.image.data); g.putImageData(id, 0, 0);
        full = c; small = reduire(full); redresse = r.angle;
      }
    }
    const a = C.autoCount(small);
    let g = C.uniformGrid(a.cols, a.rows, a.frame);
    if (a.dividers && a.dividers.length === a.cols - 1) g.cols = a.dividers;
    let grid = C.fitGrid(small, g, a.dividers ? 'rows' : 'detect');
    const auto = { cols: a.cols, rows: a.rows };
    if (forcee && (forcee.cols !== a.cols || forcee.rows !== a.rows)) grid = C.fitGrid(small, C.uniformGrid(forcee.cols, forcee.rows, grid.frame), 'detect');
    return { full: full, grid: grid, auto: auto, cols: grid.cols.length + 1, rows: grid.rows[0].length + 1, redresse: redresse };
  }

  async function lignesDeCase(full, c) {
    const FW = full.width, FH = full.height;
    const cx = c.x0 * FW, cy = c.y0 * FH, cw = (c.x1 - c.x0) * FW, ch = (c.y1 - c.y0) * FH;
    const k1 = Math.min(1400 / Math.max(cw, ch), Math.max(1, 700 / Math.max(cw, ch)));
    const cc = dessiner(full, cx, cy, cw, ch, Math.max(1, Math.round(cw * k1)), Math.max(1, Math.round(ch * k1)), 'high');
    const t0 = performance.now(), img = pixels(cc);
    const lines = options.socle
      ? await P.readLines(ort, det, rec, img, dict, { assist: fort ? { sess: fort, dict: dict } : null, enhance: true })
      : await lireLignes(ctx, img, { fort: options.fort || null, lexique: lexique, lexiquePartout: options.lexiquePartout, poidsLexique: options.poidsLexique, largeur: options.largeur, detail: options.detail });
    return { lines: lines, ms: performance.now() - t0, image: cc };
  }

  function interpreter(c, lu, p, verifier) {
    const lines = lu.lines, name = p.names.join('\n'), nothing = !name && !p.apt;
    const doubt = lines.some(l => l.alts && l.alts.length && l.conf < 80);
    return {
      r: c.r, c: c.c, name: name, apt: p.apt, pub: p.pub, raw: p.raw, conf: p.conf,
      empty: nothing && !p.raw, check: (nothing && !!lines.length) || (!nothing && (p.conf < 75 || doubt)) || !!verifier || !!p.hors, ms: lu.ms, image: lu.image, lines: lines
    };
  }

  /* Avec --memoire, les lignes lues sur une photo sont gardées dans local/lignes/ : changer une règle
     d'interprétation (regles.mjs, bloc.mjs) se mesure alors sans relire les photos. La clé tient compte des options
     de lecture et du contenu des modules de lecture. */
  const cleLecture = crypto.createHash('sha1').update(JSON.stringify([options.redresser, options.socle, options.fort, options.lexique, options.reglagesLexique, options.lexiquePartout, options.poidsLexique, options.largeur, options.poidsFort]))
    .update(['lecture.mjs', 'lignes.mjs', 'ctc.mjs', 'lexique.mjs', 'prenoms.mjs', 'redresser.mjs'].map(f => fs.readFileSync(path.join(DEPOT, 'v2', 'js', 'moteur', f), 'utf8')).join('')).digest('hex').slice(0, 12);

  async function lirePhoto(photo, opt = {}) {
    const memo = options.memoire && !opt.garderImages && !opt.petite && opt.cle
      ? path.join(LOCAL, 'lignes', cleLecture, opt.cle.replace(/[^A-Za-z0-9_.-]/g, '_') + (opt.grille ? '-' + opt.grille.cols + 'x' + opt.grille.rows : '') + '.json') : null;
    let g, cases, lus, msGrille = 0;
    if (memo && fs.existsSync(memo)) {
      const m = JSON.parse(fs.readFileSync(memo, 'utf8'));
      g = m.g; cases = m.cases; lus = m.lus;
    } else {
      const t0 = performance.now();
      g = grille(photo, opt.grille, opt.petite); msGrille = performance.now() - t0;
      cases = C.cells(g.grid).filter(c => !c.off); lus = [];
      for (const c of cases) {
        lus.push(await lignesDeCase(g.full, c));
        if (opt.surBoite) opt.surBoite(lus.length, cases.length);
      }
      if (memo) {
        fs.mkdirSync(path.dirname(memo), { recursive: true });
        fs.writeFileSync(memo, JSON.stringify({ g: { cols: g.cols, rows: g.rows, auto: g.auto }, cases: cases.map(c => ({ r: c.r, c: c.c })), lus: lus.map(l => ({ lines: l.lines, ms: l.ms })) }));
      }
    }
    let boites;
    if (options.bloc) { const accord = lireBloc(lus, C.parseLabel); boites = cases.map((c, i) => interpreter(c, lus[i], accord[i].p, accord[i].verifier)); }
    else boites = cases.map((c, i) => interpreter(c, lus[i], C.parseLabel(lus[i].lines, options.regles || null), false));
    for (const b of boites) { if (!opt.garderImages) delete b.image; if (!opt.garderLignes) delete b.lines; }
    return { cols: g.cols, rows: g.rows, auto: g.auto, boites: boites, msGrille: msGrille, msLecture: boites.reduce((n, b) => n + b.ms, 0) };
  }

  return { nom: options.nom || 'V2', poids: poids, lirePhoto: lirePhoto };
}
