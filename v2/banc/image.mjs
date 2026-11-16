/* Images du banc : décodage des photos et mêmes opérations de « canvas » que dans le navigateur.
   - sharp décode la photo et la remet droite (orientation EXIF), comme le fait le navigateur ;
   - @napi-rs/canvas (moteur Skia, celui de Chrome) refait les drawImage de l'app avec les mêmes réglages. */
import sharp from 'sharp';
import { createCanvas, ImageData } from '@napi-rs/canvas';

/* Photo -> { canvas, width, height, fichier: { largeur, hauteur, octets, format } }, à l'endroit. */
export async function ouvrirPhoto(chemin) {
  const s = sharp(chemin, { failOn: 'none' }).rotate();           // rotate() sans angle = applique l'orientation EXIF
  const meta = await sharp(chemin).metadata();
  const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = createCanvas(info.width, info.height);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height), 0, 0);
  return { canvas: c, width: info.width, height: info.height, fichier: { largeur: info.width, hauteur: info.height, octets: meta.size || 0, format: meta.format } };
}

/* ---------- réduction « comme Chrome » ----------
   Quand une page réduit une image dans un canvas avec imageSmoothingQuality = 'high', Chrome (rendu par la carte
   graphique) ne fait pas de bicubique : il échantillonne des niveaux intermédiaires (mipmaps, chaque niveau = moitié
   du précédent) en trilinéaire, avec un biais de netteté d'un demi-niveau. Reproduit ici : sur les photos d'essai,
   l'image obtenue est celle de Chrome à 3 niveaux de gris près sur 255 (contre plus de 100 avec le 'high' de
   @napi-rs/canvas), et la grille comptée est la même. */
function bilineaire(im, W, H) {
  const o = new Uint8ClampedArray(W * H * 4), kx = im.width / W, ky = im.height / H, d = im.data, w = im.width, h = im.height;
  for (let y = 0; y < H; y++) {
    let sy = (y + 0.5) * ky - 0.5; sy = sy < 0 ? 0 : sy > h - 1 ? h - 1 : sy;
    const y0 = Math.floor(sy), y1 = Math.min(h - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < W; x++) {
      let sx = (x + 0.5) * kx - 0.5; sx = sx < 0 ? 0 : sx > w - 1 ? w - 1 : sx;
      const x0 = Math.floor(sx), x1 = Math.min(w - 1, x0 + 1), fx = sx - x0;
      const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, e = (y1 * w + x1) * 4, j = (y * W + x) * 4;
      for (let k = 0; k < 4; k++) o[j + k] = (d[a + k] * (1 - fx) + d[b + k] * fx) * (1 - fy) + (d[c + k] * (1 - fx) + d[e + k] * fx) * fy;
    }
  }
  return { data: o, width: W, height: H };
}
const moitie = im => bilineaire(im, Math.max(1, im.width >> 1), Math.max(1, im.height >> 1));
/* im : { data RGBA, width, height } -> même forme, en W x H (plus petit). */
export function reduireCommeChrome(im, W, H) {
  const niveau = Math.max(0, Math.log2(Math.max(im.width / W, im.height / H)) - 0.5);
  const n = Math.floor(niveau), reste = niveau - n;
  let bas = im;
  for (let i = 0; i < n; i++) bas = moitie(bas);
  const A = bilineaire(bas, W, H);
  if (reste < 1e-6) return A;
  const B = bilineaire(moitie(bas), W, H), o = A.data;
  for (let i = 0; i < o.length; i++) o[i] = A.data[i] * (1 - reste) + B.data[i] * reste;
  return A;
}

/* drawImage(src, sx, sy, sw, sh, 0, 0, w, h) dans un nouveau canvas, avec le résultat de Chrome.
   qualite : 'low' (défaut du navigateur) ou 'high'. En 'high', Chrome choisit selon l'échelle :
   - agrandissement : bicubique (le 'high' d'ici donne la même image à 2 niveaux près) ;
   - réduction de moins de 30 % : bilinéaire simple (le niveau de mipmap 0), comme 'low' ;
   - réduction plus forte : niveaux intermédiaires, voir reduireCommeChrome. */
export function dessiner(src, sx, sy, sw, sh, w, h, qualite) {
  const c = createCanvas(Math.max(1, w), Math.max(1, h)), g = c.getContext('2d');
  if (qualite === 'high') {
    const echelle = Math.min(c.width / sw, c.height / sh);
    if (echelle < Math.SQRT1_2) {
      const x = Math.max(0, Math.round(sx)), y = Math.max(0, Math.round(sy));
      const d = src.getContext('2d').getImageData(x, y, Math.min(src.width - x, Math.round(sw)), Math.min(src.height - y, Math.round(sh)));
      const r = reduireCommeChrome({ data: d.data, width: d.width, height: d.height }, c.width, c.height);
      g.putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
      return c;
    }
    if (echelle < 1) qualite = 'low';
  }
  if (qualite) g.imageSmoothingQuality = qualite;
  g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/* canvas -> { data: Uint8ClampedArray RGBA, width, height }, la forme attendue par BalCore et BalPaddle. */
export function pixels(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  return { data: new Uint8ClampedArray(d.data.buffer, d.data.byteOffset, d.data.length), width: c.width, height: c.height };
}

export async function enregistrerJPEG(c, chemin, qualite = 80) {
  const p = pixels(c);
  await sharp(Buffer.from(p.data.buffer, p.data.byteOffset, p.data.length), { raw: { width: p.width, height: p.height, channels: 4 } })
    .removeAlpha().jpeg({ quality: qualite }).toFile(chemin);
}
