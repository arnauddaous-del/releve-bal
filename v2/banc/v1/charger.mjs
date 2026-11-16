/* Charge le code de lecture de la V1 tel qu'il est publié, sans le copier ni le modifier :
   - BalNames (prénoms) et BalCore (grille + parseLabel) : le premier bloc <script> de index.html ;
   - BalPaddle (détection, reconnaissance, relecture, vote) : ocr/bal-worker.js.
   Les deux fichiers sont seulement lus. Si la V1 change, le banc mesure la V1 du moment. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function chargerV1(racine = DEPOT) {
  const html = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
  const repere = html.indexOf('var BalNames = (function');
  if (repere < 0) throw new Error('index.html : bloc BalNames introuvable');
  const debut = html.lastIndexOf('<script>', repere) + '<script>'.length, fin = html.indexOf('</script>', repere);
  // même « royaume » JavaScript que le banc (pas de vm) : les tableaux typés passent tels quels à onnxruntime
  const page = new Function('module', html.slice(debut, fin) + '\nreturn { BalNames: BalNames, BalCore: BalCore };')({ exports: {} });
  const worker = fs.readFileSync(path.join(racine, 'ocr', 'bal-worker.js'), 'utf8');
  const BalPaddle = new Function('module', 'self', worker + '\nreturn BalPaddle;')({ exports: {} }, {});
  for (const f of ['autoCount', 'uniformGrid', 'fitGrid', 'guessFrame', 'cells', 'parseLabel']) {
    if (typeof page.BalCore[f] !== 'function') throw new Error('BalCore.' + f + ' introuvable : la V1 a changé, adapter le banc');
  }
  if (typeof BalPaddle.readLines !== 'function') throw new Error('BalPaddle.readLines introuvable : la V1 a changé, adapter le banc');
  return { BalNames: page.BalNames, BalCore: page.BalCore, BalPaddle: BalPaddle, racine: racine };
}
