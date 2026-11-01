// PaddleOCR pipeline (det v4 + rec v5) on RGBA images {data,width,height}; works with onnxruntime-node or -web.
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
  /* Full read of an image: [{text, conf (0-100)}] per text line.
     opts.assist = {sess, dict}: a second, larger recognizer asked only when the first one hesitates. */
  async function readLines(ort, det, rec, img, dict, opts) {
    opts = opts || {};
    var boxes = (await detect(ort, det, img, 960)).filter(function (b) { return b.w > 6 && b.h > 5; }).slice(0, 24);
    var groups = groupLines(boxes), out = [], assisted = 0;
    for (var g = 0; g < groups.length; g++) {
      var parts = [], cs = [];
      for (var i = 0; i < groups[g].items.length; i++) {
        var b = groups[g].items[i], crop1 = crop(img, b.x, b.y, b.w, b.h), r = await recognize(ort, rec, crop1, dict);
        if (opts.assist && (r.conf < 0.85 || r.minc < 0.5)) {
          var r2 = await recognize(ort, opts.assist.sess, crop1, opts.assist.dict || dict);
          assisted++;
          if (r2.conf + r2.minc > r.conf + r.minc) r = r2;
        }
        var t = latin(r.text).replace(/[^\u0000-\u024F\u2019]/g, '').trim();
        if (t) { parts.push(t); cs.push(r.conf); }
      }
      if (parts.length) out.push({ text: parts.join(' '), conf: 100 * cs.reduce(function (a, c) { return a + c; }, 0) / cs.length });
    }
    out.assisted = assisted;
    return out;
  }
  return { detect: detect, recognize: recognize, crop: crop, resize: resize, groupLines: groupLines, readLines: readLines };
})();
if (typeof module !== 'undefined') module.exports = BalPaddle;

/* Worker: loads the models once, then reads one mailbox image per message.
   Recognition: PaddleOCR v6 small; optional second opinion ("lecture renforcée"): PaddleOCR v6 medium. */
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
        var lines = await BalPaddle.readLines(ort, det, rec, img, dict, { assist: m.assist ? assist : null });
        return { lines: lines.slice(), assisted: lines.assisted || 0 };
      }
      throw new Error('message inconnu');
    })().then(function (r) { r.id = m.id; r.ok = true; self.postMessage(r); },
      function (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); });
  };
})();
