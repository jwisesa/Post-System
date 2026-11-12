// Indonesian national holidays (Hari Libur Nasional) and cuti bersama, per SKB 3 Menteri.
// Only years whose decree is published and cross-checked are listed. Add a year when its SKB is out.
type H = { date: string; name: string; joint?: boolean };

export const NATIONAL_HOLIDAYS: Record<number, H[]> = {
  // SKB Menag No. 1017/2024, Menaker No. 2/2024, MenPANRB No. 2/2024 (14 Okt 2024), diubah SKB No. 933/1/3 Tahun 2025 (18 Agustus 2025 cuti bersama)
  // https://kemenkopmk.go.id/pemerintah-tetapkan-hari-libur-nasional-dan-cuti-bersama-tahun-2025
  // https://www.hukumonline.com/berita/a/cuti-bersama-kemerdekaan-lt68957c7c1225f/
  2025: [
    { date: "2025-01-01", name: "Tahun Baru 2025 Masehi" },
    { date: "2025-01-27", name: "Isra Mikraj Nabi Muhammad saw." },
    { date: "2025-01-28", name: "Cuti Bersama Tahun Baru Imlek 2576", joint: true },
    { date: "2025-01-29", name: "Tahun Baru Imlek 2576 Kongzili" },
    { date: "2025-03-28", name: "Cuti Bersama Hari Suci Nyepi", joint: true },
    { date: "2025-03-29", name: "Hari Suci Nyepi (Tahun Baru Saka 1947)" },
    { date: "2025-03-31", name: "Idulfitri 1446 H" },
    { date: "2025-04-01", name: "Idulfitri 1446 H" },
    { date: "2025-04-02", name: "Cuti Bersama Idulfitri 1446 H", joint: true },
    { date: "2025-04-03", name: "Cuti Bersama Idulfitri 1446 H", joint: true },
    { date: "2025-04-04", name: "Cuti Bersama Idulfitri 1446 H", joint: true },
    { date: "2025-04-07", name: "Cuti Bersama Idulfitri 1446 H", joint: true },
    { date: "2025-04-18", name: "Wafat Yesus Kristus" },
    { date: "2025-04-20", name: "Kebangkitan Yesus Kristus (Paskah)" },
    { date: "2025-05-01", name: "Hari Buruh Internasional" },
    { date: "2025-05-12", name: "Hari Raya Waisak 2569 BE" },
    { date: "2025-05-13", name: "Cuti Bersama Waisak", joint: true },
    { date: "2025-05-29", name: "Kenaikan Yesus Kristus" },
    { date: "2025-05-30", name: "Cuti Bersama Kenaikan Yesus Kristus", joint: true },
    { date: "2025-06-01", name: "Hari Lahir Pancasila" },
    { date: "2025-06-06", name: "Iduladha 1446 H" },
    { date: "2025-06-09", name: "Cuti Bersama Iduladha", joint: true },
    { date: "2025-06-27", name: "1 Muharam Tahun Baru Islam 1447 H" },
    { date: "2025-08-17", name: "Proklamasi Kemerdekaan" },
    { date: "2025-08-18", name: "Cuti Bersama HUT RI ke-80", joint: true },
    { date: "2025-09-05", name: "Maulid Nabi Muhammad saw." },
    { date: "2025-12-25", name: "Kelahiran Yesus Kristus" },
    { date: "2025-12-26", name: "Cuti Bersama Natal", joint: true },
  ],
  // SKB Menag No. 1497/2025, Menaker No. 2/2025, MenPANRB No. 5/2025 (19 Sep 2025)
  // https://www.setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026
  // (cocok dengan detik.com / katadata.co.id: 17 libur nasional + 8 cuti bersama)
  2026: [
    { date: "2026-01-01", name: "Tahun Baru 2026 Masehi" },
    { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad saw." },
    { date: "2026-02-16", name: "Cuti Bersama Tahun Baru Imlek 2577", joint: true },
    { date: "2026-02-17", name: "Tahun Baru Imlek 2577 Kongzili" },
    { date: "2026-03-18", name: "Cuti Bersama Hari Suci Nyepi", joint: true },
    { date: "2026-03-19", name: "Hari Suci Nyepi (Tahun Baru Saka 1948)" },
    { date: "2026-03-20", name: "Cuti Bersama Idulfitri 1447 H", joint: true },
    { date: "2026-03-21", name: "Idulfitri 1447 H" },
    { date: "2026-03-22", name: "Idulfitri 1447 H" },
    { date: "2026-03-23", name: "Cuti Bersama Idulfitri 1447 H", joint: true },
    { date: "2026-03-24", name: "Cuti Bersama Idulfitri 1447 H", joint: true },
    { date: "2026-04-03", name: "Wafat Yesus Kristus" },
    { date: "2026-04-05", name: "Kebangkitan Yesus Kristus (Paskah)" },
    { date: "2026-05-01", name: "Hari Buruh Internasional" },
    { date: "2026-05-14", name: "Kenaikan Yesus Kristus" },
    { date: "2026-05-15", name: "Cuti Bersama Kenaikan Yesus Kristus", joint: true },
    { date: "2026-05-27", name: "Iduladha 1447 H" },
    { date: "2026-05-28", name: "Cuti Bersama Iduladha", joint: true },
    { date: "2026-05-31", name: "Hari Raya Waisak 2570 BE" },
    { date: "2026-06-01", name: "Hari Lahir Pancasila" },
    { date: "2026-06-16", name: "1 Muharam Tahun Baru Islam 1448 H" },
    { date: "2026-08-17", name: "Proklamasi Kemerdekaan" },
    { date: "2026-08-25", name: "Maulid Nabi Muhammad saw." },
    { date: "2026-12-24", name: "Cuti Bersama Natal", joint: true },
    { date: "2026-12-25", name: "Kelahiran Yesus Kristus" },
  ],
  // SKB Menag No. 1205/2026, Menaker No. 3/2026, MenPANRB No. 2/2026 (15 Sep 2026)
  // https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027
  // https://www.merahputih.com/post/read/libur-nasional-cuti-bersama-2027 (daftar identik)
  2027: [
    { date: "2027-01-01", name: "Tahun Baru 2027 Masehi" },
    { date: "2027-01-05", name: "Isra Mikraj Nabi Muhammad saw." },
    { date: "2027-02-05", name: "Cuti Bersama Tahun Baru Imlek 2578", joint: true },
    { date: "2027-02-06", name: "Tahun Baru Imlek 2578 Kongzili" },
    { date: "2027-03-08", name: "Hari Suci Nyepi (Tahun Baru Saka 1949)" },
    { date: "2027-03-09", name: "Cuti Bersama Idulfitri 1448 H", joint: true },
    { date: "2027-03-10", name: "Idulfitri 1448 H" },
    { date: "2027-03-11", name: "Idulfitri 1448 H" },
    { date: "2027-03-12", name: "Cuti Bersama Idulfitri 1448 H", joint: true },
    { date: "2027-03-15", name: "Cuti Bersama Idulfitri 1448 H", joint: true },
    { date: "2027-03-25", name: "Cuti Bersama Wafat Yesus Kristus", joint: true },
    { date: "2027-03-26", name: "Wafat Yesus Kristus" },
    { date: "2027-03-28", name: "Kebangkitan Yesus Kristus (Paskah)" },
    { date: "2027-05-01", name: "Hari Buruh Internasional" },
    { date: "2027-05-06", name: "Kenaikan Yesus Kristus" },
    { date: "2027-05-17", name: "Iduladha 1448 H" },
    { date: "2027-05-18", name: "Cuti Bersama Iduladha", joint: true },
    { date: "2027-05-19", name: "Cuti Bersama Waisak", joint: true },
    { date: "2027-05-20", name: "Hari Raya Waisak 2571 BE" },
    { date: "2027-06-01", name: "Hari Lahir Pancasila" },
    { date: "2027-06-06", name: "1 Muharam Tahun Baru Islam 1449 H" },
    { date: "2027-08-15", name: "Maulid Nabi Muhammad saw." },
    { date: "2027-08-17", name: "Proklamasi Kemerdekaan" },
    { date: "2027-12-24", name: "Cuti Bersama Natal", joint: true },
    { date: "2027-12-25", name: "Kelahiran Yesus Kristus" },
    { date: "2027-12-26", name: "Isra Mikraj Nabi Muhammad saw." },
  ],
};

export const HOLIDAY_YEARS = Object.keys(NATIONAL_HOLIDAYS).map(Number).sort((a, b) => a - b);

/** date -> name for every covered year; cuti bersama only when opts.joint. */
export function nationalHolidays(opts: { joint: boolean }) {
  const m = new Map<string, string>();
  for (const y of HOLIDAY_YEARS) for (const h of NATIONAL_HOLIDAYS[y]) if (opts.joint || !h.joint) m.set(h.date, h.name);
  return m;
}
