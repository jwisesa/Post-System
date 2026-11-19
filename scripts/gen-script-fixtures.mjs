// Builds the synthetic sample screenplays in tests/fixtures/script/ with headless Chrome.
// Usage: node scripts/gen-script-fixtures.mjs   (macOS Chrome path below; override with CHROME=...)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const out = fileURLToPath(new URL("../tests/fixtures/script/", import.meta.url));

// H heading, A action, C cue, P parenthetical, D dialogue, T transition. Heading number: "12" or "12A" in both margins.
const S = (h, ...rest) => ({ h, rest });
const FULL = [
  S("1 EXT. JALAN RAYA - SUBUH", ["A", "Kabut tipis menggantung di atas aspal basah. Sebuah truk tua melintas pelan, lampunya redup."], ["C", "BUDI (V.O.)"], ["D", "Setiap kota punya jam yang tidak pernah berbunyi. Jamku berhenti sejak malam itu."], ["T", "CUT TO:"]),
  S("2 INT. RUMAH BUDI - RUANG TAMU - PAGI", ["A", "BUDI (40) memasang kancing kemeja di depan cermin retak. Di meja, dua cangkir kopi, satu masih utuh."], ["C", "SARI"], ["P", "(dari dapur)"], ["D", "Kopinya sudah dingin, Mas. Kamu mau sarapan atau tidak?"], ["C", "BUDI"], ["D", "Nanti saja. Aku harus bertemu Pak Hadi sebelum jam tujuh."], ["C", "SARI"], ["D", "Selalu ada yang lebih penting daripada rumah ini."], ["A", "Budi berhenti. Ia menatap pantulan Sari di cermin, lalu keluar tanpa menjawab."]),
  S("3 EXT. HALAMAN RUMAH BUDI - PAGI", ["A", "Budi menyalakan motor. Anak kecil, RARA (8), berdiri di pagar memegang tas sekolah."], ["C", "RARA"], ["D", "Ayah pulang malam ini?"], ["C", "BUDI"], ["P", "(tersenyum kaku)"], ["D", "Ayah usahakan."], ["A", "Motor melaju. Rara memandangi debu yang naik."]),
  S("4 INT. KANTOR PAK HADI - SIANG", ["A", "Ruangan sempit berbau rokok. PAK HADI (60) menghitung uang di balik meja kayu jati."], ["C", "PAK HADI"], ["D", "Kamu terlambat lima menit. Di bisnis ini lima menit bisa jadi lima tahun."], ["C", "BUDI"], ["D", "Truknya mogok di Cibitung, Pak."], ["C", "PAK HADI"], ["P", "(menyodorkan amplop)"], ["D", "Antar ini ke pelabuhan. Jangan dibuka, jangan ditanya."], ["C", "BUDI"], ["D", "Isinya apa?"], ["C", "PAK HADI"], ["D", "Jangan ditanya, kubilang."]),
  S("5 INT./EXT. MOBIL BUDI - JALAN TOL - SIANG", ["A", "Budi menyetir. Amplop di dasbor bergetar mengikuti guncangan mobil. Radio memutar lagu lama."], ["C", "BUDI"], ["P", "(bergumam)"], ["D", "Jangan dibuka. Jangan ditanya."], ["A", "Ia melirik amplop itu. Sekilas. Lalu menekan gas lebih dalam."]),
  S("6 EXT. PELABUHAN - SORE", ["A", "Peti kemas bertumpuk seperti kota baja. Burung camar berputar di atas kapal yang bersandar. Budi turun dari mobil."], ["C", "TOKOH ASING (O.S.)"], ["D", "Kau membawa barangnya?"], ["A", "Dari bayangan kontainer, seorang pria jangkung melangkah maju. Wajahnya setengah tertutup topi."], ["C", "BUDI"], ["D", "Aku hanya kurir."], ["C", "TOKOH ASING"], ["D", "Semua orang hanya kurir, sampai mereka tidak lagi."], ["T", "CUT TO:"]),
  S("7 INT. WARUNG KOPI PELABUHAN - SENJA", ["A", "Warung sederhana, kipas angin berderit. Budi duduk menghadap pintu. IBU WARUNG (55) meletakkan segelas teh."], ["C", "IBU WARUNG"], ["D", "Muka kamu pucat, Nak. Habis lihat hantu?"], ["C", "BUDI"], ["D", "Kurang lebih, Bu."], ["A", "Ponsel Budi bergetar. Nama di layar: SARI. Ia membiarkannya."]),
  S("8 EXT. JEMBATAN LAYANG - MALAM", ["A", "Lampu kota memantul di genangan. Budi berjalan sendirian, jaketnya basah."], ["C", "BUDI (V.O.)"], ["D", "Aku pernah percaya bahwa kejujuran adalah mata uang paling mahal. Ternyata itu hanya barang dagangan."]),
  S("9 INT. KAMAR RARA - MALAM", ["A", "Rara tertidur dengan buku gambar di dada. Sari menarik selimut, lalu melihat gambar: tiga orang berdiri di depan rumah, satu sosok tanpa wajah."], ["C", "SARI"], ["P", "(berbisik)"], ["D", "Siapa dia, Sayang?"], ["A", "Tak ada jawaban. Hanya dengkur halus."]),
  S("10 INT. RUMAH BUDI - DAPUR - MALAM", ["A", "Sari mencuci piring. Pintu depan terbuka. Budi masuk, bahunya turun."], ["C", "SARI"], ["D", "Kamu pulang."], ["C", "BUDI"], ["D", "Aku bilang akan usahakan."], ["C", "SARI"], ["D", "Dan kamu usahakan dengan sangat terlambat."], ["C", "BUDI"], ["P", "(lelah)"], ["D", "Sari, jangan malam ini."], ["C", "SARI"], ["D", "Kapan? Kapan kita boleh bicara, Mas?"]),
  S("11 EXT. TAMAN KOTA - PAGI", ["A", "Embun di rumput. Budi dan Rara duduk di bangku. Rara menunjukkan gambarnya."], ["C", "RARA"], ["D", "Ini Ayah, ini Ibu, ini aku. Yang ini Om Gelap."], ["C", "BUDI"], ["D", "Om Gelap?"], ["C", "RARA"], ["D", "Dia selalu berdiri di belakang Ayah."], ["A", "Budi menoleh perlahan. Di belakangnya hanya pohon dan jalan setapak kosong."]),
  S("12 INT. APARTEMEN LINA - SIANG", ["A", "Apartemen penuh buku. LINA (35), jurnalis, menempelkan foto di dinding: foto Pak Hadi, foto pelabuhan."], ["C", "LINA"], ["D", "Kalau kau diam, kau sama bersalahnya dengan mereka."], ["C", "BUDI"], ["D", "Aku datang bukan untuk dihakimi."], ["C", "LINA"], ["D", "Lalu untuk apa?"], ["C", "BUDI"], ["D", "Untuk bertanya apa isi amplopku."]),
  S("12A INT. APARTEMEN LINA - KAMAR GELAP - SIANG LANJUTAN", ["A", "Lina membuka pintu kecil. Lampu merah menyala. Foto-foto digantung di tali."], ["C", "LINA (CONT'D)"], ["D", "Tiga tahun aku mengumpulkan ini. Setiap foto adalah satu orang yang tidak pernah sampai ke rumah."], ["C", "BUDI"], ["D", "Dan aku salah satu pengantarnya."]),
  S("13 EXT. GANG SEMPIT - SORE", ["A", "Budi berjalan cepat. Langkah kaki lain terdengar di belakangnya. Ia berbelok. Langkah itu ikut berbelok."], ["C", "SUARA (O.S.)"], ["D", "Berhenti di situ."], ["T", "CUT TO:"]),
  S("14 EXT. BERBAGAI LOKASI - MONTAGE", ["A", "SERANGKAIAN ADEGAN:"], ["A", "-- Budi menghitung uang di dalam mobil."], ["A", "-- Lina mengetik di bawah lampu meja."], ["A", "-- Pak Hadi tertawa di meja makan yang panjang."], ["A", "-- Sari memandangi telepon yang tidak berbunyi."]),
  S("15 DLM. GUDANG TUA - MALAM", ["A", "Rangka besi dan debu. Satu lampu bohlam bergoyang. Budi masuk ketika pintu besi menutup di belakangnya."], ["C", "PAK HADI (O.S.)"], ["D", "Aku sudah bilang jangan ditanya."], ["A", "Pak Hadi muncul dari balik tumpukan karung, diiringi dua anak buah."], ["C", "BUDI"], ["D", "Aku hanya ingin tahu siapa yang kuantar."], ["C", "PAK HADI"], ["D", "Kau tidak mengantar orang, Budi. Kau mengantar akhir."]),
  S("16 INT. GUDANG TUA - RUANG BAWAH - MALAM", ["A", "Tangga curam menuju ruang bawah tanah. Bau lembap. Di dalam, belasan koper kecil berjajar rapi."], ["C", "BUDI"], ["D", "Ini bukan barang. Ini nama-nama."], ["C", "PAK HADI"], ["D", "Semua nama punya harga."]),
  S("17 LUAR PELABUHAN - DINI HARI", ["A", "Kapal mulai menarik jangkar. Lina bersembunyi di balik peti kemas dan memotret dengan kamera tua."], ["C", "LINA"], ["P", "(berbisik ke radio)"], ["D", "Aku dapat semuanya. Sekarang tinggal keluar."]),
  S("18 EXT. ATAP GUDANG - DAWN", ["A", "Budi berlari di atas seng. Peluru memantul di sampingnya. Langit mulai memerah."], ["C", "BUDI"], ["D", "Lina! Turun lewat sisi kiri!"], ["T", "POTONG KE:"]),
  S("19 INT. MOBIL LINA - NIGHT", ["A", "Lina menyetir kencang. Budi terengah di kursi sebelah, tangan memegang bahu yang berdarah."], ["C", "LINA"], ["D", "Bertahanlah. Rumah sakit tinggal sepuluh menit."], ["C", "BUDI"], ["D", "Jangan ke rumah sakit. Mereka akan menunggu di sana."]),
  S("20 INT. RUMAH BUDI - RUANG TAMU - SUBUH", ["A", "Sari terjaga di sofa. Pintu diketuk pelan. Ia membuka dan menemukan Budi, pucat, dipapah Lina."], ["C", "SARI"], ["D", "Mas?!"], ["C", "BUDI"], ["D", "Maaf. Aku pulang."]),
  S("21 INT. KAMAR TIDUR BUDI - PAGI", ["A", "Sari membalut luka Budi. Tangannya gemetar tapi mantap. Di luar jendela, matahari akhirnya naik."], ["C", "SARI"], ["D", "Jelaskan dari awal. Semuanya."], ["C", "BUDI"], ["D", "Semuanya akan membahayakan kalian."], ["C", "SARI"], ["D", "Kami sudah dalam bahaya sejak kamu berhenti jujur."]),
  S("22 EXT. HALAMAN RUMAH BUDI - SIANG", ["A", "Mobil hitam berhenti di seberang jalan. Rara bermain kapur di aspal dan menggambar sosok tinggi tanpa wajah."], ["C", "RARA"], ["P", "(ke diri sendiri)"], ["D", "Om Gelap datang."]),
  S("23 INT. RUMAH BUDI - RUANG TAMU - SORE", ["A", "Pintu didobrak. Dua pria masuk. Budi berdiri di antara mereka dan keluarganya."], ["C", "BUDI"], ["D", "Aku yang kalian cari. Biarkan mereka pergi."], ["C", "PRIA BERTOPI"], ["D", "Kami cuma mengantar pesan dari Pak Hadi."]),
  S("24 EXT. TEPI KOTA - SENJA", ["A", "Dari kejauhan, Budi, Sari, dan Rara berjalan menyusuri tanggul. Kota di belakang mereka menyala satu per satu."], ["C", "BUDI (V.O.)"], ["D", "Jam itu akhirnya berbunyi. Terlambat, tapi berbunyi."], ["T", "FADE OUT."]),
];
// Pads each dialogue scene with filler so the sample runs ~15 pages.
for (const sc of FULL) {
  const c = sc.rest.find((r) => r[0] === "C");
  if (!c) continue;
  sc.rest.push(["A", "Hening sejenak. Suara kota terdengar jauh, seperti ingatan yang enggan pergi dari ruangan itu. Tidak ada yang bergerak."], ["C", c[1].replace(/ \(.*\)$/, "")], ["D", "Entahlah. Aku belum yakin apa yang harus kukatakan, tapi diam juga bukan pilihan."], ["A", "Cahaya bergeser perlahan. Waktu terasa lebih lambat daripada seharusnya."]);
}
// Letter layout; A4 variant is a tiny 3-scene script without scene numbers and with other margins.
const TINY = [
  S("INT. KANTOR POS - DAY", ["A", "Rak surat berderet. ANI (30) menyortir paket."], ["C", "ANI"], ["D", "Alamatnya tidak ada lagi."], ["C", "RAHMAT (O.S.)"], ["D", "Kirim saja ke yang baru."]),
  S("EXT. JALAN DESA - SORE", ["A", "Ani mengayuh sepeda dengan satu paket di keranjang."], ["C", "ANI (V.O.)"], ["D", "Beberapa surat memang harus tiba terlambat."]),
  S("INT. RUMAH RAHMAT - MALAM", ["A", "Rahmat membuka pintu. Ani menyerahkan paket."], ["C", "RAHMAT"], ["P", "(terkejut)"], ["D", "Kau datang juga."], ["C", "ANI"], ["D", "Alamatnya sudah benar."]),
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function html(scenes, L, title) {
  const body = [];
  for (const s of scenes) {
    const m = /^(\d+[A-Z]?) (.*)$/.exec(s.h);
    const [num, text] = m ? [m[1], m[2]] : ["", s.h];
    body.push(`<div class="h">${num ? `<span class="nl">${num}</span>` : ""}${esc(text)}${num ? `<span class="nr">${num}</span>` : ""}</div>`);
    let grp = "";
    for (const [k, t] of s.rest) {
      if (k === "C") grp = `<div class="g"><p class="c">${esc(t)}</p>`;
      else if (k === "P") grp += `<p class="p">${esc(t)}</p>`;
      else if (k === "D") { body.push(grp + `<p class="d">${esc(t)}</p></div>`); grp = ""; }
      else body.push(`<p class="${k === "T" ? "tr" : "a"}">${esc(t)}</p>`);
    }
  }
  return `<!doctype html><meta charset="utf-8"><style>
@page{size:${L.w} ${L.h};margin:1in 0 1in 0;@top-right{content:counter(page) ".";font:12pt Courier;padding-right:1in}}
@page:first{@top-right{content:""}}
body{margin:0;font:12pt/12pt "Courier New",Courier,monospace}p,div{margin:0}
.ttl{height:5.5in;padding-top:3in;text-align:center;break-after:page}
.h{position:relative;margin:0 0 12pt ${L.a};font-weight:bold;text-transform:uppercase;break-after:avoid}
.nl{position:absolute;left:-0.7in}.nr{position:absolute;right:-0.6in}
.a{margin:0 0 12pt ${L.a};width:${L.aw}}.g{margin-bottom:12pt;break-inside:avoid}
.c{margin-left:${L.c}}.p{margin-left:${L.p}}.d{margin-left:${L.d};width:3.5in}
.tr{margin:0 0 12pt ${L.a};width:${L.aw};text-align:right}
</style><div class="ttl">${title}<br><br>oleh<br>Penulis Fiktif</div>${body.join("\n")}`;
}
const build = (name, scenes, L, title) => {
  const dir = mkdtempSync(join(tmpdir(), "script-"));
  const f = join(dir, `${name}.html`);
  writeFileSync(f, html(scenes, L, title));
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${out}${name}.pdf`, `file://${f}`], { stdio: "inherit" });
};
build("sample-letter", FULL, { w: "8.5in", h: "11in", a: "1.5in", aw: "6in", c: "3.7in", p: "3.1in", d: "2.5in" }, "TEPI KOTA");
build("sample-a4", TINY, { w: "8.27in", h: "11.69in", a: "1.25in", aw: "5.9in", c: "3.5in", p: "2.9in", d: "2.25in" }, "SURAT TERLAMBAT");
// Not a screenplay: meeting notes, must be rejected by the parser.
const NOTES = [S("Catatan rapat produksi", ["A", "Peserta membahas jadwal editing, anggaran musik, dan pengiriman materi ke studio. Tidak ada keputusan akhir pekan ini."]), S("Tindak lanjut", ["A", "Tim keuangan mengirim revisi anggaran sebelum hari Jumat. Semua pihak diminta memeriksa kembali daftar penerima."])];
build("not-a-script", NOTES, { w: "8.5in", h: "11in", a: "1.5in", aw: "6in", c: "3.7in", p: "3.1in", d: "2.5in" }, "NOTULEN");
