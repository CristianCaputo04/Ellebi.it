# ELLEBI — sito vetrina delle borse fatte a mano

Landing page statica che mostra le borse artigianali ELLEBI. **Non è un negozio**:
niente carrello, niente prezzi, niente moduli d'ordine. Le chiamate all'azione
portano al profilo Vinted, dove stanno i pezzi ancora disponibili.

Nessun framework, nessuna dipendenza da installare: HTML, CSS e JavaScript scritti
a mano. Si pubblica su Cloudflare Workers a ogni commit.

---

## 1. Struttura del progetto

**Va online solo il contenuto di `public/`.** Tutto il resto — README, script di
servizio, cronologia Git — resta privato.

```
.
├── public/                 ← QUESTO è il sito pubblicato
│   ├── index.html          pagina principale
│   ├── privacy.html        informativa privacy
│   ├── cookie.html         cookie policy + riepilogo della scelta attiva
│   ├── accessibilita.html  dichiarazione di accessibilità
│   ├── 404.html            pagina di errore
│   ├── _headers            intestazioni di sicurezza e cache
│   ├── _redirects          scorciatoie e reindirizzamenti
│   ├── robots.txt          regole per i motori di ricerca
│   ├── sitemap.xml         mappa del sito
│   ├── site.webmanifest    icone e nome per l'installazione su telefono
│   ├── favicon.svg         icona della scheda del browser
│   ├── .well-known/
│   │   └── security.txt    contatto per segnalazioni di sicurezza
│   └── assets/
│       ├── css/fonts.css   font self-hosted (@font-face)
│       ├── css/style.css   tutto lo stile del sito
│       ├── js/head.js      micro-script: segnala che JavaScript è attivo
│       ├── js/main.js      animazioni, menu, lightbox, consenso cookie
│       ├── fonts/          Jost e Cormorant Garamond in formato woff2
│       └── img/            foto delle borse, icone, anteprima social
│
├── wrangler.toml           configurazione della pubblicazione su Cloudflare
├── .github/workflows/      pubblicazione automatica a ogni commit
└── tools/
    └── aggiorna-csp-hash.py  rigenera l'hash CSP del blocco dati strutturati
```

---

## 2. Le quattro borse

I nomi sono usati nel sito, nei testi alternativi e nei dati strutturati.

| Nome | Descrizione | File principale |
|---|---|---|
| **Nuvola** | Pouch morbida in filato tortora | `borsa-01.jpg` |
| **Perla** | Mini bag cacao, manico rigido, tre perle cucite a mano | `borsa-02.jpg` |
| **Sera** | Pouch cioccolato con filo lurex | `borsa-03.jpg` |
| **Cacao** | Pouch capiente in cioccolato opaco | `borsa-04.jpg` |

Per rinominare una borsa vanno aggiornati tre punti in `public/index.html`: la scheda
nella sezione “Collezione” (nome, testo `alt`, didascalia della lightbox), i testi
alternativi nelle altre sezioni e il blocco `application/ld+json` nell'`<head>`
(poi ricalcolare l'hash, vedi punto 4).

---

## 3. Le immagini

Tutte le immagini derivano dalle **quattro foto originali** delle borse: ogni
file del sito è un ritaglio diverso (scheda, dettaglio al passaggio del mouse,
passaggi di lavorazione, galleria). I metadati EXIF — data, modello di telefono,
posizione GPS — sono stati rimossi in fase di esportazione.

| File | Dove appare | Formato | Ricavato da |
|---|---|---|---|
| `hero.jpg` | schermata iniziale (desktop e tablet) | 1920 × 1280 | Nuvola |
| `hero-mobile.jpg` | schermata iniziale sotto i 768 px | 1000 × 1400 | Nuvola |
| `borsa-01…04.jpg` | schede della collezione | 900 × 1200 | una per borsa |
| `borsa-01b…04b.jpg` | seconda foto al passaggio del mouse | 900 × 1200 | dettaglio della stessa borsa |
| `atelier.jpg` | fascia a tutta larghezza | 1920 × 1080 | Sera |
| `step-01…04.jpg` | i quattro passaggi | 1200 × 900 | dettagli delle quattro borse |
| `gallery-01…06.jpg` | sezione “Dettagli” | 800 × 800 | ritagli ravvicinati |
| `og-cover.jpg` | anteprima quando il link viene condiviso | 1200 × 630 | Nuvola + scritta |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | icona su telefono | quadrate | logo |

**Per aggiungere o cambiare una borsa**: sovrascrivi il file mantenendo lo stesso
nome e le stesse proporzioni (altrimenti l'immagine viene ritagliata al centro),
esporta in JPEG qualità 80-85 restando sotto i 250 KB, e aggiorna il testo `alt`
nell'HTML: è quello che leggono i lettori di schermo e i motori di ricerca.

---

## 4. Dati del titolare

Già inseriti nel sito:

| Dato | Valore |
|---|---|
| Titolare del trattamento | ELLEBI — Lucy Basilicata |
| E-mail pubblica | `ellebi.style@gmail.com` |

L'**indirizzo postale non è pubblicato**. Il GDPR (art. 13) chiede identità e
recapiti del titolare, non necessariamente l'indirizzo di casa: la privacy policy
dichiara che viene comunicato a chi lo richiede via e-mail. Se in futuro ci fosse
una sede o una partita IVA, conviene indicarla per esteso in `public/privacy.html`.

Resta da aggiornare solo se il dominio finale cambiasse: `https://ellebi.it/`
compare nei meta tag, in `sitemap.xml`, in `robots.txt` e nei dati strutturati.

Profili collegati (già corretti nel sito): Vinted
`https://www.vinted.it/member/65695128-pinkstraw7` e Instagram `@ellebi.it`.

Se modifichi il blocco `application/ld+json` in `public/index.html`, esegui poi:

```bash
python3 tools/aggiorna-csp-hash.py
```

così l'hash nella Content-Security-Policy torna corretto (altrimenti il browser
blocca quel blocco di dati strutturati).

---

## 5. Pubblicazione su Cloudflare Workers

Il sito è statico: **non serve alcun comando di build**. Cloudflare pubblica
direttamente i file di `public/`, secondo `wrangler.toml`.

La pubblicazione avviene da sola: **ogni commit sul ramo `main` manda il sito
online**, tramite il workflow `.github/workflows/deploy.yml`.

Perché funzioni servono due segreti nel repository GitHub
(*Settings → Secrets and variables → Actions*):

| Nome del segreto | Dove si trova su Cloudflare |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Workers & Pages → colonna di destra, *Account ID* |
| `CLOUDFLARE_API_TOKEN` | My Profile → API Tokens → *Create Token* → modello **Edit Cloudflare Workers** |

Per pubblicare a mano, dalla cartella principale:

```bash
npx wrangler@4 deploy
```

Per controllare la configurazione senza pubblicare nulla:

```bash
npx wrangler@4 deploy --dry-run
```

I file `public/_headers` e `public/_redirects` vengono letti da Cloudflare al
momento della pubblicazione: non vanno reinseriti come regole del dominio.

### Indirizzi del sito

| Indirizzo | A cosa serve |
|---|---|
| `ellebi-it.cristiancaputo04.workers.dev` | indirizzo tecnico, creato da Cloudflare |
| `ellebi.it.capfyweb.com` | anteprima, per vedere e mostrare il sito |
| `ellebi.it` | **indirizzo definitivo, ancora da collegare** |

Le anteprime non vengono indicizzate dai motori di ricerca: ogni pagina dichiara
`https://ellebi.it/` come proprio indirizzo canonico, quindi Google sa che quelle
non sono la versione buona. Per questo i canonical **non vanno cambiati** finché
l'indirizzo definitivo resta `ellebi.it`.

### Collegare ellebi.it

Oggi `ellebi.it` è registrato ma punta altrove e non serve alcun sito. Per
portarlo qui:

1. Cloudflare Dashboard → **Add a domain** → `ellebi.it` (piano Free).
2. Cloudflare mostra due nameserver: vanno inseriti **presso il registrar dove
   ellebi.it è registrato**, al posto di quelli attuali. La propagazione
   richiede da qualche ora a un giorno.
3. A zona attiva: Worker `ellebi-it` → **Domini** → *Aggiungi dominio* →
   `ellebi.it`, poi di nuovo con `www.ellebi.it`. Il certificato HTTPS viene
   emesso da solo.
4. Infine, per spegnere l'indirizzo `workers.dev`, aggiungi a `wrangler.toml`:

   ```toml
   workers_dev = false
   ```

Nessuno di questi passaggi tocca `capfyweb.com`: i domini personalizzati valgono
per il singolo Worker.

### Statistiche di visita (facoltative)

Il sito non carica alcuno strumento di analisi. Per attivare Cloudflare Web
Analytics (senza cookie):

1. Cloudflare Dashboard → **Web Analytics** → aggiungi il sito e copia il token.
2. In `public/assets/js/main.js` cerca `var ANALYTICS_TOKEN = "";` e incolla il token.

Lo script parte **solo dopo il consenso** espresso nel banner. Lasciando il valore
vuoto, non parte alcuna richiesta di statistica.

---

## 6. Privacy e consenso: come è impostato

Il sito è costruito per stare tranquillo anche con le regole più severe sul
consenso: nessun modulo, nessun cookie di profilazione, nessuna risorsa caricata
da server di terze parti (i font sono ospitati qui, quindi il browser non
contatta Google).

Il banner applica queste regole:

- **niente prima del consenso**: nessuno strumento facoltativo viene caricato finché non decidi;
- **rifiutare costa quanto accettare**: “Accetta tutto” e “Rifiuta tutto” hanno lo stesso peso visivo, più la scelta voce per voce;
- **prova del consenso**: scelta, data, versione e scadenza restano nel tuo browser (`ellebi-consent-v2`) e non vengono mai inviate a nessun server;
- **scadenza a 6 mesi**: dopo, la scelta viene richiesta di nuovo (niente consensi eterni e niente banner a ogni visita);
- **segnali del browser**: se arriva un segnale di rifiuto *Global Privacy Control* o *Do Not Track*, vale come rifiuto — il banner non chiede nulla e non si carica niente;
- **revoca sempre disponibile**: pulsante “Preferenze cookie” in fondo a ogni pagina, con il riepilogo della scelta attiva in cima alla cookie policy.

Privacy policy, cookie policy e dichiarazione di accessibilità sono già scritte in
italiano e vanno solo completate con i dati del titolare.

---

## 7. Cosa è già stato curato

**Sicurezza** — Content-Security-Policy restrittiva (niente script o stili inline
generici, niente risorse esterne), HSTS con preload, `X-Frame-Options: DENY`,
`nosniff`, Referrer-Policy, Permissions-Policy con tutte le API sensibili negate,
policy cross-origin, `security.txt`. Ogni link esterno usa `rel="noopener noreferrer"`.

**Accessibilità** — impostazione WCAG 2.2 AA: struttura semantica, link di salto,
navigazione completa da tastiera con gestione del focus in menu e lightbox,
chiusura con `Esc`, contrasti verificati, testi alternativi descrittivi, rispetto
delle preferenze *riduzione del movimento* e *contrasto elevato*. Verificato con
axe-core: **0 violazioni** su tutte le pagine. Il sito resta leggibile e navigabile
anche senza JavaScript.

**SEO** — titoli e descrizioni per ogni pagina, URL canonici, Open Graph e Twitter
Card, dati strutturati JSON-LD (Organization, WebSite, WebPage, ItemList con le
quattro borse), `sitemap.xml`, `robots.txt`, lingua `it-IT`, HTML validato dal W3C
senza errori.

**Prestazioni** — nessuna libreria esterna: circa 22 KB di codice compresso. Font
self-hosted in woff2 con `preload`, foto con dimensioni dichiarate (niente salti di
layout) e caricamento differito, ritaglio verticale dedicato al telefono, animazioni
su `transform`/`opacity` sincronizzate con `requestAnimationFrame`, cache lunga per
font e immagini, HTML sempre riconvalidato.

**Compatibilità** — layout fluido verificato su telefono (390 px), tablet (834 px)
e desktop (1440 px), menu a tutta pagina sotto i 992 px, gesti di scorrimento nella
lightbox.

---

## 8. Provare il sito in locale

Con lo stesso motore usato in produzione (legge anche `_headers` e `_redirects`):

```bash
npx wrangler@4 dev
```

Oppure, per una semplice occhiata senza installare nulla:

```bash
cd public && python3 -m http.server 8080
# poi apri http://localhost:8080
```
