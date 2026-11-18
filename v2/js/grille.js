/* Imprim Bal 2 — la photo prise, avec la grille des boîtes par-dessus.
   Comptage automatique (BalCore.autoCount, comme la V1), puis l'utilisateur peut :
   changer le nombre de colonnes ou de rangées, faire glisser une ligne, toucher une case pour l'ignorer.
   Les numéros affichés suivent le sens de lecture du lieu (rangée par rangée ou colonne par colonne). */
import { BalCore as C } from './moteur/regles.mjs';
import { estimer, redresserPixels, inverse, appliquer, produit } from './moteur/redresser.mjs';

/* Charge une photo (fichier ou Blob) en deux tailles : full (4200 px au plus, pour lire) et small (700 px de large,
   pour compter les boîtes), exactement comme la V1. Garde aussi l'image d'origine, en pleine définition (origine) :
   la photo de chaque boîte en est découpée sans perte de définition. */
export function chargerPhoto(blob) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const W = img.naturalWidth, H = img.naturalHeight, k = Math.min(1, 4200 / Math.max(W, H));
      let full = document.createElement('canvas');
      full.width = Math.round(W * k); full.height = Math.round(H * k);
      full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);
      let small = petite(full), versOrigine = [1 / k, 0, 0, 0, 1 / k, 0, 0, 0, 1], angle = 0;
      // photo prise de biais : redressée (redresser.mjs) ; versOrigine mène d'un pixel de la photo redressée au pixel
      // de la photo d'origine (pour découper chaque boîte en pleine définition)
      try {
        const r = estimer(small);
        if (r) {
          const red = redresserPixels(full.getContext('2d').getImageData(0, 0, full.width, full.height), r, 4200);
          const c = document.createElement('canvas');
          c.width = red.image.width; c.height = red.image.height;
          c.getContext('2d').putImageData(new ImageData(red.image.data, c.width, c.height), 0, 0);
          versOrigine = produit(versOrigine, inverse(red.H));
          full.width = full.height = 0; full = c; small = petite(full); angle = r.angle;
        }
      } catch (e) {}
      ok({ full: full, small: small, origine: img, largeur: W, hauteur: H, versOrigine: versOrigine, redressee: angle });
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('photo illisible')); };
    img.src = url;
  });
}
export function petite(source) {
  const w = source.width || source.videoWidth, h = source.height || source.videoHeight;
  const sc = document.createElement('canvas');
  sc.width = 700; sc.height = Math.max(1, Math.round(h * 700 / w));
  const g = sc.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(source, 0, 0, sc.width, sc.height);
  return g.getImageData(0, 0, sc.width, sc.height);
}

/* Comptage automatique, comme autoGrid() de la V1. */
export function grilleAuto(small) {
  const a = C.autoCount(small);
  const g = C.uniformGrid(a.cols, a.rows, a.frame);
  if (a.dividers && a.dividers.length === a.cols - 1) g.cols = a.dividers;
  return C.fitGrid(small, g, a.dividers ? 'rows' : 'detect');
}

export function ordonner(cases, sens) {
  return sens === 'v' ? cases.slice().sort((a, b) => a.c - b.c || a.r - b.r) : cases;
}

const MIN = 0.015;

export function creerEditeur(scene, photo, reglage) {
  const full = photo.full, small = photo.small;
  let grid = grilleAuto(small), sens = reglage.sens === 'v' ? 'v' : 'h';
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  cv.className = 'scene-photo';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Photo avec la grille des boîtes. Touchez une case pour l\'ignorer, faites glisser une ligne pour l\'ajuster.');
  scene.innerHTML = ''; scene.appendChild(cv);
  const vue = { w: 0, h: 0, dpr: 1 };
  const changer = () => { if (reglage.surChange) reglage.surChange(); };

  function nCols() { return grid.cols.length + 1; }
  function nRangs() { return grid.rows[0].length + 1; }
  function actives() { return ordonner(C.cells(grid).filter(c => !c.off), sens); }

  function dimensionner() {
    const maxW = scene.clientWidth || 320, maxH = Math.max(240, scene.clientHeight || window.innerHeight * 0.6);
    const k = Math.min(maxW / full.width, maxH / full.height);
    vue.w = Math.round(full.width * k); vue.h = Math.round(full.height * k);
    vue.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(vue.w * vue.dpr); cv.height = Math.round(vue.h * vue.dpr);
    cv.style.width = vue.w + 'px'; cv.style.height = vue.h + 'px';
    dessiner();
  }
  function dessiner() {
    const W = vue.w, H = vue.h, d = vue.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(full, 0, 0, W, H);
    const f = grid.frame, accent = '#4cc4be';
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, W, f.y0 * H); ctx.fillRect(0, f.y1 * H, W, H - f.y1 * H);
    ctx.fillRect(0, f.y0 * H, f.x0 * W, (f.y1 - f.y0) * H); ctx.fillRect(f.x1 * W, f.y0 * H, W - f.x1 * W, (f.y1 - f.y0) * H);
    const cells = C.cells(grid);
    cells.forEach(c => {
      if (!c.off) return;
      const x = c.x0 * W, y = c.y0 * H, w = (c.x1 - c.x0) * W, h = (c.y1 - c.y0) * H;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w * 0.35, y + h * 0.35); ctx.lineTo(x + w * 0.65, y + h * 0.65);
      ctx.moveTo(x + w * 0.65, y + h * 0.35); ctx.lineTo(x + w * 0.35, y + h * 0.65); ctx.stroke();
    });
    ctx.lineWidth = 2; ctx.strokeStyle = accent;
    cells.forEach(c => ctx.strokeRect(c.x0 * W, c.y0 * H, (c.x1 - c.x0) * W, (c.y1 - c.y0) * H));
    let n = 0;
    ordonner(cells.filter(c => !c.off), sens).forEach(c => {
      n++;
      const s = Math.max(16, Math.min(24, (c.x1 - c.x0) * W * 0.2)), x = c.x0 * W + 5, y = c.y0 * H + 5;
      ctx.fillStyle = accent;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, s * 1.5, s * 1.15, 6); else ctx.rect(x, y, s * 1.5, s * 1.15); ctx.fill();
      ctx.fillStyle = '#04201e'; ctx.font = '600 ' + Math.round(s * 0.75) + 'px -apple-system, system-ui, Roboto, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), x + s * 0.75, y + s * 0.6);
    });
    ctx.fillStyle = '#fff'; ctx.strokeStyle = accent; ctx.lineWidth = 2;
    poignees().forEach(p => { ctx.beginPath(); ctx.arc(p.kx, p.ky, p.type === 'coin' ? 8 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  }
  function poignees() {
    const W = vue.w, H = vue.h, f = grid.frame, out = [];
    [['x0', 'y0'], ['x1', 'y0'], ['x0', 'y1'], ['x1', 'y1']].forEach(p => out.push({ type: 'coin', kx: f[p[0]] * W, ky: f[p[1]] * H, ax: p[0], ay: p[1] }));
    grid.cols.forEach((x, i) => out.push({ type: 'col', i: i, kx: x * W, ky: (f.y0 + f.y1) / 2 * H }));
    for (let c = 0; c < nCols(); c++) {
      const cb = C.colBounds(grid, c);
      grid.rows[c].forEach((y, j) => out.push({ type: 'rang', c: c, j: j, kx: (cb[0] + cb[1]) / 2 * W, ky: y * H }));
    }
    return out;
  }
  function toucher(px, py) {
    const W = vue.w, H = vue.h, R = 26;
    let best = null, bd = R;
    poignees().forEach(p => { const d = Math.hypot(p.kx - px, p.ky - py) - (p.type === 'coin' ? 4 : 0); if (d < bd) { bd = d; best = p; } });
    if (best) return best;
    const f = grid.frame, x = px / W, y = py / H, tol = 14, cands = [];
    if (y < f.y0 - 0.02 || y > f.y1 + 0.02 || x < f.x0 - 0.02 || x > f.x1 + 0.02) return null;
    grid.cols.forEach((cx, i) => cands.push({ d: Math.abs(cx * W - px), h: { type: 'col', i: i } }));
    for (let c = 0; c < nCols(); c++) {
      const cb = C.colBounds(grid, c);
      if (x < cb[0] || x > cb[1]) continue;
      grid.rows[c].forEach((ry, j) => cands.push({ d: Math.abs(ry * H - py), h: { type: 'rang', c: c, j: j } }));
    }
    cands.push({ d: Math.abs(f.x0 * W - px), h: { type: 'bord', e: 'x0' } }, { d: Math.abs(f.x1 * W - px), h: { type: 'bord', e: 'x1' } });
    cands.push({ d: Math.abs(f.y0 * H - py), h: { type: 'bord', e: 'y0' } }, { d: Math.abs(f.y1 * H - py), h: { type: 'bord', e: 'y1' } });
    cands.sort((a, b) => a.d - b.d);
    return cands.length && cands[0].d < tol ? cands[0].h : null;
  }
  function deplacer(h, x, y) {
    const f = grid.frame, nc = nCols();
    x = Math.min(1, Math.max(0, x)); y = Math.min(1, Math.max(0, y));
    const setX = (k, v) => {
      if (k === 'x0') f.x0 = Math.min(v, (grid.cols[0] != null ? grid.cols[0] : f.x1) - MIN);
      else f.x1 = Math.max(v, (grid.cols.length ? grid.cols[grid.cols.length - 1] : f.x0) + MIN);
    };
    const setY = (k, v) => {
      let lim = k === 'y0' ? 1 : 0;
      for (let c = 0; c < nc; c++) {
        const r = grid.rows[c];
        lim = k === 'y0' ? Math.min(lim, r.length ? r[0] : f.y1) : Math.max(lim, r.length ? r[r.length - 1] : f.y0);
      }
      if (k === 'y0') f.y0 = Math.min(v, lim - MIN); else f.y1 = Math.max(v, lim + MIN);
    };
    if (h.type === 'coin') { setX(h.ax, x); setY(h.ay, y); }
    else if (h.type === 'bord') { if (h.e[0] === 'x') setX(h.e, x); else setY(h.e, y); }
    else if (h.type === 'col') {
      const i = h.i, lo = (i === 0 ? f.x0 : grid.cols[i - 1]) + MIN, hi = (i === grid.cols.length - 1 ? f.x1 : grid.cols[i + 1]) - MIN;
      grid.cols[i] = Math.min(hi, Math.max(lo, x));
    } else if (h.type === 'rang') {
      const rs = grid.rows[h.c], j = h.j, lo = (j === 0 ? f.y0 : rs[j - 1]) + MIN, hi = (j === rs.length - 1 ? f.y1 : rs[j + 1]) - MIN;
      rs[j] = Math.min(hi, Math.max(lo, y));
    }
  }
  let geste = null;
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    geste = { h: toucher(px, py), sx: px, sy: py, bouge: false, id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (!geste || e.pointerId !== geste.id) return;
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (Math.hypot(px - geste.sx, py - geste.sy) > 6) geste.bouge = true;
    if (geste.h && geste.bouge) { deplacer(geste.h, px / vue.w, py / vue.h); dessiner(); }
  });
  const fin = e => {
    if (!geste || e.pointerId !== geste.id) return;
    if (!geste.bouge) {
      const x = geste.sx / vue.w, y = geste.sy / vue.h;
      const c = C.cells(grid).find(k => x >= k.x0 && x <= k.x1 && y >= k.y0 && y <= k.y1);
      if (c) { const k = c.c + ',' + c.r; if (grid.off[k]) delete grid.off[k]; else grid.off[k] = true; dessiner(); changer(); }
    } else if (geste.h) changer();
    geste = null;
  };
  cv.addEventListener('pointerup', fin);
  cv.addEventListener('pointercancel', fin);
  const surTaille = () => { clearTimeout(surTaille.t); surTaille.t = setTimeout(dimensionner, 120); };
  window.addEventListener('resize', surTaille);

  dimensionner();
  return {
    cols: nCols, rangs: nRangs,
    nombre: () => actives().length,
    /* nouveau nombre de colonnes ou de rangées : la grille est replacée sur la photo (detectGrid de la V1) */
    compter(cols, rangs) {
      cols = Math.max(1, Math.min(12, cols)); rangs = Math.max(1, Math.min(16, rangs));
      grid = C.fitGrid(small, C.uniformGrid(cols, rangs, C.guessFrame(small, cols, rangs)), 'detect');
      dessiner(); changer();
    },
    auto() { grid = grilleAuto(small); dessiner(); changer(); },
    /* recale les lignes sur les bords des boîtes, après une retouche (bouton « Ajuster » de la V1) */
    ajuster() { const off = grid.off; grid = C.fitGrid(small, grid, 'snap'); grid.off = off; dessiner(); changer(); },
    sens(s) { sens = s === 'v' ? 'v' : 'h'; dessiner(); },
    cases: actives,
    redessiner: dimensionner,
    detruire() { window.removeEventListener('resize', surTaille); scene.innerHTML = ''; }
  };
}
