/* Tests des mesures, sur des noms inventés. Lancer : npm test */
import test from 'node:test';
import assert from 'node:assert/strict';
import { distance, listeNoms, comparer, aligner, compteur, compter, indicateurs } from '../mesures.mjs';

const boite = (noms, apt = '', pub = 'OK PUB', check = false) => ({ noms: listeNoms(noms), apt, pub, check });

test('distance d\'édition', () => {
  assert.equal(distance('', ''), 0);
  assert.equal(distance('DUPONT', 'DUPONT'), 0);
  assert.equal(distance('DUPONT', 'DUPOND'), 1);
  assert.equal(distance('Théo', 'Theo'), 1);
  assert.equal(distance('', 'abc'), 3);
});

test('liste des destinataires d\'une boîte', () => {
  assert.deepEqual(listeNoms('DUPONT Marie\nDUPONT Jean'), ['DUPONT Marie', 'DUPONT Jean']);
  assert.deepEqual(listeNoms(' DUPONT  Marie / DUPONT Jean '), ['DUPONT Marie', 'DUPONT Jean']);
  assert.deepEqual(listeNoms('BAL Sans Nom'), []);
  assert.deepEqual(listeNoms(''), []);
});

test('une boîte juste l\'est sur les noms, l\'appartement et la pub', () => {
  const vrai = boite('DUPONT Marie / DUPONT Jean', 'C02', 'STOP PUB');
  assert.equal(comparer(boite('DUPONT Marie\nDUPONT Jean', 'c 02', 'STOP PUB'), vrai).juste, true);
  assert.equal(comparer(boite('DUPONT Marie\nDUPONT Jean', 'C02', 'OK PUB'), vrai).juste, false);
  assert.equal(comparer(boite('DUPONT Marie\nDUPONT Jean', 'C03', 'STOP PUB'), vrai).juste, false);
  const r = comparer(boite('Dupont Marie\nDUPOND Jean', 'C02', 'STOP PUB'), vrai);
  assert.equal(r.juste, false); assert.equal(r.ecart, 6); assert.equal(r.lettres, 26);
});

test('la comparaison tolérante ignore capitales, accents et ordre, pas les lettres', () => {
  const vrai = boite('LEFÈVRE Théo / MARTIN Zoé');
  const r = comparer(boite('Martin Zoe\nLefevre Theo'), vrai);
  assert.equal(r.juste, false); assert.equal(r.justeTol, true);
  assert.equal(comparer(boite('Martin Zoe\nLefevre Leo'), vrai).justeTol, false);
});

test('alignement : même nombre de boîtes, une pour une', () => {
  const a = aligner([boite('A'), boite('B')], [boite('X'), boite('Y')]);
  assert.equal(a.direct, true); assert.deepEqual(a.paires, [[0, 0], [1, 1]]);
});

test('alignement : une boîte lue en trop, une boîte manquante', () => {
  const vrais = [boite('MOREAU Paul'), boite('GIRARD Anne'), boite('ROBIN Luc')];
  const trop = aligner([boite('MOREAU Paul'), boite('zzz'), boite('GIRARD Anne'), boite('ROBIN Luc')], vrais);
  assert.deepEqual(trop.paires, [[0, 0], [1, null], [2, 1], [3, 2]]);
  const manque = aligner([boite('MOREAU Paul'), boite('ROBIN Luc')], vrais);
  assert.deepEqual(manque.paires, [[0, 0], [null, 1], [1, 2]]);
});

test('compteurs et indicateurs', () => {
  const c = compteur();
  compter(c, boite('MOREAU Paul', '12', 'OK PUB'), boite('MOREAU Paul', '12', 'OK PUB'));                 // juste
  compter(c, boite('GIRARD Ane', '', 'STOP PUB', true), boite('GIRARD Anne', '', 'STOP PUB'));            // fausse, signalée
  compter(c, boite('ROBIN Luc', '7', 'OK PUB', true), boite('ROBIN Luc', '7', 'OK PUB'));                 // juste, signalée à tort
  compter(c, boite('', '', 'OK PUB'), boite('PETIT Lou', '3', 'STOP PUB'));                               // fausse, non signalée
  compter(c, null, boite('BAL Sans Nom'));                                                                // manquante
  const i = indicateurs(c);
  assert.equal(i.boites, 5);
  assert.equal(i.justes, 2 / 5);
  assert.equal(i.signaleesFausses, 1 / 2);          // 2 signalées, 1 vraiment fausse
  assert.equal(i.faussesSignalees, 1 / 3);          // 3 fausses, 1 signalée
  assert.equal(i.faussesNonSignalees, 2 / 5);
  assert.equal(i.appartementTrouve, 2 / 3);         // 3 boîtes avec numéro, 2 retrouvés
  assert.equal(i.stopTrouve, 1 / 2);
  assert.equal(i.manquantes, 1);
  assert.equal(i.erreursLettres, (1 + 9) / (11 + 11 + 9 + 9 + 0));
});
