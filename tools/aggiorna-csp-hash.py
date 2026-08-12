#!/usr/bin/env python3
"""Ricalcola gli hash CSP dei blocchi di dati strutturati e aggiorna _headers.

La Content-Security-Policy del sito non consente script inline generici:
ogni blocco JSON-LD è autorizzato singolarmente tramite il suo hash SHA-256.
Se un blocco cambia — o se ne aggiunge uno su una nuova pagina — l'hash va
rigenerato, altrimenti il browser lo blocca in silenzio.

Vengono esaminate tutte le pagine, non solo la principale.

    python3 tools/aggiorna-csp-hash.py
"""
import base64
import glob
import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")
HEADERS = os.path.join(PUB, "_headers")

RX_LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def hash_di(contenuto):
    digest = hashlib.sha256(contenuto.encode("utf-8")).digest()
    return "'sha256-%s'" % base64.b64encode(digest).decode()


def raccogli():
    trovati = []
    for pagina in sorted(glob.glob(os.path.join(PUB, "*.html"))):
        testo = open(pagina, encoding="utf-8").read()
        for blocco in RX_LD.findall(testo):
            h = hash_di(blocco)
            if h not in trovati:
                trovati.append(h)
            print("  %-22s %s" % (os.path.basename(pagina), h))
    return trovati


def main():
    hash_list = raccogli()
    if not hash_list:
        sys.exit("Nessun blocco JSON-LD trovato in " + PUB)

    headers = open(HEADERS, encoding="utf-8").read()
    riga = re.search(r"^(\s*Content-Security-Policy:.*)$", headers, re.M)
    if not riga:
        sys.exit("Riga Content-Security-Policy non trovata in _headers")

    vecchia = riga.group(1)
    if "script-src" not in vecchia:
        sys.exit("Direttiva script-src assente nella CSP")

    # si sostituisce l'intero elenco di hash dentro script-src
    senza_hash = re.sub(r"'sha256-[A-Za-z0-9+/=]+'\s*", "", vecchia)
    nuova = re.sub(r"(script-src 'self')", r"\1 " + " ".join(hash_list), senza_hash)
    nuova = re.sub(r"\s+;", ";", nuova)

    if nuova == vecchia:
        print("\nCSP già aggiornata (%d hash)." % len(hash_list))
        return

    open(HEADERS, "w", encoding="utf-8").write(headers.replace(vecchia, nuova))
    print("\n_headers aggiornato con %d hash." % len(hash_list))


if __name__ == "__main__":
    main()
