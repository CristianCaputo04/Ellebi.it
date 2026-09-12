/* =========================================================================
   EmmeLù — pagina di pagamento

   Tre cose da sapere prima di modificarla.

   1. È l'UNICA pagina del sito che carica uno script di terze parti (l'SDK di
      PayPal). Lo carica qui e non altrove perché PayPal vede l'indirizzo IP di
      chi apre la pagina, e non c'è motivo di dargli quello di chi sta solo
      guardando le foto. La CSP corrispondente è allargata solo su questa rotta.

   2. Il modulo è un <form> vero, con campi veri ed etichette vere. Il
      JavaScript aggiunge comodità — il calcolo del totale in tempo reale, i
      pulsanti PayPal — ma la marcatura di base è quella che un browser sa già
      gestire da solo: autocompletamento, tastiere giuste sul telefono,
      navigazione da tastiera.

   3. I totali mostrati qui arrivano SEMPRE da /api/preventivo. Nessun numero
      su questa pagina è calcolato dal browser.
   ========================================================================= */

import { esc, euro } from "../util.js";
import { paginaCompleta } from "./layout.js";

/* Campi dell'indirizzo, dichiarati una volta sola: nome del campo, etichetta,
   attributo autocomplete, tipo, e se è obbligatorio. Tenerli in una tabella
   invece che ripetere quindici volte lo stesso markup evita che uno dei
   quindici finisca senza `autocomplete` o senza `<label>` collegata. */
const CAMPI = [
  { nome: "nome", etichetta: "Nome", completa: "given-name", tipo: "text", larghezza: "meta" },
  { nome: "cognome", etichetta: "Cognome", completa: "family-name", tipo: "text", larghezza: "meta" },
  { nome: "email", etichetta: "E-mail", completa: "email", tipo: "email", aiuto: "Ci mando la conferma e gli aggiornamenti sulla spedizione." },
  { nome: "telefono", etichetta: "Telefono", completa: "tel", tipo: "tel", modo: "tel", aiuto: "Serve al corriere per avvisarti della consegna." },
  { nome: "via", etichetta: "Indirizzo", completa: "address-line1", tipo: "text" },
  { nome: "civico", etichetta: "Numero civico", completa: "address-line2", tipo: "text", larghezza: "corto" },
  { nome: "cap", etichetta: "CAP", completa: "postal-code", tipo: "text", modo: "numeric", lunghezza: 5, larghezza: "corto" },
  { nome: "citta", etichetta: "Città", completa: "address-level2", tipo: "text" },
];

function campo(c) {
  const id = `campo-${c.nome}`;
  const classe = c.larghezza ? ` modulo__campo--${c.larghezza}` : "";
  const aiuto = c.aiuto ? `<p class="modulo__aiuto" id="${id}-aiuto">${esc(c.aiuto)}</p>` : "";
  const descritto = c.aiuto ? ` aria-describedby="${id}-aiuto ${id}-errore"` : ` aria-describedby="${id}-errore"`;

  return `<div class="modulo__campo${classe}">
        <label class="modulo__etichetta" for="${id}">${esc(c.etichetta)}</label>
        ${aiuto}
        <input class="modulo__input" id="${id}" name="${esc(c.nome)}" type="${esc(c.tipo)}"
               autocomplete="${esc(c.completa)}"${c.modo ? ` inputmode="${esc(c.modo)}"` : ""}${c.lunghezza ? ` maxlength="${c.lunghezza}"` : ""}
               required${descritto}>
        <p class="modulo__errore" id="${id}-errore" data-errore-per="${esc(c.nome)}" role="alert" hidden></p>
      </div>`;
}

function selettoreProvincia(province) {
  const voci = (Array.isArray(province) ? province : [])
    .map((p) => `<option value="${esc(p)}">${esc(p)}</option>`)
    .join("");
  return `<div class="modulo__campo modulo__campo--corto">
        <label class="modulo__etichetta" for="campo-provincia">Provincia</label>
        <select class="modulo__input" id="campo-provincia" name="provincia" autocomplete="address-level1"
                required aria-describedby="campo-provincia-errore">
          <option value="">—</option>
          ${voci}
        </select>
        <p class="modulo__errore" id="campo-provincia-errore" data-errore-per="provincia" role="alert" hidden></p>
      </div>`;
}

/**
 * Garantisce: modulo accessibile e completo, entrambi i metodi di pagamento
 * presenti con le loro condizioni, presa visione obbligatoria e non
 * pre-spuntata. NON garantisce che il pagamento sia possibile: se PayPal non
 * è configurato il metodo viene mostrato disattivato, non nascosto, perché
 * sparire senza spiegazione confonde più di un messaggio.
 */
export function paginaCheckout(ctx, dati) {
  const c = ctx || {};
  const config = c.config || {};
  const d = dati || {};
  const sito = String(config.sito || "https://ellebi.it").replace(/\/$/, "");
  const clientId = String(d.paypalClientId || "");
  const paypalPronto = clientId !== "";

  const supplemento = Number(config.supplementoContrassegnoCent) || 0;
  const limite = Number(config.limiteContrassegnoCent) || 0;

  const corpo = `<main id="main">
  <section class="section checkout" aria-labelledby="checkout-titolo">
    <div class="wrap">
      <p class="eyebrow">Ultimo passo</p>
      <h1 class="title" id="checkout-titolo">Dove te lo mando</h1>

      <noscript>
        <p class="carrello__avviso" role="note">
          Per completare l'ordine qui serve JavaScript. Se preferisci non attivarlo,
          scrivimi su <a class="link-line" href="${esc(config.instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>:
          concludiamo insieme in messaggio.
        </p>
      </noscript>

      <form class="checkout__modulo" id="modulo-ordine" method="post" action="/api/ordine" novalidate>
        <div class="checkout__colonne">

          <div class="checkout__principale">
            <fieldset class="modulo__gruppo">
              <legend class="modulo__legenda">I tuoi dati</legend>
              <div class="modulo__griglia">
                ${CAMPI.map(campo).join("\n                ")}
                ${selettoreProvincia(d.province)}
              </div>
              <div class="modulo__campo">
                <label class="modulo__etichetta" for="campo-note">Note per la consegna <span class="modulo__facoltativo">(facoltativo)</span></label>
                <textarea class="modulo__input" id="campo-note" name="note" rows="2" maxlength="500"
                          autocomplete="off" placeholder="Citofono, orari, indicazioni per il corriere"></textarea>
              </div>
            </fieldset>

            <fieldset class="modulo__gruppo">
              <legend class="modulo__legenda">Come paghi</legend>

              <label class="pagamento ${paypalPronto ? "" : "pagamento--spento"}">
                <input type="radio" name="metodo" value="paypal" ${paypalPronto ? "checked" : "disabled"} data-metodo>
                <span class="pagamento__corpo">
                  <span class="pagamento__nome">PayPal</span>
                  <span class="pagamento__nota">${paypalPronto
                    ? "Carta di credito, debito o saldo PayPal. Non serve avere un conto PayPal."
                    : "Non disponibile in questo momento."}</span>
                </span>
              </label>

              <label class="pagamento" data-contrassegno>
                <input type="radio" name="metodo" value="contrassegno" ${paypalPronto ? "" : "checked"} data-metodo>
                <span class="pagamento__corpo">
                  <span class="pagamento__nome">Contrassegno</span>
                  <span class="pagamento__nota">Paghi in contanti al corriere alla consegna.
                    Supplemento ${esc(euro(supplemento))}. Non disponibile sopra ${esc(euro(limite))}.</span>
                </span>
              </label>

              <p class="pagamento__blocco" data-contrassegno-bloccato hidden role="status">
                Il contrassegno non è disponibile per questo importo: sopra ${esc(euro(limite))} si paga con PayPal.
              </p>
            </fieldset>

            <fieldset class="modulo__gruppo">
              <legend class="modulo__legenda">Prima di concludere</legend>
              <!-- Casella NON pre-spuntata, e obbligatoria: è la prova che
                   l'informativa è stata mostrata (art. 13 GDPR). Una casella
                   già segnata non dimostrerebbe niente. -->
              <label class="modulo__spunta">
                <input type="checkbox" name="consenso_privacy" value="1" required id="campo-consenso">
                <span>Ho letto l'<a class="link-line" href="/privacy" target="_blank" rel="noopener noreferrer">informativa privacy</a>
                e le <a class="link-line" href="/vendita" target="_blank" rel="noopener noreferrer">condizioni di vendita</a>.</span>
              </label>
              <p class="modulo__errore" data-errore-per="consenso_privacy" role="alert" hidden></p>

              <p class="checkout__recesso">
                Hai <strong>14 giorni</strong> per cambiare idea, tranne sui pezzi realizzati
                su misura per te, che per legge non sono restituibili.
                <a class="link-line" href="/resi" target="_blank" rel="noopener noreferrer">Come funziona</a>
              </p>
            </fieldset>
          </div>

          <aside class="checkout__riepilogo" aria-labelledby="riepilogo-titolo">
            <h2 class="checkout__riepilogo-titolo" id="riepilogo-titolo">Riepilogo</h2>
            <div id="checkout-riepilogo" data-riepilogo aria-live="polite" aria-busy="true">
              <p class="carrello__attesa">Calcolo il totale…</p>
            </div>

            <p class="checkout__errore" id="checkout-errore" data-errore-generale role="alert" hidden></p>

            <!-- Contenitore dei pulsanti PayPal: lo riempie l'SDK, che
                 negozio.js carica solo quando questa pagina è aperta e solo
                 se c'è una chiave pubblica. La chiave viaggia in un attributo
                 data- perché la CSP vieta gli script in linea. -->
            <div id="paypal-bottoni" data-paypal
                 ${paypalPronto ? `data-paypal-client-id="${esc(clientId)}"` : ""}
                 ${paypalPronto ? "" : "hidden"}></div>

            <!-- Invio per il contrassegno: un <button> vero dentro un <form>
                 vero, così funziona anche se l'SDK di PayPal non carica. -->
            <button class="btn btn--solid checkout__invia" type="submit" data-invia-contrassegno ${paypalPronto ? "hidden" : ""}>
              Concludi l'ordine
              <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
            </button>

            <p class="checkout__sicurezza">Spedizione in Italia. Prezzi IVA inclusa.
              I dati della carta non passano mai da questo sito.</p>
          </aside>
        </div>
      </form>
    </div>
  </section>
</main>`;

  /* L'SDK di PayPal NON passa da `jsExtra`: il layout aggiunge a ogni script
     una marca di versione `?v=…`, e l'indirizzo dell'SDK ha già i suoi
     parametri — ne uscirebbe un URL con due punti interrogativi, che PayPal
     rifiuta. Lo carica `negozio.js` leggendo la chiave dall'attributo
     data-paypal-client-id, e solo su questa pagina. */

  return paginaCompleta({
    titolo: "Pagamento",
    descrizione: "Concludi il tuo ordine EmmeLù.",
    canonical: `${sito}/checkout`,
    noindex: true,
    corpo,
    cssExtra: [],
    jsExtra: [],
    jsonLd: null,
    ctx: c,
  });
}
