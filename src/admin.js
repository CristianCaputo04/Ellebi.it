/* =========================================================================
   EmmeLù — autenticazione del pannello di gestione

   Il pannello vede tutti gli ordini, quindi tutti i dati personali dei
   clienti: nomi, indirizzi, telefoni. Chi entra qui ha accesso a un archivio
   che il GDPR obbliga a proteggere con misure adeguate (art. 32). Da qui le
   scelte di questo file, nessuna delle quali è facoltativa:

   · la password non è mai in chiaro fra i segreti, ma derivata con PBKDF2;
   · il confronto è a tempo costante;
   · nel database finisce solo l'hash del token di sessione;
   · ogni scrittura richiede un token anti-CSRF legato alla sessione;
   · i tentativi di accesso sono limitati per chiamante.
   ========================================================================= */

import {
  tokenCasuale, sha256, derivaPassword, confrontoCostante, adesso,
  leggiCookie, scriviCookie, cancellaCookie, registra, hashConSale, ipChiamante,
} from "./util.js";
import { consumaLimite } from "./db.js";

const COOKIE = "emmelu_admin";
const ORE_SESSIONE = 8;

/**
 * Verifica la password contro il segreto configurato.
 *
 * `ADMIN_PASSWORD_HASH` ha la forma `sale:hash`, entrambi in esadecimale, ed
 * è quello che produce `tools/genera-password-admin.mjs`. Se manca, l'accesso
 * è **sempre** negato: un pannello senza password configurata deve essere
 * chiuso, non aperto a tutti.
 */
async function passwordCorretta(env, password) {
  const segreto = String(env.ADMIN_PASSWORD_HASH || "").trim();
  if (!segreto.includes(":")) {
    registra("errore", "ADMIN_PASSWORD_HASH assente o malformato: accesso negato");
    return false;
  }
  const [sale, atteso] = segreto.split(":");
  if (!/^[0-9a-f]+$/i.test(sale) || !/^[0-9a-f]+$/i.test(atteso)) return false;

  const calcolato = await derivaPassword(String(password || ""), sale);
  return confrontoCostante(calcolato, atteso);
}

/**
 * Tenta l'accesso e, se riesce, apre una sessione.
 *
 * Restituisce sempre lo stesso messaggio d'errore, qualunque sia la causa:
 * distinguere "password errata" da "troppi tentativi" dice a chi prova a
 * indovinare quanto è vicino, ed è un'informazione che non gli si deve dare.
 */
export async function accedi(db, env, config, richiesta, password) {
  const ipHash = await hashConSale(ipChiamante(richiesta), config.hashSale);
  const limite = await consumaLimite(db, {
    chiave: "accesso-admin",
    ipHash,
    massimo: 5,
    minutiFinestra: 15,
  });

  if (!limite.consentito) {
    registra("avviso", "accesso admin: limite tentativi superato");
    return { ok: false, messaggio: "Accesso non riuscito." };
  }

  /* Il limite per IP protegge la password, non la macchina: chi cambia
     indirizzo a ogni tentativo lo aggira, e ogni tentativo costa 210.000
     iterazioni di PBKDF2 di CPU. Non e' un modo per entrare, e' un modo per
     esaurire il budget del Worker con qualche riga di script.

     Il tetto complessivo e' volutamente alto. Un tetto stretto proteggerebbe
     meglio la CPU ma consegnerebbe a chiunque il potere di chiudere fuori la
     titolare dal suo pannello: fra le due, sopportare un po' di CPU sprecata
     e' il male minore. A 120 tentativi ogni quarto d'ora l'abuso resta
     limitato e l'accesso legittimo — cinque tentativi scarsi — non rischia
     mai di incrociarlo. */
  const limiteGlobale = await consumaLimite(db, {
    chiave: "accesso-admin-globale",
    ipHash: "tutti",
    massimo: 120,
    minutiFinestra: 15,
  });
  if (!limiteGlobale.consentito) {
    registra("avviso", "accesso admin: limite complessivo superato", {
      tentativi: limiteGlobale.conteggio,
    });
    return { ok: false, messaggio: "Accesso non riuscito." };
  }

  if (!(await passwordCorretta(env, password))) {
    registra("avviso", "accesso admin: password errata");
    return { ok: false, messaggio: "Accesso non riuscito." };
  }

  const token = tokenCasuale(32);
  const csrf = tokenCasuale(32);
  const ora = adesso();
  const scadenza = new Date(Date.now() + ORE_SESSIONE * 3600_000).toISOString();

  // Nel database vanno solo gli hash: chi riuscisse a leggere la tabella non
  // otterrebbe una sessione utilizzabile, solo la prova che esiste.
  await db
    .prepare(
      `INSERT INTO admin_sessioni (token_hash, csrf_hash, creato_il, scade_il)
            VALUES (?1, ?2, ?3, ?4)`
    )
    .bind(await sha256(token), await sha256(csrf), ora, scadenza)
    .run();

  registra("info", "accesso admin riuscito");
  return {
    ok: true,
    csrf,
    cookie: scriviCookie(COOKIE, `${token}.${csrf}`, {
      maxEta: ORE_SESSIONE * 3600,
      percorso: "/admin",
      soloHttp: true,
      // Strict e non Lax: nessuna richiesta partita da un altro sito deve
      // portarsi dietro questo cookie, nemmeno seguendo un collegamento.
      stessoSito: "Strict",
    }),
  };
}

/**
 * Riconosce la sessione dalla richiesta.
 *
 * Restituisce `{ valida, csrf }`. Il token CSRF viaggia nello stesso cookie
 * del token di sessione, separato da un punto: così il modulo può inserirlo
 * in un campo nascosto senza che il server debba conservarlo altrove, e resta
 * legato alla singola sessione.
 */
export async function sessione(db, richiesta) {
  const valore = leggiCookie(richiesta, COOKIE);
  if (!valore || !valore.includes(".")) return { valida: false };

  const [token, csrf] = valore.split(".");
  if (!token || !csrf) return { valida: false };

  const riga = await db
    .prepare(`SELECT csrf_hash, scade_il FROM admin_sessioni WHERE token_hash = ?1`)
    .bind(await sha256(token))
    .first();

  if (!riga) return { valida: false };
  if (riga.scade_il < adesso()) {
    // La sessione scaduta si cancella subito invece di aspettare il cron:
    // costa una scrittura e toglie una riga inutile dal database.
    await db.prepare(`DELETE FROM admin_sessioni WHERE token_hash = ?1`).bind(await sha256(token)).run();
    return { valida: false };
  }

  if (!confrontoCostante(await sha256(csrf), riga.csrf_hash)) return { valida: false };
  return { valida: true, csrf };
}

/**
 * Verifica il token anti-CSRF di una richiesta di scrittura.
 *
 * Senza questo controllo, una pagina ostile aperta dalla titolare mentre è
 * autenticata potrebbe far partire una richiesta al pannello — per esempio
 * l'anonimizzazione di un ordine — usando il suo cookie. `SameSite=Strict`
 * copre già quasi tutti i casi; il token è la seconda difesa, e le due
 * insieme rendono l'attacco impraticabile.
 */
export function csrfValido(sessioneCorrente, valoreInviato) {
  return Boolean(
    sessioneCorrente &&
    sessioneCorrente.valida &&
    valoreInviato &&
    confrontoCostante(sessioneCorrente.csrf, String(valoreInviato))
  );
}

/** Chiude la sessione corrente e cancella il cookie. */
export async function esci(db, richiesta) {
  const valore = leggiCookie(richiesta, COOKIE);
  if (valore && valore.includes(".")) {
    const [token] = valore.split(".");
    await db.prepare(`DELETE FROM admin_sessioni WHERE token_hash = ?1`).bind(await sha256(token)).run();
  }
  return cancellaCookie(COOKIE, "/admin");
}

/**
 * Esportazione degli ordini in CSV, per il commercialista.
 *
 * Il separatore è il punto e virgola e i decimali usano la virgola: è quello
 * che si aspetta Excel in configurazione italiana. Con la virgola come
 * separatore, aprire il file in Italia produce una sola colonna illeggibile.
 *
 * Ogni campo passa da `cellaCsv`, che neutralizza le formule: un campo che
 * inizia con `=`, `+`, `-` o `@` viene eseguito da Excel all'apertura, ed è
 * un modo noto per far eseguire comandi a chi apre un file che gli è stato
 * mandato. Qui i nomi e gli indirizzi li scrivono degli sconosciuti.
 */
export async function esportaCsv(db, { da, a }) {
  const { results } = await db
    .prepare(
      `SELECT numero, stato, metodo_pagamento, creato_il,
              nome, cognome, email, telefono, via, civico, cap, citta, provincia,
              subtotale_cent, spedizione_cent, supplemento_cent, iva_cent, totale_cent,
              tracciatura, corriere, anonimizzato_il
         FROM ordini
        WHERE creato_il >= ?1 AND creato_il <= ?2
        ORDER BY creato_il`
    )
    .bind(da, a)
    .all();

  const intestazioni = [
    "Numero", "Data", "Stato", "Pagamento",
    "Nome", "Cognome", "Email", "Telefono",
    "Indirizzo", "CAP", "Citta", "Provincia",
    "Imponibile", "IVA", "Spedizione", "Supplemento", "Totale",
    "Corriere", "Tracciatura",
  ];

  const righe = (results || []).map((o) => [
    o.numero,
    o.creato_il,
    o.stato,
    o.metodo_pagamento,
    o.nome, o.cognome, o.email, o.telefono,
    `${o.via} ${o.civico}`, o.cap, o.citta, o.provincia,
    decimaleItaliano(o.totale_cent - o.iva_cent),
    decimaleItaliano(o.iva_cent),
    decimaleItaliano(o.spedizione_cent),
    decimaleItaliano(o.supplemento_cent),
    decimaleItaliano(o.totale_cent),
    o.corriere || "", o.tracciatura || "",
  ]);

  return [intestazioni, ...righe]
    .map((r) => r.map(cellaCsv).join(";"))
    .join("\r\n");
}

function decimaleItaliano(centesimi) {
  return (Number(centesimi || 0) / 100).toFixed(2).replace(".", ",");
}

function cellaCsv(valore) {
  let s = String(valore ?? "");
  // Neutralizza l'iniezione di formule: l'apostrofo iniziale dice al foglio
  // di calcolo che quello che segue è testo, non una formula da eseguire.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
