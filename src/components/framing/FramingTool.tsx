"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Popover } from "@/components/ui/popover";
import { Section } from "@/components/ui/section";
import { CAMERAS, FILM } from "@/lib/framing/cameras";
import { ASPECTS, buildSpec, DEFAULTS, filmStats, FPS, LAYERS, parseState, PRESETS, SCANS, serialize, SQUEEZES, type State } from "@/lib/framing/frame";
import { FramingChart } from "./FramingChart";
import { chartFonts } from "./fonts";

const lbl = "block space-y-1 text-sm";
const fld = "w-full";

/** Collect the page's @font-face rules (latin only) for the chart families as base64, so an SVG-as-image can render them. */
async function fontCss(): Promise<string> {
  const fams = [chartFonts.text, chartFonts.mono].map((f) => f.split(",")[0].replace(/['"]/g, "").trim());
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of Array.from(rules)) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const fam = r.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
      if (!fams.includes(fam)) continue;
      const range = r.style.getPropertyValue("unicode-range");
      if (range && !/U\+0(-|,|$)/i.test(range.replace(/\s/g, ""))) continue; // latin subset starts at U+0 (browsers print "U+0-FF")
      const url = /url\(["']?([^"')]+)["']?\)/.exec(r.style.getPropertyValue("src"))?.[1]; if (!url) continue;
      const buf = new Uint8Array(await (await fetch(new URL(url, sheet.href ?? location.href))).arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      css += `@font-face{font-family:'${fam}';font-weight:${r.style.getPropertyValue("font-weight") || 400};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
    }
  }
  return css;
}
async function svgString(svg: SVGSVGElement) {
  const c = svg.cloneNode(true) as SVGSVGElement;
  const st = document.createElementNS("http://www.w3.org/2000/svg", "style"); st.textContent = await fontCss(); c.prepend(st);
  c.setAttribute("width", svg.viewBox.baseVal.width + ""); c.setAttribute("height", svg.viewBox.baseVal.height + ""); c.removeAttribute("style");
  return new XMLSerializer().serializeToString(c);
}
function save(href: string, name: string) { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); }

export function FramingTool({ slug, project, initial }: { slug: string; project: string; initial: Record<string, string> }) {
  const [s, setS] = useState<State>(() => parseState(initial, project));
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [copied, setCopied] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const spec = useMemo(() => buildSpec(s), [s]);
  const set = (p: Partial<State>) => setS((o) => {
    const n = { ...o, ...p };
    const q = serialize(n, project); history.replaceState(null, "", q ? `?${q}` : location.pathname);
    return n;
  });
  const cam = CAMERAS.find((c) => c.id === s.cam) ?? CAMERAS[0];
  const fmt = FILM.find((f) => f.id === s.film) ?? FILM[0], gate = fmt.gates.find((g) => g.id === s.gate) ?? fmt.gates[0];
  const st = filmStats(fmt, gate, +s.scan, spec.fps);
  const squeezes = s.kind === "film" ? [1, 2] : cam.squeeze ?? [1];
  const toggle = (k: string) => set({ layers: s.layers.includes(k) ? s.layers.replace(k, "") : s.layers + k });
  const toggleG = (id: string) => { const g = s.guides ? s.guides.split(",") : []; set({ guides: (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]).join(","), layers: s.layers.includes("g") ? s.layers : s.layers + "g" }); };
  const mode = cam.modes.find((m) => m.id === (s.mode || cam.modes[0].id)) ?? cam.modes[0];
  const name = `framing-${spec.camera}-${spec.W}x${spec.H}`.replace(/\W+/g, "-").toLowerCase();

  async function png() {
    if (!ref.current) return; setBusy(true); setErr("");
    try {
      const xml = await svgString(ref.current), url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
      const img = new Image(); img.src = url; await img.decode();
      const cv = document.createElement("canvas"); cv.width = spec.W; cv.height = spec.H;
      cv.getContext("2d")!.drawImage(img, 0, 0, spec.W, spec.H); URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
      if (!blob) throw new Error("kanvas terlalu besar"); const u = URL.createObjectURL(blob); save(u, `${name}.png`); setTimeout(() => URL.revokeObjectURL(u), 5000);
    } catch (e) { setErr(`Gagal membuat PNG: ${e instanceof Error ? e.message : "tidak diketahui"}`); } finally { setBusy(false); }
  }
  async function copySvg() {
    if (!ref.current) return;
    try { await navigator.clipboard.writeText(await svgString(ref.current)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setErr("Gagal menyalin SVG."); }
  }
  const q = serialize(s, project);
  const text = (k: keyof State, label: string, ph = "") => (
    <label className={lbl}><span className="muted">{label}</span><input className={fld} value={s[k]} placeholder={ph} maxLength={120} onChange={(e) => set({ [k]: e.target.value })} /></label>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-2">
        <Section id="kamera" title="Kamera" digest={spec.camera}>
          <div className="space-y-3 p-3">
            <div role="group" aria-label="Jenis" className="flex gap-2">
              {(["digital", "film"] as const).map((k) => <button key={k} type="button" aria-pressed={s.kind === k} className={s.kind === k ? "btn" : "btn-secondary"} onClick={() => set({ kind: k, sq: "1" })}>{k === "digital" ? "Digital" : "Film"}</button>)}
            </div>
            {s.kind === "digital" ? (<>
              <label className={lbl}><span className="muted">Kamera</span>
                <select className={fld} value={cam.id} onChange={(e) => set({ cam: e.target.value, mode: "", sq: "1" })}>
                  {CAMERAS.map((c) => <option key={c.id} value={c.id}>{c.brand} {c.name}</option>)}
                </select></label>
              <label className={lbl}><span className="muted">Mode / resolusi</span>
                <select className={fld} value={s.mode || cam.modes[0].id} onChange={(e) => set({ mode: e.target.value })}>
                  {cam.modes.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.px[0]}×{m.px[1]}</option>)}
                </select></label>
              <p className="muted text-xs">Sensor {spec.mm[0]} × {spec.mm[1]} mm{spec.codec ? ` · ${spec.codec}` : ""}.{" "}
                <Popover label="Sumber data" className="text-accent underline" trigger="Sumber">{() => (
                  <div className="space-y-1 p-3 text-xs" style={{ width: "min(18rem, 70vw)" }}>
                    <p className="font-semibold">{cam.brand} {cam.name} · {mode.label}</p>
                    <p><a className="text-accent underline [overflow-wrap:anywhere]" href={mode.source.url} target="_blank" rel="noreferrer">{mode.source.title}</a></p>
                    <p className="muted">Diakses {mode.source.accessed}.{mode.derived ? " Ukuran mm dihitung dari sensor penuh (pitch piksel sama); resolusi dari halaman sumber." : ""}</p>
                    {cam.source.url !== mode.source.url && <p><a className="text-accent underline [overflow-wrap:anywhere]" href={cam.source.url} target="_blank" rel="noreferrer">{cam.source.title}</a></p>}
                  </div>)}</Popover></p>
            </>) : (<>
              <label className={lbl}><span className="muted">Format film</span>
                <select className={fld} value={fmt.id} onChange={(e) => set({ film: e.target.value, gate: "" })}>{FILM.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
              <label className={lbl}><span className="muted">Gate</span>
                <select className={fld} value={gate.id} onChange={(e) => set({ gate: e.target.value })}>{fmt.gates.map((g) => <option key={g.id} value={g.id}>{g.label} · {g.mm[0]}×{g.mm[1]} mm</option>)}</select></label>
              <label className={lbl}><span className="muted">Resolusi scan</span>
                <select className={fld} value={s.scan} onChange={(e) => set({ scan: e.target.value })}>{SCANS.map((r) => <option key={r.id} value={r.id}>{r.label} ({r.id} px)</option>)}</select></label>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
                <dt className="muted">Frame</dt><dd>{st.w} × {st.h}</dd>
                <dt className="muted">Per frame (DPX 10-bit)</dt><dd>{st.mb.toFixed(1)} MB</dd>
                <dt className="muted">Data</dt><dd>{st.gbPerMin.toFixed(1)} GB/menit</dd>
                <dt className="muted">Film</dt><dd>{st.ftPerMin.toFixed(1)} ft/menit · {fmt.fpf.toFixed(fmt.fpf % 1 ? 2 : 0)} fpf</dd>
                <dt className="muted">Rol 400 ft</dt><dd>{st.r400.min.toFixed(1)} mnt · {st.r400.gb.toFixed(0)} GB</dd>
                <dt className="muted">Rol 1000 ft</dt><dd>{st.r1000.min.toFixed(1)} mnt · {st.r1000.gb.toFixed(0)} GB</dd>
              </dl>
              <p className="muted text-xs">
                Sumber gate: <a className="text-accent underline" href={gate.source.url} target="_blank" rel="noreferrer">{gate.source.title}</a>.
                {gate.note ? ` ${gate.note}` : ""}{!gate.verified ? " Belum terverifikasi dari sumber utama; cek lagi sebelum dipakai untuk scan." : ""}</p>
            </>)}
          </div>
        </Section>
        <Section id="bingkai" title="Bingkai" digest={`${spec.arLabel} · ${spec.safety}%`}>
          <div className="space-y-3 p-3">
            <label className={lbl}><span className="muted">Rasio aspek</span>
              <select className={fld} value={s.ar} onChange={(e) => set({ ar: e.target.value })}>
                <option value="0">Sensor penuh</option>{ASPECTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
            <label className={lbl}><span className="muted">Lens squeeze</span>
              <select className={fld} value={s.sq} onChange={(e) => set({ sq: e.target.value })}>{SQUEEZES.filter((x) => squeezes.includes(x)).map((x) => <option key={x} value={x}>{x === 1 ? "1.0 (spherical)" : `${x}x`}</option>)}</select></label>
            <label className={lbl}><span className="muted">Safety: {s.safety}%</span>
              <input type="range" min={50} max={100} step={1} className={fld} value={s.safety} onChange={(e) => set({ safety: e.target.value })} /></label>
            <label className={lbl}><span className="muted">Frame rate proyek</span>
              <select className={fld} value={s.fps} onChange={(e) => set({ fps: e.target.value })}>{FPS.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
            <fieldset className="space-y-1"><legend className="muted text-sm">Panduan ekstraksi</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{ASPECTS.map((a) => (
                <label key={a.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={s.guides.split(",").includes(a.id)} onChange={() => toggleG(a.id)} />{a.label}</label>))}</div>
            </fieldset>
          </div>
        </Section>
        <Section id="info" title="Info produksi" defaultOpen={false}>
          <div className="space-y-3 p-3">
            {text("project", "Proyek")}{text("title", "Judul di chart", "mis. Camera test")}{text("dop", "Director of Photography")}
            {text("director", "Sutradara")}{text("production", "Produksi")}{text("unit", "Unit / huruf kamera", "A")}{text("notes", "Catatan")}
          </div>
        </Section>
        <Section id="tampilan" title="Tampilan" digest={Object.values(PRESETS).find((p) => p.layers === s.layers)?.label ?? "Kustom"}>
          <div className="grid grid-cols-2 gap-2 p-3">
            <div role="group" aria-label="Preset" className="col-span-2 flex gap-2">
              {Object.entries(PRESETS).map(([k, v]) => <button key={k} type="button" className={s.layers === v.layers ? "btn" : "btn-secondary"} aria-pressed={s.layers === v.layers} onClick={() => set({ layers: v.layers })}>{v.label}</button>)}
            </div>
            {Object.entries(LAYERS).map(([k, v]) => <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={s.layers.includes(k)} onChange={() => toggle(k)} />{v}</label>)}
            <p className="muted col-span-2 text-xs">Font chart: Barlow dan JetBrains Mono.</p>
          </div>
        </Section>
      </div>
      <div className="order-first min-w-0 space-y-3 lg:order-none">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 py-2" style={{ background: "var(--bg)" }}>
          <button type="button" className="btn" disabled={busy} onClick={png}>{busy ? "Membuat PNG…" : `Unduh PNG ${spec.W}×${spec.H}`}</button>
          <Link className="btn-secondary" href={`/admin/p/${slug}/framing/print${q ? `?${q}` : ""}`} target="_blank">Cetak PDF</Link>
          <button type="button" className="btn-ghost" onClick={copySvg}>{copied ? "Tersalin" : "Salin sebagai SVG"}</button>
          <button type="button" className="btn-ghost" onClick={() => { setS({ ...DEFAULTS, project }); history.replaceState(null, "", location.pathname); }}>Reset</button>
          <span role="status" className="text-sm text-danger">{err}</span>
        </div>
        <div className="overflow-hidden rounded-md border border-line"><FramingChart spec={spec} fonts={chartFonts} svgRef={ref} /></div>
        <p className="muted text-sm tabular-nums">{spec.camera} · {spec.mode} · {spec.W}×{spec.H} · bingkai {spec.arLabel}</p>
      </div>
    </div>
  );
}
