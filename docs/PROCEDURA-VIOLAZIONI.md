# Se succede una violazione dei dati

Una violazione (*data breach*) non è solo un attacco informatico. È **qualsiasi
evento** che porti a distruzione, perdita, modifica, divulgazione o accesso non
autorizzato a dati personali — compresi gli errori banali, che sono la causa più
frequente in assoluto.

**Il termine è 72 ore** dal momento in cui se ne viene a conoscenza (art. 33
GDPR). Non 72 ore dall'evento: dal momento in cui ce se ne accorge. Per questo
la prima cosa da fare è **annotare data e ora in cui si è saputo**.

---

## Esempi concreti, per questo negozio

| Evento | È una violazione? |
|---|---|
| L'esportazione CSV degli ordini finisce per errore alla persona sbagliata | **Sì**, divulgazione non autorizzata |
| La password del pannello finisce in un messaggio o in una foto | **Sì**, accesso potenzialmente non autorizzato |
| Il telefono con la casella e-mail viene rubato e non ha codice di blocco | **Sì** |
| Un'e-mail di conferma viene mandata all'indirizzo di un altro cliente | **Sì**, anche se riguarda una persona sola |
| Il database viene cancellato senza copia di riserva | **Sì**, perdita di disponibilità |
| Cloudflare ha un'interruzione di servizio e il sito è offline due ore | **No**, non c'è perdita di dati |
| Qualcuno tenta la password del pannello e fallisce | **No**, ma va controllato che non ci sia riuscito |

---

## Passo 1 — Fermare l'emorragia (subito)

Prima di qualunque valutazione giuridica: **impedire che continui**.

```bash
# Cambiare la password del pannello e invalidare tutte le sessioni attive
node tools/genera-password-admin.mjs 'una-password-nuova-e-lunga'
npx wrangler@4 secret put ADMIN_PASSWORD_HASH
npx wrangler@4 d1 execute emmelu --remote --command="DELETE FROM admin_sessioni"

# Se il sospetto riguarda il sistema nel suo complesso, spegnere il negozio:
# in wrangler.toml mettere NEGOZIO_ATTIVO = "0" e ripubblicare.
npx wrangler@4 deploy
```

Se sono coinvolti i pagamenti, cambiare anche `PAYPAL_SECRET` dal pannello
PayPal e reimpostarlo con `wrangler secret put`.

## Passo 2 — Annotare i fatti

Su un file, subito, prima che i ricordi sfumino:

- quando è successo e **quando lo si è saputo** (fa decorrere le 72 ore);
- che cosa è successo, in parole semplici;
- **quali dati** e **quante persone** sono coinvolte (una stima motivata basta);
- che cosa si è già fatto per contenere il danno.

## Passo 3 — Valutare il rischio

La domanda è una sola: **che danno può derivarne alle persone?**

| Rischio | Esempi | Che cosa comporta |
|---|---|---|
| **Improbabile** | Dati già pubblici; dati cifrati con chiave non compromessa; un solo indirizzo e-mail visto da una persona che l'ha subito cancellato | Si annota nel registro interno. **Non** si notifica |
| **Rischio** | Nomi e indirizzi di più clienti esposti | **Notifica al Garante entro 72 ore** |
| **Rischio elevato** | Elenco completo dei clienti divulgato; dati usabili per truffe mirate | Notifica al Garante **e comunicazione a ciascun interessato**, senza ritardo |

Nel dubbio **si notifica**. Una notifica in più non costa nulla; una notifica
omessa è una sanzione.

## Passo 4 — Notificare al Garante (entro 72 ore)

Si fa online, dal sito **www.garanteprivacy.it**, con la modulistica dedicata
alle violazioni. Serve SPID/CIE. La notifica deve contenere (art. 33.3):

1. natura della violazione, categorie e numero approssimativo di interessati e
   di registrazioni coinvolte;
2. nome e contatti del punto di riferimento (la titolare: non c'è un DPO);
3. probabili conseguenze;
4. misure adottate o proposte per porvi rimedio e attenuarne gli effetti.

Se non si hanno ancora tutte le informazioni, **si notifica lo stesso entro le
72 ore** e si completa dopo: il ritardo va motivato, ma l'incompletezza è
espressamente ammessa (art. 33.4).

## Passo 5 — Avvisare le persone (solo se rischio elevato)

Con **linguaggio chiaro e semplice** (art. 34.2), direttamente all'interessato.
Deve dire: che cosa è successo, quali dati, che conseguenze può avere, che cosa
si sta facendo, che cosa può fare lui, e a chi rivolgersi.

Modello:

> Gentile [nome],
>
> le scrivo perché il GG/MM/AAAA si è verificato un problema di sicurezza che
> ha riguardato alcuni dati dei miei clienti, compresi i suoi.
>
> **Che cosa è successo:** [in due righe, senza tecnicismi].
> **Quali suoi dati sono coinvolti:** [elenco preciso].
> **Che cosa ho già fatto:** [azioni di contenimento].
> **Che cosa le consiglio:** [per esempio: diffidare di messaggi che citano un
> suo ordine e chiedono pagamenti o dati].
>
> Ho notificato la violazione al Garante per la protezione dei dati personali
> il GG/MM/AAAA. Per qualsiasi domanda può scrivermi a ellebi.style@gmail.com.
>
> Mi dispiace davvero.

Non minimizzare e non scrivere in burocratese: peggiora il danno di
reputazione più della violazione stessa.

## Passo 6 — Registro delle violazioni

**Tutte** le violazioni vanno annotate, anche quelle non notificate
(art. 33.5). Il registro è il file `docs/registro-violazioni.md`, da creare
alla prima occorrenza, con una riga per evento:

| Data | Scoperta il | Descrizione | Dati | Interessati | Rischio | Notificata? | Misure |
|---|---|---|---|---|---|---|---|

Il Garante può chiederlo, e l'assenza del registro è di per sé una
contestazione.

---

## Prevenzione: le cose che davvero riducono il rischio

- Password del pannello **lunga e usata solo qui**, in un gestore di password.
- **Non mandare mai** l'esportazione CSV su Instagram o WhatsApp: solo e-mail,
  e controllando due volte il destinatario.
- **Copia di riserva periodica** del database (il cron non la fa):
  ```bash
  npx wrangler@4 d1 export emmelu --remote --output=backup-$(date +%F).sql
  ```
  Il file contiene tutti i dati dei clienti: va conservato cifrato e cancellato
  quando non serve più.
- Non conservare mai le password in chiaro, nemmeno «per comodità».
- Autenticazione a due fattori sull'account Cloudflare e su quello PayPal.
