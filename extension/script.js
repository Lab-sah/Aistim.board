"use strict";
// Aistim Board: halaman tab baru berisi menu pintasan (tambah, ubah, hapus). Tanpa akun, tanpa server:
// data tersimpan di browser ini. Permintaan jaringan hanya dua: ikon favicon Google dan pemeriksaan rilis di GitHub (lihat PRIVACY.md).

const $ = (id) => document.getElementById(id);

// ---------- Penyimpanan (chrome.storage.local, cadangan localStorage saat dibuka sebagai file biasa) ----------
const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
const store = {
  async get(key, fallback) {
    if (hasChrome) {
      const r = await chrome.storage.local.get(key);
      return r[key] === undefined ? fallback : r[key];
    }
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  async set(key, value) {
    if (hasChrome) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(key, JSON.stringify(value));
  },
};

const MAX_PIN = 24;
let pins = []; // menu pribadi: [{ id, nama, href, ikon }]
let pinTarget = null; // id yang sedang diubah di dialog; null = menu baru

function msg(text) {
  const el = $("msg");
  el.textContent = text;
  clearTimeout(msg.t);
  if (text) msg.t = setTimeout(() => (el.textContent = ""), 4000);
}

// ---------- Link, ID tetap, ikon ----------
// Hanya http/https yang diterima; "contoh.com" otomatis jadi https://contoh.com/
function normalUrl(v) {
  v = (v || "").trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return null; // skema lain (ftp://, file://, ...)
    v = "https://" + v;
  }
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname ? u.href : null;
  } catch (e) {
    return null;
  }
}
function hostOf(href) {
  try { return new URL(href).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}
function grafem(s, n) {
  s = (s || "").trim();
  if (typeof Intl !== "undefined" && Intl.Segmenter) return Array.from(new Intl.Segmenter().segment(s), (x) => x.segment).slice(0, n).join("");
  return Array.from(s).slice(0, n).join("");
}
function pinLabel(p) { return p.nama || hostOf(p.href); }

// ID menu tetap: diturunkan dari link (tanpa skema, "www.", garis miring akhir, dan #bagian), jadi sama di semua
// perangkat dan link yang sama tidak mungkin tampil dobel. Hash 53-bit (cyrb53), bukan untuk keamanan.
function kunciLink(href) {
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./, "").toLowerCase() + (u.port ? ":" + u.port : "") + u.pathname.replace(/\/+$/, "") + u.search;
  } catch (e) {
    return String(href || "");
  }
}
function idLink(href) {
  const s = kunciLink(href);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return "m" + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// Data tersimpan dirapikan: id dari link, link sama digabung, data yang kosong dilengkapi dari duplikatnya.
function rapikanPins(daftar) {
  const hasil = [];
  const ada = new Map();
  for (const x of Array.isArray(daftar) ? daftar : []) {
    const href = x && typeof x.href === "string" ? normalUrl(x.href) : null;
    if (!href) continue;
    const id = idLink(href);
    const p = { id, nama: typeof x.nama === "string" ? x.nama.slice(0, 30) : "", href, ikon: typeof x.ikon === "string" ? grafem(x.ikon, 2) : "" };
    const d = ada.get(id);
    if (!d) {
      ada.set(id, p);
      hasil.push(p);
    } else {
      d.nama = d.nama || p.nama;
      d.ikon = d.ikon || p.ikon;
    }
  }
  return hasil;
}

// Ikon otomatis: favicon dari Google (hanya nama domain induk yang dikirim, tanpa subdomain). Nama tanpa titik,
// alamat IP, dan domain lokal tidak pernah dikirim.
const FAVICON = "https://www.google.com/s2/favicons?sz=64&domain=";
const favOk = new Set(); // alamat favicon yang sudah berhasil dimuat di halaman ini
function faviconUrl(href) {
  let h = "";
  try { h = new URL(href).hostname.toLowerCase(); } catch (e) { return ""; }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z][a-z0-9-]+$/.test(h)) return "";
  if (/\.(local|localhost|internal|lan|home|corp|intranet|test|invalid|example)$/.test(h)) return "";
  return FAVICON + encodeURIComponent(indukDomain(h));
}
// Domain induk: trial.erzap.com -> erzap.com, shop.example.co.id -> example.co.id. Tanpa daftar sufiks publik lengkap:
// akhiran negara 2 huruf yang didahului kata umum (co, com, net, org, ac, go, ...) dihitung satu akhiran.
const SLD_UMUM = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "or", "go", "sch", "web", "my", "biz", "mil", "ne", "ltd", "plc", "nom", "desa", "ponpes"]);
function indukDomain(h) {
  const p = h.split(".");
  if (p.length <= 2) return h;
  const n = p[p.length - 1].length === 2 && SLD_UMUM.has(p[p.length - 2]) ? 3 : 2;
  return p.slice(-n).join(".");
}
function pinWarna(s) {
  let h = 0;
  for (const c of s || "") h = (h * 31 + c.codePointAt(0)) >>> 0;
  return "hsl(" + (h % 360) + " 55% 40%)";
}
// Urutan ikon: emoji/huruf sendiri, favicon situs, huruf pertama nama. Favicon baru dipasang setelah berhasil
// dimuat, jadi saat offline atau gagal tetap tampil huruf berwarna.
function pinIkon(p, favicon = true) {
  const s = document.createElement("span");
  s.className = "pin-ic";
  s.textContent = p.ikon || grafem(pinLabel(p), 1).toUpperCase() || "•";
  if (p.ikon) return s;
  s.style.background = pinWarna(hostOf(p.href) || p.nama);
  const fu = favicon ? faviconUrl(p.href) : "";
  if (fu) {
    const im = new Image();
    im.alt = "";
    im.decoding = "async";
    im.referrerPolicy = "no-referrer";
    const pasang = () => {
      s.textContent = "";
      s.style.background = "";
      s.classList.add("fav");
      s.append(im);
    };
    im.onload = () => {
      favOk.add(fu);
      pasang();
    };
    im.src = fu;
    if (favOk.has(fu)) pasang(); // sudah pernah berhasil di halaman ini: langsung tampil, tanpa berkedip jadi huruf
  }
  return s;
}

// ---------- Tampilan ----------
// Tanda + tipis (21 dari 44 px, tebal 1,35 px) tanpa ujung membulat, sama dengan tile tambah di tab baru Brave
const PLUS = '<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M11.7 22h20.6M22 11.7v20.6"/></svg>';
const IKON_UBAH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>';
const IKON_HAPUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>';

function pinTile(p) {
  const a = document.createElement("a");
  a.className = "pin";
  a.href = p.href;
  a.title = p.href;
  const nm = document.createElement("span");
  nm.className = "pin-nm";
  nm.textContent = pinLabel(p);
  a.append(pinIkon(p), nm);
  return a;
}
function tambahTile() {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pin tambah";
  b.id = "pin-tile-tambah";
  b.title = "Tambahkan menu baru";
  b.setAttribute("aria-label", "Tambahkan menu baru"); // tanpa teks yang terlihat; hanya untuk pembaca layar
  const ic = document.createElement("span");
  ic.className = "pin-ic plus";
  ic.innerHTML = PLUS;
  b.append(ic);
  b.addEventListener("click", () => openPin(null));
  return b;
}
function pinBaris(p, bersama) {
  const tr = document.createElement("tr");
  if (bersama) tr.className = "bersama";
  const tdIkon = document.createElement("td");
  tdIkon.className = "td-ikon";
  tdIkon.append(pinIkon(p));
  const tdNama = document.createElement("td");
  tdNama.className = "td-nama";
  tdNama.textContent = pinLabel(p);
  tdNama.title = pinLabel(p);
  const tdLink = document.createElement("td");
  tdLink.className = "td-link";
  const sm = document.createElement("small");
  sm.textContent = p.href;
  sm.title = p.href;
  tdLink.append(sm);
  const tdAksi = document.createElement("td");
  tdAksi.className = "td-aksi";
  if (bersama) {
    const k = document.createElement("span");
    k.className = "baris-lencana";
    k.textContent = "main.json";
    k.title = "Menu bersama dari main.json di GitHub; ubah lewat file itu";
    tdAksi.append(k);
  } else {
    const mk = (cls, judul, svg, fn) => {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "ico2 " + cls;
      x.title = judul + " " + pinLabel(p);
      x.setAttribute("aria-label", x.title);
      x.innerHTML = svg;
      x.addEventListener("click", fn);
      return x;
    };
    tdAksi.append(
      mk("ubah", "Ubah", IKON_UBAH, () => openPin(p.id)),
      mk("hapus", "Hapus", IKON_HAPUS, async () => {
        const r = await hapusPin(p);
        if (typeof r === "string") msg(r);
      })
    );
  }
  tr.append(tdIkon, tdNama, tdLink, tdAksi);
  return tr;
}
function renderPins() {
  const sendiri = new Set(pins.map((p) => p.id)); // link yang sama dengan menu pribadi hanya ditampilkan sekali
  const semua = [...pinsV.filter((p) => !sendiri.has(p.id)).map((p) => [p, true]), ...pins.map((p) => [p, false])];
  const g = $("pin-grid");
  g.textContent = "";
  semua.forEach(([p]) => g.append(pinTile(p)));
  if (pins.length < MAX_PIN) g.append(tambahTile());
  const l = $("pin-list");
  l.textContent = "";
  semua.forEach(([p, bersama]) => l.append(pinBaris(p, bersama)));
  $("pin-wrap").hidden = !semua.length;
  $("pin-kosong").hidden = semua.length > 0;
}

// Kartu berbalik: depan = menu untuk dibuka, belakang = atur (tambah, ubah, hapus)
const flipKartu = $("flip");
// Tinggi kartu mengikuti sisi yang sedang tampil (kedua sisi tetap setinggi isinya masing-masing)
function ukurKartu() {
  const h = $(flipKartu.classList.contains("balik") ? "face-belakang" : "face-depan").offsetHeight;
  if (h > 0) $("flip-in").style.setProperty("--h", h + "px");
}
if (typeof ResizeObserver !== "undefined") {
  const ro = new ResizeObserver(ukurKartu);
  ro.observe($("face-depan"));
  ro.observe($("face-belakang"));
}
window.addEventListener("resize", ukurKartu);
ukurKartu();
function putar(belakang) {
  flipKartu.classList.toggle("balik", belakang);
  ukurKartu();
  $("btn-flip").setAttribute("aria-expanded", String(belakang));
  if (belakang) $("btn-flip-balik").focus({ preventScroll: true });
  else setTimeout(() => $("btn-flip").focus({ preventScroll: true }), 320); // sisi depan baru terlihat setelah setengah putaran
}
$("btn-flip").addEventListener("click", () => putar(true));

// Radio: ringkas (hanya bagian atas RadioTune) atau lihat semua (tinggi diperbesar)
$("radio-lihat").addEventListener("click", () => {
  const terbuka = $("radio").classList.toggle("terbuka");
  $("radio-lihat").setAttribute("aria-expanded", String(terbuka));
  $("radio-lihat").textContent = terbuka ? "Ringkas ⤒" : "Lihat semua ⤓";
});
$("btn-flip-balik").addEventListener("click", () => putar(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && flipKartu.classList.contains("balik") && !document.querySelector("dialog[open]")) putar(false);
});

// ---------- Tambah / ubah / hapus ----------
const dlgPin = $("dlg-pin");
const dlgHapus = $("dlg-hapus");

function formPin() {
  const href = normalUrl($("pin-url").value);
  return { href: href || "", nama: $("pin-nama").value.trim().slice(0, 30), ikon: grafem($("pin-ikon").value, 2) };
}
// Favicon di pratinjau baru diminta setelah kolom link selesai diisi (event "change"), bukan tiap ketikan,
// supaya potongan nama domain yang masih diketik tidak ikut dikirim ke Google.
let pinFav = false;
function previewPin() {
  const p = formPin();
  $("pin-preview").replaceWith(Object.assign(pinIkon(p, pinFav), { id: "pin-preview" }));
  $("pin-nama").placeholder = p.href ? "Kosong: " + hostOf(p.href) : "Kosong: pakai nama situs";
}
function openPin(id) {
  const p = id ? pins.find((x) => x.id === id) : null;
  pinTarget = p ? p.id : null;
  $("pin-title").textContent = p ? "Ubah menu" : "Tambah menu";
  $("pin-url").value = p ? p.href : "";
  $("pin-nama").value = p ? p.nama : "";
  $("pin-ikon").value = p ? p.ikon : "";
  pinFav = !!p; // menu yang sudah ada punya link lengkap; menu baru menunggu link selesai diisi
  $("pin-lain").open = !!(p && p.ikon);
  $("pin-del").hidden = !p;
  $("pin-err").textContent = "";
  previewPin();
  dlgPin.showModal();
  $("pin-url").focus();
}
$("pin-url").addEventListener("input", () => {
  pinFav = false;
  previewPin();
});
$("pin-url").addEventListener("change", () => {
  pinFav = true;
  previewPin();
});
["pin-nama", "pin-ikon"].forEach((id) => $(id).addEventListener("input", previewPin));
$("pin-cancel").addEventListener("click", () => dlgPin.close());

let pinSimpan = false; // ketukan ganda pada Simpan tidak menyimpan dua kali
$("form-pin").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (pinSimpan) return;
  const data = formPin();
  if (!data.href) return ($("pin-err").textContent = "Link tidak valid (harus http:// atau https://).");
  const id = idLink(data.href);
  const kembar = pins.find((x) => x.id === id && x.id !== pinTarget);
  if (kembar) return ($("pin-err").textContent = 'Link ini sudah ada di menu: "' + pinLabel(kembar) + '".');
  if (!pinTarget && pins.length >= MAX_PIN) return ($("pin-err").textContent = "Maksimal " + MAX_PIN + " menu.");
  const next = pinTarget ? pins.map((x) => (x.id === pinTarget ? { ...x, ...data, id } : x)) : [...pins, { id, ...data }];
  pinSimpan = true;
  try {
    await store.set("pins", next);
  } catch (err) {
    return ($("pin-err").textContent = "Gagal menyimpan: " + (err && err.message ? err.message : err));
  } finally {
    pinSimpan = false;
  }
  pins = next;
  dlgPin.close();
  renderPins();
});

function konfirmasi(teks) {
  return new Promise((selesai) => {
    $("hapus-teks").textContent = teks;
    dlgHapus.returnValue = "";
    dlgHapus.addEventListener("close", () => selesai(dlgHapus.returnValue === "ya"), { once: true });
    dlgHapus.showModal();
    $("hapus-batal").focus();
  });
}
$("hapus-batal").addEventListener("click", () => dlgHapus.close("batal"));
// Hasil: true = terhapus, false = dibatalkan, teks = alasan gagal
async function hapusPin(p) {
  if (!(await konfirmasi('Hapus menu "' + pinLabel(p) + '"?'))) return false;
  const next = pins.filter((x) => x.id !== p.id);
  try {
    await store.set("pins", next);
  } catch (err) {
    return "Gagal menghapus: " + (err && err.message ? err.message : err);
  }
  pins = next;
  renderPins();
  return true;
}
$("pin-del").addEventListener("click", async () => {
  const p = pins.find((x) => x.id === pinTarget);
  if (!p) return;
  const r = await hapusPin(p);
  if (r === true) dlgPin.close();
  else if (typeof r === "string") $("pin-err").textContent = r;
});

// ---------- Menu bersama: main.json di GitHub ----------
// File main.json di repo (cabang main) diedit lewat GitHub dan tampil sebagai menu bersama untuk semua yang memasang
// extension ini. Hanya dibaca dan divalidasi ketat (hanya link http/https, tampil sebagai teks biasa). Tidak ada tanda
// tangan, jadi siapa pun yang boleh mengubah file itu di repo ikut menentukan menunya.
const MENU_URL = "https://raw.githubusercontent.com/Lab-sah/Aistim.board/main/main.json";
const MENU_JEDA = 5 * 60 * 1000; // GitHub menyimpan salinan file mentah sampai 5 menit
const MAX_V = 48;
let pinsV = []; // menu bersama dari main.json: [{ id, nama, href, ikon }]
let sumber = { t: 0, err: "", lewat: [], ada: true, memuat: false }; // keadaan pemuatan terakhir

// Mengurai isi main.json. Galat fatal dilempar (pesan bahasa Indonesia); entri yang salah dilewati dan dicatat di `lewat`.
function bacaMenu(teks) {
  if (teks.length > 100000) throw new Error("berkasnya terlalu besar");
  let j;
  try { j = JSON.parse(teks); } catch (e) { throw new Error("bukan JSON yang sah (" + e.message + ")"); }
  const daftar = Array.isArray(j) ? j : j && Array.isArray(j.menu) ? j.menu : null;
  if (!daftar) throw new Error('harus berisi daftar "menu"');
  const items = [], lewat = [], ada = new Set();
  daftar.forEach((x, i) => {
    const no = "#" + (i + 1);
    const o = x && typeof x === "object" ? x : null;
    const href = o ? normalUrl(typeof o.link === "string" ? o.link : typeof o.href === "string" ? o.href : "") : null;
    if (!href) return lewat.push(no + " link kosong atau tidak valid");
    const id = idLink(href);
    if (ada.has(id)) return lewat.push(no + " link sama dengan menu sebelumnya");
    if (items.length >= MAX_V) return lewat.push(no + " melebihi batas " + MAX_V + " menu");
    ada.add(id);
    items.push({ id, nama: typeof o.nama === "string" ? o.nama.trim().slice(0, 30) : "", href, ikon: typeof o.ikon === "string" ? grafem(o.ikon, 2) : "" });
  });
  return { items, lewat };
}
function tampilSumber() {
  const tm = sumber.t ? new Date(sumber.t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
  let s;
  if (sumber.memuat) s = "Memuat main.json…";
  else if (sumber.err) s = "Gagal memuat main.json: " + sumber.err + "." + (pinsV.length ? " Memakai salinan terakhir." : "");
  else if (!sumber.ada) s = "main.json belum ada di repo.";
  else if (!sumber.t) s = "";
  else if (!pinsV.length && !sumber.lewat.length) s = "main.json belum berisi menu.";
  else s = "Menu bersama dari main.json: " + pinsV.length + " item" + (tm ? " · diperbarui " + tm : "") + ".";
  if (!sumber.memuat && !sumber.err && sumber.lewat.length) s += " Dilewati " + sumber.lewat.length + ": " + sumber.lewat.slice(0, 3).join("; ") + (sumber.lewat.length > 3 ? "; …" : "") + ".";
  $("sumber-info").textContent = s;
  $("sumber-segar").disabled = sumber.memuat;
}
// Tanpa paksa: dilewati bila pemuatan terakhir berhasil kurang dari 5 menit lalu. Dengan paksa (tombol Segarkan) memakai
// parameter acak supaya salinan 5 menit di GitHub terlewati dan hasil edit langsung terlihat.
async function muatMenuBersama(paksa) {
  if (sumber.memuat) return;
  if (!paksa && !sumber.err && sumber.t && Date.now() - sumber.t < MENU_JEDA) return;
  sumber.memuat = true;
  tampilSumber();
  const ctl = new AbortController();
  const batas = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(MENU_URL + (paksa ? "?t=" + Date.now() : ""), { cache: "no-cache", signal: ctl.signal });
    if (r.status === 404) {
      pinsV = [];
      sumber = { ...sumber, ada: false, err: "", lewat: [], t: Date.now() };
    } else {
      if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? "GitHub membatasi permintaan, coba lagi nanti" : "GitHub membalas " + r.status);
      // Batas ukuran dicek dari header dulu, supaya berkas yang terlalu besar tidak diunduh seluruhnya
      if (Number(r.headers.get("content-length") || 0) > 100000) throw new Error("berkasnya terlalu besar");
      const { items, lewat } = bacaMenu((await r.text()).replace(/^\uFEFF/, ""));
      pinsV = items;
      sumber = { ...sumber, ada: true, err: "", lewat, t: Date.now() };
    }
    try { await store.set("menuV", { t: sumber.t, ada: sumber.ada, items: pinsV, lewat: sumber.lewat }); } catch (e) {}
  } catch (e) {
    sumber.err = e && e.name === "AbortError" ? "waktu habis" : e && e.name === "TypeError" ? "tidak ada koneksi" : e && e.message ? e.message : "gagal";
    // Galat ikut disimpan: setelah muat ulang pesannya tetap terlihat dan pemuatan dicoba lagi sampai berhasil
    try { await store.set("menuV", { t: sumber.t, ada: sumber.ada, items: pinsV, lewat: sumber.lewat, err: sumber.err }); } catch (e2) {}
  } finally {
    clearTimeout(batas);
    sumber.memuat = false;
    tampilSumber();
    renderPins();
  }
}
// Salinan terakhir yang berhasil dimuat dipakai dulu (offline, dan supaya tile tampil tanpa menunggu jaringan)
async function muatCacheMenu() {
  const c = await store.get("menuV", null);
  if (!c || typeof c !== "object") return;
  pinsV = rapikanPins(c.items).slice(0, MAX_V);
  sumber = {
    t: typeof c.t === "number" ? c.t : 0,
    err: typeof c.err === "string" ? c.err.slice(0, 200) : "",
    lewat: Array.isArray(c.lewat) ? c.lewat.filter((x) => typeof x === "string").slice(0, 10).map((x) => x.slice(0, 120)) : [],
    ada: c.ada !== false,
    memuat: false,
  };
}
$("sumber-segar").addEventListener("click", () => muatMenuBersama(true));

// ---------- Jam dan kata-kata ----------
const QUOTES = [
  { text: "Mulailah dari mana kamu berada, gunakan apa yang kamu punya.", author: "Arthur Ashe" },
  { text: "Langkah kecil setiap hari lebih baik daripada lompatan besar sesekali.", author: "Aistim" },
  { text: "Fokus pada kemajuan, bukan kesempurnaan.", author: "Aistim" },
  { text: "Kerjakan yang penting dulu, sisanya menyusul.", author: "Aistim" },
  { text: "Konsistensi mengalahkan intensitas.", author: "Aistim" },
  { text: "Sedikit demi sedikit, lama-lama menjadi bukit.", author: "Peribahasa" },
  { text: "Hari ini adalah kesempatan baru untuk memulai.", author: "Aistim" },
  { text: "Tenang, satu langkah saja dulu.", author: "Aistim" },
  { text: "Yang dirapikan hari ini memudahkan besok.", author: "Aistim" },
  { text: "Istirahat juga bagian dari bekerja.", author: "Aistim" },
];
// Jam 24 jam, diperbarui tepat di pergantian menit (dan saat tab kembali terlihat)
function tick() {
  const now = new Date();
  $("jam-canvas").setAttribute("aria-label", "Pukul " + now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
  $("date").textContent = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (latar.harian) terapkanLatar(); // ganti warna saat hari berganti
  clearTimeout(tick.t);
  tick.t = setTimeout(tick, 60000 - (now.getTime() % 60000) + 50);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
// ---------- Jam analog: digambar di canvas, diperbarui tiap detik ----------
const jamCanvas = $("jam-canvas");
const jamCtx = jamCanvas.getContext("2d");
let jamS = 0, jamDpr = 1, jamTimer = 0;
const jamLogo = new Image();
jamLogo.src = "icons/icon128.png";
jamLogo.onload = () => gambarJam(new Date());
function jamUkur() {
  const r = jamCanvas.getBoundingClientRect();
  jamS = Math.max(120, Math.round(r.width));
  jamDpr = Math.min(window.devicePixelRatio || 1, 2);
  jamCanvas.width = Math.round(jamS * jamDpr);
  jamCanvas.height = Math.round(jamS * jamDpr);
}
// Satu jarum: dari pusat ke arah sudut a (radian, 0 = jam 12)
function jarum(c, cx, cy, a, panjang, lebar, warna) {
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + Math.cos(a) * panjang, cy + Math.sin(a) * panjang);
  c.lineCap = "round";
  c.lineWidth = lebar;
  c.strokeStyle = warna;
  c.stroke();
}
function gambarJam(d) {
  const c = jamCtx, s = jamS, cx = s / 2, cy = s / 2, R = s / 2 - 4;
  if (!s) return;
  c.setTransform(jamDpr, 0, 0, jamDpr, 0, 0);
  c.clearRect(0, 0, s, s);
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.fillStyle = "rgba(255,255,255,0.08)";
  c.fill();
  c.lineWidth = Math.max(1.5, s * 0.012);
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.stroke();
  for (let i = 0; i < 12; i++) { // tanda jam: 12 garis, yang di 12, 3, 6, 9 lebih tebal
    const a = (i * Math.PI) / 6 - Math.PI / 2, besar = i % 3 === 0;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * R * (besar ? 0.8 : 0.87), cy + Math.sin(a) * R * (besar ? 0.8 : 0.87));
    c.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
    c.lineCap = "round";
    c.lineWidth = besar ? s * 0.03 : s * 0.015;
    c.strokeStyle = "rgba(255,255,255,0.9)";
    c.stroke();
  }
  c.font = "500 " + Math.round(s * 0.1) + "px system-ui, -apple-system, sans-serif"; // angka jam 1 sampai 12
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "rgba(255,255,255,0.95)";
  for (let i = 1; i <= 12; i++) {
    const a = (i * Math.PI) / 6 - Math.PI / 2;
    c.fillText(String(i), cx + Math.cos(a) * R * 0.68, cy + Math.sin(a) * R * 0.68);
  }
  if (jamLogo.complete && jamLogo.naturalWidth) { // logo Aistim di tengah wajah jam, jarum digambar di atasnya
    const u = s * 0.3;
    c.save();
    c.beginPath();
    c.arc(cx, cy, u / 2, 0, Math.PI * 2);
    c.clip();
    c.drawImage(jamLogo, cx - u / 2, cy - u / 2, u, u);
    c.restore();
  }
  const detik = d.getSeconds(), menit = d.getMinutes() + detik / 60, jam = (d.getHours() % 12) + menit / 60;
  jarum(c, cx, cy, (jam * Math.PI) / 6 - Math.PI / 2, R * 0.5, s * 0.035, "#ffffff");
  jarum(c, cx, cy, (menit * Math.PI) / 30 - Math.PI / 2, R * 0.75, s * 0.022, "#ffffff");
  jarum(c, cx, cy, (detik * Math.PI) / 30 - Math.PI / 2, R * 0.85, s * 0.01, "#fca5a5");
  c.beginPath();
  c.arc(cx, cy, s * 0.03, 0, Math.PI * 2);
  c.fillStyle = "#fca5a5";
  c.fill();
}
// Digambar tepat di setiap pergantian detik (cukup murah, tidak perlu 60 fps)
function jamLoop() {
  clearTimeout(jamTimer);
  const d = new Date();
  gambarJam(d);
  jamTimer = setTimeout(jamLoop, 1000 - (d.getTime() % 1000) + 5);
}
window.addEventListener("resize", () => { jamUkur(); jamLoop(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) jamLoop(); });

// Satu kata-kata per hari (hari menurut jam lokal), berganti tiap tengah malam
let KUTIPAN = QUOTES; // daftar yang dipakai: dari quotes.json di GitHub, atau daftar bawaan
const KUTIPAN_URL = "https://raw.githubusercontent.com/Lab-sah/Aistim.board/main/quotes.json";
const KUTIPAN_JEDA = 24 * 60 * 60 * 1000; // dibaca ulang paling sering sehari sekali
function bacaKutipan(j) {
  const daftar = Array.isArray(j) ? j : j && Array.isArray(j.kutipan) ? j.kutipan : null;
  if (!daftar) throw new Error("format tidak dikenali");
  const hasil = daftar
    .filter((x) => x && typeof x.text === "string" && typeof x.author === "string")
    .map((x) => ({ text: x.text.trim().slice(0, 200), author: x.author.trim().slice(0, 40) }))
    .filter((x) => x.text && x.author)
    .slice(0, 200);
  if (hasil.length < 5) throw new Error("terlalu sedikit kutipan");
  return hasil;
}
// Salinan lokal dipakai dulu, lalu dicek ulang dari GitHub bila sudah lebih dari sehari. Gagal = tetap pakai daftar yang ada.
async function muatKutipan() {
  try {
    const c = await store.get("kutipanV", null);
    if (c && Array.isArray(c.items) && c.items.length) KUTIPAN = bacaKutipan(c.items);
    initQuote();
    if (c && typeof c.t === "number" && Date.now() - c.t < KUTIPAN_JEDA) return;
  } catch (e) {}
  try {
    const r = await fetch(KUTIPAN_URL, { cache: "no-cache" });
    if (!r.ok) return;
    const items = bacaKutipan(await r.json());
    KUTIPAN = items;
    await store.set("kutipanV", { t: Date.now(), items });
    initQuote();
  } catch (e) {}
}
function initQuote() {
  const d = new Date();
  const hari = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const q = KUTIPAN[hari % KUTIPAN.length];
  $("quote-text").textContent = "“" + q.text + "”";
  $("quote-author").textContent = q.author;
}

// ---------- Latar: warna gradien halaman, bisa diganti atau berganti sendiri tiap hari ----------
// Pilihan disimpan di browser (chrome.storage.local, kunci "latar"). Tanpa jaringan.
// Pemandangan (foto: berkas SVG di bg/) dan warna gradien. Pemandangan pertama jadi default.
const LATAR = [
  { id: "danau", nama: "Danau senja", foto: "bg/danau-senja.svg" },
  { id: "gunung", nama: "Gunung pagi", foto: "bg/gunung-pagi.svg" },
  { id: "hutan", nama: "Hutan kabut", foto: "bg/hutan-kabut.svg" },
  { id: "pantai", nama: "Pantai senja", foto: "bg/pantai-senja.svg" },
  { id: "malam", nama: "Malam berbintang", foto: "bg/malam-bintang.svg" },
  // Foto dengan gelembung yang naik pelan di atasnya (flag "gelembung")
  { id: "akuarium", nama: "Akuarium", foto: "bg/akuarium.jpg", gelembung: true, ikan: true },
  { id: "musim-gugur", nama: "Hutan musim gugur", foto: "bg/hutan-musim-gugur.jpg", gelembung: true },
  // Adegan yang digambar di canvas dan bergerak
  { id: "hujan", nama: "Hujan kota", css: "linear-gradient(160deg, #0b1220 0%, #1b2638 50%, #2a3a52 100%)", adegan: "hujan" },
  { id: "salju", nama: "Salju gunung", css: "linear-gradient(160deg, #2c4a6b 0%, #7f9bb8 60%, #dbe6f0 100%)", adegan: "salju" },
  { id: "kunang", nama: "Kunang-kunang", css: "linear-gradient(160deg, #1a2540 0%, #4a4a6a 55%, #e7a25c 100%)", adegan: "kunang" },
  { id: "bintang", nama: "Bintang jatuh", css: "linear-gradient(160deg, #03060f 0%, #0c1a38 60%, #1d2f5c 100%)", adegan: "bintang" },
  { id: "ombak", nama: "Ombak senja", css: "linear-gradient(160deg, #2b5876 0%, #e8805e 55%, #0d3d57 100%)", adegan: "ombak" },
  // Animasi: mesh warna yang bergerak pelan, dan riak gelombang dari setiap titik yang diklik
  { id: "gelombang", nama: "Gelombang", css: "linear-gradient(160deg, #0a4a57 0%, #2dd4bf 50%, #7c3aed 100%)", animasi: true },
  { id: "teal", nama: "Teal", css: "linear-gradient(160deg, #0a4a57 0%, #0b6672 48%, #08505b 100%)" },
  { id: "biru", nama: "Biru malam", css: "linear-gradient(160deg, #0f172a 0%, #1e3a5f 52%, #0f172a 100%)" },
  { id: "ungu", nama: "Ungu", css: "linear-gradient(160deg, #2e1065 0%, #6b21a8 50%, #1e1b4b 100%)" },
  { id: "arang", nama: "Arang", css: "linear-gradient(160deg, #111827 0%, #374151 50%, #0b0f19 100%)" },
];
const LATAR_DEFAULT = "akuarium";
let latar = { id: LATAR_DEFAULT, harian: false };
function normLatar(v) {
  const o = v && typeof v === "object" ? v : {};
  return { id: LATAR.some((x) => x.id === o.id) ? o.id : LATAR_DEFAULT, harian: o.harian === true };
}
// Nilai CSS untuk latar: foto (dengan warna cadangan) atau gradien
function latarCss(x) {
  return x.foto ? 'url("' + x.foto + '") center / cover no-repeat' : x.css;
}
// Mode harian: satu warna per hari (hari menurut jam lokal), berurutan mengikuti daftar
function latarAktif() {
  if (latar.harian) return LATAR[Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000) % LATAR.length];
  return LATAR.find((x) => x.id === latar.id) || LATAR[0];
}
// ---------- Latar gelombang: mesh yang bergerak, dan riak di setiap klik ----------
const fx = $("fx");
const fxCtx = fx.getContext("2d");
const fxGerak = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
let fxAktif = false, fxRaf = 0, fxW = 0, fxH = 0, fxDpr = 1, fxT0 = 0;
const riak = []; // { x, y, t } dalam piksel kanvas; t = waktu klik (performance.now)
// Bola warna mesh: rgb, opasitas, fase awal, dan kecepatan gerak
const MESH = [
  { rgb: "34,211,238", a: 0.5, p: 0.0, k: 1.0 },
  { rgb: "94,234,212", a: 0.38, p: 2.1, k: 0.8 },
  { rgb: "124,58,237", a: 0.42, p: 4.2, k: 1.2 },
  { rgb: "14,116,144", a: 0.6, p: 5.3, k: 0.9 },
];
function fxUkuran() {
  fxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
  fxW = Math.round(innerWidth * fxDpr);
  fxH = Math.round(innerHeight * fxDpr);
  fx.width = fxW;
  fx.height = fxH;
}
function fxGambar(now) {
  const W = fxW, H = fxH, s = Math.max(W, H);
  const t = fxGerak ? now - fxT0 : 0;
  fxCtx.globalCompositeOperation = "source-over";
  fxCtx.fillStyle = "#0a4a57";
  fxCtx.fillRect(0, 0, W, H);
  for (const b of MESH) {
    const cx = W * (0.5 + 0.38 * Math.sin(t * 0.00013 * b.k + b.p));
    const cy = H * (0.5 + 0.34 * Math.cos(t * 0.00011 * b.k + b.p * 1.7));
    const g = fxCtx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.6);
    g.addColorStop(0, "rgba(" + b.rgb + "," + b.a + ")");
    g.addColorStop(1, "rgba(" + b.rgb + ",0)");
    fxCtx.fillStyle = g;
    fxCtx.fillRect(0, 0, W, H);
  }
  // Riak: cincin cahaya yang melebar dan memudar, dengan cincin kedua yang sedikit tertinggal
  for (let i = riak.length - 1; i >= 0; i--) {
    const u = (now - riak[i].t) / 2600;
    if (u >= 1) { riak.splice(i, 1); continue; }
    for (const off of [0, 0.14]) {
      const v = u - off;
      if (v <= 0) continue;
      const r = (1 - Math.pow(1 - v, 3)) * s * 0.65;
      const k = (1 - v) * (off ? 0.5 : 1);
      const w = 70 * fxDpr;
      const g = fxCtx.createRadialGradient(riak[i].x, riak[i].y, Math.max(0, r - w), riak[i].x, riak[i].y, r + w);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255," + (0.28 * k).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      fxCtx.fillStyle = g;
      fxCtx.fillRect(0, 0, W, H);
    }
  }
}
// Dibatasi 30 fps supaya tidak menguras baterai. Setelah 10 detik tanpa sentuhan atau gerakan mouse, turun ke 10 fps
// (gerak tetap pelan dan terus berjalan), dan kembali ke 30 fps begitu layar disentuh lagi.
const FPS_MAKS = 1000 / 30;
const FPS_DIAM = 1000 / 10;
const DIAM_SETELAH = 10000;
let lastAktif = performance.now();
["pointerdown", "pointermove", "keydown"].forEach((ev) => window.addEventListener(ev, () => { lastAktif = performance.now(); }, { passive: true }));
const jedaFrame = (now) => (now - lastAktif > DIAM_SETELAH ? FPS_DIAM : FPS_MAKS);
let fxLast = -Infinity;
function fxFrame(now) {
  fxRaf = 0;
  if (!fxAktif || document.hidden) return;
  if (now - fxLast >= jedaFrame(now)) { fxLast = now; fxGambar(now); }
  fxRaf = requestAnimationFrame(fxFrame);
}
function fxNyala(on) {
  if (on === fxAktif) return;
  fxAktif = on;
  fx.hidden = !on;
  if (on) {
    fxUkuran();
    fxT0 = performance.now();
    if (!fxRaf && !document.hidden) fxRaf = requestAnimationFrame(fxFrame);
  } else if (fxRaf) {
    cancelAnimationFrame(fxRaf);
    fxRaf = 0;
  }
}
window.addEventListener("pointerdown", (e) => {
  if (!fxAktif || document.querySelector("dialog[open]")) return;
  riak.push({ x: e.clientX * fxDpr, y: e.clientY * fxDpr, t: performance.now() });
  if (riak.length > 12) riak.shift();
  if (!fxRaf && !document.hidden) fxRaf = requestAnimationFrame(fxFrame);
});
window.addEventListener("resize", () => { if (fxAktif) fxUkuran(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && fxAktif && !fxRaf) fxRaf = requestAnimationFrame(fxFrame);
});

// ---------- Gelembung: gelembung naik pelan di atas foto, sebagian bergoyang ke samping ----------
const gel = $("gel");
const gelCtx = gel.getContext("2d");
const gelGerak = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
let gelAktif = false, gelRaf = 0, gelW = 0, gelH = 0, gelDpr = 1, gelLast = 0;
let gelembung = [];
let ikanOn = false; // ikan neon kartun yang berenang di atas foto akuarium
let ikan = [];
// Satu gelembung (ukuran dalam piksel CSS). acak = true saat awal, supaya tidak semua muncul dari bawah sekaligus
function gelBuat(acak) {
  const b = { r: 0, x: 0, y: 0, v: 0, ph: Math.random() * 6.283, fr: 0.5 + Math.random() * 0.8, amp: 4 + Math.random() * 12 };
  gelUlang(b, acak);
  return b;
}
function gelUlang(b, acak) {
  b.r = 5 + Math.random() * 18;
  b.x = Math.random() * innerWidth;
  b.y = acak ? Math.random() * innerHeight : innerHeight + b.r + Math.random() * 60;
  b.v = (16 + Math.random() * 34) * (gelGerak ? 1 : 0.3); // piksel per detik
}
function gelUkuran() {
  gelDpr = Math.min(window.devicePixelRatio || 1, 1.5);
  gelW = Math.round(innerWidth * gelDpr);
  gelH = Math.round(innerHeight * gelDpr);
  gel.width = gelW;
  gel.height = gelH;
  const n = Math.min(60, Math.max(20, Math.round((innerWidth * innerHeight) / 12000)));
  gelembung = Array.from({ length: n }, () => gelBuat(true));
  if (ikanOn) ikanBuat();
}
function gelGambar(now) {
  const dt = gelLast ? Math.min(0.05, (now - gelLast) / 1000) : 0;
  gelLast = now;
  gelCtx.clearRect(0, 0, gelW, gelH);
  const t = now / 1000;
  for (const b of gelembung) {
    b.y -= b.v * dt;
    if (b.y + b.r < -10) gelUlang(b, false);
    const x = b.x + (gelGerak ? Math.sin(t * b.fr + b.ph) * b.amp : 0);
    const cx = x * gelDpr, cy = b.y * gelDpr, rr = b.r * gelDpr;
    gelCtx.beginPath();
    gelCtx.arc(cx, cy, rr, 0, Math.PI * 2);
    gelCtx.fillStyle = "rgba(255,255,255,0.10)";
    gelCtx.fill();
    gelCtx.lineWidth = Math.max(1, rr * 0.12);
    gelCtx.strokeStyle = "rgba(255,255,255,0.65)";
    gelCtx.stroke();
    gelCtx.beginPath(); // kilau kecil di sisi kiri atas
    gelCtx.arc(cx - rr * 0.38, cy - rr * 0.38, rr * 0.22, 0, Math.PI * 2);
    gelCtx.fillStyle = "rgba(255,255,255,0.7)";
    gelCtx.fill();
  }
  if (ikanOn) ikanGambar(t, dt);
}
let gelLastDraw = -Infinity;
// ---------- Ikan neon kartun: berenang di atas foto akuarium, arah acak, mendekati kursor bila ada ----------
let kursor = null; // { x, y, t }: posisi kursor atau sentuhan terakhir (piksel CSS)
["pointermove", "pointerdown"].forEach((ev) => window.addEventListener(ev, (e) => { kursor = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true }));
const KURSOR_AKTIF = 3000; // ms: setelah tidak ada gerakan, ikan kembali berkeliling sendiri
// Sprite koi (gambar tanpa latar, di bg/ikan/): pandangan samping, atas, dan tiga per empat
const IKAN_IMG = { samping: new Image(), atas: new Image(), tiga: new Image() };
IKAN_IMG.samping.src = "bg/ikan/koi-tubuh.png"; // badan koi (sprite samping dipotong di pangkal ekor)
const IKAN_EKOR = new Image();
IKAN_EKOR.src = "bg/ikan/koi-ekor.png";
IKAN_IMG.atas.src = "bg/ikan/koi-atas.png";
IKAN_IMG.tiga.src = "bg/ikan/koi-tiga-empat.png";
const JENIS_IKAN = ["samping"]; // semua koi pandangan samping, seperti ikan di akuarium
function ikanBaru() {
  const sudut = Math.random() * Math.PI * 2, v = (18 + Math.random() * 30) * (gelGerak ? 1 : 0.3);
  return {
    x: Math.random() * innerWidth,
    y: innerHeight * (0.28 + Math.random() * 0.6),
    vx: Math.cos(sudut) * v,
    vy: Math.sin(sudut) * v * 0.4,
    p: 16 + Math.random() * 12,
    ph: Math.random() * 6.283,
    jenis: JENIS_IKAN[Math.floor(Math.random() * JENIS_IKAN.length)],
    hadap: Math.random() < 0.5 ? 1 : -1,
  };
}
function ikanBuat() {
  const n = Math.min(10, Math.max(4, Math.round((innerWidth * innerHeight) / 160000)));
  ikan = Array.from({ length: n }, () => ikanBaru());
}
function ikanGambar(t, dt) {
  const c = gelCtx, now = performance.now();
  const kejar = kursor && now - kursor.t < KURSOR_AKTIF;
  const kecepatanMaks = (kejar ? 90 : 45) * (gelGerak ? 1 : 0.3);
  for (const f of ikan) {
    if (kejar) {
      const dx = kursor.x - f.x, dy = kursor.y - f.y, jarak = Math.hypot(dx, dy) || 1;
      if (jarak > 40) { // belok halus menuju kursor
        const k = Math.min(1, dt * 2.2);
        f.vx += ((dx / jarak) * kecepatanMaks - f.vx) * k;
        f.vy += ((dy / jarak) * kecepatanMaks * 0.6 - f.vy) * k;
      }
    } else if (Math.random() < dt * 0.5) { // sesekali ganti arah secara acak
      const sudut = Math.random() * Math.PI * 2, v = Math.hypot(f.vx, f.vy) || 30;
      f.vx = Math.cos(sudut) * v;
      f.vy = Math.sin(sudut) * v * 0.4;
    }
    const sp = Math.hypot(f.vx, f.vy);
    if (sp < 12) { // jangan sampai diam
      const sudut = Math.random() * Math.PI * 2;
      f.vx = Math.cos(sudut) * 15;
      f.vy = Math.sin(sudut) * 6;
    } else if (sp > kecepatanMaks) {
      f.vx *= kecepatanMaks / sp;
      f.vy *= kecepatanMaks / sp;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt + Math.sin(t * 0.7 + f.ph) * 0.1;
    if (f.x < -50) f.x = innerWidth + 50; // keluar di satu sisi, muncul di sisi lain
    else if (f.x > innerWidth + 50) f.x = -50;
    if (f.y < innerHeight * 0.2) { f.y = innerHeight * 0.2; f.vy = Math.abs(f.vy); }
    if (f.y > innerHeight * 0.9) { f.y = innerHeight * 0.9; f.vy = -Math.abs(f.vy); }
    if (Math.abs(f.vx) > 4) f.hadap = f.vx > 0 ? 1 : -1; // menghadap arah gerak
    const img = IKAN_IMG[f.jenis];
    if (!img.complete || !img.naturalWidth || !IKAN_EKOR.complete) continue;
    const tinggi = f.p * 2 * gelDpr, lebar = (tinggi * 256) / 110; // lebar sprite utuh (256 x 110)
    c.save();
    c.translate(f.x * gelDpr, f.y * gelDpr);
    c.scale(-f.hadap, 1); // kepala ke arah gerak; sprite aslinya menghadap kiri
    c.transform(1, 0, Math.sin(t * 6 + f.ph) * 0.05, 1, 0, 0); // badan meliuk pelan
    // ekor: diputar di pangkalnya (sekitar 74% lebar sprite), mengibas bergantian
    const pangkal = -lebar / 2 + lebar * (190 / 256);
    c.save();
    c.translate(pangkal, 0);
    c.rotate(Math.sin(t * 8 + f.ph) * 0.4);
    c.drawImage(IKAN_EKOR, 0, -tinggi / 2, lebar * (66 / 256), tinggi);
    c.restore();
    c.drawImage(img, -lebar / 2, -tinggi / 2, lebar * (194 / 256), tinggi); // badan menutupi sambungan
    c.restore();
  }
}
function gelFrame(now) {
  gelRaf = 0;
  if (!gelAktif || document.hidden) return;
  if (now - gelLastDraw >= jedaFrame(now)) { gelLastDraw = now; gelGambar(now); }
  gelRaf = requestAnimationFrame(gelFrame);
}
function gelNyala(on) {
  if (on === gelAktif) return;
  gelAktif = on;
  gel.hidden = !on;
  if (on) {
    gelUkuran();
    gelLast = 0;
    if (!gelRaf && !document.hidden) gelRaf = requestAnimationFrame(gelFrame);
  } else if (gelRaf) {
    cancelAnimationFrame(gelRaf);
    gelRaf = 0;
  }
}
window.addEventListener("resize", () => { if (gelAktif) gelUkuran(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && gelAktif && !gelRaf) gelRaf = requestAnimationFrame(gelFrame);
});

// ---------- Adegan: pemandangan yang digambar di canvas dan bergerak (hujan, salju, kunang-kunang, bintang, ombak) ----------
const adeganEl = $("adegan");
const adeganCtx = adeganEl.getContext("2d");
let adeganId = null, adeganRaf = 0, adeganDraw = -Infinity, adeganLast = 0, adeganT0 = 0, adeganW = 0, adeganH = 0, adeganDpr = 1, adeganSt = null;
const acak = (a, b) => a + Math.random() * (b - a);
// Langit bertingkat dari atas ke bawah
function langit(c, W, H, warna) {
  const g = c.createLinearGradient(0, 0, 0, H);
  warna.forEach((w, i) => g.addColorStop(i / (warna.length - 1), w));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
// Garis bukit atau gunung dengan sinus (tidak acak per frame, jadi tampilannya tetap)
function siluet(c, W, H, y0, amp, fr, ph, warna) {
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) c.lineTo(x, y0 - amp * (0.6 * Math.sin(x * fr + ph) + 0.4 * Math.sin(x * fr * 2.3 + ph * 1.7)));
  c.lineTo(W, H);
  c.closePath();
  c.fillStyle = warna;
  c.fill();
}
const ADEGAN = {
  hujan: {
    init(W, H) {
      return {
        tetes: Array.from({ length: Math.round((W * H) / 9000) }, () => ({ x: acak(0, W), y: acak(-H, H), v: acak(600, 950), p: acak(12, 22) })),
        gedung: Array.from({ length: 16 }, (_, i) => ({ x: (i * W) / 15 - 20, h: H * acak(0.18, 0.42), lampu: Array.from({ length: 6 }, () => [acak(0, 1), acak(0, 1), Math.random() < 0.5]) })),
        kilat: 0, tunggu: acak(3, 8),
      };
    },
    draw(c, W, H, t, dt, st) {
      langit(c, W, H, ["#0b1220", "#1b2638", "#2a3a52"]);
      for (const g of st.gedung) {
        c.fillStyle = "#070b14";
        c.fillRect(g.x, H - g.h, W / 15 + 12, g.h);
        for (const [lx, ly, nyala] of g.lampu) {
          if (!nyala) continue;
          c.fillStyle = "rgba(253,224,130,0.55)";
          c.fillRect(g.x + lx * (W / 15), H - g.h + ly * g.h * 0.9, 4, 6);
        }
      }
      st.tunggu -= dt;
      if (st.tunggu <= 0) { st.kilat = 1; st.tunggu = acak(4, 10); }
      if (st.kilat > 0) {
        c.fillStyle = "rgba(210,225,255," + (0.22 * st.kilat).toFixed(3) + ")";
        c.fillRect(0, 0, W, H);
        st.kilat = Math.max(0, st.kilat - dt * 3);
      }
      c.strokeStyle = "rgba(200,215,240,0.45)";
      c.lineWidth = 1;
      c.beginPath();
      for (const d of st.tetes) {
        d.y += d.v * dt;
        d.x -= d.v * 0.14 * dt;
        if (d.y > H) { d.y = acak(-120, 0); d.x = acak(0, W + 60); }
        if (d.x < -20) d.x += W + 40;
        c.moveTo(d.x, d.y);
        c.lineTo(d.x + d.p * 0.14, d.y - d.p);
      }
      c.stroke();
    },
  },
  salju: {
    init(W, H) {
      return { kepingan: Array.from({ length: Math.round((W * H) / 6000) }, () => ({ x: acak(0, W), y: acak(0, H), r: acak(1, 3.2), v: acak(18, 55), ph: acak(0, 6.28) })) };
    },
    draw(c, W, H, t, dt, st) {
      langit(c, W, H, ["#2c4a6b", "#7f9bb8", "#dbe6f0"]);
      siluet(c, W, H, H * 0.62, H * 0.22, 0.004, 1.2, "#8ea5bf");
      siluet(c, W, H, H * 0.75, H * 0.16, 0.007, 3.1, "#5a7290");
      siluet(c, W, H, H * 0.92, H * 0.06, 0.011, 0.4, "#e9f1f7");
      c.fillStyle = "rgba(255,255,255,0.9)";
      for (const k of st.kepingan) {
        k.y += k.v * dt;
        if (k.y > H + 5) { k.y = -5; k.x = acak(0, W); }
        const x = k.x + Math.sin(t * 0.9 + k.ph) * 14;
        c.beginPath();
        c.arc(x, k.y, k.r, 0, Math.PI * 2);
        c.fill();
      }
    },
  },
  kunang: {
    init(W, H) {
      return { kunang: Array.from({ length: 36 }, () => ({ x: acak(0, W), y: acak(H * 0.4, H * 0.95), ph: acak(0, 6.28), vx: acak(-14, 14), vy: acak(-9, 9) })) };
    },
    draw(c, W, H, t, dt, st) {
      langit(c, W, H, ["#1a2540", "#4a4a6a", "#e7a25c"]);
      siluet(c, W, H, H * 0.7, H * 0.1, 0.005, 2.0, "#23352a");
      siluet(c, W, H, H * 0.85, H * 0.06, 0.009, 0.7, "#142219");
      for (const k of st.kunang) {
        k.x += k.vx * dt;
        k.y += k.vy * dt + Math.sin(t + k.ph) * 0.6;
        if (k.x < -10) k.x = W + 10;
        if (k.x > W + 10) k.x = -10;
        if (k.y < H * 0.35) k.y = H * 0.95;
        if (k.y > H) k.y = H * 0.4;
        const a = 0.5 + 0.5 * Math.sin(t * 2.2 + k.ph);
        const g = c.createRadialGradient(k.x, k.y, 0, k.x, k.y, 9);
        g.addColorStop(0, "rgba(255,240,150," + (0.9 * a).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,240,150,0)");
        c.fillStyle = g;
        c.fillRect(k.x - 9, k.y - 9, 18, 18);
      }
    },
  },
  bintang: {
    init(W, H) {
      return {
        bintang: Array.from({ length: Math.round((W * H) / 5000) }, () => ({ x: acak(0, W), y: acak(0, H * 0.8), r: acak(0.5, 1.8), ph: acak(0, 6.28), fr: acak(0.8, 2.5) })),
        jatuh: null, tunggu: acak(3, 7),
      };
    },
    draw(c, W, H, t, dt, st) {
      langit(c, W, H, ["#03060f", "#0c1a38", "#1d2f5c"]);
      for (const b of st.bintang) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * b.fr + b.ph));
        c.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.fill();
      }
      siluet(c, W, H, H * 0.9, H * 0.07, 0.006, 1.5, "#050a16");
      st.tunggu -= dt;
      if (!st.jatuh && st.tunggu <= 0) {
        st.jatuh = { x: acak(0, W * 0.8), y: acak(0, H * 0.3), vx: W * 0.9, vy: H * 0.45, sisa: 1 };
        st.tunggu = acak(4, 9);
      }
      const s = st.jatuh;
      if (s) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.sisa -= dt * 1.2;
        const len = Math.hypot(s.vx, s.vy), ux = s.vx / len, uy = s.vy / len, panjang = 140;
        const g = c.createLinearGradient(s.x - ux * panjang, s.y - uy * panjang, s.x, s.y);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(255,255,255," + Math.max(0, s.sisa).toFixed(3) + ")");
        c.strokeStyle = g;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(s.x - ux * panjang, s.y - uy * panjang);
        c.lineTo(s.x, s.y);
        c.stroke();
        if (s.sisa <= 0) st.jatuh = null;
      }
    },
  },
  ombak: {
    init() { return {}; },
    draw(c, W, H, t) {
      const hor = H * 0.58, sx = W * 0.72, sy = hor - H * 0.02;
      langit(c, W, H, ["#2b5876", "#e8805e", "#ffc07a"]);
      const glow = c.createRadialGradient(sx, sy, 0, sx, sy, H * 0.35);
      glow.addColorStop(0, "rgba(255,240,200,0.9)");
      glow.addColorStop(1, "rgba(255,240,200,0)");
      c.fillStyle = glow;
      c.fillRect(0, 0, W, H);
      c.fillStyle = "#fff3cf";
      c.beginPath();
      c.arc(sx, sy, H * 0.05, 0, Math.PI * 2);
      c.fill();
      const laut = c.createLinearGradient(0, hor, 0, H);
      laut.addColorStop(0, "#2a8ca6");
      laut.addColorStop(1, "#0d3d57");
      c.fillStyle = laut;
      c.fillRect(0, hor, W, H - hor);
      c.fillStyle = "rgba(255,230,160,0.35)"; // pantulan matahari di air
      for (let i = 0; i < 9; i++) {
        const w = H * 0.14 * (1 - i / 10);
        c.fillRect(sx - w / 2 + Math.sin(t * 1.5 + i) * 6, hor + 6 + i * (H * 0.035), w, 3);
      }
      c.lineWidth = 2; // garis ombak yang bergerak
      for (let k = 0; k < 6; k++) {
        const y = hor + 10 + k * ((H - hor) / 6);
        c.strokeStyle = "rgba(255,255,255," + (0.12 + k * 0.02).toFixed(3) + ")";
        c.beginPath();
        for (let x = 0; x <= W; x += 10) c.lineTo(x, y + Math.sin(x * 0.01 + t * (1 + k * 0.3) + k) * (3 + k));
        c.stroke();
      }
    },
  },
};
function adeganUkur() {
  adeganDpr = Math.min(window.devicePixelRatio || 1, 1.5);
  adeganW = innerWidth;
  adeganH = innerHeight;
  adeganEl.width = Math.round(adeganW * adeganDpr);
  adeganEl.height = Math.round(adeganH * adeganDpr);
  if (adeganId) adeganSt = ADEGAN[adeganId].init(adeganW, adeganH);
}
function adeganFrame(now) {
  adeganRaf = 0;
  if (!adeganId || document.hidden) return;
  if (now - adeganDraw >= jedaFrame(now)) {
    adeganDraw = now;
    const dt = adeganLast ? Math.min(0.05, (now - adeganLast) / 1000) : 0;
    adeganLast = now;
    adeganCtx.setTransform(adeganDpr, 0, 0, adeganDpr, 0, 0);
    ADEGAN[adeganId].draw(adeganCtx, adeganW, adeganH, (now - adeganT0) / 1000, dt, adeganSt);
  }
  adeganRaf = requestAnimationFrame(adeganFrame);
}
function adeganNyala(id) {
  if (id === adeganId) return;
  adeganId = id;
  adeganEl.hidden = !id;
  if (id) {
    adeganUkur();
    adeganT0 = performance.now();
    adeganLast = 0;
    if (!adeganRaf && !document.hidden) adeganRaf = requestAnimationFrame(adeganFrame);
  } else if (adeganRaf) {
    cancelAnimationFrame(adeganRaf);
    adeganRaf = 0;
  }
}
window.addEventListener("resize", () => { if (adeganId) adeganUkur(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && adeganId && !adeganRaf) adeganRaf = requestAnimationFrame(adeganFrame);
});

function terapkanLatar() {
  const a = latarAktif();
  document.documentElement.style.setProperty("--latar", latarCss(a));
  fxNyala(!!a.animasi);
  ikanOn = a.ikan === true;
  if (ikanOn && !ikan.length) ikanBuat();
  gelNyala(!!a.gelembung);
  adeganNyala(a.adegan || null);
  $("latar-nama").textContent = latar.harian ? "Hari ini: " + a.nama : a.nama;
  $("latar-harian").checked = latar.harian;
  document.querySelectorAll(".latar-sw").forEach((b) => {
    const on = b.dataset.id === a.id;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1; // satu tombol yang bisa difokus lewat Tab; panah untuk memilih yang lain
  });
}
function bangunLatar() {
  const g = $("latar-pilih");
  g.textContent = "";
  LATAR.forEach((x) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "latar-sw";
    b.dataset.id = x.id;
    b.setAttribute("role", "radio");
    b.title = x.nama;
    b.setAttribute("aria-label", "Latar " + x.nama);
    b.style.background = latarCss(x);
    b.addEventListener("click", () => simpanLatar({ id: x.id, harian: false }));
    g.append(b);
  });
  g.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const sw = [...g.querySelectorAll(".latar-sw")];
    const i = Math.max(0, sw.indexOf(document.activeElement));
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = sw[(i + dir + sw.length) % sw.length];
    next.focus();
    next.click();
  });
  $("latar-harian").addEventListener("change", () => simpanLatar({ id: latar.id, harian: $("latar-harian").checked }));
}
async function simpanLatar(next) {
  latar = next;
  terapkanLatar();
  try { await store.set("latar", latar); } catch (e) { msg("Gagal menyimpan latar."); }
}

// ---------- Pembaruan ----------
// Memeriksa rilis terbaru di GitHub (tanpa token, tanpa data pribadi) dan menautkan unduhan zip-nya. Tidak memasang apa pun
// sendiri. Tautan unduhan dibangun dari nomor versi yang sudah divalidasi, bukan diambil dari isi balasan GitHub.
const UPD_API = "https://api.github.com/repos/Lab-sah/Aistim.board/releases/latest";
const UPD_DL = "https://github.com/Lab-sah/Aistim.board/releases/download/";
const UPD_JEDA = 6 * 60 * 60 * 1000; // pemeriksaan otomatis paling sering tiap 6 jam
let upd = null; // hasil pemeriksaan terakhir: { t, v, url }
const verAngka = (v) => (typeof v === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v) ? v.split(".").map(Number) : null);
function lebihBaru(a, b) {
  const x = verAngka(a), y = verAngka(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
function verTerpasang() {
  try { return chrome.runtime.getManifest().version; } catch (e) { return ""; }
}
// Nama berkas zip rilis. Hanya nama tetap ini yang dipakai untuk membangun tautan unduhan,
// jadi tautan tidak pernah diambil dari balasan GitHub.
const NAMA_ZIP = "Aistim-board-";
const urlZip = (v) => UPD_DL + "v" + v + "/" + NAMA_ZIP + v + ".zip";
async function ambilRilis() {
  const r = await fetch(UPD_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-cache" });
  if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? "GitHub membatasi permintaan, coba lagi nanti." : "GitHub membalas " + r.status + ".");
  const j = await r.json();
  const m = /^v(\d+\.\d+\.\d+)$/.exec((j && j.tag_name) || "");
  if (!m || !verAngka(m[1])) throw new Error("Format rilis tidak dikenali.");
  const assets = Array.isArray(j.assets) ? j.assets : [];
  if (!assets.some((x) => x && x.name === NAMA_ZIP + m[1] + ".zip")) throw new Error("Rilis v" + m[1] + " belum punya berkas zip.");
  return { v: m[1], url: urlZip(m[1]) };
}
function tampilUpd() {
  const pas = verTerpasang();
  const baru = !!(upd && lebihBaru(upd.v, pas));
  $("upd-pill").hidden = !baru;
  $("upd-unduh").hidden = !baru;
  $("upd-cara").hidden = !baru;
  if (baru) {
    $("upd-pill").href = upd.url;
    $("upd-pill").title = "Unduh Aistim Board v" + upd.v;
    $("upd-pill-teks").textContent = "Versi baru v" + upd.v + " tersedia · Unduh";
    $("upd-unduh").href = upd.url;
    $("upd-unduh").textContent = "Unduh v" + upd.v;
    $("upd-info").textContent = "Versi baru v" + upd.v + " tersedia (terpasang v" + pas + ").";
  } else if (upd) {
    $("upd-info").textContent = "Sudah versi terbaru (v" + pas + "). Diperiksa " + new Date(upd.t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) + ".";
  } else {
    $("upd-info").textContent = "Terpasang v" + (pas || "?") + ". Belum diperiksa.";
  }
}
// Hasil: "" = berhasil (upd diperbarui), teks = alasan gagal. Tanpa paksa: dilewati bila pemeriksaan terakhir masih baru.
async function periksaPembaruan(paksa) {
  if (!paksa && upd && Date.now() - upd.t < UPD_JEDA) return "";
  try {
    const r = await ambilRilis();
    upd = { t: Date.now(), ...r };
    try { await store.set("updInfo", upd); } catch (e) {}
    return "";
  } catch (e) {
    return e && e.message ? e.message : "Gagal memeriksa.";
  } finally {
    tampilUpd();
  }
}
async function muatPembaruan() {
  const otomatis = (await store.get("updAuto", true)) !== false;
  $("upd-auto").checked = otomatis;
  const c = await store.get("updInfo", null);
  if (c && typeof c.t === "number" && verAngka(c.v) && c.url === urlZip(c.v)) upd = { t: c.t, v: c.v, url: c.url };
  tampilUpd();
  if (otomatis) periksaPembaruan(false); // tidak ditunggu; gagal = diam saja
}
$("upd-cek").addEventListener("click", async () => {
  $("upd-cek").disabled = true;
  $("upd-info").textContent = "Memeriksa…";
  const err = await periksaPembaruan(true);
  if (err) $("upd-info").textContent = "Gagal memeriksa: " + err;
  $("upd-cek").disabled = false;
});
$("upd-auto").addEventListener("change", async () => {
  try { await store.set("updAuto", $("upd-auto").checked); } catch (e) { msg("Gagal menyimpan pilihan."); }
});

// ---------- Mulai ----------
// Perubahan dari tab lain (tab baru kedua yang terbuka) ikut tampil, supaya simpan dari tab lama tidak menimpa data baru.
function dariLuar(nilai) {
  const baru = rapikanPins(nilai);
  if (JSON.stringify(baru) === JSON.stringify(pins)) return;
  pins = baru;
  renderPins();
}
function pantau() {
  if (hasChrome) {
    if (chrome.storage.onChanged) chrome.storage.onChanged.addListener((c, area) => {
      if (area !== "local") return;
      if (c.pins) dariLuar(c.pins.newValue);
      if (c.latar && c.latar.newValue) { latar = normLatar(c.latar.newValue); terapkanLatar(); }
    });
  } else {
    window.addEventListener("storage", (e) => {
      if (e.key !== "pins") return;
      try { dariLuar(JSON.parse(e.newValue)); } catch (err) {}
    });
  }
}
function labelVersi() {
  try {
    const v = chrome.runtime.getManifest().version;
    $("ver").textContent = "Aistim Board v" + v + (chrome.runtime.id ? " · ID extension: " + chrome.runtime.id : "");
  } catch (e) {
    $("ver").textContent = "Aistim Board";
  }
}
async function mulai() {
  jamUkur();
  jamLoop();
  tick();
  initQuote();
  const tersimpan = await store.get("pins", []);
  pins = rapikanPins(tersimpan);
  if (JSON.stringify(pins) !== JSON.stringify(tersimpan)) {
    try { await store.set("pins", pins); } catch (e) {}
  }
  try { latar = normLatar(await store.get("latar", null)); } catch (e) {}
  bangunLatar();
  terapkanLatar();
  try { await muatCacheMenu(); } catch (e) {}
  renderPins();
  tampilSumber();
  labelVersi();
  pantau();
  muatMenuBersama(false); // tidak ditunggu: halaman sudah tampil dengan salinan tersimpan
  muatPembaruan();
  muatKutipan(); // tidak ditunggu: kutipan default sudah tampil
}
mulai().catch((e) => msg("Gagal memuat menu: " + (e && e.message ? e.message : e)));
