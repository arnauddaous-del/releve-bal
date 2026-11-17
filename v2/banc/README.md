# Banc d'essai d'Imprim Bal

Le banc lit un dossier de photos de boîtes aux lettres et compare ce qu'il lit au relevé corrigé à la main.
Il sert à mesurer la V1 telle quelle, puis chaque étape du moteur de la V2 : une étape n'est gardée que si elle
améliore les chiffres. C'est un outil de développement : rien ici ne fait partie de l'app installée.

## Confidentialité

Les photos et les relevés portent de vrais noms de résidents. Ils vont dans `donnees/`, qui est dans `.gitignore`,
comme `rapports/` (le détail boîte par boîte). **Ils ne sont jamais committés ni publiés.**
Seuls des totaux sortent d'ici : `resultats.json` et `RESULTATS.md` ne contiennent ni nom ni photo.
Le dossier `exemple/` est une fausse photo, fabriquée, avec des noms inventés.

## Préparer les blocs (20 à 30)

Un bloc = un meuble de boîtes relevé avec la V1, puis corrigé à la main.

1. Dans la V1, ouvrez le lieu et corrigez tout : noms, numéros d'appartement, STOP PUB / OK PUB, ordre des boîtes.
   Le CSV doit décrire exactement les boîtes de la photo, dans l'ordre de flashage.
2. Exportez avec « Enregistrer le CSV ».
3. Gardez **la photo d'origine**, celle qui a servi à la lecture, en pleine résolution : ni capture d'écran,
   ni copie passée par une messagerie. La résolution compte plus que tout pour l'écriture manuscrite.
4. Donnez le même nom aux deux fichiers : `les-pins.jpg` et `les-pins.csv`.
   Si le lieu a été lu en plusieurs photos : un dossier `les-pins/` avec `1.jpg`, `2.jpg`… dans l'ordre des lectures,
   et le CSV.

À varier : des étiquettes manuscrites (au moins un tiers des blocs), des imprimées, des autocollants, plusieurs
immeubles, plusieurs lumières. Les blocs difficiles sont les plus utiles.

Pour les envoyer : **en fichier ZIP**. Une photo envoyée comme image est souvent réduite en route (une photo du projet
est arrivée en 1200 x 1600 au lieu de 3000 x 4000) ; dans un ZIP, elle arrive intacte. Le banc signale toute photo de
moins de 3000 px de côté.

### Fichiers facultatifs d'un bloc en dossier

- `ecriture.csv` : `ordre;type`, avec `M` (au moins un nom manuscrit), `I` (imprimé), `V` (boîte sans nom).
  Il sert à mesurer le manuscrit et l'imprimé séparément. `node banc.mjs --planches` enregistre les images des boîtes,
  numérotées, pour faire ce classement.
- `bloc.json` : `{ "sens": "v", "grilles": { "1.jpg": "6x4" } }` pour imposer le sens de lecture (`h` ou `v`) ou le
  nombre de colonnes x rangées d'une photo (la barre centrale compte pour une colonne, comme dans l'app).
  Sans lui, le banc compte la grille tout seul, comme l'app, et retient le sens qui colle au relevé.

## Lancer

```
cd v2/banc
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install     # une fois
npm test                                           # tests, dont le bloc d'exemple de bout en bout
node banc.mjs                                      # mesure la V1 sur donnees/
node banc.mjs --config v1,v1-renforcee --enregistrer    # inscrit les totaux dans RESULTATS.md
node banc.mjs --donnees exemple --detail           # le bloc d'exemple, avec les boîtes fausses
node banc.mjs --planches                           # images des boîtes dans rapports/planches/
node parite-v1.mjs photo1.jpg photo2.jpg           # le banc lit-il comme la vraie V1 dans Chrome ?
```

Toutes les configurations, dans l'ordre des étapes :
`node banc.mjs --config v1,v1-renforcee,v2-socle,v2-faisceau,v2-prenoms,v2-noms,v2-regles,v2-bloc,v2-bloc-fort --fils 2 --enregistrer`
(une vingtaine de minutes pour 22 photos). Les configurations `v2-noms` et suivantes ont besoin de la liste des noms
de famille dans `local/noms-famille.txt` (voir `../outils/lexique_noms.py`).

## Ce qui est mesuré

Pour chaque configuration : part de boîtes entièrement justes (noms, appartement et pub, sans une lettre d'écart),
taux d'erreur par lettre sur les noms, justesse de l'appartement et du STOP PUB, part des boîtes « à vérifier » qui
étaient vraiment fausses, part des boîtes fausses non signalées, blocs où la grille automatique est juste, temps par
boîte et poids téléchargé. Les définitions exactes sont dans `mesures.mjs` et rappelées dans `RESULTATS.md`.

Quand le nombre de boîtes lues diffère du relevé (grille mal comptée, boîte ajoutée à la main), le banc apparie les
boîtes au mieux en gardant l'ordre ; une boîte du relevé sans vis-à-vis compte comme fausse.

## Comment le banc reste fidèle à la V1

- `v1/charger.mjs` charge le code de lecture de la V1 depuis ses propres fichiers (`index.html`, `ocr/bal-worker.js`),
  en lecture seule : aucune copie, aucune modification.
- `moteurs/v1.mjs` refait les étapes de la page dans le même ordre, avec onnxruntime-node et les modèles de `ocr/`.
- `image.mjs` reproduit les opérations d'image du navigateur, y compris la façon dont Chrome réduit une image.
- `parite-v1.mjs` contrôle le tout contre la vraie page dans Chrome. Résultat dans `RESULTATS.md`.

## Ajouter une configuration (étapes de la V2)

Le plus souvent : une option de plus dans `moteurs/v2.mjs` (qui charge les modules de `../js/moteur/`, ceux du
téléphone) et une ligne dans `CONFIGS` de `banc.mjs`. Pour essayer vite : `--memoire` (les sorties des modèles et les
lignes lues sont gardées dans `local/`, ignoré par git ; les temps mesurés sont alors faux). Ensuite, puis `node banc.mjs --config v1,<nouvelle> --enregistrer`. Toutes les lignes du tableau
doivent être mesurées sur le même jeu d'essai : le banc le signale sinon.
