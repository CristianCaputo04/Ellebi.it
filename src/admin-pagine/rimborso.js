// =========================================================================
// Blocco «Rimborso» del dettaglio ordine.
//
// Sta in un file suo perché è l'unica azione del pannello che sposta denaro
// all'indietro e non si annulla: PayPal, una volta inviato il rimborso, non
// lo revoca. Tenerlo separato dal resto della pagina rende difficile
// modificarlo per sbaglio mentre si tocca la tracciatura o lo storico.
//
// Due regole guidano il markup:
//
//  1. Niente script. La CSP blocca gli inline e `admin.js` non conosce questo
//     blocco: quindi il modulo deve essere completo e comprensibile con il
//     solo HTML. Il campo dell'importo NON si nasconde: sta in un <fieldset>
//     sempre visibile, etichettato «Importo — solo se parziale», e quando il
//     tipo scelto è «intero» è il server a ignorarlo. Un campo nascosto da
//     uno script che non gira è un campo che l'utente non trova mai; un campo
//     sempre visibile con un'etichetta onesta funziona in ogni caso.
//
//  2. L'importo è `type="text"` con `inputmode="decimal"`. Con `type="number"`
//     diversi browser in locale italiano rifiutano la virgola senza dire
//     perché, e chi scrive «45,50» resta bloccato davanti a un campo che
//     sembra funzionante. Il server normalizza virgola e punto.
// =========================================================================

import { esc, euro, dataOra } from "../util.js";
// I motivi si importano da dove il server li valida, invece di riscriverli
// qui. Erano due elenchi separati, e non combaciavano: il modulo inviava la
// frase leggibile ("Recesso entro 14 giorni") mentre eseguiRimborso accettava
// solo la chiave ("recesso"). Ogni singolo rimborso veniva rifiutato con
// "motivo non riconosciuto", e la causa era invisibile guardando o l'uno o
// l'altro file da solo. Un elenco solo non puo' piu' divergere.
import { MOTIVI } from "../rimborsi.js";

const METODI = { paypal: "PayPal", contrassegno: "Contrassegno" };

// Perché non si può rimborsare, spiegato con parole diverse per ogni caso:
// «non si può» senza motivo costringe chi legge a indovinare, e chi indovina
// sui soldi sbaglia. Ogni voce dice anche cosa fare al posto del rimborso.
const SPIEGAZIONI = {
  contrassegno:
    "L'incasso è avvenuto in contanti, nelle mani del corriere: qui dentro non c'è " +
    "nessun pagamento da stornare. Il rimborso si fa a mano, con un bonifico sull'IBAN " +
    "che il cliente deve comunicare. Una volta eseguito, registralo comunque qui portando " +
    "l'ordine allo stato «rimborsato»: altrimenti risulta incassato per sempre.",
  non_pagato:
    "Questo ordine non è mai stato incassato: non c'è nulla da restituire. " +
    "Se l'ordine va chiuso, lo stato giusto è «annullato», non «rimborsato».",
  gia_rimborsato:
    "L'intero importo è già rientrato al cliente. Non resta niente da rimborsare e " +
    "un secondo invio sarebbe una perdita secca.",
  paypal_non_configurato:
    "Mancano le chiavi PayPal in questo ambiente, quindi il pannello non può inviare " +
    "nessun rimborso. Il rimborso va eseguito a mano dalla console PayPal e poi " +
    "registrato qui cambiando lo stato dell'ordine.",
};

/**
 * La sezione «Rimborso» completa: cifre, modulo (o spiegazione del perché non
 * si può), regole di legge e storico.
 *
 * @param {object} opzioni
 * @param {object} opzioni.ordine
 * @param {Array}  opzioni.righe righe dell'ordine, servono solo per capire se
 *                 ce ne sono di personalizzate
 * @param {object} opzioni.rimborso stato del rimborso calcolato dal backend
 * @param {string} opzioni.gettone token anti-CSRF, già passato da esc()
 *
 * Garantisce: ogni valore interpolato passa da esc(); gli importi passano da
 * euro(); nessuno <script> e nessun attributo di evento; il modulo compare
 * solo se `rimborso.possibile` è vero; la casella di conferma è `required`
 * nel markup, quindi la protezione regge anche senza JavaScript.
 * Non garantisce: che l'importo digitato sia davvero rimborsabile — quel
 * controllo resta al backend, qui si mostra solo il tetto.
 */
export function sezioneRimborsoHtml({ ordine = {}, righe = [], rimborso = null, gettone = "" } = {}) {
  // Se il backend non ha passato nulla la sezione non si inventa uno stato:
  // meglio non mostrare niente che mostrare cifre non verificate.
  if (!rimborso || typeof rimborso !== "object") return "";

  const possibile = rimborso.possibile === true;
  const numero = encodeURIComponent(ordine.numero || "");

  const corpo =
    cifreHtml(ordine, rimborso) +
    (possibile
      ? moduloHtml(numero, rimborso, gettone) + regoleHtml(righe)
      : impossibileHtml(rimborso)) +
    storicoHtml(rimborso.storico);

  return (
    `<section class="scheda scheda--denaro" aria-labelledby="tit-rimborso">` +
    `<h2 class="scheda__titolo" id="tit-rimborso">Rimborso</h2>` +
    corpo +
    `</section>`
  );
}

/* ------------------------------------------------------------ le cifre */

// Si mostrano sempre, anche quando il rimborso non è possibile: sapere quanto
// è entrato e quanto è già uscito serve pure a chi il bonifico lo farà a mano.
function cifreHtml(ordine, rimborso) {
  const metodo = esc(METODI[ordine.metodo_pagamento] || ordine.metodo_pagamento || "—");
  const giaRimborsato = Number(rimborso.gia_rimborsato_cent || 0);

  const voci =
    `<div class="totali__voce"><dt>Incassato (${metodo})</dt>` +
    `<dd class="numerico">${esc(euro(ordine.totale_cent))}</dd></div>` +
    (giaRimborsato > 0
      ? `<div class="totali__voce"><dt>Già rimborsato</dt>` +
        `<dd class="numerico">− ${esc(euro(giaRimborsato))}</dd></div>`
      : "") +
    `<div class="totali__voce totali__voce--forte"><dt>Ancora rimborsabile</dt>` +
    `<dd class="numerico">${esc(euro(rimborso.rimborsabile_cent))}</dd></div>`;

  return `<dl class="totali totali--rimborso">${voci}</dl>`;
}

/* -------------------------------------------------- rimborso impossibile */

function impossibileHtml(rimborso) {
  const chiave = String(rimborso.motivo_non_possibile || "");
  const testo =
    SPIEGAZIONI[chiave] ||
    "Da qui non è possibile inviare un rimborso. Il motivo non è fra quelli previsti: " +
      "controlla il pagamento prima di procedere in altro modo.";

  return (
    `<p class="avviso avviso--vetrina rimborso__perche" role="status">` +
    `<strong>Niente rimborso da questa pagina.</strong> ${esc(testo)}` +
    `</p>`
  );
}

/* ---------------------------------------------------------- il modulo */

function moduloHtml(numero, rimborso, gettone) {
  const massimo = esc(euro(rimborso.rimborsabile_cent));

  // Si invia la CHIAVE, si mostra la frase: è la chiave che il server valida,
  // ed è la frase che la titolare legge scegliendo.
  const opzioniMotivo = Object.entries(MOTIVI)
    .map(([chiave, frase]) => `<option value="${esc(chiave)}">${esc(frase)}</option>`)
    .join("");

  return (
    `<form method="post" action="/admin/ordine/${numero}/rimborso" class="rimborso__modulo" ` +
    // admin.js chiede conferma a chi ha JavaScript. È un secondo strato: la
    // protezione vera è la casella `required` qui sotto.
    `data-conferma="Il rimborso viene inviato a PayPal e non si annulla. Procedere?">` +
    `<input type="hidden" name="csrf" value="${gettone}">` +

    `<fieldset class="riquadro">` +
    `<legend class="riquadro__titolo">Quanto rimborsare</legend>` +
    `<p class="campo campo--scelta">` +
    `<input type="radio" id="rimborso-intero" name="tipo" value="intero" checked required>` +
    `<label for="rimborso-intero">Rimborso intero — ${massimo}</label></p>` +
    `<p class="campo campo--scelta">` +
    `<input type="radio" id="rimborso-parziale" name="tipo" value="parziale" required>` +
    `<label for="rimborso-parziale">Rimborso parziale</label></p>` +
    `</fieldset>` +

    // Il campo resta visibile sempre. L'etichetta dice da sola quando conta,
    // così non serve nessuno script per renderlo comprensibile.
    `<fieldset class="riquadro">` +
    `<legend class="riquadro__titolo">Importo — solo se parziale</legend>` +
    `<p class="campo">` +
    `<label class="campo__etichetta" for="rimborso-importo">Importo in euro</label>` +
    `<input class="campo__valore campo__valore--numero" type="text" inputmode="decimal" ` +
    `id="rimborso-importo" name="importo_euro" maxlength="12" autocomplete="off" ` +
    `placeholder="45,50" aria-describedby="aiuto-importo">` +
    `</p>` +
    `<p class="nota" id="aiuto-importo">Virgola o punto, come preferisci: «45,50» e «45.50» ` +
    `valgono uguale. Se scegli il rimborso intero questo campo viene ignorato. ` +
    `Non può superare ${massimo}.</p>` +
    `</fieldset>` +

    `<p class="campo"><label class="campo__etichetta" for="rimborso-motivo">Motivo</label>` +
    `<select class="campo__valore" id="rimborso-motivo" name="motivo" required>${opzioniMotivo}</select></p>` +

    // name="nota" e non "motivo_dettaglio": è il nome che la rotta legge, e
    // che finisce nel registro dei rimborsi. Con il nome sbagliato il campo
    // si compilava e il testo spariva senza un errore.
    `<p class="campo"><label class="campo__etichetta" for="rimborso-dettaglio">Dettaglio (facoltativo)</label>` +
    `<input class="campo__valore" type="text" id="rimborso-dettaglio" name="nota" ` +
    `maxlength="200" placeholder="Che cosa è successo, in due parole"></p>` +

    `<p class="campo campo--casella">` +
    `<input type="checkbox" id="rimborso-conferma" name="conferma" value="si" required>` +
    `<label for="rimborso-conferma">Confermo: il rimborso parte subito e non si annulla</label></p>` +

    `<p class="azioni"><button type="submit" class="bottone bottone--pericolo bottone--irreversibile">` +
    `Invia il rimborso</button></p>` +
    `</form>`
  );
}

/* ------------------------------------------------------- regole di legge */

// Le stesse regole scritte al cliente in resi.html e in vendita.html. Stanno
// qui perché il momento in cui servono è questo, non quello in cui si legge
// la pagina pubblica.
function regoleHtml(righe) {
  const lista = Array.isArray(righe) ? righe : [];
  const personalizzate = lista.filter((riga) => Number(riga && riga.personalizzato) === 1);
  const tutte = lista.length > 0 && personalizzate.length === lista.length;

  let avvisoPers = "";
  if (tutte) {
    avvisoPers =
      `<p class="avviso avviso--grave rimborso__personalizzati" role="status">` +
      `<strong>Tutte le righe di questo ordine sono personalizzate.</strong> ` +
      `Sui pezzi fatti su misura il diritto di recesso non esiste (art. 59, comma 1, ` +
      `lettera c del Codice del Consumo): per un semplice ripensamento il rimborso ` +
      `<em>non è dovuto</em>. Resta dovuto se il pezzo è difettoso o non conforme, ` +
      `e lì la garanzia vale due anni come su tutto il resto.` +
      `</p>`;
  } else if (personalizzate.length > 0) {
    const elenco = personalizzate
      .map((riga) => `<li>${esc(riga.nome_prodotto || riga.sku || "riga senza nome")}</li>`)
      .join("");
    avvisoPers =
      `<div class="avviso avviso--grave rimborso__personalizzati" role="status">` +
      `<p><strong>${esc(String(personalizzate.length))} riga/e di questo ordine sono ` +
      `personalizzate</strong> e non danno diritto al recesso (art. 59, comma 1, lettera c ` +
      `del Codice del Consumo). Per un ripensamento il rimborso va calcolato ` +
      `<em>senza</em> queste righe; per un difetto di conformità invece è dovuto anche su ` +
      `di esse.</p>` +
      `<ul class="rimborso__elenco-pers" role="list">${elenco}</ul>` +
      `</div>`;
  }

  return (
    avvisoPers +
    `<div class="rimborso__regole">` +
    `<p class="rimborso__regole-titolo">Prima di premere, le regole vere</p>` +
    `<ul role="list">` +
    `<li>Il rimborso va eseguito <strong>entro 14 giorni</strong> dalla dichiarazione di ` +
    `recesso, con lo stesso mezzo con cui il cliente ha pagato.</li>` +
    `<li>Puoi <strong>trattenerlo</strong> finché il pezzo non rientra o finché non arriva ` +
    `la prova che è stato spedito (art. 56, comma 3): i 14 giorni non ti obbligano a pagare ` +
    `alla cieca.</li>` +
    `<li>Se il reso riguarda l'<strong>intero ordine</strong>, nel rimborso rientrano anche ` +
    `la spedizione pagata all'ordine e il supplemento del contrassegno. Mai le spese che il ` +
    `cliente ha sostenuto per rispedire.</li>` +
    `<li>Un pezzo tornato usato, lavato o danneggiato ammette un <strong>rimborso ridotto</strong> ` +
    `in proporzione: usa il parziale e scrivi nel dettaglio come l'hai calcolato.</li>` +
    `<li>I <strong>pezzi personalizzati</strong> non danno diritto al recesso. Restano coperti ` +
    `dalla garanzia di conformità, due anni dalla consegna.</li>` +
    `</ul></div>`
  );
}

/* ------------------------------------------------------------- storico */

function storicoHtml(storico) {
  const voci = Array.isArray(storico) ? storico : [];
  if (!voci.length) return "";

  const righe = voci
    .map(
      (voce) =>
        `<tr class="tabella__riga">` +
        `<td data-etichetta="Data">${esc(dataOra(voce.creato_il))}</td>` +
        `<td data-etichetta="Importo" class="numerico">${esc(euro(voce.importo_cent))}</td>` +
        `<td data-etichetta="Motivo">${esc(voce.motivo || "—")}</td>` +
        `<td data-etichetta="Riferimento PayPal">` +
        (voce.riferimento ? `<code>${esc(voce.riferimento)}</code>` : "—") +
        `</td>` +
        `</tr>`
    )
    .join("");

  return (
    `<div class="rimborso__storico">` +
    `<h3 class="scheda__sottotitolo" id="tit-storico-rimborsi">Rimborsi già eseguiti</h3>` +
    `<div class="tabella-cornice">` +
    `<table class="tabella" aria-labelledby="tit-storico-rimborsi">` +
    `<thead><tr><th scope="col">Data</th><th scope="col">Importo</th>` +
    `<th scope="col">Motivo</th><th scope="col">Riferimento PayPal</th></tr></thead>` +
    `<tbody>${righe}</tbody>` +
    `</table></div></div>`
  );
}
