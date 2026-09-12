// =========================================================================
// Scheletro HTML del pannello di amministrazione.
//
// Il pannello NON è il negozio: non carica style.css, non carica i font del
// marchio, non carica iubenda. Chi apre questa pagina è una sola persona che
// ha già fatto l'accesso, spesso da telefono e spesso con poca linea: ogni
// byte speso in estetica condivisa è un byte tolto alla velocità con cui
// compare l'elenco degli ordini. Font di sistema e un solo foglio di stile.
// =========================================================================

import { esc } from "../util.js";

// Etichette leggibili degli stati. Stanno qui e non nelle singole pagine
// perché elenco e dettaglio devono chiamare le stesse cose con lo stesso
// nome: uno scarto fra "In lavorazione" e "In corso" fa dubitare di aver
// premuto il pulsante giusto.
export const ETICHETTE_STATO = {
  in_attesa_pagamento: "In attesa di pagamento",
  pagato: "Pagato",
  confermato: "Confermato",
  in_lavorazione: "In lavorazione",
  spedito: "Spedito",
  consegnato: "Consegnato",
  annullato: "Annullato",
  rimborsato: "Rimborsato",
  tutti: "Tutti",
};

// Un segno testuale per ogni stato. Serve perché lo stato resti distinguibile
// senza colore: daltonismo, stampa in bianco e nero, schermo al sole.
const SEGNI_STATO = {
  in_attesa_pagamento: "◷",
  pagato: "€",
  confermato: "✓",
  in_lavorazione: "✎",
  spedito: "➔",
  consegnato: "★",
  annullato: "✕",
  rimborsato: "↩",
  tutti: "•",
};

/**
 * Etichetta leggibile di uno stato.
 * Garantisce: una stringa non vuota e già sicura per l'HTML.
 * Non garantisce: che lo stato esista davvero nello schema — uno stato
 * sconosciuto viene mostrato così com'è (con escape), non nascosto.
 */
export function etichettaStato(stato) {
  return esc(ETICHETTE_STATO[stato] || stato || "—");
}

/**
 * Marcatura visiva di uno stato: segno + etichetta, entrambi dentro un
 * elemento con classe dedicata.
 * Garantisce: HTML sicuro, leggibile anche senza colore (il segno è testo
 * vero, non un'immagine e non un colore di sfondo).
 * Non garantisce: che il colore associato sia unico — la distinzione è
 * affidata a segno ed etichetta, il colore è un di più.
 */
export function marcaStato(stato) {
  const chiave = String(stato || "");
  const segno = SEGNI_STATO[chiave] || "•";
  return (
    `<span class="stato stato--${esc(chiave)}">` +
    `<span class="stato__segno" aria-hidden="true">${esc(segno)}</span>` +
    `<span class="stato__testo">${etichettaStato(chiave)}</span>` +
    `</span>`
  );
}

/**
 * Scheletro completo di una pagina del pannello.
 *
 * @param {object} opzioni
 * @param {string} opzioni.titolo        titolo della pagina (finisce in <title> e in <h1>)
 * @param {string} opzioni.corpo         HTML già costruito e già passato da esc()
 * @param {object} opzioni.ctx           contesto ({ config, url })
 * @param {string|null} opzioni.vocaleAttiva  "ordini" | "magazzino" | null
 * @param {string} [opzioni.csrf]        token anti-CSRF per il modulo "Esci"
 *
 * Garantisce: `noindex, nofollow` sempre; nessuna risorsa esterna; nessuno
 * script inline (la CSP li blocca); se `vocaleAttiva` è null la barra non
 * mostra navigazione né uscita, perché la pagina di accesso non ha sessione.
 * Non garantisce: l'escape di `corpo`, che arriva già composto dal chiamante.
 */
export function paginaAdmin({ titolo, corpo, ctx, vocaleAttiva = null, csrf = "" }) {
  const config = (ctx && ctx.config) || {};
  const vCss = esc(config.versioneCssAdmin || "");
  const vJs = esc(config.versioneJsAdmin || "");
  // Il token può arrivare dal chiamante o dal contesto: il modulo "Esci" è
  // una POST e senza token verrebbe rifiutato dal backend.
  const gettone = esc(csrf || (ctx && ctx.csrf) || "");
  const conSessione = vocaleAttiva !== null;

  const avvisoVetrina =
    config.negozioAttivo === false
      ? `<p class="avviso avviso--vetrina" role="status">` +
        `<strong>Negozio in modalità vetrina.</strong> Il catalogo si vede, ma ` +
        `gli ordini non possono arrivare: nessuno riesce a completare un acquisto.` +
        `</p>`
      : "";

  const avvisoFiscale =
    config.negozioAttivo === true && config.datiFiscaliCompleti === false
      ? `<p class="avviso avviso--grave" role="alert">` +
        `<strong>Dati fiscali incompleti.</strong> Partita IVA o ragione sociale ` +
        `mancanti: vendere in questa condizione non è consentito.` +
        `</p>`
      : "";

  const navigazione = conSessione
    ? `<nav class="barra__nav" aria-label="Sezioni del pannello">` +
      voce("/admin/ordini", "Ordini", vocaleAttiva === "ordini") +
      voce("/admin/magazzino", "Magazzino", vocaleAttiva === "magazzino") +
      `</nav>` +
      // Uscire cambia lo stato della sessione: è una POST con token, non un
      // link. Un link sarebbe seguibile da un prefetch del browser.
      `<form class="barra__esci" method="post" action="/admin/esci">` +
      `<input type="hidden" name="csrf" value="${gettone}">` +
      `<button type="submit" class="bottone bottone--muto">Esci</button>` +
      `</form>`
    : "";

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>${esc(titolo)} · EmmeLù Gestione</title>
<link rel="stylesheet" href="/assets/css/admin.css?v=${vCss}">
<script src="/assets/js/admin.js?v=${vJs}" defer></script>
</head>
<body>
<a class="salta" href="#principale">Salta al contenuto</a>
<header class="barra">
  <div class="barra__dentro">
    <p class="barra__logo"><a href="/admin/ordini">EmmeLù <span aria-hidden="true">·</span> Gestione</a></p>
    ${navigazione}
  </div>
</header>
<main id="principale" class="contenuto">
  ${avvisoFiscale}
  ${avvisoVetrina}
  <h1 class="titolo">${esc(titolo)}</h1>
  ${corpo}
</main>
</body>
</html>`;
}

// Una voce di menu. `aria-current="page"` è la parte che conta davvero:
// il grassetto lo vede solo chi guarda.
function voce(href, testo, attiva) {
  return (
    `<a class="barra__voce${attiva ? " barra__voce--attiva" : ""}" href="${esc(href)}"` +
    (attiva ? ` aria-current="page"` : "") +
    `>${esc(testo)}</a>`
  );
}
