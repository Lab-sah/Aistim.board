"""Membuat kutipan harian baru lewat API Anthropic dan menulisnya ke quotes.json.

Dijalankan oleh workflow .github/workflows/kutipan.yml. Memakai Gemini API. Kunci dibaca
dari GEMINI_API_KEY (secret di repo), tidak pernah disimpan di kode.
"""
import json
import os
import sys
import urllib.request

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
API = os.environ.get("KUTIPAN_API", "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % MODEL)
KEY = os.environ.get("GEMINI_API_KEY", "")
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
        sys.exit("GEMINI_API_KEY belum diatur (secret di repo)")
    body = {
        "contents": [{"parts": [{"text": PROMPT}]}],
        "generationConfig": {"maxOutputTokens": 4000, "temperature": 0.9},
    }
    req = urllib.request.Request(
        API,
        data=json.dumps(body).encode("utf8"),
        headers={"x-goog-api-key": KEY, "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.load(r)
    kandidat = resp.get("candidates") or [{}]
    bagian = (kandidat[0].get("content") or {}).get("parts") or []
    teks = "".join(b.get("text", "") for b in bagian)
    kutipan = bersihkan(ambil_kutipan(teks))
    if len(kutipan) < 10:
        sys.exit("kutipan terlalu sedikit (%d), quotes.json tidak diubah" % len(kutipan))
    with open("quotes.json", "w", encoding="utf8") as f:
        json.dump({"kutipan": kutipan}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("kutipan ditulis:", len(kutipan))


if __name__ == "__main__":
    main()
