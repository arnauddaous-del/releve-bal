# Imprim Bal : résultats du banc d'essai

Fichier écrit par le banc (`node banc.mjs --enregistrer`) : ne pas le modifier à la main. Il ne contient que des totaux, jamais de nom ni de photo.

## Lecture

Jeu d'essai **provisoire : 22 photos du projet, vérité tirée des lectures de la V1 corrigées à la main** : 22 blocs, 264 boîtes (plus 46 écartées, illisibles avec certitude) (15 manuscrites, 216 imprimées, 33 sans nom).


| Configuration | Boîtes justes | dont manuscrit | dont imprimé | Erreurs de lettres | Appartement juste | STOP PUB juste | « À vérifier » vraiment fausses | Fausses non signalées | Grille juste | Temps par boîte | Poids téléchargé |
|---|---|---|---|---|---|---|---|---|---|---|---|
| V1 telle quelle · 17/11/2026 | 77,3 % | 26,7 % | 81,0 % | 29,2 % | 93,2 % | 96,6 % | 40,3 % | 12,5 % | 22/22 | 340 ms | 26,4 Mo |
| V1 + lecture renforcée · 17/11/2026 | 78,0 % | 33,3 % | 81,9 % | 30,2 % | 93,2 % | 97,3 % | 43,2 % | 9,8 % | 22/22 | 413 ms | 64,7 Mo |
| V2 socle (même lecture que la V1) · 17/11/2026 | 77,3 % | 26,7 % | 81,0 % | 29,2 % | 93,2 % | 96,6 % | 40,3 % | 12,5 % | 22/22 | 332 ms | 26,3 Mo |
| V2 + décodage par probabilités · 17/11/2026 | 78,0 % | 20,0 % | 81,9 % | 25,3 % | 92,8 % | 96,6 % | 38,6 % | 9,8 % | 22/22 | 340 ms | 26,3 Mo |
| V2 + dictionnaire des prénoms · 17/11/2026 | 78,4 % | 26,7 % | 81,9 % | 25,2 % | 92,8 % | 96,6 % | 38,6 % | 9,5 % | 22/22 | 343 ms | 26,3 Mo |
| V2 + dictionnaire des noms de famille · 17/11/2026 | 79,9 % | 40,0 % | 82,9 % | 24,5 % | 92,8 % | 96,6 % | 36,1 % | 8,7 % | 22/22 | 386 ms | 29,1 Mo |
| V2 + règles (panneaux, autocollants, initiales) · 17/11/2026 | 87,5 % | 40,0 % | 88,9 % | 2,3 % | 95,1 % | 98,9 % | 21,7 % | 5,7 % | 22/22 | 378 ms | 29,1 Mo |
| V2 + recoupements du bloc (place de l’étiquette, forme des numéros) · 17/11/2026 | 91,7 % | 53,3 % | 93,1 % | 0,8 % | 97,7 % | 98,9 % | 14,5 % | 3,8 % | 22/22 | 390 ms | 29,1 Mo |
| V2 complète + deuxième modèle sur les lignes hésitantes · 17/11/2026 | 92,8 % | 66,7 % | 94,0 % | 0,5 % | 98,9 % | 98,9 % | 10,7 % | 3,8 % | 22/22 | 470 ms | 67,4 Mo |

- **Boîtes justes** : noms, appartement et pub identiques au relevé corrigé, sans une lettre d'écart. C'est « juste du premier coup ».
- **Erreurs de lettres** : lettres à corriger dans les noms, rapportées au nombre de lettres du relevé corrigé.
- **« À vérifier » vraiment fausses** : parmi les boîtes que l'app signale, la part qui était réellement fausse.
- **Fausses non signalées** : boîtes fausses que l'app n'a pas signalées, rapportées à toutes les boîtes. Ce sont les erreurs qui passent inaperçues.
- **Grille juste** : blocs où le comptage automatique donne le bon nombre de boîtes.
- **Temps par boîte** : sur la machine du banc (Node, processeur de bureau). Sert à comparer les configurations entre elles, pas à prédire le temps sur un téléphone.

## Étapes du moteur de la V2 (écrit à la main)

Chaque ligne du tableau ajoute une étape à la précédente. Une étape est gardée seulement si elle améliore les
chiffres sans faire reculer l'imprimé.

| Étape | Ce qu'elle fait | Gardée ? |
|---|---|---|
| `v2-socle` | Le moteur de la V1, recopié dans `v2/js/moteur/`. Sert de contrôle : identique à la V1 boîte par boîte (264/264). | Base |
| `v2-faisceau` | Chaque morceau de texte garde toutes les probabilités du modèle. Plusieurs lectures candidates sont comparées par leur vraie probabilité, sur chaque version de l'image (normale, contrastée, noir et blanc), puis un vote pondéré : une version illisible ne fait plus tomber une lecture nette. | Oui : à peine mieux seule, mais c'est elle qui permet les deux suivantes |
| `v2-prenoms` | Le dictionnaire des prénoms de la V1 propose des mots voisins (une ou deux lettres d'écart) et donne un petit bonus aux mots connus. Le modèle garde le dernier mot : un nom rare lu nettement n'est pas remplacé. | Oui |
| `v2-noms` | Même chose avec environ 235 000 noms de famille (fréquence en France), bonus selon la fréquence, nul pour les mots de 3 lettres. Coupe aussi deux mots collés (« DURANDLUCIE »). | Oui |
| `v2-regles` | Règles d'interprétation V2 : panneaux du hall (bailleur, contacts utiles) reconnus même mal lus ; autocollants « Non merci », « L'abus de prospectus… », « trionsplusfort » comptés en STOP PUB ; une ligne hésitante dont une autre lecture dit « STOP » compte aussi ; initiales gardées (« D. MARTIN », « DURAND M. ») ; « Porte A12 » ; une ligne que le modèle ne sait pas lire du tout ne devient pas un nom. | Oui |
| `v2-bloc` | Recoupements entre les boîtes d'une même photo : l'étiquette est au même endroit sur chaque porte, donc une ligne lue ailleurs (autocollant) ne donne un nom que si elle est très nette ; les numéros suivent la même forme, donc « 8117 » parmi des « B1xx » est relu (autre lecture du modèle, sinon le chiffre qui imite la lettre), et une lettre ajoutée sans appui rend la boîte « à vérifier ». | Oui |
| `v2-bloc-fort` | La même chose, avec le deuxième modèle (PP-OCRv6 medium, celui de la « lecture renforcée » de la V1) sur les lignes hésitantes, dans le même vote. | Oui, en option : il dépasse le budget de 40 Mo du pack de base, il se téléchargera à part comme dans la V1 |

Essayés et non gardés : le deuxième modèle sur **toutes** les lignes (moins bien que sur les seules lignes
hésitantes, et plus lent) ; d'autres règles pour « à vérifier » (seuils sur la probabilité des lignes, lignes de texte
inexpliquées) : aucune ne repérait plus d'erreurs que la règle de la V1, gardée et complétée.

**Prudence sur ces chiffres.** Le jeu est provisoire : la vérité a été tirée des lectures de la V1 puis corrigée à
la main, ce qui avantage la V1 ; il ne compte que 15 boîtes manuscrites certaines (une boîte = près de 7 points de
pourcentage) et 46 boîtes difficiles en ont été écartées ; les règles V2 ont été mises au point en regardant ces
mêmes photos. Le vrai verdict viendra des blocs corrigés par Arnaud, jamais vus pendant la mise au point.

Pas encore essayé, faute d'accès depuis l'environnement de travail (Hugging Face et les serveurs de Paddle sont
bloqués) : un modèle d'écriture manuscrite française (piste : Teklia pylaia-rimes), la détection PP-OCRv6, le
redressement et l'agrandissement par étiquette, la « lecture experte » (étape 5).

## Cadrage : photo prise de biais (18/11/2026)

Le comptage des boîtes (repris de la V1) cherche des joints parfaitement verticaux et horizontaux : il se perd dès que
la photo est penchée ou prise de côté. `js/moteur/redresser.mjs` repère les joints (transformée de Hough sur les bords),
calcule leurs points de fuite et remet le bloc droit avant le comptage et la lecture. Il ne redresse que si le bloc est
penché de plus de 2° ou vu de côté (un côté plus haut que l'autre de 10 % ou plus) : la contre-plongée seule est bien
gérée par le comptage, et toutes les photos réelles en ont un peu.

Comptage juste (`cadrage.mjs`, 22 photos du jeu provisoire, chacune déformée de 7 façons ; la photo reste entière, ses
bords prolongés autour) :

| Prise de vue | Sans redressement | Avec |
|---|---|---|
| Droite (photos réelles) | 21 / 22 | 21 / 22 (aucune redressée) |
| Penchée 4° | 2 / 22 | 21 / 22 |
| Penchée −8° | 0 / 22 | 22 / 22 |
| Contre-plongée / plongée | 22 / 22, 20 / 22 | inchangé (pas redressée) |
| De côté / de côté, fort | 1 / 22, 1 / 22 | 22 / 22, 20 / 22 |
| Penchée et de biais | 2 / 22 | 20 / 22 |
| **Toutes les photos de biais** | **48 / 154** | **147 / 154** |

Lecture de bout en bout (`banc.mjs`, les 22 photos penchées de 5° et prises de biais, même vérité) : boîtes justes
**23,5 % → 78,0 %**, grille juste 1 → 18 blocs sur 22 (configuration `v2-redresse` contre `v2-bloc-prenoms`). Sur les
photos réelles, aucune n'est redressée : lecture identique (89,8 %).

## Le banc lit-il comme la vraie V1 ?

Mesuré le 16/11/2026 : 9 photos (126 boîtes) lues deux fois, par la vraie page de la V1 dans Chrome 153 et par le banc.

| | Boîtes identiques | Noms | Appartement | Pub | « À vérifier » |
|---|---|---|---|---|---|
| De bout en bout | 96,8 % | 97,6 % | 99,2 % | 100,0 % | 98,4 % |
| À grille égale (le moteur seul) | 96,8 % | 97,6 % | 99,2 % | 100,0 % | 99,2 % |

Même grille automatique : 9/9 photos. Temps par boîte : 1232 ms dans le navigateur, 468 ms dans le banc.

Les écarts qui restent apparaissent aussi à grille égale : ils viennent de très petites différences d'image ou de calcul entre le navigateur et le banc.
