/* Vérité terrain du banc : les relevés corrigés à la main, tels que la V1 les exporte en CSV, et les blocs sur le disque.

   Un bloc =
   - soit un dossier : ses photos (dans l'ordre des lectures : 1.jpg, 2.jpg… si le lieu en a plusieurs) et UN fichier .csv ;
   - soit, directement dans le dossier des données, une photo et un CSV du même nom (immeuble-a.jpg + immeuble-a.csv).
   Fichiers facultatifs d'un bloc-dossier :
   - ecriture.csv : « ordre;type », type = M (au moins un nom manuscrit), I (imprimé), V (boîte sans nom) ;
   - bloc.json : { "sens": "h" | "v", "grilles": { "1.jpg": "6x4" } } quand il faut imposer le sens ou le nombre de boîtes. */
import fs from 'node:fs';
import path from 'node:path';
import { listeNoms } from './mesures.mjs';

const IMAGES = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ordreNaturel = (a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

/* CSV -> tableau de lignes de cases. Guillemets doublés, retours à la ligne dans une case, CRLF. */
export function lireCSV(texte, sep) {
  const lignes = [];
  let ligne = [], c = '', entre = false;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i];
    if (entre) {
      if (ch === '"') { if (texte[i + 1] === '"') { c += '"'; i++; } else entre = false; }
      else c += ch;
    } else if (ch === '"' && c === '') entre = true;
    else if (ch === sep) { ligne.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(c); c = ''; lignes.push(ligne); ligne = [];
    } else c += ch;
  }
  if (c !== '' || ligne.length) { ligne.push(c); lignes.push(ligne); }
  return lignes;
}

/* Le CSV d'Imprim Bal : titres (« Tournée : », « Lieu : », « Nombre de PRE : »), ligne vide, en-tête, une ligne par boîte. */
export function lireReleve(texte) {
  texte = String(texte).replace(/^﻿/, '');
  const tete = texte.split(/\r?\n/).find(l => /ordre_flashage/i.test(l));
  if (!tete) throw new Error('en-tête « ordre_flashage » introuvable : ce fichier n\'est pas un CSV exporté par Imprim Bal');
  const sep = (tete.match(/;/g) || []).length >= (tete.match(/,/g) || []).length ? ';' : ',';
  const lignes = lireCSV(texte, sep), iTete = lignes.findIndex(l => l.some(c => c.trim().toLowerCase() === 'ordre_flashage'));
  const noms = lignes[iTete].map(c => c.trim().toLowerCase()), col = n => noms.indexOf(n);
  const iOrdre = col('ordre_flashage'), iNoms = col('noms_prenoms'), iApt = col('numero_appartement'), iPub = col('pub');
  if (iNoms < 0 || iApt < 0 || iPub < 0) throw new Error('colonnes attendues : ordre_flashage, noms_prenoms, numero_appartement, pub');
  const r = { tournee: '', lieu: '', pre: null, boites: [] };
  for (const l of lignes.slice(0, iTete)) {
    const t = (l[0] || '').trim();
    let m;
    if ((m = /^Tournée\s*:\s*(.*)$/i.exec(t))) r.tournee = m[1].trim();
    else if ((m = /^Lieu\s*:\s*(.*)$/i.exec(t))) r.lieu = m[1].trim();
    else if ((m = /^Nombre de PRE\s*:\s*(\d+)/i.exec(t))) r.pre = +m[1];
  }
  for (const l of lignes.slice(iTete + 1)) {
    if (!l.some(c => c.trim() !== '')) continue;
    r.boites.push({ ordre: parseInt(l[iOrdre], 10) || r.boites.length + 1, noms: listeNoms(l[iNoms]), apt: (l[iApt] || '').trim(),
      pub: /stop/i.test(l[iPub] || '') ? 'STOP PUB' : 'OK PUB' });
  }
  return r;
}

/* ecriture.csv -> Map(ordre -> 'M' | 'I' | 'V') */
export function lireEcriture(texte) {
  const m = new Map();
  for (const l of String(texte).replace(/^﻿/, '').split(/\r?\n/)) {
    const p = l.split(/[;,\t]/).map(x => x.trim());
    const t = (p[1] || '').toUpperCase()[0];
    if (/^\d+$/.test(p[0]) && 'MIV'.includes(t) && t) m.set(+p[0], t);
  }
  return m;
}

export function trouverBlocs(dossier) {
  if (!fs.existsSync(dossier)) return [];
  const blocs = [], entrees = fs.readdirSync(dossier, { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
  const estImage = n => IMAGES.has(path.extname(n).toLowerCase());
  for (const e of entrees.filter(e => e.isDirectory()).sort((a, b) => ordreNaturel(a.name, b.name))) {
    const d = path.join(dossier, e.name), f = fs.readdirSync(d).filter(n => !n.startsWith('.'));
    const photos = f.filter(estImage).sort(ordreNaturel), csv = f.filter(n => /\.csv$/i.test(n) && n.toLowerCase() !== 'ecriture.csv');
    if (!photos.length && !csv.length) continue;
    const bloc = { nom: e.name, photos: photos.map(n => path.join(d, n)), csv: csv.length === 1 ? path.join(d, csv[0]) : null, options: {}, ecriture: null, probleme: '' };
    if (!photos.length) bloc.probleme = 'aucune photo';
    else if (csv.length !== 1) bloc.probleme = csv.length ? 'plusieurs fichiers CSV' : 'pas de CSV';
    if (f.includes('bloc.json')) { try { bloc.options = JSON.parse(fs.readFileSync(path.join(d, 'bloc.json'), 'utf8')); } catch (err) { bloc.probleme = 'bloc.json illisible'; } }
    if (f.some(n => n.toLowerCase() === 'ecriture.csv')) bloc.ecriture = path.join(d, f.find(n => n.toLowerCase() === 'ecriture.csv'));
    blocs.push(bloc);
  }
  const fichiers = entrees.filter(e => e.isFile()).map(e => e.name);
  for (const n of fichiers.filter(estImage).sort(ordreNaturel)) {
    const base = n.slice(0, -path.extname(n).length), csv = fichiers.find(x => x.toLowerCase() === base.toLowerCase() + '.csv');
    blocs.push({ nom: base, photos: [path.join(dossier, n)], csv: csv ? path.join(dossier, csv) : null, options: {}, ecriture: null, probleme: csv ? '' : 'pas de CSV du même nom' });
  }
  return blocs;
}

/* "6x4" -> { cols: 6, rows: 4 } (colonnes x rangées, la barre centrale comptée comme une colonne, comme dans l'app) */
export function grilleImposee(texte) {
  const m = /^\s*(\d{1,2})\s*[x×*]\s*(\d{1,2})\s*$/i.exec(String(texte || ''));
  return m ? { cols: +m[1], rows: +m[2] } : null;
}
