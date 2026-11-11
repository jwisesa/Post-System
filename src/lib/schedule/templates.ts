// Prepared track templates. Durations are calendar days and only a starting
// point; every date stays editable once the track exists.
export type TemplatePhase = { name: string; days: number; after?: string[] };
export type TrackTemplate = { value: string; label: string; defaultName: string; phases: TemplatePhase[] };

export const TRACK_TEMPLATES: TrackTemplate[] = [
  {
    value: "feature",
    label: "Film / episode utama",
    defaultName: "Main Feature",
    phases: [
      { name: "Ingest & Sync", days: 7 },
      { name: "Offline Edit", days: 42, after: ["Ingest & Sync"] },
      { name: "Picture Lock", days: 1, after: ["Offline Edit"] },
      { name: "VFX", days: 35, after: ["Picture Lock"] },
      { name: "Music", days: 28, after: ["Picture Lock"] },
      { name: "Sound Design & Mix", days: 28, after: ["Picture Lock"] },
      { name: "Grading", days: 14, after: ["Picture Lock"] },
      { name: "Online / Conform", days: 7, after: ["VFX", "Grading"] },
      { name: "QC", days: 5, after: ["Online / Conform", "Sound Design & Mix", "Music"] },
      { name: "Mastering", days: 5, after: ["QC"] },
      { name: "Delivery", days: 1, after: ["Mastering"] },
    ],
  },
  {
    value: "promo",
    label: "Materi promo (trailer / teaser / first look)",
    defaultName: "Trailer",
    phases: [
      { name: "Edit", days: 10 },
      { name: "Approval Cut", days: 3, after: ["Edit"] },
      { name: "Music & Sound", days: 5, after: ["Approval Cut"] },
      { name: "Grading & Online", days: 4, after: ["Approval Cut"] },
      { name: "QC", days: 2, after: ["Music & Sound", "Grading & Online"] },
      { name: "Delivery", days: 1, after: ["QC"] },
    ],
  },
  {
    value: "ad",
    label: "Digital ad / web video",
    defaultName: "Main Cut",
    phases: [
      { name: "Offline Edit", days: 5 },
      { name: "Client Approval", days: 2, after: ["Offline Edit"] },
      { name: "Grading & Online", days: 3, after: ["Client Approval"] },
      { name: "Sound Mix", days: 2, after: ["Client Approval"] },
      { name: "Cutdown & Versioning", days: 3, after: ["Grading & Online", "Sound Mix"] },
      { name: "QC & Delivery", days: 1, after: ["Cutdown & Versioning"] },
    ],
  },
  { value: "empty", label: "Kosong", defaultName: "Track baru", phases: [] },
];

export const TRACK_NAME_OPTIONS = ["Main Feature", "Trailer", "Teaser", "First Look", "Behind the Scenes", "TVC", "Social Cutdown"];

export const STATUSES = [
  { value: "not_started", label: "Belum mulai" },
  { value: "in_progress", label: "Berjalan" },
  { value: "review", label: "Review" },
  { value: "done", label: "Selesai" },
  { value: "on_hold", label: "Ditahan" },
] as const;

export const statusLabel = (v: string) => STATUSES.find((s) => s.value === v)?.label ?? v;
