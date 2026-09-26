#!/usr/bin/env node
/* =========================================================================
   Prepara la pubblicazione su Cloudflare Pages (emmelu.pages.dev).

   Perché esiste.
   Il sito vive come Worker, e l'indirizzo gratuito di un Worker contiene il
   nome dell'account: emmelu.<account>.workers.dev. Pages invece dà un
   indirizzo con il solo nome del progetto, emmelu.pages.dev, senza toccare
   l'account né gli altri progetti che ci stanno sopra.

   Cosa fa.
   Non c'è un secondo sito da mantenere. Da UN solo sorgente produce:
     dist-pages/            i file di public/, così come sono
     dist-pages/_worker.js  src/index.js impacchettato in un file solo:
                            Pages lo esegue su ogni richiesta ("advanced
                            mode") e gli passa env.ASSETS, lo stesso nome
                            che il codice usa già con i Worker
     pages/wrangler.toml    la configurazione di Pages, con le variabili
                            copiate da [vars] di wrangler.toml

   Le variabili si copiano invece di riscriverle: due elenchi scritti a mano
   divergono, e il giorno in cui IN_ARRIVO passa a "0" nel file principale
   deve passare a "0" anche qui senza che nessuno se ne ricordi.

   Cosa Pages NON fa, e va saputo:
     · i compiti periodici (crons) non esistono su Pages. Servono solo a
       negozio aperto, per annullare gli ordini non pagati: finché il negozio
       è spento non manca niente, ma prima di aprirlo su Pages vanno
       spostati altrove;
     · il database D1, quando ci sarà, va dichiarato anche qui.

       node tools/prepara-pages.mjs
   ========================================================================= */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");
const USCITA = join(RADICE, "dist-pages");
const CONFIG_PAGES = join(RADICE, "pages", "wrangler.toml");
const NOME_PROGETTO = "emmelu";

// 1. file statici
rmSync(USCITA, { recursive: true, force: true });
mkdirSync(USCITA, { recursive: true });
cpSync(join(RADICE, "public"), USCITA, { recursive: true });

// 2. lo script, in un file solo
execFileSync("npx", [
  "--yes", "esbuild@0.24.0",
  join(RADICE, "src", "index.js"),
  "--bundle",
  "--format=esm",
  "--platform=neutral",
  "--target=es2022",
  "--log-level=warning",
  `--outfile=${join(USCITA, "_worker.js")}`,
], { stdio: "inherit" });

// 3. configurazione di Pages, con le variabili di produzione
const principale = readFileSync(join(RADICE, "wrangler.toml"), "utf8");
const data = (principale.match(/^compatibility_date\s*=\s*"([^"]+)"/m) || [])[1];
if (!data) throw new Error("compatibility_date non trovata in wrangler.toml");

// [vars] di primo livello (produzione), NON [env.sviluppo.vars]: si prende
// dalla riga "[vars]" fino alla prossima intestazione di tabella.
const inizio = principale.search(/^\[vars\]\s*$/m);
if (inizio < 0) throw new Error("[vars] non trovata in wrangler.toml");
const resto = principale.slice(inizio + "[vars]".length);
const fine = resto.search(/^\[/m);
const variabili = (fine < 0 ? resto : resto.slice(0, fine)).trim();
if (!/^IN_ARRIVO\s*=/m.test(variabili)) throw new Error("IN_ARRIVO mancante in [vars]");

mkdirSync(dirname(CONFIG_PAGES), { recursive: true });
writeFileSync(CONFIG_PAGES, `# GENERATO da tools/prepara-pages.mjs — non modificare a mano.
# Le variabili sono copiate da [vars] di wrangler.toml: si cambiano là.

name = "${NOME_PROGETTO}"
pages_build_output_dir = "../dist-pages"
compatibility_date = "${data}"

[vars]
${variabili}
`);

console.log(`Pronto: dist-pages/ e pages/wrangler.toml per il progetto "${NOME_PROGETTO}".`);
