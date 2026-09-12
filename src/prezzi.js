/* =========================================================================
   EmmeLù — motore di calcolo di un ordine

   Regola che vale per tutto il file e non ammette eccezioni:
   IL CLIENTE NON CALCOLA MAI UN TOTALE CHE CONTI.
   Il carrello nel browser è un promemoria. Ogni importo che finisce in un
   ordine, in un pagamento PayPal o in un documento fiscale nasce qui, da
   dati riletti dal database nel momento del calcolo. Un preventivo inviato
   dal client viene ignorato, non verificato: verificarlo significherebbe
   fidarsene un po'.
   ========================================================================= */

import { arrotondaCentesimi } from "./util.js";

/**
 * Sceglie la tariffa di spedizione per un peso dato.
 *
 * Prende il primo scaglione capiente in ordine di peso crescente. Se nessuno
 * basta restituisce `null`: l'ordine non è spedibile con le tariffe note e il
 * checkout deve dirlo, non inventare un prezzo. Meglio una vendita persa che
 * una spedizione in perdita su ogni pacco.
 */
export function tariffaPerPeso(tariffe, pesoTotaleG) {
  const ordinate = [...tariffe]
    .filter((t) => t.attiva)
    .sort((a, b) => a.peso_max_g - b.peso_max_g);
  return ordinate.find((t) => t.peso_max_g >= pesoTotaleG) || null;
}

/**
 * Scorpora l'IVA da un importo che la comprende già.
 *
 * In Italia i prezzi al consumatore si espongono IVA inclusa, quindi il totale
 * è il dato di partenza e l'imponibile si ricava all'indietro. Si calcola
 * l'imponibile e si sottrae, invece di moltiplicare il totale per 0,22: la
 * seconda strada dà un risultato diverso di un centesimo su molti importi,
 * e la differenza si nota in fattura.
 */
export function scorporaIva(totaleCent, aliquota = 22) {
  const imponibile = arrotondaCentesimi(totaleCent / (1 + aliquota / 100));
  return totaleCent - imponibile;
}

/**
 * Calcola un ordine completo.
 *
 * `varianti` sono le righe lette da D1 **adesso**, indicizzate per SKU.
 * `richieste` è ciò che il cliente dice di volere: da lì si prendono solo SKU
 * e quantità, mai prezzi.
 *
 * Garantisce che ogni importo restituito sia un intero non negativo e che
 * `totale_cent` sia esattamente la somma delle sue parti. Non garantisce che
 * l'ordine sia piazzabile: la disponibilità va riverificata dentro la
 * transazione di scrittura, perché fra questo calcolo e la scrittura può
 * passare qualcuno che compra lo stesso pezzo.
 */
export function calcolaOrdine({ richieste, varianti, tariffe, metodo, config }) {
  const righe = [];
  const problemi = [];

  let subtotaleCent = 0;
  let pesoTotaleG = 0;
  let articoliTotali = 0;

  for (const richiesta of richieste) {
    const sku = String(richiesta.sku || "");
    // La quantità arriva dal browser: va trattata come ostile. Un valore
    // negativo trasformerebbe un ordine in un rimborso, uno enorme farebbe
    // traboccare i conti.
    const quantita = Math.floor(Number(richiesta.quantita));
    const variante = varianti.get(sku);

    if (!variante) {
      problemi.push({ sku, motivo: "inesistente" });
      continue;
    }
    if (!Number.isFinite(quantita) || quantita < 1 || quantita > 99) {
      problemi.push({ sku, motivo: "quantita_non_valida" });
      continue;
    }

    // La disponibilità si riporta fedelmente, ma non si "corregge" in
    // silenzio la quantità richiesta: il cliente deve vedere che qualcosa è
    // cambiato rispetto a quello che aveva nel carrello, non trovarsi un
    // ordine diverso da quello che pensava di fare.
    const disponibile = variante.giacenza >= quantita;
    if (!disponibile) {
      problemi.push({
        sku,
        motivo: variante.giacenza === 0 ? "esaurito" : "scorta_insufficiente",
        disponibili: variante.giacenza,
      });
    }

    const totaleRigaCent = variante.prezzo_cent * quantita;
    subtotaleCent += totaleRigaCent;
    pesoTotaleG += variante.peso_g * quantita;
    articoliTotali += quantita;

    righe.push({
      sku,
      variante_id: variante.id,
      nome_prodotto: variante.nome_prodotto,
      nome_variante: variante.nome,
      slug_prodotto: variante.slug_prodotto,
      personalizzato: variante.personalizzabile ? 1 : 0,
      personalizzazione: String(richiesta.personalizzazione || ""),
      prezzo_unitario_cent: variante.prezzo_cent,
      peso_unitario_g: variante.peso_g,
      quantita,
      totale_cent: totaleRigaCent,
      disponibile,
      giacenza: variante.giacenza,
    });
  }

  if (righe.length === 0) {
    return { valido: false, problemi: problemi.length ? problemi : [{ motivo: "carrello_vuoto" }] };
  }
  if (articoliTotali > config.maxArticoliPerOrdine) {
    problemi.push({ motivo: "troppi_articoli", massimo: config.maxArticoliPerOrdine });
  }

  // --- spedizione ---
  const sopraSoglia = subtotaleCent >= config.sogliaSpedizioneGratisCent;
  const tariffa = tariffaPerPeso(tariffe, pesoTotaleG);
  let spedizioneCent = 0;
  if (!sopraSoglia) {
    if (!tariffa) {
      problemi.push({ motivo: "peso_non_spedibile", pesoG: pesoTotaleG });
    } else {
      spedizioneCent = tariffa.prezzo_cent;
    }
  }

  // --- supplemento del contrassegno ---
  let supplementoCent = 0;
  if (metodo === "contrassegno") {
    if (subtotaleCent + spedizioneCent > config.limiteContrassegnoCent) {
      problemi.push({ motivo: "contrassegno_oltre_limite", limite: config.limiteContrassegnoCent });
    }
    supplementoCent = config.supplementoContrassegnoCent;
  }

  const totaleCent = subtotaleCent + spedizioneCent + supplementoCent;

  return {
    valido: problemi.length === 0,
    problemi,
    righe,
    articoli_totali: articoliTotali,
    peso_totale_g: pesoTotaleG,
    subtotale_cent: subtotaleCent,
    spedizione_cent: spedizioneCent,
    spedizione_gratis: sopraSoglia,
    spedizione_nome: sopraSoglia ? "Spedizione offerta" : tariffa ? tariffa.nome : "",
    supplemento_cent: supplementoCent,
    totale_cent: totaleCent,
    iva_cent: scorporaIva(totaleCent, config.aliquotaIva),
    aliquota_iva: config.aliquotaIva,
    // Quanto manca alla spedizione gratuita: il frontend lo mostra, ed è la
    // leva che alza davvero il valore medio di un ordine.
    manca_a_gratis_cent: sopraSoglia ? 0 : Math.max(0, config.sogliaSpedizioneGratisCent - subtotaleCent),
    soglia_gratis_cent: config.sogliaSpedizioneGratisCent,
  };
}
