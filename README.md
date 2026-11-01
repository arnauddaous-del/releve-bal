# Relevé BAL

Application web installable pour relever les noms et numéros d'appartement écrits sur les boîtes aux lettres, dans l'ordre des boîtes, et les exporter en CSV (`ordre;destinataire;numero_appartement;pub`).

Toute la lecture se fait sur le téléphone : aucune photo n'est envoyée.

## Installer sur le téléphone
- **Android (Chrome)** : ouvrir l'adresse de l'app, puis toucher « Installer l'app » (ou menu ⋮ › « Installer l'application »).
- **iPhone (Safari)** : ouvrir l'adresse, toucher Partager, puis « Sur l'écran d'accueil ».

Après le premier chargement, l'app et les modèles de lecture (environ 26 Mo) restent sur le téléphone et fonctionnent sans réseau. La lecture renforcée télécharge 38 Mo de plus la première fois qu'elle sert.

## Contenu
- `index.html` : l'application
- `sw.js` : fonctionnement hors ligne et mises à jour
- `ocr/` : moteur ONNX Runtime Web et modèles PaddleOCR (détection PP-OCRv4, lecture PP-OCRv6 small, lecture renforcée PP-OCRv6 medium)

Modèles PaddleOCR sous licence Apache 2.0 ; ONNX Runtime sous licence MIT.
