/* Le banc lit-il comme la vraie V1 ? Lit chaque photo deux fois : avec la vraie page de la V1 dans Chrome
   (celle du dépôt, servie en local), et avec le moteur V1 du banc (Node). Compare boîte par boîte.
   Usage : node parite-v1.mjs [--enregistrer] photo1.jpg [photo2.jpg …]      (CHROME=/chemin/vers/chrome si besoin)
   --enregistrer inscrit les totaux dans resultats.json et RESULTATS.md.
   N'affiche aucun nom : seulement des comptes et des distances. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { DEPOT } from './v1/charger.mjs';
import { ouvrirPhoto } from './image.mjs';
import { creerV1 } from './moteurs/v1.mjs';
import { distance } from './mesures.mjs';
import { lireResultats, ecrireResultats } from './resultats.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
function servir(racine) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(racine, p);
    if (!f.startsWith(racine) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

/* La vraie V1 : ouvre la photo, laisse la grille automatique, appuie sur « Lire les étiquettes », relit ce que l'app a enregistré. */
async function lireDansChrome(nav, base, photo) {
  const ctx = await nav.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(base + '/index.html');
  await page.addInitScript(() => { document.addEventListener('change', e => { if (e.target && e.target.files && e.target.files[0]) window.__photo = e.target.files[0]; }, true); });
  await page.reload();
  await page.setInputFiles('#fileGal', photo);
  await page.waitForFunction(() => !document.querySelector('#btnRead').disabled && document.querySelector('#gridMeta').textContent.trim() !== '', null, { timeout: 60000 });
  const cols = +(await page.inputValue('#cols')), rows = +(await page.inputValue('#rows'));
  // l'image réduite (700 px de large) que la page vient de calculer : mêmes lignes que loadPhoto (index.html l. 1726 à 1733)
  const petite = await page.evaluate(async () => {
    const file = document.querySelector('#fileGal').files[0] || window.__photo;
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = URL.createObjectURL(file); });
    const W = img.naturalWidth, H = img.naturalHeight, k = Math.min(1, 4200 / Math.max(W, H));
    const full = document.createElement('canvas'); full.width = Math.round(W * k); full.height = Math.round(H * k);
    full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);
    const sc = document.createElement('canvas'); sc.width = 700; sc.height = Math.max(1, Math.round(full.height * 700 / full.width));
    const sg = sc.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(full, 0, 0, sc.width, sc.height);
    const u8 = sg.getImageData(0, 0, sc.width, sc.height).data;
    let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
    return { width: sc.width, height: sc.height, b64: btoa(s) };
  });
  const t0 = Date.now();
  await page.click('#btnRead');
  await page.waitForFunction(() => document.querySelector('#btnRead').textContent === 'Lire les étiquettes' &&
    /ajoutée|pas pu démarrer|arrêtée/.test(document.querySelector('#readStatus').textContent), null, { timeout: 20 * 60000 });
  const statut = await page.textContent('#readStatus');
  if (!/ajoutée/.test(statut)) throw new Error('lecture V1 impossible dans Chrome');
  const ms = Date.now() - t0;
  await page.waitForTimeout(700);
  const store = JSON.parse(await page.evaluate(() => localStorage.getItem('releve-bal-v4')));
  await ctx.close();
  return { cols, rows, ms, petite: { width: petite.width, height: petite.height, data: new Uint8ClampedArray(Buffer.from(petite.b64, 'base64')) }, boites: store.projects[0].state.boxes.map(b => ({ r: b.row - 1, c: b.col - 1, name: b.name, apt: b.apt, pub: b.pub, check: b.check })) };
}

const enregistrer = process.argv.includes('--enregistrer');
const photos = process.argv.slice(2).filter(a => a !== '--enregistrer');
if (!photos.length) { console.error('Usage : node parite-v1.mjs [--enregistrer] photo1.jpg [photo2.jpg …]'); process.exit(2); }
const chrome = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(c => fs.existsSync(c));
const srv = await servir(DEPOT), base = 'http://localhost:' + srv.address().port;
const nav = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const moteur = await creerV1();
function comparer(web, banc) {
  const r = { n: 0, identiques: 0, noms: 0, apt: 0, pub: 0, check: 0, ecart: 0, lettres: 0 };
  const cle = b => b.r + ',' + b.c, parCase = new Map(banc.boites.map(b => [cle(b), b]));
  for (const w of web.boites) {
    const b = parCase.get(cle(w)); r.n++;
    if (!b) { r.lettres += Math.max(w.name.length, 1); r.ecart += w.name.length; continue; }
    const noms = w.name === b.name, apt = w.apt === b.apt, pub = w.pub === b.pub;
    r.noms += noms; r.apt += apt; r.pub += pub; r.check += (w.check === b.check);
    r.ecart += distance(w.name, b.name); r.lettres += Math.max(w.name.length, 1);
    if (noms && apt && pub) r.identiques++;
  }
  return r;
}
const pc = (a, b) => b ? (100 * a / b).toFixed(1) + ' %' : '–';
const tot = { photos: 0, grilles: 0, moteur: null, bout: null, msWeb: 0, msBanc: 0, lues: 0 };
const cumul = (t, r) => { if (!t) return Object.assign({}, r); for (const k of Object.keys(r)) t[k] += r[k]; return t; };
for (const f of photos) {
  const web = await lireDansChrome(nav, base, path.resolve(f));
  const photo = await ouvrirPhoto(f);
  const bout = await moteur.lirePhoto(photo);                              // tout le banc
  const egale = await moteur.lirePhoto(photo, { petite: web.petite });     // même grille que Chrome : le moteur seul
  const memeGrille = web.cols === bout.cols && web.rows === bout.rows && web.boites.length === bout.boites.length;
  tot.photos++; if (memeGrille) tot.grilles++;
  const a = comparer(web, egale), b = comparer(web, bout);
  tot.moteur = cumul(tot.moteur, a); tot.bout = cumul(tot.bout, b);
  tot.msWeb += web.ms; tot.msBanc += bout.msLecture; tot.lues += bout.boites.length;
  console.log(`${path.basename(f)} (${photo.width}x${photo.height}) : grille Chrome ${web.cols}x${web.rows}, banc ${bout.cols}x${bout.rows}${memeGrille ? '' : '  ≠'} ; boîtes identiques : ${a.identiques}/${a.n} à grille égale, ${b.identiques}/${b.n} de bout en bout ; Chrome ${(web.ms / a.n).toFixed(0)} ms/boîte, banc ${(bout.msLecture / bout.boites.length).toFixed(0)} ms/boîte`);
}
const ligne = (nom, r) => console.log(`  ${nom} : boîtes identiques ${r.identiques}/${r.n} (${pc(r.identiques, r.n)}) · noms ${pc(r.noms, r.n)} · appartement ${pc(r.apt, r.n)} · pub ${pc(r.pub, r.n)} · « à vérifier » ${pc(r.check, r.n)} · écart de lettres ${pc(r.ecart, r.lettres)}`);
console.log(`\nTotal : ${tot.photos} photos ; même grille automatique : ${tot.grilles}/${tot.photos}`);
ligne('À grille égale (le moteur seul)', tot.moteur);
ligne('De bout en bout              ', tot.bout);
if (enregistrer) {
  const parts = r => ({ identiques: r.identiques / r.n, noms: r.noms / r.n, apt: r.apt / r.n, pub: r.pub / r.n, check: r.check / r.n });
  const res = lireResultats();
  res.fidelite = { date: new Date().toLocaleDateString('fr-FR'), navigateur: 'Chrome ' + nav.version().split('.')[0], photos: tot.photos, boites: tot.bout.n, memeGrille: tot.grilles,
    bout: parts(tot.bout), moteur: parts(tot.moteur), msNavigateur: tot.msWeb / tot.bout.n, msBanc: tot.msBanc / tot.lues };
  ecrireResultats(res);
  console.log('RESULTATS.md mis à jour.');
}
await nav.close(); srv.close();
