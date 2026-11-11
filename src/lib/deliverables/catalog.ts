// Prepared options and platform presets for deliverables.
//
// Presets are starting checklists, not a guarantee of platform compliance:
// platform specs change, so each preset carries the spec version it was
// written against, when it was last checked, and where to check again.

export const DELIVERABLE_STATUSES = [
  { value: "not_started", label: "Belum mulai", tone: "" },
  { value: "in_progress", label: "Dikerjakan", tone: "tag-accent" },
  { value: "qc", label: "QC", tone: "tag-warn" },
  { value: "delivered", label: "Terkirim", tone: "tag-ok" },
  { value: "accepted", label: "Diterima", tone: "tag-ok" },
  { value: "rejected", label: "Ditolak", tone: "tag-danger" },
] as const;
export const deliverableStatus = (v: string) => DELIVERABLE_STATUSES.find((s) => s.value === v) ?? DELIVERABLE_STATUSES[0];
export const isDone = (status: string) => status === "delivered" || status === "accepted";

export const SPEC_FIELDS = [
  { key: "version", label: "Versi", options: ["Texted", "Textless", "Semi-textless", "Theatrical", "Censored / LSF", "International", "Director's Cut"] },
  { key: "resolution", label: "Resolusi", options: ["4096x1716 (4K Scope)", "3996x2160 (4K Flat)", "4096x2160 (4K DCI)", "3840x2160 (UHD)", "2048x858 (2K Scope)", "1998x1080 (2K Flat)", "1920x1080 (HD)", "1080x1920", "1080x1080", "1080x1350"] },
  { key: "aspectRatio", label: "Aspect ratio", options: ["2.39:1", "1.85:1", "16:9", "9:16", "1:1", "4:5"] },
  { key: "dynamicRange", label: "Color / range", options: ["SDR Rec.709", "DCI-P3", "P3-D65", "HDR10", "Dolby Vision"] },
  { key: "format", label: "Format", options: ["DPX sequence 16-bit", "DPX sequence 10-bit", "IMF (App 2E)", "ProRes 4444 XQ", "ProRes 4444", "ProRes 422 HQ", "MP4 H.264", "MP4 H.265", "WAV 24-bit 48 kHz", "BWAV ADM", "SRT", "IMSC 1.1 / TTML", "PDF", "XLSX"] },
  { key: "audio", label: "Audio", options: ["7.1", "5.1", "Stereo", "Dolby Atmos", "DME", "Stems", "M&E 5.1", "M&E Stereo", "Tanpa audio"] },
  { key: "language", label: "Bahasa", options: ["Indonesia", "English", "Jawa", "Sunda", "Melayu", "Mandarin", "Jepang", "Korea"] },
  { key: "duration", label: "Durasi", options: ["60s", "45s", "30s", "20s", "15s", "10s", "6s"] },
] as const;
export type SpecKey = (typeof SPEC_FIELDS)[number]["key"];
const SPEC_KEYS = new Set<string>(SPEC_FIELDS.map((f) => f.key));

export function cleanSpec(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!SPEC_KEYS.has(k) || typeof v !== "string") continue;
    const value = v.trim().slice(0, 120);
    if (value) out[k] = value;
  }
  return out;
}

export const GROUPS = ["Master gambar", "Turunan gambar", "Audio", "Musik", "Teks", "Dokumen & pendukung", "Cutdown", "Diturunkan platform"];
export const CUTDOWN_DURATIONS = ["60s", "45s", "30s", "20s", "15s", "10s", "6s"];
export const CUTDOWN_RATIOS = ["16:9", "9:16", "1:1", "4:5"];
export const CUTDOWN_CONTENTS = ["Trailer", "Teaser", "First Look", "TVC", "Social Cutdown", "Bumper"];
export const DELIVERY_PLATFORMS = ["Bioskop", "Netflix", "Prime Video", "Disney+", "Vidio", "YouTube", "Meta", "TikTok", "TV Broadcast", "Arsip internal"];

/** Values starting with "@" are filled from the project's Technical Page when the preset is applied. */
export type PresetItem = { group: string; name: string; spec?: Partial<Record<SpecKey, string>>; origin?: "delivered" | "derived"; optional?: boolean };
export type Preset = {
  id: string; platform: string; label: string; specVersion: string;
  /** Date the item list was last checked against the source, or null if never. */
  verifiedAt: string | null;
  source: { label: string; url?: string }[];
  note: string; rules: string[]; items: PresetItem[];
};

const master = { resolution: "@masterResolution", aspectRatio: "@aspectRatio" } as const;

export const PRESETS: Preset[] = [
  {
    id: "cinema", platform: "Bioskop", label: "Film bioskop", specVersion: "Tim 2026-11", verifiedAt: "2026-11-11",
    source: [{ label: "Kebutuhan tim post (brief supervisor)" }],
    note: "Yang dilacak adalah sumber untuk pembuatan DCP (DPX sequence), bukan file DCP atau KDM-nya.",
    rules: ["Nama CPL DCP mengikuti konvensi ISDCF; dikerjakan lab, tidak dilacak di sini."],
    items: [
      { group: "Master gambar", name: "DPX sequence (sumber DCP)", spec: { ...master, format: "DPX sequence 16-bit", dynamicRange: "DCI-P3", version: "Texted" } },
      { group: "Master gambar", name: "ProRes 4K master — texted", spec: { ...master, format: "ProRes 4444 XQ", version: "Texted" } },
      { group: "Master gambar", name: "ProRes 4K master — textless", spec: { ...master, format: "ProRes 4444 XQ", version: "Textless" } },
      { group: "Turunan gambar", name: "ProRes HD", spec: { resolution: "1920x1080 (HD)", format: "ProRes 422 HQ", dynamicRange: "SDR Rec.709" } },
      { group: "Turunan gambar", name: "MP4 UHD", spec: { resolution: "3840x2160 (UHD)", format: "MP4 H.264", dynamicRange: "SDR Rec.709" } },
      { group: "Turunan gambar", name: "MP4 HD (screener)", spec: { resolution: "1920x1080 (HD)", format: "MP4 H.264", dynamicRange: "SDR Rec.709" } },
      { group: "Turunan gambar", name: "MP4 sensor (LSF)", spec: { resolution: "1920x1080 (HD)", format: "MP4 H.264", version: "Censored / LSF" }, optional: true },
      { group: "Audio", name: "Printmaster 7.1", spec: { audio: "7.1", format: "WAV 24-bit 48 kHz" } },
      { group: "Audio", name: "Printmaster 5.1", spec: { audio: "5.1", format: "WAV 24-bit 48 kHz" } },
      { group: "Audio", name: "Stereo (distribusi biasa)", spec: { audio: "Stereo", format: "WAV 24-bit 48 kHz" } },
      { group: "Audio", name: "DME", spec: { audio: "DME", format: "WAV 24-bit 48 kHz" } },
      { group: "Audio", name: "Stems", spec: { audio: "Stems", format: "WAV 24-bit 48 kHz" } },
      { group: "Audio", name: "M&E 5.1", spec: { audio: "M&E 5.1", format: "WAV 24-bit 48 kHz" } },
      { group: "Musik", name: "File seluruh musik (score & source)", spec: { format: "WAV 24-bit 48 kHz" } },
      { group: "Musik", name: "Music cue list", spec: { format: "XLSX" } },
      { group: "Teks", name: "Subtitle Indonesia", spec: { language: "Indonesia", format: "SRT" } },
      { group: "Teks", name: "Subtitle English", spec: { language: "English", format: "SRT" } },
      { group: "Dokumen & pendukung", name: "QC report", spec: { format: "PDF" } },
    ],
  },
  {
    id: "promo", platform: "Bioskop", label: "Materi promo (trailer / teaser / first look)", specVersion: "Tim 2026-11", verifiedAt: "2026-11-11",
    source: [{ label: "Kebutuhan tim post (brief supervisor)" }],
    note: "Untuk track promo yang deliver lebih dulu dari filmnya. Versi ratio lain dibuat lewat matriks cutdown.",
    rules: [],
    items: [
      { group: "Master gambar", name: "DPX sequence (sumber DCP)", spec: { ...master, format: "DPX sequence 16-bit", dynamicRange: "DCI-P3" } },
      { group: "Master gambar", name: "ProRes master — texted", spec: { ...master, format: "ProRes 4444 XQ", version: "Texted" } },
      { group: "Master gambar", name: "ProRes master — textless", spec: { ...master, format: "ProRes 4444 XQ", version: "Textless" } },
      { group: "Turunan gambar", name: "MP4 16:9", spec: { resolution: "1920x1080 (HD)", aspectRatio: "16:9", format: "MP4 H.264" } },
      { group: "Audio", name: "Mix 5.1", spec: { audio: "5.1", format: "WAV 24-bit 48 kHz" } },
      { group: "Audio", name: "Mix stereo", spec: { audio: "Stereo", format: "WAV 24-bit 48 kHz" } },
      { group: "Teks", name: "Subtitle English", spec: { language: "English", format: "SRT" }, optional: true },
    ],
  },
  {
    id: "netflix", platform: "Netflix", label: "Netflix Originals", specVersion: "IMF spec v5.1", verifiedAt: "2026-11-11",
    source: [
      { label: "Netflix IMF spec v5.1", url: "https://backlothelp.netflix.com/hc/en-us/articles/7262346654995" },
      { label: "Dolby Vision HDR Mastering Guidelines", url: "https://backlothelp.netflix.com/hc/en-us/articles/360000599948-Dolby-Vision-HDR-Mastering-Guidelines" },
      { label: "Sound Mix Specifications", url: "https://backlothelp.netflix.com/hc/en-us/articles/360001794307-Netflix-Sound-Mix-Specifications-Best-Practices-v1-5" },
    ],
    note: "Daftar inti dari halaman spec Netflix; daftar lengkap per judul ada di Backlot. Item pendukung (M&E, timed text, cue sheet) belum dicek ke spec resmi.",
    rules: [
      "Original HDR dimaster dalam Dolby Vision dan dikirim sebagai Dolby Vision IMF; stream HDR10 dan SDR diturunkan Netflix.",
      "Jika Atmos ada di dalam IMF, mix 5.1 dan stereo opsional.",
      "Mix theatrical Atmos membutuhkan dua set deliverable: theatrical dan near-field.",
    ],
    items: [
      { group: "Master gambar", name: "Dolby Vision IMF — texted", spec: { resolution: "3840x2160 (UHD)", format: "IMF (App 2E)", dynamicRange: "Dolby Vision", version: "Texted" } },
      { group: "Master gambar", name: "IMF textless (jika diminta)", spec: { resolution: "3840x2160 (UHD)", format: "IMF (App 2E)", version: "Textless" }, optional: true },
      { group: "Audio", name: "Atmos near-field printmaster", spec: { audio: "Dolby Atmos", format: "BWAV ADM" } },
      { group: "Audio", name: "Printmaster 5.1 near-field", spec: { audio: "5.1", format: "WAV 24-bit 48 kHz" }, optional: true },
      { group: "Audio", name: "Printmaster 2.0 near-field", spec: { audio: "Stereo", format: "WAV 24-bit 48 kHz" }, optional: true },
      { group: "Audio", name: "M&E", spec: { audio: "M&E 5.1", format: "WAV 24-bit 48 kHz" } },
      { group: "Teks", name: "Timed text bahasa asli", spec: { language: "Indonesia", format: "IMSC 1.1 / TTML" } },
      { group: "Dokumen & pendukung", name: "Music cue sheet", spec: { format: "XLSX" } },
      { group: "Diturunkan platform", name: "Stream HDR10", spec: { dynamicRange: "HDR10" }, origin: "derived" },
      { group: "Diturunkan platform", name: "Stream SDR", spec: { dynamicRange: "SDR Rec.709" }, origin: "derived" },
    ],
  },
  {
    id: "prime", platform: "Prime Video", label: "Prime Video", specVersion: "Tech Docs 2026", verifiedAt: "2026-11-11",
    source: [
      { label: "Video requirements", url: "https://videocentral.amazon.com/support/delivery-experience/videos/video-requirements" },
      { label: "Dolby Vision & Atmos requirements", url: "https://videocentral.amazon.com/support/de_DE/dolby-delivery" },
      { label: "Audio", url: "https://videocentral.amazon.com/support/delivery-experience/audio" },
      { label: "Timed text", url: "https://videocentral.amazon.com/support/delivery-experience/timed-text" },
    ],
    note: "Spec per judul tetap diminta dari kontak Amazon.",
    rules: [
      "Dolby Vision dikirim sebagai pasangan dua file: UHD SDR ProRes 422 HQ dan master HDR ProRes 4444/4444 XQ dengan sidecar XML.",
      "Trailer tidak didukung dalam pengiriman Dolby Vision.",
      "Paket multi-bahasa: mezzanine harus semi-textless; tiap bahasa adalah aset audio terpisah.",
      "Timed text harus sudah conform dengan durasi video.",
    ],
    items: [
      { group: "Master gambar", name: "Mezzanine UHD SDR", spec: { resolution: "3840x2160 (UHD)", format: "ProRes 422 HQ", dynamicRange: "SDR Rec.709", version: "Semi-textless" } },
      { group: "Master gambar", name: "Master HDR + Dolby Vision sidecar XML", spec: { resolution: "3840x2160 (UHD)", format: "ProRes 4444 XQ", dynamicRange: "Dolby Vision" }, optional: true },
      { group: "Audio", name: "Audio 5.1 bahasa asli", spec: { audio: "5.1", language: "Indonesia", format: "WAV 24-bit 48 kHz" } },
      { group: "Audio", name: "Audio stereo bahasa asli", spec: { audio: "Stereo", language: "Indonesia", format: "WAV 24-bit 48 kHz" } },
      { group: "Teks", name: "Timed text Indonesia", spec: { language: "Indonesia", format: "IMSC 1.1 / TTML" } },
      { group: "Teks", name: "Timed text English", spec: { language: "English", format: "IMSC 1.1 / TTML" } },
    ],
  },
  {
    id: "ott-generic", platform: "Disney+", label: "OTT lain (Disney+, Vidio, dll.) — kerangka umum", specVersion: "Kerangka", verifiedAt: null,
    source: [{ label: "Spec sheet per judul dari platform (tidak publik)" }],
    note: "Platform ini tidak mempublikasikan spec. Ini kerangka umum; sesuaikan dengan spec sheet yang Anda terima, lalu ubah nama platform di tiap item bila perlu.",
    rules: [],
    items: [
      { group: "Master gambar", name: "Video master", spec: { ...master, version: "Texted" } },
      { group: "Master gambar", name: "Video master textless", spec: { ...master, version: "Textless" } },
      { group: "Audio", name: "Mix 5.1", spec: { audio: "5.1" } },
      { group: "Audio", name: "Mix stereo", spec: { audio: "Stereo" } },
      { group: "Audio", name: "M&E", spec: { audio: "M&E 5.1" } },
      { group: "Teks", name: "Subtitle / timed text", spec: { language: "Indonesia" } },
      { group: "Dokumen & pendukung", name: "QC report", spec: { format: "PDF" } },
      { group: "Dokumen & pendukung", name: "Music cue sheet", spec: { format: "XLSX" } },
    ],
  },
  {
    id: "youtube", platform: "YouTube", label: "YouTube / web video", specVersion: "Upload settings", verifiedAt: null,
    source: [{ label: "YouTube recommended upload encoding settings", url: "https://support.google.com/youtube/answer/1722171" }],
    note: "Angka bitrate resmi belum dicek. Versi durasi dan ratio dibuat lewat matriks cutdown.",
    rules: [],
    items: [
      { group: "Master gambar", name: "Upload master", spec: { ...master, format: "MP4 H.264", dynamicRange: "SDR Rec.709", audio: "Stereo" } },
      { group: "Teks", name: "Subtitle / CC", spec: { language: "Indonesia", format: "SRT" } },
      { group: "Dokumen & pendukung", name: "Thumbnail" },
    ],
  },
];

export const getPreset = (id: string) => PRESETS.find((p) => p.id === id);

/** Replaces "@key" placeholders with values from the Technical Page (dropped when the page has none). */
export function resolveSpec(spec: PresetItem["spec"], tech: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec ?? {})) {
    const value = v.startsWith("@") ? (tech[v.slice(1)] ?? "") : v;
    if (value) out[k] = value;
  }
  return out;
}
