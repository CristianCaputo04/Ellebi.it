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

  /* La giacenza la somma gia' la query, in `giacenza_totale`. Le varianti si
     usano solo se il chiamante le ha davvero allegate.

     Prima qui si sommavano SOLO le varianti — e nessuna delle due query del
     catalogo (prodottiInVetrina, cercaProdotti) le allega. La somma era
     quindi sempre 0, e OGNI pezzo compariva "Esaurito" anche con il
     magazzino pieno: il negozio mostrava quattro borse tutte non
     acquistabili. E' il genere di guasto che non fa rumore — nessun errore,
     nessun log — e si limita a non vendere niente. */
  const pezzi = varianti.length
    ? varianti.reduce(function (somma, v) {
        const g = Number(v && v.giacenza);
        return somma + (Number.isFinite(g) && g > 0 ? g : 0);
      }, 0)
    : Math.max(0, Math.floor(Number(prodotto.giacenza_totale) || 0));

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
          ${azioniScheda(p, stato, url, config)}
        </article>`;
}

/**
 * I pulsanti in fondo a una scheda del catalogo.
 *
 * Prima c'era solo «Vedi il pezzo»: un passaggio in piu' fra chi guarda e
 * chi compra, su un catalogo fatto di pezzi unici con una variante sola.
 * Ora, quando il pezzo e' acquistabile con un clic, il clic c'e'.
 *
 * Si aggiunge direttamente SOLO se la variante e' una e c'e' giacenza. Con
 * piu' varianti la scelta esiste davvero, e saltarla farebbe finire in
 * carrello il pezzo sbagliato: li' si va alla scheda.
 */
function azioniScheda(p, stato, url, config) {
  const vediEtichetta = config.negozioAttivo ? "Vedi il pezzo" : "Guarda il pezzo";
  const vedi = `<a class="card__cta" href="${url}" aria-label="Vedi la scheda di ${esc(p.nome || "questo pezzo")}">
            ${vediEtichetta}
            <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
          </a>`;

  const unaVariante = Number(p.numero_varianti) === 1 && p.sku_unico;
  const acquistabile = config.negozioAttivo && unaVariante && stato.classe !== "is-esaurito";
  if (!acquistabile) { return vedi; }

  /* Il pulsante nasce nascosto e lo accende negozio.js. Senza JavaScript il
     carrello non funziona comunque: mostrarlo spento sarebbe una promessa
     che la pagina non puo' mantenere, e resterebbe solo «Vedi il pezzo»,
     che invece funziona sempre. */
  return `<div class="card__azioni">
            <button class="btn btn--solid card__aggiungi" type="button" hidden
                    data-aggiungi-rapido data-sku="${esc(String(p.sku_unico))}"
                    aria-label="Aggiungi ${esc(p.nome || "questo pezzo")} al carrello">Aggiungi al carrello</button>
            ${vedi}
          </div>`;
}

/* Ordinamenti offerti. Le chiavi coincidono con quelle accettate da
   cercaProdotti() in src/db.js: se divergono, il menu propone un ordine che
   il server ignora in silenzio, che e' il modo peggiore di sbagliare. */
const ORDINAMENTI = [
  ["recenti", "Novita'"],
  ["nome", "Nome"],
  ["prezzo_crescente", "Prezzo crescente"],
  ["prezzo_decrescente", "Prezzo decrescente"],
  ["disponibili", "Prima i disponibili"],
];

/**
 * Ricerca e ordinamento.
 *
 * E' un <form method="get"> vero: funziona senza JavaScript, il risultato ha
 * un indirizzo proprio che si puo' salvare o condividere, e il tasto indietro
 * del browser fa quello che ci si aspetta. Un filtro che vive solo nel
 * JavaScript perde tutte e tre le cose.
 */
function ricerca(termine, categoriaAttiva, ordine) {
  const opzioni = ORDINAMENTI.map(function (o) {
    const scelto = o[0] === ordine ? " selected" : "";
    return `<option value="${esc(o[0])}"${scelto}>${esc(o[1])}</option>`;
  }).join("");

  /* La categoria viaggia in un campo nascosto: cercando dentro una linea si
     resta in quella linea, invece di essere rispediti su tutto il catalogo. */
  const categoriaNascosta = categoriaAttiva
    ? `<input type="hidden" name="categoria" value="${esc(categoriaAttiva)}">`
    : "";

  return `<form class="negozio__ricerca" method="get" action="/negozio" role="search">
      ${categoriaNascosta}
      <div class="negozio__ricerca-campo">
        <label class="visually-hidden" for="ricerca-termine">Cerca fra i pezzi</label>
        <input class="negozio__ricerca-input" id="ricerca-termine" type="search" name="q"
               value="${esc(termine)}" maxlength="60" autocomplete="off"
               placeholder="Cerca: borsa, tortora, lurex...">
      </div>
      <div class="negozio__ricerca-campo">
        <label class="visually-hidden" for="ricerca-ordine">Ordina per</label>
        <select class="negozio__ricerca-input" id="ricerca-ordine" name="ordine">
          ${opzioni}
        </select>
      </div>
      <button class="btn negozio__ricerca-invia" type="submit">Cerca</button>
      ${termine ? `<a class="link-line negozio__ricerca-azzera" href="${esc(categoriaAttiva ? `/negozio?categoria=${encodeURIComponent(categoriaAttiva)}` : "/negozio")}">Azzera</a>` : ""}
    </form>`;
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
  const termine = d.termine ? String(d.termine) : "";
  const ordine = d.ordine ? String(d.ordine) : "recenti";
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
    : termine
    ? `<p class="negozio__vuoto">Nessun pezzo corrisponde a <strong>${esc(termine)}</strong>. <a class="link-line" href="/negozio">Guarda tutto il catalogo</a>, oppure scrivimi su <a class="link-line" href="${esc(config.instagram || "https://www.instagram.com/emmeluofficial/")}" target="_blank" rel="noopener noreferrer">Instagram</a>: molti pezzi nascono su richiesta.</p>`
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

      ${ricerca(termine, categoriaAttiva, ordine)}

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
    // Una ricerca produce contenuto duplicato rispetto al catalogo: si lascia
    // indicizzabile solo la vetrina, con o senza linea scelta.
    noindex: termine !== "" || ordine !== "recenti",
    corpo: corpo,
    cssExtra: [],
    jsExtra: [],
    jsonLd: datiStrutturati(prodotti, nomeCategoria, sito),
    ctx: c,
  });
}
