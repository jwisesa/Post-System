// Labels and fixed rules for the budget module. Codes are English, labels Indonesian.

export const SERVICE_CATEGORIES = {
  grading: "Grading",
  online: "Online / conform",
  sound: "Sound mix",
  vfx: "VFX",
  dcp: "DCP / mastering",
  subtitle: "Subtitle",
  drives: "Hard drive & storage",
  other: "Lainnya",
} as const;
export type ServiceCategory = keyof typeof SERVICE_CATEGORIES;
export const categoryLabel = (c: string) => Object.hasOwn(SERVICE_CATEGORIES, c) ? SERVICE_CATEGORIES[c as ServiceCategory] : c;

export const VERSION_STATUSES = {
  draft: "Draft",
  sent: "Dikirim ke vendor",
  negotiating: "Negosiasi",
  approved: "Disetujui",
  rejected: "Ditolak",
  superseded: "Digantikan",
} as const;
export type VersionStatusCode = keyof typeof VERSION_STATUSES;

/** Allowed manual moves. "superseded" is only ever set automatically. */
export const NEXT: Record<VersionStatusCode, VersionStatusCode[]> = {
  draft: ["sent", "negotiating", "approved", "rejected"],
  sent: ["negotiating", "approved", "rejected"],
  negotiating: ["sent", "approved", "rejected"],
  approved: ["negotiating"], // needs a note: "batal setujui"
  rejected: ["negotiating"],
  superseded: [],
};

// Indonesian tax rules, ESTIMATE ONLY. Verified online 2026-11 (facts matched; labels unchanged):
// - PPN: statutory rate 12% since 1 Jan 2025, but PMK 131/2024 sets the tax base for non-luxury goods/services (BKP/JKP nonmewah)
//   at "DPP nilai lain" = 11/12 of the price, so the effective rate is 11%. Luxury goods use the full price (12%). Special
//   regimes (PMK 11/2025) may differ. Charged only by vendors who are PKP.
//   https://www.pajak.go.id/id/artikel/pmk-1312024-tarif-ppn-sebelas-dua-belas
// - PPh 23: withheld by the payer, 2% of the amount excluding PPN for services (jasa) and equipment/asset rental; not for goods,
//   and not for individuals under PPh 21. 4% (100% higher) when the vendor has no NPWP (still so when a NIK is not yet activated).
//   Other income types (royalty, dividend...) use 15%. https://www.pajak.go.id/id/pemotongan-pajak-penghasilan-pasal-23
// Both rates are editable per version; these are only the defaults.
export const DEFAULT_PPN_BP = 1100;
export const DEFAULT_PPH23_BP = 200;
export const PPN_LABEL = "PPN 11% (efektif)";
/** Marker stored at the start of statusNote when an approval is undone ("batal setujui"). */
export const CANCEL_MARK = "Persetujuan dibatalkan";
export const TAX_NOTE = "Perkiraan pajak, bukan nasihat pajak. Cek dengan finance/konsultan pajak.";
