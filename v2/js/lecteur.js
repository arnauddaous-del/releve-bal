/* Imprim Bal 2 — Worker de lecture : tout se lit ici, sur le téléphone. Aucune image ne sort de l'appareil.
   Charge onnxruntime-web (modeles/ort.wasm.min.js), les modèles de modeles/ et les modules de js/moteur/.
   Messages : init { fort }, fort (charger le deuxième modèle), lexique { memoire, noms }, lire { buf, w, h }. */
importScripts('../modeles/ort.wasm.min.js');

var BASE = new URL('../modeles/', self.location.href).href;
var M = null, ctx = null, opts = { fort: null, lexique: null }, prenoms = null, nomsTexte = '', fortEnCours = null;

function charger(nom, texte) {
  return fetch(BASE + nom).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + nom);
    return texte ? r.text() : r.arrayBuffer();
  });
}
function session(buf) { return ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] }); }
function chargerFort() {
  if (ctx.fort) return Promise.resolve();
  if (!fortEnCours) fortEnCours = Promise.all([1, 2, 3].map(function (i) { return charger('rec6m-' + i + '.wasm'); })).then(function (parts) {
    var n = parts.reduce(function (a, p) { return a + p.byteLength; }, 0), buf = new Uint8Array(n), o = 0;
    parts.forEach(function (p) { buf.set(new Uint8Array(p), o); o += p.byteLength; });
    return session(buf);
  }).then(function (s) { ctx.fort = s; }, function (e) { fortEnCours = null; throw e; });
  return fortEnCours;
}
function lexique(memoire) {
  // la mémoire du lieu (noms confirmés) pèse comme un nom très courant
  var lignes = (memoire || []).map(function (m) { return m.w + ' ' + Math.max(1000, 1000 * (m.n || 1)); });
  opts.lexique = M.lex.creerLexique(prenoms, (nomsTexte ? nomsTexte + '\n' : '') + lignes.join('\n'));
}

self.onmessage = function (e) {
  var m = e.data;
  (async function () {
    if (m.type === 'init') {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = BASE;
      var mods = await Promise.all([import('./moteur/lignes.mjs'), import('./moteur/lexique.mjs'), import('./moteur/prenoms.mjs')]);
      M = { lignes: mods[0], lex: mods[1] };
      prenoms = mods[2].BalNames;
      var r = await Promise.all([charger('det.wasm'), charger('rec6s.wasm'), charger('dict6.txt', true)]);
      var dict = r[2].split('\n'); if (dict[dict.length - 1] === '') dict.pop();
      ctx = { ort: ort, det: await session(r[0]), rec: await session(r[1]), fort: null, alpha: M.lignes.alphabetPour(dict) };
      // liste des noms de famille : facultative (modeles/noms-famille.txt, absente pour l'instant)
      try { nomsTexte = await charger('noms-famille.txt', true); } catch (err) { nomsTexte = ''; }
      lexique(m.memoire);
      if (m.fort) { await chargerFort(); opts.fort = 'faible'; }
      return { fort: !!ctx.fort, noms: !!nomsTexte };
    }
    if (m.type === 'fort') { await chargerFort(); opts.fort = m.actif === false ? null : 'faible'; return { fort: !!opts.fort }; }
    if (m.type === 'sansFort') { opts.fort = null; return {}; }
    if (m.type === 'lexique') { lexique(m.memoire); return {}; }
    if (m.type === 'lire') {
      var img = { data: new Uint8ClampedArray(m.buf), width: m.w, height: m.h };
      var lignes = await M.lignes.lireLignes(ctx, img, { fort: opts.fort, lexique: opts.lexique });
      // ce qui sert ensuite, sans les tableaux de probabilités
      return { lignes: lignes.map(function (l) { return { text: l.text, conf: l.conf, alts: l.alts, agree: l.agree, p: l.p, box: l.box, h: l.h, autres: l.autres }; }) };
    }
    throw new Error('message inconnu : ' + m.type);
  })().then(function (r) { r.id = m.id; r.ok = true; self.postMessage(r); },
    function (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); });
};
