# Imprim Bal : résultats du banc d'essai

Fichier écrit par le banc (`node banc.mjs --enregistrer`) : ne pas le modifier à la main. Il ne contient que des totaux, jamais de nom ni de photo.

## Lecture

Aucune mesure pour l'instant : le banc attend les blocs corrigés (photo et CSV exporté par la V1), à déposer dans `donnees/`. Voir `README.md`.

## Le banc lit-il comme la vraie V1 ?

Mesuré le 16/11/2026 : 9 photos (126 boîtes) lues deux fois, par la vraie page de la V1 dans Chrome 153 et par le banc.

| | Boîtes identiques | Noms | Appartement | Pub | « À vérifier » |
|---|---|---|---|---|---|
| De bout en bout | 96,8 % | 97,6 % | 99,2 % | 100,0 % | 98,4 % |
| À grille égale (le moteur seul) | 96,8 % | 97,6 % | 99,2 % | 100,0 % | 99,2 % |

Même grille automatique : 9/9 photos. Temps par boîte : 1232 ms dans le navigateur, 468 ms dans le banc.

Les écarts qui restent apparaissent aussi à grille égale : ils viennent de très petites différences d'image ou de calcul entre le navigateur et le banc.
