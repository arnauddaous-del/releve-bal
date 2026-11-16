/* Tests de la lecture des relevés corrigés (CSV exporté par la V1), sur des noms inventés. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lireReleve, lireEcriture, grilleImposee, trouverBlocs } from '../verite.mjs';

const CSV = '﻿Tournée : 12\r\nLieu : Résidence inventée; bât. A\r\nNombre de PRE : 3\r\n\r\nordre_flashage;noms_prenoms;numero_appartement;pub\r\n' +
  '1;DUPONT Marie / DUPONT Jean;C02;STOP PUB\r\n2;BAL Sans Nom;;OK PUB\r\n3;"MARTIN; Pierre";A12;OK PUB\r\n';

test('CSV de la V1 : titres, en-tête, boîtes', () => {
  const r = lireReleve(CSV);
  assert.equal(r.tournee, '12'); assert.equal(r.pre, 3); assert.equal(r.boites.length, 3);
  assert.deepEqual(r.boites[0], { ordre: 1, noms: ['DUPONT Marie', 'DUPONT Jean'], apt: 'C02', pub: 'STOP PUB' });
  assert.deepEqual(r.boites[1].noms, []);
  assert.deepEqual(r.boites[2].noms, ['MARTIN; Pierre']);
});

test('CSV avec virgules et colonne « lieu » en premier', () => {
  const r = lireReleve('Nombre de PRE : 1\n\nlieu,ordre_flashage,noms_prenoms,numero_appartement,pub\n"Résidence, bât. B",1,ROUX Léa,7,OK PUB\n');
  assert.deepEqual(r.boites, [{ ordre: 1, noms: ['ROUX Léa'], apt: '7', pub: 'OK PUB' }]);
});

test('un fichier qui n\'est pas un export Imprim Bal est refusé', () => {
  assert.throws(() => lireReleve('nom;prenom\nDupont;Marie\n'), /ordre_flashage/);
});

test('classement manuscrit / imprimé, grille imposée', () => {
  const m = lireEcriture('ordre;type\n1;M\n2;i\n3;V\n4;?\n');
  assert.deepEqual([...m], [[1, 'M'], [2, 'I'], [3, 'V']]);
  assert.deepEqual(grilleImposee('6x4'), { cols: 6, rows: 4 });
  assert.deepEqual(grilleImposee(' 3 × 5 '), { cols: 3, rows: 5 });
  assert.equal(grilleImposee('six'), null);
});

test('blocs : un dossier par bloc, ou une photo et un CSV du même nom', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-'));
  fs.mkdirSync(path.join(d, '02-deux-photos'));
  for (const f of ['02-deux-photos/10.jpg', '02-deux-photos/2.jpg', '02-deux-photos/releve.csv', '02-deux-photos/ecriture.csv', '01-seul.jpg', '01-seul.csv', '03-sans-csv.jpg']) fs.writeFileSync(path.join(d, f), '');
  const b = trouverBlocs(d);
  assert.deepEqual(b.map(x => x.nom), ['02-deux-photos', '01-seul', '03-sans-csv']);
  assert.deepEqual(b[0].photos.map(f => path.basename(f)), ['2.jpg', '10.jpg']);          // ordre naturel : 2 avant 10
  assert.equal(path.basename(b[0].csv), 'releve.csv'); assert.ok(b[0].ecriture);
  assert.equal(b[1].probleme, ''); assert.match(b[2].probleme, /pas de CSV/);
  fs.rmSync(d, { recursive: true });
});
