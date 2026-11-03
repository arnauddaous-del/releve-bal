// PaddleOCR pipeline (det v4 + rec v6) on RGBA images {data,width,height}; works with onnxruntime-node or -web.
var BalPaddle = (function () {
  function resize(img, W, H) {
    var o = new Uint8ClampedArray(W * H * 4), kx = img.width / W, ky = img.height / H;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var sx = Math.min(img.width - 1, (x + 0.5) * kx - 0.5), sy = Math.min(img.height - 1, (y + 0.5) * ky - 0.5);
      sx = Math.max(0, sx); sy = Math.max(0, sy);
      var x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, x1 = Math.min(x0 + 1, img.width - 1), y1 = Math.min(y0 + 1, img.height - 1);
      for (var c = 0; c < 3; c++) {
        var a = img.data[(y0 * img.width + x0) * 4 + c], b = img.data[(y0 * img.width + x1) * 4 + c], d = img.data[(y1 * img.width + x0) * 4 + c], e = img.data[(y1 * img.width + x1) * 4 + c];
        o[(y * W + x) * 4 + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
      }
      o[(y * W + x) * 4 + 3] = 255;
    }
    return { data: o, width: W, height: H };
  }
  function crop(img, x, y, w, h) {
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
    w = Math.min(img.width - x, Math.round(w)); h = Math.min(img.height - y, Math.round(h));
    var o = new Uint8ClampedArray(w * h * 4);
    for (var j = 0; j < h; j++) o.set(img.data.subarray(((y + j) * img.width + x) * 4, ((y + j) * img.width + x + w) * 4), j * w * 4);
    return { data: o, width: w, height: h };
  }
  /* Text detection: returns boxes {x,y,w,h} in img pixels, top to bottom. */
  async function detect(ort, sess, img, maxSide) {
    maxSide = maxSide || 640;
    var k = Math.min(maxSide / Math.max(img.width, img.height), 4);
    var W = Math.max(32, Math.round(img.width * k / 32) * 32), H = Math.max(32, Math.round(img.height * k / 32) * 32);
    var r = resize(img, W, H), n = W * H, t = new Float32Array(3 * n);
    var mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (var i = 0; i < n; i++) for (var c = 0; c < 3; c++) t[c * n + i] = (r.data[i * 4 + c] / 255 - mean[c]) / std[c];
    var feeds = {}; feeds[sess.inputNames[0]] = new ort.Tensor('float32', t, [1, 3, H, W]);
    var out = (await sess.run(feeds))[sess.outputNames[0]].data;
    var bin = new Uint8Array(n);
    for (i = 0; i < n; i++) bin[i] = out[i] > 0.3 ? 1 : 0;
    var lab = new Int32Array(n), boxes = [], st = [];
    for (i = 0; i < n; i++) {
      if (!bin[i] || lab[i]) continue;
      var id = boxes.length + 1, b = { x0: W, y0: H, x1: 0, y1: 0, area: 0, score: 0 };
      lab[i] = id; st.push(i);
      while (st.length) {
        var p = st.pop(), px = p % W, py = (p - px) / W;
        b.area++; b.score += out[p];
        if (px < b.x0) b.x0 = px; if (px > b.x1) b.x1 = px; if (py < b.y0) b.y0 = py; if (py > b.y1) b.y1 = py;
        var nb = [p - 1, p + 1, p - W, p + W];
        for (var q = 0; q < 4; q++) { var z = nb[q]; if (z < 0 || z >= n) continue; if ((q === 0 && px === 0) || (q === 1 && px === W - 1)) continue; if (bin[z] && !lab[z]) { lab[z] = id; st.push(z); } }
      }
      boxes.push(b);
    }
    var sx = img.width / W, sy = img.height / H;
    return boxes.filter(function (b) { return b.area >= 12 && b.score / b.area > 0.5 && (b.y1 - b.y0) >= 3; }).map(function (b) {
      var w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, pad = h * 0.75;   // DB shrinks text: unclip
      var x0 = Math.max(0, (b.x0 - pad) * sx), y0 = Math.max(0, (b.y0 - pad) * sy);
      return {
        x: x0, y: y0, w: Math.min(img.width - x0, (w + 2 * pad) * sx), h: Math.min(img.height - y0, (h + 2 * pad) * sy),
        cx: b.x0 * sx, cw: w * sx,     // the text core, used to tell lines and labels apart (padded boxes overlap)
        cy: b.y0 * sy, ch: h * sy
      };
    }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  }
  /* Recognize one text line. dict: array of chars (index 1..). Returns {text, conf}. */
  async function recognize(ort, sess, img, dict) {
    var H = 48, W = Math.max(16, Math.min(960, Math.round(img.width * H / img.height)));
    var r = resize(img, W, H), n = W * H, t = new Float32Array(3 * n);
    for (var i = 0; i < n; i++) for (var c = 0; c < 3; c++) t[c * n + i] = (r.data[i * 4 + (2 - c)] / 255 - 0.5) / 0.5; // BGR
    var feeds = {}; feeds[sess.inputNames[0]] = new ort.Tensor('float32', t, [1, 3, H, W]);
    var o = (await sess.run(feeds))[sess.outputNames[0]], T = o.dims[1], C = o.dims[2], d = o.data;
    var s = '', last = -1, conf = 0, cnt = 0, minc = 1;
    for (var tt = 0; tt < T; tt++) {
      var best = 0, bv = -1;
      for (var k = 0; k < C; k++) if (d[tt * C + k] > bv) { bv = d[tt * C + k]; best = k; }
      if (best !== 0 && best !== last) { s += best <= dict.length ? dict[best - 1] : ' '; conf += bv; cnt++; if (bv < minc) minc = bv; }
      last = best;
    }
    return { text: s.trim(), conf: cnt ? conf / cnt : 0, minc: cnt ? minc : 0 };
  }
  /* Group detected boxes into text lines (top to bottom, then left to right). */
  function groupLines(boxes) {
    if (!boxes.length) return [];
    // a box much taller than the others (a sticker) must not glue two label lines together
    function cy(b) { return b.cy != null ? b.cy : b.y; }
    function ch(b) { return b.ch != null ? b.ch : b.h; }
    var hs = boxes.map(ch).sort(function (a, b) { return a - b; }), med = hs[Math.floor(hs.length / 2)];
    var tall = [], normal = [];
    boxes.forEach(function (b) { (boxes.length > 2 && ch(b) > 1.7 * med ? tall : normal).push(b); });
    var bs = normal.slice().sort(function (a, b) { return (cy(a) + ch(a) / 2) - (cy(b) + ch(b) / 2); }), rows = [];
    bs.forEach(function (b) {
      var g = rows[rows.length - 1];
      if (g) {
        // compare text cores with the last box added, not the whole growing group
        var l = g.items[g.items.length - 1], top = Math.max(cy(l), cy(b)), bot = Math.min(cy(l) + ch(l), cy(b) + ch(b));
        if (bot - top >= 0.5 * Math.min(ch(l), ch(b))) { g.items.push(b); return; }
      }
      rows.push({ items: [b] });
    });
    tall.forEach(function (b) { rows.push({ items: [b] }); });
    // two labels side by side on the same row: split where the horizontal gap is large
    var out = [];
    rows.forEach(function (g) {
      g.items.sort(function (a, b) { return a.x - b.x; });
      var cur = [g.items[0]];
      for (var i = 1; i < g.items.length; i++) {
        var p = cur[cur.length - 1], it = g.items[i];
        var pr = p.cx != null ? p.cx + p.cw : p.x + p.w, il = it.cx != null ? it.cx : it.x;
        // words of one label sit close; a gap wider than ~3 letter heights means another label
        if (il - pr > 3 * Math.min(ch(p), ch(it))) { out.push(cur); cur = [it]; } else cur.push(it);
      }
      out.push(cur);
    });
    return out.map(function (items) {
      var y0 = Math.min.apply(null, items.map(function (b) { return b.y; })), y1 = Math.max.apply(null, items.map(function (b) { return b.y + b.h; }));
      return { y0: y0, y1: y1, items: items };
    }).sort(function (a, b) { return ((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) || (a.items[0].x - b.items[0].x); });
  }
  // the multilingual model sometimes answers with a Greek or Cyrillic look-alike ("Clέment"): map it back to Latin
  var LOOK = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y',
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ё': 'ë', 'й': 'ň',
    'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
    'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'η': 'n',
    'έ': 'é', 'ά': 'á', 'ό': 'ó', 'ί': 'í', 'ύ': 'ú', 'ή': 'é', 'ὲ': 'è', 'ὰ': 'à', 'ῖ': 'î' };
  function latin(t) {
    return String(t).normalize('NFKC').replace(/[\u0370-\u03FF\u0400-\u04FF\u1F00-\u1FFF]/g, function (c) { return LOOK[c] || c; });
  }
  /* ---------- Enhancement of hesitant lines (handwriting): straighten, trim, normalise contrast ---------- */
  function toGray(img) {
    var n = img.width * img.height, g = new Float32Array(n), d = img.data;
    for (var i = 0, j = 0; i < n; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return g;
  }
  function otsu(g) {
    var hist = new Float64Array(256), i, n = g.length;
    for (i = 0; i < n; i++) hist[Math.max(0, Math.min(255, Math.round(g[i])))]++;
    var sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
    var wB = 0, sB = 0, best = -1, thr = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      var wF = n - wB; if (!wF) break;
      sB += i * hist[i];
      var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = i; }
    }
    return thr + 1;                                      // pixels below the returned value belong to the dark class
  }
  function median(g) {
    var h = new Uint32Array(256), i, n = g.length, a = 0;
    for (i = 0; i < n; i++) h[Math.max(0, Math.min(255, Math.round(g[i])))]++;
    for (i = 0; i < 256; i++) { a += h[i]; if (a >= n / 2) return i; }
    return 255;
  }
  /* Rotate a gray image by deg around its centre (same size, bilinear), filling the corners with `fill`. */
  function rotateGray(g, w, h, deg, fill) {
    var a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), cx = (w - 1) / 2, cy = (h - 1) / 2, o = new Float32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var dx = x - cx, dy = y - cy, sx = cs * dx - sn * dy + cx, sy = sn * dx + cs * dy + cy;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) { o[y * w + x] = fill; continue; }
      var x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
      o[y * w + x] = (g[y0 * w + x0] * (1 - fx) + g[y0 * w + x1] * fx) * (1 - fy) + (g[y1 * w + x0] * (1 - fx) + g[y1 * w + x1] * fx) * fy;
    }
    return o;
  }
  /* Baseline slope in degrees (-6..6): the angle at which the rows of ink are the most sharply separated. */
  function skewAngle(g, w, h, thr, textIsDark) {
    var k = Math.max(1, Math.floor(Math.max(w, h) / 360)), pts = [], x, y;
    for (y = 0; y < h; y += k) for (x = 0; x < w; x += k) { var v = g[y * w + x]; if (textIsDark ? v < thr : v > thr) pts.push(x, y); }
    if (pts.length < 40) return 0;
    var off = Math.ceil(w * 0.11) + 2, bins = h + 2 * off + 4;
    function score(deg) {
      var t = Math.tan(deg * Math.PI / 180), hist = new Float64Array(bins), i, s = 0;
      for (i = 0; i < pts.length; i += 2) { var r = Math.round(pts[i + 1] - pts[i] * t + off); if (r >= 0 && r < bins) hist[r]++; }
      for (i = 0; i < bins; i++) s += hist[i] * hist[i];
      return s;
    }
    var best = 0, bs = score(0), base = bs;
    for (var d = -6; d <= 6; d += 1) { if (!d) continue; var sc = score(d); if (sc > bs) { bs = sc; best = d; } }
    for (var d2 = best - 0.5; d2 <= best + 0.5; d2 += 0.5) { if (d2 === best) continue; var sc2 = score(d2); if (sc2 > bs) { bs = sc2; best = d2; } }
    return bs > base * 1.04 ? best : 0;
  }
  /* Contrast-limited adaptive histogram equalisation on a gray image (tiles interpolated bilinearly). */
  function clahe(g, w, h, tx, ty, clip) {
    var tw = w / tx, th = h / ty, luts = [], i, j, k, x, y;
    for (j = 0; j < ty; j++) for (i = 0; i < tx; i++) {
      var x0 = Math.floor(i * tw), x1 = Math.max(x0 + 1, Math.floor((i + 1) * tw)), y0 = Math.floor(j * th), y1 = Math.max(y0 + 1, Math.floor((j + 1) * th));
      var hist = new Float64Array(256), cnt = 0;
      for (y = y0; y < Math.min(h, y1); y++) for (x = x0; x < Math.min(w, x1); x++) { hist[Math.max(0, Math.min(255, Math.round(g[y * w + x])))]++; cnt++; }
      var lim = Math.max(1, clip * cnt / 256), ex = 0;
      for (k = 0; k < 256; k++) if (hist[k] > lim) { ex += hist[k] - lim; hist[k] = lim; }
      var add = ex / 256, lut = new Float32Array(256), acc = 0;
      for (k = 0; k < 256; k++) { hist[k] += add; acc += hist[k]; lut[k] = 255 * acc / Math.max(1, cnt); }
      luts.push(lut);
    }
    var o = new Float32Array(w * h);
    for (y = 0; y < h; y++) {
      var fy = (y + 0.5) / th - 0.5, j0 = Math.max(0, Math.min(ty - 1, Math.floor(fy))), j1 = Math.min(ty - 1, j0 + 1), wy = Math.max(0, Math.min(1, fy - j0));
      for (x = 0; x < w; x++) {
        var fx = (x + 0.5) / tw - 0.5, i0 = Math.max(0, Math.min(tx - 1, Math.floor(fx))), i1 = Math.min(tx - 1, i0 + 1), wx = Math.max(0, Math.min(1, fx - i0));
        var v = Math.max(0, Math.min(255, Math.round(g[y * w + x])));
        var a = luts[j0 * tx + i0][v] * (1 - wx) + luts[j0 * tx + i1][v] * wx, b = luts[j1 * tx + i0][v] * (1 - wx) + luts[j1 * tx + i1][v] * wx;
        o[y * w + x] = a * (1 - wy) + b * wy;
      }
    }
    return o;
  }
  /* Adaptive (Sauvola) black-on-white thresholding, softened with a 3x3 mean so strokes keep anti-aliased edges. */
  function sauvola(g, w, h, win, k) {
    var W1 = w + 1, I = new Float64Array(W1 * (h + 1)), I2 = new Float64Array(W1 * (h + 1)), x, y;
    for (y = 0; y < h; y++) {
      var rs = 0, rs2 = 0;
      for (x = 0; x < w; x++) { var v = g[y * w + x]; rs += v; rs2 += v * v; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + rs; I2[(y + 1) * W1 + x + 1] = I2[y * W1 + x + 1] + rs2; }
    }
    var r = Math.max(3, Math.round(win / 2)), o = new Float32Array(w * h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1), ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1), n = (xb - xa) * (yb - ya);
      var s = I[yb * W1 + xb] - I[ya * W1 + xb] - I[yb * W1 + xa] + I[ya * W1 + xa], s2 = I2[yb * W1 + xb] - I2[ya * W1 + xb] - I2[yb * W1 + xa] + I2[ya * W1 + xa];
      var m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)), t = m * (1 + k * (sd / 128 - 1));
      o[y * w + x] = g[y * w + x] < t ? 0 : 255;
    }
    var sm = new Float32Array(w * h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var a = 0, c = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { a += o[yy * w + xx]; c++; } }
      sm[y * w + x] = a / c;
    }
    return sm;
  }
  /* Enhanced copy of a label line: straightened, dark ink on a light background, trimmed with a margin, then
     mode 'clahe' (local contrast) or 'bin' (adaptive binarisation). Returns an RGBA image, or null if the crop is unusable. */
  function enhance(img, mode) {
    var w = img.width, h = img.height;
    if (w < 12 || h < 8) return null;
    var g = toGray(img), thr = otsu(g), nDark = 0, i;
    for (i = 0; i < g.length; i++) if (g[i] < thr) nDark++;
    var textIsDark = nDark <= g.length / 2;                // ink is the minority class
    var bg = median(g);
    var ang = skewAngle(g, w, h, thr, textIsDark);
    if (ang) g = rotateGray(g, w, h, ang, bg);
    if (!textIsDark) { for (i = 0; i < g.length; i++) g[i] = 255 - g[i]; thr = 255 - thr; }   // light-on-dark label: invert
    // bounding box of the ink: rows and columns holding enough dark pixels (isolated specks and tape edges ignored)
    var colN = new Uint32Array(w), rowN = new Uint32Array(h), x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (g[y * w + x] < thr) { colN[x]++; rowN[y]++; }
    var cMin = Math.max(1, Math.round(0.03 * h)), rMin = Math.max(1, Math.round(0.01 * w));
    var bx0 = 0, bx1 = w - 1, by0 = 0, by1 = h - 1;
    while (bx0 < w && colN[bx0] < cMin) bx0++; while (bx1 > bx0 && colN[bx1] < cMin) bx1--;
    while (by0 < h && rowN[by0] < rMin) by0++; while (by1 > by0 && rowN[by1] < rMin) by1--;
    if (bx1 - bx0 + 1 < 0.2 * w || by1 - by0 + 1 < 0.2 * h || bx0 >= bx1 || by0 >= by1) { bx0 = 0; bx1 = w - 1; by0 = 0; by1 = h - 1; }
    var bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, mgn = Math.max(4, Math.round(0.3 * bh));
    var W = bw + 2 * mgn, H = bh + 2 * mgn, p = new Float32Array(W * H), bgv = median(g);
    for (i = 0; i < p.length; i++) p[i] = bgv;
    for (y = 0; y < bh; y++) for (x = 0; x < bw; x++) p[(y + mgn) * W + x + mgn] = g[(by0 + y) * w + bx0 + x];
    var q;
    if (mode === 'bin') q = sauvola(p, W, H, Math.max(15, Math.round(0.9 * bh)), 0.2);
    else q = clahe(p, W, H, Math.max(1, Math.min(8, Math.round(W / 90))), Math.max(1, Math.min(2, Math.round(H / 70))), 3);
    var out = new Uint8ClampedArray(W * H * 4);
    for (i = 0; i < W * H; i++) { var v = Math.max(0, Math.min(255, Math.round(q[i]))); out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255; }
    return { data: out, width: W, height: H, angle: ang };
  }

  /* ---------- Vote between several readings of the same line ---------- */
  /* Align b to the reference a (edit distance). Returns {rep[i]: what b has at a[i] ('' = missing), ins[i]: what b adds before a[i]}. */
  function alignTo(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d.push(new Array(n + 1)); d[i][0] = i; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    var rep = new Array(m).fill(''), ins = new Array(m + 1).fill('');
    i = m; j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { rep[i - 1] = b[j - 1]; i--; j--; }
      else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { i--; }
      else { ins[i] = b[j - 1] + ins[i]; j--; }
    }
    return { rep: rep, ins: ins };
  }
  /* cands: [{text, conf, minc}]. Takes the best reading as the reference, then, character by character, the
     majority of the three readings (two agreeing against the reference win; a three-way split keeps the reference). */
  function vote(cands) {
    var c = cands.slice().sort(function (x, y) { return (y.conf + y.minc) - (x.conf + x.minc); });
    var ref = c[0].text;
    if (c.length < 3) return { text: ref, agree: c.filter(function (k) { return k.text === ref; }).length, cands: c };
    var A = alignTo(ref, c[1].text), B = alignTo(ref, c[2].text), s = '';
    for (var i = 0; i <= ref.length; i++) {
      if (A.ins[i] && A.ins[i] === B.ins[i]) s += A.ins[i];
      if (i === ref.length) break;
      var r = ref[i], x = A.rep[i], y = B.rep[i];
      s += (x === y && x !== r) ? x : r;
    }
    s = s.replace(/\s+/g, ' ').trim();
    var eq = c.filter(function (k) { return k.text === s; });
    // a mixed string that no reading produced is not a majority: keep the best reading as is
    if (!eq.length) return { text: ref, agree: c.filter(function (k) { return k.text === ref; }).length, cands: c };
    return { text: s || ref, agree: eq.length, cands: c };
  }

  /* Full read of an image: [{text, conf (0-100), agree, alts}] per text line.
     A hesitant part (confidence under 0.85, or one letter under 0.5) is read three ways and the readings are voted:
       with opts.assist: small on the crop, medium on the crop, medium on the enhanced crop;
       without:          small on the crop, small on the enhanced crop, small on the binarised crop.
     opts.enhance === false turns the extra readings off (old behaviour: only the medium model as second opinion). */
  async function readLines(ort, det, rec, img, dict, opts) {
    opts = opts || {};
    var boxes = (await detect(ort, det, img, 960)).filter(function (b) { return b.w > 6 && b.h > 5; }).slice(0, 24);
    var groups = groupLines(boxes), out = [], assisted = 0, enhanced = 0;
    function clean(t) { return latin(t).replace(/[^\u0000-ɏ’]/g, '').trim(); }
    function cand(r) { return { text: clean(r.text), conf: r.conf, minc: r.minc }; }
    for (var g = 0; g < groups.length; g++) {
      var parts = [], cs = [], pAlts = [], pAgree = [];
      for (var i = 0; i < groups[g].items.length; i++) {
        var b = groups[g].items[i], crop1 = crop(img, b.x, b.y, b.w, b.h), r = await recognize(ort, rec, crop1, dict);
        var weak = r.conf < 0.85 || r.minc < 0.5, t = clean(r.text), conf = r.conf, alts = [], agree = null;
        if (weak && opts.enhance === false) {
          if (opts.assist) {
            var rr = await recognize(ort, opts.assist.sess, crop1, opts.assist.dict || dict); assisted++;
            if (rr.conf + rr.minc > r.conf + r.minc) { t = clean(rr.text); conf = rr.conf; }
          }
        } else if (weak) {
          var cands = [cand(r)], strong = opts.assist || null, e1 = null, e2 = null;
          try { e1 = enhance(crop1, 'clahe'); if (!strong) e2 = enhance(crop1, 'bin'); } catch (err) { e1 = null; e2 = null; }
          if (strong) {
            cands.push(cand(await recognize(ort, strong.sess, crop1, strong.dict || dict)));
            if (e1) cands.push(cand(await recognize(ort, strong.sess, e1, strong.dict || dict)));
            assisted++;
          } else {
            if (e1) cands.push(cand(await recognize(ort, rec, e1, dict)));
            if (e2) cands.push(cand(await recognize(ort, rec, e2, dict)));
          }
          if (e1) enhanced++;
          cands = cands.filter(function (k) { return k.text; });
          if (cands.length) {
            var v = vote(cands), eq = v.cands.filter(function (k) { return k.text === v.text; });
            t = v.text; agree = v.agree;
            conf = eq.length ? Math.max.apply(null, eq.map(function (k) { return k.conf; })) : v.cands.reduce(function (a, k) { return a + k.conf; }, 0) / v.cands.length;
            v.cands.forEach(function (k) { if (k.text !== t && alts.indexOf(k.text) < 0) alts.push(k.text); });
          }
        }
        if (t) { parts.push(t); cs.push(conf); pAlts.push(alts); pAgree.push(agree); }
      }
      if (parts.length) {
        var line = { text: parts.join(' '), conf: 100 * cs.reduce(function (a, c) { return a + c; }, 0) / cs.length, alts: [], agree: null };
        var ag = pAgree.filter(function (a) { return a != null; });
        if (ag.length) line.agree = Math.min.apply(null, ag);
        // alternative lines: one hesitant part swapped for another reading at a time, least confident part first
        var order = parts.map(function (_, k) { return k; }).sort(function (a, b) { return cs[a] - cs[b]; });
        order.forEach(function (k) {
          pAlts[k].forEach(function (a) {
            if (line.alts.length >= 2) return;
            var alt = parts.map(function (p, q) { return q === k ? a : p; }).join(' ');
            if (alt !== line.text && line.alts.indexOf(alt) < 0) line.alts.push(alt);
          });
        });
        out.push(line);
      }
    }
    out.assisted = assisted; out.enhanced = enhanced;
    return out;
  }
  return { detect: detect, recognize: recognize, crop: crop, resize: resize, groupLines: groupLines, readLines: readLines, enhance: enhance, vote: vote, alignTo: alignTo, skewAngle: skewAngle, clahe: clahe, sauvola: sauvola, rotateGray: rotateGray, toGray: toGray };
})();
if (typeof module !== 'undefined') module.exports = BalPaddle;

/* Worker: loads the models once, then reads one mailbox image per message.
   Recognition: PaddleOCR v6 small; hesitant lines are read three ways (straightened / contrast-normalised / binarised copies,
   or the medium model with "lecture renforcée") and voted. */
(function () {
  var det = null, rec = null, dict = null, assist = null, assistLoading = null, base = '';
  function get(url, as) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url.split('/').pop()); return as === 'text' ? r.text() : r.arrayBuffer(); });
  }
  function session(buf) { return ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] }); }
  function loadAssist() {
    if (assist) return Promise.resolve(assist);
    if (assistLoading) return assistLoading;
    assistLoading = Promise.all([1, 2, 3].map(function (i) { return get(base + 'rec6m-' + i + '.wasm'); })).then(function (parts) {
      var total = parts.reduce(function (a, p) { return a + p.byteLength; }, 0), buf = new Uint8Array(total), off = 0;
      parts.forEach(function (p) { buf.set(new Uint8Array(p), off); off += p.byteLength; });
      return ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
    }).then(function (s) { assist = { sess: s, dict: dict }; return assist; }, function (e) { assistLoading = null; throw e; });
    return assistLoading;
  }
  self.onmessage = function (e) {
    var m = e.data;
    (async function () {
      if (m.type === 'init') {
        base = m.base;
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = base;
        var res = await Promise.all([get(base + 'det.wasm'), get(base + 'rec6s.wasm'), get(base + 'dict6.txt', 'text')]);
        det = await session(res[0]);
        rec = await session(res[1]);
        dict = res[2].split('\n'); if (dict[dict.length - 1] === '') dict.pop();
        if (m.assist) await loadAssist();
        return { assist: !!assist };
      }
      if (m.type === 'assist') { await loadAssist(); return { assist: true }; }
      if (m.type === 'read') {
        var img = { data: new Uint8ClampedArray(m.buf), width: m.w, height: m.h };
        var lines = await BalPaddle.readLines(ort, det, rec, img, dict, { assist: m.assist ? assist : null, enhance: m.enhance !== false });
        return { lines: lines.slice(), assisted: lines.assisted || 0, enhanced: lines.enhanced || 0 };
      }
      throw new Error('message inconnu');
    })().then(function (r) { r.id = m.id; r.ok = true; self.postMessage(r); },
      function (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); });
  };
})();
