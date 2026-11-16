/* Moteur « V1 telle quelle » pour le banc : les fonctions de la V1 (chargées depuis ses fichiers) et les mêmes
   étapes que sa page, dans le même ordre. Les numéros de ligne renvoient à index.html de la V1 (état v1-finale).
   Seules différences avec le téléphone : onnxruntime-node au lieu d'onnxruntime-web, et le décodage de la photo.
   parite-v1.mjs mesure l'écart avec la vraie page dans Chrome. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chargerV1 } from '../v1/charger.mjs';
import { dessiner, pixels } from '../image.mjs';

const ort = createRequire(import.meta.url)('onnxruntime-node');

export async function creerV1(options = {}) {
  const renforcee = !!options.renforcee, fils = options.fils || 1;
  const v1 = chargerV1(), C = v1.BalCore, P = v1.BalPaddle, ocr = path.join(v1.racine, 'ocr');
  const fichier = n => path.join(ocr, n);
  const session = buf => ort.InferenceSession.create(buf, { executionProviders: ['cpu'], intraOpNumThreads: fils, interOpNumThreads: 1 });
  // mêmes modèles que le Worker (bal-worker.js, message « init ») ; les .wasm de ocr/ sont des modèles ONNX
  const det = await session(fs.readFileSync(fichier('det.wasm')));
  const rec = await session(fs.readFileSync(fichier('rec6s.wasm')));
  const dict = fs.readFileSync(fichier('dict6.txt'), 'utf8').split('\n');
  if (dict[dict.length - 1] === '') dict.pop();
  let assist = null;
  if (renforcee) assist = { sess: await session(Buffer.concat([1, 2, 3].map(i => fs.readFileSync(fichier('rec6m-' + i + '.wasm'))))), dict: dict };

  // ce que le téléphone télécharge avant la première lecture : la coquille et les modèles de sw.js
  const telecharge = ['index.html', 'ocr/ort.wasm.min.js', 'ocr/bal-worker.js', 'ocr/ort-wasm-simd.wasm', 'ocr/det.wasm', 'ocr/rec6s.wasm', 'ocr/dict6.txt']
    .concat(renforcee ? ['ocr/rec6m-1.wasm', 'ocr/rec6m-2.wasm', 'ocr/rec6m-3.wasm'] : []);
  const poids = telecharge.reduce((n, f) => n + fs.statSync(path.join(v1.racine, f)).size, 0);

  /* Grille : comme à l'ouverture d'une photo en mode « Automatique » (loadPhoto l. 1721, autoGrid l. 1768).
     forcee = { cols, rows } : comme quand l'utilisateur change ensuite les nombres (countsChanged l. 1581, detectGrid l. 1778). */
  function grille(photo, forcee, petite) {
    const k = Math.min(1, 4200 / Math.max(photo.width, photo.height));
    const full = k === 1 ? photo.canvas : dessiner(photo.canvas, 0, 0, photo.width, photo.height, Math.round(photo.width * k), Math.round(photo.height * k));
    // petite : l'image réduite calculée ailleurs (par Chrome, dans parite-v1.mjs) pour comparer à grille égale
    const small = petite || pixels(dessiner(full, 0, 0, full.width, full.height, 700, Math.max(1, Math.round(full.height * 700 / full.width)), 'high'));
    const a = C.autoCount(small);
    let g = C.uniformGrid(a.cols, a.rows, a.frame);
    if (a.dividers && a.dividers.length === a.cols - 1) g.cols = a.dividers;
    let grid = C.fitGrid(small, g, a.dividers ? 'rows' : 'detect');
    const auto = { cols: a.cols, rows: a.rows };
    if (forcee && (forcee.cols !== a.cols || forcee.rows !== a.rows)) {
      grid = C.fitGrid(small, C.uniformGrid(forcee.cols, forcee.rows, grid.frame), 'detect');
    }
    return { full: full, grid: grid, auto: auto, cols: grid.cols.length + 1, rows: grid.rows[0].length + 1 };
  }

  /* Une boîte : readCell (l. 1995) puis la mise en liste du bouton « Lire les étiquettes » (l. 2076). */
  async function lireCase(full, c) {
    const FW = full.width, FH = full.height;
    const cx = c.x0 * FW, cy = c.y0 * FH, cw = (c.x1 - c.x0) * FW, ch = (c.y1 - c.y0) * FH;
    const k1 = Math.min(1400 / Math.max(cw, ch), Math.max(1, 700 / Math.max(cw, ch)));
    const cc = dessiner(full, cx, cy, cw, ch, Math.max(1, Math.round(cw * k1)), Math.max(1, Math.round(ch * k1)), 'high');
    const t0 = performance.now();
    const lines = await P.readLines(ort, det, rec, pixels(cc), dict, { assist: assist, enhance: true });
    const p = C.parseLabel(lines), ms = performance.now() - t0;
    const name = p.names.join('\n'), nothing = !name && !p.apt;
    const doubt = lines.some(l => l.alts && l.alts.length && l.conf < 80);
    return {
      r: c.r, c: c.c, name: name, apt: p.apt, pub: p.pub, raw: p.raw, conf: p.conf,
      empty: nothing && !p.raw, check: (nothing && !!lines.length) || (!nothing && (p.conf < 75 || doubt)),
      ms: ms, image: cc
    };
  }

  /* Lit une photo. Renvoie les boîtes dans l'ordre des rangées (sens « horizontal ») ; ordonner() donne l'autre sens. */
  async function lirePhoto(photo, opt = {}) {
    const t0 = performance.now(), g = grille(photo, opt.grille, opt.petite), msGrille = performance.now() - t0;
    const cases = C.cells(g.grid).filter(c => !c.off), boites = [];
    for (const c of cases) {
      const b = await lireCase(g.full, c);
      if (!opt.garderImages) delete b.image;
      boites.push(b);
      if (opt.surBoite) opt.surBoite(boites.length, cases.length);
    }
    return { cols: g.cols, rows: g.rows, auto: g.auto, boites: boites, msGrille: msGrille, msLecture: boites.reduce((n, b) => n + b.ms, 0) };
  }

  return { nom: renforcee ? 'V1 + lecture renforcée' : 'V1', poids: poids, lirePhoto: lirePhoto };
}

/* Ordre de flashage : horizontal = rangée par rangée, vertical = colonne par colonne (ordered(), l. 1791). */
export function ordonner(boites, sens) {
  return sens === 'v' ? boites.slice().sort((a, b) => a.c - b.c || a.r - b.r) : boites.slice().sort((a, b) => a.r - b.r || a.c - b.c);
}
