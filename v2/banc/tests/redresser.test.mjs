import test from 'node:test';
import assert from 'node:assert/strict';
import { homographie, inverse, appliquer, deformer, estimer, redresserPixels } from '../../js/moteur/redresser.mjs';

// un « bloc » dessiné : 3 colonnes x 4 rangées de portes grises sur un mur clair
function bloc(W, H) {
  const d = new Uint8ClampedArray(W * H * 4).fill(235);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x - 0.15 * W) / (0.7 * W), v = (y - 0.1 * H) / (0.8 * H), o = (y * W + x) * 4;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const joint = Math.abs(u * 3 - Math.round(u * 3)) < 0.02 || Math.abs(v * 4 - Math.round(v * 4)) < 0.02;
    const g = joint ? 40 : 150;
    d[o] = d[o + 1] = d[o + 2] = g;
  }
  return { data: d, width: W, height: H };
}

test('homographie : les 4 points vont où il faut, l\'inverse revient', () => {
  const src = [[0, 0], [100, 0], [100, 80], [0, 80]], dst = [[10, 5], [95, 12], [90, 85], [3, 70]];
  const H = homographie(src, dst), I = inverse(H);
  src.forEach((p, k) => {
    const q = appliquer(H, p[0], p[1]); assert.ok(Math.hypot(q[0] - dst[k][0], q[1] - dst[k][1]) < 1e-6);
    const r = appliquer(I, q[0], q[1]); assert.ok(Math.hypot(r[0] - p[0], r[1] - p[1]) < 1e-6);
  });
});

test('photo droite : rien à redresser', () => {
  assert.equal(estimer(bloc(700, 900)), null);
});

test('photo penchée de 6° : repérée et remise droite', () => {
  const W = 700, H = 900, img = bloc(W, H), a = 6 * Math.PI / 180;
  const q = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => { const u = (x - W / 2) * 0.85, v = (y - H / 2) * 0.85; return [W / 2 + u * Math.cos(a) - v * Math.sin(a), H / 2 + u * Math.sin(a) + v * Math.cos(a)]; });
  const G = homographie([[0, 0], [W, 0], [W, H], [0, H]], q), penchee = deformer(img, inverse(G), W, H, 'bord');
  const r = estimer(penchee);
  assert.ok(r, 'redressement attendu');
  assert.ok(Math.abs(r.angle - 6) < 1, 'angle trouvé : ' + r.angle);
  // le coin haut-gauche du bloc, une fois redressé, est de nouveau à la verticale du coin bas-gauche
  const red = redresserPixels(penchee, r), P = p => appliquer(red.H, ...appliquer(G, p[0], p[1]));
  const hg = P([0.15 * W, 0.1 * H]), bg = P([0.15 * W, 0.9 * H]);
  assert.ok(Math.abs(hg[0] - bg[0]) < 0.01 * red.image.width, 'bord gauche vertical : ' + hg[0].toFixed(1) + ' / ' + bg[0].toFixed(1));
});
