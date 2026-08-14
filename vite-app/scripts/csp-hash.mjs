#!/usr/bin/env node
/**
 * Calcola l'hash SHA-256 di ogni blocco <script type="application/ld+json">
 * presente nelle pagine compilate in dist/ e li inserisce nella direttiva
 * script-src di dist/_headers, sostituendo i placeholder hash generati
 * dalla build precedente. Va eseguito DOPO "vite build", perché legge
 * l'HTML finale (minificato) e non il template EJS sorgente.
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

  for (const file of files) {
    const html = await readFile(join(DIST_DIR, file), "utf8");
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
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
  headers = headers.replace(
    /(script-src 'self')(?: '__JSONLD_HASHES__')?/,
    hashSources ? `$1 ${hashSources}` : "$1"
  );

  if (headers === before && hashSources) {
    console.warn("Attenzione: nessun placeholder __JSONLD_HASHES__ trovato in _headers, hash non inseriti.");
  }

  await writeFile(HEADERS_PATH, headers, "utf8");
  console.log(`CSP aggiornata con ${hashes.length} hash di blocchi JSON-LD.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
