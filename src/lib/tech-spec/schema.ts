// The Technical Page: one technical source of truth per project.
// Every field offers prepared options and still accepts a custom value.

export type TechField = { key: string; label: string; options: string[]; hint?: string };
export type TechSection = { title: string; fields: TechField[] };

export const TECH_SECTIONS: TechSection[] = [
  {
    title: "Gambar",
    fields: [
      { key: "sourceFormat", label: "Kamera / format sumber", options: ["ARRIRAW", "ARRI ProRes 4444 XQ", "REDCODE RAW (R3D)", "Sony X-OCN", "Sony XAVC", "Blackmagic RAW", "Canon Cinema RAW Light", "ProRes 422 HQ", "H.264 / H.265"] },
      { key: "workingResolution", label: "Resolusi kerja", options: ["4096x2160 (4K DCI)", "3840x2160 (UHD)", "2048x1080 (2K DCI)", "1920x1080 (HD)"] },
      { key: "masterResolution", label: "Resolusi master", options: ["4096x1716 (4K Scope)", "3996x2160 (4K Flat)", "4096x2160 (4K DCI)", "3840x2160 (UHD)", "2048x858 (2K Scope)", "1998x1080 (2K Flat)", "1920x1080 (HD)", "1080x1920 (Vertical)"] },
      { key: "frameRate", label: "Frame rate", options: ["23.976", "24", "25", "29.97", "30", "50", "59.94", "60"] },
      { key: "aspectRatio", label: "Aspect ratio", options: ["2.39:1", "2.35:1", "2:1", "1.85:1", "16:9", "4:3", "9:16", "1:1", "4:5"] },
      { key: "workingColorSpace", label: "Working color space", options: ["ACEScct", "ACEScc", "DaVinci Wide Gamut / Intermediate", "ARRI LogC3 / AWG3", "ARRI LogC4 / AWG4", "Rec.709 Gamma 2.4"] },
      { key: "masterTarget", label: "Target master", options: ["SDR Rec.709 Gamma 2.4", "DCI-P3 (Theatrical)", "P3-D65", "HDR10 (Rec.2020 PQ)", "Dolby Vision (P3-D65 PQ)", "HLG"] },
      { key: "lut", label: "LUT / look", options: [], hint: "Nama show LUT atau link" },
    ],
  },
  {
    title: "Audio",
    fields: [
      { key: "audioMix", label: "Konfigurasi mix", options: ["Stereo 2.0", "5.1", "7.1", "Dolby Atmos", "5.1 + Stereo", "7.1 + 5.1 + Stereo", "Atmos + 5.1 + Stereo"] },
      { key: "audioFormat", label: "Sample rate / bit depth", options: ["48 kHz / 24-bit", "48 kHz / 16-bit", "96 kHz / 24-bit"] },
      { key: "loudness", label: "Standar loudness", options: ["Theatrical (85 dB SPL ref)", "-27 LKFS dialog-gated (Netflix)", "-24 LKFS (ATSC A/85)", "-23 LUFS (EBU R128)", "-14 LUFS (YouTube / online)"] },
    ],
  },
  {
    title: "Workflow",
    fields: [
      { key: "nle", label: "NLE offline", options: ["DaVinci Resolve", "Adobe Premiere Pro", "Final Cut Pro", "Avid Media Composer"] },
      { key: "softwareVersion", label: "Versi software", options: [], hint: "Mis. Resolve 20.1" },
      { key: "proxyCodec", label: "Codec proxy / offline", options: ["ProRes 422 Proxy", "ProRes 422 LT", "DNxHR LB", "DNxHR SQ", "H.264"] },
      { key: "onlineCodec", label: "Codec online / intermediate", options: ["Camera original", "ProRes 4444 XQ", "ProRes 4444", "DPX 10-bit", "DPX 16-bit", "OpenEXR (ACES)", "DNxHR 444"] },
      { key: "vfxPlateFormat", label: "Format plate VFX", options: ["OpenEXR 16-bit half (ACES AP0)", "OpenEXR 16-bit half (camera native)", "DPX 10-bit Log", "ProRes 4444 XQ"] },
      { key: "startTimecode", label: "Start timecode", options: ["01:00:00:00", "00:59:52:00", "10:00:00:00", "00:00:00:00"] },
      { key: "handles", label: "Handles (frame)", options: ["8", "12", "16", "24"] },
      { key: "fileNaming", label: "Konvensi nama file", options: [], hint: "Mis. PRJ_REEL01_v003_20261111" },
      { key: "shotNaming", label: "Konvensi nama shot", options: [], hint: "Mis. PRJ_SC012_SH0030" },
    ],
  },
  {
    title: "Catatan",
    fields: [{ key: "notes", label: "Catatan teknis lain", options: [] }],
  },
];

export const TECH_FIELDS: TechField[] = TECH_SECTIONS.flatMap((s) => s.fields);
const KEYS = new Set(TECH_FIELDS.map((f) => f.key));

export type TechSpec = Record<string, string>;

/** Keeps known keys only, trims, drops empties. */
export function parseTechSpec(input: Record<string, unknown>): TechSpec {
  const out: TechSpec = {};
  for (const [k, v] of Object.entries(input)) {
    if (!KEYS.has(k) || typeof v !== "string") continue;
    const value = v.trim().slice(0, 500);
    if (value) out[k] = value;
  }
  return out;
}

export const PRODUCTION_TYPES = [
  { value: "feature_theatrical", label: "Film bioskop" },
  { value: "feature_ott", label: "Film OTT" },
  { value: "series_ott", label: "Series OTT" },
  { value: "series_youtube", label: "Series YouTube" },
  { value: "web_series", label: "Web series / web video" },
  { value: "digital_ad", label: "Digital advertisement" },
] as const;

export type ProductionType = (typeof PRODUCTION_TYPES)[number]["value"];

export const PLATFORMS = ["Bioskop", "Netflix", "Disney+", "Prime Video", "Vidio", "YouTube", "Meta", "TikTok", "TV Broadcast"];

/** Starting values per production type; everything stays editable. */
export function defaultTechSpec(type: string): TechSpec {
  const common = { audioFormat: "48 kHz / 24-bit", startTimecode: "01:00:00:00" };
  switch (type) {
    case "feature_theatrical":
      return { ...common, frameRate: "24", aspectRatio: "2.39:1", masterResolution: "4096x1716 (4K Scope)", masterTarget: "DCI-P3 (Theatrical)", audioMix: "7.1 + 5.1 + Stereo", loudness: "Theatrical (85 dB SPL ref)", onlineCodec: "DPX 16-bit" };
    case "feature_ott":
    case "series_ott":
      return { ...common, frameRate: "23.976", aspectRatio: "16:9", masterResolution: "3840x2160 (UHD)", masterTarget: "Dolby Vision (P3-D65 PQ)", audioMix: "Atmos + 5.1 + Stereo", loudness: "-27 LKFS dialog-gated (Netflix)" };
    case "digital_ad":
      return { ...common, frameRate: "25", aspectRatio: "16:9", masterResolution: "1920x1080 (HD)", masterTarget: "SDR Rec.709 Gamma 2.4", audioMix: "Stereo 2.0", loudness: "-14 LUFS (YouTube / online)", startTimecode: "00:00:00:00" };
    default:
      return { ...common, frameRate: "25", aspectRatio: "16:9", masterResolution: "3840x2160 (UHD)", masterTarget: "SDR Rec.709 Gamma 2.4", audioMix: "Stereo 2.0", loudness: "-14 LUFS (YouTube / online)" };
  }
}

export const DEFAULT_TEAM_GROUPS = ["Produksi", "Post Management", "Editing", "VFX", "Music", "Sound", "Grading / Online", "Lab / Mastering", "Subtitle / QC"];
