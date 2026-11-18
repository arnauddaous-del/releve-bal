/* Imprim Bal 2 — caméra dans l'app, avec une aide à la prise de vue en direct :
   lumière, immobilité, téléphone droit, et le nombre de boîtes vues (même comptage que pour la lecture).
   Rien n'est enregistré ni envoyé pendant la visée : les images de l'aperçu restent dans la mémoire du téléphone. */
import { grilleAuto, petite } from './grille.js';
import { BalCore as C } from './moteur/regles.mjs';
import { estimer, redresserPixels, inverse, appliquer } from './moteur/redresser.mjs';

export function cameraPossible() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false;
}

/* video : l'élément <video> ; calque : un <canvas> posé dessus ; surGuide({ texte, pret, cols, rangs }). */
export async function ouvrirCamera(video, calque, surGuide) {
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: false,
    // 4:3 comme la photo : l'aperçu montre exactement ce qui sera photographié (affiché sans rognage)
    video: { facingMode: { ideal: 'environment' }, aspectRatio: { ideal: 4 / 3 }, width: { ideal: 4032 }, height: { ideal: 3024 } }
  });
  const piste = flux.getVideoTracks()[0];
  video.srcObject = flux;
  video.setAttribute('playsinline', ''); video.muted = true;
  try { await video.play(); } catch (e) {}

  let capacites = {};
  try { capacites = piste.getCapabilities ? piste.getCapabilities() : {}; } catch (e) {}
  let torche = false;

  // inclinaison du téléphone (Android ; sur iPhone il faudrait une autorisation de plus, on s'en passe)
  let incl = null;
  const surOrientation = e => { if (e.beta != null) incl = { beta: e.beta, gamma: e.gamma }; };
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') window.addEventListener('deviceorientation', surOrientation);

  const mini = document.createElement('canvas'), mg = mini.getContext('2d', { willReadFrequently: true });
  mini.width = 96; mini.height = 96;
  let precedent = null, grille = null, vue = null, tour = 0, fini = false, minuteur = 0;

  function analyser() {
    if (fini) return;
    minuteur = setTimeout(analyser, 450);
    if (!video.videoWidth || document.hidden) return;
    // lumière et mouvement sur une image de 96 x 96
    mg.drawImage(video, 0, 0, 96, 96);
    const d = mg.getImageData(0, 0, 96, 96).data, g = new Uint8Array(96 * 96);
    let somme = 0;
    for (let i = 0; i < g.length; i++) { g[i] = (d[4 * i] * 3 + d[4 * i + 1] * 6 + d[4 * i + 2]) / 10; somme += g[i]; }
    const lum = somme / g.length;
    let bouge = 0;
    if (precedent) { let e = 0; for (let i = 0; i < g.length; i++) e += Math.abs(g[i] - precedent[i]); bouge = e / g.length; }
    precedent = g;
    // les boîtes vues, une fois sur deux (environ une fois par seconde)
    if (tour++ % 2 === 0) {
      // la grille n'est dessinée que si deux comptages de suite trouvent les mêmes colonnes et rangées
      // même chemin que pour la photo : redressement si le bloc est vu de biais, puis comptage ; les cases sont ramenées
      // sur l'aperçu (quadrilatères qui suivent l'inclinaison)
      let g = null;
      try {
        const s = petite(video), r = estimer(s);
        if (r) {
          const red = redresserPixels(s, r, 700), inv = inverse(red.H), W2 = red.image.width, H2 = red.image.height;
          g = grilleAuto(red.image);
          g.versVideo = (u, v) => { const p = appliquer(inv, u * W2, v * H2); return [p[0] / s.width, p[1] / s.height]; };
        } else g = grilleAuto(s);
      } catch (e) { g = null; }
      const meme = g && grille && g.cols.length === grille.cols.length && g.rows[0].length === grille.rows[0].length;
      vue = meme && bouge <= 14 ? g : null;
      grille = g;
      dessinerGrille();
    }
    let texte, pret = false;
    if (lum < 45) texte = 'Plus de lumière';
    else if (bouge > 14) texte = 'Tenez le téléphone immobile';
    else if (incl && window.innerHeight > window.innerWidth && Math.abs(incl.gamma) > 14 && Math.abs(incl.beta) > 45) texte = 'Tenez le téléphone droit';
    else if (incl && window.innerHeight > window.innerWidth && (incl.beta < 55 || incl.beta > 125)) texte = 'Placez le téléphone face aux boîtes';
    else if (vue) {
      const n = C.cells(vue).filter(c => !c.off).length;
      texte = 'Environ ' + n + ' boîte' + (n > 1 ? 's' : '') + ' · toutes dans le cadre ?'; pret = true;
    } else texte = 'Cadrez seulement le bloc de boîtes';
    surGuide({ texte: texte, pret: pret, cols: vue ? vue.cols.length + 1 : 0, rangs: vue ? vue.rows[0].length + 1 : 0 });
  }
  // la grille vue, dessinée sur l'aperçu (la vidéo est affichée entière : object-fit contain)
  function dessinerGrille() {
    const W = calque.clientWidth, H = calque.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (calque.width !== Math.round(W * dpr)) { calque.width = Math.round(W * dpr); calque.height = Math.round(H * dpr); }
    const g = calque.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!vue || !video.videoWidth) return;
    const vw = video.videoWidth, vh = video.videoHeight, k = Math.min(W / vw, H / vh), ox = (W - vw * k) / 2, oy = (H - vh * k) / 2;
    g.strokeStyle = 'rgba(76,196,190,.9)'; g.lineWidth = 2;
    const vers = vue.versVideo || ((u, v) => [u, v]);
    C.cells(vue).forEach(c => {
      if (c.off) return;
      const q = [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]].map(p => vers(p[0], p[1]));
      g.beginPath();
      q.forEach((p, i) => { const x = ox + p[0] * vw * k, y = oy + p[1] * vh * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath(); g.stroke();
    });
  }
  analyser();

  return {
    torchePossible: !!capacites.torch,
    async torche(actif) {
      try { await piste.applyConstraints({ advanced: [{ torch: !!actif }] }); torche = !!actif; } catch (e) {}
      return torche;
    },
    /* La photo en pleine définition quand le téléphone le permet (ImageCapture), sinon l'image de l'aperçu. */
    async prendre() {
      if (typeof ImageCapture === 'function') {
        try {
          const ic = new ImageCapture(piste), opts = {};
          try {
            const pc = await ic.getPhotoCapabilities();
            if (pc && pc.imageWidth && pc.imageWidth.max) { opts.imageWidth = pc.imageWidth.max; opts.imageHeight = pc.imageHeight.max; }
            if (torche && pc && pc.fillLightMode && pc.fillLightMode.indexOf('flash') >= 0) opts.fillLightMode = 'flash';
          } catch (e) {}
          const b = await ic.takePhoto(opts);
          if (b && b.size) return b;
        } catch (e) {}
      }
      const cv = document.createElement('canvas');
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      cv.getContext('2d').drawImage(video, 0, 0);
      return new Promise((ok, ko) => cv.toBlob(b => (b ? ok(b) : ko(new Error('photo impossible'))), 'image/jpeg', 0.95));
    },
    arreter() {
      fini = true; clearTimeout(minuteur);
      window.removeEventListener('deviceorientation', surOrientation);
      flux.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      const g = calque.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, calque.width, calque.height);
    }
  };
}
