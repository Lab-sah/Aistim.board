# Aistim Board

Extension Chrome yang mengganti halaman **tab baru** dengan dua kartu: **jam dan kata-kata** di atas, lalu kartu **Menu** berisi pintasan ke situs yang sering dibuka, dengan tile **+** untuk menambah menu.

Versi lama (dengan jam, kutipan, Aistim.sync, dan menu bersama bertanda tangan) ada di branch [`main-v1`](../../tree/main-v1).

## Fitur

- **Jam dan kata-kata** (kartu atas): jam 24 jam yang berganti tepat di pergantian menit, tanggal dalam bahasa Indonesia, dan satu kata-kata per hari (berganti tiap tengah malam menurut jam di perangkatmu). Semuanya dihitung di browser, tanpa jaringan.
- **Tambah**: ketuk tile **+** (lingkaran dengan tanda plus tipis, tanpa teks; ukuran dan warnanya sama dengan tile tambah di tab baru Brave), isi **Link** (dan **Nama** bila mau; kosong berarti nama situsnya), lalu Simpan. Link tanpa `https://` dilengkapi otomatis; hanya `http`/`https` yang diterima. Maksimal 24 menu.
- **Menu bersama dari `main.json`**: menu juga diambil dari file [`main.json`](main.json) di repo ini, jadi cukup **edit file itu lewat GitHub** (buka `main.json`, ikon pensil, ubah, Commit) dan menunya berubah untuk semua yang memasang extension. Menu bersama tampil lebih dulu, lalu menu pribadi (yang kamu tambah lewat tile **+**). Di sisi belakang kartu (**Atur**) menu bersama diberi lencana `main.json` dan tidak bisa diubah atau dihapus dari sana; ada keterangan status dan tombol **Segarkan**.

  ```json
  {
    "menu": [
      { "nama": "Erzap", "link": "https://erzap.com" },
      { "nama": "Trial", "link": "trial.erzap.com", "ikon": "🛒" },
      { "link": "contoh.co.id/halaman" }
    ]
  }
  ```

  - `link` wajib (`https://` boleh dilewati; hanya `http`/`https`). `nama` boleh kosong (dipakai nama situs). `ikon` opsional (emoji atau huruf; kosong berarti favicon situs). Maksimal 48 menu. Kunci lain di file (mis. `petunjuk`) diabaikan. Larik langsung `[ ... ]` juga diterima.
  - Entri yang salah (tanpa link, link bukan `http`/`https`, link kembar) dilewati dan alasannya ditulis di status; file yang bukan JSON sah (mis. koma berlebih di akhir) ditolak seluruhnya dengan pesan galat, dan tab tetap memakai salinan terakhir yang berhasil.
  - Tab membaca file saat dibuka, paling sering sekali tiap 5 menit (GitHub sendiri menyimpan salinan file mentah sampai 5 menit). Tombol **Segarkan** menembus salinan itu supaya hasil edit langsung terlihat. Salinan terakhir disimpan di browser untuk dipakai offline.
  - **Keamanan**: file ini tidak ditandatangani, jadi siapa pun yang bisa mengubah `main.json` di repo menentukan menu semua pengguna. Karena itu isinya divalidasi ketat (hanya link `http`/`https`, ditampilkan sebagai teks biasa, tidak pernah dijalankan sebagai kode) dan link hanya terbuka bila pengguna mengetuknya. Jaga akses tulis ke repo ini.
- **Buka**: ketuk tile membuka link di **tab baru**; halaman menu tetap terbuka.
- **Ubah dan hapus** ada di sisi belakang kartu: ketuk **Atur** (kartu berbalik), lalu **Ubah** atau **Hapus** per baris (hapus meminta konfirmasi), **Selesai** atau Escape untuk kembali. Sisi depan tidak punya tombol edit.
- **Ikon otomatis** dari favicon situs lewat Google. Yang dikirim hanya nama **domain induk** (`trial.erzap.com` menjadi `erzap.com`, `shop.example.co.id` menjadi `example.co.id`), tanpa subdomain, path, atau query, dan baru setelah kolom link selesai diisi. Host pribadi (tanpa titik, alamat IP, `localhost`, `.local`, `.lan`, dan sejenisnya) tidak pernah dikirim. Bila gagal dimuat dipakai huruf pertama nama. Di **Ikon sendiri (opsional)** bisa diisi emoji atau huruf sebagai ganti favicon.
- **Pembaruan**: saat tab dibuka (paling sering sekali tiap 6 jam) extension memeriksa rilis terbaru di GitHub (`api.github.com/repos/devtim-lab/Aistim.board/releases/latest`, tanpa token, tanpa cookie, tanpa data pribadi). Bila ada versi yang lebih baru dari yang terpasang, muncul tombol biru **Versi baru vX tersedia · Unduh** di atas kartu jam; ketuk untuk mengunduh `Aistim-Board-<versi>.zip` di tab baru. Di sisi belakang kartu (**Atur**) ada tombol **Periksa pembaruan**, tombol **Unduh vX**, dan kotak **Periksa otomatis saat tab dibuka** untuk mematikan pemeriksaan otomatis (pemeriksaan manual tetap bisa). Extension tidak memasang apa pun sendiri: ekstrak zip ke folder yang sama lalu tekan ⟳ di halaman Ekstensi. Nomor versi dari GitHub divalidasi ketat (`vX.Y.Z`, zip harus ada di rilis) dan tautan unduhan dibangun dari nomor itu, bukan diambil dari isi balasan. Tidak butuh izin situs: GitHub mengizinkan permintaan lintas-asal untuk API-nya.
- **Responsif**: 320 px sampai desktop; mengikuti `prefers-reduced-motion`.
- Perubahan di satu tab baru ikut tampil di tab baru lain yang sedang terbuka.

## ID tetap

ID extension tidak berubah walau dipasang dari folder berbeda, karena `extension/manifest.json` memuat `key` (public key):

```
lapfimgknhjnohjplfedmfdckjebjhil
```

ID ini juga tampil di sisi belakang kartu (Atur). Data menu tersimpan per ID, jadi tidak hilang saat extension dipasang ulang.
`tools/id-extension.py` menghitung ID dari `key` dan gagal bila `key` hilang atau berubah; workflow Release menjalankannya sebelum membuat zip. **Jangan ubah `key`**: ID baru berarti data menu lama tidak terbaca.

**ID menu** juga tetap: tiap menu punya id yang diturunkan dari link-nya (tanpa skema, `www.`, huruf besar/kecil nama situs, `/` di akhir, dan `#bagian`). Link yang sama selalu menghasilkan id yang sama, sehingga tidak bisa tampil dobel: menambah link yang sudah ada ditolak, dan data lama yang dobel digabung saat halaman dibuka.

## Memasang

1. Unduh `Aistim-Board-<versi>.zip` dari [Releases](../../releases) lalu ekstrak.
2. Buka `chrome://extensions`, aktifkan **Mode pengembang**, pilih **Load unpacked**, dan tunjuk folder hasil ekstrak (yang berisi `manifest.json`).
3. Buka tab baru.

Memperbarui: bila muncul tombol **Versi baru … Unduh**, ketuk untuk mengunduh; ekstrak zip versi baru ke folder yang sama, lalu tekan ikon muat ulang (⟳) pada kartu extension.

## Data

Menu pribadi tersimpan di browser (`chrome.storage.local`, kunci `pins`: `id`, `nama`, `href`, `ikon`); salinan terakhir menu bersama di kunci `menuV`. Tidak ada akun dan tidak ada server. Lihat [PRIVACY.md](PRIVACY.md).

## Struktur

- `extension/`: `manifest.json`, `newtab.html`, `script.js`, `style.css`, `icons/`
- `main.json`: daftar menu bersama (diedit lewat GitHub; perubahannya tidak memicu rilis baru)
- `tools/id-extension.py`: pemeriksa ID tetap
- `.github/workflows/release.yml`: setiap push ke `main` membuat atau memperbarui release `v<versi>` dengan `Aistim-Board-<versi>.zip` (naikkan `version` di `manifest.json` untuk rilis baru)
