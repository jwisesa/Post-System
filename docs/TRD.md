# Post-System — Technical Requirements

Pendamping [PRD](./PRD.md). Menjelaskan bagaimana sistem dibangun dan aturan yang harus
dijaga saat menambah modul.

## 1. Stack

| Bagian | Pilihan | Alasan |
|---|---|---|
| Aplikasi | Next.js (App Router) + TypeScript | Satu codebase untuk halaman dan server; mudah di-deploy |
| Tampilan | Tailwind CSS, komponen buatan sendiri | Tanpa ketergantungan library UI |
| Database | Postgres lewat Drizzle ORM | Relasional, cocok untuk dependency dan riwayat |
| Lokal dan tes | PGlite (Postgres embedded) | Tanpa server database; skema identik dengan produksi |
| Produksi | `DATABASE_URL` ke Postgres (mis. Supabase), hosting Vercel | Paket gratis cukup untuk skala saat ini |
| Auth | Buatan sendiri: scrypt + tabel sesi + cookie httpOnly | Kecil dan tidak terikat penyedia |
| Tes | Vitest (unit, di atas PGlite), Playwright (browser) | |

Versi Next.js yang dipakai punya perubahan API; baca `node_modules/next/dist/docs/` sebelum
menulis kode (lihat `AGENTS.md`).

## 2. Struktur kode

```
src/db/schema.ts            tabel            drizzle/           migrasi (npm run db:generate)
src/db/client.ts            getDb(): PGlite atau Postgres, migrasi otomatis
src/lib/services.ts         project, tech spec, tim, akses, viewer, change log
src/lib/schedule/           dates.ts, shift.ts (murni), templates.ts, service.ts
src/lib/auth/               password.ts, session.ts, permissions.ts
src/lib/tech-spec/schema.ts field + opsi Technical Page, default per tipe produksi
src/app/admin/              halaman admin, actions.ts, schedule-actions.ts
src/app/v/[token]/          halaman view-only
src/components/             komponen tampilan
tests/  e2e/                unit dan browser
```

## 3. Aturan arsitektur

1. **Semua baca/tulis lewat lapisan layanan** (`src/lib/**/service*.ts`). Halaman dan server
   action tidak menyentuh tabel langsung.
2. **Setiap mutasi memeriksa role** lewat `requireRole()` → `can()` dan **menulis satu entri
   `audit_log` dalam transaksi yang sama** lewat `record()`.
3. **Layanan menerima `db` sebagai argumen**, sehingga bisa dites di atas PGlite in-memory.
4. **Logika yang perlu dipratinjau ditulis sebagai fungsi murni** (contoh `computeShift`),
   supaya bisa dipakai di server (menyimpan) dan di browser (pratinjau saat drag) tanpa
   perbedaan hasil. Server selalu menghitung ulang; hasil dari browser tidak dipercaya.
5. **Data untuk viewer dibentuk di satu tempat** (`getViewerData`) dan memfilter item
   internal di query, bukan di tampilan.
6. **Opsi siap-pilih hidup di kode sebagai katalog** (`tech-spec/schema.ts`,
   `schedule/templates.ts`, `deliverables/catalog.ts`), bukan tersebar di komponen.

## 4. Model data

Sudah ada:

| Tabel | Isi |
|---|---|
| `users`, `sessions` | akun admin; sesi disimpan sebagai hash token |
| `projects`, `project_members` | project dan role (`supervisor` / `assistant`) per user |
| `share_links` | token view-only per project, bisa dicabut |
| `tech_specs` | satu dokumen JSONB per project, kunci divalidasi terhadap katalog |
| `team_groups`, `team_contacts` | direktori tim; tanda PIC, contact, perlu akses, internal |
| `tracks` | jalur paralel per project |
| `schedule_items` | fase dan milestone (`parent_id`): tanggal, baseline, status, PIC, hard deadline, internal |
| `dependencies` | finish-to-start antar `schedule_items` |
| `attachments` | link bernama pada target `(target_type, target_id)`: item jadwal atau project; tipe, internal |
| `attachment_versions` | nomor, url, catatan perubahan, status review, pembuat |
| `comments` | target `(target_type, target_id)`, user, isi |
| `deliverables` | platform, kelompok, nama, `spec` JSONB (kunci divalidasi katalog), asal dikirim/diturunkan, status, due, track, internal, id + versi preset |
| `audit_log` | entitas, aksi, ringkasan, before/after (JSONB), alasan, user, waktu |

Tanggal jadwal disimpan sebagai `date` dan diperlakukan sebagai string `YYYY-MM-DD`;
aritmetika di UTC (`schedule/dates.ts`). "Hari ini" dihitung di zona Asia/Jakarta.

Rancangan modul berikutnya:

| Tabel | Isi |
|---|---|
| `shots`, `shot_lists` | hasil import XML/EDL: reel, timecode, track, marker, nama baru, status VFX, vendor |
| `calendar_tokens` | token feed ICS per user/project |

Attachment dan comment memakai pasangan `(target_type, target_id)` tanpa foreign key, supaya
satu mekanisme berlaku untuk fase, milestone, dan nanti deliverable serta shot. Karena itu
layanan yang menghapus target wajib menghapus link dan komentarnya (`dropItemExtras`).

Preset deliverables hidup di `src/lib/deliverables/catalog.ts`. Tiap preset wajib mengisi
`specVersion`, `verifiedAt` (atau `null` bila belum dicek), dan `source`. Nilai spec berawalan
`@` diisi dari Technical Page saat diterapkan (`resolveSpec`). Memperbarui preset tidak
mengubah deliverable yang sudah dibuat; tiap item menyimpan `preset_version` asalnya.

## 5. Hak akses

`can(role, action)` di `src/lib/auth/permissions.ts`:

| Aksi | Supervisor | Assistant | Viewer |
|---|---|---|---|
| `project.view` | ✓ | ✓ | lewat token |
| `project.edit`, `tech.edit`, `access.manage`, `schedule.edit` | ✓ | – | – |
| `team.edit`, `schedule.status`, `asset.edit`, `comment.add` | ✓ | ✓ | – |
| `asset.approve`, `deliverable.edit` | ✓ | – | – |
| `deliverable.status` | ✓ | ✓ | – |

User yang bukan anggota project mendapat 404, bukan 403, agar keberadaan project tidak bocor.

## 6. Algoritma geser jadwal

`computeShift(items, deps, itemId, newStart, newDue, cascade)` di `src/lib/schedule/shift.ts`:

- Item yang diubah mendapat tanggal baru.
- `cascade`: semua item yang bergantung (transitif) bergeser sebesar selisih **due date**;
  milestone ikut fasenya. Milestone milik item yang diubah hanya ikut bila **tanggal mulai**
  berubah.
- Item **hard deadline** tidak pernah digeser dan menghentikan rambatan.
- Bentrok: pendahulu yang bergeser kini selesai pada/ setelah tanggal mulai item yang tidak
  ikut bergeser.
- `wouldCycle()` menolak dependency yang berputar.

Menyimpan: `applyShift()` menghitung ulang di dalam transaksi dan menulis satu entri change
log berisi tanggal lama → baru semua item terdampak.

## 7. Keamanan

- Password: scrypt dengan salt acak; perbandingan timing-safe.
- Sesi: token acak 32 byte, hanya hash yang disimpan; cookie httpOnly, SameSite=Lax,
  Secure di produksi; kedaluwarsa 30 hari.
- Link view-only: token acak 24 byte; halaman `noindex` dan `no-referrer`; token dicabut → 404.
- Setiap server action memuat project lewat keanggotaan user, lalu layanan memeriksa role lagi.
- Rahasia tidak pernah masuk repo; `.env*` dan `.data/` di-ignore.

## 8. Tampilan dan interaksi

- Tema terang bawaan, gelap lewat tombol; token warna sebagai CSS variable.
- Server component secara default; client component hanya untuk bagian interaktif
  (papan timeline, laci, combobox, toast).
- Server action yang dipanggil dari client mengembalikan `{ ok, error }`.
- Tidak ada fitur yang hanya bisa lewat drag: setiap aksi punya jalur form/keyboard.
- Halaman view-only memakai komponen yang sama dalam mode baca.

## 9. Pengujian

- `npm run lint`, `npm run typecheck`, `npm test`, `npx next build` harus bersih sebelum push.
- Unit: matriks hak akses, setiap layanan (termasuk penolakan role dan isi change log),
  `computeShift` untuk rambatan, hard deadline, dan loop.
- Browser (`e2e/smoke.cjs`): alur lengkap supervisor, assistant, dan viewer.

## 10. Deploy

Belum di-deploy. Rencana: Vercel untuk aplikasi, Supabase untuk Postgres. Set `DATABASE_URL`;
migrasi berjalan saat koneksi pertama. Akun admin pertama dibuat dengan
`npm run create-admin`.
