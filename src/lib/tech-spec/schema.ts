// The Technical Page: one technical source of truth per project.
// Every field offers prepared options and still accepts a custom value.

export type TechField = { key: string; label: string; options: string[]; hint?: string; only?: "digital" | "film" };
export type TechSection = { key: string; title: string; fields: TechField[] };

const f = (key: string, label: string, options: string[] = [], hint?: string): TechField => ({ key, label, options, hint });
const only = (kind: "digital" | "film", x: TechField): TechField => ({ ...x, only: kind });
export const FILM_MEDIA = ["Film 35mm", "Film Super 16", "Film 16mm", "Film 65mm", "Film Super 8"];
/** True when a camera's "Media rekam" value is a film format. */
export const isFilm = (media?: string) => (media ?? "").trim().toLowerCase().startsWith("film");
/** Fields of a camera that apply to its media (digital-only fields hide for film, film-only for digital/empty). */
export const fieldApplies = (x: TechField, media?: string) => !x.only || (x.only === "film") === isFilm(media);
const notes = (key: string): TechField => f(key === "general" ? "notes" : `${key}_notes`, "Catatan");

export const MAX_CAMERAS = 4;
/** Camera slot n (1..4). Camera 1 keeps the legacy key `sourceFormat` for its recording format. */
const camFields = (n: number): TechField[] => [
  f(`cam${n}_model`, "Kamera", ["ARRI Alexa 35", "ARRI Alexa Mini LF", "ARRI Alexa Mini", "RED V-Raptor", "RED Komodo", "Sony Venice 2", "Sony FX6", "Sony FX3", "Sony FX9", "Blackmagic URSA Mini Pro 12K", "Blackmagic Pocket 6K", "Canon C300 III", "Canon C70", "Panasonic S1H", "ARRICAM ST", "ARRICAM LT", "ARRIFLEX 435", "ARRIFLEX 235", "ARRIFLEX 416", "ARRI SR3", "Aaton XTR Prod", "Aaton Penelope", "Panavision Millennium XL2", "Panaflex Gold II", "Bolex H16", "Krasnogorsk-3", "Beaulieu 4008"]),
  f(`cam${n}_media`, "Media rekam", ["Digital", ...FILM_MEDIA], "Kosong = digital"),
  only("digital", f(`cam${n}_res`, "Resolusi & mode sensor", ["4.6K 3:2 Open Gate", "4K UHD", "4K DCI", "6K", "2.8K", "2K", "1920x1080"], "Mode sensor yang dipakai merekam")),
  f(`cam${n}_fps`, "Frame rate rekam", ["23.976", "24", "25", "29.97", "50", "59.94", "120"], "Untuk film: kecepatan kamera (fps)"),
  only("digital", f(n === 1 ? "sourceFormat" : `cam${n}_format`, "Format rekam / codec", ["ARRIRAW", "ARRI ProRes 4444 XQ", "REDCODE RAW (R3D)", "Sony X-OCN", "Sony XAVC", "Blackmagic RAW", "Canon Cinema RAW Light", "ProRes 422 HQ", "H.264 / H.265"])),
  only("digital", f(`cam${n}_cs`, "Colorspace / gamma rekam", ["ARRI LogC3 / AWG3", "ARRI LogC4 / AWG4", "REDWideGamutRGB / Log3G10", "Sony S-Log3 / S-Gamut3.Cine", "Blackmagic Film Gen 5", "Canon Log 3 / Cinema Gamut", "Rec.709"])),
  only("film", f(`cam${n}_stock`, "Film stock", ["Kodak Vision3 50D 5203/7203", "Kodak Vision3 250D 5207/7207", "Kodak Vision3 200T 5213/7213", "Kodak Vision3 500T 5219/7219", "Eastman Double-X 5222/7222", "Kodak Ektachrome 100D 5294/7294"])),
  only("film", f(`cam${n}_perf`, "Perforasi / format frame", ["2-perf", "3-perf", "4-perf", "Super 16", "Regular 16", "5-perf 65mm", "15-perf IMAX", "Super 8"])),
  only("film", f(`cam${n}_ratio`, "Aspect ratio / ground glass", ["2.39:1", "1.85:1", "1.78:1", "1.66:1", "1.33:1"])),
  only("film", f(`cam${n}_process`, "Processing", ["Normal", "Push 1", "Push 2", "Pull 1", "Bleach bypass", "Cross process"])),
  only("film", f(`cam${n}_lab`, "Film lab")),
  only("film", f(`cam${n}_scanner`, "Scanner", ["ARRISCAN XT", "Scanity HDR", "Lasergraphics ScanStation", "Lasergraphics Director", "Blackmagic Cintel", "DFT Spirit"])),
  only("film", f(`cam${n}_scanres`, "Resolusi scan", ["2K", "3.2K", "4K", "6.5K"])),
  only("film", f(`cam${n}_scanfmt`, "Format file scan", ["DPX 10-bit log", "DPX 16-bit", "EXR 16-bit"])),
  only("film", f(`cam${n}_scancs`, "Colour encoding scan", ["Cineon log", "ADX10 (ACES)", "ADX16 (ACES)", "Scanner-native log"])),
  only("film", f(`cam${n}_keycode`, "Frame count / keycode", ["Keycode di header DPX", "ALE + keycode", "Tidak ada"])),
  only("film", f(`cam${n}_negative`, "Penyimpanan / pengembalian negatif", [], "Mis. disimpan di lab, dikembalikan ke produksi")),
];
/** Keys of camera n, in the order shown in the form. */
export const cameraKeys = (n: number) => camFields(n).map((x) => x.key);

const CODECS_PROXY = ["ProRes 422 Proxy", "ProRes 422 LT", "DNxHR LB", "DNxHR SQ", "H.264"];
const RES = ["4096x2160 (4K DCI)", "3840x2160 (UHD)", "2048x1080 (2K DCI)", "1920x1080 (HD)"];
const COLOR_SYS = ["ACEScct", "ACEScc", "DaVinci Wide Gamut / Intermediate", "ARRI LogC3 / AWG3", "ARRI LogC4 / AWG4", "Rec.709 Gamma 2.4"];

export const TECH_SECTIONS: TechSection[] = [
  {
    key: "camera",
    title: "Kamera",
    fields: [
      f("cam_primary", "Kamera utama", ["1", "2", "3", "4"], "Nomor kamera (1-4) yang jadi acuan project"),
      ...Array.from({ length: MAX_CAMERAS }, (_, i) => camFields(i + 1)).flat(),
      notes("camera"),
    ],
  },
  {
    key: "sound_set",
    title: "Suara di lokasi",
    fields: [
      f("sound_recorder", "Recorder", ["Sound Devices 833", "Sound Devices 888", "Sound Devices MixPre-10 II", "Zoom F8n Pro", "Zoom F6", "Zaxcom Nomad"]),
      f("sound_lav", "Lavalier", ["Sanken COS-11D", "DPA 4060", "Lectrosonics SMQV", "Rode Lavalier GO"], "Pisahkan dengan koma bila lebih dari satu"),
      f("sound_boom", "Boom mic", ["Sennheiser MKH 416", "Sennheiser MKH 50", "Schoeps CMIT 5U", "Rode NTG3"], "Pisahkan dengan koma bila lebih dari satu"),
      f("sound_tc_fps", "Frame rate timecode suara", ["23.976", "24", "25", "29.97 NDF"]),
      f("sound_file", "Format file", ["Poly BWAV", "Mono BWAV"]),
      f("sound_rate_depth", "Sample rate / bit depth", ["48 kHz / 24-bit", "48 kHz / 32-bit float", "96 kHz / 24-bit"]),
      f("sound_sync", "Metode sync timecode", ["Timecode generator (Tentacle / Ambient)", "Jam sync di tiap kamera", "Slate / clapper saja", "Wireless timecode"]),
      notes("sound_set"),
    ],
  },
  {
    key: "data",
    title: "Data & backup",
    fields: [
      f("dit_software", "Software offload", ["Silverstack", "Hedge", "ShotPut Pro", "Offload Manager", "Resolve (clone tool)"]),
      f("dit_checksum", "Checksum", ["xxHash64", "xxHash128", "MD5", "SHA-1"]),
      f("dit_manifest", "Manifest", ["ASC MHL", "Report PDF saja", "Tidak ada"]),
      f("dit_backup1", "Backup 1", ["RAID di lokasi", "SSD", "HDD"]),
      f("dit_backup2", "Backup 2", ["HDD terpisah", "LTO", "Cloud"]),
      f("dit_archive", "Arsip akhir", ["LTO-8", "LTO-9", "RAID di kantor", "Cloud (S3 / Glacier)"]),
      notes("data"),
    ],
  },
  {
    key: "color_set",
    title: "Warna di lokasi",
    fields: [
      f("onset_system", "Sistem warna di lokasi", ["Livegrade", "Pomfort", "Resolve Live", "FSI / Teradek (LUT box)", "Tanpa"]),
      f("onset_monitor_cs", "Colorspace monitor lokasi", ["Rec.709", "P3-D65", "Rec.2020"], "Pisahkan dengan koma bila lebih dari satu"),
      f("onset_pipeline", "Color pipeline", ["ACES 1.3", "ACES 2.0", "Camera native + LUT", "DaVinci Wide Gamut"]),
      f("onset_lut", "Jenis LUT", ["Show LUT 3D (.cube)", "Camera LUT bawaan", "CDL + LUT"]),
      f("onset_handover", "Serah terima warna ke post", ["CDL + LUT", "LUT saja", "AMF", "Tidak ada"]),
      notes("color_set"),
    ],
  },
  {
    key: "dailies",
    title: "Dailies",
    fields: [
      f("dailies_system", "Sistem transcode", ["DaVinci Resolve", "Colorfront Express Dailies", "Silverstack Lab", "Assimilate Scratch"], "Untuk kamera film: dailies dari scan lab"),
      f("dailies_by", "Dibuat oleh", ["DIT di lokasi", "Lab", "Post house", "Editor"]),
      f("dailies_pipeline", "Color pipeline dailies", ["Show LUT (camera log ke Rec.709)", "ACES", "CDL dari lokasi"]),
      f("dailies_review", "Platform review", ["Frame.io", "Google Drive", "Vimeo", "Pix", "Hard drive"]),
      f("dailies_sync", "Proses sync audio", ["Auto sync timecode (Resolve)", "Auto sync waveform", "Manual oleh asisten editor"]),
      notes("dailies"),
    ],
  },
  {
    key: "offline",
    title: "Offline edit",
    fields: [
      f("nle", "NLE offline", ["DaVinci Resolve", "Adobe Premiere Pro", "Final Cut Pro", "Avid Media Composer"]),
      f("softwareVersion", "Versi software", [], "Mis. Resolve 20.1"),
      f("proxyCodec", "Codec proxy / offline", CODECS_PROXY),
      f("offline_res", "Resolusi offline", ["1920x1080 (HD)", "1280x720", "2048x1080 (2K DCI)", "3840x2160 (UHD)"]),
      f("offline_framing", "Framing ke editor", ["Full frame", "Crop sesuai aspect ratio", "Crop + safe area"], "Apakah editor menerima gambar penuh atau sudah dipotong"),
      f("startTimecode", "Start timecode", ["01:00:00:00", "00:59:52:00", "10:00:00:00", "00:00:00:00"]),
      notes("offline"),
    ],
  },
  {
    key: "vfx",
    title: "VFX",
    fields: [
      f("vfxPlateFormat", "Format plate", ["OpenEXR 16-bit half (ACES AP0)", "OpenEXR 16-bit half (camera native)", "DPX 10-bit Log", "ProRes 4444 XQ"]),
      f("vfx_pull_res", "Resolusi plate", RES),
      f("vfx_pull_cs", "Colorspace plate", ["ACES AP0 linear", "ACEScct", "Camera native log", "Rec.709"]),
      f("vfx_compress", "Kompresi EXR", ["PIZ", "ZIP", "ZIPS", "DWAA", "DWAB", "Tanpa"]),
      f("handles", "Handles (frame)", ["8", "12", "16", "24"]),
      f("vfx_start_frame", "Start frame number", ["1001", "0001", "1"]),
      f("vfx_comp", "Software compositing", ["Nuke", "After Effects", "Fusion (Resolve)", "Flame", "Blender"]),
      f("vfx_return_res", "Resolusi kiriman VFX", RES),
      f("fileNaming", "Konvensi nama file", [], "Mis. PRJ_REEL01_v003_20261111"),
      f("shotNaming", "Konvensi nama shot", [], "Mis. PRJ_SC012_SH0030"),
      notes("vfx"),
    ],
  },
  {
    key: "graphics",
    title: "Grafis & titling",
    fields: [
      f("gfx_res", "Resolusi grafis", RES),
      f("gfx_cs", "Colorspace grafis", ["Rec.709", "sRGB", "P3-D65", "Sama dengan working color space"]),
      notes("graphics"),
    ],
  },
  {
    key: "grade",
    title: "Conform & grading",
    fields: [
      f("grade_system", "Sistem grading", ["DaVinci Resolve Studio", "Baselight", "Nucoda", "Autodesk Flame"]),
      f("conform_system", "Sistem conform", ["DaVinci Resolve Studio", "Baselight", "Avid Media Composer", "Premiere Pro"]),
      f("conform_workflow", "Alur conform", ["XML + referensi video", "AAF + referensi video", "EDL + referensi video", "Satu project (round trip)"]),
      f("workingResolution", "Resolusi kerja", RES),
      f("workingColorSpace", "Working color space", COLOR_SYS),
      f("lut", "LUT / look", [], "Nama show LUT atau link"),
      f("grade_output", "Output transform", ["ACES Output Rec.709", "ACES Output P3-D65", "ACES Output Rec.2020 PQ", "DaVinci CST", "Tanpa (manual)"]),
      f("hdr_format", "Format HDR", ["Tanpa HDR", "HDR10", "Dolby Vision 4.0", "Dolby Vision 5.1", "HLG"]),
      f("hdr_nits", "Mastering nit", ["100 (SDR)", "600", "1000", "4000"]),
      f("onlineCodec", "Codec online / intermediate", ["Camera original", "ProRes 4444 XQ", "ProRes 4444", "DPX 10-bit", "DPX 16-bit", "OpenEXR (ACES)", "DNxHR 444"]),
      notes("grade"),
    ],
  },
  {
    key: "sound_post",
    title: "Sound post",
    fields: [
      f("audioMix", "Konfigurasi mix", ["Stereo 2.0", "5.1", "7.1", "Dolby Atmos", "5.1 + Stereo", "7.1 + 5.1 + Stereo", "Atmos + 5.1 + Stereo"], "Pisahkan dengan koma bila format mix lebih dari satu"),
      f("audioFormat", "Sample rate / bit depth", ["48 kHz / 24-bit", "48 kHz / 16-bit", "96 kHz / 24-bit"]),
      f("mix_system", "Sistem mixing", ["Pro Tools", "Nuendo", "Reaper", "Fairlight (Resolve)", "Logic Pro"]),
      f("fold_down", "Metode fold-down stereo", ["Dolby Atmos Renderer", "Downmix manual oleh mixer", "Plugin (Dolby / Nugen)"], "Cara membuat stereo dari mix 5.1 / Atmos"),
      f("loudness", "Standar loudness", ["Theatrical (85 dB SPL ref)", "-27 LKFS dialog-gated (Netflix)", "-24 LKFS (ATSC A/85)", "-23 LUFS (EBU R128)", "-14 LUFS (YouTube / online)"]),
      f("audio_meter", "Meter loudness", ["Dolby Atmos Renderer", "Nugen VisLM", "iZotope Insight", "Waves WLM"]),
      notes("sound_post"),
    ],
  },
  {
    key: "master",
    title: "Master & delivery",
    fields: [
      f("masterResolution", "Resolusi master", ["4096x1716 (4K Scope)", "3996x2160 (4K Flat)", "4096x2160 (4K DCI)", "3840x2160 (UHD)", "2048x858 (2K Scope)", "1998x1080 (2K Flat)", "1920x1080 (HD)", "1080x1920 (Vertical)"]),
      f("frameRate", "Frame rate", ["23.976", "24", "25", "29.97", "30", "50", "59.94", "60"]),
      f("aspectRatio", "Aspect ratio", ["2.39:1", "2.35:1", "2:1", "1.85:1", "16:9", "4:3", "9:16", "1:1", "4:5"]),
      f("masterTarget", "Target master", ["SDR Rec.709 Gamma 2.4", "DCI-P3 (Theatrical)", "P3-D65", "HDR10 (Rec.2020 PQ)", "Dolby Vision (P3-D65 PQ)", "HLG"]),
      f("deliver_format", "Format delivery", ["DCP (SMPTE, 2K / 4K)", "IMF", "ProRes 4444 XQ", "ProRes 422 HQ", "H.264 / H.265 (online)"], "Pisahkan dengan koma bila lebih dari satu"),
      notes("master"),
    ],
  },
  { key: "general", title: "Catatan umum", fields: [f("notes", "Catatan teknis lain")] },
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
  const common = { audioFormat: "48 kHz / 24-bit", sound_rate_depth: "48 kHz / 24-bit", startTimecode: "01:00:00:00" };
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
