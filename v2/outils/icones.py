#!/usr/bin/env python3
"""Imprim Bal 2 — dessine les icônes de l'app dans v2/icons/ (fond clair, quatre boîtes, une boîte en surbrillance).
Usage : python3 v2/outils/icones.py   (demande Pillow)"""
import os
from PIL import Image, ImageDraw

V2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOND_HAUT, FOND_BAS = (255, 255, 255), (232, 236, 239)
BOITE, VIVE = (14, 110, 107), (19, 214, 201)
K = 4  # dessin en grand, puis réduction : bords nets


def dessin(taille, bloc, coins):
    """taille : côté final ; bloc : part du côté occupée par les quatre boîtes ; coins : rayon des coins du fond (0 = carré plein)."""
    n = taille * K
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    fond = Image.new('RGBA', (n, n))
    px = fond.load()
    for y in range(n):
        t = y / (n - 1)
        c = tuple(round(FOND_HAUT[i] + (FOND_BAS[i] - FOND_HAUT[i]) * t) for i in range(3)) + (255,)
        for x in range(n):
            px[x, y] = c
    masque = Image.new('L', (n, n), 0)
    ImageDraw.Draw(masque).rounded_rectangle([0, 0, n - 1, n - 1], radius=round(coins * n), fill=255)
    img.paste(fond, (0, 0), masque)
    d = ImageDraw.Draw(img)
    total = bloc * n
    ecart = total * 0.095
    cote = (total - ecart) / 2
    x0 = y0 = (n - total) / 2
    for r in range(2):
        for c in range(2):
            x, y = x0 + c * (cote + ecart), y0 + r * (cote + ecart)
            d.rounded_rectangle([x, y, x + cote, y + cote], radius=cote * 0.24, fill=VIVE if (r, c) == (0, 0) else BOITE)
    return img.resize((taille, taille), Image.LANCZOS)


def main():
    dossier = os.path.join(V2, 'icons')
    os.makedirs(dossier, exist_ok=True)
    dessin(512, 0.56, 0.225).save(os.path.join(dossier, 'icon-512.png'), optimize=True)
    dessin(192, 0.56, 0.225).save(os.path.join(dossier, 'icon-192.png'), optimize=True)
    dessin(512, 0.46, 0).convert('RGB').save(os.path.join(dossier, 'maskable-512.png'), optimize=True)
    dessin(180, 0.56, 0).convert('RGB').save(os.path.join(dossier, 'apple-touch-icon.png'), optimize=True)
    dessin(48, 0.62, 0.225).save(os.path.join(dossier, 'favicon-48.png'), optimize=True)
    print('icônes écrites dans', dossier)


if __name__ == '__main__':
    main()
