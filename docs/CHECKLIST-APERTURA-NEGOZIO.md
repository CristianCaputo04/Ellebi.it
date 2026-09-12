# Che cosa serve prima di aprire il negozio

Il sito è pronto e funziona, ma **è spento**. Finché `NEGOZIO_ATTIVO` vale
`"0"` si vedono catalogo e prezzi, e chi vuole ordinare viene mandato su
Instagram — esattamente come prima.

Il motivo per cui è spento non è tecnico: **incassare online senza partita IVA
è un illecito**. Questa pagina elenca, in ordine, tutto quello che serve per
accenderlo. È scritta per essere letta da chi non programma.

Il codice ha una protezione: anche se qualcuno mettesse `NEGOZIO_ATTIVO = "1"`
per sbaglio, il negozio **resta chiuso** finché ragione sociale e partita IVA
sono vuote, e la cosa finisce nei log.

---

## Parte 1 — Burocrazia (senza questa, il resto non serve)

Sono passaggi da fare con un **commercialista**. Costano qualche centinaio di
euro l'anno fra contributi e consulenza: è il conto che va fatto prima di
decidere se vale la pena.

- [ ] **1. Aprire la partita IVA.** Per un'attività artigianale di questo tipo
      il codice ATECO va scelto insieme al commercialista in base a cosa si
      vende davvero (confezione di articoli in tessuto, articoli di pelletteria,
      bigiotteria: sono codici diversi). Valutare con lui il **regime
      forfettario**, che sotto i 85.000 € di ricavi semplifica molto.
      **Obbligatorio.**
- [ ] **2. Iscriversi al Registro delle Imprese** presso la Camera di Commercio,
      sezione artigiani, e ottenere il **numero REA**. **Obbligatorio.**
- [ ] **3. Iscriversi alla gestione artigiani INPS.** **Obbligatorio.**
- [ ] **4. Presentare la SCIA** al Comune per il commercio elettronico
      (SUAP). **Obbligatorio**, di solito gratuito e telematico.
- [ ] **5. Attivare una PEC.** Serve per legge ed è il recapito ufficiale.
      **Obbligatorio.**
- [ ] **6. Ottenere il codice destinatario SDI** per la fatturazione
      elettronica, dal software di fatturazione o dal commercialista.
      **Obbligatorio.**
- [ ] **7. Verificare l'obbligo del registratore telematico.** Nella vendita a
      distanza di norma non serve, ma va confermato con il commercialista in
      base al regime scelto. **Da chiarire.**
- [ ] **8. Valutare un'assicurazione di responsabilità civile prodotti.**
      **Consigliata**, non obbligatoria.

## Parte 2 — Conti da aprire

- [ ] **9. Conto PayPal Business** (non quello personale). Serve per incassare
      e per ottenere le chiavi dell'applicazione. **Obbligatorio** se si vuole
      PayPal.
- [ ] **10. Creare l'applicazione PayPal** su `developer.paypal.com` →
      *Apps & Credentials*. Servono **Client ID** e **Secret**, prima in
      *Sandbox* per le prove e poi in *Live*. **Obbligatorio.**
- [ ] **11. Configurare il webhook PayPal**: indirizzo
      `https://ellebi.it/api/paypal/webhook`, eventi
      `PAYMENT.CAPTURE.COMPLETED` e `CHECKOUT.ORDER.APPROVED`. Annotare il
      **Webhook ID**. **Obbligatorio**: senza, un pagamento andato a buon fine
      con la finestra chiusa a metà resterebbe non registrato.
- [ ] **12. Aprire un conto per la posta transazionale** (Resend o Brevo, ha
      entrambi un piano gratuito sufficiente) e **verificare il dominio**
      `ellebi.it` con i record SPF e DKIM che il fornitore indica.
      **Obbligatorio**, altrimenti le conferme d'ordine finiscono nello spam.
- [ ] **13. Scegliere il corriere** e verificare le tariffe reali, poi
      allinearle in `migrazioni/0002-dati-iniziali.sql` o dal database. Le
      tariffe attuali sono **stime**. **Obbligatorio.**

## Parte 3 — Adempimenti privacy

- [ ] **14. Firmare il DPA con Cloudflare** (dal pannello Cloudflare).
- [ ] **15. Firmare il DPA con il fornitore di posta.**
- [ ] **16. Nominare per iscritto il commercialista** responsabile del
      trattamento (art. 28 GDPR). Il modello lo ha lui.
- [ ] **17. Compilare i segnaposto** in `docs/REGISTRO-TRATTAMENTI.md` con i
      dati reali, e indicare il corriere scelto per nome nella privacy policy.
- [ ] **18. Leggere `docs/PROCEDURA-DIRITTI-INTERESSATI.md` e
      `docs/PROCEDURA-VIOLAZIONI.md`** una volta, prima che servano. Sono due
      pagine, e il giorno in cui servono non c'è tempo di leggerle.

## Parte 4 — Decisioni commerciali

- [ ] **19. Stabilire i prezzi.** Quelli in database sono **stime inventate**
      (80-95 €): vanno confermati uno per uno.
- [ ] **20. Pesare i pezzi imballati** e correggere il peso di ogni variante:
      determina la tariffa di spedizione, e sbagliarlo per difetto significa
      spedire in perdita su ogni pacco.
- [ ] **21. Decidere la soglia di spedizione gratuita** (ora 150 €) e il
      **supplemento del contrassegno** (ora 5 €).
- [ ] **22. Fotografare i pezzi delle altre otto linee.** Oggi il catalogo
      contiene solo le quattro borse fotografate: le altre linee esistono come
      categorie ma sono vuote.

## Parte 5 — Passaggi tecnici

Da eseguire dalla cartella del progetto, **in questo ordine**.

- [ ] **23. Creare il database** e incollare l'identificativo in
      `wrangler.toml` al posto del segnaposto:
      ```bash
      npx wrangler@4 d1 create emmelu
      ```
- [ ] **24. Applicare le migrazioni:**
      ```bash
      npx wrangler@4 d1 execute emmelu --remote --file=migrazioni/0001-schema.sql
      npx wrangler@4 d1 execute emmelu --remote --file=migrazioni/0002-dati-iniziali.sql
      ```
- [ ] **25. Impostare i segreti** (uno per volta, incollando il valore quando
      viene chiesto):
      ```bash
      node tools/genera-password-admin.mjs 'una-password-lunga-e-solo-per-qui'
      npx wrangler@4 secret put ADMIN_PASSWORD_HASH
      npx wrangler@4 secret put PAYPAL_SECRET
      npx wrangler@4 secret put PAYPAL_WEBHOOK_ID
      npx wrangler@4 secret put EMAIL_API_KEY
      npx wrangler@4 secret put HASH_SALE      # stringa casuale lunga, inventata una volta sola
      ```
- [ ] **26. Compilare le variabili** in `wrangler.toml`: `RAGIONE_SOCIALE`,
      `PIVA`, `CODICE_FISCALE`, `SEDE_LEGALE`, `REA`, `PEC`, `CODICE_SDI`,
      `PAYPAL_CLIENT_ID`.
- [ ] **27. Provare tutto in sandbox**, con `PAYPAL_AMBIENTE = "sandbox"` e
      `NEGOZIO_ATTIVO = "1"`: un ordine con PayPal di prova, uno in
      contrassegno, un cambio di stato dal pannello, e **verificare che le due
      e-mail arrivino davvero**.
- [ ] **28. Passare a `PAYPAL_AMBIENTE = "live"`** con le chiavi vere, e fare
      **un ordine reale da pochi euro** su sé stessi, fino all'incasso.
      Questo passaggio non si salta: è l'unico modo di sapere che funziona.
- [ ] **29. Accendere il negozio:** `NEGOZIO_ATTIVO = "1"`, poi
      `npx wrangler@4 deploy`.
- [ ] **30. Verificare che il cron giri**, controllando i log nel pannello
      Cloudflare dopo un'ora.

## Parte 6 — Dopo l'apertura

- [ ] **31. Copia di riserva del database**, almeno una volta al mese:
      ```bash
      npx wrangler@4 d1 export emmelu --remote --output=backup-$(date +%F).sql
      ```
      Il file contiene i dati di tutti i clienti: va tenuto cifrato.
- [ ] **32. Esportare il CSV degli ordini** per il commercialista alla scadenza
      che vi indica, da `/admin/esporta.csv`.
- [ ] **33. Una volta all'anno**, eseguire le tre verifiche in
      `docs/CONSERVAZIONE-DATI.md` per confermare che le cancellazioni
      automatiche stiano funzionando.

---

## In breve

| Se manca… | Conseguenza |
|---|---|
| Partita IVA | **Non si può aprire.** Illecito |
| Chiavi PayPal | Resta solo il contrassegno |
| Posta transazionale | Nessuna conferma d'ordine al cliente; gli ordini arrivano comunque nel pannello |
| Password del pannello | **Il pannello è inaccessibile**: il codice nega l'accesso se il segreto manca |
| Sale per gli hash | Funziona con un valore di riserva, ma la protezione degli hash è più debole: va impostato |
| Tariffe di spedizione reali | Si spedisce in perdita |
