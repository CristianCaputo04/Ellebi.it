/* Genera le varianti responsive e i formati moderni delle foto del sito.
 *
 * Non fa parte della pubblicazione: si esegue a mano quando si aggiunge o si
 * sostituisce una foto, e il risultato viene versionato insieme al resto, come
 * per tools/aggiorna-csp-hash.py. Il sito pubblicato resta senza dipendenze —
 * qui serve solo sharp, e solo sul computer di chi lavora al sito:
 *
 *     npm i --no-save sharp
 *     node tools/ottimizza-immagini.mjs            # scrive ciò che manca
 *     node tools/ottimizza-immagini.mjs --check    # elenca e basta
 *
 * I .jpg senza suffisso -wNNN sono i master a piena risoluzione: da lì si
 * ricavano tutte le altre varianti. Le qualità sono tarate sulle foto di
 * questo sito — trame a uncinetto molto dettagliate, dove scendere sotto
 * queste soglie si vede a occhio. Le varianti già presenti non vengono
 * riscritte: per rigenerarne una, cancellala prima.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const IMG = path.join(import.meta.dirname, "..", "public", "assets", "img");
const CHECK = process.argv.includes("--check");

const QUALITA = {
  avif: { quality: 50, effort: 6, chromaSubsampling: "4:2:0" },
  webp: { quality: 78, effort: 6 },
  jpeg: { quality: 82, mozjpeg: true },
};

// Le larghezze servite per ogni famiglia di foto, scelte sui `sizes` scritti
// nell'HTML: una per la resa a schermo pieno, una per gli schermi a densità
// doppia, più un gradino intermedio dove il salto era troppo largo (l'hero a
// 1440 px altrimenti scaricava il file da 1920).
const FAMIGLIE = [
  { test: /^hero\.jpg$/, larghezze: [960, 1440, 1920] },
  { test: /^hero-mobile\.jpg$/, larghezze: [500, 1000] },
  { test: /^atelier\.jpg$/, larghezze: [960, 1440, 1920] },
  { test: /^borsa-\d\d\.jpg$/, larghezze: [450, 900] },
  // Le foto "b" sono la seconda immagine delle schede, quella che compare al
  // passaggio del mouse: il CSS le usa solo a 450 px e mai più grandi.
  { test: /^borsa-\d\db\.jpg$/, larghezze: [450] },
  { test: /^gallery-\d\d\.jpg$/, larghezze: [400, 800] },
  { test: /^step-\d\d\.jpg$/, larghezze: [600, 900, 1200] },
];

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.error("Manca sharp. Installalo senza aggiungerlo al progetto:\n  npm i --no-save sharp");
  process.exit(1);
}

function nomeVariante(base, larghezza, piena, ext) {
  return larghezza === piena ? `${base}.${ext}` : `${base}-w${larghezza}.${ext}`;
}

let scritti = 0;
let scartati = 0;
let saltati = 0;
let mancanti = 0;

for (const file of fs.readdirSync(IMG).sort()) {
  const m = file.match(/^(.+)\.jpg$/);
  if (!m || /-w\d+$/.test(m[1])) continue;
  const famiglia = FAMIGLIE.find((f) => f.test.test(file));
  if (!famiglia) continue;

  const base = m[1];
  const master = path.join(IMG, file);
  const piena = (await sharp(master).metadata()).width;

  const larghezze = famiglia.larghezze.filter((l) => l <= piena);

  // AVIF e JPEG: una variante per larghezza, sempre.
  for (const larghezza of larghezze) {
    for (const ext of ["avif", "jpg"]) {
      const out = path.join(IMG, nomeVariante(base, larghezza, piena, ext));
      if (fs.existsSync(out)) {
        saltati++;
        continue;
      }
      mancanti++;
      if (CHECK) {
        console.log("manca   " + path.basename(out));
        continue;
      }
      const ridotta = sharp(master).resize({ width: larghezza, withoutEnlargement: true });
      const buf = await (ext === "avif" ? ridotta.avif(QUALITA.avif) : ridotta.jpeg(QUALITA.jpeg)).toBuffer();
      fs.writeFileSync(out, buf);
      console.log(`scritto ${path.basename(out).padEnd(28)} ${String(Math.round(buf.length / 1024)).padStart(5)} KB`);
      scritti++;
    }
  }

  // WebP: tutto o niente per famiglia.
  //
  // Su queste foto molto dettagliate il WebP a volte pesa più del JPEG da cui
  // deriva, e allora non va scritto: <source type="image/webp"> vince sul
  // JPEG a prescindere dal peso, quindi chi legge WebP scaricherebbe più byte
  // di chi non lo legge. Ma non basta scartare la singola larghezza: se una
  // famiglia avesse il WebP a 450 px e non a 900, su uno schermo a densità
  // doppia il browser sceglierebbe il file piccolo invece del JPEG grande, e
  // la foto uscirebbe sgranata. Per questo l'HTML mette la sorgente WebP solo
  // dove copre tutte le larghezze, e qui o si scrivono tutte o nessuna.
  const candidati = [];
  let webpConviene = true;
  for (const larghezza of larghezze) {
    const out = path.join(IMG, nomeVariante(base, larghezza, piena, "webp"));
    if (fs.existsSync(out)) {
      saltati++;
      continue;
    }
    mancanti++;
    if (CHECK) {
      console.log("manca   " + path.basename(out));
      continue;
    }
    const buf = await sharp(master)
      .resize({ width: larghezza, withoutEnlargement: true })
      .webp(QUALITA.webp)
      .toBuffer();
    const gemello = path.join(IMG, nomeVariante(base, larghezza, piena, "jpg"));
    const rif = fs.existsSync(gemello) ? fs.statSync(gemello).size : Infinity;
    if (buf.length >= rif) {
      console.log(
        `scartato WebP per ${base}: a ${larghezza}px pesa ${Math.round(buf.length / 1024)} KB contro ${Math.round(rif / 1024)} KB del JPEG`
      );
      webpConviene = false;
      break;
    }
    candidati.push({ out, buf });
  }

  if (webpConviene) {
    for (const { out, buf } of candidati) {
      fs.writeFileSync(out, buf);
      console.log(`scritto ${path.basename(out).padEnd(28)} ${String(Math.round(buf.length / 1024)).padStart(5)} KB`);
      scritti++;
    }
  } else {
    scartati += candidati.length + 1;
    // toglie eventuali WebP parziali rimaste da esecuzioni precedenti
    for (const larghezza of larghezze) {
      const vecchio = path.join(IMG, nomeVariante(base, larghezza, piena, "webp"));
      if (fs.existsSync(vecchio)) {
        fs.unlinkSync(vecchio);
        console.log("rimosso " + path.basename(vecchio) + " (WebP parziale, mai servita)");
      }
    }
  }
}

console.log(
  `\n${CHECK ? mancanti + " variante/i da generare" : scritti + " file scritti, " + scartati + " scartati perché più pesanti del JPEG"}, ${saltati} già presenti.`
);
