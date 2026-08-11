# ELLEBI — sito vetrina delle borse fatte a mano

Landing page statica che racconta le borse artigianali ELLEBI. **Non è un negozio**:
non ci sono carrello, prezzi o moduli d'ordine. L'obiettivo è mostrare i pezzi e
portare chi guarda su Instagram o Vinted.

Nessun framework, nessuna dipendenza da installare: HTML, CSS e JavaScript scritti a mano.
Si pubblica su Cloudflare Pages a ogni commit.

---

## 1. Struttura del progetto

```
.
├── index.html              pagina principale
├── privacy.html            informativa privacy (GDPR)
├── cookie.html             cookie policy
├── accessibilita.html      dichiarazione di accessibilità
├── 404.html                pagina di errore
├── _headers                intestazioni di sicurezza e cache (Cloudflare Pages)
├── _redirects              scorciatoie e reindirizzamenti (Cloudflare Pages)
├── robots.txt              regole per i motori di ricerca
├── sitemap.xml             mappa del sito
├── site.webmanifest        icone e nome per l'installazione su telefono
├── favicon.svg             icona della scheda del browser
├── .well-known/
│   └── security.txt        contatto per segnalazioni di sicurezza
├── tools/
│   └── aggiorna-csp-hash.py  rigenera l'hash CSP del blocco dati strutturati
└── assets/
    ├── css/fonts.css       font self-hosted (@font-face)
    ├── css/style.css       tutto lo stile del sito
    ├── js/head.js          micro-script: segnala che JavaScript è attivo
    ├── js/main.js          animazioni, menu, lightbox, consenso cookie
    ├── fonts/              Jost e Cormorant Garamond in formato woff2
    └── img/                immagini (attualmente segnaposto)
```

---

## 2. Immagini da sostituire

Tutte le immagini in `assets/img/` sono **segnaposto generati**: hanno lo stile
giusto ma vanno rimpiazzate con le foto vere. Basta sovrascrivere i file
mantenendo **gli stessi nomi** — non serve toccare l'HTML.

| File | Dove appare | Formato consigliato | Soggetto |
|---|---|---|---|
| `hero.jpg` | schermata iniziale | 1920 × 1280, orizzontale | la foto più bella: borsa tenuta in mano, luce naturale |
| `borsa-01.jpg` … `borsa-04.jpg` | griglia della collezione | 900 × 1200, verticale | una borsa per foto, sfondo pulito |
| `borsa-01b.jpg` … `borsa-04b.jpg` | compaiono al passaggio del mouse | 900 × 1200, verticale | **stessa borsa da un'altra angolazione** |
| `atelier.jpg` | fascia a tutta larghezza | 1920 × 1080, orizzontale | borsa in lavorazione, filato, uncinetto |
| `step-01.jpg` … `step-04.jpg` | i 4 passaggi | 1200 × 900, orizzontale | filati / lavorazione / rifiniture / borsa finita |
| `gallery-01.jpg` … `gallery-06.jpg` | “Dallo studio” | 800 × 800, quadrata | dettagli, lavori in corso, tavolo da lavoro |
| `og-cover.jpg` | anteprima quando il link viene condiviso | 1200 × 630 | immagine con il logo, leggibile in piccolo |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | icona su telefono | quadrate | logo ELLEBI su sfondo cipria |

Consigli pratici:

- esporta in JPEG qualità 80-85: sotto i 300 KB per foto, il sito resta veloce;
- mantieni le **proporzioni indicate**, altrimenti l'immagine viene ritagliata al centro;
- se cambi il soggetto di una foto, aggiorna anche il testo `alt` nell'HTML: è la
  descrizione che leggono i lettori di schermo e i motori di ricerca.

---

## 3. Testi e dati da completare prima di pubblicare

Cerca questi valori e sostituiscili con quelli reali:

| Da sostituire | Dove | Nota |
|---|---|---|
| `info@ellebi.it` | tutte le pagine, `.well-known/security.txt` | l'indirizzo e-mail pubblico |
| `[nome e cognome del titolare]`, `[indirizzo completo]` | `privacy.html`, `cookie.html` | obbligatori per il GDPR |
| `https://www.vinted.it/member/65695128` | `index.html`, `_redirects` | **da verificare**: nella bio Instagram il link è troncato |
| `https://ellebi.it/` | meta tag, `sitemap.xml`, `robots.txt` | se il dominio finale è diverso |
| nomi e descrizioni delle borse | sezione “La collezione” in `index.html` | ora ci sono nomi di esempio |

Se modifichi il blocco `application/ld+json` in `index.html`, esegui poi:

```bash
python3 tools/aggiorna-csp-hash.py
```

così l'hash nella Content-Security-Policy torna corretto (altrimenti il browser
blocca quel blocco di dati strutturati).

---

## 4. Pubblicazione su Cloudflare Pages

Il sito è statico: **non serve alcun comando di build**.

1. Cloudflare Dashboard → **Workers & Pages** → *Create* → **Pages** → *Connect to Git*.
2. Scegli il repository `CristianCaputo04/Ellebi.it` e il ramo da pubblicare.
3. Impostazioni di build:
   - *Framework preset*: **None**
   - *Build command*: **vuoto**
   - *Build output directory*: **`/`** (la radice del repository)
4. *Save and Deploy*. Da qui in poi ogni commit sul ramo pubblica una nuova versione.
5. **Custom domains** → aggiungi `ellebi.it` e `www.ellebi.it`; se il dominio è già
   su Cloudflare i record DNS vengono creati in automatico.

I file `_headers` e `_redirects` vengono letti da Cloudflare Pages al momento del
deploy: non vanno inseriti nel dominio come regole separate.

### Statistiche di visita (facoltative)

Il sito non carica alcuno strumento di analisi. Per attivare Cloudflare Web
Analytics (senza cookie):

1. Cloudflare Dashboard → **Web Analytics** → aggiungi il sito e copia il token.
2. In `assets/js/main.js` cerca `var ANALYTICS_TOKEN = "";` e incolla il token.

Lo script viene caricato **solo dopo il consenso** espresso nel banner. Lasciando
il valore vuoto, non parte nessuna richiesta di statistica.

---

## 5. Cosa è già stato curato

**Sicurezza** — Content-Security-Policy restrittiva (niente script o stili inline
generici, niente risorse di terze parti), HSTS con preload, `X-Frame-Options: DENY`,
`nosniff`, Referrer-Policy, Permissions-Policy con tutte le API sensibili negate,
policy cross-origin, `security.txt`. Ogni link esterno usa `rel="noopener noreferrer"`.

**Privacy e GDPR** — nessun modulo, nessun cookie di profilazione, nessuna risorsa
esterna: i font sono ospitati sul sito, quindi il browser non contatta Google.
Il banner permette accettazione, rifiuto e scelta granulare con la stessa evidenza,
la scelta è revocabile in ogni momento dal pulsante “Preferenze cookie” in fondo
alle pagine, e nessuno strumento facoltativo parte prima del consenso.
Privacy policy e cookie policy sono già scritte in italiano.

**Accessibilità** — impostazione WCAG 2.2 AA: struttura semantica, link di salto,
navigazione completa da tastiera con gestione del focus in menu e lightbox,
chiusura con `Esc`, contrasti verificati, testi alternativi, rispetto delle
preferenze *riduzione del movimento* e *contrasto elevato*. Verificato con
axe-core: **0 violazioni** su tutte le pagine. Il sito resta leggibile e navigabile
anche senza JavaScript.

**SEO** — titoli e descrizioni per ogni pagina, URL canonici, Open Graph e Twitter
Card, dati strutturati JSON-LD (Organization, WebSite, WebPage, ItemList),
`sitemap.xml`, `robots.txt`, lingua `it-IT`, HTML validato dal W3C senza errori.

**Prestazioni** — nessuna libreria esterna: circa 21 KB di codice compresso in
totale. Font self-hosted in woff2 con `preload`, immagini con dimensioni
dichiarate (niente salti di layout) e caricamento differito, animazioni su
`transform`/`opacity` sincronizzate con `requestAnimationFrame`, cache lunga per
font e immagini, HTML sempre riconvalidato.

**Compatibilità** — layout fluido verificato su telefono (390 px), tablet (834 px)
e desktop (1440 px), con menu a tutta pagina sotto i 992 px e supporto ai gesti
di scorrimento nella lightbox.

---

## 6. Provare il sito in locale

```bash
python3 -m http.server 8080
# poi apri http://localhost:8080
```

Per provarlo con le stesse intestazioni di sicurezza della produzione serve un
server che legga `_headers`; in alternativa si controlla direttamente
sull'anteprima di Cloudflare Pages, che le applica già.
