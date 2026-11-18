import test from 'node:test';
import assert from 'node:assert/strict';
import { BalCore as C } from '../../js/moteur/regles.mjs';

// bloc de 4 colonnes x 5 rangées de portes sombres, joints clairs ; dans la 2e colonne, une étiquette blanche barrée
// d'une bande noire (comme un scotch) près du haut de la première porte
function bloc(W, H) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, u = (x - 0.05 * W) / (0.9 * W), v = (y - 0.1 * H) / (0.8 * H);
    let g = 70;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      const ju = Math.abs(u * 4 - Math.round(u * 4)) < 0.012, jv = Math.abs(v * 5 - Math.round(v * 5)) < 0.01;
      g = ju || jv ? 200 : 25;
      // étiquette : de 0.29 à 0.46 de la 2e colonne, de 0.06 à 0.12 du bloc ; bande noire à 0.095
      if (u > 0.29 && u < 0.46 && v > 0.06 && v < 0.12) g = Math.abs(v - 0.095) < 0.006 ? 10 : 245;
    }
    d[o] = d[o + 1] = d[o + 2] = g; d[o + 3] = 255;
  }
  return { data: d, width: W, height: H };
}

test('grille : un faux joint dans une seule colonne est recalé sur les autres (V2)', () => {
  const s = bloc(700, 1000), a = C.autoCount(s);
  assert.equal(a.cols, 4); assert.equal(a.rows, 5);
  const g = C.uniformGrid(a.cols, a.rows, a.frame);
  if (a.dividers && a.dividers.length === a.cols - 1) g.cols = a.dividers;
  const v2 = C.fitGrid(s, g, a.dividers ? 'rows' : 'detect', { v2: true });
  const premier = v2.rows.map(r => r[0]), med = premier.slice().sort((x, y) => x - y)[2];
  premier.forEach((y, c) => assert.ok(Math.abs(y - med) < 0.01, 'colonne ' + c + ' : ' + y.toFixed(3) + ' / ' + med.toFixed(3)));
});

test('grille : sans option, le calcul de la V1 est inchangé', () => {
  const s = bloc(700, 1000), a = C.autoCount(s), g = () => { const x = C.uniformGrid(a.cols, a.rows, a.frame); if (a.dividers && a.dividers.length === a.cols - 1) x.cols = a.dividers; return x; };
  const v1 = C.fitGrid(s, g(), 'detect'), v1b = C.fitGrid(s, g(), 'detect', undefined);
  assert.deepEqual(v1.rows, v1b.rows);
});
