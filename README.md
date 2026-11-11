# Post-System

Sistem manajemen pasca produksi berbasis web: satu sumber data per project untuk
teknis, tim, jadwal, aset, dan deliverables.

## Status

Langkah 1 (fondasi) dan 2 (timeline) dari 6 selesai:

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

Berikutnya: attachment + versioning + komentar (3), deliverables (4),
dashboard + calendar feed (5), tool XML/EDL (6).

## Menjalankan

```bash
npm install
npm run create-admin -- "Nama" email@example.com passwordAnda
npm run dev
```

Buka `http://localhost:3000/admin`.

Tanpa `DATABASE_URL`, data disimpan di Postgres embedded (PGlite) di folder `.data/`.
Untuk produksi, set `DATABASE_URL` ke Postgres (mis. Supabase); migrasi dijalankan otomatis.

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
- `src/lib/auth/` — password, sesi, hak akses (`can()`)
- `src/lib/tech-spec/schema.ts` — field dan opsi Technical Page, default per tipe produksi
- `src/app/admin/` — halaman admin; `src/app/v/[token]/` — halaman view-only
