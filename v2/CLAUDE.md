# Imprim Bal 2 (dossier `v2/`) : notes de chantier

Nouvelle version de l'app, construite à côté de la V1, pour un futur lancement auprès d'autres utilisateurs.
Adresse : https://arnauddaous-del.github.io/releve-bal/v2/ (toujours avec la barre finale, voir « Cohabitation »).

## Règle n°1 : ne jamais casser la V1
- Aucun fichier de la V1 n'est modifié : `index.html`, `sw.js`, `manifest.webmanifest`, `ocr/*`, `icons/*` (à la racine).
  Si un changement dans la V1 semble indispensable : s'arrêter et demander à Arnaud.
- État de référence de la V1 : commit `8e6de26` (tag `v1-finale`).
- Avant chaque publication : `python3 v2/outils/verif_cohabitation.py`. Il lance un vrai Chrome sur une copie jetable
  du dépôt et contrôle la cohabitation, la reprise des lieux, les mises à jour croisées et le hors-ligne.

## Déroulé voulu par Arnaud, avec un arrêt pour test après chaque étape
1. Tag, squelette `v2/` installable, reprise des lieux de la V1. **Fait le 16/11/2026.**
2. Banc d'essai `v2/banc/` (Node + onnxruntime-node, mêmes fonctions que le Worker) et mesure de la V1 telle quelle.
   **Banc construit le 16/11/2026 ; la mesure de la V1 attend les 20 à 30 blocs corrigés d'Arnaud** (photo + CSV,
   à envoyer en ZIP). Ces photos portent de vrais noms : `v2/banc/donnees/` est dans `.gitignore`, jamais committé.
   À leur arrivée : les ranger dans `donnees/`, `node banc.mjs --planches`, classer manuscrit / imprimé dans
   `ecriture.csv` (à partir des planches), puis `node banc.mjs --config v1,v1-renforcee --enregistrer`.
3. Moteur de lecture, étape par étape, chacune gardée seulement si elle améliore les chiffres : redressement et
   variantes d'image, détection PP-OCRv6, ensemble de modèles (PP-OCRv6 medium + un modèle manuscrit français),
   décodage guidé par dictionnaire. Tableau `v2/banc/RESULTATS.md`.
   Objectif : au moins +30 % de boîtes justes du premier coup sur le manuscrit, sans régression sur l'imprimé.
   **Premier passage le 17/11/2026, mesuré sur un jeu provisoire** (`banc/donnees-provisoires/`, ignoré par git :
   22 photos du projet, vérité tirée des lectures de la V1 corrigées à la main, 264 boîtes notées dont seulement
   15 manuscrites certaines). Gardé : décodage par probabilités, dictionnaire (prénoms + noms de famille), règles V2,
   recoupements du bloc ; deuxième modèle (PP-OCRv6 medium) en option sur les lignes hésitantes. Pas encore fait,
   faute d'accès depuis cet environnement : modèle manuscrit français (Hugging Face bloqué), détection PP-OCRv6,
   redressement par étiquette. Chiffres et détail : `banc/RESULTATS.md` et `banc/etapes.md`.
4. Interface en trois écrans : Accueil, Photo (caméra dans l'app, aide à la prise de vue), Résultat (boîtes à vérifier
   en premier, « Partager » en Excel ou CSV). **Fait le 17/11/2026** (Arnaud a demandé d'y passer avant de valider
   les chiffres de l'étape 3). Moteur branché : configuration `v2-bloc-prenoms` du banc (sans liste de noms de
   famille, pas encore publiable). Dans Chrome, lecture identique au banc pour 41 boîtes sur 42 (3 photos), environ
   1,1 s par boîte sur un ordinateur : loin du budget de 10 s pour 24 boîtes sur un téléphone (piste : WebAssembly
   multi-fils, qui demande l'isolation cross-origin via le service worker, ou WebGPU).
5. « Lecture experte » optionnelle (petit modèle vision-langage en WebGPU, seulement pour les boîtes douteuses).
6. Finitions : accessibilité, page confidentialité, `v2/BASCULE.md`, ce fichier, `v2/LICENCES.md`.

Budgets : pack de base ≤ 40 Mo, bloc de 24 boîtes lu en moins de 10 s sur un Android milieu de gamme, tout servi
depuis le dépôt (aucun CDN), aucune photo envoyée.

## Design
Une action principale par écran, zéro jargon, automatique par défaut. Police du téléphone, titres 28 à 34 px,
corps 17 px, une seule couleur d'accent (`#0e6e6b`, `#4cc4be` en sombre), coins de 12 à 16 px, mode sombre automatique,
transitions de 200 à 300 ms, feuilles qui montent du bas, cibles ≥ 44 px, « Supprimé · Annuler » plutôt qu'une
confirmation, vibration légère sur validation et suppression. Textes courts, en français.

## Structure (pas d'étape de build, modules ES servis tels quels)
- `index.html`, `css/app.css` : les écrans. Accueil (lieux en cartes), Résultat (`#ecran-lieu` : boîtes à vérifier en
  grand, puis l'ordre de flashage avec poignée pour glisser), Photo (`#ecran-photo`, plein écran sombre : visée,
  puis grille, puis progression de la lecture), feuilles (nouveau relevé, correction d'une boîte, partage, réglages).
- `js/app.js` : interface et navigation (`#/lieu/<id>`, `#/lieu/<id>/photo` ; la touche Retour ferme les feuilles et
  l'écran Photo), mémoire de noms du lieu (comme la V1), mises à jour.
- `js/camera.js` : getUserMedia (caméra arrière), ImageCapture.takePhoto quand il existe (pleine définition, Android),
  sinon l'image de l'aperçu (iPhone) ; aide en direct : lumière, immobilité, inclinaison (portrait, Android), nombre de
  boîtes vues (même comptage que la lecture) dessiné sur l'aperçu ; lampe si le téléphone la propose.
- `js/grille.js` : chargement de la photo (4200 px / 700 px, comme la V1), comptage auto, éditeur de grille repris de
  la V1 (+/− colonnes et rangées, lignes à glisser, case touchée = ignorée), numéros selon le sens de lecture.
- `js/moteur-client.js` : téléchargement des modèles avec progression, Worker, découpe des cases (même découpe que la
  V1), miniatures, assemblage des boîtes (`bloc.mjs`, « à vérifier », autres lectures).
- `js/lecteur.js` : le Worker (classique : `importScripts` d'onnxruntime-web 1.17.3, puis `import()` des modules).
- `js/export.js` : CSV et Excel, repris tels quels de la V1 ; partage par la feuille du téléphone, sinon téléchargement.
- `modeles/` : copie des modèles de la V1 (`ocr/`), pour que la V2 ne dépende pas des fichiers de la V1. Cache à part
  `imprimbal2-modeles-1` (rempli au premier usage, gardé d'une version de l'app à l'autre ; un modèle qui change
  doit changer de nom). `noms-famille.txt` y sera lu s'il existe (pas encore : voir plus bas).
- `js/stockage.js` : tout le stockage de la V2.
- `js/import-v1.js` : « Reprendre mes lieux de la V1 ».
- `sw.js` : hors ligne. **Après chaque modification dans `v2/` : `python3 v2/outils/maj_sw.py`** (il réécrit la liste
  des fichiers et la version du cache dans `v2/sw.js`).
- `outils/icones.py` : redessine les icônes. `outils/verif_cohabitation.py` : voir plus haut.
- `js/moteur/` : le moteur de lecture de la V2 (modules ES, sans dépendance, pour le Worker et pour le banc).
  `prenoms.mjs`, `regles.mjs`, `lecture.mjs` : copies de la V1 (état v1-finale), modifiées ici seulement, la V1 ne les
  charge pas. `regles.mjs` : `parseLabel(lines)` sans option = règles V1 à l'identique ; `parseLabel(lines, { v2: true,
  zone })` = règles V2 (panneaux du hall, autocollants « Non merci », initiales, ligne hors de l'étiquette).
  `ctc.mjs` : décodage (faisceau, probabilité exacte d'un texte, confiance). `lignes.mjs` : lecture des lignes d'une
  boîte (candidates comparées par leur probabilité sur chaque version d'image et chaque modèle, vote pondéré).
  `lexique.mjs` : dictionnaire (voisins, bonus borné : il suggère, il n'écrase jamais). `bloc.mjs` : recoupements
  entre les boîtes d'une photo (place de l'étiquette, forme des numéros d'appartement).
  Pas encore branché sur l'interface (étape 4).
- Liste des noms de famille : `outils/lexique_noms.py` la fabrique depuis le fichier des personnes décédées de l'INSEE
  (Licence Ouverte). Pour les mesures, une liste tirée de ce fichier par un tiers est dans `banc/local/` (ignoré :
  son dépôt est sous AGPL, à ne pas publier). Pour l'app : refaire la liste depuis l'INSEE et la mettre dans
  `v2/modeles/` (environ 2,8 Mo).
- `banc/` : le banc d'essai (voir plus bas). Outil de développement, hors de l'app : rien de `banc/` n'est dans la
  liste du service worker.

## Stockage (séparé de la V1)
- `localStorage`, clés préfixées `imprimbal2:` : `imprimbal2:lieux` (liste des identifiants), `imprimbal2:lieu:<id>`
  (un lieu : tournée, nom, boîtes, mémoire de noms, sens de lecture), `imprimbal2:reglages`, `imprimbal2:import-v1`.
  `stockage.js` refuse d'écrire une clé sans ce préfixe.
- IndexedDB `imprimbal2`, magasin `images` : miniatures (`mini:<id de boîte>`, 480 px, pour les listes) et photo de
  chaque boîte en pleine définition (`photo:<id>`, découpée dans la photo d'origine sans réduction, 3000 px au plus,
  JPEG 0,92 ; box.hd et box.hdTaille). La lecture, elle, garde la découpe de la V1 (photo réduite à 4200 px).
  Visionneuse plein écran (pincer, double toucher, Retour) sur les photos des boîtes à vérifier et de la correction.
- La clé de la V1, `releve-bal-v4`, est seulement lue (`localStorage.getItem` dans `import-v1.js`).
- Les boîtes gardent la forme de la V1 (`name` avec un destinataire par ligne, `apt`, `pub`, `check`, `ok`, `alt`,
  `sug`, `orig`…), sans `thumb` : `mini: true` signale une miniature en base.
- Reprise : un lieu de la V1 déjà repris (son identifiant est noté dans `imprimbal2:import-v1`) n'est ni recopié
  ni mis à jour. Les nouveaux lieux de la V1 se reprennent depuis Réglages.

## Cohabitation : ce qui a été vérifié (Chrome 153)
- **Identité d'app.** L'`id` d'un manifeste se résout par rapport à l'origine du site, pas au dossier. Le `"id": "./"`
  de la V1 vaut donc `https://arnauddaous-del.github.io/`. La V2 déclare `"id": "/releve-bal/v2/"` : avec `"./"`,
  elle aurait eu la même identité que la V1 et les deux apps n'auraient pas pu s'installer côte à côte.
- **Première visite.** Le service worker de la V1 (portée `/releve-bal/`) répond `index.html` de la V1 à toute
  navigation sous sa portée, `v2/` compris, tant que celui de la V2 n'est pas enregistré. À la toute première
  ouverture de `…/v2/` sur un téléphone où la V1 est installée, c'est donc la V1 qui s'affiche un court instant ;
  sa page enregistre `sw.js` en relatif, donc celui de la V2, qui prend la main et recharge la page sur la V2.
  Ensuite la portée la plus précise gagne : `v2/` appartient à la V2. Pour que ce passage reste court, l'installation
  du service worker V2 ne doit mettre en cache que la coquille ; les modèles seront téléchargés après.
- **Barre finale.** `…/releve-bal/v2` sans la barre finale est hors de la portée de la V2 : sur un téléphone où la V1
  est installée, cette adresse affiche la V1. Toujours donner l'adresse avec la barre finale.
- **Caches.** La V1 efface à chaque mise à jour tout cache dont le nom commence par `releve-bal-`. Ceux de la V2
  commencent par `imprimbal2-` (`imprimbal2-app-<version>` ; les modèles iront dans un cache à part, non effacé par
  les mises à jour de l'app). La V2 n'efface que ses anciens `imprimbal2-app-`.
- **iPhone.** Une app installée sur l'écran d'accueil d'un iPhone a son propre stockage : la V2 installée n'y verra
  pas les lieux de la V1 installée. La reprise fonctionne sur Android et dans un même navigateur.
- Corriger la première visite ou la barre finale demanderait de modifier `sw.js` de la V1, donc l'accord d'Arnaud ;
  et les téléphones garderaient l'ancien service worker V1 jusqu'à leur prochaine mise à jour.

## Banc d'essai (`v2/banc/`, mode d'emploi dans son `README.md`)
- `banc.mjs` lit les blocs de `donnees/` (photo + CSV corrigé exporté par la V1) avec une ou plusieurs configurations
  et écrit les totaux dans `RESULTATS.md` (`--enregistrer`). Le détail boîte par boîte reste dans `rapports/` (ignoré).
- **La V1 n'est pas copiée** : `v1/charger.mjs` charge `BalNames`, `BalCore` (bloc `<script>` de `index.html`) et
  `BalPaddle` (`ocr/bal-worker.js`) depuis leurs fichiers ; `moteurs/v1.mjs` refait les étapes de la page (`loadPhoto`,
  `autoGrid`, `readCell`, mise en liste) avec onnxruntime-node 1.17.3 et les modèles de `ocr/`.
- **Réduction d'image de Chrome** (`image.mjs`) : avec `imageSmoothingQuality = 'high'`, Chrome agrandit en bicubique
  mais réduit en mipmaps trilinéaires avec un biais d'un demi-niveau (réduction de moins de 30 % : bilinéaire simple).
  Reproduit à 3 niveaux de gris près ; sans cela la grille et les lectures divergeaient (55 % de boîtes identiques).
- **Fidélité** (`parite-v1.mjs`, vraie page V1 dans Chrome contre le banc) : voir `RESULTATS.md`. Le 16/11/2026, sur
  9 photos du projet et 126 boîtes : même grille 9/9, 96,8 % de boîtes identiques.
- **La lecture de la V1 est très sensible au cadrage des cases** : quelques pixels d'écart sur une ligne de la grille
  changent le texte lu. À garder en tête pour l'étape 4.1 (redressement, découpe des étiquettes).
- Vérité terrain : boîtes appariées dans l'ordre ; si le nombre diffère, appariement au mieux et boîte sans vis-à-vis
  comptée fausse. Le sens de lecture (réglage de l'utilisateur) est celui qui colle au relevé, sauf `bloc.json`.
- Les photos envoyées comme images par l'app Claude arrivent souvent réduites (1200 x 1600) : demander des ZIP.
- Temps sur la machine du banc (1 fil) : environ 0,5 s par boîte ; la même lecture dans Chrome (WebAssembly) : 1,3 à 1,8 s.
- Une étape de la V2 = une configuration de plus dans `CONFIGS` de `banc.mjs` (moteur `moteurs/v2.mjs`, options).
  `v2-socle` doit rester identique à `v1` boîte par boîte (vérifié le 17/11/2026 : 264/264).
- `--memoire` : garde les sorties des modèles (`local/memoire/`) et les lignes lues par photo (`local/lignes/`), pour
  essayer vite des règles. Les temps mesurés avec `--memoire` sont faux : mesurer sans pour le tableau.

## Publier
`python3 v2/outils/maj_sw.py`, `python3 v2/outils/verif_cohabitation.py`, `python3 v2/outils/verif_parcours.py`
(parcours complet dans Chrome avec une caméra simulée et la photo inventée du banc : 21 vérifications), test local
(`python3 -m http.server` depuis la racine, puis `http://localhost:8000/v2/`), puis commit et push sur `main`.
