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
export const categoryLabel = (c: string) => (SERVICE_CATEGORIES as Record<string, string>)[c] ?? c;

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

// Indonesian tax rules, ESTIMATE ONLY (from general knowledge of the rules in force since 2025; not re-verified online):
// - PPN: statutory rate 12% (UU HPP), but for non-luxury goods/services the tax base is "DPP nilai lain" = 11/12 of the price,
//   so the effective rate is 11%. Charged only by vendors who are PKP.
// - PPh 23: withheld by the payer, 2% of the amount excluding PPN for services (jasa) and equipment rental; not for goods.
//   The rate is 100% higher (4%) when the vendor has no NPWP. Other income types (royalty, dividend...) use 15%.
// Both rates are editable per version; these are only the defaults.
export const DEFAULT_PPN_BP = 1100;
export const DEFAULT_PPH23_BP = 200;
export const PPN_LABEL = "PPN 11% (efektif)";
export const TAX_NOTE = "Perkiraan pajak, bukan nasihat pajak. Cek dengan finance/konsultan pajak.";
