/* =========================================================================
   EmmeLù — pagina del carrello

   La pagina esce dal server praticamente vuota, e la riempie `negozio.js`
   chiamando `/api/preventivo`. Non è pigrizia: è l'unico modo per non avere
   due verità sui prezzi. Il cookie del carrello contiene solo SKU e quantità,
   e i prezzi li conosce soltanto il database — se li rendessimo qui, una
   pagina rimasta aperta mezz'ora mostrerebbe un totale che il checkout poi
   smentisce.

   Senza JavaScript la pagina non può funzionare, e lo dice apertamente invece
   di mostrare un carrello vuoto che sembra un guasto.
   ========================================================================= */

import { esc } from "../util.js";
import { paginaCompleta } from "./layout.js";

/**
 * Garantisce marcatura valida e messaggi sensati in tutti e tre gli stati:
 * carrello pieno, carrello vuoto, JavaScript assente. Non garantisce alcun
 * importo: quelli arrivano dal server dopo il caricamento.
 */
export function paginaCarrello(ctx) {
  const c = ctx || {};
  const config = c.config || {};
  const sito = String(config.sito || "https://ellebi.it").replace(/\/$/, "");
  const instagram = String(config.instagram || "https://www.instagram.com/emmeluofficial/");

  const corpo = `<main id="main">
  <section class="section carrello" aria-labelledby="carrello-titolo">
    <div class="wrap wrap--narrow">
      <p class="eyebrow">Il tuo carrello</p>
      <h1 class="title" id="carrello-titolo">Quello che stai per portarti a casa</h1>

      <!-- Senza JavaScript il carrello non può esistere: si dice, e si offre
           la strada che funziona comunque. -->
      <noscript>
        <p class="carrello__avviso" role="note">
          Per il carrello serve JavaScript, che nel tuo browser è disattivato.
          Puoi ordinare scrivendomi su
          <a class="link-line" href="${esc(instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>
          o a <a class="link-line" href="mailto:${esc(config.email || "ellebi.style@gmail.com")}">${esc(config.email || "ellebi.style@gmail.com")}</a>:
          ti rispondo io e concludiamo lo stesso.
        </p>
      </noscript>

      <!-- Stato di partenza: la riga di attesa viene sostituita da negozio.js
           appena /api/preventivo risponde. aria-live annuncia il cambiamento
           a chi usa un lettore di schermo, che altrimenti non se ne accorge. -->
      <div id="carrello-contenuto" data-carrello-contenuto aria-live="polite" aria-busy="true">
        <p class="carrello__attesa">Sto recuperando prezzi e disponibilità aggiornati…</p>
      </div>

      <!-- Modello di riga, clonato dal JavaScript. Sta nell'HTML e non in una
           stringa dentro lo script perché così resta leggibile, traducibile e
           modificabile senza toccare il codice. -->
      <template id="modello-riga-carrello">
        <li class="carrello__riga">
          <div class="carrello__foto" data-foto></div>
          <div class="carrello__dati">
            <h2 class="carrello__nome"><a data-link href="#"></a></h2>
            <p class="carrello__variante" data-variante hidden></p>
            <p class="carrello__personalizzazione" data-personalizzazione hidden></p>
            <p class="carrello__avvertenza" data-avvertenza hidden>
              Pezzo su misura: non è restituibile.
              <a class="link-line" href="/resi">Perché</a>
            </p>
            <p class="carrello__esaurito" data-esaurito hidden role="alert"></p>
          </div>
          <div class="carrello__quantita">
            <label class="visually-hidden" data-etichetta-quantita for="">Quantità</label>
            <button class="carrello__passo" type="button" data-meno aria-label="Togli uno">−</button>
            <input class="carrello__campo" type="number" min="1" max="99" step="1" inputmode="numeric" data-quantita value="1">
            <button class="carrello__passo" type="button" data-piu aria-label="Aggiungi uno">+</button>
          </div>
          <p class="carrello__prezzo" data-prezzo></p>
          <button class="carrello__togli" type="button" data-togli>Togli</button>
        </li>
      </template>

      <!-- Modello del riepilogo, per lo stesso motivo. -->
      <template id="modello-riepilogo-carrello">
        <div class="carrello__riepilogo">
          <dl class="carrello__conti">
            <div><dt>Subtotale</dt><dd data-subtotale></dd></div>
            <div><dt>Spedizione</dt><dd data-spedizione></dd></div>
            <div class="carrello__conti-totale"><dt>Totale</dt><dd data-totale></dd></div>
          </dl>
          <p class="carrello__iva" data-iva></p>
          <p class="carrello__soglia" data-soglia hidden></p>
          <a class="btn btn--solid carrello__vai" href="/checkout" data-vai>
            Vai al pagamento
            <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
          </a>
          <p class="carrello__nota">Spedizione in Italia. Prezzi IVA inclusa.</p>
          <a class="link-line carrello__continua" href="/negozio">Continua a guardare</a>
        </div>
      </template>

      <!-- Modello del carrello vuoto. -->
      <template id="modello-carrello-vuoto">
        <div class="carrello__vuoto">
          <p>Nel carrello non c'è ancora niente.</p>
          <a class="btn btn--solid" href="/negozio">
            Vai al negozio
            <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
          </a>
        </div>
      </template>
    </div>
  </section>
</main>`;

  return paginaCompleta({
    titolo: "Carrello",
    descrizione: "I pezzi che hai scelto, con prezzi e disponibilità aggiornati.",
    canonical: `${sito}/carrello`,
    // Un carrello indicizzato non ha senso: è diverso per ogni visitatore e
    // vuoto per il motore di ricerca.
    noindex: true,
    corpo,
    cssExtra: [],
    jsExtra: [],
    jsonLd: null,
    ctx: c,
  });
}
