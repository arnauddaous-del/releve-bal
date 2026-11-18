/* Imprim Bal 2 : redresser une photo prise de biais (téléphone penché, ou pas tout à fait en face du bloc).
   Les joints entre les portes sont des droites : verticales et horizontales sur le mur, obliques et convergentes sur
   une photo de biais. On les repère (transformée de Hough sur les bords), on calcule vers où elles convergent (points
   de fuite), puis la déformation qui les remet droites. Le comptage des boîtes (regles.mjs) suppose des lignes droites.
   Une photo déjà droite n'est pas touchée (estimer renvoie null) : rien ne change pour elle.
   Sans dépendance : mêmes fonctions dans l'app et dans le banc d'essai. */

/* ---------- homographies 3 x 3 (tableaux de 9 nombres, ligne par ligne) ---------- */
export function appliquer(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
export function produit(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
  return C;
}
export function inverse(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g, det = a * A + b * B + c * Cc;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
/* Homographie qui envoie les 4 points src sur les 4 points dst ([[x, y] x 4]). */
export function homographie(src, dst) {
  const M = [], v = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = src[k], [u, w] = dst[k];
    M.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); v.push(u);
    M.push([0, 0, 0, x, y, 1, -w * x, -w * y]); v.push(w);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [v[c], v[p]] = [v[p], v[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 8; k++) M[r][k] -= f * M[c][k];
      v[r] -= f * v[c];
    }
  }
  return v.map((x, k) => x / M[k][k]).concat([1]);
}

/* Image de sortie (W x H) : chaque pixel prend la couleur du point de l'image source que lui donne Hinv
   (sortie → source), en interpolation bilinéaire. En dehors de la source : la couleur fond, ou, avec fond = 'bord',
   le pixel du bord le plus proche (prolonge l'image sans créer de ligne nette). */
export function deformer(src, Hinv, W, H, fond) {
  const etendre = fond === 'bord';
  const sw = src.width, sh = src.height, s = src.data, out = new Uint8ClampedArray(W * H * 4);
  const f = Array.isArray(fond) ? fond : [128, 128, 128];
  for (let y = 0; y < H; y++) {
    // le long d'une ligne, numérateurs et dénominateur varient linéairement
    let X = Hinv[1] * (y + 0.5) + Hinv[2] + Hinv[0] * 0.5, Y = Hinv[4] * (y + 0.5) + Hinv[5] + Hinv[3] * 0.5, Z = Hinv[7] * (y + 0.5) + Hinv[8] + Hinv[6] * 0.5;
    for (let x = 0, o = y * W * 4; x < W; x++, o += 4, X += Hinv[0], Y += Hinv[3], Z += Hinv[6]) {
      const u = X / Z - 0.5, v = Y / Z - 0.5;
      if (!etendre && (u < -0.5 || v < -0.5 || u > sw - 0.5 || v > sh - 0.5)) { out[o] = f[0]; out[o + 1] = f[1]; out[o + 2] = f[2]; out[o + 3] = 255; continue; }
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(u))), y0 = Math.max(0, Math.min(sh - 1, Math.floor(v)));
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), a = Math.max(0, Math.min(1, u - x0)), b = Math.max(0, Math.min(1, v - y0));
      const p00 = (y0 * sw + x0) * 4, p10 = (y0 * sw + x1) * 4, p01 = (y1 * sw + x0) * 4, p11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = (s[p00 + c] * (1 - a) + s[p10 + c] * a) * (1 - b) + (s[p01 + c] * (1 - a) + s[p11 + c] * a) * b;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}

/* Couleur moyenne du bord de l'image : remplit les coins vides après redressement, sans créer de bord marqué. */
export function couleurBord(img) {
  const W = img.width, H = img.height, d = img.data, s = [0, 0, 0];
  let n = 0;
  const prendre = (x, y) => { const o = (y * W + x) * 4; s[0] += d[o]; s[1] += d[o + 1]; s[2] += d[o + 2]; n++; };
  for (let x = 0; x < W; x += 3) { prendre(x, 0); prendre(x, H - 1); }
  for (let y = 0; y < H; y += 3) { prendre(0, y); prendre(W - 1, y); }
  return s.map(v => Math.round(v / n));
}

/* ---------- repérage des droites ---------- */
const RAD = Math.PI / 180;

function bords(img) {
  const W = img.width, H = img.height, d = img.data, g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H), mag = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const a = g[i - W - 1], b = g[i - W], c = g[i - W + 1], e = g[i - 1], f = g[i + 1], h = g[i + W - 1], k = g[i + W], l = g[i + W + 1];
    gx[i] = (c + 2 * f + l) - (a + 2 * e + h);
    gy[i] = (h + 2 * k + l) - (a + 2 * b + c);
    mag[i] = Math.hypot(gx[i], gy[i]);
  }
  // seuil : les 12 % de pixels aux bords les plus marqués (et au moins un vrai contraste)
  const ech = [];
  for (let i = 0; i < W * H; i += 7) ech.push(mag[i]);
  ech.sort((p, q) => p - q);
  const seuil = Math.max(60, ech[Math.floor(0.88 * ech.length)]);
  return { W: W, H: H, gx: gx, gy: gy, mag: mag, seuil: seuil };
}

/* Hough pour une famille de droites : normale d'angle phi dans [centre - 30°, centre + 30°].
   Pour les verticales, la normale est horizontale (centre 0°) ; pour les horizontales, centre 90°. */
function droites(B, centre, longueurMin) {
  const W = B.W, H = B.H, PAS = 0.5, NA = Math.round(60 / PAS) + 1, diag = Math.ceil(Math.hypot(W, H)), NR = 2 * diag + 1;
  const acc = new Float32Array(NA * NR), cosT = new Float32Array(NA), sinT = new Float32Array(NA);
  for (let a = 0; a < NA; a++) { const t = (centre - 30 + a * PAS) * RAD; cosT[a] = Math.cos(t); sinT[a] = Math.sin(t); }
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    if (B.mag[i] < B.seuil) continue;
    // la normale à la droite suit le gradient : on ne vote que pour les angles proches de sa direction
    let t = Math.atan2(B.gy[i], B.gx[i]) / RAD;
    let dt = ((t - centre) % 180 + 180) % 180; if (dt > 90) dt -= 180;
    if (Math.abs(dt) > 32) continue;
    const a0 = Math.max(0, Math.round((dt + 30 - 6) / PAS)), a1 = Math.min(NA - 1, Math.round((dt + 30 + 6) / PAS));
    for (let a = a0; a <= a1; a++) acc[a * NR + Math.round(x * cosT[a] + y * sinT[a]) + diag] += 1;
  }
  // pics, chacun le plus fort de son voisinage (3° et 8 px)
  const pics = [];
  for (let a = 0; a < NA; a++) for (let r = 1; r < NR - 1; r++) {
    const v = acc[a * NR + r];
    if (v < longueurMin) continue;
    let max = true;
    for (let da = -6; da <= 6 && max; da++) {
      const aa = a + da; if (aa < 0 || aa >= NA) continue;
      for (let dr = -8; dr <= 8; dr++) {
        const rr = r + dr; if (rr < 0 || rr >= NR || (da === 0 && dr === 0)) continue;
        const w = acc[aa * NR + rr];
        if (w > v || (w === v && (aa * NR + rr) < (a * NR + r))) { max = false; break; }
      }
    }
    if (max) pics.push({ phi: (centre - 30 + a * PAS) * RAD, rho: r - diag, votes: v });
  }
  pics.sort((p, q) => q.votes - p.votes);
  return pics.slice(0, 40);
}

/* ---------- points de fuite ---------- */
// plus petit vecteur propre d'une matrice symétrique 3 x 3 (méthode de Jacobi)
function vecteurPropreMin(M) {
  const A = M.slice(), V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let it = 0; it < 30; it++) {
    let p = 0, q = 1;
    if (Math.abs(A[2]) > Math.abs(A[3 * p + q])) { p = 0; q = 2; }
    if (Math.abs(A[5]) > Math.abs(A[3 * p + q])) { p = 1; q = 2; }
    if (Math.abs(A[3 * p + q]) < 1e-14) break;
    const th = 0.5 * Math.atan2(2 * A[3 * p + q], A[3 * q + q] - A[3 * p + p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = A[3 * k + p], akq = A[3 * k + q]; A[3 * k + p] = c * akp - s * akq; A[3 * k + q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = A[3 * p + k], aqk = A[3 * q + k]; A[3 * p + k] = c * apk - s * aqk; A[3 * q + k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[3 * k + p], vkq = V[3 * k + q]; V[3 * k + p] = c * vkp - s * vkq; V[3 * k + q] = s * vkp + c * vkq; }
  }
  let m = 0;
  for (let k = 1; k < 3; k++) if (A[4 * k] < A[4 * m]) m = k;
  return [V[m], V[3 + m], V[6 + m]];
}
/* Droites en coordonnées centrées et réduites (x' = (x - W/2) / S) : l = (cos phi, sin phi, c). */
function enCoord(d, W, H, S) {
  const a = Math.cos(d.phi), b = Math.sin(d.phi);
  return { l: [a, b, (a * W / 2 + b * H / 2 - d.rho) / S], w: d.votes, phi: d.phi };
}
// écart d'angle (degrés) entre une droite et la direction vers le point de fuite v, vu depuis le point de la droite
// le plus proche du centre
function ecart(L, v) {
  const [a, b, c] = L.l, px = -a * c, py = -b * c, dx = -b, dy = a;
  const vx = v[0] - px * v[2], vy = v[1] - py * v[2];
  const n = Math.hypot(vx, vy);
  if (n < 1e-12) return 90;
  const cos = Math.abs(dx * vx + dy * vy) / n;
  return Math.acos(Math.min(1, cos)) / RAD;
}
function pointDeFuite(lignes) {
  let ls = lignes.slice();
  let v = null;
  for (let it = 0; it < 4 && ls.length >= 2; it++) {
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const L of ls) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[3 * i + j] += L.w * L.l[i] * L.l[j];
    v = vecteurPropreMin(M);
    const garde = ls.filter(L => ecart(L, v) < 1.5);
    if (garde.length === ls.length || garde.length < 3) break;
    ls = garde;
  }
  return { v: v, lignes: ls };
}

/* Estime le redressement à partir d'une petite image (700 px de large, comme pour le comptage).
   Renvoie null si la photo est déjà droite (à 1° près) ou si les droites ne sont pas assez sûres ;
   sinon { H } : homographie en coordonnées relatives (0 à 1 sur la photo d'origine → 0 à 1 sur la photo redressée),
   et { largeur, hauteur } relatives de la photo redressée (proportions à garder). */
export const SEUIL_ANGLE = 2, SEUIL_COTE = 1.10;
export let raison = '';
export function estimer(small) {
  raison = '';
  const W = small.width, H = small.height, S = Math.max(W, H) / 2, B = bords(small);
  const verts = droites(B, 0, 0.12 * H).map(d => enCoord(d, W, H, S));
  const hors = droites(B, 90, 0.12 * W).map(d => enCoord(d, W, H, S));
  if (verts.length + hors.length < 3) { raison = 'peu de droites'; return null; }
  // famille sans assez de droites sûres : direction moyenne (simple rotation), sinon point de fuite
  function famille(ls, axe) {
    if (ls.length >= 3) {
      const r = pointDeFuite(ls);
      if (r.v && r.lignes.length >= 3) {
        const xs = r.lignes.map(L => -L.l[0] * L.l[2]), ys = r.lignes.map(L => -L.l[1] * L.l[2]);
        const etendue = axe === 'v' ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys);
        if (etendue > 0.35) return r.v;          // droites assez écartées pour situer le point de fuite
      }
    }
    if (!ls.length) return axe === 'v' ? [0, 1, 0] : [1, 0, 0];
    // angle moyen pondéré des droites : point de fuite à l'infini dans cette direction
    let sx = 0, sy = 0;
    ls.slice(0, 12).forEach(L => { const dx = -Math.sin(L.phi), dy = Math.cos(L.phi), k = L.w; const s = axe === 'v' ? (dy < 0 ? -1 : 1) : (dx < 0 ? -1 : 1); sx += k * s * dx; sy += k * s * dy; });
    return [sx, sy, 0];
  }
  let vv = famille(verts, 'v'), vh = famille(hors, 'h');
  // points de fuite trop proches (moins d'une demi-image du centre) : erreur de repérage plutôt que vraie perspective
  const proche = v => Math.abs(v[2]) > 1e-9 && Math.hypot(v[0] / v[2], v[1] / v[2]) < 1.5;
  if (proche(vv) || proche(vh)) { raison = 'point de fuite trop proche'; return null; }
  // ligne de fuite l = vv x vh ; P la renvoie à l'infini ; puis A remet les deux directions droites
  let l = [vv[1] * vh[2] - vv[2] * vh[1], vv[2] * vh[0] - vv[0] * vh[2], vv[0] * vh[1] - vv[1] * vh[0]];
  if (Math.abs(l[2]) < 1e-12) return null;
  l = [l[0] / l[2], l[1] / l[2], 1];
  const P = [1, 0, 0, 0, 1, 0, l[0], l[1], 1];
  const dir = v => { const n = Math.hypot(v[0], v[1]); return [v[0] / n, v[1] / n]; };
  let dv = dir(vv), dh = dir(vh);
  if (dv[1] < 0) dv = [-dv[0], -dv[1]];
  if (dh[0] < 0) dh = [-dh[0], -dh[1]];
  // déjà droite : moins de 1° d'écart et presque pas de perspective
  const angle = Math.max(Math.abs(Math.atan2(dv[0], dv[1])), Math.abs(Math.atan2(dh[1], dh[0]))) / RAD;
  if (angle < 1 && Math.hypot(l[0], l[1]) < 0.04) { raison = 'déjà droite'; return null; }
  const det = dh[0] * dv[1] - dv[0] * dh[1];
  if (Math.abs(det) < 0.5) { raison = 'directions presque parallèles'; return null; }                           // directions presque parallèles : repérage douteux
  const A = [dv[1] / det, -dv[0] / det, 0, -dh[1] / det, dh[0] / det, 0, 0, 0, 1];
  // en coordonnées relatives : N (0..1 → centré réduit), puis A.P, puis remise à l'échelle sur la boîte englobante
  const N = [W / S, 0, -W / 2 / S, 0, H / S, -H / 2 / S, 0, 0, 1];
  let Hc = produit(produit(A, P), N);
  const coins = [[0, 0], [1, 0], [1, 1], [0, 1]].map(p => appliquer(Hc, p[0], p[1]));
  if (coins.some(p => !isFinite(p[0]) || !isFinite(p[1]))) return null;
  // l'image redressée ne doit pas être trop déformée (sinon : repérage douteux)
  const aire = q => Math.abs((q[0][0] * q[1][1] - q[1][0] * q[0][1]) + (q[1][0] * q[2][1] - q[2][0] * q[1][1]) + (q[2][0] * q[3][1] - q[3][0] * q[2][1]) + (q[3][0] * q[0][1] - q[0][0] * q[3][1])) / 2;
  const cotes = [0, 1, 2, 3].map(k => Math.hypot(coins[(k + 1) % 4][0] - coins[k][0], coins[(k + 1) % 4][1] - coins[k][1]));
  if (Math.max(cotes[0], cotes[2]) / Math.min(cotes[0], cotes[2]) > 1.8 || Math.max(cotes[1], cotes[3]) / Math.min(cotes[1], cotes[3]) > 1.8) { raison = 'trop déformée'; return null; }
  const x0 = Math.min(...coins.map(p => p[0])), x1 = Math.max(...coins.map(p => p[0])), y0 = Math.min(...coins.map(p => p[1])), y1 = Math.max(...coins.map(p => p[1]));
  const T = [1 / (x1 - x0), 0, -x0 / (x1 - x0), 0, 1 / (y1 - y0), -y0 / (y1 - y0), 0, 0, 1];
  Hc = produit(T, Hc);
  // proportions : même surface que l'original, forme de la boîte englobante
  const k = Math.sqrt(aire(coins) > 0 ? (W * H / S / S) / ((x1 - x0) * (y1 - y0)) : 1);
  // perspective : rapport entre côtés opposés une fois redressée (1 = aucune)
  // contrePlongee : haut et bas de la photo de largeurs différentes ; cote : gauche et droite de hauteurs différentes
  const contrePlongee = Math.max(cotes[0], cotes[2]) / Math.min(cotes[0], cotes[2]), cote = Math.max(cotes[1], cotes[3]) / Math.min(cotes[1], cotes[3]);
  /* On ne redresse que ce qui gêne le comptage : un bloc penché (plus de 2°) ou vu de côté (un côté plus haut que
     l'autre de 10 % ou plus). La contre-plongée seule (bloc haut photographié d'en bas) est bien gérée par le
     comptage, et toutes les photos réelles en ont un peu : la redresser ferait plus de mal que de bien (banc du
     18/11/2026 : cadrage.mjs). */
  if (angle < SEUIL_ANGLE && cote < SEUIL_COTE) { raison = 'presque droite'; return null; }
  return { H: Hc, largeur: (x1 - x0) * k * S / W, hauteur: (y1 - y0) * k * S / H, angle: angle, contrePlongee: contrePlongee, cote: cote };
}

/* Redresse une image (pixels) avec l'estimation : renvoie la nouvelle image et les homographies en pixels. */
export function redresserPixels(img, r, maxCote) {
  let W = Math.round(img.width * r.largeur), H = Math.round(img.height * r.hauteur);
  const k = maxCote ? Math.min(1, maxCote / Math.max(W, H)) : 1;
  W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
  // pixels source → relatif → relatif redressé → pixels sortie
  const versRel = [1 / img.width, 0, 0, 0, 1 / img.height, 0, 0, 0, 1], versPix = [W, 0, 0, 0, H, 0, 0, 0, 1];
  const Hp = produit(versPix, produit(r.H, versRel));
  return { image: deformer(img, inverse(Hp), W, H, couleurBord(img)), H: Hp };
}
