# Kebijakan Privasi: Aistim Board

Aistim Board tidak punya akun, server, analitik, atau iklan, dan tidak mengirim data pribadimu ke pengembang.

## Data yang disimpan di perangkatmu

Hanya di browser ini (`chrome.storage.local`): daftar menu pintasan yang kamu isi sendiri (nama, link, ikon emoji/huruf bila diisi, dan id yang diturunkan dari link), hasil pemeriksaan pembaruan terakhir (nomor versi dan waktu), salinan terakhir menu bersama dari `main.json`, dan pilihan Periksa otomatis. Menghapus extension atau datanya dari pengaturan browser menghapus semuanya.

## Koneksi jaringan

Ada tiga jenis permintaan. **1. Ikon situs**: mengambil gambar ikon situs dari layanan favicon Google (`https://www.google.com/s2/favicons`) untuk menu yang tidak punya ikon sendiri. Yang dikirim hanya **nama domain induk** menu (mis. `trial.erzap.com` menjadi `erzap.com`), tanpa subdomain, path, query, atau data lain, dan tanpa header Referer. Nama domain pribadi (tanpa titik, alamat IP, `localhost`, `.local`, `.lan`, dan sejenisnya) tidak pernah dikirim. Saat mengisi form, permintaan baru dikirim setelah kolom link selesai diisi, bukan tiap ketikan. Bila ikon sendiri diisi, favicon tidak diminta. Seperti permintaan web biasa, Google dapat mencatat alamat IP dan informasi browser sesuai kebijakan mereka. Saat offline atau gagal, ikon berupa huruf pertama nama.

**2. Menu bersama**: saat tab dibuka (paling sering sekali tiap 5 menit, dan saat kamu menekan **Segarkan**), extension membaca satu berkas publik `https://raw.githubusercontent.com/Lab-sah/Aistim.board/main/main.json` berisi daftar menu bersama. Permintaan ini hanya membaca: tanpa token, tanpa cookie, dan tanpa data pribadimu. Isinya divalidasi (hanya link `http`/`https`) dan hanya ditampilkan; tidak pernah dijalankan sebagai kode. Salinan terakhir disimpan di browser agar bisa dipakai offline. Seperti permintaan web biasa, GitHub dapat mencatat alamat IP dan informasi browser sesuai kebijakan GitHub.

**3. Pemeriksaan pembaruan**: saat tab dibuka (paling sering sekali tiap 6 jam, dan saat kamu menekan **Periksa pembaruan**), extension meminta `https://api.github.com/repos/Lab-sah/Aistim.board/releases/latest`. Permintaan ini tanpa token, tanpa cookie, dan tanpa data pribadimu; yang dibaca hanya nomor versi dan daftar berkas rilis. Seperti permintaan web biasa, GitHub dapat mencatat alamat IP dan informasi browser sesuai kebijakan GitHub. Pemeriksaan otomatis bisa dimatikan lewat kotak **Periksa otomatis saat tab dibuka** di sisi belakang kartu Menu (Atur). Extension tidak mengunduh atau memasang pembaruan sendiri: tombol Unduh hanya membuka halaman unduhan GitHub di tab baru.

Extension tidak meminta izin situs (`host_permissions`) apa pun; izin yang dipakai hanya `storage`.

## Kode jarak jauh

Tidak ada. Semua kode ada di dalam paket extension.
