import test from 'node:test';
import assert from 'node:assert/strict';
import { BalCore as C } from '../../js/moteur/regles.mjs';

const L = t => ({ text: t, conf: 90, alts: [], p: 0.9 });
// étiquette de bailleur « Publicité, non merci » (bande rouge), confirmée STOP PUB par Arnaud le 18/11/2026
test('« Publicité, non merci » et ses lectures abîmées : STOP PUB, le nom reste', () => {
  for (const t of ['Publicité, non merci', 'Publicite non merci', 'Pubicité, non merci', 'Publicté non merc', 'PUBLICITE NON MERCI', 'Pub1icité non merci', 'non merci']) {
    const p = C.parseLabel([L('DUPONT Jean'), L(t)], { v2: true });
    assert.equal(p.pub, 'STOP PUB', t);
    assert.deepEqual(p.names, ['DUPONT Jean'], t);
  }
});
