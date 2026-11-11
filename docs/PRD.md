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

### 4.3 Attachment, versioning, komentar ⏳

- **Attachment**: link bertipe preview, aset, atau dokumen (Drive, Frame.io, Vimeo, dll.)
  yang menempel ke fase, milestone, deliverable, atau shot. Tanpa upload file.
- **Version** di semua lini: nomor versi, link, catatan apa yang berubah/direvisi, pembuat,
  tanggal, status approval.
- **Komentar** per item atas nama akun.
- **Dokumen produksi**: script, script report, camera/sound report, grab still.

### 4.4 Deliverables ⏳

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
  platform sering berubah dan harus dicek ulang sebelum dipakai.
- Membedakan item yang **dikirim** dari yang **diturunkan platform**.
- Bisa memuat aturan antar item (mis. trailer tidak boleh Dolby Vision di Prime Video).
- Deliverables mewarisi nilai dari Technical Page.

### 4.5 Dashboard dan notifikasi ⏳

- Dashboard "Hari Ini": due hari ini, 7 hari ke depan, terlambat, dan yang perlu di-follow-up
  (item tanpa update menjelang due).
- Bisa di-install ke home screen (PWA).
- Calendar feed (ICS) supaya deadline muncul di kalender dan widget kalender perangkat.
- Notifikasi push atau email; laporan mingguan otomatis untuk producer.

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
