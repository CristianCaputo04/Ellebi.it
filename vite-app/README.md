# EMMELÙ — scaffold Vite

Nuova architettura di build per **EmmeLù** (dominio `ellebi.it`, invariato),
pensata per affiancare il sito
statico esistente in `../public` senza sostituirlo: finché questo scaffold
non è completo (tutte le pagine migrate e verificate), il sito in produzione
resta quello in `../public`, invariato.

## Cosa cambia rispetto al sito attuale

| Prima (`../public`) | Ora (`vite-app`) |
|---|---|
| HTML piatto, header/footer duplicati in ogni pagina | Partial EJS riutilizzabili (`src/partials/`) |
| `style.css` monolitico (50 KB, 23 sezioni in un file) | SCSS diviso per sezione (`src/styles/partials/`) |
| Varianti immagine generate a mano con script Python one-off | `scripts/optimize-images.mjs`: AVIF + WebP + JPEG responsive, automatico |
| CSS/JS serviti senza hash, cache gestita a mano | Bundle con hash del contenuto, cache "immutable" sicura |
| `_headers` con hash CSP calcolati a mano | `scripts/csp-hash.mjs` li calcola dopo ogni build |

## Struttura

```
vite-app/
├── index.html, 404.html, accessibilita.html   pagine (template EJS)
├── src/
│   ├── partials/        header, footer, head-meta, picture, ecc. (EJS)
│   ├── styles/
│   │   ├── main.scss            aggrega tutti i partial in ordine
│   │   ├── fonts.scss           @font-face, self-hosted, invariato
│   │   └── partials/            un file per sezione (_08-header.scss, ecc.)
│   ├── scripts/          main.js, head.js (copiati invariati dal sito attuale)
│   └── assets/
│       ├── img/          SOLO le foto sorgente a piena risoluzione
│       └── fonts/        i .woff2 già sottoposti a subsetting
├── public/               file serviti as-is: favicon, manifest, _headers, _redirects, sitemap
└── scripts/
    ├── optimize-images.mjs   genera public/assets/img/*.{avif,webp,jpg}
    └── csp-hash.mjs          inserisce gli hash SHA-256 in dist/_headers
```

Le pagine **privacy.html** e **cookie.html** non sono ancora state portate:
seguono esattamente lo stesso schema di `accessibilita.html` (stesso
`head-meta`, `header` con `variant: "inner"`, `footer` con `variant: "inner"`)
— copiale una volta verificato che questo scaffold soddisfa le aspettative.

## Comandi

```bash
npm install       # una tantum
npm run dev       # genera le immagini poi avvia il server di sviluppo (HMR)
npm run build     # genera immagini → build di produzione → hash CSP
npm run preview   # serve dist/ localmente, per un ultimo controllo pre-deploy
npm run images:check   # simula la generazione immagini senza scrivere nulla
```

`npm run dev` e `npm run build` eseguono sempre prima `scripts/optimize-images.mjs`:
aggiungi o sostituisci una foto in `src/assets/img/` e le varianti responsive
vengono rigenerate automaticamente, senza altri passaggi manuali.

## 1. Come funzionano i partial (EJS)

`vite-plugin-html` compila ogni pagina con [EJS](https://ejs.co) prima che
Vite la serva/compili. La sintassi usata:

```html
<%- include('./src/partials/header.html', { variant: "home" }) %>
```

`<%- %>` inietta HTML grezzo (non lo esegue escaping), `<%= %>` stampa
testo con escaping automatico (usalo sempre per contenuti che potrebbero
contenere `<`, `>`, `&`), `<% %>` esegue JavaScript puro senza stampare
nulla (per `const`, `if`, `forEach`, ecc.). Ogni partial dichiara i propri
parametri opzionali con `typeof x !== "undefined"`, così può essere incluso
anche senza passare tutte le proprietà.

Il partial più importante è `src/partials/picture.html`: genera l'intero
markup `<picture>` (AVIF → WebP → JPEG, con `srcset`/`sizes` corretti)
a partire da pochi parametri:

```html
<%- include('./src/partials/picture.html', {
  base: "borsa-01",              // nome file senza estensione
  widths: [480, 800, 900],       // deve combaciare con l'output di optimize-images.mjs
  realWidth: 900, realHeight: 1200,  // dimensioni intrinseche → niente CLS
  alt: "Nuvola: pouch morbida in filato tortora…",
  sizes: "(min-width: 64em) 30vw, (min-width: 48em) 46vw, 90vw",
}) %>
```

Per l'hero, che serve un ritaglio diverso su mobile e desktop (art
direction, non solo ridimensionamento), c'è un partial dedicato:
`src/partials/hero-picture.html`.

## 2. Pipeline immagini (`scripts/optimize-images.mjs`)

Per ogni immagine in `src/assets/img/*.{jpg,jpeg,png}`:

1. Legge la larghezza reale con `sharp().metadata()`.
2. Genera le varianti alle larghezze `[480, 800, 1200, 1920]` **filtrate**
   a quelle ≤ larghezza reale, più sempre una variante a piena risoluzione.
3. Per ciascuna larghezza scrive **AVIF** (qualità 55), **WebP** (qualità 78)
   e **JPEG** (qualità 82, mozjpeg) in `public/assets/img/`.
4. Il file a piena risoluzione non ha suffisso (`hero.jpg`), le varianti
   ridotte usano `-w{larghezza}` (`hero-w800.jpg`): stessa convenzione già
   in uso nel sito attuale, per coerenza.
5. Il JPEG a piena risoluzione è sempre tenuto (fallback universale); le
   altre varianti JPEG vengono scartate solo se non fanno risparmiare
   almeno il 5% rispetto all'originale — AVIF e WebP sono sempre tenuti,
   perché su foto risultano quasi sempre più leggeri.

Icone a dimensione fissa (favicon, apple-touch-icon, icone PWA, og-cover)
**non** passano da questa pipeline: vivono direttamente in `public/assets/img/`,
perché non hanno bisogno di varianti responsive.

## 3. Font

`src/styles/fonts.scss` è la copia 1:1 di `fonts.css`: era già nello stato
che si chiede oggi a un font-loading "senior" —

- **self-hosted**, nessuna chiamata a Google Fonts (niente handshake TLS
  in più, niente terze parti nel path critico, GDPR-friendly);
- **`font-display: swap`** su ogni `@font-face`, così il testo è visibile
  subito con un font di sistema e si scambia quando arriva il woff2;
- **subsetting per range Unicode** (`unicode-range: U+0000-00FF, …`): ogni
  peso è diviso in `latin` / `latin-ext`, il browser scarica solo il file
  del sotto-insieme di caratteri che gli serve davvero.

L'unica cosa aggiunta in questo scaffold è il **preload mirato**: in
`src/partials/head-meta.html` vengono precaricati solo Jost 300 e Jost 400,
gli unici due pesi usati sopra la piega. Cormorant Garamond e i pesi
600/500 di Jost si caricano quando servono, senza bloccare nulla.

## 4. SCSS

`src/styles/main.scss` importa, con `@use … as *`, un partial per ciascuna
delle sezioni del sito (`src/styles/partials/_NN-nome.scss`, numerati
nell'ordine in cui compaiono nel markup; `_25` e `_26` sono le due sezioni
aggiunte dopo — collezioni e domande). Il primo import è
`_03-design-tokens.scss`: definisce le custom property CSS (`--c-espresso`,
`--fs-h1`, `--sp-4`, …) usate da tutti gli altri. Sono rimaste custom
property CSS, non variabili SCSS: servono a runtime (es. per il tema o per
JS che le legge), cosa che le variabili SCSS — risolte in fase di build —
non permettono.

Per estendere lo stile di una sezione, apri direttamente il suo partial
(es. `_11-collezione.scss` per la griglia delle borse); per aggiungerne una
nuova, crea `_NN-nome.scss` con il primo numero libero e aggiungi la riga
`@use` corrispondente in `main.scss`, nella posizione giusta rispetto
all'ordine delle sezioni nel markup — il numero nel nome è solo un
identificativo stabile, l'ordine reale è quello di `main.scss`. È il caso di
`_25-collezioni.scss` e `_26-domande.scss`, che in `main.scss` stanno
rispettivamente prima di `11-collezione` e prima di `17-contatti`.

## 5. Struttura della home

Le sezioni di `index.html`, nell'ordine in cui compaiono (gli `id` sono quelli
usati da header, menu, piè di pagina e JSON-LD: se ne cambi uno, cambiali
tutti):

| # | Sezione | `id` | Note |
|---|---|---|---|
| 1 | Hero | — | unica immagine con `fetchpriority="high"` e senza `loading="lazy"` |
| 2 | Marquee | — | decorativo, `aria-hidden`; il testo equivalente è in un paragrafo nascosto |
| 3 | Collezioni | `#collezioni` | le 9 linee, **griglia tipografica senza immagini**: di queste linee non esistono fotografie, ogni voce è già un link d'ordine su Instagram |
| 4 | Pezzi disponibili | `#pezzi` | ex `#collezione`: le 4 borse fotografate, con lightbox |
| 5 | Filosofia | `#filosofia` | titolo rivelato parola per parola (`data-split`) |
| 6 | Pilastri | — | **5 voci** in griglia `auto-fit` (3+2 da computer, 1 colonna sul telefono) |
| 7 | Banner | — | immagine a tutta larghezza con parallasse |
| 8 | Lavorazione | `#lavorazione` | i 4 passaggi |
| 9 | Dettagli | `#dettagli` | galleria + lightbox |
| 10 | Domande | `#domande` | 6 FAQ in `<details>`: si aprono senza JavaScript |
| 11 | Contatti | `#contatti` | CTA finale |

Due cose da sapere prima di modificare `index.html`:

- **Una sola fonte per i contenuti ripetuti.** Linee, pilastri, borse, passaggi,
  galleria e domande sono array JavaScript in cima al file: il markup e il
  blocco JSON-LD leggono gli stessi dati. Il testo delle risposte della FAQ
  **deve** coincidere parola per parola con quello del blocco `FAQPage`,
  altrimenti Google scarta il rich result — tenendo un array solo, non può
  divergere.
- **I pilastri non sono più un diagramma.** La versione precedente disegnava le
  linee di collegamento in SVG (`.diagram__lines`) e ne misurava la lunghezza
  con `getTotalLength()`: una composizione tarata su tre voci e una lettura di
  layout in più. Con cinque voci è una semplice griglia, senza SVG da tenere
  allineato al testo.

## 6. Sicurezza (`public/_headers`, `public/_redirects`)

`public/_headers` applica, su tutte le pagine:

- **CSP restrittiva**: `default-src 'self'`, niente `unsafe-inline` per gli
  script (i blocchi JSON-LD sono autorizzati per hash SHA-256, calcolati
  automaticamente da `scripts/csp-hash.mjs` dopo ogni build — vedi sopra),
  `frame-ancestors 'none'`, `object-src 'none'`, `frame-src`/`media-src`/
  `worker-src` a `'none'` perché il sito non li usa.
- **HSTS** con `preload`, **X-Frame-Options: DENY**, **X-Content-Type-Options:
  nosniff**, **Referrer-Policy: strict-origin-when-cross-origin**.
- **Permissions-Policy** che disattiva fotocamera, microfono, geolocalizzazione,
  USB, pagamenti e tutto ciò che il sito non usa.
- **Cross-Origin-Opener-Policy / -Resource-Policy / -Embedder-Policy** per
  isolare il sito da attacchi cross-origin (Spectre-style side channel inclusi).

Cache-Control differenziata:

- `/assets/js/*` e `/assets/css/*` → `immutable`, un anno: il nome del file
  contiene l'hash del contenuto (`main-BLAUZlfn.js`), quindi un contenuto
  diverso genera sempre un nome diverso e non serve mai invalidare la cache.
- `/assets/img/*` → un mese, `stale-while-revalidate`: le immagini
  mantengono lo stesso nome quando il sorgente non cambia, quindi restano
  cache-abili a lungo ma senza il rischio di un `immutable` su un nome
  potenzialmente riusato.
- `/assets/fonts/*` → `immutable`, un anno: i font non cambiano mai a
  parità di nome.
- Le pagine `.html` → `max-age=0, must-revalidate`: un nuovo deploy deve
  essere visibile subito.

Se in futuro riattivi Cloudflare Web Analytics (vedi `cookie.html` sul
sito attuale), ricordati di aggiungere `https://static.cloudflareinsights.com`
a `script-src` e `https://cloudflareinsights.com` a `connect-src` in
`public/_headers` — qui sono stati tolti perché questo scaffold non carica
ancora nessuno script di terze parti.

`public/_redirects` gestisce le scorciatoie (`/instagram`, `/ig`), le
varianti di scrittura delle pagine legali, e include un esempio commentato
di fallback SPA (`/app/* /app/index.html 200`) da attivare solo se in futuro
una sezione del sito diventasse un'app lato client.

## 7. Deploy su Cloudflare Pages

- **Comando di build**: `npm run build`
- **Directory di output**: `dist`
- **Root directory** (se il repo resta con `public/` e `vite-app/` affiancati):
  `vite-app`

Finché non sostituisci `public/` con l'output di questo scaffold, il
progetto Cloudflare Pages collegato al dominio deve continuare a puntare a
`public/`: questa cartella è un ambiente di sviluppo/anteprima, non ancora
il sito in produzione.
