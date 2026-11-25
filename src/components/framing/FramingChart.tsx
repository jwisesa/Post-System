import { fitBlock, framing, placeGuideLabels, safety, type Spec } from "@/lib/framing/frame";

const GUIDE = ["#c25e00", "#0a6fa8", "#237a3b", "#c2255c", "#6741d9", "#8a6d00"];
const RED = "#a31c1c";

function star(cx: number, cy: number, r: number, n = 24) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i * 2 * Math.PI) / n, a1 = a0 + Math.PI / n;
    d += `M${cx} ${cy}L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}L${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}Z`;
  }
  return d;
}
/** Triangle with its base on (x,y) pointing in direction (dx,dy), size t. */
function tri(x: number, y: number, dx: number, dy: number, t: number) {
  const px = -dy, py = dx;
  return `${x + px * t},${y + py * t} ${x - px * t},${y - py * t} ${x + dx * t * 1.5},${y + dy * t * 1.5}`;
}

/** Pure SVG; viewBox = sensor pixels, so rasterising at width W gives exactly the camera resolution. */
export function FramingChart({ spec, fonts, svgRef }: { spec: Spec; fonts: { text: string; mono: string }; svgRef?: React.Ref<SVGSVGElement> }) {
  const { W, H, layers: L } = spec, on = (k: string) => L.includes(k);
  const d = framing(W, H, spec.ar, spec.squeeze), sf = safety(d, spec.safety);
  const u = Math.sqrt(d.w * d.h) / 3456; // 1 unit = 1px on a 4608x2592 frame
  const cx = W / 2, cy = H / 2, sw = 3 * u, fs = (n: number) => n * u;
  const t = fs(40), sr = Math.min(d.w, d.h) * 0.06, inset = sr * 1.35;
  const info = spec.info, maxW = d.w * 0.6;
  const rows: [string, string][] = ([
    ["Sensor mode", spec.mode + (spec.codec ? ` · ${spec.codec}` : "")],
    ["Framing decision", `${d.w} × ${d.h}`], ["Aspect ratio", spec.arLabel + (spec.squeeze !== 1 ? ` · ${spec.squeeze}x squeeze` : "")],
    ["Frame rate", `${spec.fps} fps`], ["DoP", info.dop], ["Director", info.director], ["Production", info.production],
  ] as [string, string][]).filter(([, v]) => v);
  const cam = spec.camera + (info.unit ? ` · ${info.unit}` : "");
  const sm = (x: number, y: number, s: string, anchor: "start" | "middle" | "end" = "start") => (
    <text x={x} y={y} fontSize={fs(36)} textAnchor={anchor} fill="#111" stroke="#c4c4c4" strokeWidth={fs(6)} paintOrder="stroke" fontFamily={fonts.mono}>{s}</text>
  );
  // text block: shared fitted size, wraps only at the size floor
  const titleText = info.title || info.project || "Framing chart";
  const tf = fitBlock([titleText], fs(160), maxW), pf = fitBlock([info.project.toUpperCase()], fs(56), maxW);
  const bf = fitBlock([cam, ...rows.map(([k, v]) => `${k}: ${v}`), ...(info.notes ? [info.notes] : [])], fs(64), maxW);
  const flat = bf.lines.flat(), bodySize = bf.size;
  const top = cy + fs(110), bottom = d.y + d.h - inset * 0.6;
  const lh = Math.min(bodySize * 1.45, (bottom - top) / (flat.length + 0.6));
  const tlh = tf.size * 1.15;
  const titleBase = cy - fs(110) - (tf.lines[0].length - 1) * tlh;
  // guide labels
  const gr = spec.guides.map((g) => ({ ...g, r: framing(W, H, g.ar, spec.squeeze) }));
  const gl = placeGuideLabels(gr.map((g) => g.r.y), fs(54));
  const labelled = new Map(gl.map((x) => [x.i, x]));
  const hMark = [0.1, 0.5, 0.9];
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Framing chart ${spec.camera} ${spec.mode}, ${spec.arLabel}`} style={{ display: "block", width: "100%", height: "auto" }}>
      <rect width={W} height={H} fill="#2d2d2d" />
      <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="#c4c4c4" />
      {on("t") && <path d={`M${d.x + d.w / 3} ${d.y}v${d.h}M${d.x + (2 * d.w) / 3} ${d.y}v${d.h}M${d.x} ${d.y + d.h / 3}h${d.w}M${d.x} ${d.y + (2 * d.h) / 3}h${d.w}`} stroke="#000" strokeOpacity=".3" strokeWidth={sw / 2} />}
      {on("g") && gr.map((g, i) => {
        const c = GUIDE[i % GUIDE.length], lb = labelled.get(i);
        const x = lb ? (lb.side ? cx + d.w * 0.18 : cx - d.w * 0.18) : 0, anchor = lb?.side ? "start" : "end", ty = lb ? lb.y + fs(48) : 0;
        return (
          <g key={g.label + i}>
            <rect x={g.r.x} y={g.r.y} width={g.r.w} height={g.r.h} fill="none" stroke={c} strokeWidth={sw} strokeDasharray={lb ? undefined : `${fs(30)} ${fs(14)}`} />
            {lb && lb.tick && <line x1={x} y1={g.r.y} x2={x} y2={lb.y} stroke={c} strokeWidth={sw} />}
            {lb && <text x={x + (lb.side ? fs(8) : -fs(8))} y={ty} fontSize={fs(42)} textAnchor={anchor} fill={c} stroke="#c4c4c4" strokeWidth={fs(7)} paintOrder="stroke" fontFamily={fonts.text} fontWeight={600}>{g.label}</text>}
          </g>
        );
      })}
      {on("f") && (
        <g>
          <rect x={sf.x} y={sf.y} width={sf.w} height={sf.h} fill="none" stroke="#222" strokeWidth={sw} strokeDasharray={`${fs(24)} ${fs(16)}`} />
          <text x={sf.x + sf.w / 2} y={sf.y + sf.h - fs(22)} fontSize={fs(38)} textAnchor="middle" fill="#111" stroke="#c4c4c4" strokeWidth={fs(7)} paintOrder="stroke" fontFamily={fonts.text} fontWeight={600}>Safety {spec.safety}%</text>
        </g>
      )}
      <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="none" stroke="#fff" strokeWidth={sw} strokeOpacity=".7" />
      {on("c") && <path d={`M${cx - fs(60)} ${cy}h${fs(120)}M${cx} ${cy - fs(60)}v${fs(120)}`} stroke={RED} strokeWidth={sw} />}
      {on("s") && ([[d.x + inset, d.y + inset], [d.x + d.w - inset, d.y + inset], [d.x + inset, d.y + d.h - inset], [d.x + d.w - inset, d.y + d.h - inset]] as const).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={sr} fill="#fff" />
          <path d={star(x, y, sr)} fill="#111" />
          <circle cx={x} cy={y} r={sr * 0.08} fill="#fff" />
        </g>
      ))}
      {on("m") && (
        <g>
          {/* white triangles on the canvas edge, only where the canvas extends past the framing decision */}
          {d.y > 0 && hMark.map((k) => <polygon key={"wt" + k} points={tri(d.x + d.w * k, 0, 0, 1, t)} fill="#fff" />)}
          {d.y > 0 && hMark.map((k) => <polygon key={"wb" + k} points={tri(d.x + d.w * k, H, 0, -1, t)} fill="#fff" />)}
          {d.x > 0 && hMark.map((k) => <polygon key={"wl" + k} points={tri(0, d.y + d.h * k, 1, 0, t)} fill="#fff" />)}
          {d.x > 0 && hMark.map((k) => <polygon key={"wr" + k} points={tri(W, d.y + d.h * k, -1, 0, t)} fill="#fff" />)}
          {hMark.map((k) => <polygon key={"rt" + k} points={tri(d.x + d.w * k, d.y, 0, 1, t)} fill={RED} />)}
          {hMark.map((k) => <polygon key={"rb" + k} points={tri(d.x + d.w * k, d.y + d.h, 0, -1, t)} fill={RED} />)}
          {hMark.map((k) => <polygon key={"rl" + k} points={tri(d.x, d.y + d.h * k, 1, 0, t)} fill={RED} />)}
          {hMark.map((k) => <polygon key={"rr" + k} points={tri(d.x + d.w, d.y + d.h * k, -1, 0, t)} fill={RED} />)}
        </g>
      )}
      {on("l") && (
        <g>
          {sm(d.x + inset + sr + fs(24), d.y + fs(120), `Canvas ${W} × ${H}`)}
          {sm(d.x + d.w - inset - sr - fs(24), d.y + fs(120), `Framing ${d.w} × ${d.h}`, "end")}
          {sm(d.x + inset + sr + fs(24), d.y + d.h - fs(100), `Anchor ${Math.round(d.x)}, ${Math.round(d.y)}`)}
          {sm(d.x + d.w - inset - sr - fs(24), d.y + d.h - fs(100), `${spec.mm[0]} × ${spec.mm[1]} mm`, "end")}
          {sm(cx, d.y + fs(130), `Pixel 0000 · ${W - 1}`, "middle")}
        </g>
      )}
      {on("x") && (
        <g fontFamily={fonts.text} textAnchor="middle" fill="#111">
          {info.title && info.project && <text x={cx} y={titleBase - tf.size * 1.2} fontSize={pf.size} fill="#222" letterSpacing={fs(4)}>{pf.lines[0].join(" ")}</text>}
          {tf.lines[0].map((ln, i) => <text key={i} x={cx} y={titleBase + i * tlh} fontSize={tf.size} fontWeight={600}>{ln}</text>)}
          {flat.map((ln, i) => {
            const k = i === 0 ? "" : ln.indexOf(": ");
            return (
              <text key={i} x={cx} y={top + (i + 0.6) * lh} fontSize={bodySize} fontWeight={i === 0 ? 600 : 400}>
                {k === "" || k < 0 ? ln : <><tspan fill="#2a2a2a">{ln.slice(0, k + 2)}</tspan><tspan fontWeight={600}>{ln.slice(k + 2)}</tspan></>}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}
