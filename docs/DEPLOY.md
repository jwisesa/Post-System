# Deploy ke Vercel + Supabase

Aplikasi di Vercel, database di Supabase. Paket gratis keduanya cukup untuk beberapa project.
Password dan kunci hanya diketik di dashboard Vercel/Supabase, tidak pernah di chat atau di repo.

## 1. Supabase: siapkan database

1. Buat project baru. Pilih region terdekat (Singapore) dan **simpan password database-nya**.
2. Buka tombol **Connect** di bagian atas project → **Connection string** → pilih
   **Transaction pooler**.
3. Salin URI-nya. Bentuknya:
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres`
4. Ganti `[YOUR-PASSWORD]` dengan password dari langkah 1. Kalau password memuat karakter
   seperti `@ : / # ?`, ganti password dengan yang hanya huruf dan angka agar URI tetap valid.

Tabel tidak perlu dibuat manual; aplikasi membuatnya sendiri saat pertama kali dibuka, di
schema terpisah bernama `post_system`.

**Memakai project Supabase yang sudah ada** (mis. karena batas 2 project di paket free) juga
bisa: lewati langkah 1, dan ambil URI Transaction pooler dari project itu. Post-System hanya
menyentuh schema `post_system`; tabel aplikasi lain di project yang sama tidak diubah. Kuota
penyimpanan dan koneksi dipakai bersama.

## 2. Vercel: import repo

1. **Add New → Project**, pilih repo GitHub `jwisesa/Post-System`. Kalau repo tidak muncul,
   beri Vercel akses ke repo itu lewat **Adjust GitHub App Permissions**.
2. Framework terdeteksi sebagai Next.js. Biarkan pengaturan build bawaan.
3. Buka **Environment Variables** dan isi:

   | Nama | Nilai |
   |---|---|
   | `DATABASE_URL` | URI dari Supabase (langkah 1) |
   | `SETUP_KEY` | kata sandi sekali pakai buatan Anda, untuk membuat akun pertama |

4. **Branch produksi.** Vercel men-deploy branch utama repo. Kalau kode belum ada di `main`,
   buka **Settings → Environments → Production → Branch Tracking** dan pilih branch yang
   berisi kode, atau gabungkan dulu branch itu ke `main`.
5. **Region**: di **Settings → Functions → Function Region**, pilih region yang sama dengan
   database Supabase (mis. Tokyo `hnd1` untuk `ap-northeast-1`, Singapore `sin1` untuk
   `ap-southeast-1`). Bawaan Vercel adalah US East, yang membuat setiap halaman lambat.
6. Klik **Deploy**. Environment variable dan region baru berlaku pada deploy berikutnya,
   jadi setelah mengubahnya lakukan **Redeploy** dari tab Deployments.

## 3. Buat akun pertama

1. Buka `https://<alamat-vercel-anda>/setup`.
2. Ketik `SETUP_KEY`, lalu nama, email, dan password akun supervisor Anda.
3. Login di `/admin`.

Halaman `/setup` otomatis tertutup (404) begitu satu akun ada. Setelah itu `SETUP_KEY` boleh
dihapus dari Vercel. Akun lain dibuat dari menu **Akses** di tiap project.

## 4. Di ponsel

- **Install**: buka alamat aplikasi di Safari/Chrome → Share / menu → **Add to Home Screen**.
- **Kalender**: di halaman **Hari Ini**, salin link dari kartu **Langganan kalender** dan
  tambahkan sebagai kalender langganan.

## Kalau ada masalah

| Gejala | Kemungkinan penyebab |
|---|---|
| Halaman error, log berisi "DATABASE_URL belum diisi" | Variabel belum diisi, atau diisi setelah deploy: deploy ulang |
| "Tidak bisa menyiapkan database dari DATABASE_URL" | URI salah, password salah, atau memakai URI "Direct connection" (pakai Transaction pooler) |
| `/setup` menampilkan 404 | `SETUP_KEY` belum diisi, atau sudah ada akun |
| Tampilan lama setelah push | Vercel belum selesai build; cek tab Deployments |

Log ada di Vercel → project → **Logs**. Pesan error di log tidak memuat password, jadi aman
untuk disalin saat meminta bantuan.

## Catatan teknis

- Migrasi database (`drizzle/`) ikut dalam setiap deploy dan dijalankan saat koneksi pertama.
- Koneksi memakai pool kecil (`DB_POOL_MAX`, bawaan 3) dan `prepare: false`, sesuai pooler
  Supabase mode transaction.
- Di Vercel aplikasi menolak berjalan tanpa `DATABASE_URL`, supaya data tidak tersimpan di
  database sementara yang hilang saat restart.
