// =========================================================================
// Pagina di accesso al pannello.
//
// Una sola password, un solo campo. Il messaggio d'errore è sempre lo stesso
// qualunque sia la causa: distinguere "password errata" da "troppi tentativi"
// o da "sessione scaduta" regala a chi prova a entrare l'informazione che gli
// manca. Qui non c'è niente da diagnosticare, c'è solo da riprovare.
// =========================================================================

import { esc } from "../util.js";
import { paginaAdmin } from "./layout.js";

/**
 * @param {object} ctx contesto ({ config, url })
 * @param {object} opzioni
 * @param {string|null} opzioni.errore messaggio da mostrare, o null
 * @param {string} [opzioni.csrf] token anti-CSRF del modulo
 *
 * Garantisce: nessuna voce di menu e nessun pulsante "Esci" (qui la sessione
 * non esiste ancora), messaggio d'errore in `role="alert"`, campo password
 * con `autocomplete="current-password"` perché il gestore di password del
 * telefono lo riempia da solo.
 * Non garantisce: alcun riscontro su quanti tentativi restano — è voluto.
 */
export function paginaAccesso(ctx, { errore = null, csrf = "" } = {}) {
  const gettone = esc(csrf || (ctx && ctx.csrf) || "");

  const avviso = errore
    ? `<p class="avviso avviso--grave" role="alert">${esc(errore)}</p>`
    : "";

  const corpo =
    `<div class="accesso">` +
    avviso +
    `<form class="scheda accesso__modulo" method="post" action="/admin/accesso">` +
    `<input type="hidden" name="csrf" value="${gettone}">` +
    `<p class="campo">` +
    `<label class="campo__etichetta" for="password">Password</label>` +
    `<input class="campo__valore" type="password" id="password" name="password" ` +
    `autocomplete="current-password" required autofocus>` +
    `</p>` +
    `<p class="azioni">` +
    `<button type="submit" class="bottone bottone--primario">Entra</button>` +
    `</p>` +
    `</form>` +
    `<p class="nota">Accesso riservato alla titolare. Questa pagina non è indicizzata.</p>` +
    `</div>`;

  return paginaAdmin({
    titolo: "Accesso",
    corpo,
    ctx,
    vocaleAttiva: null,
    // Il token GREZZO: paginaAdmin lo fa passare da esc() per conto suo, e
    // dargli quello gia' sfuggito lo sfuggirebbe due volte.
    csrf: csrf || (ctx && ctx.csrf) || "",
  });
}
