// Prepared track templates. Durations are calendar days and only a starting
// point; every date stays editable once the track exists. Each phase comes with
// the single-date milestones that usually belong to it (`at` = position inside
// the phase, 0 = first day, 1 = last day).
export type TemplateMilestone = { name: string; at: number };
export type TemplatePhase = { name: string; days: number; color: number; after?: string[]; milestones?: TemplateMilestone[] };
export type TrackTemplate = { value: string; label: string; defaultName: string; phases: TemplatePhase[] };

export const TRACK_TEMPLATES: TrackTemplate[] = [
  {
    value: "production",
    label: "Produksi (testcam + principal photography)",
    defaultName: "Production",
    phases: [
      { name: "Testcam", days: 2, color: 8 },
      { name: "Principal Photography", days: 30, color: 1, after: ["Testcam"], milestones: [{ name: "Day 1", at: 0 }, { name: "Wrap", at: 1 }] },
    ],
  },
  {
    value: "feature",
    label: "Film / episode utama",
    defaultName: "Main Feature",
    phases: [
      { name: "Ingest & Sync", days: 7, color: 8 },
      {
        name: "Offline Edit", days: 42, color: 2, after: ["Ingest & Sync"],
        milestones: [
          { name: "Editor's Cut", at: 0.35 }, { name: "Director's Cut", at: 0.6 }, { name: "Preview 1", at: 0.72 },
          { name: "Preview 2", at: 0.84 }, { name: "Producer Session", at: 0.92 }, { name: "Picture Lock", at: 1 },
        ],
      },
      { name: "VFX", days: 35, color: 3, after: ["Offline Edit"], milestones: [{ name: "VFX Review", at: 0.6 }, { name: "VFX Final", at: 1 }] },
      { name: "Music", days: 28, color: 4, after: ["Offline Edit"], milestones: [{ name: "Spotting Session", at: 0 }, { name: "Music Review", at: 0.65 }, { name: "Music Final", at: 1 }] },
      { name: "Sound Design & Mix", days: 28, color: 5, after: ["Offline Edit"], milestones: [{ name: "Premix Review", at: 0.7 }, { name: "Final Mix", at: 1 }] },
      {
        name: "Grading", days: 14, color: 6, after: ["Offline Edit"],
        milestones: [{ name: "Cinematographer Session", at: 0.4 }, { name: "Director Session", at: 0.7 }, { name: "Producer Session", at: 0.85 }, { name: "Grading Approval", at: 1 }],
      },
      { name: "Online / Conform", days: 7, color: 7, after: ["VFX", "Grading"], milestones: [{ name: "Online Review", at: 1 }] },
      { name: "QC", days: 5, color: 1, after: ["Online / Conform", "Sound Design & Mix", "Music"], milestones: [{ name: "QC Report", at: 1 }] },
      { name: "Mastering", days: 5, color: 3, after: ["QC"], milestones: [{ name: "Test DCP", at: 0.5 }, { name: "Print DCP", at: 1 }] },
      { name: "Delivery", days: 1, color: 5, after: ["Mastering"] },
    ],
  },
  {
    value: "promo",
    label: "Materi promo (trailer / teaser / first look)",
    defaultName: "Trailer",
    phases: [
      { name: "Edit", days: 10, color: 2, milestones: [{ name: "Editor's Cut", at: 0.6 }] },
      { name: "Approval Cut", days: 3, color: 4, after: ["Edit"], milestones: [{ name: "Approval", at: 1 }] },
      { name: "Music & Sound", days: 5, color: 5, after: ["Approval Cut"] },
      { name: "Grading & Online", days: 4, color: 6, after: ["Approval Cut"] },
      { name: "QC", days: 2, color: 1, after: ["Music & Sound", "Grading & Online"] },
      { name: "Delivery", days: 1, color: 3, after: ["QC"] },
    ],
  },
  {
    value: "ad",
    label: "Digital ad / web video",
    defaultName: "Main Cut",
    phases: [
      { name: "Offline Edit", days: 5, color: 2, milestones: [{ name: "Editor's Cut", at: 0.6 }] },
      { name: "Client Approval", days: 2, color: 4, after: ["Offline Edit"], milestones: [{ name: "Picture Lock", at: 1 }] },
      { name: "Grading & Online", days: 3, color: 6, after: ["Client Approval"] },
      { name: "Sound Mix", days: 2, color: 5, after: ["Client Approval"] },
      { name: "Cutdown & Versioning", days: 3, color: 7, after: ["Grading & Online", "Sound Mix"] },
      { name: "QC & Delivery", days: 1, color: 1, after: ["Cutdown & Versioning"] },
    ],
  },
  { value: "empty", label: "Kosong", defaultName: "Track baru", phases: [] },
];

export const TRACK_NAME_OPTIONS = ["Main Feature", "Production", "Trailer", "Teaser", "First Look", "Behind the Scenes", "TVC", "Social Cutdown"];

/** Suggestions when adding an item by hand; any other name is fine too. */
export const PHASE_NAME_OPTIONS = [...new Set(TRACK_TEMPLATES.flatMap((t) => t.phases.map((p) => p.name)))];
export const MILESTONE_NAME_OPTIONS = [
  ...new Set([...TRACK_TEMPLATES.flatMap((t) => t.phases.flatMap((p) => (p.milestones ?? []).map((m) => m.name))), "Preview 3", "Test Screening", "Sound Review", "DCP QC", "Censorship (LSF)", "Subtitle Final"]),
];

export const PHASE_COLORS = 8;

export const STATUSES = [
  { value: "not_started", label: "Belum mulai" },
  { value: "in_progress", label: "Berjalan" },
  { value: "review", label: "Review" },
  { value: "done", label: "Selesai" },
  { value: "on_hold", label: "Ditahan" },
] as const;

export const statusLabel = (v: string) => STATUSES.find((s) => s.value === v)?.label ?? v;
