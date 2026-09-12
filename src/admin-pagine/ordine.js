// =========================================================================
// Dettaglio di un ordine.
//
// Questa è la pagina che si apre con il pezzo in mano. L'ordine di lettura
// segue l'ordine del lavoro: cosa devo fare (righe e personalizzazione),
// dove va (indirizzo), quanto ha pagato e come (totali e PayPal), cosa è
// successo finora (eventi), cosa posso fare adesso (azioni).
//
// La personalizzazione sta in evidenza perché è l'istruzione di lavorazione:
// se passa inosservata, il pezzo esce sbagliato ed è già cucito.
// =========================================================================

import { esc, euro, dataOra } from "../util.js";
import { paginaAdmin, marcaStato, ETICHETTE_STATO } from "./layout.js";

const METODI = { paypal: "PayPal", contrassegno: "Contrassegno" };

const ORIGINI = {
  sistema: "Sistema",
  cliente: "Cliente",
  admin: "Pannello",
  paypal: "PayPal",
};

/**
 * @param {object} ctx
 * @param {object} opzioni
 * @param {object} opzioni.ordine
 * @param {Array}  opzioni.righe
 * @param {Array}  opzioni.eventi in ordine cronologico crescente
 * @param {string} opzioni.csrf
 * @param {Array<string>} opzioni.transizioniPossibili stati leciti da qui
 *
 * Garantisce: ogni testo scritto dal cliente (nome, note, personalizzazione)
 * passa da esc(); il menu del cambio stato contiene SOLO le transizioni
 * ricevute; l'anonimizzazione è un modulo separato, con casella di conferma
 * obbligatoria nel markup, e sparisce se l'ordine è già anonimizzato.
 * Non garantisce: che le transizioni ricevute siano davvero lecite — quella
 * verifica resta al backend, l'interfaccia si limita a non proporne altre.
 */
export function paginaOrdineAdmin(ctx, { ordine = {}, righe = [], eventi = [], csrf = "", transizioniPossibili = [] } = {}) {
  const gettone = esc(csrf || "");
  const numero = esc(ordine.numero || "—");
  const anonimizzato = Boolean(ordine.anonimizzato_il);

  const corpo =
    intestazioneHtml(ordine) +
    (anonimizzato ? bannerAnonimizzatoHtml(ordine) : "") +
    righeHtml(righe) +
    totaliHtml(ordine) +
    (anonimizzato ? "" : indirizzoHtml(ordine)) +
    pagamentoHtml(ordine) +
    azioniStatoHtml(ordine, transizioniPossibili, gettone) +
    tracciaturaHtml(ordine, gettone) +
    eventiHtml(eventi) +
    (anonimizzato ? "" : anonimizzazioneHtml(ordine, gettone));

  return paginaAdmin({
    titolo: `Ordine ${ordine.numero || ""}`.trim(),
    corpo: `<p class="torna"><a href="/admin/ordini">← Tutti gli ordini</a></p>` + corpo,
    ctx,
    vocaleAttiva: "ordini",
    csrf: gettone,
  });
}

function intestazioneHtml(ordine) {
  return (
    `<div class="testa-ordine">` +
    marcaStato(ordine.stato) +
    `<p class="testa-ordine__dati">` +
    `Ricevuto il ${esc(dataOra(ordine.creato_il))}` +
    (ordine.aggiornato_il ? ` · aggiornato il ${esc(dataOra(ordine.aggiornato_il))}` : "") +
    ` · ${esc(METODI[ordine.metodo_pagamento] || ordine.metodo_pagamento || "—")}` +
    `</p></div>`
  );
}

function bannerAnonimizzatoHtml(ordine) {
  return (
    `<p class="avviso avviso--grave" role="status">` +
    `<strong>Dati personali rimossi</strong> il ${esc(dataOra(ordine.anonimizzato_il))} ` +
    `su richiesta dell'interessato. Restano importi, data e numero per l'obbligo fiscale.` +
    `</p>`
  );
}

function righeHtml(righe) {
  if (!righe.length) {
    return (
      `<section class="scheda" aria-labelledby="tit-righe">` +
      `<h2 class="scheda__titolo" id="tit-righe">Articoli</h2>` +
      `<p class="vuoto">Questo ordine non ha righe. È un'anomalia: segnalarla prima di lavorarlo.</p>` +
      `</section>`
    );
  }

  const elenco = righe
    .map((riga) => {
      const variante = riga.nome_variante ? ` <span class="sbiadito">· ${esc(riga.nome_variante)}</span>` : "";
      const testoPers = String(riga.personalizzazione || "").trim();
      // Il riquadro compare se c'è del testo: un ordine marcato personalizzato
      // ma senza istruzioni è un caso da guardare, non da nascondere.
      const pers = testoPers
        ? `<div class="personalizzazione">` +
          `<p class="personalizzazione__titolo">Personalizzazione</p>` +
          `<p class="personalizzazione__testo">${esc(testoPers)}</p>` +
          `</div>`
        : Number(riga.personalizzato) === 1
        ? `<p class="personalizzazione personalizzazione--vuota">Riga marcata come personalizzata, ma senza testo.</p>`
        : "";

      return (
        `<li class="riga">` +
        `<div class="riga__testa">` +
        `<p class="riga__nome">${esc(riga.nome_prodotto || "")}${variante}</p>` +
        `<p class="riga__sku"><code>${esc(riga.sku || "")}</code></p>` +
        `</div>` +
        `<p class="riga__conti">` +
        `${esc(String(riga.quantita ?? 1))} × ${esc(euro(riga.prezzo_unitario_cent))} ` +
        `<strong class="numerico">${esc(euro(riga.totale_cent))}</strong></p>` +
        pers +
        `</li>`
      );
    })
    .join("");

  return (
    `<section class="scheda" aria-labelledby="tit-righe">` +
    `<h2 class="scheda__titolo" id="tit-righe">Articoli</h2>` +
    `<ul class="righe" role="list">${elenco}</ul>` +
    `</section>`
  );
}

function totaliHtml(ordine) {
  const voci = [
    ["Subtotale", ordine.subtotale_cent],
    ["Spedizione", ordine.spedizione_cent],
  ];
  if (Number(ordine.supplemento_cent) > 0) {
    voci.push(["Supplemento contrassegno", ordine.supplemento_cent]);
  }

  const elenco = voci
    .map(([nome, cent]) => `<div class="totali__voce"><dt>${esc(nome)}</dt><dd class="numerico">${esc(euro(cent))}</dd></div>`)
    .join("");

  return (
    `<section class="scheda" aria-labelledby="tit-totali">` +
    `<h2 class="scheda__titolo" id="tit-totali">Totali</h2>` +
    `<dl class="totali">` +
    elenco +
    `<div class="totali__voce totali__voce--forte"><dt>Totale</dt>` +
    `<dd class="numerico">${esc(euro(ordine.totale_cent))}</dd></div>` +
    `<div class="totali__voce totali__voce--iva"><dt>di cui IVA 22%</dt>` +
    `<dd class="numerico">${esc(euro(ordine.iva_cent))}</dd></div>` +
    `</dl></section>`
  );
}

// L'indirizzo è in un blocco unico e copiabile: si incolla nell'etichetta del
// corriere senza ricomporlo a mano, che è il punto in cui si sbaglia il CAP.
function indirizzoHtml(ordine) {
  const destinatario = `${ordine.nome || ""} ${ordine.cognome || ""}`.trim();
  const testo = [
    destinatario,
    `${ordine.via || ""} ${ordine.civico || ""}`.trim(),
    `${ordine.cap || ""} ${ordine.citta || ""} ${ordine.provincia ? "(" + ordine.provincia + ")" : ""}`.trim(),
    ordine.telefono || "",
  ]
    .filter(Boolean)
    .join("\n");

  const note = String(ordine.note || "").trim();

  return (
    `<section class="scheda" aria-labelledby="tit-indirizzo">` +
    `<h2 class="scheda__titolo" id="tit-indirizzo">Spedizione</h2>` +
    `<pre class="indirizzo" id="indirizzo-spedizione">${esc(testo)}</pre>` +
    // Senza JavaScript il pulsante non compare: admin.js lo accende leggendo
    // data-copia. Un pulsante che non fa niente è peggio di nessun pulsante.
    `<p class="azioni"><button type="button" class="bottone bottone--muto" hidden ` +
    `data-copia="indirizzo-spedizione">Copia indirizzo</button></p>` +
    `<dl class="dati">` +
    voceDato("E-mail", ordine.email ? `<a href="mailto:${esc(ordine.email)}">${esc(ordine.email)}</a>` : "—") +
    voceDato("Telefono", ordine.telefono ? `<a href="tel:${esc(String(ordine.telefono).replace(/\s+/g, ""))}">${esc(ordine.telefono)}</a>` : "—") +
    `</dl>` +
    (note ? `<div class="note-cliente"><p class="note-cliente__titolo">Note del cliente</p><p>${esc(note)}</p></div>` : "") +
    `</section>`
  );
}

function voceDato(nome, valoreHtml) {
  return `<div class="dati__voce"><dt>${esc(nome)}</dt><dd>${valoreHtml}</dd></div>`;
}

function pagamentoHtml(ordine) {
  if (!ordine.paypal_order_id && !ordine.paypal_capture_id) return "";
  return (
    `<section class="scheda" aria-labelledby="tit-paypal">` +
    `<h2 class="scheda__titolo" id="tit-paypal">Riferimenti PayPal</h2>` +
    `<dl class="dati">` +
    voceDato("Ordine PayPal", ordine.paypal_order_id ? `<code>${esc(ordine.paypal_order_id)}</code>` : "—") +
    voceDato("Incasso", ordine.paypal_capture_id ? `<code>${esc(ordine.paypal_capture_id)}</code>` : "—") +
    `</dl></section>`
  );
}

function azioniStatoHtml(ordine, transizioni, gettone) {
  if (!transizioni.length) {
    return (
      `<section class="scheda" aria-labelledby="tit-stato">` +
      `<h2 class="scheda__titolo" id="tit-stato">Stato</h2>` +
      `<p class="vuoto">Da qui non ci sono altri passaggi possibili.</p>` +
      `</section>`
    );
  }

  const opzioni = transizioni
    .map((stato) => `<option value="${esc(stato)}">${esc(ETICHETTE_STATO[stato] || stato)}</option>`)
    .join("");

  return (
    `<section class="scheda" aria-labelledby="tit-stato">` +
    `<h2 class="scheda__titolo" id="tit-stato">Cambia stato</h2>` +
    `<form method="post" action="/admin/ordine/${encodeURIComponent(ordine.numero || "")}/stato">` +
    `<input type="hidden" name="csrf" value="${gettone}">` +
    `<p class="campo"><label class="campo__etichetta" for="nuovo-stato">Nuovo stato</label>` +
    `<select class="campo__valore" id="nuovo-stato" name="stato" required>${opzioni}</select></p>` +
    `<p class="campo"><label class="campo__etichetta" for="nota-stato">Nota (facoltativa)</label>` +
    `<input class="campo__valore" type="text" id="nota-stato" name="nota" maxlength="500" ` +
    `placeholder="Perché, in due parole"></p>` +
    `<p class="azioni"><button type="submit" class="bottone bottone--primario">Aggiorna stato</button></p>` +
    `</form></section>`
  );
}

function tracciaturaHtml(ordine, gettone) {
  return (
    `<section class="scheda" aria-labelledby="tit-tracciatura">` +
    `<h2 class="scheda__titolo" id="tit-tracciatura">Tracciatura</h2>` +
    `<form method="post" action="/admin/ordine/${encodeURIComponent(ordine.numero || "")}/tracciatura">` +
    `<input type="hidden" name="csrf" value="${gettone}">` +
    `<p class="campo"><label class="campo__etichetta" for="corriere">Corriere</label>` +
    `<input class="campo__valore" type="text" id="corriere" name="corriere" maxlength="80" ` +
    `value="${esc(ordine.corriere || "")}"></p>` +
    `<p class="campo"><label class="campo__etichetta" for="tracciatura">Codice di spedizione</label>` +
    `<input class="campo__valore" type="text" id="tracciatura" name="tracciatura" maxlength="120" ` +
    `autocapitalize="characters" spellcheck="false" value="${esc(ordine.tracciatura || "")}"></p>` +
    `<p class="azioni"><button type="submit" class="bottone bottone--primario">Salva tracciatura</button></p>` +
    `</form></section>`
  );
}

function eventiHtml(eventi) {
  if (!eventi.length) {
    return (
      `<section class="scheda" aria-labelledby="tit-eventi">` +
      `<h2 class="scheda__titolo" id="tit-eventi">Storico</h2>` +
      `<p class="vuoto">Nessun evento registrato.</p></section>`
    );
  }

  const voci = eventi
    .map(
      (evento) =>
        `<li class="evento">` +
        `<p class="evento__quando">${esc(dataOra(evento.creato_il))} ` +
        `<span class="sbiadito">· ${esc(ORIGINI[evento.origine] || evento.origine || "—")}</span></p>` +
        `<p class="evento__stato">${marcaStato(evento.stato)}</p>` +
        (evento.nota ? `<p class="evento__nota">${esc(evento.nota)}</p>` : "") +
        `</li>`
    )
    .join("");

  return (
    `<section class="scheda" aria-labelledby="tit-eventi">` +
    `<h2 class="scheda__titolo" id="tit-eventi">Storico</h2>` +
    `<ol class="eventi" role="list">${voci}</ol></section>`
  );
}

// Blocco distruttivo, tenuto ultimo e visivamente separato dal resto.
// La casella "confermo" è obbligatoria nel markup: è quella la protezione
// vera, perché regge anche senza JavaScript. La finestra di conferma di
// admin.js è solo un secondo strato.
function anonimizzazioneHtml(ordine, gettone) {
  return (
    `<section class="scheda scheda--pericolo" aria-labelledby="tit-gdpr">` +
    `<h2 class="scheda__titolo" id="tit-gdpr">Cancellazione dei dati personali</h2>` +
    `<p class="scheda__spiega">Nome, indirizzo, e-mail e telefono vengono sovrascritti e non ` +
    `sono più recuperabili. L'ordine resta — numero, importi e data — perché la legge ` +
    `impone di conservarlo dieci anni. Si fa solo su richiesta dell'interessato.</p>` +
    `<form method="post" action="/admin/ordine/${encodeURIComponent(ordine.numero || "")}/anonimizza" ` +
    `data-conferma="I dati personali di questo ordine verranno cancellati per sempre. Procedere?">` +
    `<input type="hidden" name="csrf" value="${gettone}">` +
    `<p class="campo campo--casella">` +
    `<input type="checkbox" id="conferma-gdpr" name="conferma" value="si" required>` +
    `<label for="conferma-gdpr">Confermo la richiesta dell'interessato</label></p>` +
    `<p class="azioni"><button type="submit" class="bottone bottone--pericolo">Cancella i dati personali</button></p>` +
    `</form></section>`
  );
}
