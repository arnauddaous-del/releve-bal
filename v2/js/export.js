/* Imprim Bal 2 — export, identique à celui de la V1 (mêmes lignes de titre, mêmes colonnes, même fichier Excel
   écrit à la main : zip non compressé + SpreadsheetML, sans bibliothèque). Code repris de index.html (v1-finale). */

export const SANS_NOM = 'BAL Sans Nom';

function cell(v, sep) {
  var s = String(v == null ? '' : v);
  if (s.indexOf(sep) > -1 || s.indexOf('"') > -1 || /[\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
/* Lignes de titre (tournée, lieu, nombre de PRE = toutes les boîtes, vides comprises), puis une ligne par boîte :
   ordre de flashage, tous les noms de la boîte (ou « BAL Sans Nom »), appartement, choix publicité. */
export function donneesExport(lieu, addrCol) {
  var ac = !!addrCol, addr = String(lieu.address || '').trim(), tour = String(lieu.tournee || '').trim(), title = [];
  if (tour) title.push('Tournée : ' + tour);
  if (addr) title.push('Lieu : ' + addr);
  title.push('Nombre de PRE : ' + lieu.boxes.length);
  var rows = lieu.boxes.map(function (b, i) {
    var people = String(b.name || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    return { none: !people.length, cells: (ac ? [addr] : []).concat([i + 1, people.length ? people.join(' / ') : SANS_NOM, b.apt, b.pub === 'STOP PUB' ? 'STOP PUB' : 'OK PUB']) };
  });
  return { title: title, head: (ac ? ['lieu'] : []).concat(['ordre_flashage', 'noms_prenoms', 'numero_appartement', 'pub']), rows: rows, ac: ac };
}
export function csv(lieu, reglages) {
  var sep = reglages.sep === ',' ? ',' : ';', d = donneesExport(lieu, reglages.addrCol), rows = d.title.map(function (t) { return [t]; });
  rows.push(['']); rows.push(d.head);
  d.rows.forEach(function (r) { rows.push(r.cells); });
  return '\ufeff' + rows.map(function (r) { return r.map(function (c) { return cell(c, sep); }).join(sep); }).join('\r\n');
}
export function xlsx(lieu, reglages) { return buildXLSX(donneesExport(lieu, reglages.addrCol)); }

function slug(a) { var t = String(a || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); return t ? t + '-' : ''; }
function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
/* imprim-bal-tournee-<n>-<lieu>-<date> */
export function nomFichier(lieu) { return 'imprim-bal-' + (String(lieu.tournee || '').trim() ? 'tournee-' + slug(lieu.tournee) : '') + slug(lieu.address) + today(); }

/* Partage du fichier (feuille de partage du téléphone) ; sinon téléchargement. Renvoie 'partage', 'telecharge' ou 'annule'. */
export async function partager(blob, nom) {
  let f = null;
  try { f = new File([blob], nom, { type: (blob.type || 'application/octet-stream').split(';')[0] }); } catch (e) {}
  if (f && navigator.canShare && navigator.share) {
    let ok = false;
    try { ok = navigator.canShare({ files: [f] }); } catch (e) {}
    if (ok) {
      try { await navigator.share({ files: [f], title: nom }); return 'partage'; }
      catch (e) { if (e && e.name === 'AbortError') return 'annule'; }
    }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'telecharge';
}

var CRC_T = null;
function crc32(u8) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  var x = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) x = CRC_T[(x ^ u8[i]) & 255] ^ (x >>> 8);
  return (x ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files, type) {
  var enc = new TextEncoder(), parts = [], central = [], off = 0, csize = 0;
  files.forEach(function (f) {
    var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    var h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    var c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); csize += 46 + name.length;
    off += 30 + name.length + data.length;
  });
  var e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: type });
}
function xmlEsc(v) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function buildXLSX(d) {
  var rows = [], r = 0, ncol = d.head.length;
  function col(i) { return String.fromCharCode(65 + i); }
  function str(i, v, st) { return '<c r="' + col(i) + r + '" t="inlineStr" s="' + st + '"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>'; }
  function row(cells) { rows.push('<row r="' + r + '">' + cells.join('') + '</row>'); }
  d.title.forEach(function (t, k) { r++; row([str(0, t, k < d.title.length - 1 ? 1 : 2)]); });
  r++;                                                    // blank line under the title
  r++; var headRow = r; row(d.head.map(function (h, i) { return str(i, h, 3); }));
  var oi = d.ac ? 1 : 0;
  d.rows.forEach(function (x) {
    r++;
    row(x.cells.map(function (v, i) {
      if (i === oi) return '<c r="' + col(i) + r + '" s="5"><v>' + (+v) + '</v></c>';
      return str(i, v, i === oi + 1 && x.none ? 4 : 0);
    }));
  });
  var widths = (d.ac ? [32] : []).concat([15, 46, 21, 12]);
  var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + headRow + '" topLeftCell="A' + (headRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    '<autoFilter ref="A' + headRow + ':' + col(ncol - 1) + Math.max(headRow, r) + '"/>' +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
  var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="11"/><color rgb="FF566573"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE3EBEF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF14202B"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', P = 'http://schemas.openxmlformats.org/package/2006/relationships';
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + P + '"><Relationship Id="rId1" Type="' + R + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + R + '">' +
      '<sheets><sheet name="Imprim Bal" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'Imprim Bal\'!$A$' + headRow + ':$' + col(ncol - 1) + '$' + Math.max(headRow, r) + '</definedName></definedNames></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + P + '">' +
      '<Relationship Id="rId1" Type="' + R + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + R + '/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: sheet }
  ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
