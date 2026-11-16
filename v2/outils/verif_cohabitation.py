#!/usr/bin/env python3
"""Imprim Bal — vérifie dans un vrai Chrome que la V1 et la V2 cohabitent (règle n°1 du chantier V2).
À relancer avant chaque publication de la V2.

Le script travaille sur une COPIE jetable du dépôt (dossier temporaire), servie comme sur GitHub Pages :
/releve-bal/ (V1) et /releve-bal/v2/ (V2). Il y simule des mises à jour ; le dépôt lui-même n'est jamais modifié.
Les données d'essai sont inventées (aucun vrai nom).

Usage : python3 v2/outils/verif_cohabitation.py [dossier_pour_les_captures]
Demande : pip install playwright pillow, et Chrome ou Chromium (variable CHROME pour donner son chemin)."""
import base64, functools, http.server, io, json, os, re, shutil, sys, tempfile, threading, time
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

DEPOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = tempfile.mkdtemp(prefix='imprimbal-verif-')
shutil.copytree(DEPOT, os.path.join(SITE, 'releve-bal'), ignore=shutil.ignore_patterns('.git', 'banc'))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SITE, 'captures')
os.makedirs(SHOTS, exist_ok=True)
CHROME = os.environ.get('CHROME') or next((c for c in ('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser') if os.path.exists(c)), None)
ok_n = ko_n = 0


def check(nom, cond, detail=''):
    global ok_n, ko_n
    if cond: ok_n += 1
    else: ko_n += 1
    print(('  OK   ' if cond else '  ÉCHEC ') + nom + ((' — ' + str(detail)) if detail else ''))


class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://localhost:%d' % srv.server_address[1]
V1, V2 = BASE + '/releve-bal/', BASE + '/releve-bal/v2/'


def mini(texte):
    im = Image.new('RGB', (480, 300), (205, 213, 220))
    d = ImageDraw.Draw(im); d.rectangle([60, 110, 420, 190], fill=(255, 255, 255)); d.text((80, 140), texte, fill=(20, 32, 43))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=72)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()


def boite(i, name, apt='', pub='OK PUB', check_=False, ok=True, thumb=True, **k):
    b = {'id': 'b%d' % i, 'photo': 1, 'row': (i // 2) + 1, 'col': (i % 2) + 1, 'name': name, 'apt': apt, 'pub': pub, 'check': check_,
         'empty': not name and not apt, 'raw': name.replace('\n', ' | '), 'thumb': mini(name or 'vide') if thumb else '', 'alt': [], 'sug': [], 'orig': name, 'ok': ok}
    b.update(k); return b


# Données V1 d'essai (noms inventés)
DONNEES_V1 = {'v': 4, 'cur': 'p2', 'assist': False, 'projects': [
    {'id': 'p1', 'tournee': '12', 'address': 'Résidence des Essais, 3 rue du Banc', 'created': 1761990000000,
     'lex': {'DUPONT': {'w': 'DUPONT', 'n': 2}, 'MARIE': {'w': 'Marie', 'n': 1}},
     'state': {'boxes': [boite(0, 'DUPONT Marie\nDUPONT Jean', 'C02', 'STOP PUB'), boite(1, 'M MARTIN Pierre', 'A12'),
                         boite(2, '', '', thumb=False), boite(3, 'Mlle DURAND Sophie', 'B07', 'STOP PUB', check_=True, ok=False, alt=['Mlle DURAND Sophia'], sug=[{'f': 'DURAND', 't': 'DURANT'}])],
               'sep': ';', 'place': 'end', 'cols': 2, 'rows': 2, 'photoCount': 1, 'addrCol': False, 'scan': 'v'}},
    {'id': 'p2', 'tournee': '7B', 'address': 'Immeuble Test <b>&</b> "Cie"', 'created': 1762500000000, 'lex': {},
     'state': {'boxes': [boite(10, 'ETCHEVERRY Maialen', '204'), boite(11, 'LOPEZ Ana / LOPEZ Iker', '#108', thumb=False)],
               'sep': ',', 'place': 'end', 'cols': 2, 'rows': 1, 'photoCount': 1, 'addrCol': True, 'scan': 'h'}},
    {'id': 'p3', 'tournee': '7B', 'address': '', 'created': 1762600000000, 'lex': {}, 'state': {'boxes': []}},
]}

JS_ETAT = """async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const c = navigator.serviceWorker.controller;
  return { titre: document.title, url: location.href, controleur: c ? c.scriptURL : null,
    portee: reg ? reg.scope : null, caches: (await caches.keys()).sort(),
    cles: Object.keys(localStorage).sort() };
}"""
JS_PRET = "async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); return !!navigator.serviceWorker.controller; }"


def etat(page):
    for _ in range(40):
        try:
            return page.evaluate(JS_ETAT)
        except Exception:
            time.sleep(0.25)      # la page est en train de se recharger
    return page.evaluate(JS_ETAT)


def attendre(page, pred, t=20, pas=0.15):
    fin = time.time() + t
    while time.time() < fin:
        try:
            if pred(): return True
        except Exception:
            pass
        time.sleep(pas)
    return False


def remplacer_dans(fichier, motif, par):
    p = os.path.join(SITE, 'releve-bal', fichier)
    s = open(p, encoding='utf-8').read()
    s2, n = re.subn(motif, par, s)
    assert n == 1, (fichier, motif, n)
    open(p, 'w', encoding='utf-8').write(s2)


with sync_playwright() as p:
    nav = p.chromium.launch(executable_path=CHROME, headless=True, args=['--no-sandbox'])
    mobile = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='fr-FR',
                  user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36')

    # ============ A. Navigateur neuf : la V2 seule ============
    print('\nA. Navigateur neuf, V2 seule')
    ctx = nav.new_context(**mobile); page = ctx.new_page()
    erreurs = []; page.on('pageerror', lambda e: erreurs.append(str(e))); page.on('console', lambda m: erreurs.append(m.text) if m.type == 'error' else None)
    page.goto(V2); check('la V2 s\'ouvre', page.title() == 'Imprim Bal 2', page.title())
    check('service worker V2 actif et aux commandes', page.evaluate(JS_PRET))
    e = etat(page)
    check('portée du service worker = v2/', e['portee'] == V2, e['portee'])
    check('un seul cache, préfixe imprimbal2-', len(e['caches']) == 1 and e['caches'][0].startswith('imprimbal2-app-'), e['caches'])
    check('sans données V1 : pas de proposition de reprise', page.locator('.reprise').count() == 0)
    check('état vide affiché', page.locator('#accueil-vide').is_visible())
    page.screenshot(path=SHOTS + '/a1-accueil-vide.png')
    cdp = ctx.new_cdp_session(page)
    idv2 = cdp.send('Page.getAppId'); inst = cdp.send('Page.getInstallabilityErrors')
    print('     identité V2 :', idv2, '| erreurs d\'installabilité :', inst.get('installabilityErrors'))
    ctx.set_offline(True); page.reload()
    check('hors ligne : la V2 se recharge', page.title() == 'Imprim Bal 2' and page.locator('#btn-nouveau').is_visible())
    ctx.set_offline(False)
    check('aucune erreur JavaScript', not erreurs, erreurs[:3])
    ctx.close()

    # ============ B. Le cas du téléphone : V1 déjà installée, puis première visite de la V2 ============
    print('\nB. V1 déjà en place, puis première ouverture de la V2')
    ctx = nav.new_context(**mobile); page = ctx.new_page()
    erreurs = []; page.on('pageerror', lambda e: erreurs.append(str(e)))
    page.goto(V1); check('la V1 s\'ouvre', page.title() == 'Imprim Bal', page.title())
    check('service worker V1 actif', page.evaluate(JS_PRET))
    page.evaluate('d => localStorage.setItem("releve-bal-v4", JSON.stringify(d))', DONNEES_V1)
    page.reload(); page.wait_for_timeout(800)
    e1 = etat(page)
    check('V1 : ses 3 lieux sont là', page.locator('#projSel option').count() == 3, page.locator('#projSel option').count())
    check('V1 : contrôlée par son service worker', (e1['controleur'] or '').endswith('/releve-bal/sw.js'), e1['controleur'])
    caches_v1 = [c for c in e1['caches'] if c.startswith('releve-bal-')]
    check('V1 : ses caches existent', len(caches_v1) >= 2, e1['caches'])
    cdp = ctx.new_cdp_session(page); idv1 = cdp.send('Page.getAppId')
    print('     identité V1 :', idv1)
    check('identités d\'app différentes (deux apps sur l\'écran d\'accueil)', idv1.get('appId') != idv2.get('appId'), (idv1.get('appId'), idv2.get('appId')))

    # première navigation vers v2/ : c'est le service worker de la V1 qui répond
    t0 = time.time(); titres = []
    page.goto(V2, wait_until='domcontentloaded'); titres.append(page.title())
    gueri = attendre(page, lambda: page.title() == 'Imprim Bal 2' and page.evaluate('() => !!navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith("/v2/sw.js")'), t=30)
    dt = time.time() - t0
    print('     première page servie à l\'adresse v2/ : « %s » ; V2 affichée après %.1f s' % (titres[0], dt))
    check('la V2 finit par s\'afficher toute seule à son adresse', gueri)
    page.wait_for_timeout(500)
    e2 = etat(page)
    check('V2 : contrôlée par SON service worker', (e2['controleur'] or '').endswith('/releve-bal/v2/sw.js'), e2['controleur'])
    check('les caches de la V1 sont intacts', all(c in e2['caches'] for c in caches_v1), e2['caches'])
    page.reload(); page.wait_for_timeout(400)
    check('rechargement : toujours la V2', page.title() == 'Imprim Bal 2', page.title())

    # ---- reprise des lieux ----
    print('\nC. Reprise des lieux de la V1')
    ref = page.evaluate('() => localStorage.getItem("releve-bal-v4")')
    carte = page.locator('.reprise')
    check('la reprise est proposée', carte.count() == 1 and '2 lieux et 6 boîtes' in carte.inner_text(), carte.inner_text() if carte.count() else '')
    page.screenshot(path=SHOTS + '/c1-reprise-proposee.png')
    carte.locator('[data-act=reprendre]').click()
    check('2 lieux apparaissent', attendre(page, lambda: page.locator('#liste-lieux .carte').count() == 2), page.locator('#liste-lieux .carte').count())
    page.wait_for_timeout(300)
    apres = page.evaluate('() => localStorage.getItem("releve-bal-v4")')
    check('la clé V1 « releve-bal-v4 » est inchangée, à l\'octet près', ref == apres)
    e3 = etat(page)
    nouvelles = [k for k in e3['cles'] if k not in ('releve-bal-v4', 'releve-bal-v3')]
    check('toutes les clés écrites commencent par imprimbal2:', nouvelles and all(k.startswith('imprimbal2:') for k in nouvelles), nouvelles)
    noms = page.locator('#liste-lieux .carte-nom').all_inner_texts()
    check('noms des lieux repris, sans injection HTML', 'Immeuble Test <b>&</b> "Cie"' in noms and 'Résidence des Essais, 3 rue du Banc' in noms, noms)
    check('lieu le plus récent en premier', noms[0].startswith('Immeuble Test'), noms)
    n_img = page.evaluate("() => new Promise(ok => { const r = indexedDB.open('imprimbal2'); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').count(); q.onsuccess = () => ok(q.result); }; })")
    check('4 miniatures copiées dans IndexedDB', n_img == 4, n_img)
    regl = page.evaluate('() => JSON.parse(localStorage.getItem("imprimbal2:reglages"))')
    check('réglages repris du lieu ouvert dans la V1 (colonne lieu, séparateur, tournée)', regl == {'addrCol': True, 'sep': ',', 'lastTournee': '7B'}, regl)
    check('la proposition a disparu', page.locator('.reprise').count() == 0)
    page.wait_for_timeout(2800)
    page.screenshot(path=SHOTS + '/c2-accueil-lieux.png')

    page.locator('#liste-lieux .carte', has_text='Résidence des Essais').click()
    check('écran du lieu', page.locator('#lieu-nom').inner_text() == 'Résidence des Essais, 3 rue du Banc' and page.locator('#lieu-meta').inner_text() == 'Tournée 12 · 4 boîtes · 1 à vérifier', page.locator('#lieu-meta').inner_text())
    check('4 boîtes, dans l\'ordre', page.locator('#liste-boites .boite').count() == 4 and 'DUPONT Marie' in page.locator('#liste-boites .boite').nth(0).inner_text())
    check('boîte vide = « BAL Sans Nom »', 'BAL Sans Nom' in page.locator('#liste-boites .boite').nth(2).inner_text())
    check('miniatures affichées', attendre(page, lambda: page.locator('#liste-boites img.prete').count() == 3), page.locator('#liste-boites img.prete').count())
    lieu = page.evaluate('() => { const id = location.hash.split("/").pop(); return JSON.parse(localStorage.getItem("imprimbal2:lieu:" + id)); }')
    check('sens de lecture, mémoire de noms, suggestions conservés', lieu['scan'] == 'v' and lieu['lex'].get('DUPONT', {}).get('n') == 2 and lieu['boxes'][3]['alt'] == ['Mlle DURAND Sophia'] and lieu['boxes'][3]['sug'] == [{'f': 'DURAND', 't': 'DURANT'}] and 'thumb' not in lieu['boxes'][0], {k: lieu[k] for k in ('scan', 'lex')})
    page.screenshot(path=SHOTS + '/c3-lieu.png', full_page=True)

    # ---- supprimer / annuler ----
    print('\nD. Supprimer, annuler, nouveau relevé')
    page.locator('#btn-actions').click(); page.wait_for_timeout(350)
    page.screenshot(path=SHOTS + '/d1-feuille-actions.png')
    page.locator('[data-act=supprimer-lieu]').click()
    check('retour à l\'accueil, 1 lieu restant', attendre(page, lambda: page.locator('#ecran-accueil').is_visible() and page.locator('#liste-lieux .carte').count() == 1))
    check('bandeau « Lieu supprimé · Annuler »', page.locator('#bandeau').inner_text().replace('\n', ' ').startswith('Lieu supprimé') and page.locator('#bandeau button').inner_text() == 'Annuler', page.locator('#bandeau').inner_text())
    page.screenshot(path=SHOTS + '/d2-bandeau-annuler.png')
    page.locator('#bandeau button').click()
    check('Annuler : le lieu revient', attendre(page, lambda: page.locator('#liste-lieux .carte').count() == 2))
    n_img2 = page.evaluate("() => new Promise(ok => { const r = indexedDB.open('imprimbal2'); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').count(); q.onsuccess = () => ok(q.result); }; })")
    check('ses miniatures sont toujours là', n_img2 == 4, n_img2)
    # glisser vers la gauche pour supprimer
    c = page.locator('#liste-lieux .carte', has_text='Immeuble Test'); bb = c.bounding_box()
    page.mouse.move(bb['x'] + bb['width'] - 30, bb['y'] + bb['height'] / 2); page.mouse.down()
    for k in range(1, 13): page.mouse.move(bb['x'] + bb['width'] - 30 - 20 * k, bb['y'] + bb['height'] / 2 + (1 if k % 2 else 0))
    page.screenshot(path=SHOTS + '/d3-glisser.png'); page.mouse.up()
    check('glisser à gauche supprime le lieu', attendre(page, lambda: page.locator('#liste-lieux .carte').count() == 1 and page.locator('#bandeau').is_visible()))
    check('sans appui sur Annuler : supprimé après 5 s', attendre(page, lambda: not page.locator('#bandeau').is_visible(), t=8) and page.locator('#liste-lieux .carte').count() == 1)
    page.wait_for_timeout(400)
    cles = page.evaluate('() => Object.keys(localStorage).filter(k => k.startsWith("imprimbal2:lieu:")).length')
    check('le lieu supprimé n\'est plus enregistré', cles == 1, cles)
    # nouveau relevé
    page.locator('#btn-nouveau').click(); page.wait_for_timeout(350)
    check('feuille « Nouveau relevé » : tournée pré-remplie avec la dernière', page.locator('#n-tournee').input_value() == '7B', page.locator('#n-tournee').input_value())
    check('« Continuer » inactif sans lieu', page.locator('#f-nouveau button').is_disabled())
    page.screenshot(path=SHOTS + '/d4-nouveau-releve.png')
    page.locator('#n-lieu').fill('12 allée des Tests'); page.locator('#f-nouveau button').click()
    check('le nouveau lieu s\'ouvre', attendre(page, lambda: page.locator('#ecran-lieu').is_visible() and page.locator('#lieu-nom').inner_text() == '12 allée des Tests'))
    check('sous-titre du lieu vide', page.locator('#lieu-meta').inner_text() == 'Tournée 7B · 0 boîte', page.locator('#lieu-meta').inner_text())
    page.screenshot(path=SHOTS + '/d5-lieu-vide.png')
    page.go_back(); page.wait_for_timeout(300)
    check('touche Retour : accueil, 2 lieux', page.locator('#ecran-accueil').is_visible() and page.locator('#liste-lieux .carte').count() == 2, page.url)
    page.locator('#btn-reglages').click(); page.wait_for_timeout(900)
    check('réglages : reprise déjà faite, version affichée', 'Tout est repris' in page.locator('#feuille').inner_text() and re.search(r'· [0-9a-f]{10}', page.locator('#version').inner_text() or ''), page.locator('#feuille').inner_text())
    page.screenshot(path=SHOTS + '/d6-reglages.png')
    page.go_back(); page.wait_for_timeout(350)
    check('touche Retour : ferme la feuille, reste sur l\'accueil', not page.locator('#feuille').is_visible() and page.locator('#ecran-accueil').is_visible())
    check('aucune erreur JavaScript côté V2', not erreurs, erreurs[:3])

    # ---- retour dans la V1 ----
    print('\nE. La V1 après tout ça')
    page.goto(V1); page.wait_for_timeout(800)
    e4 = etat(page)
    check('la V1 s\'ouvre à son adresse', e4['titre'] == 'Imprim Bal' and e4['url'] == V1, (e4['titre'], e4['url']))
    check('V1 : toujours contrôlée par son service worker', (e4['controleur'] or '').endswith('/releve-bal/sw.js'), e4['controleur'])
    check('V1 : ses 3 lieux et ses boîtes sont intacts', page.locator('#projSel option').count() == 3 and page.locator('#list .row').count() == 2, (page.locator('#projSel option').count(), page.locator('#list .row').count()))
    v1now = json.loads(page.evaluate('() => localStorage.getItem("releve-bal-v4")'))
    check('V1 : données identiques à avant la V2', v1now == json.loads(ref))
    check('les deux jeux de caches coexistent', any(c.startswith('imprimbal2-app-') for c in e4['caches']) and all(c in e4['caches'] for c in caches_v1), e4['caches'])

    # ---- mises à jour croisées ----
    print('\nF. Une mise à jour de l\'une ne vide pas le cache de l\'autre')
    cache_v2 = [c for c in e4['caches'] if c.startswith('imprimbal2-')]
    remplacer_dans('sw.js', r"releve-bal-app-[0-9a-f]+", 'releve-bal-app-ffffffffff')          # simule une mise à jour de la V1 (copie jetable)
    page.evaluate('async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); }')
    check('V1 : « Mettre à jour » proposé', attendre(page, lambda: page.locator('#pwaUpdate').is_visible(), t=20))
    page.locator('#pwaUpdateBtn').click()
    check('V1 mise à jour', attendre(page, lambda: 'releve-bal-app-ffffffffff' in etat(page)['caches'], t=20))
    page.wait_for_timeout(600); e5 = etat(page)
    check('après mise à jour de la V1 : cache V2 intact', all(c in e5['caches'] for c in cache_v2), e5['caches'])
    check('V1 : ancien cache d\'app supprimé, nouveau en place', sum(c.startswith('releve-bal-app-') for c in e5['caches']) == 1, e5['caches'])

    page.goto(V2); page.wait_for_timeout(300)
    check('V2 toujours là après la mise à jour de la V1', page.title() == 'Imprim Bal 2' and page.locator('#liste-lieux .carte').count() == 2)
    # mise à jour de la V2 en cours d'utilisation : proposée par le bandeau
    page.wait_for_timeout(6500); page.mouse.click(200, 60)
    remplacer_dans('v2/sw.js', r"imprimbal2-app-[0-9a-f]+", 'imprimbal2-app-aaaaaaaaaa')
    page.evaluate('async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); }')
    check('V2 : « Nouvelle version prête · Mettre à jour » proposé', attendre(page, lambda: page.locator('#bandeau').is_visible() and 'Nouvelle version' in page.locator('#bandeau').inner_text(), t=20))
    page.screenshot(path=SHOTS + '/f1-nouvelle-version.png')
    page.locator('#bandeau button').click()
    check('V2 mise à jour', attendre(page, lambda: etat(page)['caches'].count('imprimbal2-app-aaaaaaaaaa') == 1 and not any(c in etat(page)['caches'] for c in cache_v2), t=20), None)
    page.wait_for_timeout(600); e6 = etat(page)
    check('après mise à jour de la V2 : caches V1 intacts', all(c in e6['caches'] for c in e5['caches'] if c.startswith('releve-bal-')), e6['caches'])
    check('V2 : lieux toujours là après sa mise à jour', page.locator('#liste-lieux .carte').count() == 2)
    # mise à jour de la V2 trouvée à l'ouverture : appliquée toute seule
    remplacer_dans('v2/sw.js', r"imprimbal2-app-[0-9a-f]+", 'imprimbal2-app-bbbbbbbbbb')
    page.goto(V2)
    check('V2 : une mise à jour trouvée à l\'ouverture s\'installe toute seule', attendre(page, lambda: etat(page)['caches'].count('imprimbal2-app-bbbbbbbbbb') == 1 and 'imprimbal2-app-aaaaaaaaaa' not in etat(page)['caches'], t=20), None)
    page.wait_for_timeout(800)
    check('… et la page reste la V2, avec ses lieux', page.title() == 'Imprim Bal 2' and page.locator('#liste-lieux .carte').count() == 2)

    # ---- hors ligne, les deux ----
    print('\nG. Hors ligne')
    ctx.set_offline(True)
    page.goto(V2); check('V2 hors ligne', page.title() == 'Imprim Bal 2' and page.locator('#liste-lieux .carte').count() == 2)
    page.locator('#liste-lieux .carte').first.click(); page.wait_for_timeout(300)
    check('V2 hors ligne : un lieu s\'ouvre', page.locator('#ecran-lieu').is_visible())
    page.goto(V1); check('V1 hors ligne', page.title() == 'Imprim Bal' and page.locator('#projSel option').count() == 3)
    ctx.set_offline(False)

    # ---- adresse sans la barre finale ----
    print('\nH. Adresse tapée sans la barre finale (…/v2)')
    page.goto(BASE + '/releve-bal/v2'); page.wait_for_timeout(1500)
    print('     …/v2 (sans barre) avec la V1 installée → page « %s » à l\'adresse %s' % (page.title(), page.url))
    page.goto(V2 + 'index.html'); page.wait_for_timeout(500)
    check('…/v2/index.html → V2', page.title() == 'Imprim Bal 2', page.title())
    ctx.close()

    # ============ I. Apparence : sombre ============
    ctx = nav.new_context(color_scheme='dark', **mobile); page = ctx.new_page()
    page.goto(V2); page.evaluate(JS_PRET)
    page.evaluate('d => localStorage.setItem("releve-bal-v4", JSON.stringify(d))', DONNEES_V1); page.reload(); page.wait_for_timeout(300)
    page.screenshot(path=SHOTS + '/i1-sombre-reprise.png')
    page.locator('[data-act=reprendre]').click(); page.wait_for_timeout(3200)
    page.screenshot(path=SHOTS + '/i2-sombre-accueil.png')
    page.locator('#liste-lieux .carte', has_text='Résidence des Essais').click(); page.wait_for_timeout(900)
    page.screenshot(path=SHOTS + '/i3-sombre-lieu.png')
    ctx.close(); nav.close()

print('\n%d vérifications réussies, %d échec(s)' % (ok_n, ko_n))
print('captures :', SHOTS)
shutil.rmtree(os.path.join(SITE, 'releve-bal'), ignore_errors=True)
sys.exit(1 if ko_n else 0)
