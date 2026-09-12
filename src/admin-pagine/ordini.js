// =========================================================================
// Elenco degli ordini.
//
// Il filtro per stato è fatto di link veri in GET: funziona senza
// JavaScript, si apre in una nuova scheda, si mette fra i preferiti. Vale
// anche per l'impaginazione. Su telefono ogni ordine è una scheda; da un
// certo punto in poi le stesse righe diventano una tabella. È lo stesso
// markup: una tabella con i ruoli ARIA dichiarati a mano, perché quando il
// CSS cambia il `display` delle celle il browser perde la semantica di
// tabella e va restituita esplicitamente.
// =========================================================================

import { esc, euro, dataOra } from "../util.js";
import { paginaAdmin, marcaStato, ETICHETTE_STATO } from "./layout.js";

// L'ordine in cui i filtri compaiono: è il percorso di un ordine nella vita
// reale, non l'alfabeto.
const ORDINE_FILTRI = [
  "tutti",
  "in_attesa_pagamento",
  "pagato",
  "confermato",
  "in_lavorazione",
  "spedito",
  "consegnato",
  "annullato",
  "rimborsato",
];

const METODI = { paypal: "PayPal", contrassegno: "Contrassegno" };

/**
 * @param {object} ctx
 * @param {object} opzioni
 * @param {Array}  opzioni.ordini
 * @param {string} opzioni.filtro stato selezionato ("tutti" se nessuno)
 * @param {object} opzioni.conteggi conteggio per stato, più `tutti`
 * @param {string} opzioni.csrf
 * @param {number} opzioni.pagina pagina corrente, da 1
 * @param {boolean|number} opzioni.altrePagine true/numero totale di pagine
 *
 * Garantisce: ogni valore che viene dal database passa da esc(); i filtri e
 * l'impaginazione sono link GET funzionanti senza JavaScript; lo stato è
 * distinguibile anche in bianco e nero.
 * Non garantisce: che `conteggi` sia completo — gli stati mancanti valgono 0.
 */
export function paginaOrdini(ctx, { ordini = [], filtro = "tutti", conteggi = {}, csrf = "", pagina = 1, altrePagine = false } = {}) {
  const filtroAttivo = filtro || "tutti";
  const paginaCorrente = Math.max(1, Number(pagina) || 1);

  const corpo =
    filtriHtml(filtroAttivo, conteggi) +
    (ordini.length ? tabellaHtml(ordini) : vuotoHtml(filtroAttivo)) +
    impaginazioneHtml(filtroAttivo, paginaCorrente, altrePagine) +
    esportazioneHtml();

  return paginaAdmin({
    titolo: "Ordini",
    corpo,
    ctx,
    vocaleAttiva: "ordini",
    csrf,
  });
}

function filtriHtml(filtroAttivo, conteggi) {
  const voci = ORDINE_FILTRI.map((stato) => {
    const quanti = Number(conteggi[stato] || 0);
    const href = stato === "tutti" ? "/admin/ordini" : `/admin/ordini?stato=${encodeURIComponent(stato)}`;
    const attivo = stato === filtroAttivo;
    return (
      `<li><a class="filtro${attivo ? " filtro--attivo" : ""}" href="${esc(href)}"` +
      (attivo ? ` aria-current="page"` : "") +
      `>${esc(ETICHETTE_STATO[stato] || stato)} ` +
      `<span class="filtro__conteggio">${esc(String(quanti))}</span></a></li>`
    );
  }).join("");

  return `<nav class="filtri" aria-label="Filtra per stato"><ul class="filtri__lista" role="list">${voci}</ul></nav>`;
}

function tabellaHtml(ordini) {
  const righe = ordini.map(rigaHtml).join("");
  return (
    `<div class="tabella-cornice">` +
    `<table class="tabella" role="table">` +
    `<caption class="visuale-nascosta">Elenco degli ordini</caption>` +
    `<thead role="rowgroup"><tr role="row">` +
    `<th role="columnheader" scope="col">Numero</th>` +
    `<th role="columnheader" scope="col">Data</th>` +
    `<th role="columnheader" scope="col">Cliente</th>` +
    `<th role="columnheader" scope="col">Totale</th>` +
    `<th role="columnheader" scope="col">Metodo</th>` +
    `<th role="columnheader" scope="col">Stato</th>` +
    `<th role="columnheader" scope="col"><span class="visuale-nascosta">Azioni</span></th>` +
    `</tr></thead>` +
    `<tbody role="rowgroup">${righe}</tbody>` +
    `</table></div>`
  );
}

function rigaHtml(ordine) {
  const numero = esc(ordine.numero || "");
  const cliente = nomeCliente(ordine);
  const metodo = METODI[ordine.metodo_pagamento] || ordine.metodo_pagamento || "—";

  return (
    `<tr class="tabella__riga" role="row">` +
    `<td role="cell" data-etichetta="Numero"><a class="collegamento-forte" href="/admin/ordine/${encodeURIComponent(ordine.numero || "")}">${numero}</a></td>` +
    `<td role="cell" data-etichetta="Data">${esc(dataOra(ordine.creato_il))}</td>` +
    `<td role="cell" data-etichetta="Cliente">${cliente}</td>` +
    `<td role="cell" data-etichetta="Totale" class="numerico">${esc(euro(ordine.totale_cent))}</td>` +
    `<td role="cell" data-etichetta="Metodo">${esc(metodo)}</td>` +
    `<td role="cell" data-etichetta="Stato">${marcaStato(ordine.stato)}</td>` +
    `<td role="cell" class="tabella__azione">` +
    `<a class="bottone bottone--muto" href="/admin/ordine/${encodeURIComponent(ordine.numero || "")}">Apri` +
    `<span class="visuale-nascosta"> l'ordine ${numero}</span></a></td>` +
    `</tr>`
  );
}

// Un ordine anonimizzato non ha più un nome: dirlo è più onesto che mostrare
// il segnaposto che il backend ha scritto al posto del cliente.
function nomeCliente(ordine) {
  if (ordine.anonimizzato_il) {
    return `<span class="sbiadito">dati rimossi</span>`;
  }
  const intero = `${ordine.nome || ""} ${ordine.cognome || ""}`.trim();
  return esc(intero || "—");
}

function vuotoHtml(filtroAttivo) {
  const coda =
    filtroAttivo === "tutti"
      ? "Non è ancora arrivato nessun ordine."
      : `Nessun ordine nello stato “${esc(ETICHETTE_STATO[filtroAttivo] || filtroAttivo)}”.`;
  return `<p class="vuoto">${coda}</p>`;
}

function impaginazioneHtml(filtroAttivo, pagina, altrePagine) {
  // `altrePagine` arriva come booleano ("ce n'è almeno un'altra") oppure come
  // numero totale di pagine: si accettano entrambe le forme perché scoprirlo
  // a pannello rotto sarebbe il momento peggiore.
  const totale = typeof altrePagine === "number" ? altrePagine : null;
  const c1 = totale !== null ? pagina < totale : Boolean(altrePagine);
  const indietro = pagina > 1;
  if (!indietro && !c1) return "";

  const base = filtroAttivo === "tutti" ? "/admin/ordini?" : `/admin/ordini?stato=${encodeURIComponent(filtroAttivo)}&`;
  const prec = indietro
    ? `<a class="bottone bottone--muto" rel="prev" href="${esc(base)}pagina=${pagina - 1}">← Precedenti</a>`
    : `<span class="bottone bottone--spento" aria-hidden="true">← Precedenti</span>`;
  const succ = c1
    ? `<a class="bottone bottone--muto" rel="next" href="${esc(base)}pagina=${pagina + 1}">Successivi →</a>`
    : `<span class="bottone bottone--spento" aria-hidden="true">Successivi →</span>`;
  const quante = totale !== null ? ` di ${esc(String(totale))}` : "";

  return (
    `<nav class="impaginazione" aria-label="Pagine dell'elenco">` +
    prec +
    `<span class="impaginazione__posizione">Pagina ${esc(String(pagina))}${quante}</span>` +
    succ +
    `</nav>`
  );
}

// L'esportazione è una GET: il commercialista riceve un file, non fa nulla
// che cambi lo stato del negozio, e il link resta ripetibile.
function esportazioneHtml() {
  return (
    `<section class="scheda esportazione" aria-labelledby="tit-export">` +
    `<h2 class="scheda__titolo" id="tit-export">Esporta per il commercialista</h2>` +
    `<form class="esportazione__modulo" method="get" action="/admin/esporta.csv">` +
    `<p class="campo"><label class="campo__etichetta" for="export-da">Dal giorno</label>` +
    `<input class="campo__valore" type="date" id="export-da" name="da" required></p>` +
    `<p class="campo"><label class="campo__etichetta" for="export-a">Al giorno</label>` +
    `<input class="campo__valore" type="date" id="export-a" name="a" required></p>` +
    `<p class="azioni"><button type="submit" class="bottone bottone--primario">Scarica CSV</button></p>` +
    `</form>` +
    `</section>`
  );
}
