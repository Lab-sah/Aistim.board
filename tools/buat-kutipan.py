"""Membuat kutipan harian baru lewat API Anthropic dan menulisnya ke quotes.json.

Dijalankan oleh workflow .github/workflows/kutipan.yml. Kunci API dibaca dari
ANTHROPIC_API_KEY (secret di repo), tidak pernah disimpan di kode.
"""
import json
import os
import sys
import urllib.request

API = os.environ.get("KUTIPAN_API", "https://api.anthropic.com/v1/messages")
MODEL = "claude-haiku-5-5"
KEY = os.environ.get("ANTHROPIC_API_KEY", "")
PROMPT = (
    "Buat 30 kutipan harian singkat dalam bahasa Indonesia tentang ketenangan, kerja, "
    "kebiasaan kecil, dan semangat. Setiap kalimat maksimal 120 karakter dan tidak boleh "
    "mengutip tokoh nyata. Untuk penulis pakai \"Aistim\" untuk kalimat buatan sendiri, "
    "atau \"Peribahasa\" untuk peribahasa Indonesia yang sudah dikenal. "
    "Jawab hanya dengan JSON array berisi objek {\"text\": \"...\", \"author\": \"...\"}, tanpa teks lain."
)


def ambil_kutipan(teks):
    awal, akhir = teks.index("["), teks.rindex("]") + 1
    return json.loads(teks[awal:akhir])


def bersihkan(items):
    hasil, sudah = [], set()
    for x in items:
        if not isinstance(x, dict):
            continue
        t = str(x.get("text", "")).strip()[:200]
        a = str(x.get("author", "")).strip()[:40]
        if not t or not a or t in sudah:
            continue
        sudah.add(t)
        hasil.append({"text": t, "author": a})
    return hasil


def main():
    if not KEY:
        sys.exit("ANTHROPIC_API_KEY belum diatur (secret di repo)")
    body = {"model": MODEL, "max_tokens": 4000, "messages": [{"role": "user", "content": PROMPT}]}
    req = urllib.request.Request(
        API,
        data=json.dumps(body).encode("utf8"),
        headers={"x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.load(r)
    teks = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
    kutipan = bersihkan(ambil_kutipan(teks))
    if len(kutipan) < 10:
        sys.exit("kutipan terlalu sedikit (%d), quotes.json tidak diubah" % len(kutipan))
    with open("quotes.json", "w", encoding="utf8") as f:
        json.dump({"kutipan": kutipan}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("kutipan ditulis:", len(kutipan))


if __name__ == "__main__":
    main()
