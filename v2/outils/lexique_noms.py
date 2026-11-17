#!/usr/bin/env python3
"""Fabrique la liste des noms de famille utilisée par le dictionnaire de lecture (v2/js/moteur/lexique.mjs).

Source prévue pour l'app : le fichier des personnes décédées de l'INSEE (données publiques, Licence Ouverte 2.0),
https://www.insee.fr/fr/information/4190491 — des fichiers texte à largeur fixe, une personne par ligne, qui
commencent par « NOM*PRÉNOMS/ » sur 80 caractères. On compte combien de fois chaque nom apparaît.

  python3 v2/outils/lexique_noms.py deces-2020.txt deces-2021.txt ... -o v2/modeles/noms-famille.txt
  python3 v2/outils/lexique_noms.py liste.csv -o ...      (un CSV « nom,occurrences » déjà compté)

Sortie : une ligne par nom, « nom occurrences », du plus courant au plus rare, en minuscules sans accents,
seulement les noms vus au moins --min fois (10 par défaut : environ 235 000 noms, 2,8 Mo).
Le fichier ne contient que des noms de famille et leur fréquence, aucune autre donnée sur les personnes."""
import argparse
import collections
import csv
import sys
import unicodedata


def plier(nom):
    nom = unicodedata.normalize('NFD', nom)
    nom = ''.join(c for c in nom if unicodedata.category(c) != 'Mn').lower()
    return ' '.join(''.join(c if c.isalpha() or c in "-' " else ' ' for c in nom).split())


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('sources', nargs='+')
    a.add_argument('-o', '--sortie', required=True)
    a.add_argument('--min', type=int, default=10)
    o = a.parse_args()
    compte = collections.Counter()
    for f in o.sources:
        with open(f, encoding='utf-8', errors='replace') as h:
            if f.lower().endswith('.csv'):
                r = csv.reader(h)
                for ligne in r:
                    if len(ligne) < 2 or not ligne[1].strip().isdigit():
                        continue
                    n = plier(ligne[0])
                    if n:
                        compte[n] += int(ligne[1])
            else:
                for ligne in h:
                    champ = ligne[:80]
                    if '*' not in champ:
                        continue
                    n = plier(champ.split('*', 1)[0])
                    if n:
                        compte[n] += 1
    gardes = [(n, c) for n, c in compte.most_common() if c >= o.min]
    with open(o.sortie, 'w', encoding='utf-8') as h:
        for n, c in gardes:
            h.write(f'{n} {c}\n')
    print(f'{len(gardes)} noms écrits dans {o.sortie} ({len(compte)} vus en tout)', file=sys.stderr)


if __name__ == '__main__':
    main()
