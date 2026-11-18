#!/usr/bin/env python3
"""Imprim Bal 2 — parcours complet dans un vrai Chrome (caméra simulée) :
nouveau relevé → caméra → photo → grille → lecture → Résultat → correction, ordre, suppression/annulation →
export CSV et Excel → relecture hors ligne. Avec la photo inventée du banc (aucun vrai nom).

Usage : python3 v2/outils/verif_parcours.py [dossier_pour_les_captures] [--photo autre.jpg --grille 3x4]
Le dépôt n'est jamais modifié (copie jetable servie comme sur GitHub Pages)."""
import csv, functools, http.server, io, os, re, shutil, sys, tempfile, threading, time, zipfile
from playwright.sync_api import sync_playwright

DEPOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[1:]
def opt(nom, defaut):
    if nom in args:
        i = args.index(nom); v = args[i + 1]; del args[i:i + 2]; return v
    return defaut
EXEMPLE = os.path.join(DEPOT, 'v2', 'banc', 'exemple', 'residence-inventee')
PHOTO = opt('--photo', os.path.join(EXEMPLE, 'photo.jpg'))
GRILLE = opt('--grille', '3x4')
SITE = tempfile.mkdtemp(prefix='imprimbal-parcours-')
shutil.copytree(DEPOT, os.path.join(SITE, 'releve-bal'), ignore=shutil.ignore_patterns('.git', 'banc'))
SHOTS = args[0] if args else os.path.join(SITE, 'captures')
os.makedirs(SHOTS, exist_ok=True)
CHROME = os.environ.get('CHROME') or next((c for c in ('/usr/bin/google-chrome', '/usr/bin/chromium') if os.path.exists(c)), None)
ok_n = ko_n = 0


def check(nom, cond, detail=''):
    global ok_n, ko_n
    if cond: ok_n += 1
    else: ko_n += 1
    print(('  OK   ' if cond else '  ÉCHEC ') + nom + ((' — ' + str(detail)) if detail else ''), flush=True)


class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
V2 = 'http://localhost:%d/releve-bal/v2/' % srv.server_address[1]
attendu = []
if PHOTO.startswith(EXEMPLE):
    with open(os.path.join(EXEMPLE, 'releve.csv'), encoding='utf-8-sig') as f:
        lignes = list(csv.reader(f, delimiter=';'))
    attendu = [l for l in lignes if l and l[0].isdigit()]


def visible(page, sel):
    return page.evaluate('s => { const e = document.querySelector(s); return !!e && !e.closest("[hidden]") && e.offsetParent !== null; }', sel)


def lire_photo(page, chrono):
    page.set_input_files('#f-galerie', PHOTO)
    page.wait_for_selector('#bas-grille:not([hidden])', timeout=20000)
    cols, rangs = [int(x) for x in GRILLE.lower().split('x')]
    for quoi, voulu in (('cols', cols), ('rangs', rangs)):
        for _ in range(20):
            n = int(page.inner_text('#n-' + quoi))
            if n == voulu: break
            page.click('[data-pas="%s:%d"]' % (quoi, 1 if n < voulu else -1))
    t0 = time.time()
    page.click('#btn-lire')
    page.wait_for_selector('#ecran-lieu:not([hidden])', timeout=600000)
    chrono.append(time.time() - t0)


with sync_playwright() as p:
    nav = p.chromium.launch(executable_path=CHROME, headless=True, args=['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
    ctx = nav.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True, permissions=['camera'])
    page = ctx.new_page()
    erreurs = []
    page.on('pageerror', lambda e: erreurs.append(str(e)))
    page.goto(V2)
    page.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller', timeout=30000)
    page.reload()

    print('Nouveau relevé et caméra')
    page.click('#btn-nouveau')
    page.fill('#n-tournee', '12')
    page.fill('#n-lieu', "Résidence inventée, 1 rue de l'Exemple")
    page.click('#f-nouveau button[type=submit]')
    page.wait_for_selector('#ecran-photo:not([hidden])', timeout=5000)
    check('« Continuer » ouvre directement la caméra', True)
    page.wait_for_function('document.querySelector("#video").videoWidth > 0', timeout=10000)
    check('l\'aperçu de la caméra tourne', True, page.evaluate('v => v.videoWidth + " x " + v.videoHeight', page.query_selector('#video')))
    page.wait_for_function('document.querySelector("#guide").textContent.length > 0', timeout=5000)
    check('aide à la prise de vue affichée', True, page.inner_text('#guide'))
    page.screenshot(path=os.path.join(SHOTS, '1-camera.png'))
    page.click('#btn-declencher')
    page.wait_for_selector('#bas-grille:not([hidden])', timeout=15000)
    check('le déclencheur prend la photo et montre la grille', True, page.inner_text('#grille-info'))
    page.click('#btn-reprendre')
    page.wait_for_function('document.querySelector("#video").videoWidth > 0', timeout=10000)
    check('« Reprendre » rouvre la caméra', visible(page, '#btn-declencher'))

    print('Photo, grille, lecture')
    chrono = []
    page.set_input_files('#f-galerie', PHOTO)
    page.wait_for_selector('#bas-grille:not([hidden])', timeout=20000)
    page.screenshot(path=os.path.join(SHOTS, '2-grille.png'))
    page.click('[data-sens="v"]')
    check('sens de lecture : colonne par colonne', page.get_attribute('[data-sens="v"]', 'aria-checked') == 'true')
    page.click('[data-sens="h"]')
    page.click('#btn-reprendre')
    lire_photo(page, chrono)
    n = page.eval_on_selector_all('#liste-boites > li', 'l => l.length')
    cols, rangs = [int(x) for x in GRILLE.lower().split('x')]
    check('toutes les boîtes lues', n == cols * rangs, '%d boîtes en %.1f s (%.2f s par boîte)' % (n, chrono[0], chrono[0] / max(1, n)))
    check('aucune erreur dans la page', not erreurs, erreurs[:3])
    meta = page.inner_text('#lieu-meta')
    check('en-tête « N boîtes · M à vérifier »', re.search(r'\d+ boîtes?', meta) is not None, meta)
    page.screenshot(path=os.path.join(SHOTS, '3-resultat.png'), full_page=True)
    lus = page.evaluate('''() => { const id = location.hash.split('/')[2]; return JSON.parse(localStorage.getItem('imprimbal2:lieu:' + id)).boxes; }''')
    if attendu:
        justes = sum(1 for b, a in zip(lus, attendu) if (' / '.join(x for x in b['name'].split('\n') if x) or 'BAL Sans Nom') == a[1] and b['apt'] == a[2] and b['pub'] == a[3])
        print('    lecture : %d / %d boîtes justes sur la photo inventée' % (justes, len(attendu)))
        for b, a in zip(lus, attendu):
            print('      %-40s | lu : %s | %s | %s' % (a[1][:40], b['name'].replace('\n', ' / '), b['apt'], b['pub']))
    mini = page.evaluate('''() => new Promise(ok => { const r = indexedDB.open('imprimbal2'); r.onsuccess = () => { const c = r.result.transaction('images').objectStore('images').count(); c.onsuccess = () => ok(c.result); }; })''')
    check('miniature et photo pleine définition de chaque boîte dans IndexedDB', mini == 2 * n, mini)
    hd = page.evaluate('''() => new Promise(ok => { const id = location.hash.split('/')[2], b = JSON.parse(localStorage.getItem('imprimbal2:lieu:' + id)).boxes[0];
      const r = indexedDB.open('imprimbal2'); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').get('photo:' + b.id);
      q.onsuccess = () => createImageBitmap(q.result.blob).then(bm => ok({ w: bm.width, h: bm.height, taille: b.hdTaille })); }; })''')
    from PIL import Image as _I
    W0, H0 = _I.open(PHOTO).size
    check('photo de la boîte à la définition de la photo d\'origine', hd['w'] > 0 and abs(hd['w'] - W0 / cols) < W0 / cols * 0.6 and hd['taille'] == '%d × %d' % (hd['w'], hd['h']), hd)
    page.click('#liste-boites > li:nth-child(1) [data-act="corriger"]')
    page.wait_for_selector('.corr-photo[src]', timeout=5000)
    page.click('.corr-photo')
    page.wait_for_selector('#visionneuse:not([hidden])', timeout=5000)
    page.wait_for_function('document.querySelector("#vis-image").naturalWidth > 0', timeout=5000)
    check('la photo de la boîte s\'ouvre en plein écran, en pleine définition', page.evaluate('document.querySelector("#vis-image").naturalWidth') == hd['w'], page.inner_text('#vis-titre'))
    page.screenshot(path=os.path.join(SHOTS, '3b-visionneuse.png'))
    page.go_back(); page.wait_for_timeout(300)
    check('Retour ferme la photo, la feuille reste ouverte', page.is_hidden('#visionneuse') and page.is_visible('#c-noms'))
    page.go_back(); page.wait_for_timeout(400)

    print('Résultat : vérifier, corriger, réordonner, supprimer')
    nv = page.eval_on_selector_all('#liste-verif > li', 'l => l.length')
    if nv:
        page.click('#liste-verif > li:first-child [data-act="ok"]')
        check('« C\'est bon » retire la boîte des boîtes à vérifier', page.eval_on_selector_all('#liste-verif > li', 'l => l.length') == nv - 1)
    page.click('#liste-boites > li:nth-child(1) [data-act="corriger"]')
    page.wait_for_selector('#c-noms', timeout=3000)
    page.fill('#c-noms', 'DUPONT Essai')
    page.click('[data-pub="STOP PUB"]')
    page.click('[data-act="c-ok"]')
    page.wait_for_timeout(400)
    b1 = page.evaluate('''() => { const id = location.hash.split('/')[2]; return JSON.parse(localStorage.getItem('imprimbal2:lieu:' + id)).boxes[0]; }''')
    check('correction gardée (nom, STOP PUB, confirmée)', b1['name'] == 'DUPONT Essai' and b1['pub'] == 'STOP PUB' and b1['ok'], b1['name'])
    avant = page.evaluate('''() => { const id = location.hash.split('/')[2]; return JSON.parse(localStorage.getItem('imprimbal2:lieu:' + id)).boxes.map(b => b.id); }''')
    h = page.query_selector('#liste-boites > li:nth-child(1) .poignee').bounding_box()
    hauteur = page.query_selector('#liste-boites > li:nth-child(1)').bounding_box()['height']
    page.mouse.move(h['x'] + h['width'] / 2, h['y'] + h['height'] / 2); page.mouse.down()
    for k in range(1, 11): page.mouse.move(h['x'] + h['width'] / 2, h['y'] + h['height'] / 2 + k * hauteur * 2.1 / 10)
    page.mouse.up(); page.wait_for_timeout(300)
    apres = page.evaluate('''() => { const id = location.hash.split('/')[2]; return JSON.parse(localStorage.getItem('imprimbal2:lieu:' + id)).boxes.map(b => b.id); }''')
    check('glisser la poignée change l\'ordre de flashage', apres[2] == avant[0] and apres[0] == avant[1], 'boîte 1 → place 3')
    page.click('#liste-boites > li:nth-child(2) [data-act="corriger"]')
    page.wait_for_selector('[data-act="c-supprimer"]', timeout=3000)
    page.click('[data-act="c-supprimer"]')
    page.wait_for_timeout(400)
    n2 = page.eval_on_selector_all('#liste-boites > li', 'l => l.length')
    check('« Supprimer cette boîte » sans question, avec Annuler', n2 == n - 1 and 'Annuler' in page.inner_text('#bandeau'))
    page.click('#bandeau button')
    page.wait_for_timeout(300)
    check('« Annuler » remet la boîte à sa place', page.evaluate('''() => { const id = location.hash.split('/')[2]; return JSON.parse(localStorage.getItem('imprimbal2:lieu:' + id)).boxes.map(b => b.id); }''') == apres)

    print('Partager')
    page.click('#btn-partager')
    with page.expect_download() as dl:
        page.click('[data-act="exp-csv"]')
    d = dl.value; chemin = os.path.join(SHOTS, d.suggested_filename); d.save_as(chemin)
    texte = open(chemin, encoding='utf-8-sig', newline='').read().split('\r\n')
    check('nom du fichier imprim-bal-tournee-<n>-<lieu>-<date>', re.match(r'imprim-bal-tournee-12-residence-inventee-1-rue-de-l-exemple-\d{4}-\d\d-\d\d\.csv$', d.suggested_filename), d.suggested_filename)
    check('CSV : titre, ligne vide, en-tête, une ligne par boîte',
          texte[:3] == ['Tournée : 12', "Lieu : Résidence inventée, 1 rue de l'Exemple", 'Nombre de PRE : %d' % n] and texte[3] == '' and texte[4] == 'ordre_flashage;noms_prenoms;numero_appartement;pub' and len(texte) == 5 + n,
          texte[:6])
    check('CSV : la boîte corrigée', any(l.startswith('3;DUPONT Essai;') and l.endswith(';STOP PUB') for l in texte))
    page.click('#btn-partager')
    with page.expect_download() as dl:
        page.click('[data-act="exp-xlsx"]')
    d = dl.value; chemin = os.path.join(SHOTS, d.suggested_filename); d.save_as(chemin)
    z = zipfile.ZipFile(chemin); feuille = z.read('xl/worksheets/sheet1.xml').decode()
    check('Excel : fichier valide, « Nombre de PRE » et « BAL Sans Nom » en italique s\'il y en a', 'Nombre de PRE : %d' % n in feuille, d.suggested_filename)

    print('Hors ligne')
    ctx.set_offline(True)
    page.reload()
    page.wait_for_selector('#ecran-lieu:not([hidden])', timeout=10000)
    page.click('#btn-photo')
    page.wait_for_selector('#ecran-photo:not([hidden])', timeout=5000)
    chrono2 = []
    lire_photo(page, chrono2)
    n3 = page.eval_on_selector_all('#liste-boites > li', 'l => l.length')
    check('lecture d\'une deuxième photo sans réseau', n3 == 2 * n, '%d boîtes, %.1f s' % (n3, chrono2[0]))
    check('toujours aucune erreur dans la page', not erreurs, erreurs[:3])
    page.screenshot(path=os.path.join(SHOTS, '4-hors-ligne.png'))
    nav.close()

print('\n%d vérifications réussies, %d échec(s)' % (ok_n, ko_n))
print('captures : ' + SHOTS)
sys.exit(1 if ko_n else 0)
