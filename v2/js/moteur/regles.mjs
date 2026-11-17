/* Imprim Bal 2 — grille des boîtes et règles de lecture des étiquettes (parseLabel).
   Repris de la V1 (bloc BalCore de index.html, état v1-finale, commit 8e6de26) puis modifié ici pour la V2 :
   la V1 n'importe pas ce fichier et n'est pas touchée. Module ES, utilisable dans un Worker et dans Node (banc). */
import { BalNames } from './prenoms.mjs';
var BalCore = (function () {
  function gray(img) {
    var n = img.width * img.height, g = new Float32Array(n), d = img.data;
    for (var i = 0, j = 0; i < n; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return g;
  }
  function smooth(a, r) {
    var out = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) {
      var s = 0, c = 0;
      for (var k = -r; k <= r; k++) { var j = i + k; if (j >= 0 && j < a.length) { s += a[j]; c++; } }
      out[i] = s / c;
    }
    return out;
  }
  /* Fraction of scan lines crossing a strong edge at each position.
     axis 'x': vertical lines, positions along x, scanning rows y0..y1 between x0..x1. */
  function lineProfile(g, W, H, axis, x0, x1, y0, y1, thr) {
    thr = thr || 14;
    x0 = Math.max(1, Math.round(x0)); x1 = Math.min(W - 2, Math.round(x1));
    y0 = Math.max(1, Math.round(y0)); y1 = Math.min(H - 2, Math.round(y1));
    var len = axis === 'x' ? W : H, prof = new Float32Array(len), x, y, v, n;
    if (axis === 'x') {
      n = y1 - y0 + 1;
      for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
        v = Math.abs(g[y * W + x + 1] - g[y * W + x - 1]);
        if (v > thr) prof[x] += 1;
      }
    } else {
      n = x1 - x0 + 1;
      for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
        v = Math.abs(g[(y + 1) * W + x] - g[(y - 1) * W + x]);
        if (v > thr) prof[y] += 1;
      }
    }
    for (var i = 0; i < len; i++) prof[i] /= n;
    return prof;
  }
  /* Pick k peaks in prof[a..b] with min separation sep, strongest first, returned sorted. */
  function peaks(prof, a, b, k, sep) {
    var cand = [];
    for (var i = Math.max(a, 1); i < Math.min(b, prof.length - 1); i++) {
      if (prof[i] >= prof[i - 1] && prof[i] >= prof[i + 1]) cand.push(i);
    }
    cand.sort(function (p, q) { return prof[q] - prof[p]; });
    var out = [];
    for (var c = 0; c < cand.length && out.length < k; c++) {
      var ok = true;
      for (var o = 0; o < out.length; o++) if (Math.abs(out[o] - cand[c]) < sep) { ok = false; break; }
      if (ok) out.push(cand[c]);
    }
    return out.sort(function (p, q) { return p - q; });
  }
  function localPeak(prof, center, radius) {
    var best = Math.round(center), bv = -1;
    for (var i = Math.round(center - radius); i <= Math.round(center + radius); i++) {
      if (i < 1 || i >= prof.length - 1) continue;
      if (prof[i] > bv) { bv = prof[i]; best = i; }
    }
    return best;
  }

  /* Grid model, all in fractions of the photo (0..1):
     {frame:{x0,y0,x1,y1}, cols:[x dividers between columns], rows:[[y dividers] per column], off:{'c,r':true}} */
  function uniformGrid(nc, nr, frame) {
    var f = frame || { x0: 0.06, y0: 0.12, x1: 0.94, y1: 0.88 }, g = { frame: f, cols: [], rows: [], off: {} };
    for (var c = 1; c < nc; c++) g.cols.push(f.x0 + (f.x1 - f.x0) * c / nc);
    for (var k = 0; k < nc; k++) {
      var r = [];
      for (var j = 1; j < nr; j++) r.push(f.y0 + (f.y1 - f.y0) * j / nr);
      g.rows.push(r);
    }
    return g;
  }
  function colBounds(g, c) {
    return [c === 0 ? g.frame.x0 : g.cols[c - 1], c === g.cols.length ? g.frame.x1 : g.cols[c]];
  }
  function rowBounds(g, c, r) {
    var rs = g.rows[c];
    return [r === 0 ? g.frame.y0 : rs[r - 1], r === rs.length ? g.frame.y1 : rs[r]];
  }
  function cells(g) {
    var out = [], nc = g.cols.length + 1, nr = g.rows[0].length + 1;
    for (var r = 0; r < nr; r++) for (var c = 0; c < nc; c++) {
      var cb = colBounds(g, c), rb = rowBounds(g, c, r);
      out.push({ c: c, r: r, x0: cb[0], x1: cb[1], y0: rb[0], y1: rb[1], off: !!g.off[c + ',' + r] });
    }
    return out;
  }

  /* Snap the grid to the photo's door edges. small = downscaled image (~700px wide).
     mode 'detect': global peak search (counts from the grid); mode 'snap': refine near current lines. */
  function fitGrid(small, g, mode) {
    var W = small.width, H = small.height, gr = gray(small);
    var nc = g.cols.length + 1, nr = g.rows[0].length + 1, f = g.frame;
    var fx0 = f.x0 * W, fx1 = f.x1 * W, fy0 = f.y0 * H, fy1 = f.y1 * H;
    // frame edges: local search within 6% of the photo
    var px = smooth(lineProfile(gr, W, H, 'x', fx0 - 0.06 * W, fx1 + 0.06 * W, fy0 + 0.1 * (fy1 - fy0), fy1 - 0.1 * (fy1 - fy0)), 1);
    var py = smooth(lineProfile(gr, W, H, 'y', fx0 + 0.1 * (fx1 - fx0), fx1 - 0.1 * (fx1 - fx0), fy0 - 0.06 * H, fy1 + 0.06 * H), 1);
    var nfx0 = localPeak(px, fx0, 0.05 * W), nfx1 = localPeak(px, fx1, 0.05 * W);
    var nfy0 = localPeak(py, fy0, 0.05 * H), nfy1 = localPeak(py, fy1, 0.05 * H);
    if (nfx1 - nfx0 > 0.2 * W) { fx0 = nfx0; fx1 = nfx1; }
    if (nfy1 - nfy0 > 0.2 * H) { fy0 = nfy0; fy1 = nfy1; }
    var out = { frame: { x0: fx0 / W, x1: fx1 / W, y0: fy0 / H, y1: fy1 / H }, cols: [], rows: [], off: g.off };
    var cw = (fx1 - fx0) / nc, inset = 0.1 * (fy1 - fy0);
    var pc = smooth(lineProfile(gr, W, H, 'x', fx0, fx1, fy0 + inset, fy1 - inset), 2);
    var xs;
    if (mode === 'detect') xs = peaks(pc, Math.round(fx0 + 0.08 * cw), Math.round(fx1 - 0.08 * cw), nc - 1, Math.max(4, 0.15 * cw));
    else if (mode === 'rows') xs = g.cols.map(function (x) { return x * W; });
    else xs = g.cols.map(function (x) { return localPeak(pc, x * W, 0.3 * cw); });
    if (xs.length !== nc - 1) xs = g.cols.map(function (x) { return x * W; });
    out.cols = xs.map(function (x) { return x / W; });
    for (var c = 0; c < nc; c++) {
      var cx0 = c === 0 ? fx0 : xs[c - 1], cx1 = c === nc - 1 ? fx1 : xs[c], m = 0.12 * (cx1 - cx0);
      var rh = (fy1 - fy0) / nr;
      // door joints cross the whole door, slots and labels do not: keep lines present near both side edges
      var cwid = cx1 - cx0;
      var pl = smooth(lineProfile(gr, W, H, 'y', cx0 + 0.03 * cwid, cx0 + 0.13 * cwid, fy0, fy1), 2);
      var prr = smooth(lineProfile(gr, W, H, 'y', cx1 - 0.13 * cwid, cx1 - 0.03 * cwid, fy0, fy1), 2);
      var pm = smooth(lineProfile(gr, W, H, 'y', cx0 + m, cx1 - m, fy0, fy1), 2);
      var pr = new Float32Array(pl.length);
      for (var q = 0; q < pl.length; q++) pr[q] = Math.min(pl[q], prr[q]) * 0.7 + pm[q] * 0.3;
      var ys;
      if (mode === 'detect' || mode === 'rows') ys = peaks(pr, Math.round(fy0 + 0.3 * rh), Math.round(fy1 - 0.3 * rh), nr - 1, Math.max(4, 0.45 * rh));
      else ys = g.rows[c].map(function (y) { return localPeak(pr, y * H, 0.3 * rh); });
      if (ys.length !== nr - 1) ys = g.rows[c].map(function (y) { return y * H; });
      out.rows.push(ys.map(function (y) { return y / H; }));
    }
    if (mode === 'detect' || mode === 'rows') {
      // a column much narrower than the others is the cabinet's central bar: switch it off
      var widths = [];
      for (var k = 0; k < nc; k++) { var b = colBounds(out, k); widths.push(b[1] - b[0]); }
      var sorted = widths.slice().sort(function (a, b) { return a - b; }), med = sorted[Math.floor(nc / 2)];
      var off = {};
      for (k = 0; k < nc; k++) if (widths[k] < 0.45 * med) for (var r = 0; r < nr; r++) off[k + ',' + r] = true;
      out.off = off;
    }
    return out;
  }

  /* First guess of the cabinet's outer frame: the pair of edges between which n evenly spaced
     doors best line up with the photo's edges (rows, then columns). */
  function fitAxis(prof, lo, hi, n, tol, minFrac) {
    lo = Math.max(1, Math.round(lo)); hi = Math.min(prof.length - 2, Math.round(hi));
    var mx = 0, i, cand = [];
    for (i = lo; i <= hi; i++) mx = Math.max(mx, prof[i]);
    for (i = lo; i <= hi; i++) if (prof[i] >= prof[i - 1] && prof[i] >= prof[i + 1] && prof[i] >= 0.25 * mx) cand.push(i);
    var best = null, bs = -1, span = hi - lo;
    for (var a = 0; a < cand.length; a++) for (var b = a + 1; b < cand.length; b++) {
      var A = cand[a], B = cand[b], L = B - A;
      if (L < (minFrac || 0.3) * span) continue;
      var sc = prof[A] + prof[B], step = L / n, r = Math.max(2, tol * step);
      for (var j = 1; j < n; j++) {
        var c = A + j * step, m = 0;
        for (var k = Math.round(c - r); k <= Math.round(c + r); k++) if (prof[k] > m) m = prof[k];
        sc += m;
      }
      sc = sc / (n + 1) * (1 + 0.5 * L / span);
      if (sc > bs) { bs = sc; best = [A, B]; }
    }
    return best;
  }
  function guessFrame(small, nc, nr) {
    var W = small.width, H = small.height, gr = gray(small);
    var py = smooth(lineProfile(gr, W, H, 'y', 0.25 * W, 0.75 * W, 1, H - 2), 2);
    var ys = fitAxis(py, 0.01 * H, 0.99 * H, nr || 4, 0.12) || [0.08 * H, 0.92 * H];
    var px = smooth(lineProfile(gr, W, H, 'x', 1, W - 2, ys[0] + 0.05 * (ys[1] - ys[0]), ys[1] - 0.05 * (ys[1] - ys[0])), 2);
    var xs = fitAxis(px, 0.01 * W, 0.99 * W, nc || 2, 0.3, 0.5) || [0.06 * W, 0.94 * W];
    return { x0: xs[0] / W, y0: ys[0] / H, x1: xs[1] / W, y1: ys[1] / H };
  }


  /* Count columns and rows automatically. Returns {cols, rows, frame}. */
  function countPeaks(prof, a, b, sep) {
    var mx = 0, i;
    for (i = Math.round(a); i < Math.round(b); i++) mx = Math.max(mx, prof[i]);
    var thr = Math.max(0.3, 0.5 * mx);
    var pk = peaks(prof, Math.round(a), Math.round(b), 99, sep).filter(function (i) { return prof[i] >= thr; });
    return pk;
  }
  function profAt(prof, c, r) {
    var m = 0;
    for (var k = Math.round(c - r); k <= Math.round(c + r); k++) if (k >= 0 && k < prof.length && prof[k] > m) m = prof[k];
    return m;
  }
  /* How well n evenly spaced doors explain the edges: dividers on strong lines, door middles quiet. */
  function periodScore(prof, A, B, n) {
    var step = (B - A) / n, r = Math.max(2, 0.1 * step), on = 0, off = 0;
    for (var j = 1; j < n; j++) on += profAt(prof, A + j * step, r);
    for (j = 0; j < n; j++) off += profAt(prof, A + (j + 0.5) * step, r * 0.5);
    on = n > 1 ? on / (n - 1) : (prof[Math.round(A)] + prof[Math.round(B)]) / 2;
    // a door-sized step beyond either end that still lands on a strong line means the frame stops short
    var ext = Math.max(A - step > 2 ? profAt(prof, A - step, r) : 0, B + step < prof.length - 3 ? profAt(prof, B + step, r) : 0);
    var ends = (profAt(prof, A, 2) + profAt(prof, B, 2)) / 2;
    return on - off / n - 0.6 * Math.max(0, ext - 0.5 * ends);
  }
  function mergeLines(prof, a, b, sep, rel) {
    var mx = 0, i;
    for (i = Math.round(a); i < Math.round(b); i++) mx = Math.max(mx, prof[i]);
    return peaks(prof, Math.round(a), Math.round(b), 99, sep).filter(function (i) { return prof[i] >= Math.max(0.25, rel * mx); });
  }
  function autoCount(small) {
    var W = small.width, H = small.height, gr = gray(small);
    var py = smooth(lineProfile(gr, W, H, 'y', 0.2 * W, 0.8 * W, 1, H - 2), 2);
    var ys = mergeLines(py, 2, H - 3, Math.max(4, 0.06 * H), 0.45);
    if (ys.length < 2) return { cols: 2, rows: 4, frame: guessFrame(small, 2, 4) };
    // a slot or label edge just under a door top is not a new row: merge lines much closer than the usual spacing
    for (var pass = 0; pass < 2 && ys.length > 2; pass++) {
      var gs = [];
      for (var t = 0; t < ys.length - 1; t++) gs.push(ys[t + 1] - ys[t]);
      var gm = gs.slice().sort(function (p, q) { return p - q; })[Math.floor(gs.length / 2)];
      var keep = [ys[0]];
      for (t = 1; t < ys.length; t++) {
        var prev = keep[keep.length - 1];
        if (ys[t] - prev < 0.45 * gm) { if (py[ys[t]] > py[prev]) keep[keep.length - 1] = ys[t]; }
        else keep.push(ys[t]);
      }
      ys = keep;
    }
    // a band about twice as tall as the others hides a weaker door joint: look for it in the middle
    for (var pass2 = 0; pass2 < 3 && ys.length > 2; pass2++) {
      var gs2 = [];
      for (var t2 = 0; t2 < ys.length - 1; t2++) gs2.push(ys[t2 + 1] - ys[t2]);
      var gm2 = gs2.slice().sort(function (p, q) { return p - q; })[Math.floor(gs2.length / 2)], pmax = 0, added = false;
      for (t2 = 0; t2 < py.length; t2++) pmax = Math.max(pmax, py[t2]);
      for (t2 = 0; t2 < gs2.length; t2++) {
        if (gs2[t2] < 1.6 * gm2) continue;
        var lo = Math.round(ys[t2] + 0.3 * gs2[t2]), hi = Math.round(ys[t2] + 0.7 * gs2[t2]), bi = -1, bv = 0;
        for (var z = lo; z <= hi; z++) if (py[z] > bv) { bv = py[z]; bi = z; }
        if (bi > 0 && bv >= 0.25 && bv >= 0.3 * pmax) { ys.splice(t2 + 1, 0, bi); added = true; break; }
      }
      if (!added) break;
    }
    // how much straight vertical structure (door gaps) a horizontal band holds
    function inside(y0, y1) {
      var pv = smooth(lineProfile(gr, W, H, 'x', 0.02 * W, 0.98 * W, y0 + 0.15 * (y1 - y0), y1 - 0.15 * (y1 - y0)), 1);
      var vals = [];
      for (var i = Math.round(0.03 * W); i < Math.round(0.97 * W); i++) if (pv[i] >= pv[i - 1] && pv[i] >= pv[i + 1]) vals.push(pv[i]);
      vals.sort(function (p, q) { return q - p; });
      return (vals[0] || 0) * 0.5 + (vals[1] || 0) * 0.5;      // the two strongest straight lines
    }
    var gaps = [];
    for (var g = 0; g < ys.length - 1; g++) gaps.push(inside(ys[g], ys[g + 1]));
    var top = Math.max.apply(null, gaps), run = null, cur = null;
    for (g = 0; g < gaps.length; g++) {
      var hgt = ys[g + 1] - ys[g];
      if (gaps[g] >= 0.55 * top && hgt > 0.04 * H) { if (!cur) cur = { a: g, b: g }; else cur.b = g; }
      else cur = null;
      if (cur && (!run || cur.b - cur.a > run.b - run.a || (cur.b - cur.a === run.b - run.a && ys[cur.b + 1] - ys[cur.a] > ys[run.b + 1] - ys[run.a]))) run = { a: cur.a, b: cur.b };
    }
    if (!run) run = { a: 0, b: gaps.length - 1 };
    var y0 = ys[run.a], y1 = ys[run.b + 1], fh = y1 - y0, rows = run.b - run.a + 1;
    // columns: strong vertical lines across the cabinet's height
    // slanted (perspective) lines spread their votes over a few pixels: sum them over a small window
    var px0 = lineProfile(gr, W, H, 'x', 1, W - 2, y0 + 0.04 * fh, y1 - 0.04 * fh), rr = Math.max(2, Math.round(0.012 * W));
    var px = smooth(px0, rr), pmx = 0;
    for (var q = 0; q < W; q++) pmx = Math.max(pmx, px[q]);
    for (q = 0; q < W; q++) px[q] = pmx ? px[q] / pmx : 0;
    var xs = mergeLines(px, 2, W - 3, Math.max(3, 0.025 * W), 0.35);
    if (xs.length < 2) return { cols: 2, rows: rows, frame: { x0: 0.06, x1: 0.94, y0: y0 / H, y1: y1 / H } };
    var widths = [];
    for (var c = 0; c < xs.length - 1; c++) widths.push(xs[c + 1] - xs[c]);
    var sorted = widths.slice().sort(function (p, q) { return p - q; }), big = sorted[sorted.length - 1];
    // a door-gap pair (two lines a few px apart) is one divider; keep the central bar (narrow but wide enough)
    var bounds = [xs[0]];
    for (c = 0; c < widths.length; c++) {
      if (widths[c] < 0.035 * W && c > 0 && c < widths.length - 1) continue;
      bounds.push(xs[c + 1]);
    }
    // drop slivers of a neighbouring cabinet at either edge of the photo
    function w(i) { return bounds[i + 1] - bounds[i]; }
    while (bounds.length > 2 && w(0) < 0.5 * big && bounds[0] < 0.06 * W) bounds.shift();
    while (bounds.length > 2 && w(bounds.length - 2) < 0.5 * big && bounds[bounds.length - 1] > 0.94 * W) bounds.pop();
    while (bounds.length > 2 && w(0) < 0.3 * big) bounds.shift();
    while (bounds.length > 2 && w(bounds.length - 2) < 0.3 * big) bounds.pop();
    // a thin strip between two door columns (much thinner than a door) is a divider, not a column
    var ws2 = [];
    for (c = 0; c < bounds.length - 1; c++) ws2.push(w(c));
    var med = ws2.slice().sort(function (p, q) { return p - q; })[Math.floor(ws2.length / 2)];
    for (c = bounds.length - 3; c >= 1; c--) {
      if (w(c) < 0.18 * med) bounds.splice(c, 2, (bounds[c] + bounds[c + 1]) / 2);
    }
    var frame = { x0: bounds[0] / W, x1: bounds[bounds.length - 1] / W, y0: y0 / H, y1: y1 / H };
    return { cols: Math.min(12, bounds.length - 1), rows: Math.min(20, rows), frame: frame, dividers: bounds.slice(1, -1).map(function (v) { return v / W; }) };
  }

  /* Find label-like bright rectangles inside a cell image. Returns boxes in cell pixels. */
  function findLabels(cell) {
    var W = cell.width, H = cell.height, d = cell.data, n = W * H;
    var L = new Float32Array(n), S = new Float32Array(n), hist = new Uint32Array(256);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var r = d[j], gg = d[j + 1], b = d[j + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      L[i] = 0.299 * r + 0.587 * gg + 0.114 * b; S[i] = mx ? (mx - mn) / mx : 0;
      hist[Math.min(255, L[i] | 0)]++;
    }
    function pct(p) { var t = n * p, s = 0; for (var k = 0; k < 256; k++) { s += hist[k]; if (s >= t) return k; } return 255; }
    var med = pct(0.5), hi = pct(0.995);
    var thr = Math.max(med + 22, med + 0.45 * (hi - med));
    if (hi - med < 25) return [];
    var bin = new Uint8Array(n);
    for (i = 0; i < n; i++) bin[i] = L[i] >= thr && S[i] < 0.42 ? 1 : 0;
    // close small gaps (text strokes inside labels): horizontal then vertical dilation by 2
    var tmp = new Uint8Array(n), R = Math.max(1, Math.round(W / 220));
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var v = 0; for (var k2 = -R; k2 <= R && !v; k2++) { var xx = x + k2; if (xx >= 0 && xx < W && bin[y * W + xx]) v = 1; }
      tmp[y * W + x] = v;
    }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      v = 0; for (k2 = -R; k2 <= R && !v; k2++) { var yy = y + k2; if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1; }
      bin[y * W + x] = v;
    }
    var lab = new Int32Array(n), comps = [], stack = [];
    for (i = 0; i < n; i++) {
      if (!bin[i] || lab[i]) continue;
      var id = comps.length + 1, c = { x0: W, y0: H, x1: 0, y1: 0, area: 0 };
      lab[i] = id; stack.push(i);
      while (stack.length) {
        var p = stack.pop(), px = p % W, py = (p - px) / W;
        c.area++; if (px < c.x0) c.x0 = px; if (px > c.x1) c.x1 = px; if (py < c.y0) c.y0 = py; if (py > c.y1) c.y1 = py;
        if (px > 0 && bin[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack.push(p - 1); }
        if (px < W - 1 && bin[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack.push(p + 1); }
        if (py > 0 && bin[p - W] && !lab[p - W]) { lab[p - W] = id; stack.push(p - W); }
        if (py < H - 1 && bin[p + W] && !lab[p + W]) { lab[p + W] = id; stack.push(p + W); }
      }
      comps.push(c);
    }
    var out = comps.filter(function (c) {
      var w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, ar = w / h, fill = c.area / (w * h);
      if (w < 0.12 * W || h < 0.035 * H || h > 0.45 * H) return false;
      if (ar < 1.3 || ar > 9) return false;
      if (fill < 0.55) return false;
      if (w > 0.75 * W) return false;               // letter slot or a whole panel
      return true;
    });
    out.sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0; });
    return out.slice(0, 4).map(function (c) {
      var w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, mx = 0.04 * w, my = 0.12 * h;
      return { x: Math.max(0, c.x0 - mx), y: Math.max(0, c.y0 - my), w: Math.min(W - Math.max(0, c.x0 - mx), w + 2 * mx), h: Math.min(H - Math.max(0, c.y0 - my), h + 2 * my) };
    });
  }

  /* Contrast-stretch an RGBA image to gray in place (helps faded labels). */
  function stretch(img) {
    var d = img.data, n = img.width * img.height, hist = new Uint32Array(256), i, j;
    for (i = 0, j = 0; i < n; i++, j += 4) hist[(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) | 0]++;
    var lo = 0, hi = 255, s = 0;
    for (i = 0; i < 256; i++) { s += hist[i]; if (s >= n * 0.02) { lo = i; break; } }
    s = 0;
    for (i = 255; i >= 0; i--) { s += hist[i]; if (s >= n * 0.02) { hi = i; break; } }
    var k = hi > lo ? 255 / (hi - lo) : 1;
    for (i = 0, j = 0; i < n; i++, j += 4) {
      var v = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2] - lo) * k;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[j] = d[j + 1] = d[j + 2] = v;
    }
    return img;
  }

  /* ---------- text cleaning ---------- */
  var Names = BalNames;
  var NOISE = [/st[o0]p\s*[aà]?\s*(la\s*)?pub/i, /\bpub\b/i, /publicit/i, /\bmerci\b/i, /no\s*pub/i, /prospectus/i, /pubarik/i,
    /factur/i, /collectivit/i, /\brenz\b/i, /\bthe\s*roof\b/i, /\boui\s+[aà]\b/i, /pas\s+de\b/i, /bo[iî]te\s+aux/i, /aux\s+lettres/i, /plan[eè]te/i, /\bsvp\b/i,
    /\bpu[bej8]\b/i, /lapub/i, /pub!/i, /^ou[iyt]\s*[aà]\s*l/i, /^ou[it][a-z]{10,}/i, /n[eé]rc[il]/i, /m[eé]rc[il]/i, /z[eé]ro/i,
    /colle[cg]/i, /pas\s*de/i, /\bfacture/i,
    // notices and anti-advertising stickers seen on mailboxes ("L'abus de prospectus est dangereux pour ma planète", "Trions plus fort", ...)
    /dangereu/i, /\babus\b/i, /trions/i, /plus\s*fort/i, /\.\s*com\b/i, /www\./i, /pays\s*basque/i, /euskal/i, /elkar/i, /[xk]argoa/i,
    /viron/i, /t[eé]g[eé]ons/i, /[eé]pargne/i, /annonces/i, /journaux/i, /r[eé]duisons/i, /d[eé]chets/i, /jetons/i, /\bmoins\b/i,
    /agglom/i, /\bsud[\s-]*ouest\b/i, /r[eé]sidence/i, /\ball[eé]es?\b/i, /\b(rue|avenue|boulevard|impasse|chemin|cedex)\b/i, /\b64\d{3}\b/, /\brappel\b/i, /facteur/i, /distribu/i, /adressage/i, /r[eé]sidents?\b/i, /code\s*postal/i,
    // La Poste notice panel ("Indiquez les prénoms et noms des résidents...")
    /indiquez/i, /courrier/i, /adresser/i, /pr[eé]cisez/i, /\bvous\b/i, /\bvotre\b/i, /\bnom\s*-\s*pr/i, /pr[eé]noms?\s+et\s+noms?/i,
    /\bn\s*°?\s*voie\b/i, /r[eè]gles/i, /facilitez/i, /\bescalier\b/i];
  var NOISE_WORD = /^de?p[iu][bp]!?$|^st[o0]p[a-z]?!?$|^s[t-]?[c0o]?[fp]$|^st-?p$|^pu[bej8]!?$|^(la|no|de)?pub[a-z]?!?$|^svp$|^m?erci$|^n[eé]rci$|^lettres?$|^stcf$|^scp$|^pjb$|^flb$|^p[ua]e$/i;
  var CIV_NORM = [[/^(m|mr|monsieur)\.?$/i, 'M'], [/^(mme|madame)\.?$/i, 'Mme'], [/^(mlle|melle|mademoiselle)\.?$/i, 'Mlle'], [/^mm\.?$/i, 'MM']];
  function civ(w) { for (var i = 0; i < CIV_NORM.length; i++) if (CIV_NORM[i][0].test(w)) return CIV_NORM[i][1]; return null; }
  // handwritten "Mr" is often read as Hr, Tn, Th, Nr...
  var PARTICLE = /^(de|du|des|la|le|les|van|von|der|den|da|das|do|dos|del|della|di|el|al|ben|bin|ibn|y|e)$/i;
  var CIV_FUZZY = /^(hr|tn|th|nr|mn|rr|wr|mp|mf|ur)\.?$/i;
  var FLOOR = /(rdc(?=ap|\b)|\br\.?\s?d\.?\s?c\.?|\b[0-9z]\s*(?:er|e|è|é|[eèé]me|eme)?\s*[ée]tage)\b/ig;
  var FLOOR_WORD = /[eé][th]age?|[eé]tag\b|^etg$/i;
  var APT_CODE = /\b([A-Z]{1,2}\d{0,2})\s?[-–—]\s?(\d{2,4})\b/;                  // C3-336
  var APT_HASH = /#\s*([A-Z]?\d{1,4})\b/i;                                          // #108
  var APT_GLUED = /(?<=[a-z])(?:apt|apl|appt|app)\s*[.:°]?\s*(\d{1,4}[A-Z]?)\b/i;    // RDCApt2
  var APT_WORD = /\b(?:apt|apl|apr|aot|apf|afpt|app|appt|apprt|appart(?:ement)?|logt|logement|log|ppt|n°|no|num[ée]ro|n)\s*[.:°]?\s*([A-Z]?[0-9OoDQIlzZSsgqB]{1,4}[A-Z]?)\b/i;
  var APT_LETTER = /^\s*([A-HJ-LO-Z])\s?(\d{2,4})\b/;                               // A 112, B 1410
  var APT_LEAD = /^([A-Z]\d{1,3}[A-Z]?)(?=\s|$)/;                                    // C02 Mlle DUPONT Marie
  var APT_APP = /^\s*[4A][pP0oO]{1,2}[tT]?\s*(\d{1,4})\s*$/;                         // handwritten "App 13" read as "400 13"
  var NUM_ONLY = /^\s*[#n°]*\s*(\d{2,4}[A-Z]?)\s*$/i;
  // letters a reader confuses with digits inside an apartment number ("Apl z0g" is 209)
  function aptDigits(tok) {
    var t = String(tok).replace(/[.\s]/g, ''), lead = '';
    var m = t.match(/^([A-Z])(?=[0-9OoDQIlzZSsgqB]{2,})/);
    if (m && /\d/.test(t.slice(1))) { lead = m[1]; t = t.slice(1); }
    var map = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', z: '2', Z: '2', S: '5', s: '5', g: '9', q: '9', B: '8' };
    var d = t.replace(/[OoDQIlzZSsgqB]/g, function (c) { return map[c]; });
    return /^\d+[A-Z]?$/.test(d) ? lead + d : '';
  }
  // any way of refusing advertising: STOP PUB, Pas de pub(licité), No pub, Zéro prospectus, Pubarik ez, misread variants
  var PUB_RE = [/st[o0][a-z]?\s*[-aà]?\s*(la\s*)?[pf]u[bp]/i, /\b[pf]u[bej8]\b!?/i, /lapub/i, /publicit/i, /no\s*-?\s*pub/i,
    /pas\s*de\s*p/i, /prospectus/i, /\bstop\b/i, /non\s*[aàãâ]?\s*la\s*p/i, /\bla\s*pu[bdp8]\b/i, /\b[nm]on\s*[aàãâ]\s*la\b/i, /\bo?n\s+aux\s+p/i,
    // Basque "Pubarik ez" sticker (no advertising) and its small print, including damaged reads
    /p[uv][\s.\-·]?bar[il1|!]k/i, /\bbai\s*ez\b/i, /\bez\s*bai\b/i, /publizitat/i, /erakunde/i, /informazio/i, /^\s*ez\s*$/i];

  /* Fuzzy advertising words: OCR misreads ("Puolicie", "STOe FUB", "PU-BARlK") still count. */
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d.push([i]);
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function norm(w) { return String(w).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O'); }
  var PUB_WORDS = [['PUB', 1], ['PUBS', 1], ['STOP', 1], ['STOPPUB', 1], ['PUBLICITE', 3], ['PUBLICITES', 3], ['PUBLICITAIRE', 3], ['PROSPECTUS', 3], ['PUBARIK', 2], ['NOPUB', 1], ['LAPUB', 1], ['DEPUB', 1], ['PUBLIZITATE', 3], ['OUIALINFO', 3], ['COLLECTIVITES', 4]];
  var FILLER = ['NON', 'NO', 'PAS', 'DE', 'MERCI', 'SVP', 'ZERO', 'BAI', 'EZ', 'OUI', 'LA', 'A', 'AU', 'INFO', 'DES', 'COLLECTIVITES', 'DANS', 'MA', 'BOITE', 'AUX', 'LETTRES', 'ETA',
    'MOI', 'MOINS', 'ONS', 'TRIONS', 'JETONS', 'PLUS', 'FORT'];
  function pubWord(w) {
    var t = norm(w);
    if (t.length < 3) return false;
    for (var i = 0; i < PUB_WORDS.length; i++) {
      var k = PUB_WORDS[i][0], tol = PUB_WORDS[i][1];
      if (Math.abs(t.length - k.length) > tol) continue;
      if (lev(t, k) <= tol) {
        // 3-4 letter reads must keep the shape of PUB / STOP (first or last letter right) to avoid hitting names
        if (k.length <= 4 && t[0] !== k[0] && t[t.length - 1] !== k[k.length - 1]) continue;
        return true;
      }
    }
    return false;
  }
  // V2 : mots des panneaux d'affichage, avec le nombre de fautes de lecture tolérées
  var PANEL_WORDS = [['POMPIERS', 1], ['HABITAT', 1], ['CONTACT', 1], ['CONTACTS', 1], ['UTILES', 1], ['INTERLOCUTEURS', 3], ['GESTIONNAIRE', 2], ['POLICE', 1],
    ['CONSEIL', 1], ['MEMBRES', 1], ['SQUARE', 1], ['BATIMENT', 2], ['VIDEOPROTECTION', 3], ['ETABLISSEMENT', 2], ['SYNDIC', 1], ['GARDIEN', 1],
    ['URGENCE', 1], ['URGENCES', 1], ['ASSISTANTE', 2], ['AGENCE', 1], ['ELECTRICITE', 2], ['DISPONIBLE', 2], ['BOUTIQUES', 1], ['SOLUTIONS', 1]];
  // V2 : autocollants de refus de publicité que la V1 ne reconnaissait pas
  var PUB_RE2 = [/abus\s+de\s+pros/i, /dangereux\s+pour/i, /[ée]pargner\s+ma/i, /imprim[ée]s/i, /[ée]chantillons/i, /sans\s+adresse/i, /publicitaires?/i, /trions\s*plus|plusfort/i];
  var NOISE2 = [/^\s*sud\s*$/i, /^\s*\S{0,2}[\s-]*ouest\s*$/i, /\bbo[iî]te\b/i, /\blettres\b/i, /stick/i, /^\s*(oui|non)\s*$/i];
  var APT_WORD2 = /\b(?:porte|pte)\s*[.:°]?\s*([A-Z]?\d{1,4}[A-Z]?)\b/i;
  function horsZone(ln, z) {
    if (!z || !ln.box) return false;
    var cx = (ln.box.x0 + ln.box.x1) / 2, cy = (ln.box.y0 + ln.box.y1) / 2;
    return cx < z.x0 || cx > z.x1 || cy < z.y0 || cy > z.y1;
  }
  function fillerWord(w) {
    var t = norm(w);
    if (!t) return true;
    for (var i = 0; i < FILLER.length; i++) if (t === FILLER[i] || (FILLER[i].length >= 5 && lev(t, FILLER[i]) <= 1)) return true;
    return false;
  }
  function isFirst(w) { return !!(Names && Names.exact(w)); }

  /* Uncertain (handwritten) reads: repair one misread first name per recipient and restore accents.
     Never touches a recipient that already holds a correct first name, nor protected surnames. */
  function fixRecipient(r, unsure, keep, lineConf) {
    if (!Names) return r;
    var ws = r.split(' '), idx = [], i;
    for (i = 0; i < ws.length; i++) if (!civ(ws[i]) && ws[i] !== 'et' && /[A-Za-z\u00C0-\u00FF]{2}/.test(ws[i])) idx.push(i);
    var hasFirst = idx.some(function (k) { return ws[k].split('-').some(function (p) { return Names.exact(p); }); });
    if (unsure && !hasFirst) {
      var best = null;
      idx.forEach(function (k) {
        // fairly confident reads only get the cheapest fixes (EHMA -> EMMA), so DUMITRU is not turned into DIMITRI
        var c = Names.closest(ws[k].replace(/[^A-Za-z\u00C0-\u00FF]/g, ''), keep, lineConf != null && lineConf >= 90 ? 0.5 : null);
        if (c && (!best || c.dist < best.dist)) best = { k: k, name: c.name, dist: c.dist };
      });
      if (best) ws[best.k] = Names.styled(best.name, ws[best.k]);
    }
    // accents on first names written in mixed case ("Laia" -> "Laïa", "Stephane" -> "Stéphane")
    for (i = 0; i < idx.length; i++) {
      var w = ws[idx[i]];
      if (w !== w.toUpperCase()) ws[idx[i]] = w.split('-').map(function (p) { var e = Names.exact(p); return e && p !== p.toUpperCase() ? e : p; }).join('-');
    }
    return ws.join(' ');
  }

  /* One line per person: "OULAI David et Olivia" -> "OULAI David", "OULAI Olivia";
     "ENEKO et JESUS" followed by a lone "LAZCANO" -> "ENEKO LAZCANO", "JESUS LAZCANO".
     A couple named with one first name ("M et Mme VITCHEN Pierre") stays on one line. */
  function splitCouples(list) {
    var out = [], i;
    for (i = 0; i < list.length; i++) {
      var ws = list[i].split(' ');
      if (ws.some(function (w) { return civ(w); })) { out.push(list[i]); continue; }
      var firsts = [], sur = [], firstAt = -1;
      ws.forEach(function (w, k) { if (w === 'et') return; if (isFirst(w)) { firsts.push(w); if (firstAt < 0) firstAt = k; } else sur.push({ w: w, k: k }); });
      var joinedByEt = ws.indexOf('et') > 0 && firsts.length >= 2;
      if (!joinedByEt) { out.push(list[i]); continue; }
      var surBefore = sur.filter(function (x) { return x.k < firstAt; }).map(function (x) { return x.w; }).join(' ');
      var surAfter = sur.filter(function (x) { return x.k > firstAt; }).map(function (x) { return x.w; }).join(' ');
      if (!sur.length) {
        // first names only: borrow a lone surname written on the next line
        var nxt = list[i + 1];
        if (nxt && !/\s/.test(nxt) && !isFirst(nxt) && nxt === nxt.toUpperCase()) { firsts.forEach(function (f) { out.push(f + ' ' + nxt); }); i++; continue; }
        out.push(list[i]); continue;
      }
      firsts.forEach(function (f) { out.push([surBefore, f, surAfter].filter(Boolean).join(' ')); });
    }
    return out;
  }

  /* lines: [{text, conf}] in reading order.
     Returns {names: [one recipient per entry], name, apt, pub: 'STOP PUB' | 'OK PUB', conf, raw} */
  /* opt (V2 seulement, absent = règles de la V1 à l'identique) :
     { v2: true, zone: { x0, y0, x1, y1 } } : zone = emplacement habituel de l'étiquette dans les boîtes de ce bloc. */
  function parseLabel(lines, opt) {
    var V2 = !!(opt && opt.v2), zone = (opt && opt.zone) || null;
    var apt = '', recips = [], confs = [], raw = [], stop = false, aptLigne = -1, nomsLignes = [], hors = false, numLigne = -1, statuts = [];
    // a notice panel (many sentence-like lines) is not a mailbox label: read nothing from it
    var PANEL = /indiquez|courrier|adresser|pr[eé]cisez|r[eé]sidents|r[eè]gles\s+d|facilitez|adressage|distribu[eé]|facteur|code\s*postal/i;
    // a letter seen through the notice window (an address block) is not a label either
    var ADDRESS = /r[eé]sidence|\ball[eé]es?\b|\b(rue|avenue|boulevard|impasse|chemin|cedex)\b|\b64\d{3}\b|\brappel\b/i;
    if (lines.filter(function (ln) { return PANEL.test(String(ln.text || '')); }).length >= 2 ||
        lines.filter(function (ln) { return ADDRESS.test(String(ln.text || '')); }).length >= 2) return { names: [], name: '', apt: '', pub: 'OK PUB', conf: 0, raw: lines.map(function (l) { return l.text; }).join(' | '), panel: true };
    if (V2) {
      // panneau d'affichage du hall (bailleur, contacts utiles, vidéoprotection) : deux lignes qui portent chacune
      // un mot de panneau différent, même mal lu (« POMFIERS »)
      var motsPanneau = {}, nPanneau = 0;
      lines.forEach(function (ln) {
        var vu = false;
        String(ln.text || '').split(/[^A-Za-z\u00C0-\u024F]+/).forEach(function (w) {
          var k = norm(w);
          if (k.length < 4) return;
          for (var i = 0; i < PANEL_WORDS.length; i++) {
            var pw = PANEL_WORDS[i];
            if (Math.abs(k.length - pw[0].length) <= pw[1] && lev(k, pw[0]) <= pw[1]) { if (!motsPanneau[pw[0]]) { motsPanneau[pw[0]] = 1; vu = true; } break; }
          }
        });
        if (vu) nPanneau++;
      });
      if (nPanneau >= 2) return { names: [], name: '', apt: '', pub: 'OK PUB', conf: 0, raw: lines.map(function (l) { return l.text; }).join(' | '), panel: true, aptLigne: -1, nomsLignes: [] };
    }
    // words read with high confidence anywhere on this label are never "corrected" elsewhere on it
    var keep = {};
    lines.forEach(function (ln) { if (ln.conf >= 98 && Names) String(ln.text || '').split(/[\s\/]+/).forEach(function (w) { var k = Names.key(w); if (k.length >= 4) keep[k] = 1; }); });
    var aptRank = 9;
    function setApt(v, rank) { if (v && /[1-9]/.test(v)) statuts[numLigne] = 'apt'; if (v && /[1-9]/.test(v) && (rank || 1) < aptRank) { apt = v; aptRank = rank || 1; aptLigne = numLigne; } }
    lines.forEach(function (ln) {
      numLigne++; statuts[numLigne] = 'bruit';
      var t = String(ln.text || '').replace(/[|_~`^"“”«»<>\[\]{}()=*]/g, ' ').replace(/\s+/g, ' ').trim();
      if (V2) t = t.replace(/[·•]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return;
      raw.push(t);
      if (V2) {
        var nl = norm(t);
        if (PUB_RE2.some(function (re) { return re.test(t); }) || (nl.length >= 6 && nl.length <= 10 && lev(nl, 'NONMERCI') <= 2)) { stop = true; return; }
        // ligne hésitante dont une autre lecture est un refus de publicité (« ST-P » ou « STOP »)
        if (ln.p != null && ln.p < 0.6 && !PUB_RE.some(function (re) { return re.test(t); }) &&
            (ln.alts || []).some(function (a) { return /\bst[o0]p\b|\bpubs?\b|publicit/i.test(a); })) { stop = true; return; }
        if (NOISE2.some(function (re) { return re.test(t); })) return;
      }
      var unsure = ln.conf == null || ln.conf < 98;
      var words0 = t.split(/\s+/);
      if (PUB_RE.some(function (re) { return re.test(t); }) || words0.some(pubWord)) {
        stop = true;
        // a name can share the line with the sticker ("PUB Georges KIOCK"): keep it only if two real words remain
        var rest = words0.filter(function (w) {
          return w.replace(/[^A-Za-z\u00C0-\u00FF]/g, '').length >= 4 && !pubWord(w) && !fillerWord(w) && !NOISE_WORD.test(w) &&
            !/publicit|prospectus|pubarik|barik|merci|erakunde|informazio|publizitat|etxe|bidal/i.test(w);
        });
        if (rest.length < 2 || ln.conf < 80) return;
        t = rest.join(' ');
      } else if (NOISE.some(function (re) { return re.test(t); })) return;
      if (words0.every(fillerWord)) return;
      if (/^[A-Za-z]{1,3}$/.test(t) && !civ(t)) return;
      statuts[numLigne] = 'reste';
      t = t.replace(/rdc\s*(?=ap)/ig, ' RDC ');
      // apartment number: every pattern is stripped from the text, the first one found is kept
      var m;
      if (V2 && (m = t.match(APT_WORD2))) { setApt(m[1].toUpperCase()); t = t.replace(m[0], ' '); }
      if ((m = t.match(APT_CODE))) { setApt(m[1].toUpperCase() + '-' + m[2]); t = t.replace(m[0], ' '); }
      if ((m = t.match(APT_HASH))) { setApt(m[1].toUpperCase()); t = t.replace(m[0], ' '); }
      if ((m = t.match(APT_GLUED))) { setApt(m[1].toUpperCase()); t = t.replace(m[0], ' '); }
      if ((m = t.match(APT_WORD)) && /\d/.test(m[1]) && aptDigits(m[1])) { setApt(aptDigits(m[1])); t = t.replace(m[0], ' '); }
      if ((m = t.match(APT_APP))) { setApt(m[1], 2); t = ''; }
      if ((m = t.match(APT_LETTER))) { setApt(m[1] + m[2]); t = t.replace(m[0], ' '); }
      if ((m = t.trim().match(APT_LEAD))) { setApt(m[1]); t = t.trim().slice(m[0].length); }
      if ((m = t.match(NUM_ONLY))) { setApt(m[1].toUpperCase(), 3); t = ''; }
      // an apartment keyword followed by something that is not a number is a misread scrap ("Aot ANO")
      t = t.replace(/\b(?:apt|apl|apr|aot|apf|afpt|appt|apprt|ppt)\s*[.:°]?\s*\S{1,4}(?=\s|$)/ig, ' ');
      t = t.replace(/\b(?:appartement|apprt|appt|apt)\b\.?/ig, ' ');
      t = t.replace(FLOOR, ' ').replace(/\b(cour|b[aâ]t(?:iment)?|esc(?:alier)?)\b\.?/ig, ' ');
      // floor words misread ("1 Ehage", "AerETAG") and the ordinal before them
      var tw = t.trim().split(/\s+/), kept = [];
      for (var q = 0; q < tw.length; q++) {
        if (FLOOR_WORD.test(tw[q])) { if (kept.length && /^(\d+|[z2a1])(er|e|è|ème|eme|éme)?$/i.test(kept[kept.length - 1])) kept.pop(); continue; }
        kept.push(tw[q]);
      }
      t = kept.join(' ');
      if (ln.conf != null && ln.conf < 50) return;   // unreadable scribbles: keep any number found above, no name
      if (unsure) {
        var w1 = t.trim().split(/\s+/);
        if (w1.length >= 2 && CIV_FUZZY.test(w1[0]) && /^[A-Z\u00C0-\u00DD]/.test(w1[1])) { w1[0] = 'M'; t = w1.join(' '); }
      }
      var cand = [];
      t.replace(/\s*\+\s*/g, ' / ').split('/').forEach(function (seg) { splitPeople(seg).forEach(function (r) { cand.push(r); }); });
      // "MARTIN Sophie / Christian": a lone first name after a slash shares the surname written before it
      function surnameOf(r) {
        var w = r.split(' '), mixedFirst = w.some(function (y) { return y !== y.toUpperCase() && isFirst(y); });
        var sur = w.filter(function (x) { return !civ(x) && x !== 'et' && (!isFirst(x) || (mixedFirst && x === x.toUpperCase())); });
        return sur.length === 1 ? { w: sur[0], first: w[0] === sur[0] } : null;
      }
      for (var ci = 1; ci < cand.length; ci++) {
        if (/\s/.test(cand[ci]) || !isFirst(cand[ci])) continue;
        var sp = surnameOf(cand[ci - 1]);
        if (sp) cand[ci] = sp.first ? sp.w + ' ' + cand[ci] : cand[ci] + ' ' + sp.w;
      }
      // "Aurélien + Eliot + Juliette BRIOIS": the surname written last belongs to every first name before it
      for (ci = cand.length - 2; ci >= 0; ci--) {
        if (/\s/.test(cand[ci]) || !isFirst(cand[ci])) continue;
        var sn = surnameOf(cand[ci + 1]);
        if (sn && !sn.first) cand[ci] = cand[ci] + ' ' + sn.w;
      }
      var solo = cand.length === 1 && !/\s/.test(cand[0]);
      var lineRecips = [];
      cand.forEach(function (r) {
        // names carry capitals: an all-lowercase phrase, or one with two plain lowercase words, is sticker text read wrong
        var rw = r.split(' ').filter(function (x) { return !civ(x) && x !== 'et'; });
        if (rw.length && rw.every(function (x) { return x === x.toLowerCase(); }) && !rw.some(isFirst)) return;
        if (rw.filter(function (x) { return x === x.toLowerCase() && !PARTICLE.test(x); }).length >= 2) return;
        // only tiny words ("IT MXI") and no known first name: a scrap
        if (rw.length && rw.every(function (x) { return x.replace(/[^A-Za-z\u00C0-\u00FF]/g, '').length <= 3; }) && !rw.some(isFirst)) return;
        // short low-confidence fragments are misread scraps, not people
        if (ln.conf != null && ln.conf < 75 && r.replace(/[^A-Za-z\u00C0-\u00FF]/g, '').length < 5) return;
        // a single lowercase word ("lons", "rala") is a scrap of sticker text, not a name
        if (solo && r === r.toLowerCase() && !isFirst(r)) return;
        if (V2 && zone && horsZone(ln, zone) && !(ln.conf >= 95 && r.replace(/[^A-Za-z\u00C0-\u00FF]/g, '').length >= 5 && (ln.p == null || ln.p >= 0.5))) { if (ln.conf >= 90) hors = true; return; }
        // V2 : une ligne que le modèle ne sait pas lire du tout (aucune lecture ne se détache) n'est pas un nom
        if (V2 && ln.p != null && ln.p < 0.05 && ln.conf < 75) return;
        lineRecips.push(fixRecipient(r, unsure, keep, ln.conf));
      });
      if (lineRecips.length) { nomsLignes.push(numLigne); statuts[numLigne] = 'nom'; }
      // a lone word on its own line may be joined with the next line's lone word (surname / first name)
      lineRecips.forEach(function (r) { recips.push({ text: r, solo: solo }); });
      if (lineRecips.length) confs.push(ln.conf);
    });
    // a civility token starts a new recipient, except right after another civility or "et" ("M. et Mme DUPONT")
    function splitPeople(seg) {
      var words = seg.trim().split(/\s+/), out = [], cur = [];
      words.forEach(function (w, i) {
        var c = civ(w), isAnd = /^(et|&)$/i.test(w);
        // V2 : « M. » après un nom en capitales et en fin de ligne (ou avant « et ») est une initiale, pas « Monsieur »
        if (V2 && c && /^M\.$/.test(w) && cur.length && !civ(cur[cur.length - 1]) && cur[cur.length - 1] !== 'et' &&
            cur[cur.length - 1] === cur[cur.length - 1].toUpperCase() && (i === words.length - 1 || /^(et|&)$/i.test(words[i + 1]))) { cur.push('M.'); return; }
        if (isAnd) { if (cur.length) cur.push('et'); return; }
        if (c) {
          var prev = cur[cur.length - 1];
          if (cur.length && !(prev === 'et' || civ(prev))) { out.push(cur); cur = []; }
          cur.push(c); return;
        }
        if (i > 0 && /^[A-Z\u00C0-\u00DD]\.$/.test(w)) { cur.push(w); return; }
        // V2 : une initiale écrite devant le nom (« D. MARTIN ») fait partie du nom : elle distingue deux voisins
        if (V2 && i === 0 && /^[A-Z\u00C0-\u00DD]\.$/.test(w) && words[1] && /^[A-Z\u00C0-\u00DD]{2}/.test(words[1])) { cur.push(w); return; }
        var letters = (w.match(/[A-Za-z\u00C0-\u00FF]/g) || []).length;
        if (letters < 2 || letters / w.length < 0.7 || NOISE_WORD.test(w) || pubWord(w)) return;
        if (/^[a-z\u00DF-\u00FF]+[A-Z]/.test(w)) return;            // "tRerte": misread scrap
        var clean = w.replace(/^[^A-Za-z\u00C0-\u00FF]+|[^A-Za-z\u00C0-\u00FF.'\-]+$/g, '');
        // "OULAI David & Olivia MIREMONT Olivia": a new SURNAME followed by a first name starts a second person
        var nxt = words[i + 1];
        if (cur.length && clean.length >= 3 && clean === clean.toUpperCase() && !isFirst(clean) && nxt && isFirst(nxt) &&
            cur.some(function (x) { return isFirst(x); })) { out.push(cur); cur = []; }
        cur.push(clean);
      });
      if (cur.length) out.push(cur);
      return out.map(function (ws) {
        while (ws.length && ws[ws.length - 1] === 'et') ws.pop();
        return ws.join(' ');
      }).filter(function (r) {
        // keep a recipient only if it holds a real word besides the civility
        var body = r.split(' ').filter(function (w) { return !civ(w) && w !== 'et'; }).join('');
        return body.replace(/[^A-Za-z\u00C0-\u00FF]/g, '').length >= (r !== body ? 3 : 4);
      });
    }
    if (!apt) {
      for (var q = 0; q < raw.length && !apt; q++) {
        if (NOISE.some(function (re) { return re.test(raw[q]); }) || PUB_RE.some(function (re) { return re.test(raw[q]); })) continue;
        var mm = raw[q].match(/(?:^|\s)(\d{2,4})(?=\s|$)/);
        if (mm && /[1-9]/.test(mm[1])) apt = mm[1];
      }
    }
    // one-word lines in a row are usually first name and surname written on two lines
    var joined = [], lastSolo = false;
    recips.forEach(function (n) {
      var last = joined[joined.length - 1];
      if (last && lastSolo && n.solo && (isFirst(last) || isFirst(n.text))) { joined[joined.length - 1] = last + ' ' + n.text; lastSolo = false; }
      else { joined.push(n.text); lastSolo = n.solo; }
    });
    joined = splitCouples(joined);
    // the same person read twice (two labels, or a label and a letter) is listed once
    var seen = {};
    joined = joined.filter(function (n) { var k = norm(n.replace(/\b(M|Mme|Mlle|MM)\b/g, '')); if (!k || seen[k]) return false; seen[k] = 1; return true; });
    var conf = confs.length ? confs.reduce(function (a, b) { return a + b; }, 0) / confs.length : 0;
    return { names: joined, name: joined.join(' / '), apt: apt, pub: stop ? 'STOP PUB' : 'OK PUB', conf: Math.round(conf), raw: raw.join(' | '), aptLigne: aptLigne, nomsLignes: nomsLignes, hors: hors,
      // lignes de texte qui n'ont rien donné (ni nom, ni numéro, ni autocollant reconnu) : peut-être un nom illisible
      reste: statuts.map(function (x, k) { return x === 'reste' ? k : -1; }).filter(function (k) { return k >= 0; }) };
  }

  return { _smooth: smooth, _lineProfile: lineProfile, _peaks: peaks, _fitAxis: fitAxis, _periodScore: periodScore, autoCount: autoCount, guessFrame: guessFrame, gray: gray, uniformGrid: uniformGrid, fitGrid: fitGrid, cells: cells, colBounds: colBounds, rowBounds: rowBounds, findLabels: findLabels, stretch: stretch, parseLabel: parseLabel };
})();
export { BalCore };
