#!/usr/bin/env python3
"""Prepara le varianti delle foto: una misura ridotta per il telefono e,
dove conviene davvero, la versione WebP.

Le foto del sito erano già state compresse parecchio: su alcune trame fitte
il WebP risulta più pesante del JPEG. Servirlo comunque peggiorerebbe il
caricamento, quindi ogni variante viene tenuta solo se è più leggera
dell'originale di almeno il 8%. Il JPEG a piena misura non si tocca mai:
resta la copia di riserva, così nessuna immagine può rompersi.

    python3 tools/genera-webp.py

Stampa anche l'elenco delle varianti disponibili, usato da
tools/aggiorna-immagini.py per scrivere l'HTML.
"""
import json
import os
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(BASE, "public", "assets", "img")
ELENCO = os.path.join(BASE, "tools", "varianti-immagini.json")

GUADAGNO_MINIMO = 0.08   # sotto l'8% non vale la richiesta in più
LARGHEZZA_RIDOTTA = 0.5  # metà larghezza: copre bene i telefoni
MIN_LARGHEZZA = 700      # sotto questa misura non si riduce


def salva_se_conviene(im, percorso, riferimento, **opt):
    """Scrive il file solo se pesa meno del riferimento. Restituisce i byte."""
    im.save(percorso, **opt)
    peso = os.path.getsize(percorso)
    if riferimento and peso > riferimento * (1 - GUADAGNO_MINIMO):
        os.remove(percorso)
        return None
    return peso


def e_variante_generata(nome):
    """Vero solo per i file prodotti da questo script.

    Il suffisso è `-w<larghezza>`: non può essere confuso con i nomi delle
    foto, dove il numero finale indica la borsa (borsa-01, step-04, …).
    Una cancellazione basata sul solo numero finale distruggerebbe gli
    originali, quindi si richiede anche che l'originale esista.
    """
    radice, est = os.path.splitext(nome)
    if est == ".webp" and os.path.exists(os.path.join(IMG, radice + ".jpg")):
        return True
    if "-w" not in radice:
        return False
    base, _, coda = radice.rpartition("-w")
    return coda.isdigit() and os.path.exists(os.path.join(IMG, base + ".jpg"))


def elabora(nome):
    sorgente = os.path.join(IMG, nome)
    radice = os.path.splitext(nome)[0]

    im = Image.open(sorgente).convert("RGB")
    peso_jpg = os.path.getsize(sorgente)
    voce = {"larghezza": im.width, "altezza": im.height, "jpg": [], "webp": []}
    voce["jpg"].append([nome, im.width])

    # WebP a piena misura
    p = os.path.join(IMG, radice + ".webp")
    if salva_se_conviene(im, p, peso_jpg, format="WEBP", quality=80, method=6):
        voce["webp"].append([radice + ".webp", im.width])

    # variante ridotta, per gli schermi piccoli
    if im.width >= MIN_LARGHEZZA:
        w = int(im.width * LARGHEZZA_RIDOTTA)
        h = round(im.height * w / im.width)
        piccola = im.resize((w, h), Image.LANCZOS)

        pj = os.path.join(IMG, "%s-w%d.jpg" % (radice, w))
        if salva_se_conviene(piccola, pj, peso_jpg, format="JPEG",
                             quality=82, optimize=True, progressive=True):
            voce["jpg"].insert(0, ["%s-w%d.jpg" % (radice, w), w])

        pw = os.path.join(IMG, "%s-w%d.webp" % (radice, w))
        rif = os.path.getsize(pj) if os.path.exists(pj) else peso_jpg
        if salva_se_conviene(piccola, pw, rif, format="WEBP", quality=80, method=6):
            voce["webp"].insert(0, ["%s-w%d.webp" % (radice, w), w])

    return voce


if __name__ == "__main__":
    salta = {"og-cover.jpg"}  # serve solo alle anteprime social, non al sito

    # si riparte pulito, ma si tocca solo ciò che questo script ha prodotto
    for f in sorted(os.listdir(IMG)):
        if e_variante_generata(f):
            os.remove(os.path.join(IMG, f))

    elenco = {}
    for nome in sorted(f for f in os.listdir(IMG) if f.lower().endswith(".jpg")):
        if nome in salta or e_variante_generata(nome):
            continue
        v = elabora(nome)
        elenco[nome] = v
        print("  %-20s webp:%-3s ridotte:%s"
              % (nome, "si" if v["webp"] else "no", len(v["jpg"]) - 1))

    with open(ELENCO, "w", encoding="utf-8") as f:
        json.dump(elenco, f, ensure_ascii=False, indent=1)

    tot = sum(os.path.getsize(os.path.join(IMG, f)) for f in os.listdir(IMG)
              if f.lower().endswith((".jpg", ".webp", ".png")))
    print("\nVarianti scritte in tools/varianti-immagini.json")
    print("Peso totale cartella immagini: %.1f KB" % (tot / 1024))
