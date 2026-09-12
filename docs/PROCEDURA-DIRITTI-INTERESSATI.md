# Come rispondere a chi esercita i propri diritti

Quando un cliente scrive «voglio sapere che dati avete su di me» o «cancellate
i miei dati», scatta un obbligo con un termine preciso. Questa pagina dice cosa
fare, in ordine, senza doverci pensare nel momento.

**Il termine è un mese** dalla richiesta (art. 12.3 GDPR). Prorogabile di due
mesi per richieste complesse, ma solo **avvisando entro il primo mese** e
spiegando perché. Nessuna di queste richieste, su un negozio di questa
dimensione, è complessa: si risponde entro pochi giorni.

**È gratuito.** Si può chiedere un contributo solo per richieste
manifestamente infondate o ripetitive, ed è un caso che in pratica non si
verifica. Non chiedere soldi.

---

## Passo 1 — Riconoscere la richiesta

Non serve che usi parole giuridiche. Vale come richiesta qualunque messaggio
che chieda, anche in modo informale:

| Se scrive… | Sta esercitando |
|---|---|
| «che dati avete su di me?» | **Accesso** (art. 15) |
| «il mio indirizzo è sbagliato» | **Rettifica** (art. 16) |
| «cancellate tutto» | **Cancellazione** (art. 17) |
| «non usate i miei dati per X» | **Limitazione / opposizione** (artt. 18 e 21) |
| «mandatemi i miei dati in un file» | **Portabilità** (art. 20) |

Vale da qualunque canale: e-mail, PEC, messaggio su Instagram. **Non si può
rispondere «scriva alla PEC»**: la richiesta è valida da dove arriva.

## Passo 2 — Verificare chi è

Si può chiedere una verifica **solo se c'è un dubbio ragionevole**
sull'identità (art. 12.6), e va chiesto il minimo indispensabile.

- **Se scrive dall'indirizzo e-mail con cui ha ordinato**: nessuna verifica.
  Quell'indirizzo è già la prova.
- **Se scrive da un altro indirizzo o da Instagram**: chiedere il **numero
  d'ordine** e l'indirizzo e-mail usato. Bastano.
- **Mai chiedere una copia del documento d'identità** per una richiesta di
  questo tipo: sarebbe raccogliere più dati di quelli che si sta per
  cancellare, ed è esattamente il contrario di quello che il GDPR chiede.

## Passo 3 — Eseguire

Tutti i comandi si eseguono dalla cartella del progetto. `--remote` agisce sul
database di produzione: **si scrive sempre, altrimenti si opera per sbaglio
sulla copia locale e non succede niente di vero.**

### Accesso e portabilità — «che dati avete?»

Si esporta tutto in JSON, che l'art. 20 considera un formato strutturato, di
uso comune e leggibile da dispositivo automatico.

```bash
npx wrangler@4 d1 execute emmelu --remote --json \
  --command="SELECT numero, stato, metodo_pagamento, creato_il, nome, cognome, email, telefono, via, civico, cap, citta, provincia, note, subtotale_cent, spedizione_cent, supplemento_cent, iva_cent, totale_cent, corriere, tracciatura, consenso_versione, consenso_il FROM ordini WHERE email = 'indirizzo@del.cliente'" \
  > accesso-cliente.json

npx wrangler@4 d1 execute emmelu --remote --json \
  --command="SELECT r.sku, r.nome_prodotto, r.nome_variante, r.personalizzazione, r.prezzo_unitario_cent, r.quantita, r.totale_cent FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id WHERE o.email = 'indirizzo@del.cliente'" \
  >> accesso-cliente.json
```

Si manda il file **all'indirizzo da cui è arrivata la richiesta**, insieme a
una risposta che dice, in parole semplici: quali dati ci sono, perché li
abbiamo (esecuzione del contratto e obbligo fiscale), per quanto li teniamo
(10 anni), a chi li comunichiamo (Cloudflare, corriere, PayPal, fornitore di
posta) e che ha diritto di reclamare al Garante.

> La funzione `esportaDatiPersona()` in `src/gdpr.js` fa la stessa cosa in un
> colpo solo, e produce già il JSON completo con le righe annidate. Va
> richiamata da una rotta amministrativa quando servirà più spesso.

### Rettifica — «il mio indirizzo è sbagliato»

Se l'ordine non è ancora partito, si corregge e basta. È la richiesta più
semplice e la più frequente.

```bash
npx wrangler@4 d1 execute emmelu --remote \
  --command="UPDATE ordini SET via='Via Giusta', civico='5', cap='75100', citta='Matera', provincia='MT', aggiornato_il=datetime('now') WHERE numero='EL-2026-0001'"
```

Se l'ordine è già stato spedito, il dato storico resta com'era — è un
documento — ma si annota l'accaduto negli eventi dell'ordine.

### Cancellazione — «cancellate tutto»

**Questa è la parte delicata, e va spiegata al cliente, non solo eseguita.**

Non si cancella l'ordine: si cancella la **persona**. L'art. 17.3.b esclude il
diritto alla cancellazione quando il trattamento è necessario per adempiere un
obbligo legale, e l'art. 2220 del Codice civile impone dieci anni di
conservazione delle scritture. Le due norme non sono in conflitto: si
sovrascrivono nome, cognome, e-mail, telefono, indirizzo e il testo della
personalizzazione; restano numero, data e importi, che non identificano più
nessuno.

**Dal pannello** (la via normale): `/admin/ordine/EL-2026-XXXX` → sezione
«Dati personali» → spuntare la conferma → *Anonimizza*. Va ripetuto per ogni
ordine di quella persona.

**Da riga di comando**, per più ordini insieme:

```bash
npx wrangler@4 d1 execute emmelu --remote \
  --command="SELECT numero FROM ordini WHERE email='indirizzo@del.cliente' AND anonimizzato_il IS NULL"
# poi, per ciascun numero, l'azione dal pannello
```

**Risposta da mandare** (testo pronto, da adattare):

> Ho ricevuto la sua richiesta e l'ho eseguita il GG/MM/AAAA.
>
> Ho cancellato definitivamente il suo nome, il suo indirizzo, la sua e-mail e
> il suo numero di telefono dai miei archivi. Non sono recuperabili.
>
> Resta registrato l'ordine in quanto documento contabile — numero, data e
> importo — perché la legge italiana mi obbliga a conservare le scritture per
> dieci anni (art. 2220 del Codice civile, richiamato dall'art. 17.3.b del
> GDPR). Quel documento non contiene più alcun dato che la identifichi.
>
> Se ritiene che io non abbia agito correttamente può rivolgersi al Garante
> per la protezione dei dati personali: www.garanteprivacy.it

### Limitazione e opposizione

Su questo negozio hanno portata ridotta, perché non c'è marketing né
profilazione: non c'è nulla a cui opporsi oltre al trattamento necessario al
contratto. Se arriva una richiesta del genere, di solito significa che la
persona vuole in realtà la cancellazione: **chiedere che cosa desidera
ottenere**, invece di applicare l'etichetta giuridica sbagliata.

## Passo 4 — Registrare

Ogni richiesta va annotata in un file (anche un semplice foglio) con: data di
arrivo, canale, che cosa chiedeva, che cosa è stato fatto, data della risposta.
Serve a dimostrare la conformità (art. 5.2) e richiede trenta secondi.

## Casi in cui NON si esegue

- **Richiesta da un terzo** che non è l'interessato: si rifiuta, spiegando.
- **Cancellazione di un ordine ancora aperto**: prima si conclude o si annulla
  l'ordine, poi si anonimizza. Cancellare l'indirizzo di un pacco in viaggio
  impedirebbe di consegnarlo o di gestire un reso.
- **Richiesta di cancellare i dati fiscali**: non si può, ed è un obbligo di
  legge — si spiega, come nel testo qui sopra.

## Se qualcosa non torna

In caso di dubbio reale conviene sentire un consulente prima di rispondere:
una risposta sbagliata data in fretta è peggio di una risposta corretta data
al venticinquesimo giorno. Il Garante mette a disposizione modulistica e FAQ
su **www.garanteprivacy.it**.
