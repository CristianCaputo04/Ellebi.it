#!/usr/bin/env python3
"""Ricalcola l'hash CSP del blocco JSON-LD di index.html e aggiorna _headers.

La Content-Security-Policy del sito non consente script inline generici: il
blocco di dati strutturati (JSON-LD) è autorizzato tramite il suo hash SHA-256.
Se quel blocco viene modificato, l'hash va rigenerato eseguendo questo script
dalla cartella principale del progetto:

    python3 tools/aggiorna-csp-hash.py
"""
import base64
import hashlib
import re
import sys

HTML = "index.html"
HEADERS = "_headers"

html = open(HTML, encoding="utf-8").read()
match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
if not match:
    sys.exit("Blocco JSON-LD non trovato in " + HTML)

digest = hashlib.sha256(match.group(1).encode("utf-8")).digest()
new_hash = "'sha256-%s'" % base64.b64encode(digest).decode()

headers = open(HEADERS, encoding="utf-8").read()
updated, count = re.subn(r"'sha256-[A-Za-z0-9+/=]+'", new_hash, headers)
if count == 0:
    sys.exit("Nessun hash sha256 da sostituire in " + HEADERS)

if updated != headers:
    open(HEADERS, "w", encoding="utf-8").write(updated)
    print("Aggiornato %s con %s" % (HEADERS, new_hash))
else:
    print("Hash già aggiornato: %s" % new_hash)
