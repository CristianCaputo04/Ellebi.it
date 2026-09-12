/* =========================================================================
   EmmeLù — ritrova un ordine

   Serve a chi ha perso l'e-mail di conferma, e quindi il token che apre la
   pagina di stato. Il numero d'ordine da solo non basta (si indovina: sono
   progressivi), l'e-mail da sola nemmeno; insieme sono un segreto
   sufficiente per un negozio di questa dimensione.

   Due scelte che condizionano tutto il resto del file:

   · l'esito è SEMPRE lo stesso messaggio. Ordine inesistente, e-mail
     sbagliata, ordine anonimizzato: tre casi, una sola frase. Distinguerli
     trasformerebbe questa pagina in uno strumento per scoprire se un certo
     indirizzo ha comprato qui — che è esattamente ciò che non deve fare;

   · la pagina è sempre `noindex` e non ha mai un canonical. Non c'è niente
     da indicizzare, e un motore di ricerca che seguisse un redirect
     finirebbe per archiviare l'indirizzo con il token dentro.
   ========================================================================= */

import { esc } from "../util.js";
import { paginaCompleta } from "./layout.js";

/**
 * @param {object} ctx
 * @param {object} [dati]
 * @param {string} [dati.numero] il numero già digitato, per non farlo
 *        riscrivere dopo un tentativo fallito
 * @param {string} [dati.errore] messaggio da mostrare in cima al modulo
 *
 * Garantisce: ogni valore ripetuto nel modulo passa da esc(); la pagina non
 * mostra mai nulla dell'ordine cercato, nemmeno la sua esistenza.
 */
export function paginaRitrova(ctx, dati) {
  const c = ctx || {};
  const config = c.config || {};
  const d = dati || {};
  const numero = String(d.numero || "");
  const errore = String(d.errore || "");

  const avviso = errore
    ? `<p class="ritrova__errore" role="alert">${esc(errore)}</p>`
    : "";

  const corpo = `<main id="main">
  <section class="section ritrova" aria-labelledby="ritrova-titolo">
    <div class="wrap wrap--narrow">
      <p class="eyebrow">Assistenza</p>
      <h1 class="title" id="ritrova-titolo">Ritrova il tuo ordine</h1>
      <p class="lead">Hai perso l'e-mail di conferma? Scrivi qui il numero dell'ordine e
      l'indirizzo con cui l'hai fatto: ti riporto subito alla pagina di stato.</p>

      ${avviso}

      <form class="ritrova__modulo" method="post" action="/ordine">
        <p class="campo">
          <label class="campo__etichetta" for="ritrova-numero">Numero dell'ordine</label>
          <input class="campo__controllo" type="text" id="ritrova-numero" name="numero"
                 value="${esc(numero)}" maxlength="30" required autocomplete="off"
                 autocapitalize="characters" spellcheck="false"
                 placeholder="EL-2026-0123">
        </p>
        <p class="campo">
          <label class="campo__etichetta" for="ritrova-email">E-mail usata per l'ordine</label>
          <input class="campo__controllo" type="email" id="ritrova-email" name="email"
                 maxlength="180" required autocomplete="email" spellcheck="false"
                 placeholder="nome@esempio.it">
        </p>
        <p class="azioni"><button class="btn" type="submit">Mostrami l'ordine</button></p>
      </form>

      <p class="ritrova__aiuto">Il numero è nell'e-mail di conferma, in alto, e comincia per
      <code>EL-</code>. Se non ricordi nemmeno quello, scrivimi su
      <a class="link-line" href="${esc(config.instagram || "#")}" target="_blank" rel="noopener noreferrer">Instagram</a>:
      lo cerco io.</p>
    </div>
  </section>
</main>`;

  return paginaCompleta({
    titolo: "Ritrova il tuo ordine",
    descrizione: "",
    canonical: null,
    noindex: true,
    corpo,
    cssExtra: [],
    jsExtra: [],
    jsonLd: null,
    ctx: c,
  });
}
