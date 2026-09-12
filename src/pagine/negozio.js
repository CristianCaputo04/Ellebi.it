/* =========================================================================
   EmmeLù — /negozio, il catalogo.

   Il filtro per categoria è fatto di collegamenti veri (/negozio?categoria=…)
   e non di un filtro che nasconde nodi con JavaScript: così funziona con lo
   script bloccato, si può aprire in una scheda nuova, si può condividere e —
   non ultimo — ogni linea ha un indirizzo che un motore di ricerca può
   indicizzare. Il costo è una richiesta al server per ogni cambio di filtro;
   su un catalogo di poche decine di pezzi è un costo che non si vede.
   ========================================================================= */

import { esc, euro } from "../util.js";
import { paginaCompleta, figuraProdotto } from "./layout.js";

/* Sintesi della disponibilità in una riga sola, per la scheda del catalogo.
   La scheda prodotto è più esplicita: qui serve solo capire se vale la pena
   aprire il pezzo. */
function disponibilita(prodotto) {
  const varianti = Array.isArray(prodotto.varianti) ? prodotto.varianti : [];
  const pezzi = varianti.reduce(function (somma, v) {
    const g = Number(v && v.giacenza);
    return somma + (Number.isFinite(g) && g > 0 ? g : 0);
  }, 0);

  if (!prodotto.disponibile || pezzi <= 0) {
    return { testo: "Esaurito", classe: "is-esaurito", badge: prodotto.pezzo_unico ? "Non replicato" : "Esaurito" };
  }
  if (pezzi === 1) {
    return { testo: "Ultimo pezzo", classe: "is-ultimo", badge: prodotto.pezzo_unico ? "Pezzo unico" : "Ultimo pezzo" };
  }
  return { testo: "Disponibile", classe: "is-disponibile", badge: prodotto.pezzo_unico ? "Pezzo unico" : "Disponibile" };
}

function scheda(prodotto, config) {
  const p = prodotto || {};
  const stato = disponibilita(p);
  const immagini = Array.isArray(p.immagini) ? p.immagini : [];
  const prima = immagini[0];
  const url = `/prodotto/${esc(String(p.slug || ""))}`;
  const prezzo = Number.isFinite(Number(p.prezzo_cent)) ? Number(p.prezzo_cent) : 0;
  const varianti = Array.isArray(p.varianti) ? p.varianti : [];
  const daPrezzo = varianti.length > 1;

  const media = prima
    ? figuraProdotto(prima, { sizes: "(min-width: 64em) 30vw, (min-width: 48em) 46vw, 90vw" })
    : `<div class="card__vuota" aria-hidden="true"></div>`;

  const zoom = prima
    ? `<button class="card__zoom" type="button" data-lightbox="/assets/img/${esc(prima.base)}.jpg" data-lightbox-avif="/assets/img/${esc(prima.base)}-w450.avif" data-caption="${esc(p.nome || "")}" aria-label="Ingrandisci la foto di ${esc(p.nome || "questo pezzo")}">
              <svg aria-hidden="true" focusable="false"><use href="#i-expand"></use></svg>
            </button>`
    : "";

  return `<article class="card negozio__scheda" data-reveal="scale">
          <div class="card__media">
            <span class="card__badge">${esc(stato.badge)}</span>
            ${media}
            ${zoom}
          </div>
          <h3 class="card__name"><a class="negozio__nome" href="${url}">${esc(p.nome || "Pezzo senza nome")}</a></h3>
          ${p.sottotitolo ? `<p class="card__meta">${esc(p.sottotitolo)}</p>` : ""}
          <p class="negozio__prezzo">${daPrezzo ? "da " : ""}${esc(euro(prezzo))}</p>
          <p class="negozio__stato ${stato.classe}">${esc(stato.testo)}</p>
          <a class="card__cta" href="${url}" aria-label="Vedi la scheda di ${esc(p.nome || "questo pezzo")}">
            ${config.negozioAttivo ? "Vedi il pezzo" : "Guarda il pezzo"}
            <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
          </a>
        </article>`;
}

function filtri(categorie, categoriaAttiva) {
  const voci = [{ slug: "", nome: "Tutte le linee" }].concat(
    (Array.isArray(categorie) ? categorie : []).map(function (c) {
      return { slug: String(c.slug || ""), nome: String(c.nome || "") };
    })
  );

  const elementi = voci.filter(function (v) { return v.slug === "" || v.slug; }).map(function (v) {
    const attiva = (categoriaAttiva || "") === v.slug;
    const href = v.slug ? `/negozio?categoria=${encodeURIComponent(v.slug)}` : "/negozio";
    return `<li><a class="negozio__filtro${attiva ? " is-attivo" : ""}" href="${esc(href)}"${attiva ? ' aria-current="page"' : ""}>${esc(v.nome)}</a></li>`;
  }).join("\n        ");

  return `<nav class="negozio__filtri" aria-label="Filtra per linea">
      <ul class="negozio__filtri-lista" role="list">
        ${elementi}
      </ul>
    </nav>`;
}

function datiStrutturati(prodotti, categoriaAttiva, sito) {
  const elenco = (Array.isArray(prodotti) ? prodotti : []).map(function (p, i) {
    const immagini = Array.isArray(p.immagini) ? p.immagini : [];
    const item = {
      "@type": "Product",
      name: String(p.nome || ""),
      url: `${sito}/prodotto/${String(p.slug || "")}`,
      brand: { "@type": "Brand", name: "EmmeLù" },
      offers: {
        "@type": "Offer",
        price: (Number(p.prezzo_cent) / 100).toFixed(2),
        priceCurrency: "EUR",
        itemCondition: "https://schema.org/NewCondition",
        availability: p.disponibile ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        url: `${sito}/prodotto/${String(p.slug || "")}`,
      },
    };
    if (immagini[0] && immagini[0].base) {
      item.image = `${sito}/assets/img/${immagini[0].base}.jpg`;
    }
    if (p.materiale) { item.material = String(p.materiale); }
    if (p.colore) { item.color = String(p.colore); }
    return { "@type": "ListItem", position: i + 1, item: item };
  });

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: categoriaAttiva ? `Negozio EmmeLù — ${categoriaAttiva}` : "Negozio EmmeLù",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: elenco.length,
    itemListElement: elenco,
  };
}

/**
 * Pagina del catalogo.
 *
 * Garantisce: un solo <h1>, filtro funzionante senza JavaScript, JSON-LD
 * ItemList coerente con i pezzi mostrati, ogni valore passato da esc().
 * NON garantisce l'ordinamento: arriva già ordinato dal chiamante.
 */
export function paginaNegozio(ctx, dati) {
  const c = ctx || {};
  const config = c.config || {};
  const d = dati || {};
  const categorie = Array.isArray(d.categorie) ? d.categorie : [];
  const prodotti = Array.isArray(d.prodotti) ? d.prodotti : [];
  const categoriaAttiva = d.categoriaAttiva ? String(d.categoriaAttiva) : "";
  const sito = String(config.sito || "https://ellebi.it").replace(/\/$/, "");

  const categoria = categorie.find(function (x) { return String(x.slug) === categoriaAttiva; }) || null;
  const nomeCategoria = categoria ? String(categoria.nome) : "";

  const titolo = categoria ? `${nomeCategoria} — Negozio` : "Negozio";
  const descrizione = categoria && categoria.descrizione
    ? String(categoria.descrizione)
    : "Il catalogo EmmeLù: pezzi cuciti a mano in Italia, capsule limited edition. Prezzi, disponibilità e dettagli di ogni pezzo.";

  const avvisoVetrina = config.negozioAttivo
    ? ""
    : `<p class="negozio__avviso" role="note">Il carrello non è ancora attivo: i pezzi si ordinano scrivendo su <a class="link-line" href="${esc(config.instagram || "https://www.instagram.com/emmeluofficial/")}" target="_blank" rel="noopener noreferrer">Instagram</a> o a <a class="link-line" href="mailto:${esc(config.email || "ellebi.style@gmail.com")}">${esc(config.email || "ellebi.style@gmail.com")}</a>. Qui trovi prezzi e disponibilità aggiornati.</p>`;

  const griglia = prodotti.length
    ? `<div class="collection__grid negozio__griglia" data-stagger>
        ${prodotti.map(function (p) { return scheda(p, config); }).join("\n        ")}
      </div>`
    : `<p class="negozio__vuoto">In questa linea non c'è ancora nulla di disponibile. <a class="link-line" href="/negozio">Guarda tutte le linee</a> oppure scrivimi su <a class="link-line" href="${esc(config.instagram || "https://www.instagram.com/emmeluofficial/")}" target="_blank" rel="noopener noreferrer">Instagram</a>: alcuni pezzi nascono su richiesta.</p>`;

  const corpo = `<main id="main">
  <section class="section negozio" aria-labelledby="negozio-titolo">
    <div class="wrap">
      <div class="negozio__testa">
        <p class="eyebrow">${esc(categoria ? nomeCategoria : "Tutte le linee")}</p>
        <h1 class="title" id="negozio-titolo">${esc(categoria ? nomeCategoria : "Il negozio")}</h1>
        <p class="lead">${esc(categoria && categoria.descrizione ? String(categoria.descrizione) : "Ogni pezzo è cucito a mano, uno per volta. Quello che vedi qui esiste davvero ed è disponibile adesso.")}</p>
      </div>

      ${avvisoVetrina}

      ${filtri(categorie, categoriaAttiva)}

      <h2 class="visually-hidden" id="negozio-pezzi">Pezzi ${esc(categoria ? `della linea ${nomeCategoria}` : "di tutte le linee")}</h2>
      ${griglia}

      <p class="collection__note negozio__conteggio">
        <span>${esc(String(prodotti.length))} ${prodotti.length === 1 ? "pezzo" : "pezzi"} in vetrina</span>
        <span>Prezzi IVA inclusa · spedizione in Italia</span>
      </p>
    </div>
  </section>
</main>`;

  return paginaCompleta({
    titolo: titolo,
    descrizione: descrizione,
    canonical: categoria ? `${sito}/negozio?categoria=${encodeURIComponent(categoriaAttiva)}` : `${sito}/negozio`,
    noindex: false,
    corpo: corpo,
    cssExtra: [],
    jsExtra: [],
    jsonLd: datiStrutturati(prodotti, nomeCategoria, sito),
    ctx: c,
  });
}
