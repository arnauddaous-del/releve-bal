# Imprim Bal : notes pour les prochaines modifications

Ce dépôt est la version de référence de l'app (GitHub Pages : https://arnauddaous-del.github.io/releve-bal/).
Toute modification se fait ici, puis se pousse sur `main` ; Pages republie tout seul.

## Structure
- `index.html` : toute l'app (interface, comptage de la grille, analyse des étiquettes, liste de prénoms). Le code des
  règles de lecture est en ligne dans la page : blocs `BalNames` (prénoms) et `BalCore` (grille + `parseLabel`).
- `ocr/bal-worker.js` : lecture PaddleOCR dans un Worker (détection v4, reconnaissance v6 small, relecture des lignes
  hésitantes, option « lecture renforcée » v6 medium en 3 morceaux `rec6m-*.wasm`). `ort.wasm.min.js` = onnxruntime-web 1.17.3.
- `sw.js` : hors ligne et mises à jour. **Après chaque modification, lancer `python3 outils/maj_sw.py`** pour changer
  la version du cache, sinon les téléphones gardent l'ancienne version.
- `manifest.webmanifest`, `icons/` : installation sur l'écran d'accueil.

## Règles voulues par Arnaud
- Toute la lecture se fait sur le téléphone ; aucune photo n'est envoyée.
- En haut de page : « Numéro de tournée » puis « Lieu de l'Imprim Bal » (en titre). Chaque lieu garde sa tournée, ses boîtes et sa mémoire de noms ; un nouveau lieu reprend la tournée en cours. Le fichier CSV s'appelle imprim-bal-tournee-<n>-<lieu>-<date>.csv.
- CSV : une ligne par boîte, `ordre_flashage;noms_prenoms;numero_appartement;pub` (noms séparés par « / »,
  pub = `STOP PUB` pour toute forme de refus de publicité, y compris en basque et lectures déformées, sinon `OK PUB`).
  Option décochée par défaut : colonne `lieu` en premier.
- Textes de l'interface en français.

## Tester
Servir le dossier en local (`python3 -m http.server`) et ouvrir `http://localhost:8000/` : le service worker
fonctionne sur localhost. Vérifier une lecture, l'export CSV, puis une lecture hors ligne.

Une ancienne copie de la page existe aussi en artifact Claude (« Imprim Bal ») ; elle renvoie vers cette version.
