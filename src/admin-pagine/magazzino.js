// =========================================================================
// Giacenze.
//
// Un solo modulo per tutto il magazzino e un solo pulsante di salvataggio:
// si correggono cinque numeri in fila e si salva una volta. Salvare riga per
// riga significherebbe cinque ricariche di pagina e cinque occasioni di
// perdere una modifica.
//
// Il prezzo è mostrato ma non modificabile: cambiare un listino è un'altra
// operazione, con altre conseguenze, e non deve capitare per errore mentre si
// aggiusta una giacenza.
// =========================================================================

import { esc, euro } from "../util.js";
import { paginaAdmin } from "./layout.js";

const ETICHETTE_STATO_PRODOTTO = {
  bozza: "Bozza",
  attivo: "Attivo",
  archiviato: "Archiviato",
};

/**
 * @param {object} ctx
 * @param {object} opzioni
 * @param {Array}  opzioni.prodotti prodotti con le loro varianti
 * @param {string} opzioni.csrf
 * @param {boolean} opzioni.salvato true subito dopo un salvataggio riuscito
 *
 * Garantisce: un solo <form method="post"> verso /admin/magazzino, un campo
 * `giacenza_<idVariante>` per variante, nessun campo prezzo inviato.
 * Non garantisce: che le giacenze mostrate siano ancora attuali al momento
 * del salvataggio — è il backend a decidere cosa scrivere.
 */
export function paginaMagazzino(ctx, { prodotti = [], csrf = "", salvato = false } = {}) {
  const gettone = esc(csrf || "");

  const conferma = salvato
    ? `<p class="avviso avviso--buono" role="status">Giacenze salvate.</p>`
    : "";

  if (!prodotti.length) {
    return paginaAdmin({
      titolo: "Magazzino",
      corpo: conferma + `<p class="vuoto">Non c'è ancora nessun prodotto a catalogo.</p>`,
      ctx,
      vocaleAttiva: "magazzino",
      csrf: gettone,
    });
  }

  const blocchi = prodotti.map(prodottoHtml).join("");

  const corpo =
    conferma +
    `<form class="magazzino" method="post" action="/admin/magazzino">` +
    `<input type="hidden" name="csrf" value="${gettone}">` +
    blocchi +
    // La barra del salvataggio resta in fondo al documento: su telefono la si
    // raggiunge scorrendo, senza coprire l'ultima riga del modulo.
    `<p class="azioni azioni--salvataggio">` +
    `<button type="submit" class="bottone bottone--primario">Salva le giacenze</button></p>` +
    `</form>`;

  return paginaAdmin({
    titolo: "Magazzino",
    corpo,
    ctx,
    vocaleAttiva: "magazzino",
    csrf: gettone,
  });
}

function prodottoHtml(prodotto) {
  const idTitolo = `prod-${esc(String(prodotto.id ?? prodotto.slug ?? ""))}`;
  const varianti = Array.isArray(prodotto.varianti) ? prodotto.varianti : [];

  const corpo = varianti.length
    ? `<ul class="varianti" role="list">${varianti.map(varianteHtml).join("")}</ul>`
    : `<p class="vuoto">Nessuna variante: questo prodotto non è vendibile finché non ne ha una.</p>`;

  const stato = prodotto.stato
    ? `<span class="etichetta etichetta--${esc(prodotto.stato)}">${esc(
        ETICHETTE_STATO_PRODOTTO[prodotto.stato] || prodotto.stato
      )}</span>`
    : "";

  return (
    `<section class="scheda" aria-labelledby="${idTitolo}">` +
    `<h2 class="scheda__titolo" id="${idTitolo}">${esc(prodotto.nome || "")} ${stato}</h2>` +
    (prodotto.categoria_nome ? `<p class="scheda__spiega">${esc(prodotto.categoria_nome)}</p>` : "") +
    corpo +
    `</section>`
  );
}

function varianteHtml(variante) {
  const idCampo = `giacenza-${esc(String(variante.id ?? ""))}`;
  const nomeCampo = `giacenza_${esc(String(variante.id ?? ""))}`;
  const giacenza = Number.isFinite(Number(variante.giacenza)) ? Number(variante.giacenza) : 0;
  const esaurita = giacenza <= 0;

  return (
    `<li class="variante${esaurita ? " variante--esaurita" : ""}">` +
    `<div class="variante__testa">` +
    `<p class="variante__nome">${esc(variante.nome || "Unica")}` +
    (esaurita ? ` <span class="etichetta etichetta--esaurita">esaurita</span>` : "") +
    `</p>` +
    `<p class="variante__sku"><code>${esc(variante.sku || "")}</code> ` +
    `<span class="sbiadito">· ${esc(euro(variante.prezzo_cent))}</span></p>` +
    `</div>` +
    `<p class="campo campo--numero">` +
    `<label class="campo__etichetta" for="${idCampo}">Giacenza` +
    `<span class="visuale-nascosta"> di ${esc(variante.sku || variante.nome || "")}</span></label>` +
    // data-iniziale serve solo ad admin.js per evidenziare cosa è cambiato
    // prima di salvare: senza JavaScript il campo funziona identico.
    `<input class="campo__valore campo__valore--numero" type="number" min="0" step="1" ` +
    `inputmode="numeric" id="${idCampo}" name="${nomeCampo}" value="${esc(String(giacenza))}" ` +
    `data-iniziale="${esc(String(giacenza))}">` +
    `</p>` +
    `</li>`
  );
}
