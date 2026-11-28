// Tes ringan untuk fungsi murni di extension/script.js: node tools/test.js
// Fungsi diambil dari sumber lewat pencocokan kurung kurawal, tanpa menjalankan seluruh skrip (yang butuh DOM).
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const src = fs.readFileSync(__dirname + "/../extension/script.js", "utf8");

function ambilFungsi(nama) {
  const m = new RegExp("^function " + nama + "\\(", "m").exec(src);
  assert(m, "fungsi tidak ditemukan: " + nama);
  let i = src.indexOf("{", m.index), d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}" && --d === 0) return src.slice(m.index, j + 1);
  }
  throw new Error("kurung tidak seimbang: " + nama);
}
function ambilBaris(re) {
  const m = re.exec(src);
  assert(m, "baris tidak ditemukan: " + re);
  return m[0];
}
const kode = [
  ambilBaris(/^const MAX_V = .*$/m),
  ambilBaris(/^const SLD_UMUM = .*$/m),
  ...["normalUrl", "hostOf", "grafem", "kunciLink", "idLink", "indukDomain", "bacaMenu"].map(ambilFungsi),
  "({ normalUrl, indukDomain, bacaMenu })",
].join("\n");
const { normalUrl, indukDomain, bacaMenu } = vm.runInNewContext(kode, { URL, Intl, Math, Array, JSON, Error, Set });

// normalUrl
assert.strictEqual(normalUrl("erzap.com"), "https://erzap.com/");
assert.strictEqual(normalUrl("http://a.id/x"), "http://a.id/x");
for (const bad of ["", "   ", "javascript:alert(1)", "ftp://x.com", "file:///etc/passwd", "data:text/html,x", "https://"]) {
  assert.strictEqual(normalUrl(bad), null, "harus ditolak: " + bad);
}

// indukDomain
assert.strictEqual(indukDomain("trial.erzap.com"), "erzap.com");
assert.strictEqual(indukDomain("erzap.com"), "erzap.com");
assert.strictEqual(indukDomain("a.b.co.id"), "b.co.id");

// bacaMenu
const ok = bacaMenu(JSON.stringify({ menu: [{ nama: "A", link: "a.com" }, { link: "a.com" }, { link: "javascript:x" }, {}] }));
assert.strictEqual(ok.items.length, 1);
assert.strictEqual(ok.lewat.length, 3);
assert.strictEqual(bacaMenu("[{\"link\":\"b.com\"}]").items.length, 1);
assert.throws(() => bacaMenu("{\"menu\":[],}"), /bukan JSON/);
assert.throws(() => bacaMenu("{}"), /menu/);
assert.throws(() => bacaMenu(" ".repeat(100001)), /terlalu besar/);
assert.strictEqual(bacaMenu(JSON.stringify({ menu: Array.from({ length: 50 }, (_, i) => ({ link: "s" + i + ".com" })) })).items.length, 48);

// main.json di repo harus lolos
const r = bacaMenu(fs.readFileSync(__dirname + "/../main.json", "utf8"));
assert.strictEqual(r.lewat.length, 0, "main.json punya entri yang dilewati: " + r.lewat.join("; "));

console.log("semua tes lolos");
