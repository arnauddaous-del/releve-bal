/* Imprim Bal 2 : recoupements à l'échelle du bloc (toutes les boîtes d'une même photo).
   Les boîtes d'un bloc se ressemblent : l'étiquette est au même endroit sur chaque porte et les numéros
   d'appartement suivent la même forme (« B114 », « B115 »…). Deux usages, toujours prudents :
   - une ligne lue ailleurs que sur l'étiquette (autocollant, journal) ne donne un nom que si elle est très nette ;
   - un numéro qui ne suit pas la forme du bloc (« 8117 » parmi des « B1xx ») est repris, d'abord avec les autres
     lectures que le modèle proposait pour cette ligne, sinon avec la lettre que le chiffre imite.
   Rien n'est inventé sans trace : une boîte modifiée ici sans appui du modèle est marquée « à vérifier ». */

function centile(valeurs, q) {
  const v = valeurs.slice().sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
}

/* Emplacement habituel de l'étiquette, appris sur les boîtes où un numéro d'appartement a été trouvé. */
export function zoneEtiquette(cases, lus) {
  const ancres = [];
  let avec = 0, lisibles = 0;
  cases.forEach((cs, i) => {
    const p = lus[i];
    if (p.panel) return;
    if (cs.lines.length) lisibles++;
    const la = p.aptLigne >= 0 ? cs.lines[p.aptLigne] : null;
    if (!la || !la.box) return;
    avec++; ancres.push(la);
    const cy = (la.box.y0 + la.box.y1) / 2, pas = Math.max(la.h || 0, 0.008);
    p.nomsLignes.forEach(k => {
      const l = cs.lines[k];
      if (l && l.box && k !== p.aptLigne && Math.abs((l.box.y0 + l.box.y1) / 2 - cy) < 6 * pas) ancres.push(l);
    });
  });
  if (avec < 4 || avec < 0.4 * lisibles) return null;
  const H = Math.max(0.006, centile(ancres.map(l => l.h || 0.01), 0.5));
  return {
    x0: centile(ancres.map(l => l.box.x0), 0.05) - 3 * H, x1: centile(ancres.map(l => l.box.x1), 0.95) + 3 * H,
    y0: centile(ancres.map(l => l.box.y0), 0.05) - 2 * H, y1: centile(ancres.map(l => l.box.y1), 0.95) + 2 * H
  };
}

function forme(apt) {
  const m = String(apt || '').match(/^(.*?)(\d+)([A-Z]?)$/);
  return m ? { prefixe: m[1], chiffres: m[2].length } : null;
}
/* Forme dominante des numéros du bloc : le début commun (« B », « C3- », rien) et les longueurs habituelles. */
export function formeDuBloc(apts) {
  const parPrefixe = new Map();
  let n = 0;
  for (const a of apts) {
    const f = forme(a);
    if (!f) continue;
    n++;
    const e = parPrefixe.get(f.prefixe) || { n: 0, longueurs: new Map() };
    e.n++; e.longueurs.set(f.chiffres, (e.longueurs.get(f.chiffres) || 0) + 1);
    parPrefixe.set(f.prefixe, e);
  }
  let meilleur = null;
  for (const [prefixe, e] of parPrefixe) if (!meilleur || e.n > meilleur.n) meilleur = { prefixe: prefixe, n: e.n, longueurs: e.longueurs };
  if (!meilleur || meilleur.n < 4 || meilleur.n < 0.6 * n) return null;
  const longueurs = Array.from(meilleur.longueurs).filter(x => x[1] >= 2 || x[1] >= 0.25 * meilleur.n).map(x => x[0]);
  return { prefixe: meilleur.prefixe, longueurs: longueurs };
}

// chiffres qu'un lecteur confond avec une lettre en tête de numéro
const SOSIES = { B: '8', A: '4', C: '0', D: '0', O: '0', G: '6', S: '5', E: '3', Z: '2', I: '1', T: '7' };

/* cases : [{ lines }] dans l'ordre des boîtes ; parse : BalCore.parseLabel. Renvoie pour chaque boîte
   { p (le résultat de parseLabel), verifier (vrai si le bloc a changé quelque chose sans appui du modèle) }. */
export function lireBloc(cases, parse) {
  let lus = cases.map(cs => parse(cs.lines, { v2: true }));
  const zone = zoneEtiquette(cases, lus);
  if (zone) lus = cases.map(cs => parse(cs.lines, { v2: true, zone: zone }));
  const out = lus.map(p => ({ p: p, verifier: false }));
  const f = formeDuBloc(lus.filter(p => !p.panel).map(p => p.apt));
  if (f) {
    const conforme = a => { const g = forme(a); return !!g && g.prefixe === f.prefixe && f.longueurs.indexOf(g.chiffres) >= 0; };
    cases.forEach((cs, i) => {
      const p = lus[i];
      if (p.panel || !cs.lines.length || conforme(p.apt)) return;
      // 1. une autre lecture de la ligne du numéro (ou, sans numéro, de n'importe quelle ligne) qui suit la forme du bloc
      const lignes = p.aptLigne >= 0 ? [p.aptLigne] : cs.lines.map((l, k) => k);
      let trouve = null;
      for (const k of lignes) {
        const l = cs.lines[k];
        for (const a of (l.autres || (l.alts || []).map(t => ({ text: t, p: 0.1 })))) {
          const essai = parse(cs.lines.map((x, q) => (q === k ? Object.assign({}, x, { text: a.text }) : x)), { v2: true, zone: zone });
          if (conforme(essai.apt) && (!trouve || a.p > trouve.p)) trouve = { lu: essai, p: a.p };
        }
      }
      // la boîte est alors relue en entier avec cette autre lecture (la ligne ne doit pas rester aussi comme nom)
      if (trouve) { out[i].p = lus[i] = trouve.lu; return; }
      if (!p.apt || !/^\d+$/.test(p.apt)) return;
      // 2. le premier chiffre imite la lettre du bloc (« 8117 » pour « B117 »)
      if (f.prefixe.length === 1 && SOSIES[f.prefixe] === p.apt.charAt(0) && f.longueurs.indexOf(p.apt.length - 1) >= 0) { p.apt = f.prefixe + p.apt.slice(1); return; }
      // 3. la lettre manque (« 216 » pour « B216 ») : on la remet, et la boîte est à vérifier
      if (f.prefixe.length === 1 && f.longueurs.indexOf(p.apt.length) >= 0) { p.apt = f.prefixe + p.apt; out[i].verifier = true; }
    });
  }
  return out;
}
