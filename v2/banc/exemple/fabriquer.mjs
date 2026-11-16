/* Fabrique le bloc d'exemple du banc : une fausse photo de boîtes aux lettres (noms inventés), son relevé « corrigé »
   et son classement manuscrit / imprimé. Sert à essayer le banc et à le tester sans aucune vraie donnée.
   Usage : node exemple/fabriquer.mjs   (le résultat est déjà dans le dépôt ; à relancer seulement pour le modifier) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { enregistrerJPEG } from '../image.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url)), BLOC = path.join(ICI, 'residence-inventee');
// une boîte : lignes de l'étiquette, numéro d'appartement, autocollant STOP PUB
const BOITES = [
  { lignes: ['MARTINEAU Paul'], apt: '11' }, { lignes: ['Mme GARNIER Lucie'], apt: '12', stop: true }, { lignes: ['M FONTAINE Hugo', 'Mme FONTAINE Clara'], apt: '13' },
  { lignes: ['ROUSSEL Emma'], apt: '21', stop: true }, { lignes: [] }, { lignes: ['LEMOINE Nicolas', 'LEMOINE Sophie'], apt: '23' },
  { lignes: ['Mlle BRUNET Manon'], apt: '31' }, { lignes: ['CHEVALIER Louis'], apt: '32', stop: true }, { lignes: ['M et Mme PERRIN Julien'], apt: '33' },
  { lignes: ['GAUTHIER Alice'], apt: '41' }, { lignes: ['MARCHAND Thomas', 'DUVAL Camille'], apt: '42' }, { lignes: ['Mme RENARD Juliette'], apt: '43', stop: true }
];
const COLS = 3, RANGS = 4, W = 2400, H = 3200;
const c = createCanvas(W, H), g = c.getContext('2d');
// mur
g.fillStyle = '#b6aa98'; g.fillRect(0, 0, W, H);
let graine = 7; const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 9000; i++) { g.fillStyle = 'rgba(' + (alea() < 0.5 ? '255,255,255' : '0,0,0') + ',0.05)'; g.fillRect(alea() * W, alea() * H, 3 + alea() * 5, 3 + alea() * 5); }
// meuble
const X0 = 260, Y0 = 520, X1 = 2140, Y1 = 2720, JOINT = 14;
g.fillStyle = '#1b1f23'; g.fillRect(X0 - 22, Y0 - 22, X1 - X0 + 44, Y1 - Y0 + 44);
const lw = (X1 - X0 - JOINT * (COLS - 1)) / COLS, lh = (Y1 - Y0 - JOINT * (RANGS - 1)) / RANGS;
BOITES.forEach((b, k) => {
  const x = X0 + (k % COLS) * (lw + JOINT), y = Y0 + Math.floor(k / COLS) * (lh + JOINT);
  const d = g.createLinearGradient(0, y, 0, y + lh); d.addColorStop(0, '#cfd4d8'); d.addColorStop(1, '#bcc2c7');
  g.fillStyle = d; g.fillRect(x, y, lw, lh);
  g.fillStyle = '#23282d'; g.fillRect(x + lw * 0.34, y + 40, lw * 0.32, 26);                     // fente
  g.fillStyle = '#2b3036'; g.beginPath(); g.arc(x + lw - 60, y + lh - 70, 20, 0, 6.3); g.fill();  // serrure
  if (b.lignes.length) {
    const col = k % COLS, rang = Math.floor(k / COLS);
    const ex = x + lw * 0.05 + [0, 46, 18, 64][rang], ey = y + [128, 196, 162][col], ew = lw * 0.78, eh = 96 + 64 * b.lignes.length;
    g.fillStyle = '#fbfbf8'; g.fillRect(ex, ey, ew, eh); g.strokeStyle = '#8a9096'; g.lineWidth = 2; g.strokeRect(ex, ey, ew, eh);
    g.fillStyle = '#15191d'; g.textBaseline = 'middle'; g.font = 'bold 46px "DejaVu Sans", Arial, sans-serif';
    b.lignes.forEach((t, i) => g.fillText(t, ex + 26, ey + 52 + 64 * i));
    g.font = '36px "DejaVu Sans", Arial, sans-serif'; g.fillText('Apt ' + b.apt, ex + 26, ey + 52 + 64 * b.lignes.length);
  }
  if (b.stop) {
    const sx = x + lw * 0.08 + [30, 0, 60][k % COLS], sy = y + lh - [150, 128, 172][k % COLS], sw = 330, sh = 86;
    g.fillStyle = '#ffffff'; g.fillRect(sx, sy, sw, sh); g.strokeStyle = '#c62828'; g.lineWidth = 6; g.strokeRect(sx, sy, sw, sh);
    g.fillStyle = '#c62828'; g.font = 'bold 50px "DejaVu Sans", Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('STOP PUB', sx + 26, sy + sh / 2 + 2);
  }
});
fs.mkdirSync(BLOC, { recursive: true });
await enregistrerJPEG(c, path.join(BLOC, 'photo.jpg'), 86);
const lignes = BOITES.map((b, k) => [k + 1, b.lignes.length ? b.lignes.join(' / ') : 'BAL Sans Nom', b.apt || '', b.stop ? 'STOP PUB' : 'OK PUB'].join(';'));
fs.writeFileSync(path.join(BLOC, 'releve.csv'), '﻿' + ['Tournée : 12', 'Lieu : Résidence inventée, 1 rue de l\'Exemple', 'Nombre de PRE : ' + BOITES.length, '', 'ordre_flashage;noms_prenoms;numero_appartement;pub'].concat(lignes).join('\r\n'));
fs.writeFileSync(path.join(BLOC, 'ecriture.csv'), ['ordre;type'].concat(BOITES.map((b, k) => (k + 1) + ';' + (b.lignes.length ? 'I' : 'V'))).join('\n') + '\n');
// le dessin n'a pas le relief d'un vrai meuble : le comptage automatique s'y trompe, on impose donc 3 colonnes x 4 rangées
fs.writeFileSync(path.join(BLOC, 'bloc.json'), JSON.stringify({ sens: 'h', grilles: { 'photo.jpg': COLS + 'x' + RANGS } }, null, 2) + '\n');
console.log('exemple écrit dans', BLOC);
