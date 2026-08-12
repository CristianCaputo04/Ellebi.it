#!/usr/bin/env python3
"""Applica alle pagine gli accorgimenti SEO che vanno ripetuti uguali ovunque.

Si occupa di tre cose che a mano si dimenticano facilmente:

* `max-image-preview:large` — senza questa direttiva Google mostra
  l'anteprima piccola: per un sito che vive di fotografie è la differenza
  fra comparire e non comparire su Google Immagini e Discover.
* `hreflang` — dichiara che il sito è in italiano e che quella è anche la
  versione predefinita per chi arriva da altre lingue.
* percorso di navigazione (BreadcrumbList) sulle pagine interne, così nei
  risultati compare «ellebi.it › Privacy policy» invece dell'indirizzo nudo.

    python3 tools/aggiorna-seo.py && python3 tools/aggiorna-csp-hash.py
"""
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")
SITO = "https://ellebi.it"

ROBOTS = ("index, follow, max-image-preview:large, "
          "max-snippet:-1, max-video-preview:-1")

PAGINE = {
    "index.html": {"url": "/", "nome": None},
    "privacy.html": {"url": "/privacy", "nome": "Privacy policy"},
    "cookie.html": {"url": "/cookie", "nome": "Cookie policy"},
    "accessibilita.html": {"url": "/accessibilita", "nome": "Dichiarazione di accessibilità"},
}


def briciole(nome, url):
    dati = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITO + "/"},
            {"@type": "ListItem", "position": 2, "name": nome, "item": SITO + url},
        ],
    }
    return ('<script type="application/ld+json">\n%s\n</script>'
            % json.dumps(dati, ensure_ascii=False, separators=(",", ":")))


def applica(percorso, info):
    html = open(percorso, encoding="utf-8").read()
    prima = html

    # 1. direttive per i motori di ricerca
    if 'name="robots"' in html:
        html = re.sub(r'<meta name="robots" content="[^"]*">',
                      '<meta name="robots" content="%s">' % ROBOTS, html)
    else:
        html = html.replace('<meta name="author" content="ELLEBI">',
                            '<meta name="author" content="ELLEBI">\n'
                            '<meta name="robots" content="%s">' % ROBOTS)

    # 2. lingua del contenuto
    if 'hreflang' not in html:
        canon = re.search(r'<link rel="canonical" href="([^"]+)">', html)
        if canon:
            u = canon.group(1)
            html = html.replace(
                canon.group(0),
                canon.group(0)
                + '\n<link rel="alternate" hreflang="it-IT" href="%s">' % u
                + '\n<link rel="alternate" hreflang="x-default" href="%s">' % u)

    # 3. percorso di navigazione sulle pagine interne
    if info["nome"] and "BreadcrumbList" not in html:
        html = html.replace("</head>", briciole(info["nome"], info["url"]) + "\n</head>")

    if html != prima:
        open(percorso, "w", encoding="utf-8").write(html)
        return True
    return False


if __name__ == "__main__":
    for nome, info in PAGINE.items():
        p = os.path.join(PUB, nome)
        if not os.path.exists(p):
            continue
        print("  %-22s %s" % (nome, "aggiornata" if applica(p, info) else "già a posto"))
    print("\nOra rigenera gli hash della CSP: python3 tools/aggiorna-csp-hash.py")
