/* =========================================================================
   EmmeLù — pagina di stato di un ordine

   Raggiungibile solo con il token ricevuto per e-mail: non c'è registrazione,
   non ci sono account, e questa pagina mostra nome, indirizzo e telefono. Il
   token è l'unica cosa che la protegge, e per questo la pagina è sempre
   `noindex` e il router non distingue "ordine inesistente" da "token
   sbagliato" — dirlo confermerebbe che quel numero d'ordine esiste.
   ========================================================================= */

import { esc, euro, dataOra } from "../util.js";
import { paginaCompleta } from "./layout.js";

/* I passi che il cliente vede. Gli stati interni sono di più (in attesa di
   pagamento, annullato, rimborsato): quelli non sono passi di un percorso, e
   vengono mostrati come messaggio invece che come barra di avanzamento. */
const PASSI = [
  { stato: "confermato", nome: "Ordine ricevuto" },
  { stato: "in_lavorazione", nome: "In lavorazione" },
  { stato: "spedito", nome: "Spedito" },
  { stato: "consegnato", nome: "Consegnato" },
];

/* Un ordine pagato con PayPal è "pagato"; uno in contrassegno è "confermato".
   Per il cliente sono lo stesso momento, quindi contano come lo stesso passo. */
const EQUIVALENZE = { pagato: "confermato" };

const MESSAGGI = {
  in_attesa_pagamento: "Il pagamento non risulta ancora completato. Se hai chiuso la finestra di PayPal prima della fine, riprova dal carrello: il pezzo resta impegnato ancora per poco.",
  annullato: "Questo ordine è stato annullato. Se non sei stato tu, scrivimi.",
  rimborsato: "Questo ordine è stato rimborsato. Il tempo di riaccredito dipende dalla tua banca, di solito pochi giorni lavorativi.",
};

function barra(statoCorrente) {
  const normalizzato = EQUIVALENZE[statoCorrente] || statoCorrente;
  const indice = PASSI.findIndex((p) => p.stato === normalizzato);

  return `<ol class="ordine__passi" role="list">
        ${PASSI.map((passo, i) => {
          const fatto = indice >= 0 && i <= indice;
          const corrente = i === indice;
          // Lo stato non è affidato al solo colore: c'è un segno testuale e
          // aria-current, così è leggibile anche in stampa, in bianco e nero
          // e con un lettore di schermo.
          return `<li class="ordine__passo${fatto ? " ordine__passo--fatto" : ""}"${corrente ? ' aria-current="step"' : ""}>
            <span class="ordine__passo-segno" aria-hidden="true">${fatto ? "●" : "○"}</span>
            <span class="ordine__passo-nome">${esc(passo.nome)}</span>
            ${corrente ? '<span class="visually-hidden">(fase attuale)</span>' : ""}
          </li>`;
        }).join("\n        ")}
      </ol>`;
}

function righeOrdine(righe) {
  return righe.map((r) => `<li class="ordine__riga">
          <div>
            <p class="ordine__riga-nome">${esc(r.nome_prodotto)}${r.nome_variante && r.nome_variante !== "Unica" ? ` — ${esc(r.nome_variante)}` : ""}</p>
            ${r.personalizzazione ? `<p class="ordine__riga-nota">Personalizzazione: ${esc(r.personalizzazione)}</p>` : ""}
            ${r.personalizzato ? '<p class="ordine__riga-avvertenza">Pezzo su misura: non restituibile.</p>' : ""}
          </div>
          <p class="ordine__riga-quantita">&times;${esc(String(r.quantita))}</p>
          <p class="ordine__riga-prezzo">${esc(euro(r.totale_cent))}</p>
        </li>`).join("\n        ");
}

/**
 * Garantisce: nessun dato mostrato senza escape, stato sempre comprensibile
 * anche quando non è uno dei passi del percorso, pagina valida anche con
 * `ordine` nullo (caso "non trovato", che il router usa apposta).
 */
export function paginaOrdine(ctx, dati) {
  const c = ctx || {};
  const config = c.config || {};
  const d = dati || {};
  const ordine = d.ordine || null;
  const righe = Array.isArray(d.righe) ? d.righe : [];
  const eventi = Array.isArray(d.eventi) ? d.eventi : [];
  const sito = String(config.sito || "https://ellebi.it").replace(/\/$/, "");

  if (!ordine) {
    const corpoVuoto = `<main id="main">
  <section class="section ordine" aria-labelledby="ordine-titolo">
    <div class="wrap wrap--narrow">
      <h1 class="title" id="ordine-titolo">Ordine non trovato</h1>
      <p class="lead">Il collegamento non è valido o è scaduto. Il modo più sicuro per arrivare qui
      è il pulsante nell'e-mail di conferma che ti ho mandato.</p>
      <p>Se non la trovi, scrivimi su
      <a class="link-line" href="${esc(config.instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>
      con il numero dell'ordine: te lo rimando.</p>
      <p><a class="btn" href="/negozio">Torna al negozio</a></p>
    </div>
  </section>
</main>`;
    return paginaCompleta({
      titolo: "Ordine non trovato",
      descrizione: "",
      canonical: null,
      noindex: true,
      corpo: corpoVuoto,
      cssExtra: [], jsExtra: [], jsonLd: null, ctx: c,
    });
  }

  const messaggio = MESSAGGI[ordine.stato]
    ? `<p class="ordine__messaggio" role="status">${esc(MESSAGGI[ordine.stato])}</p>`
    : "";

  const mostraBarra = !["in_attesa_pagamento", "annullato", "rimborsato"].includes(ordine.stato);

  const tracciatura = ordine.tracciatura
    ? `<p class="ordine__tracciatura"><strong>Spedizione</strong><br>
         ${esc(ordine.corriere || "Corriere")} — codice <strong>${esc(ordine.tracciatura)}</strong></p>`
    : "";

  const corpo = `<main id="main">
  <section class="section ordine" aria-labelledby="ordine-titolo">
    <div class="wrap wrap--narrow">
      <p class="eyebrow">Ordine ${esc(ordine.numero)}</p>
      <h1 class="title" id="ordine-titolo">Grazie, ${esc(ordine.nome)}</h1>
      <p class="lead">Ricevuto il ${esc(dataOra(ordine.creato_il))}.</p>

      ${messaggio}
      ${mostraBarra ? barra(ordine.stato) : ""}
      ${tracciatura}

      <h2 class="ordine__sottotitolo">Cosa hai ordinato</h2>
      <ul class="ordine__righe" role="list">
        ${righeOrdine(righe)}
      </ul>

      <dl class="ordine__conti">
        <div><dt>Subtotale</dt><dd>${esc(euro(ordine.subtotale_cent))}</dd></div>
        <div><dt>Spedizione</dt><dd>${ordine.spedizione_cent === 0 ? "offerta" : esc(euro(ordine.spedizione_cent))}</dd></div>
        ${ordine.supplemento_cent > 0 ? `<div><dt>Supplemento contrassegno</dt><dd>${esc(euro(ordine.supplemento_cent))}</dd></div>` : ""}
        <div class="ordine__conti-totale"><dt>Totale</dt><dd>${esc(euro(ordine.totale_cent))}</dd></div>
      </dl>
      <p class="ordine__iva">Di cui IVA ${esc(String(ordine.aliquota_iva))}%: ${esc(euro(ordine.iva_cent))}.
        Pagamento: ${esc(ordine.metodo_pagamento === "contrassegno" ? "contrassegno alla consegna" : "PayPal")}.</p>

      <h2 class="ordine__sottotitolo">Dove te lo mando</h2>
      <address class="ordine__indirizzo">
        ${esc(ordine.nome)} ${esc(ordine.cognome)}<br>
        ${esc(ordine.via)} ${esc(ordine.civico)}<br>
        ${esc(ordine.cap)} ${esc(ordine.citta)} (${esc(ordine.provincia)})<br>
        ${esc(ordine.telefono)}
      </address>
      ${ordine.note ? `<p class="ordine__note">Note: ${esc(ordine.note)}</p>` : ""}

      ${eventi.length ? `<h2 class="ordine__sottotitolo">Cosa è successo finora</h2>
      <ol class="ordine__storia" role="list">
        ${eventi.map((e) => `<li><time datetime="${esc(e.creato_il)}">${esc(dataOra(e.creato_il))}</time> — ${esc(e.nota || e.stato)}</li>`).join("\n        ")}
      </ol>` : ""}

      <p class="ordine__aiuto">Qualcosa non torna? Scrivimi su
        <a class="link-line" href="${esc(config.instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>
        o a <a class="link-line" href="mailto:${esc(config.email)}">${esc(config.email)}</a>,
        citando il numero <strong>${esc(ordine.numero)}</strong>.
        Le condizioni di reso sono su <a class="link-line" href="/resi">questa pagina</a>.</p>
    </div>
  </section>
</main>`;

  return paginaCompleta({
    titolo: `Ordine ${ordine.numero}`,
    descrizione: "",
    canonical: null,
    noindex: true,
    corpo,
    cssExtra: [], jsExtra: [], jsonLd: null, ctx: c,
  });
}
