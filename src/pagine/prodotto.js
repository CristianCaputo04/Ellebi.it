/* =========================================================================
   EmmeLù — /prodotto/:slug, la scheda del pezzo.

   È la pagina che deve uscire completa dalla prima risposta: nome, prezzo,
   disponibilità e JSON-LD Product sono già nel markup, non aggiunti dopo da
   JavaScript. Un pezzo unico venduto dieci minuti fa qui risulta esaurito
   adesso, perché la giacenza arriva da D1 a ogni richiesta.
   ========================================================================= */

import { esc, euro } from "../util.js";
import { paginaCompleta, figuraProdotto } from "./layout.js";

const MAX_PERSONALIZZAZIONE = 280;

/* La disponibilità non è un booleano: "ultimo pezzo" e "esaurito e non
   replicato" sono informazioni diverse e cambiano la decisione di chi legge.
   Vanno dette con parole, non con un pallino colorato. */
function statoDisponibilita(prodotto) {
  const varianti = Array.isArray(prodotto.varianti) ? prodotto.varianti : [];
  const pezzi = varianti.reduce(function (somma, v) {
    const g = Number(v && v.giacenza);
    return somma + (Number.isFinite(g) && g > 0 ? g : 0);
  }, 0);

  if (!prodotto.disponibile || pezzi <= 0) {
    return {
      codice: "esaurito",
      classe: "is-esaurito",
      breve: "Esaurito",
      messaggio: prodotto.pezzo_unico
        ? "Esaurito. Era un pezzo unico: non verrà replicato, nemmeno nello stesso colore."
        : "Esaurito al momento. Scrivimi se vuoi sapere quando torna disponibile.",
      schema: "https://schema.org/OutOfStock",
    };
  }
  if (pezzi === 1) {
    return {
      codice: "ultimo",
      classe: "is-ultimo",
      breve: "Ultimo pezzo",
      messaggio: "Ne resta uno solo. Quando trova casa, la scheda passa a esaurito.",
      schema: "https://schema.org/InStock",
    };
  }
  return {
    codice: "disponibile",
    classe: "is-disponibile",
    breve: "Disponibile",
    messaggio: `Disponibile adesso: ${pezzi} pezzi pronti a partire.`,
    schema: "https://schema.org/InStock",
  };
}

function galleria(prodotto) {
  const immagini = (Array.isArray(prodotto.immagini) ? prodotto.immagini : []).filter(function (i) {
    return i && i.base;
  });

  if (!immagini.length) {
    return `<div class="prodotto__galleria"><div class="prodotto__figura card__vuota" aria-hidden="true"></div></div>`;
  }

  const principale = immagini[0];
  const sizes = "(min-width: 64em) 46vw, 92vw";

  /* Solo la prima immagine è eager: è quella che entra nel Largest Contentful
     Paint. Le altre sono miniature sotto la piega e restano lazy. */
  const figura = `<figure class="prodotto__figura">
        ${figuraProdotto(principale, { sizes: sizes, prioritaria: true })}
        <button class="card__zoom prodotto__zoom" type="button" data-lightbox="/assets/img/${esc(principale.base)}.jpg" data-lightbox-avif="/assets/img/${esc(principale.base)}-w450.avif" data-caption="${esc(prodotto.nome || "")}" aria-label="Ingrandisci la foto di ${esc(prodotto.nome || "questo pezzo")}">
          <svg aria-hidden="true" focusable="false"><use href="#i-expand"></use></svg>
        </button>
      </figure>`;

  const altre = immagini.slice(1);
  const miniature = altre.length
    ? `<ul class="prodotto__miniature" role="list">
        ${altre.map(function (img, i) {
      return `<li><button class="prodotto__miniatura" type="button" data-lightbox="/assets/img/${esc(img.base)}.jpg" data-lightbox-avif="/assets/img/${esc(img.base)}-w450.avif" data-caption="${esc(img.alt || prodotto.nome || "")}" aria-label="Ingrandisci la foto ${esc(String(i + 2))} di ${esc(prodotto.nome || "questo pezzo")}">
            ${figuraProdotto(img, { sizes: "22vw" })}
          </button></li>`;
    }).join("\n        ")}
      </ul>`
    : "";

  return `<div class="prodotto__galleria">
      ${figura}
      ${miniature}
    </div>`;
}

function selettoreVarianti(prodotto) {
  const varianti = (Array.isArray(prodotto.varianti) ? prodotto.varianti : []).filter(function (v) {
    return v && v.sku;
  });

  if (!varianti.length) { return ""; }

  if (varianti.length === 1) {
    const v = varianti[0];
    /* Con una variante sola non si chiede nulla: lo SKU viaggia in un campo
       nascosto, e il prezzo mostrato è già quello. */
    return `<input type="hidden" name="sku" value="${esc(v.sku)}" data-sku data-prezzo="${esc(String(Number(v.prezzo_cent) || 0))}" data-giacenza="${esc(String(Number(v.giacenza) || 0))}">`;
  }

  const opzioni = varianti.map(function (v) {
    const giacenza = Number(v.giacenza) || 0;
    const esaurita = giacenza <= 0;
    return `<option value="${esc(v.sku)}" data-prezzo="${esc(String(Number(v.prezzo_cent) || 0))}" data-giacenza="${esc(String(giacenza))}"${esaurita ? " disabled" : ""}>${esc(v.nome || v.sku)} — ${esc(euro(Number(v.prezzo_cent) || 0))}${esaurita ? " (esaurita)" : ""}</option>`;
  }).join("\n          ");

  return `<div class="campo">
        <label class="campo__etichetta" for="variante">Variante</label>
        <select class="campo__controllo" id="variante" name="sku" data-sku>
          ${opzioni}
        </select>
      </div>`;
}

function bloccoPersonalizzazione(prodotto) {
  if (!prodotto.personalizzabile) { return ""; }

  return `<div class="campo">
        <label class="campo__etichetta" for="personalizzazione">Personalizzazione <span class="campo__nota">(facoltativa)</span></label>
        <textarea class="campo__controllo" id="personalizzazione" name="personalizzazione" rows="3" maxlength="${MAX_PERSONALIZZAZIONE}" data-personalizzazione aria-describedby="personalizzazione-aiuto personalizzazione-recesso" placeholder="Iniziali, colore del filo, misura…"></textarea>
        <p class="campo__aiuto" id="personalizzazione-aiuto">Fino a ${MAX_PERSONALIZZAZIONE} caratteri. Ti scrivo prima di iniziare se qualcosa non è realizzabile.</p>
        <p class="avviso avviso--recesso" id="personalizzazione-recesso" role="note">
          <strong>Attenzione:</strong> i pezzi realizzati su misura sulla tua richiesta non sono restituibili. Il diritto di recesso non si applica ai beni confezionati su misura o chiaramente personalizzati (art. 59 del Codice del Consumo). Per tutto il resto hai 14 giorni di tempo: <a class="link-line" href="/resi">resi e recesso</a>.
        </p>
      </div>`;
}

function moduloAcquisto(prodotto, stato, config) {
  const instagram = config.instagram || "https://www.instagram.com/emmeluofficial/";
  const email = config.email || "ellebi.style@gmail.com";

  const ctaInstagram = `<div class="prodotto__vetrina">
        <a class="btn btn--solid" href="${esc(instagram)}" target="_blank" rel="noopener noreferrer">
          Ordina su Instagram
          <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
        </a>
        <p class="prodotto__vetrina-nota">Il carrello non è ancora attivo. Scrivimi in direct o a <a class="link-line" href="mailto:${esc(email)}">${esc(email)}</a>: ti dico disponibilità, tempi e spedizione.</p>
      </div>`;

  if (!config.negozioAttivo) { return ctaInstagram; }

  if (stato.codice === "esaurito") {
    return `<div class="prodotto__vetrina">
        <p class="prodotto__esaurito">${esc(stato.messaggio)}</p>
        <a class="btn" href="${esc(instagram)}" target="_blank" rel="noopener noreferrer">
          Chiedi un pezzo simile
          <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
        </a>
      </div>`;
  }

  const varianti = (Array.isArray(prodotto.varianti) ? prodotto.varianti : []).filter(function (v) { return v && v.sku; });
  const giacenzaMax = varianti.reduce(function (m, v) {
    const g = Number(v.giacenza) || 0;
    return g > m ? g : m;
  }, 1);

  return `<form class="prodotto__acquisto" data-aggiungi-carrello data-slug="${esc(String(prodotto.slug || ""))}" data-nome="${esc(String(prodotto.nome || ""))}" data-personalizzabile="${prodotto.personalizzabile ? "1" : "0"}" novalidate>
        ${selettoreVarianti(prodotto)}
        ${bloccoPersonalizzazione(prodotto)}

        <div class="campo campo--quantita">
          <label class="campo__etichetta" for="quantita">Quantità</label>
          <input class="campo__controllo" id="quantita" name="quantita" type="number" value="1" min="1" max="${esc(String(giacenzaMax))}" step="1" inputmode="numeric" data-quantita>
        </div>

        <button class="btn btn--solid prodotto__aggiungi" type="submit">
          Aggiungi al carrello
          <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
        </button>

        <p class="prodotto__esito" data-esito role="status" aria-live="polite"></p>
      </form>

      <noscript>
        <p class="avviso">Il carrello ha bisogno di JavaScript. Se preferisci non attivarlo, scrivimi su <a class="link-line" href="${esc(instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a> o a <a class="link-line" href="mailto:${esc(email)}">${esc(email)}</a>: ordiniamo insieme, di persona.</p>
      </noscript>`;
}

function briciole(prodotto, categoria) {
  const nomeCat = categoria ? String(categoria.nome || "") : String(prodotto.categoria_nome || "");
  const slugCat = categoria ? String(categoria.slug || "") : String(prodotto.categoria_slug || "");

  const voceCategoria = nomeCat && slugCat
    ? `<li><a class="link-line" href="/negozio?categoria=${esc(encodeURIComponent(slugCat))}">${esc(nomeCat)}</a></li>`
    : "";

  return `<nav class="briciole" aria-label="Percorso di navigazione">
        <ol class="briciole__lista" role="list">
          <li><a class="link-line" href="/">Home</a></li>
          <li><a class="link-line" href="/negozio">Negozio</a></li>
          ${voceCategoria}
          <li><span aria-current="page">${esc(String(prodotto.nome || ""))}</span></li>
        </ol>
      </nav>`;
}

function schedaCorrelato(p) {
  const immagini = Array.isArray(p.immagini) ? p.immagini : [];
  const prima = immagini[0];
  const url = `/prodotto/${esc(String(p.slug || ""))}`;
  return `<article class="card" data-reveal="scale">
          <div class="card__media">
            ${prima ? figuraProdotto(prima, { sizes: "(min-width: 64em) 22vw, (min-width: 48em) 40vw, 88vw" }) : `<div class="card__vuota" aria-hidden="true"></div>`}
          </div>
          <h3 class="card__name"><a class="negozio__nome" href="${url}">${esc(String(p.nome || ""))}</a></h3>
          <p class="negozio__prezzo">${esc(euro(Number(p.prezzo_cent) || 0))}</p>
        </article>`;
}

function datiStrutturati(prodotto, categoria, stato, sito) {
  const immagini = (Array.isArray(prodotto.immagini) ? prodotto.immagini : []).filter(function (i) { return i && i.base; });
  const url = `${sito}/prodotto/${String(prodotto.slug || "")}`;
  const nomeCat = categoria ? String(categoria.nome || "") : String(prodotto.categoria_nome || "");
  const slugCat = categoria ? String(categoria.slug || "") : String(prodotto.categoria_slug || "");

  const prodottoLd = {
    "@type": "Product",
    "@id": `${url}#prodotto`,
    name: String(prodotto.nome || ""),
    description: String(prodotto.descrizione || prodotto.sottotitolo || ""),
    url: url,
    sku: (Array.isArray(prodotto.varianti) && prodotto.varianti[0] && prodotto.varianti[0].sku) || undefined,
    brand: { "@type": "Brand", name: "EmmeLù" },
    manufacturer: { "@type": "Organization", name: "EmmeLù" },
    itemCondition: "https://schema.org/NewCondition",
    offers: {
      "@type": "Offer",
      price: (Number(prodotto.prezzo_cent) / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: stato.schema,
      itemCondition: "https://schema.org/NewCondition",
      url: url,
      seller: { "@type": "Organization", name: "EmmeLù" },
    },
  };
  if (immagini.length) {
    prodottoLd.image = immagini.map(function (i) { return `${sito}/assets/img/${i.base}.jpg`; });
  }
  if (prodotto.materiale) { prodottoLd.material = String(prodotto.materiale); }
  if (prodotto.colore) { prodottoLd.color = String(prodotto.colore); }
  if (nomeCat) { prodottoLd.category = nomeCat; }

  const briciole = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${sito}/` },
    { "@type": "ListItem", position: 2, name: "Negozio", item: `${sito}/negozio` },
  ];
  if (nomeCat && slugCat) {
    briciole.push({
      "@type": "ListItem", position: 3, name: nomeCat,
      item: `${sito}/negozio?categoria=${encodeURIComponent(slugCat)}`,
    });
  }
  briciole.push({
    "@type": "ListItem", position: briciole.length + 1,
    name: String(prodotto.nome || ""), item: url,
  });

  return {
    "@context": "https://schema.org",
    "@graph": [prodottoLd, { "@type": "BreadcrumbList", itemListElement: briciole }],
  };
}

/**
 * Scheda di un singolo pezzo.
 *
 * Garantisce: un solo <h1>, breadcrumb visibile e in JSON-LD, avviso sul
 * recesso presente ogni volta che la personalizzazione è offerta, prima
 * immagine non lazy e tutte le altre sì, ogni valore passato da esc().
 * NON garantisce che il prodotto sia acquistabile: se il negozio è spento o
 * la giacenza è a zero, al posto del modulo compare l'alternativa.
 */
export function paginaProdotto(ctx, dati) {
  const c = ctx || {};
  const config = c.config || {};
  const d = dati || {};
  const prodotto = d.prodotto || {};
  const categoria = d.categoria || null;
  const correlati = (Array.isArray(d.correlati) ? d.correlati : []).filter(function (p) { return p && p.slug; });
  const sito = String(config.sito || "https://ellebi.it").replace(/\/$/, "");

  const stato = statoDisponibilita(prodotto);
  const varianti = (Array.isArray(prodotto.varianti) ? prodotto.varianti : []).filter(function (v) { return v && v.sku; });
  const prezzo = Number(prodotto.prezzo_cent) || 0;

  const dettagli = [
    prodotto.materiale ? `<div class="prodotto__dato"><dt>Materiale</dt><dd>${esc(String(prodotto.materiale))}</dd></div>` : "",
    prodotto.colore ? `<div class="prodotto__dato"><dt>Colore</dt><dd>${esc(String(prodotto.colore))}</dd></div>` : "",
    prodotto.pezzo_unico ? `<div class="prodotto__dato"><dt>Tiratura</dt><dd>Pezzo unico, non replicato</dd></div>` : "",
    prodotto.personalizzabile ? `<div class="prodotto__dato"><dt>Personalizzazione</dt><dd>Su richiesta</dd></div>` : "",
    `<div class="prodotto__dato"><dt>Lavorazione</dt><dd>Cucito a mano in Italia</dd></div>`,
  ].filter(Boolean).join("\n            ");

  const sezioneCorrelati = correlati.length
    ? `<section class="section section--tight prodotto__correlati" aria-labelledby="correlati-titolo">
    <div class="wrap">
      <p class="eyebrow">Dalla stessa linea</p>
      <h2 class="title" id="correlati-titolo">Potrebbero piacerti</h2>
      <div class="collection__grid" data-stagger>
        ${correlati.map(schedaCorrelato).join("\n        ")}
      </div>
    </div>
  </section>`
    : "";

  const corpo = `<main id="main">
  <section class="section prodotto" aria-labelledby="prodotto-titolo">
    <div class="wrap">
      ${briciole(prodotto, categoria)}

      <div class="prodotto__griglia">
        ${galleria(prodotto)}

        <div class="prodotto__info">
          <p class="eyebrow">${esc(String((categoria && categoria.nome) || prodotto.categoria_nome || "EmmeLù"))}</p>
          <h1 class="title prodotto__nome" id="prodotto-titolo">${esc(String(prodotto.nome || "Pezzo senza nome"))}</h1>
          ${prodotto.sottotitolo ? `<p class="lead prodotto__sottotitolo">${esc(String(prodotto.sottotitolo))}</p>` : ""}

          <p class="prodotto__prezzo">${varianti.length > 1 ? "da " : ""}${esc(euro(prezzo))} <span class="prodotto__iva">IVA inclusa</span></p>
          <p class="prodotto__stato ${stato.classe}">${esc(stato.messaggio)}</p>

          ${moduloAcquisto(prodotto, stato, config)}

          ${prodotto.descrizione ? `<div class="prodotto__descrizione"><h2 class="prodotto__sottotitolo-sezione">Il pezzo</h2><p>${esc(String(prodotto.descrizione))}</p></div>` : ""}

          <h2 class="prodotto__sottotitolo-sezione">Dettagli</h2>
          <dl class="prodotto__dati">
            ${dettagli}
          </dl>

          <p class="prodotto__legale">
            Spedizione in Italia${Number(config.sogliaSpedizioneGratisCent) > 0 ? `, gratuita sopra ${esc(euro(Number(config.sogliaSpedizioneGratisCent)))}` : ""}. Hai 14 giorni per il reso: <a class="link-line" href="/resi">come funziona</a>. Condizioni complete nelle <a class="link-line" href="/vendita">condizioni di vendita</a>.
          </p>
        </div>
      </div>
    </div>
  </section>

  ${sezioneCorrelati}
</main>`;

  const descrizione = String(prodotto.descrizione || prodotto.sottotitolo || "")
    .slice(0, 300) || `${String(prodotto.nome || "")}: pezzo EmmeLù cucito a mano in Italia.`;

  return paginaCompleta({
    titolo: String(prodotto.nome || "Pezzo"),
    descrizione: descrizione,
    canonical: `${sito}/prodotto/${String(prodotto.slug || "")}`,
    noindex: false,
    corpo: corpo,
    cssExtra: [],
    jsExtra: [],
    jsonLd: datiStrutturati(prodotto, categoria, stato, sito),
    ctx: c,
  });
}
