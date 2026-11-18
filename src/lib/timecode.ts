/** Frame-rate aware timecode maths. 23.976 -> base 24; 29.97 DF -> base 30 drop; 59.94 DF -> base 60 drop. */

export type Rate = { fps: number; base: number; drop: boolean };

const r = (fps: number, base: number, drop = false): Rate => ({ fps, base, drop });
export const RATES: { id: string; label: string; rate: Rate }[] = [
  { id: "23.976", label: "23,976 fps", rate: r(24000 / 1001, 24) },
  { id: "24", label: "24 fps", rate: r(24, 24) },
  { id: "25", label: "25 fps", rate: r(25, 25) },
  { id: "29.97df", label: "29,97 fps drop-frame", rate: r(30000 / 1001, 30, true) },
  { id: "29.97", label: "29,97 fps non-drop", rate: r(30000 / 1001, 30) },
  { id: "30", label: "30 fps", rate: r(30, 30) },
  { id: "48", label: "48 fps", rate: r(48, 48) },
  { id: "50", label: "50 fps", rate: r(50, 50) },
  { id: "59.94df", label: "59,94 fps drop-frame", rate: r(60000 / 1001, 60, true) },
  { id: "59.94", label: "59,94 fps non-drop", rate: r(60000 / 1001, 60) },
  { id: "60", label: "60 fps", rate: r(60, 60) },
];

/** Frame numbers skipped at the start of every minute except each tenth. */
export const skip = (x: Rate) => (x.drop ? (x.base === 60 ? 4 : 2) : 0);

/** `HH:MM:SS:FF` (`;` or `:` before FF) to a frame count; null when the label does not exist at this rate. */
export function tcToFrames(tc: string, x: Rate): number | null {
  const m = tc.trim().match(/^(\d+):(\d{2}):(\d{2})[:;.](\d{2})$/);
  if (!m) return null;
  const [h, mi, s, f] = m.slice(1).map(Number);
  if (h > 23 || mi > 59 || s > 59 || f >= x.base) return null;
  const d = skip(x);
  if (d && s === 0 && f < d && mi % 10 !== 0) return null;
  const mins = h * 60 + mi;
  return (mins * 60 + s) * x.base + f - d * (mins - Math.floor(mins / 10));
}

export function framesToTc(n: number, x: Rate): string {
  let f = Math.max(0, Math.round(n));
  const d = skip(x);
  if (d) {
    const per10 = x.base * 600 - 9 * d;
    const perMin = x.base * 60 - d;
    const tens = Math.floor(f / per10);
    const rest = f % per10;
    f += 9 * d * tens + (rest > d ? d * Math.floor((rest - d) / perMin) : 0);
  }
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(Math.floor(f / (x.base * 3600)) % 24)}:${p(Math.floor(f / (x.base * 60)) % 60)}:${p(Math.floor(f / x.base) % 60)}${x.drop ? ";" : ":"}${p(f % x.base)}`;
}

/** Real time to frames. */
export const secondsToFrames = (s: number, x: Rate) => Math.round(s * x.fps);
