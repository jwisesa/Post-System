import { BARS75, COLOR_NOTE, MEMORY, PATCH24, PRIMARIES100, RAMP } from "@/lib/framing/colors";

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
export const onColor = (hex: string) => (lum(hex) > 0.5 ? "#111111" : "#ffffff");

type Cell = { label: string; hex: string };
/** Horizontal strip of equal cells; all coordinates whole pixels. */
function Row({ cells, x, y, w, h, font, mono, ink }: { cells: Cell[]; x: number; y: number; w: number; h: number; font: number; mono: string; ink: string }) {
  const cw = Math.floor(w / cells.length);
  return (
    <g>
      {cells.map((c, i) => (
        <g key={i}>
          <rect x={x + i * cw} y={y} width={cw} height={h} fill={c.hex} shapeRendering="crispEdges" />
          <text x={x + i * cw + cw / 2} y={y + h / 2 + font * 0.35} fontSize={font} textAnchor="middle" fill={onColor(c.hex)} fontFamily={mono} textRendering="geometricPrecision">{c.label}</text>
        </g>
      ))}
      <rect x={x} y={y} width={cw * cells.length} height={h} fill="none" stroke={ink} strokeWidth={Math.max(1, Math.round(font / 14))} shapeRendering="crispEdges" />
    </g>
  );
}

/** Grayscale ramp + 75% bars + 100% primaries + skin/memory patches. Returns total height via `colorBarsHeight`. */
export const colorBarsHeight = (rh: number, font: number) => rh * 4 + Math.round(rh * 0.2) * 3 + Math.round(font * 1.7);
export function ColorBars({ x, y, w, rh, font, mono, ink }: { x: number; y: number; w: number; rh: number; font: number; mono: string; ink: string }) {
  const gap = Math.round(rh * 0.2);
  const rows = [RAMP, BARS75, PRIMARIES100, MEMORY];
  return (
    <g>
      {rows.map((cells, i) => <Row key={i} cells={cells} x={x} y={y + i * (rh + gap)} w={w} h={rh} font={font} mono={mono} ink={ink} />)}
      <text x={x} y={y + 4 * rh + 3 * gap + font * 1.25} fontSize={font * 0.85} fill={ink} fontFamily={mono} textRendering="geometricPrecision">Ramp 0–100 · 75% bars · 100% R G B C M Y · skin · {COLOR_NOTE}</text>
    </g>
  );
}

/** 24-patch reference, 6 x 4. cell = square patch size. */
export function Patch24({ x, y, cell, mono, ink, font }: { x: number; y: number; cell: number; mono: string; ink: string; font: number }) {
  const gap = Math.max(2, Math.round(cell * 0.06));
  return (
    <g>
      {PATCH24.map((hex, i) => <rect key={i} x={x + (i % 6) * (cell + gap)} y={y + Math.floor(i / 6) * (cell + gap)} width={cell} height={cell} fill={hex} shapeRendering="crispEdges" />)}
      <text x={x} y={y + 4 * (cell + gap) + font * 1.1} fontSize={font * 0.85} fill={ink} fontFamily={mono} textRendering="geometricPrecision">24-patch reference · {COLOR_NOTE}</text>
    </g>
  );
}
