# Post-System — Product Requirements

## 1. Masalah

Post-production supervisor/producer memegang seluruh jadwal, sisi teknis, dan deliverables
sebuah project, tetapi alatnya terpisah-pisah:

- Jadwal di spreadsheet yang diisi manual per tanggal dan sulit diubah.
- Deliverables berupa link Google Drive atau platform lain tanpa satu tempat pelacakan.
- Tidak ada sistem untuk proses editing, musik, VFX, grading, beserta materinya.
- Jadwal pasca produksi selalu berubah, dan perubahan itu sulit direfleksikan ke semua pihak.

## 2. Tujuan

Satu sistem berbasis web, satu sumber data per project, yang:

1. Berbasis timeline dan **interaktif**: jadwal diubah langsung di timeline.
2. Menyediakan **opsi siap-pilih** di setiap tempat (fase, spesifikasi, deliverables), yang
   tetap bisa disesuaikan untuk film bioskop, film/series OTT, YouTube, web series, dan
   iklan digital.
3. Melacak semua deliverables beserta **versi** dan catatan perubahannya.
4. Bisa dilihat seluruh tim tanpa bisa mereka ubah.

## 3. Pengguna dan hak akses

| Peran | Cara masuk | Bisa apa |
|---|---|---|
| **Supervisor** | Akun pribadi (email + password) di halaman admin | Semua: project, jadwal, teknis, tim, akses, deliverables |
| **Assistant / runner** | Akun pribadi di halaman admin | Mengubah status dan catatan progress, direktori tim, mengisi link dan versi |
| **Viewer** (producer, director, tim lain) | Link view-only per project, tanpa akun | Melihat jadwal, teknis, tim, aset, status. Tidak bisa mengubah apa pun |

- Akun admin per orang, supaya setiap perubahan dan komentar tercatat atas nama pembuatnya.
- Link view-only bisa dicabut kapan saja.
- Item bertanda **internal** tidak pernah tampil di link view-only.
- Tiap project terisolasi penuh. Belum ada tampilan lintas project (sekitar 3 project berjalan).

## 4. Modul

Status: ✅ sudah dibangun · ⏳ belum.

### 4.1 Project, Technical Page, tim, akses ✅

- **Project**: nama, tipe produksi, platform tujuan, jumlah episode/reel.
- **Technical Page**: source of truth teknis project. Field gambar (format sumber, resolusi
  kerja dan master, frame rate, aspect ratio, color space, target master, LUT), audio
  (konfigurasi mix, sample rate, loudness), dan workflow (NLE, codec, format plate VFX,
  start timecode, handles, konvensi nama). Nilai awal terisi sesuai tipe produksi.
- **Direktori tim**: per departemen/vendor; person in charge, person in contact, email yang
  perlu diberi akses, tanda internal.
- **Change log**: siapa mengubah apa, kapan, nilai lama → baru, dan alasannya.

### 4.2 Timeline ✅

- **Track paralel** per project: Main Feature, Trailer, Teaser, First Look, dan lainnya.
  Materi promo punya jadwal sendiri dan bisa deliver lebih dulu dari filmnya.
- **Fase** per track dari template (film/episode, materi promo, digital ad, kosong);
  **milestone** di dalam fase.
- **Dependency** antar item, termasuk lintas track.
- **Jadwal fleksibel**: saat sebuah tanggal diubah, item yang bergantung ikut bergeser.
  Dampaknya selalu ditampilkan dulu sebelum disimpan, dengan pilihan "geser semua" atau
  "ubah item ini saja".
- **Hard deadline** tidak pernah digeser otomatis; tabrakan dilaporkan sebagai bentrok.
- **Baseline**: jadwal awal disimpan sehingga selisihnya terlihat per item.
- Status, PIC, catatan progress, dan penanda terlambat per item.
- Pergeseran dihitung dalam hari kalender.
- **Interaksi**: seret batang untuk memindah, tarik ujung untuk memperpanjang, seret titik
  di kanan batang ke item lain untuk membuat dependency, klik panah untuk melepasnya.
  Dampak tampil langsung saat menyeret; perubahan dikonfirmasi dulu dan bisa diurungkan.
  Setiap aksi juga bisa dilakukan lewat panel detail (tanpa drag) dan keyboard.

### 4.3 Link, versioning, komentar ✅

- **Link** bertipe preview, aset, atau dokumen (Drive, Frame.io, Vimeo, dll.) menempel ke
  fase atau milestone. Tanpa upload file. Nama link dipilih dari daftar siap-pakai atau diketik.
- **Versi**: setiap perubahan link menjadi versi baru bernomor (v1, v2, …) dengan catatan
  wajib tentang apa yang berubah/direvisi, pembuat, dan waktu. Versi lama tetap bisa dibuka.
- **Status review** per versi: Menunggu review, Approved, Perlu revisi. Hanya supervisor
  yang menetapkannya (mencatat keputusan director/producer).
- **Komentar** per item atas nama akun. Komentar adalah diskusi internal tim admin dan
  **tidak tampil** di link view-only.
- **Dokumen produksi** tingkat project: script, script report, camera/sound report, grab
  still, dan lainnya.
- Halaman **Aset & dokumen** merangkum semua link per track dan item; ringkasan project
  menampilkan link yang belum approved.
- Viewer melihat link dan riwayat versinya, kecuali yang bertanda internal atau yang
  menempel pada item internal.
- Link pada deliverable sudah ada (modul 4.4); pada shot menyusul bersama modul 6.

### 4.4 Deliverables ✅

Deliverable dibentuk dari kombinasi opsi yang tinggal dipilih:

| Dimensi | Contoh opsi |
|---|---|
| Konten | Feature, Episode, Trailer, Teaser, First Look, TVC, cutdown |
| Versi | Theatrical, Texted, Textless, Censored, International |
| Resolusi / ratio | 4K DCI, UHD, 2K, HD; 2.39, 1.85, 16:9, 9:16, 1:1, 4:5 |
| Dynamic range | SDR Rec.709, DCI-P3, HDR10, Dolby Vision |
| Format | DPX sequence, IMF, ProRes 4444 XQ / 422 HQ, MP4 |
| Audio | 7.1, 5.1, Atmos, Stereo, DME, stems, M&E |
| Teks | Subtitle / CC per bahasa |
| Pendukung | Music cue list, file musik, key art, QC report |

Tiap item punya status (Not Started, In Progress, QC, Delivered, Accepted/Rejected),
due date, link, dan riwayat versi.

**Preset per platform** menghasilkan checklist awal yang bisa ditambah atau dikurangi:

- **Bioskop**: sumber untuk DCP berupa **DPX sequence** (file DCP dan KDM tidak dilacak);
  master ProRes 4K texted dan textless; MP4 dan versi lebih kecil; audio 7.1/5.1,
  **stereo** untuk distribusi biasa, DME, stems, M&E; **file seluruh musik** di film;
  music cue list; subtitle; QC report.
- **Netflix**: Dolby Vision IMF, Atmos BWAV ADM; turunan HDR10/SDR dibuat platform.
- **Prime Video**: ProRes 422 HQ; untuk Dolby Vision, pasangan dua file dengan sidecar XML;
  audio per bahasa sebagai aset terpisah.
- **Disney+ dan platform tanpa spec publik**: kerangka umum, diisi dari spec sheet per judul.
- **YouTube / digital ads**: **matriks cutdown** durasi × ratio (mis. 60/30/15/6 detik ×
  16:9, 9:16, 1:1, 4:5); tiap sel adalah satu deliverable dan bisa dimatikan.

Aturan preset:

- Preset **berversi dan bertanggal verifikasi**, dengan link ke spec resmi. Spesifikasi
  platform sering berubah dan harus dicek ulang sebelum dipakai. Preset yang belum pernah
  dicek ke spec resmi (OTT lain, YouTube) ditandai jelas saat dipilih.
- Membedakan item yang **dikirim** dari yang **diturunkan platform** (tanpa status dan due).
- Aturan antar item (mis. trailer tidak boleh Dolby Vision di Prime Video) ditampilkan
  sebagai catatan saat memilih preset; belum divalidasi otomatis.
- Deliverables mewarisi resolusi master dan aspect ratio dari Technical Page saat preset
  diterapkan.

Perilaku yang sudah dibangun:

- Item preset bisa dikurangi sebelum diterapkan (item opsional tidak dicentang secara
  bawaan); menerapkan preset yang sama dua kali tidak menggandakan.
- Deliverable bisa dikaitkan ke track (mis. Trailer) dan diberi due date sendiri.
- Status bisa diubah langsung dari baris, juga oleh assistant; membuat, mengubah definisi,
  dan menghapus hanya oleh supervisor.
- Link berversi menempel di tiap deliverable (mekanisme yang sama dengan modul 4.3).
- Ringkasan project menampilkan progres dan deliverable yang due dalam 7 hari atau terlambat.
- Viewer melihat daftar, status, dan link, kecuali yang bertanda internal.
- Belum: due date deliverable belum terhubung ke timeline (tidak ikut bergeser), dan belum
  ada aksi massal (ubah status/hapus banyak item sekaligus).

### 4.5 Dashboard, kalender, laporan ✅

- **Hari Ini** (halaman pertama tiap project): due hari ini, terlambat, 7 hari ke depan,
  hard deadline berikutnya beserta sisa hari, progres deliverables, link yang belum approved,
  dan perubahan terbaru. Mencakup item jadwal dan deliverables.
- **Perlu follow-up**: item belum selesai yang terlambat atau due dalam 7 hari dan tidak
  di-update lebih dari 3 hari. Menampilkan PIC dengan tautan email/telepon dan tombol
  "Sudah di-follow-up" (catatan opsional, tercatat di change log). Daftar ini internal dan
  tidak dikirim ke link view-only.
- **Langganan kalender (ICS)**: tiap akun punya link pribadi per project yang memuat semua
  due date (hard deadline bertanda ⚑), termasuk item internal; bisa dibuat ulang untuk
  mematikan link lama. Link view-only punya feed sendiri tanpa item internal. Dengan
  berlangganan, deadline muncul di kalender dan widget kalender bawaan perangkat.
  Catatan: Google Calendar memperbarui kalender langganan hanya setiap beberapa jam.
- **PWA**: bisa di-install ke home screen. Belum ada mode offline.
- **Laporan mingguan**: status dan selisih baseline per track, terlambat, deliverables, link
  menunggu review, perubahan 7 hari terakhir; ramah cetak/PDF, plus tombol salin ringkasan
  teks untuk WhatsApp/email.
- Viewer mendapat tab "Hari Ini" versi baca.
- **Notifikasi email tidak dibuat** (keputusan supervisor); pengingat lewat kalender.
- **Belum**: notifikasi push dan pengiriman laporan mingguan otomatis.

### 4.6 Tool XML/EDL ⏳

- Import FCP7 XML (Premiere, Resolve), FCPXML (Final Cut, Resolve), dan EDL menjadi daftar shot.
- Filter (mis. hanya shot VFX berdasarkan marker, warna clip, track, atau pilihan manual).
- Rename massal dengan pola (mis. `PRJ_SC012_SH0030`).
- Export XML/EDL baru dan VFX pull list (CSV) dengan handles.
- Shot tracker VFX: status, vendor, dan versi per shot.
- Validasi terhadap Technical Page (mis. frame rate tidak cocok).
- DRT tidak didukung: format biner milik Resolve. XML/EDL tetap bisa di-import Resolve.

## 5. Di luar cakupan saat ini

- Upload file ke sistem (hanya link eksternal).
- Tampilan lintas project.
- Widget native per perangkat (dicakup lewat PWA dan calendar feed lebih dulu).
- Melewati akhir pekan/hari libur saat menggeser jadwal.

## 6. Pertanyaan terbuka

- Apakah assistant perlu bisa menggeser tanggal atau menambah milestone?
- Ganti password sendiri dan reset password.
- Bahasa subtitle/dub yang umum dipakai, untuk opsi siap-pilih.
- Durasi bawaan tiap fase di template: perlu disesuaikan dengan praktik tim.
