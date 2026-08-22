#!/usr/bin/env node
/**
 * Calcola l'hash SHA-256 di ogni <script> inline (JSON-LD, ma anche il
 * frammento di configurazione di iubenda _iub.csConfiguration) presente
 * nelle pagine compilate in dist/ e li inserisce nella direttiva script-src
 * di dist/_headers, sostituendo il placeholder __JSONLD_HASHES__. Va
 * eseguito DOPO "vite build", perché legge l'HTML finale (minificato) e
 * non il template EJS sorgente. Gli script con src (main.js, head.js, gli
 * script esterni di iubenda) sono già coperti da 'self' o dal dominio
 * esplicito e non hanno bisogno di hash.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");
const HEADERS_PATH = join(DIST_DIR, "_headers");

function sha256Base64(content) {
  return createHash("sha256").update(content, "utf8").digest("base64");
}

async function collectHashes() {
  const files = (await readdir(DIST_DIR)).filter((f) => f.endsWith(".html"));
  const hashes = new Set();

  // Qualsiasi <script> privo di attributo src: copre sia i blocchi JSON-LD
  // sia il frammento inline _iub.csConfiguration di iubenda.
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

  for (const file of files) {
    const html = await readFile(join(DIST_DIR, file), "utf8");
    let match;
    while ((match = re.exec(html))) {
      hashes.add(sha256Base64(match[1]));
    }
  }
  return [...hashes];
}

async function main() {
  const hashes = await collectHashes();
  const hashSources = hashes.map((h) => `'sha256-${h}'`).join(" ");

  let headers = await readFile(HEADERS_PATH, "utf8");
  const before = headers;
  headers = headers.replace("'__JSONLD_HASHES__'", hashSources);

  if (headers === before) {
    console.warn("Attenzione: nessun placeholder __JSONLD_HASHES__ trovato in _headers, hash non inseriti.");
  }

  await writeFile(HEADERS_PATH, headers, "utf8");
  console.log(`CSP aggiornata con ${hashes.length} hash di blocchi inline.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
