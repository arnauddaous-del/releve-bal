#!/usr/bin/env python3
"""Après toute modification de index.html, ocr/ ou icons/ : recalcule les versions de cache de sw.js
pour que les téléphones proposent « Mettre à jour ».  Usage : python3 outils/maj_sw.py"""
import hashlib, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def h(p): return hashlib.sha256(open(os.path.join(ROOT, p), 'rb').read()).hexdigest()[:10]
shell = ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
         'icons/apple-touch-icon.png', 'icons/favicon-48.png', 'ocr/ort.wasm.min.js', 'ocr/bal-worker.js']
models = ['ocr/ort-wasm-simd.wasm', 'ocr/det.wasm', 'ocr/rec6s.wasm', 'ocr/dict6.txt',
          'ocr/ort-wasm.wasm', 'ocr/rec6m-1.wasm', 'ocr/rec6m-2.wasm', 'ocr/rec6m-3.wasm']
app = hashlib.sha256(''.join(h(p) for p in shell).encode()).hexdigest()[:10]
mod = hashlib.sha256(''.join(h(p) for p in models).encode()).hexdigest()[:10]
p = os.path.join(ROOT, 'sw.js'); s = open(p, encoding='utf-8').read()
s = re.sub(r"releve-bal-app-[0-9a-f]+", 'releve-bal-app-' + app, s)
s = re.sub(r"releve-bal-models-[0-9a-f]+", 'releve-bal-models-' + mod, s)
open(p, 'w', encoding='utf-8').write(s)
print('app', app, 'modèles', mod)
