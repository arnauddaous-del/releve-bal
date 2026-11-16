/* Le banc de bout en bout sur le bloc d'exemple (photo fabriquée, noms inventés) : décodage, grille, lecture avec
   les modèles de la V1, comparaison au relevé. Prend une dizaine de secondes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));

test('le banc lit le bloc d\'exemple avec la V1', () => {
  const sortie = execFileSync(process.execPath, [path.join(ICI, '..', 'banc.mjs'), '--donnees', path.join(ICI, '..', 'exemple')], { encoding: 'utf8' });
  assert.match(sortie, /Jeu d'essai : 1 blocs, 12 boîtes \(0 manuscrites, 11 imprimées, 1 sans nom/);
  assert.match(sortie, /Grille juste : 1\/1 blocs/);
  const m = /Boîtes justes : [\d,]+ % \((\d+)\/12\)/.exec(sortie);
  assert.ok(m, 'ligne « Boîtes justes » absente');
  assert.ok(+m[1] >= 6, 'moins de 6 boîtes justes sur 12 : ' + m[1]);
  assert.match(sortie, /appartement juste : 100,0 %/);
});
