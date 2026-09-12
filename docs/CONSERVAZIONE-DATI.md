# Per quanto si conservano i dati, e chi li cancella

Questa tabella non è una dichiarazione d'intenti: ogni riga corrisponde a
codice che cancella davvero. Se si cambia un termine qui, va cambiato anche
nel codice indicato e nell'informativa privacy — **tre punti, sempre insieme**.
Conservare più a lungo di quanto dichiarato nell'informativa viola il principio
di limitazione della conservazione (art. 5.1.e GDPR).

| Dato | Quanto | Perché | Che cosa lo cancella |
|---|---|---|---|
| Ordine: nome, indirizzo, e-mail, telefono | **10 anni** dall'ordine | Obbligo di conservare le scritture contabili (art. 2220 c.c.). Prevale sul diritto alla cancellazione ex art. 17.3.b GDPR | `anonimizzaOrdiniOltreTermine()` — cron orario |
| Ordine: numero, data, importi, IVA | **10 anni**, poi restano in forma anonima | Stesso obbligo. Dopo l'anonimizzazione non sono più dati personali, quindi possono restare | — |
| Testo della personalizzazione | Come l'ordine; **cancellato prima** su richiesta | Può contenere un nome proprio o una dedica, quindi è un dato personale a tutti gli effetti | `anonimizzaOrdine()` |
| Ordini **annullati** o mai pagati | **30 giorni** | Non servono a nulla e riguardano persone che non hanno comprato niente | `pulisciDatiScaduti()` — cron orario |
| Prova della presa visione (hash e-mail, versione, data) | **10 anni** | Dimostrare l'adempimento dell'art. 13. Sopravvive volutamente all'anonimizzazione: resta la prova, non la persona | cancellazione manuale a fine termine |
| Hash dell'indirizzo IP (limitazione frequenza) | **24 ore** | Sicurezza ex art. 32. Oltre non serve | `pulisciDatiScaduti()` — cron orario |
| Sessione del pannello | **8 ore** | Durata della sessione | `pulisciDatiScaduti()`, e cancellazione immediata all'uscita |
| Cookie del carrello (`emmelu_carrello`) | **30 giorni** | Cookie tecnico, sta nel browser del cliente. Contiene solo SKU e quantità: nessun dato personale, nessun prezzo | Il browser alla scadenza; il sito quando l'ordine si conclude |
| Corrispondenza per e-mail e su Instagram | Finché serve, poi si cancella | Non è archiviata in modo sistematico: sta nella casella e nell'applicazione | Manuale |
| Log tecnici di Cloudflare | Secondo le politiche di Cloudflare | Non li controlliamo noi. Il nostro codice **non registra mai** e-mail, indirizzi o IP in chiaro | Cloudflare |

## Il cron

Configurato in `wrangler.toml` (`crons = ["17 * * * *"]`), esegue ogni ora, in
`src/index.js` → `scheduled()`:

1. `scadiOrdiniNonPagati()` — annulla gli ordini PayPal rimasti in attesa oltre
   30 minuti e **restituisce la giacenza**. Senza questo, un pagamento
   abbandonato terrebbe un pezzo unico fuori commercio per sempre.
2. `pulisciDatiScaduti()` — sessioni, contatori di frequenza, ordini annullati
   da oltre 30 giorni.
3. `anonimizzaOrdiniOltreTermine(10)` — ordini oltre il termine fiscale.

Il terzo non farà nulla per dieci anni. È scritto adesso proprio per questo:
fra dieci anni nessuno si ricorderebbe di scriverlo.

## Verificare che funzioni davvero

Una politica di conservazione che nessuno controlla è una politica che non
esiste. **Una volta all'anno** conviene eseguire:

```bash
# Ordini annullati più vecchi di 30 giorni: deve dare 0
npx wrangler@4 d1 execute emmelu --remote \
  --command="SELECT COUNT(*) FROM ordini WHERE stato='annullato' AND creato_il < datetime('now','-30 days')"

# Contatori di frequenza più vecchi di 24 ore: deve dare 0
npx wrangler@4 d1 execute emmelu --remote \
  --command="SELECT COUNT(*) FROM limiti WHERE finestra < datetime('now','-1 day')"

# Sessioni scadute ancora in tabella: deve dare 0
npx wrangler@4 d1 execute emmelu --remote \
  --command="SELECT COUNT(*) FROM admin_sessioni WHERE scade_il < datetime('now')"
```

Se uno dei tre non dà zero, il cron non sta girando: controllare i log del
Worker nel pannello Cloudflare.
