/* Imprim Bal 2 — banc du cadrage : le comptage des boîtes retrouve-t-il le bon nombre quand la photo est prise de biais ?
   Chaque photo des blocs est lue telle quelle, puis déformée comme une photo prise de biais (téléphone penché,
   en contre-plongée, de côté, combinés). On compte les boîtes sans et avec redressement (js/moteur/redresser.mjs).
   Juste = nombre de cases actives égal au nombre de boîtes du relevé.

   node cadrage.mjs [--donnees dossier] [--photos dossier_pour_voir_les_grilles] */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { BalCore as C } from '../js/moteur/regles.mjs';
import { estimer, raison, redresserPixels, homographie, inverse, deformer, couleurBord } from '../js/moteur/redresser.mjs';
import { ouvrirPhoto, dessiner, pixels } from './image.mjs';
import { trouverBlocs, lireReleve } from './verite.mjs';

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DONNEES = path.resolve(opt('--donnees', 'donnees')), VOIR = opt('--photos', null);
if (VOIR) fs.mkdirSync(VOIR, { recursive: true });

/* Déformations : où vont les coins de la photo (en part de la largeur et de la hauteur). La photo d'origine reste
   entière dans le cadre (rien n'est coupé) ; le reste est rempli de la couleur du bord. */
const DEFORMATIONS = {
  'droite': null,
  // la photo d'origine reste entière dans le cadre ; autour, ses pixels de bord prolongés (aucune ligne nette)
  'penchée 4°': { rot: 4 }, 'penchée -8°': { rot: -8 },
  'contre-plongée': { haut: 0.10 }, 'plongée': { bas: 0.10 },
  'de côté': { gauche: 0.10 }, 'de côté, fort': { droite: 0.18 },
  'penchée et de biais': { rot: 5, haut: 0.08, gauche: 0.06 }
};
function coinsDeformes(d) {
  // coins dans l'ordre haut-gauche, haut-droite, bas-droite, bas-gauche, en coordonnées 0..1, réduits de 12 %
  let c = [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (d.haut) { c[0][0] += d.haut; c[1][0] -= d.haut; }
  if (d.bas) { c[3][0] += d.bas; c[2][0] -= d.bas; }
  if (d.gauche) { c[0][1] += d.gauche; c[3][1] -= d.gauche; }
  if (d.droite) { c[1][1] += d.droite; c[2][1] -= d.droite; }
  const a = (d.rot || 0) * Math.PI / 180;
  return c.map(([x, y]) => { const u = (x - 0.5) * 0.88, v = (y - 0.5) * 0.88; return [0.5 + u * Math.cos(a) - v * Math.sin(a), 0.5 + u * Math.sin(a) + v * Math.cos(a)]; });
}
function versCanvas(img) {
  const c = createCanvas(img.width, img.height), g = c.getContext('2d'), id = g.createImageData(img.width, img.height);
  id.data.set(img.data); g.putImageData(id, 0, 0); return c;
}
function petite(canvas) { return pixels(dessiner(canvas, 0, 0, canvas.width, canvas.height, 700, Math.max(1, Math.round(canvas.height * 700 / canvas.width)), 'high')); }
function compter(small) {
  const a = C.autoCount(small);
  const g = C.uniformGrid(a.cols, a.rows, a.frame);
  if (a.dividers && a.dividers.length === a.cols - 1) g.cols = a.dividers;
  const grid = C.fitGrid(small, g, a.dividers ? 'rows' : 'detect', process.env.V1 ? undefined : { v2: true });
  return { n: C.cells(grid).filter(c => !c.off).length, cols: grid.cols.length + 1, rows: grid.rows[0].length + 1, grid: grid };
}
function dessinerGrille(small, grid, fichier) {
  const c = versCanvas(small), g = c.getContext('2d');
  g.strokeStyle = '#ff2d55'; g.lineWidth = 2;
  C.cells(grid).forEach(k => { if (!k.off) g.strokeRect(k.x0 * small.width, k.y0 * small.height, (k.x1 - k.x0) * small.width, (k.y1 - k.y0) * small.height); });
  fs.writeFileSync(fichier, c.toBuffer('image/jpeg', 80));
}

const SEUL = opt('--bloc', '');
const blocs = trouverBlocs(DONNEES).filter(b => !b.probleme && b.photos.length === 1 && b.csv && b.nom.includes(SEUL));
const res = {};
Object.keys(DEFORMATIONS).forEach(k => { res[k] = { sans: 0, avec: 0, redresse: 0, n: 0 }; });
for (const b of blocs) {
  const vrai = lireReleve(fs.readFileSync(b.csv, 'utf8')).boites.length;
  const photo = await ouvrirPhoto(b.photos[0]);
  const k = 1400 / photo.width, travail = pixels(dessiner(photo.canvas, 0, 0, photo.width, photo.height, 1400, Math.round(photo.height * k), 'high'));
  const ligne = [];
  for (const [nom, d] of Object.entries(DEFORMATIONS)) {
    let img = travail;
    if (d) {
      const W = travail.width, H = travail.height, q = coinsDeformes(d).map(([x, y]) => [x * W, y * H]);
      const G = homographie([[0, 0], [W, 0], [W, H], [0, H]], q);
      img = deformer(travail, inverse(G), W, H, 'bord');
    }
    const c0 = versCanvas(img), s0 = petite(c0), sans = compter(s0);
    const r = estimer(s0);
    let avec = sans, s1 = s0;
    if (r) { const red = redresserPixels(img, r, 1600); s1 = petite(versCanvas(red.image)); avec = compter(s1); }
    const e = res[nom]; e.n++; if (sans.n === vrai) e.sans++; if (avec.n === vrai) e.avec++; if (r) e.redresse++;
    if (r && process.env.MESURES) console.log('   ' + nom + ' angle ' + r.angle.toFixed(1) + ' cp ' + r.contrePlongee.toFixed(2) + ' côté ' + r.cote.toFixed(2) + ' ' + (sans.n === vrai ? 'sansOK' : 'sansKO') + ' ' + (avec.n === vrai ? 'avecOK' : 'avecKO'));
    ligne.push(nom + ' ' + (sans.n === vrai ? 'ok' : sans.cols + 'x' + sans.rows) + '→' + (r ? (avec.n === vrai ? 'ok' : avec.cols + 'x' + avec.rows) : '=' + (raison && raison !== 'déjà droite' ? '(' + raison + ')' : '')));
    if (VOIR) { dessinerGrille(s0, sans.grid, path.join(VOIR, b.nom + '-' + nom.replace(/[^a-z0-9]+/gi, '_') + '-sans.jpg')); if (r) dessinerGrille(s1, avec.grid, path.join(VOIR, b.nom + '-' + nom.replace(/[^a-z0-9]+/gi, '_') + '-avec.jpg')); }
  }
  console.log(b.nom + ' (' + vrai + ' boîtes) : ' + ligne.join(' | '));
}
console.log('\nGrille juste (sans redressement → avec), sur ' + blocs.length + ' photos :');
let ts = 0, ta = 0, tn = 0;
for (const [nom, e] of Object.entries(res)) {
  console.log('  ' + nom.padEnd(22) + String(e.sans).padStart(3) + ' → ' + String(e.avec).padStart(3) + ' / ' + e.n + '   (redressée ' + e.redresse + ' fois)');
  if (nom !== 'droite') { ts += e.sans; ta += e.avec; tn += e.n; }
}
console.log('  ' + 'photos de biais'.padEnd(22) + String(ts).padStart(3) + ' → ' + String(ta).padStart(3) + ' / ' + tn);
