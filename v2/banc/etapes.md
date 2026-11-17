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
