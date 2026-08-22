#!/usr/bin/env node
/**
 * Genera automaticamente, per ogni immagine sorgente in src/assets/img/,
 * le varianti responsive AVIF + WebP + JPEG (fallback) in più larghezze,
 * scrivendole in public/assets/img/ così Vite le copia inalterate nel build.
 *
 * Uso:
 *   node scripts/optimize-images.mjs           genera tutto
 *   node scripts/optimize-images.mjs --check   simula senza scrivere file
 */
import { readdir, mkdir, stat, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SRC_DIR = join(__dirname, "..", "src", "assets", "img");
const OUT_DIR = join(__dirname, "..", "public", "assets", "img");

// Larghezze target: telefono piccolo, telefono grande/tablet, desktop, hi-dpi.
// Ogni immagine sorgente genera solo le larghezze <= alla propria larghezza reale.
const BREAKPOINTS = [480, 800, 1200, 1920];

const FORMATS = [
  { ext: "avif", options: { quality: 55, effort: 4 } },
  { ext: "webp", options: { quality: 78 } },
  { ext: "jpg", options: { quality: 82, mozjpeg: true } },
];

// Sotto questa soglia percentuale la variante non vale la pena: si tiene
// solo se pesa sensibilmente meno dell'originale allo stesso formato/larghezza.
const MIN_SAVING_RATIO = 0.05;

const isCheck = process.argv.includes("--check");

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(1)}kB`;
}

async function listSourceImages() {
  const entries = await readdir(SRC_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && [".jpg", ".jpeg", ".png"].includes(extname(e.name).toLowerCase()))
    .map((e) => e.name);
}

async function processImage(filename) {
  const srcPath = join(SRC_DIR, filename);
  const name = basename(filename, extname(filename));
  const image = sharp(srcPath);
  const meta = await image.metadata();
  const realWidth = meta.width ?? 0;

  const widths = BREAKPOINTS.filter((w) => w <= realWidth);
  if (widths.length === 0 || widths[widths.length - 1] !== realWidth) {
    widths.push(realWidth); // garantisce sempre una variante a piena risoluzione
  }

  const report = [];
  const originalBytes = (await stat(srcPath)).size;

  for (const width of widths) {
    const isFullSize = width === realWidth;
    for (const { ext, options } of FORMATS) {
      // Il JPEG a piena risoluzione resta il fallback "originale": stesso nome
      // dell'immagine sorgente, così l'HTML può referenziarlo senza suffisso.
      const suffix = isFullSize ? "" : `-w${width}`;
      const outName = `${name}${suffix}.${ext}`;
      const outPath = join(OUT_DIR, outName);

      const method = ext === "jpg" ? "jpeg" : ext;
      const buffer = await sharp(srcPath)
        .resize({ width, withoutEnlargement: true })
        [method](options)
        .toBuffer();

      // Il JPEG pieno formato è sempre tenuto: è il fallback universale.
      const keepAlways = ext === "jpg" && isFullSize;
      const savingRatio = 1 - buffer.length / originalBytes;
      const worthIt = keepAlways || ext !== "jpg" || savingRatio >= MIN_SAVING_RATIO || !isFullSize;

      if (!worthIt) {
        report.push(`  ${outName.padEnd(28)} scartato (non più leggero del JPEG originale)`);
        continue;
      }

      if (!isCheck) {
        await mkdir(OUT_DIR, { recursive: true });
        await writeFile(outPath, buffer);
      }
      report.push(`  ${outName.padEnd(28)} ${fmtKB(buffer.length)}`);
    }
  }

  return { filename, originalBytes, report };
}

async function main() {
  const files = await listSourceImages();
  if (files.length === 0) {
    console.log("Nessuna immagine trovata in", SRC_DIR);
    return;
  }

  console.log(`${isCheck ? "[check] " : ""}Ottimizzazione di ${files.length} immagini sorgente…\n`);

  for (const file of files) {
    const { report } = await processImage(file);
    console.log(`${file}`);
    report.forEach((l) => console.log(l));
    console.log("");
  }

  console.log(isCheck ? "Simulazione completata (nessun file scritto)." : `Fatto. Varianti scritte in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
