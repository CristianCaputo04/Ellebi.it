/* =========================================================================
   EmmeLù — controlli che girano prima di ogni pubblicazione

   Non è una suite di test: è la rete che impedisce di mandare online cose
   che si possono accorgere da sole di essere sbagliate. Gira in CI e blocca
   il deploy. Zero dipendenze: solo Node.

       node tools/verifica.mjs
   ========================================================================= */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";

const RADICE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const problemi = [];
const ok = [];

function verifica(nome, condizione, dettaglio = "") {
  if (condizione) ok.push(nome);
  else problemi.push(dettaglio ? `${nome} — ${dettaglio}` : nome);
}

function fileIn(cartella, estensioni, salta = []) {
  const trovati = [];
  (function scendi(dir) {
    let voci;
    try { voci = readdirSync(dir); } catch { return; }
    for (const voce of voci) {
      if (salta.includes(voce)) continue;
      const pieno = join(dir, voce);
      if (statSync(pieno).isDirectory()) scendi(pieno);
      else if (estensioni.includes(extname(voce))) trovati.push(pieno);
    }
  })(join(RADICE, cartella));
  return trovati;
}

/* ------------------------------------------- 1. sintassi di ogni file JS */

const moduli = fileIn("src", [".js"]);
const copioni = fileIn("public/assets/js", [".js"]);
const strumenti = fileIn("tools", [".mjs"]);

for (const file of [...moduli, ...copioni, ...strumenti]) {
  try {
    // `--check` non esegue il file: verifica solo che sia analizzabile.
    // I moduli di src/ usano import/export, quindi vanno controllati come
    // moduli ES, altrimenti Node li rifiuta pur essendo corretti.
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    ok.push(`sintassi ${file.replace(RADICE + "/", "")}`);
  } catch (errore) {
    problemi.push(`sintassi ${file.replace(RADICE + "/", "")}\n${String(errore.stderr || errore)}`);
  }
}

/* ------------------------- 2. nessun segreto finito nel file di configurazione */

const wrangler = readFileSync(join(RADICE, "wrangler.toml"), "utf8");
for (const segreto of ["PAYPAL_SECRET", "EMAIL_API_KEY", "ADMIN_PASSWORD_HASH"]) {
  // Un segreto va impostato con `wrangler secret put`, mai scritto qui: questo
  // file finisce nel repository e lo legge chiunque.
  const assegnato = new RegExp(`^\\s*${segreto}\\s*=\\s*"[^"]+"`, "m").test(wrangler);
  verifica(`nessun ${segreto} in wrangler.toml`, !assegnato,
    "va impostato con `npx wrangler@4 secret put`, non scritto nel file");
}

/* La sezione di produzione e' il blocco [vars], non "tutto quello che viene
   prima di [env.sviluppo]": nel file le due tabelle si alternano, e dividere
   per posizione faceva controllare l'ambiente sbagliato — cioe' non
   controllare niente. Si estrae il blocco fino alla prossima intestazione. */
function tabella(nome) {
  /* L'intestazione va ancorata a inizio riga: cercandola con indexOf si
     trovava "[vars]" scritto dentro un commento molto piu' su, e la funzione
     restituiva il pezzo di file sbagliato — cioe' il controllo passava
     sempre senza guardare niente. */
  const apertura = new RegExp(`^\\[${nome.replace(/[.[\]]/g, "\\$&")}\\]\\s*$`, "m");
  const trovata = apertura.exec(wrangler);
  if (!trovata) return "";
  const resto = wrangler.slice(trovata.index + trovata[0].length);
  const fine = resto.search(/^\[/m);
  return fine === -1 ? resto : resto.slice(0, fine);
}

const sezioneProduzione = tabella("vars");
verifica("nessun HASH_SALE nella configurazione di produzione",
  !/^\s*HASH_SALE\s*=\s*"[^"]+"/m.test(sezioneProduzione));

/* --------------------- 3. le rotte generate passano prima dal Worker */

/* Senza questo elenco il livello Static Assets di Cloudflare intercetta le
   richieste di navigazione e risponde 404: il negozio funziona con curl e
   sparisce nei browser. E' successo davvero, ed e' invisibile a ogni prova
   fatta da riga di comando. */
const attese = ["/negozio", "/prodotto/*", "/carrello", "/checkout", "/ordine/*",
  "/admin", "/admin/*", "/api/*", "/privacy", "/cookie", "/termini", "/vendita", "/resi"];
const elenco = (wrangler.match(/run_worker_first\s*=\s*\[([\s\S]*?)\]/) || [])[1] || "";
for (const rotta of attese) {
  verifica(`run_worker_first contiene ${rotta}`, elenco.includes(`"${rotta}"`),
    "senza, la rotta risponde 404 nei browser pur funzionando con curl");
}

/* ------------------------ 4. l'interruttore del negozio è coerente */

const negozioAttivo = /^\s*NEGOZIO_ATTIVO\s*=\s*"1"/m.test(sezioneProduzione);
const piva = (sezioneProduzione.match(/^\s*PIVA\s*=\s*"([^"]*)"/m) || [])[1] || "";
const ragione = (sezioneProduzione.match(/^\s*RAGIONE_SOCIALE\s*=\s*"([^"]*)"/m) || [])[1] || "";
verifica("negozio acceso solo con i dati fiscali compilati",
  !negozioAttivo || (piva !== "" && ragione !== ""),
  "NEGOZIO_ATTIVO=1 senza PIVA o RAGIONE_SOCIALE: vendere online senza partita IVA e' un illecito");

/* ------------------ 5. i segnaposto legali hanno tutti una sostituzione */

const config = readFileSync(join(RADICE, "src/config.js"), "utf8");
const usati = new Set();
for (const pagina of fileIn("public", [".html"])) {
  for (const m of readFileSync(pagina, "utf8").matchAll(/\{\{([A-Z_]+)\}\}/g)) usati.add(m[1]);
}
for (const chiave of usati) {
  verifica(`il segnaposto {{${chiave}}} viene sostituito`, config.includes(`${chiave}:`),
    "compare in una pagina legale ma riempiSegnaposto() non lo conosce: uscirebbe in chiaro");
}

/* ----------------------- 6. le pagine d'acquisto non finiscono su Google */

const sitemap = readFileSync(join(RADICE, "public/sitemap.xml"), "utf8");
for (const rotta of ["/carrello", "/checkout", "/admin", "/ordine"]) {
  verifica(`la sitemap non elenca ${rotta}`, !sitemap.includes(`ellebi.it${rotta}`));
}

/* ---------------------------- 7. nessun testo non passato da esc() */

/* Controllo grossolano ma utile: nelle pagine generate ogni interpolazione
   dovrebbe passare da esc(), euro() o dataOra(). Si segnalano le altre, che
   vanno guardate a mano — alcune sono legittime (marcatura composta qui
   dentro), ma e' bene che qualcuno ci metta gli occhi. */
let sospette = 0;
for (const file of fileIn("src/pagine", [".js"]).concat(fileIn("src/admin-pagine", [".js"]))) {
  const testo = readFileSync(file, "utf8");
  for (const m of testo.matchAll(/\$\{([^}]{1,80})\}/g)) {
    const dentro = m[1].trim();
    if (/^(esc|euro|euroDecimale|dataOra|data|jsonLdSicuro|urlSicuro)\(/.test(dentro)) continue;
    if (/^[a-zA-Z_$][\w$]*(\(\))?$/.test(dentro) && /^(simboli|intestazione|menuMobile|piePagina|corpo|fogli|copioni|nonce|titolo|vCss|vJs|gettone|righe|voci|opzioni|elenco|griglia|filtri|blocco|sezione|azioni|campi|schede|lista|tabella|storico|riepilogo|avviso|dati|stato|marca|etichetta)/.test(dentro)) continue;
    sospette += 1;
  }
}
// Non e' un errore: e' un numero da tenere d'occhio. Si stampa e basta.
ok.push(`interpolazioni da rivedere a mano: ${sospette}`);

/* ------------- 8. i moduli del pannello parlano la lingua delle rotte

   Un modulo HTML e la rotta che lo riceve comunicano per nome di campo e per
   valore. Se divergono, non c'e' nessun errore di sintassi e nessun test
   unitario che fallisce: il modulo si compila, il pulsante si preme, e il
   server risponde "non valido" — oppure, peggio, accetta e butta via un campo
   in silenzio. E' successo davvero con il rimborso: il modulo inviava
   "Recesso entro 14 giorni", la rotta accettava solo "recesso", e nessun
   rimborso poteva partire.

   Questi controlli non sostituiscono una prova end-to-end: fissano i due o
   tre accordi che si sono gia' rotti una volta. */

const rimborsiSrc = readFileSync(join(RADICE, "src/rimborsi.js"), "utf8");
const rimborsoPag = readFileSync(join(RADICE, "src/admin-pagine/rimborso.js"), "utf8");
const indexSrc = readFileSync(join(RADICE, "src/index.js"), "utf8");

verifica(
  "i motivi del rimborso hanno un elenco solo",
  rimborsoPag.includes('from "../rimborsi.js"') && !/const MOTIVI = \[/.test(rimborsoPag),
  "src/admin-pagine/rimborso.js ridefinisce i motivi invece di importarli da src/rimborsi.js: i due elenchi divergeranno e ogni rimborso verra' rifiutato"
);

for (const campo of ["csrf", "tipo", "importo_euro", "motivo", "nota", "conferma"]) {
  verifica(
    `il modulo del rimborso invia il campo "${campo}"`,
    rimborsoPag.includes(`name="${campo}"`),
    `la rotta /admin/ordine/:numero/rimborso legge "${campo}", ma il modulo non lo manda: il valore arriva vuoto senza nessun errore`
  );
}

verifica(
  "la conferma del rimborso usa lo stesso valore su modulo e rotta",
  rimborsoPag.includes('name="conferma" value="si"') && indexSrc.includes('modulo.get("conferma") !== "si"'),
  "modulo e rotta si aspettano valori di conferma diversi: il rimborso verrebbe sempre rifiutato"
);

/* ---- 9. ogni script in linea delle pagine generate porta il nonce

   Le pagine generate non passano da public/_headers: la loro CSP autorizza
   per nonce, non per hash. Uno <script> in linea senza ${nonce} viene
   bloccato dal browser — e non se ne accorge nessuno provando con curl, che
   le intestazioni le riceve ma non esegue niente. E' successo con il
   frammento di configurazione di iubenda, cioe' con il consenso cookie. */

/* Si tolgono prima i commenti — quelli di JavaScript e quelli HTML dentro le
   stringhe template. Senza, questo controllo cadrebbe nella trappola che
   serve a evitare: sia questo file sia layout.js CITANO il tag <script> in
   prosa, e un cercatore ingenuo conterebbe quelle citazioni come marcatura.
   E' esattamente l'errore che aveva tools/aggiorna-csp-hash.py. */
const layoutSrc = readFileSync(join(RADICE, "src/pagine/layout.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

let senzaNonce = [];
for (const m of layoutSrc.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)) {
  if (!m[1].includes("${nonce}")) senzaNonce.push(m[0]);
}
verifica(
  "ogni script in linea delle pagine generate porta il nonce",
  senzaNonce.length === 0,
  `in src/pagine/layout.js ci sono script in linea senza \${nonce}, che la CSP bloccherebbe: ${senzaNonce.join(" ")}`
);

/* ------------------------------------------------------------ risultati */

console.log(`${ok.length} controlli superati.`);
if (problemi.length === 0) {
  console.log("Nessun problema.");
  process.exit(0);
}
console.log(`\n${problemi.length} PROBLEMI:\n`);
for (const p of problemi) console.log("  ✘ " + p);
process.exit(1);
