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
   Demander alors à Arnaud ses 20 à 30 blocs corrigés (photo + CSV). Ces photos portent de vrais noms :
   dossier local dans `.gitignore`, jamais committées, jamais publiées.
3. Moteur de lecture, étape par étape, chacune gardée seulement si elle améliore les chiffres : redressement et
   variantes d'image, détection PP-OCRv6, ensemble de modèles (PP-OCRv6 medium + un modèle manuscrit français),
   décodage guidé par dictionnaire. Tableau `v2/banc/RESULTATS.md`.
   Objectif : au moins +30 % de boîtes justes du premier coup sur le manuscrit, sans régression sur l'imprimé.
4. Interface en trois écrans : Accueil, Photo (caméra dans l'app, aide à la prise de vue), Résultat (boîtes à vérifier
   en premier, « Partager » en Excel ou CSV).
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
- `index.html`, `css/app.css` : les écrans. Pour l'instant : accueil (lieux en cartes, « Nouveau relevé », réglages)
  et un lieu en lecture seule.
- `js/app.js` : interface, navigation (`#/lieu/<id>`, la touche Retour ferme les feuilles), mises à jour.
- `js/stockage.js` : tout le stockage de la V2.
- `js/import-v1.js` : « Reprendre mes lieux de la V1 ».
- `sw.js` : hors ligne. **Après chaque modification dans `v2/` : `python3 v2/outils/maj_sw.py`** (il réécrit la liste
  des fichiers et la version du cache dans `v2/sw.js`).
- `outils/icones.py` : redessine les icônes. `outils/verif_cohabitation.py` : voir plus haut.

## Stockage (séparé de la V1)
- `localStorage`, clés préfixées `imprimbal2:` : `imprimbal2:lieux` (liste des identifiants), `imprimbal2:lieu:<id>`
  (un lieu : tournée, nom, boîtes, mémoire de noms, sens de lecture), `imprimbal2:reglages`, `imprimbal2:import-v1`.
  `stockage.js` refuse d'écrire une clé sans ce préfixe.
- IndexedDB `imprimbal2`, magasin `images` : miniatures (`mini:<id de boîte>`) et, plus tard, photos.
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

## Publier
`python3 v2/outils/maj_sw.py`, `python3 v2/outils/verif_cohabitation.py`, test local
(`python3 -m http.server` depuis la racine, puis `http://localhost:8000/v2/`), puis commit et push sur `main`.
