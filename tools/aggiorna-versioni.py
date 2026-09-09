#!/usr/bin/env python3
"""Riallinea il ?v=... di CSS e JS al contenuto reale dei file.

Il foglio di stile e lo script sono richiamati con una marca di versione
(`style.css?v=1a364e1ec8`) calcolata dal contenuto del file. Serve a due cose:

  1. appena si pubblica una modifica, l'indirizzo cambia e nessuno resta con
     la versione vecchia in cache;
  2. proprio perché l'indirizzo cambia a ogni modifica, public/_headers può
     dire ai browser di tenersi quei file per un anno senza richiederli mai
     più (`immutable`), il che rende istantanee le visite successive.

Il secondo punto vale però solo se la marca è aggiornata: pubblicare un CSS
modificato lasciando il vecchio ?v= significa lasciare le persone con lo stile
vecchio per un anno. Per questo il controllo gira anche in fase di
pubblicazione (.github/workflows) e blocca il deploy se qualcosa non torna.

    python3 tools/aggiorna-versioni.py            # riscrive le marche
    python3 tools/aggiorna-versioni.py --check    # non scrive, esce con 1 se
                                                  # ce n'è una da aggiornare
"""
import glob
import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")

# I file versionati e il modo in cui compaiono nelle pagine.
VERSIONATI = ["assets/css/style.css", "assets/js/main.js"]

CHECK = "--check" in sys.argv


def marca(percorso_relativo):
    with open(os.path.join(PUB, percorso_relativo), "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:10]


def main():
    attese = {}
    for rel in VERSIONATI:
        pieno = os.path.join(PUB, rel)
        if not os.path.exists(pieno):
            sys.exit("Manca " + rel)
        attese["/" + rel] = marca(rel)

    da_sistemare = []
    for pagina in sorted(glob.glob(os.path.join(PUB, "*.html"))):
        testo = open(pagina, encoding="utf-8").read()
        nuovo = testo
        for url, atteso in attese.items():
            # cattura l'indirizzo con o senza marca già presente
            rx = re.compile(re.escape(url) + r"(\?v=[0-9a-f]+)?")
            for m in rx.finditer(testo):
                presente = (m.group(1) or "")[3:]
                if presente != atteso:
                    da_sistemare.append(
                        "%s: %s ha ?v=%s, dovrebbe essere %s"
                        % (os.path.basename(pagina), url, presente or "(nessuna)", atteso)
                    )
            nuovo = rx.sub(url + "?v=" + atteso, nuovo)
        if nuovo != testo and not CHECK:
            open(pagina, "w", encoding="utf-8").write(nuovo)

    if not da_sistemare:
        print("Marche di versione già allineate (%s)." % ", ".join(sorted(attese.values())))
        return

    for riga in da_sistemare:
        print(("da aggiornare  " if CHECK else "aggiornato     ") + riga)

    if CHECK:
        print(
            "\n%d marca/e non allineata/e. Esegui:\n"
            "  python3 tools/aggiorna-versioni.py" % len(da_sistemare)
        )
        sys.exit(1)
    print("\n%d marca/e aggiornata/e." % len(da_sistemare))


if __name__ == "__main__":
    main()
