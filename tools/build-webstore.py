#!/usr/bin/env python3
"""Membuat zip untuk Chrome Web Store: tools/build-webstore.py [keluaran.zip]

Beda dari zip rilis GitHub:
  1. Field "key" dibuang dari manifest.json (Web Store menetapkan ID sendiri).
  2. Blok bertanda @GITHUB-ONLY-BEGIN/END di script.js dan newtab.html dibuang: pemeriksa pembaruan GitHub
     dan tombol Unduh. Chrome memperbarui extension dari toko sendiri.
Skrip gagal bila penanda tidak seimbang atau masih ada sisa referensi ke api.github.com atau GITHUB-ONLY.
"""
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "extension")
BEGIN = re.compile(r"^[ \t]*(//|<!--) @GITHUB-ONLY-BEGIN.*\n")
END = re.compile(r"@GITHUB-ONLY-END")


def buang_blok(teks, nama):
    keluar, di_dalam, n = [], False, 0
    for baris in teks.splitlines(keepends=True):
        if "@GITHUB-ONLY-BEGIN" in baris:
            if di_dalam:
                sys.exit("GAGAL: BEGIN bersarang di " + nama)
            di_dalam, n = True, n + 1
        elif "@GITHUB-ONLY-END" in baris:
            if not di_dalam:
                sys.exit("GAGAL: END tanpa BEGIN di " + nama)
            di_dalam = False
        elif di_dalam:
            continue
        elif "@GITHUB-ONLY" in baris:  # baris tunggal
            continue
        else:
            keluar.append(baris)
    if di_dalam:
        sys.exit("GAGAL: BEGIN tanpa END di " + nama)
    if n == 0:
        sys.exit("GAGAL: tidak ada blok GITHUB-ONLY di " + nama)
    return "".join(keluar)


def main():
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "Aistim-board-webstore.zip")
    with tempfile.TemporaryDirectory() as tmp:
        dst = os.path.join(tmp, "extension")
        shutil.copytree(SRC, dst)
        mp = os.path.join(dst, "manifest.json")
        m = json.load(open(mp, encoding="utf-8"))
        m.pop("key", None)
        json.dump(m, open(mp, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        for f in ("script.js", "newtab.html"):
            p = os.path.join(dst, f)
            t = buang_blok(open(p, encoding="utf-8").read(), f)
            open(p, "w", encoding="utf-8").write(t)
        for f in ("script.js", "newtab.html", "manifest.json"):
            t = open(os.path.join(dst, f), encoding="utf-8").read()
            for sisa in ("GITHUB-ONLY", "api.github.com", "upd-", '"key"'):
                if sisa in t:
                    sys.exit("GAGAL: sisa '%s' di %s" % (sisa, f))
        if os.path.exists(out):
            os.remove(out)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for d, _, files in os.walk(dst):
                for f in sorted(files):
                    full = os.path.join(d, f)
                    z.write(full, os.path.relpath(full, dst))
    print("dibuat:", out, "versi", m["version"])


if __name__ == "__main__":
    main()
