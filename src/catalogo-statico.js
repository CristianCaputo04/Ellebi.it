/* =========================================================================
   EmmeLù — catalogo di riserva, senza database

   A che serve.

   Il negozio legge prodotti, prezzi e giacenze da D1. Finché quel database
   non esiste, `/negozio` e `/prodotto/...` rimandavano alla home: chi
   arrivava da un collegamento non trovava nessun catalogo, e il lavoro del
   negozio restava invisibile a chiunque non avesse le chiavi di Cloudflare.

   Questo modulo serve le stesse pagine leggendo da qui invece che dal
   database. Le funzioni hanno la forma esatta di quelle di `db.js`, così il
   router le usa senza sapere da dove arrivano i dati.

   Cosa NON fa, e non deve fare.

   · non finge che il negozio sia aperto. Con la vetrina spenta carrello e
     pagamento restano chiusi come prima, e le schede portano a ordinare su
     Instagram. Qui si mostra il catalogo, non si vende;
   · non inventa la giacenza. Il numero scritto qui è quello del seed: senza
     database nessuno può comprare, quindi non può nemmeno cambiare. Appena
     D1 esiste, questo modulo smette di essere usato — il router preferisce
     sempre il database, che è l'unico a sapere cosa è stato venduto dieci
     minuti fa.

   Il patto con le migrazioni.

   I dati qui sotto sono gli stessi di `migrazioni/0002-dati-iniziali.sql`.
   Due copie della stessa cosa divergono sempre, quindi la divergenza la fa
   fallire un controllo: `tools/verifica.mjs` confronta slug, prezzi, SKU,
   giacenze e immagini fra questo file e quel seed. Se cambi un prezzo di
   qua, la pubblicazione si ferma finché non lo cambi anche di là.
   ========================================================================= */

/** Le linee del marchio, nell'ordine in cui vanno mostrate. */
const CATEGORIE = [
  { id: 1, slug: "borse", nome: "Borse", descrizione: "Eleganza e funzionalità in ogni dettaglio.", posizione: 1 },
  { id: 2, slug: "piccola-pelletteria", nome: "Piccola Pelletteria", descrizione: "Piccoli dettagli, grande personalità.", posizione: 2 },
  { id: 3, slug: "abbigliamento", nome: "Abbigliamento", descrizione: "Capi versatili e senza tempo.", posizione: 3 },
  { id: 4, slug: "accessori", nome: "Accessori", descrizione: "Completa il tuo stile con unicità.", posizione: 4 },
  { id: 5, slug: "gioielli", nome: "Gioielli", descrizione: "Luce ai tuoi momenti più speciali.", posizione: 5 },
  { id: 6, slug: "lingerie", nome: "Lingerie", descrizione: "Femminilità a contatto con la pelle.", posizione: 6 },
  { id: 7, slug: "beachwear", nome: "Beachwear", descrizione: "Stile che ti accompagna ovunque.", posizione: 7 },
  { id: 8, slug: "linea-home", nome: "Linea Home", descrizione: "La bellezza di sentirsi a casa.", posizione: 8 },
  { id: 9, slug: "linea-baby", nome: "Linea Baby", descrizione: "Dolcezza per i suoi primi momenti.", posizione: 9 },
];

/* I quattro pezzi realmente fotografati. Le altre otto linee esistono come
   categoria ma non hanno ancora prodotti: il catalogo non stampa filtri
   verso pagine vuote, quindi restano invisibili finché non si riempiono. */
const PRODOTTI = [
  {
    id: 1, slug: "nuvola", nome: "Nuvola",
    sottotitolo: "Pouch morbida in filato tortora",
    descrizione: "Pouch morbida lavorata a mano in fettuccia di cotone tortora, con bordo intrecciato. Morbida al tatto e ferma nella forma: il filato pesante la tiene in piedi senza rinforzi rigidi interni. Capsule limited edition, pezzo unico.",
    materiale: "Fettuccia di cotone", colore: "Tortora",
    personalizzabile: 1, pezzo_unico: 1, stato: "attivo",
    categoria_slug: "borse",
    immagini: [
      { base: "borsa-01", alt: "La pouch Nuvola in filato tortora con bordo intrecciato, tenuta in mano", larghezza: 900, altezza: 1200 },
      { base: "borsa-01b", alt: "Dettaglio ravvicinato del punto della pouch Nuvola", larghezza: 900, altezza: 1200 },
    ],
    varianti: [{ id: 1, sku: "NUV-U", nome: "Unica", prezzo_cent: 8500, peso_g: 450, giacenza: 1 }],
  },
  {
    id: 2, slug: "perla", nome: "Perla",
    sottotitolo: "Mini bag cacao con manico rigido",
    descrizione: "Mini bag color cacao con manico rigido e tre perle cucite a mano, una a una. La lavorazione fitta della fettuccia di cotone regge la forma anche da vuota. Capsule limited edition, pezzo unico.",
    materiale: "Fettuccia di cotone", colore: "Cacao",
    personalizzabile: 1, pezzo_unico: 1, stato: "attivo",
    categoria_slug: "borse",
    immagini: [
      { base: "borsa-02", alt: "La mini bag Perla color cacao con manico rigido e tre perle cucite a mano", larghezza: 900, altezza: 1200 },
      { base: "borsa-02b", alt: "Dettaglio del manico rigido e delle perle della mini bag Perla", larghezza: 900, altezza: 1200 },
    ],
    varianti: [{ id: 2, sku: "PER-U", nome: "Unica", prezzo_cent: 9500, peso_g: 500, giacenza: 1 }],
  },
  {
    id: 3, slug: "sera", nome: "Sera",
    sottotitolo: "Pouch cioccolato con filo lurex",
    descrizione: "Pouch in fettuccia di cotone cioccolato attraversata da un filo lurex dorato, che si accende con la luce radente. Pensata per le occasioni serali. Capsule limited edition, pezzo unico.",
    materiale: "Fettuccia di cotone e lurex", colore: "Cioccolato",
    personalizzabile: 1, pezzo_unico: 1, stato: "attivo",
    categoria_slug: "borse",
    immagini: [
      { base: "borsa-03", alt: "La pouch Sera in filato cioccolato attraversato da lurex dorato", larghezza: 900, altezza: 1200 },
      { base: "borsa-03b", alt: "Dettaglio del filo lurex dorato della pouch Sera", larghezza: 900, altezza: 1200 },
    ],
    varianti: [{ id: 3, sku: "SER-U", nome: "Unica", prezzo_cent: 9000, peso_g: 420, giacenza: 1 }],
  },
  {
    id: 4, slug: "cacao", nome: "Cacao",
    sottotitolo: "Pouch capiente in cioccolato opaco",
    descrizione: "Pouch capiente in fettuccia di cotone cioccolato opaco: la misura che entra in borsa o si porta da sola, senza rinunciare alla forma. Capsule limited edition, pezzo unico.",
    materiale: "Fettuccia di cotone", colore: "Cioccolato opaco",
    personalizzabile: 1, pezzo_unico: 1, stato: "attivo",
    categoria_slug: "borse",
    immagini: [
      { base: "borsa-04", alt: "La pouch capiente Cacao in filato cioccolato opaco, tenuta in mano", larghezza: 900, altezza: 1200 },
      { base: "borsa-04b", alt: "Dettaglio della trama fitta della pouch Cacao", larghezza: 900, altezza: 1200 },
    ],
    varianti: [{ id: 4, sku: "CAC-U", nome: "Unica", prezzo_cent: 8000, peso_g: 480, giacenza: 1 }],
  },
];

/** Le tariffe di spedizione, identiche a quelle del seed. */
const TARIFFE = [
  { id: 1, nome: "Fino a 500 g", peso_max_g: 500, prezzo_cent: 600, attiva: 1 },
  { id: 2, nome: "Fino a 2 kg", peso_max_g: 2000, prezzo_cent: 750, attiva: 1 },
  { id: 3, nome: "Fino a 5 kg", peso_max_g: 5000, prezzo_cent: 990, attiva: 1 },
];

/* ------------------------------------------------------------ utilità */

function categoriaDi(prodotto) {
  return CATEGORIE.find((c) => c.slug === prodotto.categoria_slug) || null;
}

/** Aggiunge i campi che le query calcolano con MIN, SUM e COUNT. */
function arricchisci(p) {
  const varianti = p.varianti || [];
  const giacenzaTotale = varianti.reduce((s, v) => s + (Number(v.giacenza) || 0), 0);
  const categoria = categoriaDi(p);
  return {
    ...p,
    categoria_id: categoria ? categoria.id : null,
    categoria_nome: categoria ? categoria.nome : "",
    categoria_descrizione: categoria ? categoria.descrizione : "",
    prezzo_cent: varianti.length ? Math.min(...varianti.map((v) => v.prezzo_cent)) : 0,
    giacenza_totale: giacenzaTotale,
    numero_varianti: varianti.length,
    sku_unico: varianti.length === 1 ? varianti[0].sku : null,
    disponibile: giacenzaTotale > 0,
    // Serve solo all'ordinamento "recenti", che senza database non ha una
    // data vera da usare: si tiene l'ordine in cui sono scritti qui.
    creato_il: "",
  };
}

/* ------------------------- le stesse funzioni di db.js, stessa forma ---- */

export function categorieAttiveStatiche() {
  return CATEGORIE.map((c) => ({
    ...c,
    quanti_prodotti: PRODOTTI.filter((p) => p.categoria_slug === c.slug && p.stato === "attivo").length,
  }));
}

export function cercaProdottiStatici({ termine = "", categoriaSlug = null, ordine = "recenti" } = {}) {
  const testo = String(termine || "").trim().toLowerCase();
  let elenco = PRODOTTI.filter((p) => p.stato === "attivo").map(arricchisci);

  if (categoriaSlug) {
    elenco = elenco.filter((p) => p.categoria_slug === categoriaSlug);
  }

  if (testo) {
    // Gli stessi campi su cui cerca la query SQL, così la ricerca dà lo
    // stesso risultato con e senza database.
    elenco = elenco.filter((p) =>
      [p.nome, p.sottotitolo, p.materiale, p.colore, p.categoria_nome]
        .some((campo) => String(campo || "").toLowerCase().includes(testo))
    );
  }

  const ordinamenti = {
    recenti: () => 0,
    nome: (a, b) => a.nome.localeCompare(b.nome, "it"),
    prezzo_crescente: (a, b) => a.prezzo_cent - b.prezzo_cent || a.nome.localeCompare(b.nome, "it"),
    prezzo_decrescente: (a, b) => b.prezzo_cent - a.prezzo_cent || a.nome.localeCompare(b.nome, "it"),
    disponibili: (a, b) => Number(b.disponibile) - Number(a.disponibile) || a.nome.localeCompare(b.nome, "it"),
  };
  const confronta = ordinamenti[ordine] || ordinamenti.recenti;
  return elenco.slice().sort(confronta);
}

export function prodottoPerSlugStatico(slug) {
  const p = PRODOTTI.find((x) => x.slug === String(slug) && x.stato === "attivo");
  return p ? arricchisci(p) : null;
}

export function tariffeAttiveStatiche() {
  return TARIFFE.filter((t) => t.attiva === 1);
}
