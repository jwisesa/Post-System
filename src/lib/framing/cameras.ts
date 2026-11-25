/** Framing chart data. Every number carries its source; modes that could not be verified are omitted rather than guessed. */
export type Source = { url: string; title: string; accessed: "2026-11-26" };
export type Mode = { id: string; label: string; px: [number, number]; mm: [number, number]; codecs?: string[]; source: Source; derived?: boolean };
export type Camera = { id: string; brand: string; name: string; kind: "digital"; modes: Mode[]; squeeze?: number[]; source: Source };

const src = (url: string, title: string): Source => ({ url, title, accessed: "2026-11-26" });
const ARRI35 = src("https://www.arri.com/en/camera-systems/cameras/alexa-35", "ARRI ALEXA 35 technical data");
const ARRI35P = src("https://www.Arri.com/resource/blob/296424/88454a5a3dee9fe1d3fd68e75aa3411e/alexa-35-recording-format-poster-data.pdf", "ARRI ALEXA 35 recording format poster data");
const ARRILF = src("https://www.arri.com/en/camera-systems/cameras/alexa-mini-lf", "ARRI ALEXA Mini LF technical data");
const SONY = src("https://pro.sony/ue_US/products/digital-cinema-cameras/venice-2", "Sony VENICE 2 (US listing, 8.6K 3:2 mode)");
const RED = src("https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR.htm", "RED V-RAPTOR Technical Specifications");
const KOMODO = src("https://docs.red.com/955-0196_v1.6/Content/A_TechSpecs/Specs_KOMODO_6K.htm", "RED KOMODO 6K Technical Specifications");
const BMD = src("https://www.blackmagicdesign.com/products/blackmagiccinemacamera/techspecs/W-CIN-23", "Blackmagic Cinema Camera 6K tech specs");
const URSA = src("https://www.blackmagicdesign.com/products/blackmagicursaminipro/techspecs/W-CIN-14", "Blackmagic URSA Mini Pro tech specs");

/** mm for a full-width/height crop of a verified sensor: same pitch, so mm scales with pixels. Flagged `derived`. */
const crop = (id: string, label: string, px: [number, number], full: { px: [number, number]; mm: [number, number] }, source: Source, codecs?: string[]): Mode => ({
  id, label, px, codecs, source, derived: true,
  mm: [+((full.mm[0] * px[0]) / full.px[0]).toFixed(2), +((full.mm[1] * px[1]) / full.px[1]).toFixed(2)],
});
const BMD6 = { px: [6048, 4032] as [number, number], mm: [36, 24] as [number, number] };
const RAPTOR = { px: [8192, 4320] as [number, number], mm: [40.96, 21.6] as [number, number] };
const KOM = { px: [6144, 3240] as [number, number], mm: [27.03, 14.26] as [number, number] };
const U12 = { px: [12288, 6480] as [number, number], mm: [27.03, 14.25] as [number, number] };
const U46 = { px: [4608, 2592] as [number, number], mm: [25.34, 14.25] as [number, number] };
const m = (id: string, label: string, px: [number, number], mm: [number, number], source: Source, codecs?: string[]): Mode => ({ id, label, px, mm, source, codecs });

export const CAMERAS: Camera[] = [
  { id: "arri-alexa-35", brand: "ARRI", name: "ALEXA 35", kind: "digital", source: ARRI35, squeeze: [1, 1.3, 2],
    modes: [
      m("og", "4.6K 3:2 Open Gate", [4608, 3164], [27.99, 19.22], ARRI35P, ["ARRIRAW", "Apple ProRes"]),
      m("169", "4.6K 16:9", [4608, 2592], [28, 15.7], ARRI35),
      m("4k169", "4K 16:9", [4096, 2304], [24.88, 14], ARRI35P),
      m("4k2", "4K 2:1", [4096, 2048], [24.88, 12.44], ARRI35P),
      m("38", "3.8K 16:9", [3840, 2160], [23.3, 13.1], ARRI35),
      m("33", "3.3K 6:5", [3328, 2790], [20.22, 16.95], ARRI35),
      m("3k", "3K 1:1", [3072, 3072], [18.7, 18.7], ARRI35),
      m("27", "2.7K 8:9", [2743, 3086], [16.7, 18.7], ARRI35),
      m("s16", "2K 16:9 S16", [2048, 1152], [12.44, 7], ARRI35P),
    ] },
  { id: "arri-mini-lf", brand: "ARRI", name: "ALEXA Mini LF", kind: "digital", source: ARRILF, squeeze: [1, 1.3, 2],
    modes: [
      m("og", "4.5K LF 3:2 Open Gate", [4448, 3096], [36.7, 25.54], ARRILF, ["ARRIRAW"]),
      m("239", "4.5K LF 2.39:1", [4448, 1856], [36.7, 15.31], ARRILF),
      m("43", "4.3K LF 16:9", [4320, 2430], [35.64, 20.05], ARRILF),
      m("169", "3.8K LF 16:9", [3840, 2160], [31.68, 17.82], ARRILF),
      m("11", "2.8K LF 1:1", [2880, 2880], [23.76, 23.76], ARRILF),
      m("s35", "3.4K S35 3:2", [3424, 2202], [28.25, 18.16], ARRILF),
      m("s169", "3.2K S35 16:9", [3200, 1800], [26.4, 14.85], ARRILF),
      m("s43", "2.8K S35 4:3", [2880, 2160], [23.76, 17.81], ARRILF),
      m("s28", "2.8K S35 16:9", [2880, 1620], [23.76, 13.36], ARRILF),
    ] },
  { id: "sony-venice-2", brand: "Sony", name: "VENICE 2 (8.6K)", kind: "digital", source: SONY, squeeze: [1, 1.3],
    modes: [m("86", "8.6K 3:2", [8640, 5760], [35.9, 24], SONY)] },
  { id: "red-v-raptor", brand: "RED", name: "V-RAPTOR 8K VV", kind: "digital", source: RED, squeeze: [1, 1.3],
    modes: [
      m("8k", "8K 17:9", [8192, 4320], [40.96, 21.6], RED, ["REDCODE RAW"]),
      crop("8k24", "8K 2.4:1", [8192, 3456], RAPTOR, RED, ["REDCODE RAW"]),
    ] },
  { id: "red-komodo", brand: "RED", name: "KOMODO 6K", kind: "digital", source: KOMODO, squeeze: [1, 1.3],
    modes: [
      m("6k", "6K 17:9", [6144, 3240], [27.03, 14.26], KOMODO, ["REDCODE RAW"]),
      crop("6k24", "6K 2.4:1", [6144, 2592], KOM, KOMODO, ["REDCODE RAW"]),
    ] },
  { id: "bmd-cc6k", brand: "Blackmagic", name: "Cinema Camera 6K", kind: "digital", source: BMD, squeeze: [1, 1.3],
    modes: [
      m("og", "6K 3:2 Open Gate", [6048, 4032], [36, 24], BMD, ["Blackmagic RAW"]),
      crop("65", "Anamorphic 6:5", [4832, 4032], BMD6, BMD, ["Blackmagic RAW"]),
      crop("dci", "6K DCI 17:9", [6048, 3200], BMD6, BMD, ["Blackmagic RAW"]),
      crop("24", "6K 2.4:1", [6048, 2520], BMD6, BMD, ["Blackmagic RAW"]),
      crop("s35", "Super 35 4:3", [4096, 3072], BMD6, BMD, ["Blackmagic RAW"]),
    ] },
  { id: "bmd-ursa-12k", brand: "Blackmagic", name: "URSA Mini Pro 12K", kind: "digital", source: URSA, squeeze: [1, 1.3],
    modes: [
      m("dci", "12K DCI 17:9", [12288, 6480], [27.03, 14.25], URSA, ["Blackmagic RAW"]),
      crop("169", "12K 16:9", [11520, 6480], U12, URSA, ["Blackmagic RAW"]),
      crop("24", "12K 2.4:1", [12288, 5112], U12, URSA, ["Blackmagic RAW"]),
    ] },
  { id: "bmd-ursa-46", brand: "Blackmagic", name: "URSA Mini Pro 4.6K G2", kind: "digital", source: URSA, squeeze: [1, 1.3],
    modes: [
      m("169", "4.6K 16:9", [4608, 2592], [25.34, 14.25], URSA, ["Blackmagic RAW"]),
      crop("24", "4.6K 2.4:1", [4608, 1920], U46, URSA, ["Blackmagic RAW"]),
    ] },
];

export type Gate = { id: string; label: string; mm: [number, number]; verified: boolean; source: Source; note?: string };
export type FilmFormat = { id: string; label: string; fpf: number; gates: Gate[] };
const KODAK = src("https://www.kodak.com/content/products-brochures/Film/Film-Format-Choices-Infographic.pdf", "Kodak Film Format Choices (capture areas)");
const NFSA = src("https://nfsa.gov.au/preservation/preservation-glossary/film-formats", "NFSA film formats glossary");
const ACAD = src("https://www.nfsa.gov.au/preservation/preservation-glossary/academy-frame", "NFSA Academy frame (22.05 x 16.03 mm)");
const g = (id: string, label: string, mm: [number, number], source: Source, verified = true, note?: string): Gate => ({ id, label, mm, source, verified, note });

/** fpf = frames per foot (perf pitch is a physical constant: 64/perfs for 35mm, 40 for 16mm, 12.8 for 65mm 5-perf).
 *  Gate sizes: Kodak's published capture areas are the primary reference. Sources disagree by hundredths of a mm
 *  (3-perf 24.89x13.87 vs Kodak 24.90x13.90; Super 16 12.52x7.41 vs Kodak 12.42x7.44); Kodak is used and the others are noted. */
export const FILM: FilmFormat[] = [
  { id: "35-4", label: "35mm 4-perf", fpf: 16, gates: [
    g("full", "Full Aperture / Super 35", [24.9, 18.7], KODAK), g("academy", "Academy", [21.95, 16], ACAD, false, "Sumber berbeda: 21.95 x 16.00 vs NFSA 22.05 x 16.03 mm.")] },
  { id: "35-3", label: "35mm 3-perf", fpf: 64 / 3, gates: [g("s35", "Super 35", [24.9, 13.9], KODAK, true, "SMPTE ST 59 menyebut tinggi 13.87 mm; Kodak 13.90 mm dipakai.")] },
  { id: "35-2", label: "35mm 2-perf", fpf: 32, gates: [g("tech", "2-perf", [24.9, 9.9], KODAK)] },
  { id: "16", label: "16mm", fpf: 40, gates: [
    g("std", "Standard 16", [10.26, 7.49], NFSA), g("s16", "Super 16", [12.42, 7.44], KODAK, true, "Sumber sekunder menulis 12.52 x 7.41 mm; Kodak dipakai.")] },
  { id: "65-5", label: "65mm 5-perf", fpf: 12.8, gates: [g("65", "65mm 5-perf", [52.15, 23.07], KODAK)] },
];
