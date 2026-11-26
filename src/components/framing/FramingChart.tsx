import { deliveryRect, fitBlock, framing, placeGuideLabels, resolutions, safeRect, textW, type Spec } from "@/lib/framing/frame";
import { Patch24, ColorBars, colorBarsHeight } from "./ColorChart";

const GUIDE = ["#c25e00", "#0a6fa8", "#237a3b", "#c2255c", "#6741d9", "#8a6d00"];
const DEL = ["#0b6e99", "#b4540a", "#2f7d32", "#8e2f7a"];
const MONO_EM = 0.62;
type Pal = { out: string; band: string; bandInk: string; paper: string; ink: string; mark: string; grid: string; gridMajor: string };
const PAL: Record<string, Pal> = {
  minimal: { out: "#2b2b2b", band: "#707070", bandInk: "#ffffff", paper: "#c4c4c4", ink: "#111111", mark: "#a31c1c", grid: "", gridMajor: "" },
  blueprint: { out: "#0d1b2a", band: "#3d5a73", bandInk: "#ffffff", paper: "#dce7ef", ink: "#0b2a44", mark: "#d9480f", grid: "#c4d4e0", gridMajor: "#9db6c8" },
  slate: { out: "#161616", band: "#595959", bandInk: "#ffffff", paper: "#e7e2d6", ink: "#141414", mark: "#141414", grid: "", gridMajor: "" },
};
const R = Math.round;

function star(cx: number, cy: number, r: number, n = 24) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i * 2 * Math.PI) / n, a1 = a0 + Math.PI / n, f = (v: number) => +v.toFixed(2);
    d += `M${f(cx)} ${f(cy)}L${f(cx + r * Math.cos(a0))} ${f(cy + r * Math.sin(a0))}L${f(cx + r * Math.cos(a1))} ${f(cy + r * Math.sin(a1))}Z`;
  }
  return d;
}
/** Triangle with its base on (x,y) pointing in direction (dx,dy), size t. */
function tri(x: number, y: number, dx: number, dy: number, t: number) {
  const px = -dy, py = dx;
  return `${x + px * t},${y + py * t} ${x - px * t},${y - py * t} ${x + dx * t * 1.5},${y + dy * t * 1.5}`;
}

/** Pure SVG; viewBox = output canvas pixels (sensor, or desqueezed width), so rasterising at width W gives exactly the canvas size.
 *  Line weights and type scale with the framing diagonal; orthogonal geometry is crispEdges on whole pixels. */
export function FramingChart({ spec, fonts, svgRef, fill }: { spec: Spec; fonts: { text: string; mono: string }; svgRef?: React.Ref<SVGSVGElement>; fill?: boolean }) {
  const { W, H, layers: L } = spec, on = (k: string) => L.includes(k);
  const P = PAL[spec.style] ?? PAL.blueprint, bp = spec.style === "blueprint", sl = spec.style === "slate";
  const sq = spec.desq ? 1 : spec.squeeze, d = framing(W, H, spec.ar, sq);
  const crop = on("f") ? spec.crop : 0, c = safeRect(d, crop);
  const u = Math.sqrt(d.w * d.h) / 3456; // 1 unit = 1px on a 4608x2592 frame
  const fs = (n: number) => R(n * u), sw = Math.max(2, R(3 * u)), hair = Math.max(1, R(u * 1.5));
  const cx = W / 2, cy = H / 2, t = fs(40);
  const sr = R(Math.min(c.w, c.h) * 0.06), inset = R(sr * 1.35), T = P.ink;
  const info = spec.info, maxW = R(c.w * 0.42), res = resolutions(spec, d);
  const mono = fonts.mono, text = fonts.text;
  const body = bp ? mono : text, em = bp ? MONO_EM : undefined;

  const rows: [string, string][] = ([
    ["Recorded image resolution", res.recorded], ["Active image resolution", res.active + (spec.desq ? ` · ${res.activeDesq} desqueezed` : "")],
    ...(spec.desq ? [["Output canvas", res.canvas]] : []),
    ["Sensor mode", spec.mode + (spec.codec ? ` · ${spec.codec}` : "")],
    ["Aspect ratio", spec.arLabel + (spec.squeeze !== 1 ? ` · ${spec.squeeze}x squeeze${spec.desq ? " (desqueezed)" : ""}` : "")],
    ["Frame rate", `${spec.fps} fps`], ["DoP", info.dop], ["Director", info.director], ["Production", info.production],
  ] as [string, string][]).filter(([, v]) => v);
  const cam = spec.camera + (info.unit ? ` · ${info.unit}` : "");

  // chip: solid backing instead of text halos (crisp edges, no soft outline)
  const chip = (x: number, y: number, s: string, o: { anchor?: "start" | "middle" | "end"; size?: number; fill?: string; ink?: string; stroke?: string; font?: string; weight?: number } = {}) => {
    const size = o.size ?? fs(36), f = o.font ?? mono, w = R(textW(s, size, f === mono ? MONO_EM : 0.52) + size * 0.9), h = R(size * 1.6), a = o.anchor ?? "start";
    const x0 = a === "start" ? x : a === "end" ? x - w : x - w / 2;
    return (
      <g key={s + x + y}>
        <rect x={R(x0)} y={R(y - h * 0.72)} width={w} height={h} fill={o.fill ?? P.paper} stroke={o.stroke ?? "none"} strokeWidth={hair} shapeRendering="crispEdges" />
        <text x={R(x0 + w / 2)} y={y} fontSize={size} textAnchor="middle" fill={o.ink ?? T} fontFamily={f} fontWeight={o.weight} textRendering="geometricPrecision">{s}</text>
      </g>
    );
  };
  const lab = (x: number, y: number, s: string, anchor: "start" | "middle" | "end" = "start") => sl
    ? chip(x, y, s, { anchor, fill: T, ink: "#fff" })
    : <text key={s + x + y} x={x} y={y} fontSize={fs(36)} textAnchor={anchor} fill={T} fontFamily={mono} textRendering="geometricPrecision">{s}</text>;

  // ---- text block (centre) ----
  const titleText = info.title || info.project || "Framing chart";
  const tf = fitBlock([titleText], fs(150), maxW, 0.6), pf = fitBlock([info.project.toUpperCase()], fs(52), maxW);
  const bf = fitBlock([cam, ...rows.map(([k, v]) => `${k}: ${v}`), ...(info.notes ? [info.notes] : [])], fs(60), maxW, 0.7, em);
  const flat = bf.lines.flat();
  const cc = spec.cc, bars = cc === "bars" || cc === "both", p24 = cc === "24" || cc === "both";
  const rh = R(c.h * 0.036), cf = Math.min(fs(30), R(rh * 0.5));
  const chartH = bars ? colorBarsHeight(rh, cf) : 0;
  const bottomEdge = c.y + c.h - inset - fs(55), chartTop = bottomEdge - chartH;
  const top = cy + fs(120), avail = (bars ? chartTop - fs(40) : c.y + c.h - inset * 0.7) - top;
  const lh = Math.min(bf.size * 1.45, avail / (flat.length + 0.4)), bodySize = Math.min(bf.size, lh / 1.25);
  const tlh = tf.size * 1.15, titleBase = R(cy - fs(120) - (tf.lines[0].length - 1) * tlh);

  // ---- guides / delivery ----
  const gr = spec.guides.map((g) => ({ ...g, r: framing(W, H, g.ar, sq) }));
  const gl = placeGuideLabels(gr.map((g) => g.r.y), fs(60));
  const labelled = new Map(gl.map((x) => [x.i, x]));
  const dels = spec.delivery.map((g, i) => ({ ...g, ...deliveryRect(d, g.w, g.h, sq === 1 ? 1 : sq), col: DEL[i % DEL.length] }));
  const hMark = [0.1, 0.5, 0.9];
  const stars = [[c.x + inset, c.y + inset], [c.x + c.w - inset, c.y + inset], [c.x + inset, c.y + c.h - inset], [c.x + c.w - inset, c.y + c.h - inset]] as const;
  const lx0 = c.x + inset + sr + fs(26), lx1 = c.x + c.w - inset - sr - fs(26), ty = c.y + inset + fs(12), by = c.y + c.h - inset + fs(12);

  // ---- info list (left-middle) ----
  const listX = c.x + inset + fs(90), listW = R(cx - maxW / 2 - fs(50) - listX);
  const lrows: [string, string][] = [["Recorded", res.recorded], ["Active", res.active], ...(spec.desq ? [["Canvas", res.canvas] as [string, string]] : []), ["Safe area", crop ? `${c.w} × ${c.h} · crop ${crop}%` : "100% of active"], ...dels.map((g) => [g.label, `${R(g.rect.w)} × ${g.rect.h}`] as [string, string])];
  const lf = fitBlock(lrows.map(([k, v]) => `${k} ${v}`), fs(46), listW - fs(40), 0.6, MONO_EM);
  const lsz = lf.size, lrh = R(lsz * 2.5), listH = lrows.length * lrh + R(lsz * 1.6), listY = R(cy - listH / 2);
  const showList = on("i") && listW > c.w * 0.12;

  // ---- 24 patch (right-middle) ----
  const px0 = cx + maxW / 2 + fs(60), pw = c.x + c.w - inset - fs(100) - px0, gapP = 0.06;
  const cell = Math.min(R(pw / (6 * (1 + gapP))), R(c.h * 0.11));
  const show24 = p24 && cell > fs(26);
  const p24x = R(px0 + (pw - 6 * cell * (1 + gapP)) / 2), p24y = R(cy - (4 * cell * (1 + gapP)) / 2);

  const dimLine = (x1: number, y1: number, x2: number, y2: number, label: string) => {
    const vert = x1 === x2, a = fs(26), size = fs(34), len = vert ? y2 - y1 : x2 - x1, gap = textW(label, size, MONO_EM) + size, mid = (vert ? y1 : x1) + len / 2;
    const seg = (s: number, e: number) => (vert ? `M${x1} ${s}V${e}` : `M${s} ${y1}H${e}`);
    const s0 = vert ? y1 : x1, e0 = vert ? y2 : x2, arrow = (p: number, dir: 1 | -1) => (vert ? `${x1 - a / 2},${p + dir * a} ${x1 + a / 2},${p + dir * a} ${x1},${p}` : `${p + dir * a},${y1 - a / 2} ${p + dir * a},${y1 + a / 2} ${p},${y1}`);
    return (
      <g key={label}>
        <path d={seg(s0, mid - gap / 2) + seg(mid + gap / 2, e0)} stroke={T} strokeWidth={hair} fill="none" shapeRendering="crispEdges" />
        <polygon points={arrow(s0, 1)} fill={T} /><polygon points={arrow(e0, -1)} fill={T} />
        <text x={vert ? x1 : mid} y={vert ? mid : y1 + size * 0.35} fontSize={size} textAnchor="middle" fill={T} fontFamily={mono} textRendering="geometricPrecision" transform={vert ? `rotate(-90 ${x1} ${mid}) translate(0 ${size * 0.35})` : undefined}>{label}</text>
      </g>
    );
  };

  let gridD = "", gridMD = "";
  if (bp) {
    const g = Math.max(8, R(Math.min(c.w, c.h) / 24));
    for (let i = 1, x = c.x + g; x < c.x + c.w; x += g, i++) { const seg = `M${x} ${c.y}v${c.h}`; if (i % 4 === 0) gridMD += seg; else gridD += seg; }
    for (let i = 1, y = c.y + g; y < c.y + c.h; y += g, i++) { const seg = `M${c.x} ${y}h${c.w}`; if (i % 4 === 0) gridMD += seg; else gridD += seg; }
  }
  const stripeH = fs(46), stripeN = 14;
  const panel = (x: number, y: number, w: number, h: number) => (bp || sl) && <rect x={R(x)} y={R(y)} width={R(w)} height={R(h)} fill={P.paper} stroke={T} strokeWidth={hair} shapeRendering="crispEdges" />;

  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Framing chart ${spec.camera} ${spec.mode}, ${spec.arLabel}`}
      style={fill ? { display: "block", width: "100%", height: "100%" } : { display: "block", width: "100%", height: "auto" }} textRendering="geometricPrecision">
      <rect width={W} height={H} fill={P.out} shapeRendering="crispEdges" />
      <rect x={d.x} y={d.y} width={d.w} height={d.h} fill={crop ? P.band : P.paper} shapeRendering="crispEdges" />
      {crop > 0 && <rect x={c.x} y={c.y} width={c.w} height={c.h} fill={P.paper} shapeRendering="crispEdges" />}
      {bp && <g shapeRendering="crispEdges" fill="none"><path d={gridD} stroke={P.grid} strokeWidth={hair} /><path d={gridMD} stroke={P.gridMajor} strokeWidth={hair} /></g>}
      {on("t") && <path shapeRendering="crispEdges" d={`M${R(c.x + c.w / 3)} ${c.y}v${c.h}M${R(c.x + (2 * c.w) / 3)} ${c.y}v${c.h}M${c.x} ${R(c.y + c.h / 3)}h${c.w}M${c.x} ${R(c.y + (2 * c.h) / 3)}h${c.w}`} stroke={T} strokeOpacity=".35" strokeWidth={hair} />}
      {on("g") && gr.map((g, i) => {
        const col = GUIDE[i % GUIDE.length], lb = labelled.get(i);
        const x = lb ? R(lb.side ? cx + c.w * 0.2 : cx - c.w * 0.2) : 0;
        return (
          <g key={g.label + i}>
            <rect x={g.r.x} y={g.r.y} width={g.r.w} height={g.r.h} fill="none" stroke={col} strokeWidth={sw} strokeDasharray={lb ? undefined : `${fs(30)} ${fs(14)}`} shapeRendering="crispEdges" />
            {lb && lb.tick && <line x1={x} y1={g.r.y} x2={x} y2={R(lb.y)} stroke={col} strokeWidth={sw} shapeRendering="crispEdges" />}
            {lb && chip(x + (lb.side ? fs(8) : -fs(8)), R(lb.y + fs(48)), g.label, { anchor: lb.side ? "start" : "end", size: fs(42), ink: col, font: text, weight: 600 })}
          </g>
        );
      })}
      {on("f") && crop > 0 && (
        <g>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="none" stroke={T} strokeWidth={hair} strokeDasharray={`${fs(24)} ${fs(14)}`} shapeRendering="crispEdges" />
          {(() => { const bh = c.y - d.y, size = Math.min(fs(40), R(bh * 0.55)); return size >= fs(16) ? <text x={d.x + fs(30)} y={R(d.y + bh / 2 + size * 0.35)} fontSize={size} fill={P.bandInk} fontFamily={text} fontWeight={600} letterSpacing={size * 0.04} textRendering="geometricPrecision">Safety Crop – {crop}%</text> : null; })()}
        </g>
      )}
      {on("d") && dels.map((g, i) => (
        <g key={g.id}>
          <rect x={g.rect.x} y={g.rect.y} width={g.rect.w} height={g.rect.h} fill="none" stroke={g.col} strokeWidth={sw} strokeDasharray={`${fs(44)} ${fs(20)}`} shapeRendering="crispEdges" />
          {chip(R(cx), R(c.y + inset * 0.55 + fs(28) + i * fs(66)), `Max crop for ${g.label} delivery – ${g.w} × ${g.h} · ${g.upscale ? `UPSCALE ${g.scale.toFixed(2)}x` : `${g.scale.toFixed(2)}x`} of ${R(g.srcW)} px active`, { anchor: "middle", size: fs(34), ink: g.upscale ? "#a31c1c" : T, stroke: g.col })}
        </g>
      ))}
      <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="none" stroke="#ffffff" strokeWidth={sw} shapeRendering="crispEdges" />
      {on("c") && <g fill="none" stroke={P.mark} strokeWidth={sw}><path shapeRendering="crispEdges" d={`M${R(cx - fs(70))} ${R(cy)}h${fs(140)}M${R(cx)} ${R(cy - fs(70))}v${fs(140)}`} /><circle cx={cx} cy={cy} r={fs(36)} /></g>}
      {on("s") && stars.map(([x, y], i) => (
        <g key={i}>
          {sl && <rect x={R(x - sr * 1.12)} y={R(y - sr * 1.12)} width={R(sr * 2.24)} height={R(sr * 2.24)} fill="none" stroke={T} strokeWidth={sw} shapeRendering="crispEdges" />}
          <circle cx={x} cy={y} r={sr} fill="#fff" />
          <path d={star(x, y, sr, sl ? 36 : 24)} fill="#111" shapeRendering="geometricPrecision" />
          <circle cx={x} cy={y} r={sr * 0.08} fill="#fff" />
          {bp && <path shapeRendering="crispEdges" d={`M${R(x - sr * 1.35)} ${R(y)}h${R(sr * 0.2)}M${R(x + sr * 1.15)} ${R(y)}h${R(sr * 0.2)}M${R(x)} ${R(y - sr * 1.35)}v${R(sr * 0.2)}M${R(x)} ${R(y + sr * 1.15)}v${R(sr * 0.2)}`} stroke={P.mark} strokeWidth={sw} />}
        </g>
      ))}
      {on("m") && (
        <g>
          {d.y > 0 && hMark.map((k) => <polygon key={"wt" + k} points={tri(R(d.x + d.w * k), 0, 0, 1, t)} fill="#fff" />)}
          {d.y > 0 && hMark.map((k) => <polygon key={"wb" + k} points={tri(R(d.x + d.w * k), H, 0, -1, t)} fill="#fff" />)}
          {d.x > 0 && hMark.map((k) => <polygon key={"wl" + k} points={tri(0, R(d.y + d.h * k), 1, 0, t)} fill="#fff" />)}
          {d.x > 0 && hMark.map((k) => <polygon key={"wr" + k} points={tri(W, R(d.y + d.h * k), -1, 0, t)} fill="#fff" />)}
          {hMark.map((k) => <polygon key={"rt" + k} points={tri(R(c.x + c.w * k), c.y, 0, 1, t)} fill={P.mark} />)}
          {hMark.map((k) => <polygon key={"rb" + k} points={tri(R(c.x + c.w * k), c.y + c.h, 0, -1, t)} fill={P.mark} />)}
          {hMark.map((k) => <polygon key={"rl" + k} points={tri(c.x, R(c.y + c.h * k), 1, 0, t)} fill={P.mark} />)}
          {hMark.map((k) => <polygon key={"rr" + k} points={tri(c.x + c.w, R(c.y + c.h * k), -1, 0, t)} fill={P.mark} />)}
        </g>
      )}
      {on("l") && (bp ? (
        <g>
          {dimLine(R(lx0), R(c.y + inset), R(lx1), R(c.y + inset), `ACTIVE ${res.active.split(" × ")[0]} px`)}
          {dimLine(R(lx0), R(c.y + c.h - inset), R(lx1), R(c.y + c.h - inset), `CANVAS ${W} × ${H}`)}
          {dimLine(R(c.x + inset), R(c.y + inset + sr + fs(30)), R(c.x + inset), R(c.y + c.h - inset - sr - fs(30)), `${d.h} px`)}
          {dimLine(R(c.x + c.w - inset), R(c.y + inset + sr + fs(30)), R(c.x + c.w - inset), R(c.y + c.h - inset - sr - fs(30)), `${spec.mm[0]} × ${spec.mm[1]} mm`)}
        </g>
      ) : (
        <g>
          {lab(lx0, ty, `Canvas ${W} × ${H}`)}
          {lab(lx1, ty, `Active ${res.active}`, "end")}
          {lab(lx0, by, `Anchor ${Math.round(d.x)}, ${Math.round(d.y)}`)}
          {lab(lx1, by, `${spec.mm[0]} × ${spec.mm[1]} mm`, "end")}
        </g>
      ))}
      {on("i") && showList && (
        <g fontFamily={mono}>
          {panel(listX, listY, listW, listH)}
          {sl && <rect x={R(listX)} y={listY} width={R(listW)} height={R(lsz * 1.6)} fill={T} shapeRendering="crispEdges" />}
          <text x={listX + lsz * 0.6} y={R(listY + lsz * 1.1)} fontSize={lsz * 0.8} fill={sl ? "#fff" : T} fontWeight={600} letterSpacing={lsz * 0.12} textRendering="geometricPrecision">{bp ? "TITLE BLOCK" : "RESOLUTION"}</text>
          {lrows.map(([k, v], i) => {
            const y0 = R(listY + lsz * 1.6 + i * lrh);
            return (
              <g key={k}>
                {(bp || sl) && <line x1={R(listX)} x2={R(listX + listW)} y1={y0} y2={y0} stroke={T} strokeWidth={hair} shapeRendering="crispEdges" />}
                <text x={listX + lsz * 0.6} y={R(y0 + lsz * 0.85)} fontSize={lsz * 0.7} fill={T} fillOpacity={0.75} letterSpacing={lsz * 0.08} textRendering="geometricPrecision">{k.toUpperCase()}</text>
                <text x={listX + lsz * 0.6} y={R(y0 + lsz * 1.95)} fontSize={lsz} fill={T} fontWeight={600} textRendering="geometricPrecision">{v}</text>
              </g>
            );
          })}
        </g>
      )}
      {on("x") && (
        <g fontFamily={body} textAnchor="middle" fill={T}>
          {sl && (
            <g>
              <clipPath id="stripes"><rect x={R(cx - maxW / 2)} y={R(titleBase - tf.size * 1.1 - stripeH - fs(10))} width={maxW} height={stripeH} /></clipPath>
              <rect x={R(cx - maxW / 2)} y={R(titleBase - tf.size * 1.1 - stripeH - fs(10))} width={maxW} height={stripeH} fill="#f2b705" shapeRendering="crispEdges" />
              <g clipPath="url(#stripes)" fill="#141414">{Array.from({ length: stripeN * 2 }, (_, i) => { const sx = cx - maxW / 2 + (i - 2) * (maxW / stripeN), y1 = titleBase - tf.size * 1.1 - fs(10), w = maxW / stripeN / 2; return <polygon key={i} points={`${sx},${y1} ${sx + w},${y1} ${sx + w - stripeH},${y1 - stripeH} ${sx - stripeH},${y1 - stripeH}`} />; })}</g>
            </g>
          )}
          {info.title && info.project && <text x={cx} y={R(titleBase - tf.size * 1.2)} fontSize={pf.size} fill={T} letterSpacing={pf.size * 0.12}>{pf.lines[0].join(" ")}</text>}
          {bp && <path shapeRendering="crispEdges" d={`M${R(cx - maxW / 2)} ${R(titleBase - tf.size * 1.0)}h${R(maxW)}M${R(cx - maxW / 2)} ${R(titleBase + (tf.lines[0].length - 1) * tlh + tf.size * 0.35)}h${R(maxW)}`} stroke={T} strokeWidth={hair} />}
          {tf.lines[0].map((ln, i) => <text key={i} x={cx} y={R(titleBase + i * tlh)} fontSize={tf.size} fontWeight={600} letterSpacing={-tf.size * 0.01} fontFamily={bp ? text : body}>{ln}</text>)}
          {flat.map((ln, i) => {
            const k = i === 0 ? "" : ln.indexOf(": ");
            return (
              <text key={i} x={cx} y={R(top + (i + 0.6) * lh)} fontSize={bodySize} fontWeight={i === 0 ? 600 : 400} letterSpacing={bodySize * 0.02}>
                {k === "" || k < 0 ? ln : <><tspan>{ln.slice(0, k + 2)}</tspan><tspan fontWeight={600}>{ln.slice(k + 2)}</tspan></>}
              </text>
            );
          })}
        </g>
      )}
      {bars && <ColorBars x={R(cx - maxW / 2)} y={R(chartTop)} w={maxW} rh={rh} font={cf} mono={mono} ink={T} />}
      {show24 && <Patch24 x={p24x} y={p24y} cell={cell} mono={mono} ink={T} font={cf} />}
    </svg>
  );
}
