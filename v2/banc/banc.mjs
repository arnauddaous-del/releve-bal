#!/usr/bin/env node
/* Banc d'essai d'Imprim Bal : lit un dossier de blocs (photo + relevé corrigé) avec une ou plusieurs configurations
   de lecture et mesure l'écart avec le relevé corrigé.

   node banc.mjs [--donnees dossier] [--config v1,v2-bloc] [--bloc texte] [--jeu texte] [--enregistrer] [--planches] [--detail] [--fils n] [--memoire]

   --donnees      dossier des blocs (défaut : donnees/, hors du dépôt : voir .gitignore et README.md)
   --config       configurations à mesurer, séparées par des virgules (défaut : v1)
   --bloc         ne garder que les blocs dont le nom contient ce texte
   --jeu          nom du jeu d'essai, rappelé dans RESULTATS.md (ex. « jeu provisoire »)
   --enregistrer  inscrire les totaux dans resultats.json et réécrire RESULTATS.md
   --planches     enregistrer les images des boîtes, numérotées, dans rapports/planches/ (pour classer manuscrit / imprimé)
   --detail       afficher les boîtes fausses (lu / attendu) : des noms s'affichent, à garder pour soi
   --fils         fils de calcul (défaut : 1, pour des temps comparables d'une mesure à l'autre)
   --memoire      garder les calculs des modèles et les lignes lues dans local/ (essais rapides ; temps alors faux) */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { ouvrirPhoto, enregistrerJPEG } from './image.mjs';
import { creerV1, ordonner } from './moteurs/v1.mjs';
import { creerV2 } from './moteurs/v2.mjs';
import { trouverBlocs, lireReleve, lireEcriture, grilleImposee } from './verite.mjs';
import { aligner, compteur, compter, ajouter, indicateurs, listeNoms, caseNoms } from './mesures.mjs';
import { lireResultats, ecrireResultats } from './resultats.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));

/* Les configurations mesurables. Chaque étape de la V2 en ajoutera une ici. */
export const CONFIGS = {
  'v1': { titre: 'V1 telle quelle', creer: o => creerV1({ fils: o.fils }) },
  'v1-renforcee': { titre: 'V1 + lecture renforcée', creer: o => creerV1({ renforcee: true, fils: o.fils }) },
  // étapes de la V2, cumulées dans l'ordre
  'v2-socle': { titre: 'V2 socle (même lecture que la V1)', creer: o => creerV2({ socle: true, fils: o.fils, memoire: o.memoire }) },
  'v2-faisceau': { titre: 'V2 + décodage par probabilités', creer: o => creerV2({ fils: o.fils, memoire: o.memoire }) },
  'v2-prenoms': { titre: 'V2 + dictionnaire des prénoms', creer: o => creerV2({ lexique: 'prenoms', fils: o.fils, memoire: o.memoire }) },
  'v2-noms': { titre: 'V2 + dictionnaire des noms de famille', creer: o => creerV2({ lexique: 'noms', fils: o.fils, memoire: o.memoire }) },
  'v2-regles': { titre: 'V2 + règles (panneaux, autocollants, initiales)', creer: o => creerV2({ lexique: 'noms', regles: { v2: true }, fils: o.fils, memoire: o.memoire }) },
  'v2-bloc': { titre: 'V2 + recoupements du bloc (place de l’étiquette, forme des numéros)', creer: o => creerV2({ lexique: 'noms', bloc: true, fils: o.fils, memoire: o.memoire }) },
  'v2-bloc-fort': { titre: 'V2 complète + deuxième modèle sur les lignes hésitantes', creer: o => creerV2({ lexique: 'noms', bloc: true, fort: 'faible', fils: o.fils, memoire: o.memoire }) },
  'v2-fort': { titre: 'V2 + deuxième modèle sur les lignes hésitantes', creer: o => creerV2({ lexique: 'noms', fort: 'faible', fils: o.fils, memoire: o.memoire }) },
  'v2-fort-tout': { titre: 'V2 + deuxième modèle sur toutes les lignes', creer: o => creerV2({ lexique: 'noms', fort: 'tout', fils: o.fils, memoire: o.memoire }) }
};

function options(argv) {
  const o = { donnees: path.join(ICI, 'donnees'), config: ['v1'], bloc: '', jeu: '', enregistrer: false, planches: false, detail: false, fils: 1, memoire: false, aide: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], suivant = () => { if (i + 1 >= argv.length) throw new Error('valeur manquante après ' + a); return argv[++i]; };
    if (a === '--donnees') o.donnees = path.resolve(suivant());
    else if (a === '--config') o.config = suivant().split(',').map(x => x.trim()).filter(Boolean);
    else if (a === '--bloc') o.bloc = suivant();
    else if (a === '--jeu') o.jeu = suivant();
    else if (a === '--fils') o.fils = Math.max(1, parseInt(suivant(), 10) || 1);
    else if (a === '--enregistrer') o.enregistrer = true;
    else if (a === '--memoire') o.memoire = true;
    else if (a === '--planches') o.planches = true;
    else if (a === '--detail') o.detail = true;
    else if (a === '--aide' || a === '-h' || a === '--help') o.aide = true;
    else throw new Error('option inconnue : ' + a);
  }
  return o;
}

const pc = v => v == null ? '–' : (100 * v).toFixed(1).replace('.', ',') + ' %';
const aujourdhui = () => new Date().toLocaleDateString('fr-FR');
const typeDe = (vrai, types) => { const t = types && types.get(vrai.ordre); return t === 'X' ? 'X' : !vrai.noms.length ? 'V' : (t || ''); };

/* Compare les boîtes lues (dans l'ordre de flashage) au relevé corrigé. */
function evaluer(lus, releve, types) {
  const al = aligner(lus, releve.boites), total = compteur(), parType = { M: compteur(), I: compteur(), V: compteur() }, lignes = [];
  for (const [i, j] of al.paires) {
    const lu = i == null ? null : lus[i];
    if (j == null) { total.enTrop++; lignes.push({ enTrop: true, lu: lu }); continue; }
    const vrai = releve.boites[j], t = typeDe(vrai, types);
    if (t === 'X') { lignes.push({ ordre: vrai.ordre, type: t, ecartee: true, juste: true, vrai: vrai, lu: lu }); continue; }   // écartée : hors calcul
    const r = compter(total, lu, vrai);
    if (t) compter(parType[t], lu, vrai);
    lignes.push({ ordre: vrai.ordre, type: t, juste: r.juste, vrai: vrai, lu: lu });
  }
  return { direct: al.direct, total: total, parType: parType, lignes: lignes };
}

/* Images des boîtes d'un bloc, 12 par planche. Chaque image porte le numéro d'ordre de sa ligne dans le relevé
   (« + » : boîte lue qui n'a pas de ligne dans le relevé). */
async function planches(dossier, nom, lus) {
  const d = path.join(dossier, nom.replace(/[^\w.-]+/g, '_'));
  fs.mkdirSync(d, { recursive: true });
  const L = 420, H = 300, COLS = 3, PAR = 12;
  for (let p = 0; p * PAR < lus.length; p++) {
    const lot = lus.slice(p * PAR, (p + 1) * PAR), c = createCanvas(COLS * L, Math.ceil(lot.length / COLS) * H), g = c.getContext('2d');
    g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
    lot.forEach((b, k) => {
      const x = (k % COLS) * L, y = Math.floor(k / COLS) * H, im = b.image;
      if (im) { const e = Math.min((L - 8) / im.width, (H - 8) / im.height); g.drawImage(im, x + 4, y + 4, im.width * e, im.height * e); }
      g.fillStyle = '#0e6e6b'; g.fillRect(x + 4, y + 4, 58, 34);
      g.fillStyle = '#fff'; g.font = 'bold 24px sans-serif'; g.textBaseline = 'middle'; g.fillText(b.etiquette, x + 12, y + 22);
    });
    await enregistrerJPEG(c, path.join(d, String(p + 1).padStart(2, '0') + '.jpg'), 82);
  }
  return d;
}

async function main() {
  const o = options(process.argv.slice(2));
  if (o.aide) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\* ?/, '')); return 0; }
  for (const c of o.config) if (!CONFIGS[c]) throw new Error('configuration inconnue : ' + c + ' (connues : ' + Object.keys(CONFIGS).join(', ') + ')');
  let blocs = trouverBlocs(o.donnees);
  if (o.bloc) blocs = blocs.filter(b => b.nom.toLowerCase().includes(o.bloc.toLowerCase()));
  if (!blocs.length) {
    console.log('Aucun bloc dans ' + o.donnees + '.\nDéposez-y, pour chaque bloc, la photo et le CSV corrigé exporté par la V1 : voir README.md.');
    return 1;
  }
  // vérité terrain
  const jeu = { blocs: 0, boites: 0, ecartees: 0, types: { M: 0, I: 0, V: 0, inconnu: 0 }, note: o.jeu }, empreinte = crypto.createHash('sha256');
  for (const b of blocs) {
    if (b.probleme) continue;
    try {
      const texte = fs.readFileSync(b.csv, 'utf8');
      b.releve = lireReleve(texte);
      b.types = b.ecriture ? lireEcriture(fs.readFileSync(b.ecriture, 'utf8')) : null;
      if (!b.releve.boites.length) { b.probleme = 'CSV sans boîte'; continue; }
      empreinte.update(b.nom).update(texte).update(b.ecriture ? fs.readFileSync(b.ecriture, 'utf8') : '').update(b.photos.map(f => path.basename(f) + fs.statSync(f).size).join('|'));
      jeu.blocs++;
      for (const v of b.releve.boites) { const t = typeDe(v, b.types); if (t === 'X') jeu.ecartees++; else { jeu.boites++; jeu.types[t || 'inconnu']++; } }
    } catch (err) { b.probleme = err.message; }
  }
  for (const b of blocs.filter(b => b.probleme)) console.log('  ignoré : ' + b.nom + ' (' + b.probleme + ')');
  blocs = blocs.filter(b => !b.probleme);
  if (!blocs.length) { console.log('Aucun bloc utilisable.'); return 1; }
  jeu.empreinte = empreinte.digest('hex').slice(0, 12);
  if (!jeu.types.M && !jeu.types.I) jeu.types = null;          // pas encore classé manuscrit / imprimé
  console.log('Jeu d\'essai' + (jeu.note ? ' (' + jeu.note + ')' : '') + ' : ' + jeu.blocs + ' blocs, ' + jeu.boites + ' boîtes' + (jeu.ecartees ? ' (+ ' + jeu.ecartees + ' écartées)' : '') +
    (jeu.types ? ' (' + jeu.types.M + ' manuscrites, ' + jeu.types.I + ' imprimées, ' + jeu.types.V + ' sans nom, ' + jeu.types.inconnu + ' non classées)' : ' (manuscrit / imprimé : pas encore classé)'));

  const resultats = lireResultats();
  for (const cle of o.config) {
    const cfg = CONFIGS[cle], moteur = await cfg.creer(o);
    console.log('\n== ' + cfg.titre + ' ==');
    const total = compteur(), parType = { M: compteur(), I: compteur(), V: compteur() }, rapport = [];
    let ms = 0, lues = 0, grilles = 0;
    for (const b of blocs) {
      const lectures = [], alertes = [];
      for (const f of b.photos) {
        const photo = await ouvrirPhoto(f), nomPhoto = path.basename(f);
        if (Math.max(photo.width, photo.height) < 3000) alertes.push(nomPhoto + ' : ' + photo.width + ' x ' + photo.height + ' px, photo réduite ?');
        const forcee = grilleImposee(b.options.grilles && b.options.grilles[nomPhoto]);
        lectures.push(await moteur.lirePhoto(photo, { grille: forcee, garderImages: o.planches, cle: b.nom + '-' + nomPhoto }));
      }
      if (b.releve.pre != null && b.releve.pre !== b.releve.boites.length) alertes.push('le CSV annonce ' + b.releve.pre + ' PRE et contient ' + b.releve.boites.length + ' lignes');
      // sens de lecture : celui du bloc.json, sinon celui des deux qui colle le mieux au relevé (c'est un réglage de l'utilisateur)
      const essais = (b.options.sens === 'h' || b.options.sens === 'v' ? [b.options.sens] : ['h', 'v']).map(sens => {
        const lus = lectures.flatMap(r => ordonner(r.boites, sens)).map(x => ({ noms: listeNoms(x.name), apt: x.apt, pub: x.pub, check: x.check, image: x.image }));
        return { sens: sens, lus: lus, ev: evaluer(lus, b.releve, b.types) };
      }).sort((x, y) => (y.ev.total.justesTol - x.ev.total.justesTol) || (x.ev.total.ecart - y.ev.total.ecart));
      const e = essais[0], t = e.ev.total, grilleJuste = e.lus.length === b.releve.boites.length;
      ajouter(total, t); for (const k of 'MIV') ajouter(parType[k], e.ev.parType[k]);
      ms += lectures.reduce((n, r) => n + r.msLecture, 0); lues += e.lus.length; if (grilleJuste) grilles++;
      console.log('  ' + b.nom + ' : ' + t.boites + ' boîtes' + (grilleJuste ? '' : ' (lues : ' + e.lus.length + ', grille à revoir)') + ', sens ' + (e.sens === 'v' ? 'vertical' : 'horizontal') +
        ', ' + t.justes + ' justes (' + pc(t.justes / t.boites) + '), ' + t.signalees + ' à vérifier' + (alertes.length ? '\n      ! ' + alertes.join('\n      ! ') : ''));
      if (o.detail) for (const l of e.ev.lignes.filter(l => !l.juste)) {
        if (l.enTrop) console.log('      + en trop : ' + JSON.stringify(caseNoms(l.lu.noms)));
        else console.log('      ' + l.ordre + (l.type ? ' [' + l.type + ']' : '') + ' : lu ' + (l.lu ? JSON.stringify([caseNoms(l.lu.noms), l.lu.apt, l.lu.pub]) : '(rien)') + ' / attendu ' + JSON.stringify([caseNoms(l.vrai.noms), l.vrai.apt, l.vrai.pub]));
      }
      rapport.push({ bloc: b.nom, sens: e.sens, grilleJuste: grilleJuste, grilles: lectures.map(r => r.cols + 'x' + r.rows), alertes: alertes,
        boites: e.ev.lignes.map(l => ({ ordre: l.ordre, type: l.type, juste: l.juste, enTrop: l.enTrop, vrai: l.vrai, lu: l.lu && { noms: l.lu.noms, apt: l.lu.apt, pub: l.lu.pub, check: l.lu.check } })) });
      if (o.planches) console.log('      planches : ' + await planches(path.join(ICI, 'rapports', 'planches'), b.nom,
        e.ev.lignes.filter(l => l.lu && l.lu.image).map(l => ({ etiquette: l.enTrop ? '+' : String(l.ordre), image: l.lu.image }))));
    }
    const ind = indicateurs(total), msParBoite = lues ? ms / lues : null;
    console.log('  ---\n  Boîtes justes : ' + pc(ind.justes) + ' (' + total.justes + '/' + total.boites + ')' + (jeu.types ? ' · manuscrit ' + pc(indicateurs(parType.M).justes) + ' · imprimé ' + pc(indicateurs(parType.I).justes) : '') +
      '\n  Sans compter capitales, accents et ordre : ' + pc(ind.justesTolerant) +
      '\n  Erreurs de lettres sur les noms : ' + pc(ind.erreursLettres) + ' · appartement juste : ' + pc(ind.appartement) + ' · STOP PUB juste : ' + pc(ind.pub) +
      '\n  « À vérifier » vraiment fausses : ' + pc(ind.signaleesFausses) + ' (' + total.signaleesFausses + '/' + total.signalees + ') · fausses non signalées : ' + pc(ind.faussesNonSignalees) + ' des boîtes' +
      '\n  Grille juste : ' + grilles + '/' + blocs.length + ' blocs · temps : ' + (msParBoite == null ? '–' : msParBoite.toFixed(0) + ' ms') + ' par boîte · poids téléchargé : ' + (moteur.poids / 1e6).toFixed(1) + ' Mo');
    fs.mkdirSync(path.join(ICI, 'rapports'), { recursive: true });
    fs.writeFileSync(path.join(ICI, 'rapports', cle + '.json'), JSON.stringify({ configuration: cfg.titre, date: aujourdhui(), jeu: jeu, blocs: rapport }, null, 1));
    if (o.enregistrer) {
      resultats.configurations[cle] = { titre: cfg.titre, date: aujourdhui(), jeu: jeu, indicateurs: ind,
        parType: jeu.types ? { M: indicateurs(parType.M), I: indicateurs(parType.I), V: indicateurs(parType.V) } : null,
        grilles: { justes: grilles, blocs: blocs.length }, msParBoite: msParBoite, poidsMo: moteur.poids / 1e6, fils: o.fils };
    }
  }
  if (o.enregistrer) { ecrireResultats(resultats); console.log('\nRESULTATS.md mis à jour.'); }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), err => { console.error('Erreur : ' + err.message); process.exit(2); });
}
