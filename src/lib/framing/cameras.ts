/** Framing chart data. Every number carries its source; modes that could not be verified are omitted rather than guessed. */
export type Source = { url: string; title: string; accessed: "2026-11-26" };
export type Mode = { id: string; label: string; px: [number, number]; mm: [number, number]; codecs?: string[]; source: Source };
export type Camera = { id: string; brand: string; name: string; kind: "digital"; modes: Mode[]; squeeze?: number[]; source: Source };

const src = (url: string, title: string): Source => ({ url, title, accessed: "2026-11-26" });
const ARRI35 = src("https://www.Arri.com/resource/blob/296424/88454a5a3dee9fe1d3fd68e75aa3411e/alexa-35-recording-format-poster-data.pdf", "ARRI ALEXA 35 recording format poster data");
const ARRILF = src("https://www.arri.com/en/camera-systems/cameras/alexa-mini-lf", "ARRI ALEXA Mini LF");
const SONY = src("https://pro.sony/ue_US/products/digital-cinema-cameras/venice-2", "Sony VENICE 2 (US listing, 8.6K 3:2 mode)");
const RED = src("https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR.htm", "RED V-RAPTOR Technical Specifications");
const BMD = src("https://www.blackmagicdesign.com/products/blackmagiccinemacamera/techspecs/W-CIN-23", "Blackmagic Cinema Camera 6K tech specs");

export const CAMERAS: Camera[] = [
  { id: "arri-alexa-35", brand: "ARRI", name: "ALEXA 35", kind: "digital", source: ARRI35, squeeze: [1, 1.3, 2],
    modes: [{ id: "og", label: "4.6K 3:2 Open Gate", px: [4608, 3164], mm: [27.99, 19.22], codecs: ["ARRIRAW", "Apple ProRes"], source: ARRI35 }] },
  { id: "arri-mini-lf", brand: "ARRI", name: "ALEXA Mini LF", kind: "digital", source: ARRILF, squeeze: [1, 1.3, 2],
    modes: [
      { id: "og", label: "4.5K LF 3:2 Open Gate", px: [4448, 3096], mm: [36.7, 25.54], codecs: ["ARRIRAW"], source: ARRILF },
      { id: "169", label: "3.8K LF 16:9", px: [3840, 2160], mm: [31.68, 17.82], source: ARRILF },
    ] },
  { id: "sony-venice-2", brand: "Sony", name: "VENICE 2 (8.6K)", kind: "digital", source: SONY, squeeze: [1, 1.3],
    modes: [{ id: "86", label: "8.6K 3:2", px: [8640, 5760], mm: [35.9, 24], source: SONY }] },
  { id: "red-v-raptor", brand: "RED", name: "V-RAPTOR 8K VV", kind: "digital", source: RED, squeeze: [1, 1.3],
    modes: [{ id: "8k", label: "8K 17:9", px: [8192, 4320], mm: [40.96, 21.6], codecs: ["REDCODE RAW"], source: RED }] },
  { id: "bmd-cc6k", brand: "Blackmagic", name: "Cinema Camera 6K", kind: "digital", source: BMD, squeeze: [1, 1.3],
    modes: [{ id: "og", label: "6K 3:2 Open Gate", px: [6048, 4032], mm: [36, 24], codecs: ["Blackmagic RAW"], source: BMD }] },
];

export type Gate = { id: string; label: string; mm: [number, number] };
export type FilmFormat = { id: string; label: string; fpf: number; gates: Gate[]; source: Source; verified: boolean };
const KODAK = src("https://www.kodak.com/content/products-brochures/Film/Film-Format-Choices-Infographic.pdf", "Kodak Film Format Choices");
const NFSA = src("https://www.nfsa.gov.au/technical-preservation-guides/handbook/what-is-film/film-identification", "NFSA film identification");
const MROB = src("https://mrob.com/pub/film-video/filmformats.html", "Film Formats (mrob.com), SMPTE gate figures");

/** fpf = frames per foot (perf pitch is a physical constant: 64/perfs for 35mm, 40 for 16mm, 12.8 for 65mm 5-perf). */
export const FILM: FilmFormat[] = [
  { id: "35-4", label: "35mm 4-perf", fpf: 16, source: NFSA, verified: true, gates: [
    { id: "full", label: "Full Aperture / Super 35", mm: [24.89, 18.66] }, { id: "academy", label: "Academy", mm: [21.95, 16] }] },
  { id: "35-3", label: "35mm 3-perf", fpf: 64 / 3, source: KODAK, verified: false, gates: [{ id: "s35", label: "Super 35", mm: [24.89, 13.87] }] },
  { id: "35-2", label: "35mm 2-perf", fpf: 32, source: MROB, verified: false, gates: [{ id: "tech", label: "2-perf (Techniscope)", mm: [21.95, 9.47] }] },
  { id: "16", label: "16mm", fpf: 40, source: MROB, verified: false, gates: [
    { id: "std", label: "Standard 16", mm: [10.26, 7.49] }, { id: "s16", label: "Super 16", mm: [12.52, 7.41] }] },
  { id: "65-5", label: "65mm 5-perf", fpf: 12.8, source: KODAK, verified: false, gates: [{ id: "65", label: "65mm 5-perf", mm: [52.48, 23.01] }] },
];
