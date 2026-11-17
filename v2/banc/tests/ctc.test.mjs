import test from 'node:test';
import assert from 'node:assert/strict';
import { creerAlphabet, matrice, glouton, faisceau, vraisemblance, enSuite, probabilites } from '../../js/moteur/ctc.mjs';

const dict = ['A', 'B', 'C'];             // classes 1 à 3 ; classe 4 = espace
const alpha = creerAlphabet(dict.concat([' ']));
function tableau(lignes) {                // lignes : probabilités [rien, A, B, C, espace] par pas
  const T = lignes.length, C = 5, d = new Float32Array(T * C);
  lignes.forEach((l, t) => l.forEach((v, k) => { d[t * C + k] = v; }));
  return matrice(d, T, C, alpha);
}
// somme brute sur tous les alignements, pour vérifier le calcul exact
function brute(m, texte) {
  const A = m.A, T = m.T; let tot = 0;
  const rec = (t, prec, suite, p) => {
    if (t === T) {
      let s = '', last = -1;
      for (const a of suite) { if (a !== 0 && a !== last) s += alpha.cars[a]; last = a; }
      if (s === texte) tot += p; return;
    }
    for (let a = 0; a < A; a++) rec(t + 1, a, suite.concat(a), p * Math.exp(m.L[t * A + a]));
  };
  rec(0, -1, [], 1);
  return Math.log(tot);
}

test('vraisemblance exacte = somme sur tous les alignements', () => {
  const m = tableau([[0.5, 0.3, 0.1, 0.05, 0.05], [0.2, 0.5, 0.2, 0.05, 0.05], [0.6, 0.1, 0.2, 0.05, 0.05], [0.1, 0.1, 0.6, 0.1, 0.1]]);
  for (const t of ['A', 'AB', 'AA', 'B', 'BA', 'ABC']) assert.ok(Math.abs(vraisemblance(m, enSuite(t, alpha)) - brute(m, t)) < 1e-4, t);
});

test('lecture au plus probable : celle de la V1', () => {
  const m = tableau([[0.1, 0.8, 0.05, 0.03, 0.02], [0.1, 0.8, 0.05, 0.03, 0.02], [0.9, 0.05, 0.03, 0.01, 0.01], [0.1, 0.8, 0.05, 0.03, 0.02], [0.1, 0.05, 0.8, 0.03, 0.02]]);
  const g = glouton(m, alpha);
  assert.equal(g.texte, 'AAB');
  assert.ok(Math.abs(g.conf - 0.8) < 1e-6);
});

test('le faisceau retrouve la lecture la plus probable dans son ensemble', () => {
  // chaque pas préfère « rien », mais « A » cumulé sur trois pas l'emporte sur le texte vide
  const m = tableau([[0.45, 0.4, 0.05, 0.05, 0.05], [0.45, 0.4, 0.05, 0.05, 0.05], [0.45, 0.4, 0.05, 0.05, 0.05]]);
  assert.equal(glouton(m, alpha).texte, '');
  const f = faisceau(m, alpha, 8, 4);
  assert.equal(f[0].texte, 'A');
  assert.ok(f[0].lp >= brute(m, 'A') - 1e-4);   // « A », « A » avec une espace au bord : même texte, notes additionnées
});

test('probabilités : total de 1', () => {
  const p = probabilites([-1, -2, -3]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b) - 1) < 1e-9 && p[0] > p[1] && p[1] > p[2]);
});
