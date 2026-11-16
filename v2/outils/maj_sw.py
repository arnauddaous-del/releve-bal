#!/usr/bin/env python3
"""Imprim Bal 2 — à lancer après toute modification dans v2/ :
recalcule la liste des fichiers de l'app et la version du cache dans v2/sw.js,
pour que les téléphones reçoivent la mise à jour.

Usage : python3 v2/outils/maj_sw.py
Ne lit et n'écrit que dans v2/ : aucun fichier de la V1 n'est touché."""
import hashlib
import json
import os
import re

V2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIERS = ['index.html', 'manifest.webmanifest']
DOSSIERS = ['css', 'js', 'icons']


def coquille():
    out = list(FICHIERS)
    for d in DOSSIERS:
        for racine, _, noms in os.walk(os.path.join(V2, d)):
            for n in noms:
                if n.startswith('.'):
                    continue
                out.append(os.path.relpath(os.path.join(racine, n), V2).replace(os.sep, '/'))
    return sorted(out)


def empreinte(fichiers):
    h = hashlib.sha256()
    for f in fichiers:
        h.update(f.encode())
        with open(os.path.join(V2, f), 'rb') as fh:
            h.update(hashlib.sha256(fh.read()).digest())
    return h.hexdigest()[:10]


def main():
    fichiers = coquille()
    version = empreinte(fichiers)
    chemin = os.path.join(V2, 'sw.js')
    with open(chemin, encoding='utf-8') as fh:
        s = fh.read()
    s, n1 = re.subn(r"var APP = 'imprimbal2-app-[0-9a-f]+';", "var APP = 'imprimbal2-app-" + version + "';", s)
    s, n2 = re.subn(r"var COQUILLE = \[[^\]]*\];", lambda _: 'var COQUILLE = ' + json.dumps(fichiers, ensure_ascii=False) + ';', s)
    if n1 != 1 or n2 != 1:
        raise SystemExit('sw.js : lignes APP ou COQUILLE introuvables, rien n\'a été écrit')
    with open(chemin, 'w', encoding='utf-8') as fh:
        fh.write(s)
    print('Imprim Bal 2 : version', version, '·', len(fichiers), 'fichiers')


if __name__ == '__main__':
    main()
