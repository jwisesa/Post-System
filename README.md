# Post-System

Sistem manajemen pasca produksi berbasis web: satu sumber data per project untuk
teknis, tim, jadwal, aset, dan deliverables.

Dokumen: [PRD](docs/PRD.md) · [TRD](docs/TRD.md) · [Panduan deploy](docs/DEPLOY.md)

## Status

Modul 1 (fondasi), 2 (timeline), 3 (link, versi, komentar), 4 (deliverables), dan 5 (dashboard + kalender) dari 6 selesai:

- Project dengan tipe produksi dan platform tujuan
- **Technical Page** sebagai source of truth teknis (opsi siap-pilih + nilai custom)
- Direktori tim per departemen/vendor (PIC, person in contact, email yang perlu akses)
- Login admin per orang, role `supervisor` dan `assistant`
- Link view-only per project yang bisa dicabut; item bertanda internal tidak tampil
- Change log: siapa mengubah apa, kapan, dan alasannya

- **Timeline**: track paralel (Main Feature, Trailer, Teaser, ...) dari template fase,
  milestone di dalam fase, dependency antar item (termasuk lintas track)
- Perubahan tanggal dipratinjau dulu: item yang bergantung ikut bergeser, hard deadline
  tidak ikut bergeser dan dilaporkan sebagai bentrok
- Baseline vs jadwal aktual, status per item, penanda terlambat
- **Timeline interaktif**: seret batang untuk memindah, tarik ujungnya untuk memperpanjang,
  seret titik di kanan batang ke item lain untuk membuat dependency; dampak tampil langsung
  saat menyeret, perubahan dikonfirmasi dulu, dan bisa diurungkan
- Tema terang (bawaan) dan gelap; di layar ponsel timeline tampil sebagai agenda
- Tiga tampilan: Gantt, Gantt vertikal, dan kalender; fase punya warna dan milestone (satu tanggal)
  yang bisa diciutkan; template track menyertakan milestone umum (Picture Lock ada di dalam Offline Edit)
  dan ada template Produksi (testcam, principal photography)
- Hari kerja: akhir pekan dan hari libur diblokir (bisa diatur per project); fase menjaga jumlah hari kerjanya
- Pilih beberapa item (Shift-klik) untuk digeser, diwarnai, diubah statusnya, atau dihapus sekaligus;
  undo/redo (Cmd/Ctrl+Z); item yang bergantung hanya ikut bergeser jika opsinya dinyalakan
- Versi timeline tersimpan yang bisa dipulihkan; export PDF (halaman cetak) dan CSV untuk Excel/Sheets

- **Link & versi**: link preview/aset/dokumen di tiap fase dan milestone; setiap perubahan
  jadi versi baru dengan catatan apa yang direvisi dan status review
- **Komentar** per item atas nama akun; **dokumen produksi** tingkat project
- Halaman **Aset & dokumen** merangkum semua link beserta riwayat versinya

- **Deliverables**: checklist dari preset per platform (Bioskop, materi promo, Netflix,
  Prime Video, OTT lain, YouTube), matriks cutdown durasi × ratio, status per item, due date,
  dan link berversi; spesifikasi mewarisi nilai dari Technical Page

- **Hari Ini**: due hari ini, terlambat, 7 hari ke depan, hard deadline berikutnya, item yang
  perlu di-follow-up (dengan kontak PIC), dan link yang menunggu review
- **Langganan kalender (ICS)** per akun dan per link view-only, supaya deadline muncul di
  kalender dan widget kalender perangkat; bisa di-install ke home screen (PWA)
- **Laporan mingguan** yang ramah cetak, plus ringkasan teks untuk ditempel ke chat

Berikutnya: tool XML/EDL (6).

## Menjalankan

```bash
npm install
npm run create-admin -- "Nama" email@example.com passwordAnda
npm run dev
```

Buka `http://localhost:3000/admin`.

Tanpa `DATABASE_URL`, data disimpan di Postgres embedded (PGlite) di folder `.data/`.
Untuk produksi lihat [docs/DEPLOY.md](docs/DEPLOY.md): set `DATABASE_URL` ke Postgres (Supabase),
migrasi dijalankan otomatis, dan akun pertama dibuat lewat `/setup`.

## Pemeriksaan

```bash
npm run lint
npm run typecheck
npm test
```

Tes browser end-to-end: lihat petunjuk di bagian atas `e2e/smoke.cjs`.

## Struktur

- `src/db/schema.ts` — tabel; `drizzle/` — migrasi (`npm run db:generate` setelah mengubah skema)
- `src/lib/services.ts` — semua baca/tulis; setiap mutasi memeriksa role dan menulis change log
- `src/lib/schedule/` — logika geser jadwal (`shift.ts`), template track, layanan timeline
- `src/lib/assets/` — link, versi, komentar, dan katalog nama siap-pilih
- `src/lib/deliverables/` — katalog opsi + preset platform (`catalog.ts`) dan layanannya
- `src/lib/today/` — rangkuman dashboard dan laporan; `src/lib/calendar/` — feed ICS dan tokennya
- `src/lib/auth/` — password, sesi, hak akses (`can()`)
- `src/lib/tech-spec/schema.ts` — field dan opsi Technical Page, default per tipe produksi
- `src/app/admin/` — halaman admin; `src/app/v/[token]/` — halaman view-only
