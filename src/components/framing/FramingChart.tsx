import { framing, safety, type Spec } from "@/lib/framing/frame";

const GUIDE = ["#ffb000", "#00b4d8", "#7bd88f", "#ff6fb5", "#c3a6ff", "#ffd166"];
const RED = "#e5322d";

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
  const u = Math.sqrt(W * H) / 3456; // 1 unit = 1px on a 4608x2592 canvas
  const d = framing(W, H, spec.ar, spec.squeeze), sf = safety(d, spec.safety);
  const cx = W / 2, cy = H / 2, sw = 3 * u, fs = (n: number) => n * u;
  const t = fs(26), sr = Math.min(d.w, d.h) * 0.06, inset = sr * 1.35;
  const info = spec.info;
  const lines: [string, string][] = ([
    ["Camera", spec.camera + (info.unit ? ` · ${info.unit}` : "")], ["Sensor mode", spec.mode + (spec.codec ? ` · ${spec.codec}` : "")],
    ["Framing decision", `${d.w} × ${d.h}`], ["Aspect ratio", spec.arLabel + (spec.squeeze !== 1 ? ` · ${spec.squeeze}x squeeze` : "")],
    ["Frame rate", `${spec.fps} fps`], ["DoP", info.dop], ["Director", info.director], ["Production", info.production],
  ] as [string, string][]).filter(([, v]) => v);
  const sm = (x: number, y: number, s: string, anchor: "start" | "middle" | "end" = "start", fill = "#111") => (
    <text x={x} y={y} fontSize={fs(30)} textAnchor={anchor} fill={fill} fontFamily={fonts.mono}>{s}</text>
  );
  const rowH = fs(70), bx = cx + fs(120), by = cy + fs(190);
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Framing chart ${spec.camera} ${spec.mode}, ${spec.arLabel}`} style={{ display: "block", width: "100%", height: "auto" }}>
      <rect width={W} height={H} fill="#16171a" />
      <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="#8c8e91" />
      {on("t") && <path d={`M${d.x + d.w / 3} ${d.y}v${d.h}M${d.x + (2 * d.w) / 3} ${d.y}v${d.h}M${d.x} ${d.y + d.h / 3}h${d.w}M${d.x} ${d.y + (2 * d.h) / 3}h${d.w}`} stroke="#fff" strokeOpacity=".35" strokeWidth={sw / 2} />}
      {on("g") && spec.guides.map((g, i) => {
        const r = framing(W, H, g.ar, spec.squeeze);
        const c = GUIDE[i % GUIDE.length];
        return (
          <g key={g.label + i}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={c} strokeWidth={sw} />
            <text x={r.x + r.w / 2} y={r.y + fs(44)} fontSize={fs(32)} textAnchor="middle" fill={c} stroke="#16171a" strokeWidth={fs(7)} paintOrder="stroke" fontFamily={fonts.text} fontWeight={600}>{g.label}</text>
          </g>
        );
      })}
      {on("f") && (
        <g>
          <rect x={sf.x} y={sf.y} width={sf.w} height={sf.h} fill="none" stroke="#fff" strokeWidth={sw} strokeDasharray={`${fs(24)} ${fs(16)}`} />
          <text x={sf.x + sf.w / 2} y={sf.y + sf.h - fs(22)} fontSize={fs(30)} textAnchor="middle" fill="#fff" stroke="#16171a" strokeWidth={fs(7)} paintOrder="stroke" fontFamily={fonts.text} fontWeight={600}>Safety {spec.safety}%</text>
        </g>
      )}
      <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="none" stroke="#fff" strokeWidth={sw * 1.5} />
      {on("c") && <path d={`M${cx - fs(90)} ${cy}h${fs(180)}M${cx} ${cy - fs(90)}v${fs(180)}`} stroke="#111" strokeWidth={sw} />}
      {on("c") && <circle cx={cx} cy={cy} r={fs(40)} fill="none" stroke="#111" strokeWidth={sw} />}
      {on("s") && ([[d.x + inset, d.y + inset], [d.x + d.w - inset, d.y + inset], [d.x + inset, d.y + d.h - inset], [d.x + d.w - inset, d.y + d.h - inset]] as const).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={sr} fill="#fff" />
          <path d={star(x, y, sr)} fill="#111" />
          <circle cx={x} cy={y} r={sr * 0.08} fill="#fff" />
        </g>
      ))}
      {on("m") && (
        <g>
          {([[cx, d.y, 0, 1], [cx, d.y + d.h, 0, -1], [d.x, cy, 1, 0], [d.x + d.w, cy, -1, 0]] as const).map(([x, y, dx, dy], i) => (
            <polygon key={i} points={tri(x, y, dx, dy, t)} fill={RED} />
          ))}
          {([[cx, 0, 0, 1], [cx, H, 0, -1], [0, cy, 1, 0], [W, cy, -1, 0]] as const).map(([x, y, dx, dy], i) => (
            <polygon key={i} points={tri(x, y, dx, dy, t)} fill="#fff" />
          ))}
        </g>
      )}
      {on("l") && (
        <g>
          {sm(d.x + inset + sr + fs(24), d.y + fs(46), `Canvas ${W} × ${H}`)}
          {sm(d.x + d.w - inset - sr - fs(24), d.y + fs(46), `Framing ${d.w} × ${d.h}`, "end")}
          {sm(d.x + inset + sr + fs(24), d.y + d.h - fs(24), `Anchor ${Math.round(d.x)}, ${Math.round(d.y)}`)}
          {sm(d.x + d.w - inset - sr - fs(24), d.y + d.h - fs(24), `${spec.mm[0]} × ${spec.mm[1]} mm`, "end")}
          {sm(cx, d.y + fs(86), `Pixel ${String(0).padStart(4, "0")} · ${W - 1}`, "middle", "#111")}
          {sm(d.x + fs(60), cy + fs(44), "0000", "start")}
          {sm(d.x + d.w - fs(60), cy + fs(44), String(W - 1), "end")}
        </g>
      )}
      {on("x") && (
        <g fontFamily={fonts.text}>
          <text x={cx} y={cy - fs(150)} textAnchor="middle" fontSize={fs(130)} fontWeight={600} fill="#111">{info.title || info.project || "Framing chart"}</text>
          {info.title && info.project && <text x={cx} y={cy - fs(290)} textAnchor="middle" fontSize={fs(50)} fill="#222" letterSpacing={fs(4)}>{info.project.toUpperCase()}</text>}
          {lines.map(([k, v], i) => (
            <g key={k}>
              <text x={bx - fs(16)} y={by + i * rowH} textAnchor="end" fontSize={fs(44)} fill="#2a2a2a">{k}</text>
              <text x={bx + fs(16)} y={by + i * rowH} fontSize={fs(50)} fontWeight={600} fill="#111" fontFamily={fonts.mono}>{v}</text>
            </g>
          ))}
          {info.notes && <text x={cx} y={by + lines.length * rowH + fs(10)} textAnchor="middle" fontSize={fs(44)} fill="#222">{info.notes}</text>}
        </g>
      )}
    </svg>
  );
}
