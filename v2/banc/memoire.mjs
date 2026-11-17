/* Mémoire des calculs des modèles, pour le banc seulement : une même image passée deux fois dans un même modèle
   n'est calculée qu'une fois (les résultats sont gardés dans local/memoire/, hors du dépôt). Sert à essayer vite
   des réglages de décodage. Les valeurs minuscules sont mises à zéro : à ne pas utiliser pour mesurer les temps. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function avecMemoire(sess, nom, dossier, seuil) {
  const racine = path.join(dossier, nom);
  fs.mkdirSync(racine, { recursive: true });
  return {
    inputNames: sess.inputNames, outputNames: sess.outputNames,
    run: async function (feeds) {
      const entree = feeds[sess.inputNames[0]], h = crypto.createHash('sha1');
      h.update(nom + ':' + entree.dims.join('x') + ':');
      h.update(Buffer.from(entree.data.buffer, entree.data.byteOffset, entree.data.byteLength));
      const cle = h.digest('hex'), fichier = path.join(racine, cle.slice(0, 2), cle + '.bin');
      const sortie = {};
      if (fs.existsSync(fichier)) {
        const b = fs.readFileSync(fichier), nd = b.readInt32LE(0), dims = [];
        for (let i = 0; i < nd; i++) dims.push(b.readInt32LE(4 + 4 * i));
        const n = b.readInt32LE(4 + 4 * nd), o = 8 + 4 * nd, total = dims.reduce((a, d) => a * d, 1), data = new Float32Array(total);
        const idx = new Uint32Array(b.buffer.slice(b.byteOffset + o, b.byteOffset + o + 4 * n));
        const val = new Float32Array(b.buffer.slice(b.byteOffset + o + 4 * n, b.byteOffset + o + 8 * n));
        for (let i = 0; i < n; i++) data[idx[i]] = val[i];
        sortie[sess.outputNames[0]] = { dims: dims, data: data };
        return sortie;
      }
      const r = (await sess.run(feeds))[sess.outputNames[0]], d = r.data;
      let n = 0;
      for (let i = 0; i < d.length; i++) if (d[i] > seuil) n++;
      const idx = new Uint32Array(n), val = new Float32Array(n);
      for (let i = 0, k = 0; i < d.length; i++) if (d[i] > seuil) { idx[k] = i; val[k++] = d[i]; }
      const tete = Buffer.alloc(8 + 4 * r.dims.length);
      tete.writeInt32LE(r.dims.length, 0);
      r.dims.forEach((x, i) => tete.writeInt32LE(Number(x), 4 + 4 * i));
      tete.writeInt32LE(n, 4 + 4 * r.dims.length);
      fs.mkdirSync(path.dirname(fichier), { recursive: true });
      fs.writeFileSync(fichier, Buffer.concat([tete, Buffer.from(idx.buffer), Buffer.from(val.buffer)]));
      const data = new Float32Array(d.length);
      for (let i = 0; i < n; i++) data[idx[i]] = val[i];
      sortie[sess.outputNames[0]] = { dims: r.dims.map(Number), data: data };
      return sortie;
    }
  };
}
