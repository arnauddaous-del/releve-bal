/* Écrit RESULTATS.md à partir de resultats.json (des totaux seulement : aucun nom, aucune photo). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_JSON = path.join(ICI, 'resultats.json'), FICHIER_MD = path.join(ICI, 'RESULTATS.md');

export function lireResultats() {
  try { return JSON.parse(fs.readFileSync(FICHIER_JSON, 'utf8')); } catch (e) { return { configurations: {} }; }
}
const pc = v => v == null ? '–' : (100 * v).toFixed(1).replace('.', ',') + ' %';
const nb = (v, d = 0) => v == null ? '–' : v.toFixed(d).replace('.', ',');

export function ecrireResultats(r) {
  fs.writeFileSync(FICHIER_JSON, JSON.stringify(r, null, 2) + '\n');
  const L = ['# Imprim Bal : résultats du banc d\'essai', '',
    'Fichier écrit par le banc (`node banc.mjs --enregistrer`) : ne pas le modifier à la main. Il ne contient que des totaux, jamais de nom ni de photo.', ''];
  const cfgs = Object.entries(r.configurations || {});
  if (!cfgs.length) {
    L.push('## Lecture', '', 'Aucune mesure pour l\'instant : le banc attend les blocs corrigés (photo et CSV exporté par la V1), à déposer dans `donnees/`. Voir `README.md`.', '');
  } else {
    const jeux = new Set(cfgs.map(([, c]) => c.jeu.empreinte)), j = cfgs[cfgs.length - 1][1].jeu;
    L.push('## Lecture', '',
      'Jeu d\'essai : ' + j.blocs + ' blocs, ' + j.boites + ' boîtes' +
      (j.types ? ' (' + j.types.M + ' manuscrites, ' + j.types.I + ' imprimées, ' + j.types.V + ' sans nom' + (j.types.inconnu ? ', ' + j.types.inconnu + ' non classées' : '') + ')' : '') + '.',
      jeux.size > 1 ? '\n**Attention : les lignes ci-dessous n\'ont pas toutes été mesurées sur le même jeu d\'essai. Relancer les anciennes configurations avant de comparer.**' : '', '',
      '| Configuration | Boîtes justes | dont manuscrit | dont imprimé | Erreurs de lettres | Appartement juste | STOP PUB juste | « À vérifier » vraiment fausses | Fausses non signalées | Grille juste | Temps par boîte | Poids téléchargé |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const [, c] of cfgs) {
      const i = c.indicateurs, t = c.parType || {};
      L.push('| ' + [c.titre + ' · ' + c.date, pc(i.justes), pc(t.M && t.M.justes), pc(t.I && t.I.justes), pc(i.erreursLettres), pc(i.appartement), pc(i.pub),
        pc(i.signaleesFausses), pc(i.faussesNonSignalees), c.grilles.justes + '/' + c.grilles.blocs, nb(c.msParBoite) + ' ms', nb(c.poidsMo, 1) + ' Mo'].join(' | ') + ' |');
    }
    L.push('',
      '- **Boîtes justes** : noms, appartement et pub identiques au relevé corrigé, sans une lettre d\'écart. C\'est « juste du premier coup ».',
      '- **Erreurs de lettres** : lettres à corriger dans les noms, rapportées au nombre de lettres du relevé corrigé.',
      '- **« À vérifier » vraiment fausses** : parmi les boîtes que l\'app signale, la part qui était réellement fausse.',
      '- **Fausses non signalées** : boîtes fausses que l\'app n\'a pas signalées, rapportées à toutes les boîtes. Ce sont les erreurs qui passent inaperçues.',
      '- **Grille juste** : blocs où le comptage automatique donne le bon nombre de boîtes.',
      '- **Temps par boîte** : sur la machine du banc, un seul fil. Sert à comparer les configurations entre elles, pas à prédire le temps sur un téléphone.', '');
  }
  const f = r.fidelite;
  L.push('## Le banc lit-il comme la vraie V1 ?', '');
  if (!f) L.push('Pas encore mesuré (`node parite-v1.mjs photo…`).', '');
  else L.push(
    'Mesuré le ' + f.date + ' : ' + f.photos + ' photos (' + f.boites + ' boîtes) lues deux fois, par la vraie page de la V1 dans ' + f.navigateur + ' et par le banc.', '',
    '| | Boîtes identiques | Noms | Appartement | Pub | « À vérifier » |', '|---|---|---|---|---|---|',
    '| De bout en bout | ' + [pc(f.bout.identiques), pc(f.bout.noms), pc(f.bout.apt), pc(f.bout.pub), pc(f.bout.check)].join(' | ') + ' |',
    '| À grille égale (le moteur seul) | ' + [pc(f.moteur.identiques), pc(f.moteur.noms), pc(f.moteur.apt), pc(f.moteur.pub), pc(f.moteur.check)].join(' | ') + ' |', '',
    'Même grille automatique : ' + f.memeGrille + '/' + f.photos + ' photos. Temps par boîte : ' + nb(f.msNavigateur) + ' ms dans le navigateur, ' + nb(f.msBanc) + ' ms dans le banc.', '',
    'Les écarts qui restent apparaissent aussi à grille égale : ils viennent de très petites différences d\'image ou de calcul entre le navigateur et le banc.', '');
  fs.writeFileSync(FICHIER_MD, L.join('\n'));
}
