"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Popover } from "@/components/ui/popover";
import { Section } from "@/components/ui/section";
import { CAMERAS, FILM } from "@/lib/framing/cameras";
import { ASPECTS, buildSpec, COLOR_CHARTS, DELIVERY, filmStats, FPS, LAYERS, parseState, PRESETS, reduce, SCANS, serialize, SQUEEZES, type State } from "@/lib/framing/frame";
import { FramingChart } from "./FramingChart";
import { chartFonts } from "./fonts";
import { SavedCharts, type Chart } from "./SavedCharts";

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

export function FramingTool({ slug, project, initial, charts: initialCharts, openedId }: { slug: string; project: string; initial: Record<string, string>; charts: Chart[]; openedId: string | null }) {
  const [charts, setCharts] = useState(initialCharts), [openId, setOpenId] = useState(openedId), [hideView, setHideView] = useState(false);
  // ?chart=<id> alone loads the saved state; extra params are unsaved edits on top of it
  const [s, dispatch] = useReducer(reduce, undefined, () => {
    const saved = initialCharts.find((c) => c.id === openedId);
    return saved && !Object.keys(initial).some((k) => k !== "chart") ? parseState(saved.state, project) : parseState(initial, project);
  });
  const opened = charts.find((c) => c.id === openId);
  const dirty = !!opened && serialize(s, project) !== serialize(parseState(opened.state, project), project);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [copied, setCopied] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const spec = useMemo(() => buildSpec(s), [s]);
  const set = (p: Partial<State>) => dispatch({ t: "set", p });
  // URL mirrors state after render (never inside a state updater, where Next's history patch can drop the update)
  useEffect(() => {
    const p = new URLSearchParams(serialize(s, project)); if (openId) p.set("chart", openId);
    const q = p.toString(); history.replaceState(null, "", q ? `?${q}` : location.pathname);
  }, [s, project, openId]);
  // Below lg the app's sidebar becomes a sticky top header: pin the preview just under it
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const a = document.querySelector<HTMLElement>("aside.sidebar"); if (!a || !wrap.current) return;
    const el = wrap.current, set = () => el.style.setProperty("--fc-top", getComputedStyle(a).position === "sticky" ? `${a.offsetHeight}px` : "0px");
    set(); const ro = new ResizeObserver(set); ro.observe(a); return () => ro.disconnect();
  }, []);
  const confirmLeave = () => !dirty || window.confirm("Ada perubahan yang belum disimpan. Lanjut dan buang perubahan?");
  const cam = CAMERAS.find((c) => c.id === s.cam) ?? CAMERAS[0];
  const fmt = FILM.find((f) => f.id === s.film) ?? FILM[0], gate = fmt.gates.find((g) => g.id === s.gate) ?? fmt.gates[0];
  const st = filmStats(fmt, gate, +s.scan, spec.fps);
  const squeezes = s.kind === "film" ? [1, 2] : cam.squeeze ?? [1];
  const toggle = (k: string) => dispatch({ t: "layer", k });
  const toggleG = (id: string) => dispatch({ t: "list", key: "guides", id, layer: "g" });
  const toggleD = (id: string) => dispatch({ t: "list", key: "dsf", id, layer: "d" });
  const mode = cam.modes.find((m) => m.id === (s.mode || cam.modes[0].id)) ?? cam.modes[0];
  const name = `framing-${spec.camera}-${spec.W}x${spec.H}`.replace(/\W+/g, "-").toLowerCase();

  async function png() {
    if (!ref.current) return; setBusy(true); setErr("");
    try {
      const xml = await svgString(ref.current), url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
      await document.fonts.ready; const img = new Image(); img.src = url; await img.decode();
      const cv = document.createElement("canvas"); cv.width = spec.W; cv.height = spec.H;
      const cx = cv.getContext("2d")!; cx.imageSmoothingEnabled = false; cx.drawImage(img, 0, 0, spec.W, spec.H); // 1:1, no resampling URL.revokeObjectURL(url);
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
    <div className="fc-wrap" ref={wrap}>
      <div className="fc-preview" data-collapsed={hideView || undefined}>
        <div className="fc-bar">
          <SavedCharts slug={slug} project={project} state={s} charts={charts} setCharts={setCharts} openId={openId} setOpenId={setOpenId} dirty={dirty}
            onOpen={(c) => { if (c.id === openId || confirmLeave()) { setOpenId(c.id); dispatch({ t: "load", s: parseState(c.state, project) }); } }}
            onNew={() => { if (confirmLeave()) { setOpenId(null); dispatch({ t: "reset", project }); } }} />
          <button type="button" className="btn" disabled={busy} onClick={png}>{busy ? "…" : <>PNG<span className="fc-wide">&nbsp;{spec.W}×{spec.H}</span></>}</button>
          <Link className="btn-secondary" href={`/admin/p/${slug}/framing/print?${dirty || !openId ? q : `chart=${openId}`}`} target="_blank">PDF</Link>
          <button type="button" className="btn-ghost fc-wide" onClick={copySvg}>{copied ? "Tersalin" : "SVG"}</button>
          <button type="button" className="btn-ghost" onClick={() => dispatch({ t: "reset", project })}>Reset</button>
          <button type="button" className="btn-ghost fc-narrow" aria-expanded={!hideView} aria-label="Tampilkan preview" onClick={() => setHideView(!hideView)}>{hideView ? "Buka ▾" : "Tutup ▴"}</button>
        </div>
        <p role="status" className="text-sm text-danger empty:hidden">{err}</p>
        <div className="fc-stage"><FramingChart spec={spec} fonts={chartFonts} svgRef={ref} fill /></div>
        <p className="muted fc-cap tabular-nums">{spec.camera} · {spec.mode} · {spec.W}×{spec.H} · bingkai {spec.arLabel}</p>
      </div>
      <div className="fc-controls space-y-2">
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
        <Section id="bingkai" title="Bingkai" digest={`${spec.arLabel} · crop ${spec.crop}%`}>
          <div className="space-y-3 p-3">
            <label className={lbl}><span className="muted">Rasio aspek</span>
              <select className={fld} value={s.ar} onChange={(e) => set({ ar: e.target.value })}>
                <option value="0">Sensor penuh</option>{ASPECTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
            <label className={lbl}><span className="muted">Lens squeeze</span>
              <select className={fld} value={s.sq} onChange={(e) => set({ sq: e.target.value })}>{SQUEEZES.filter((x) => squeezes.includes(x)).map((x) => <option key={x} value={x}>{x === 1 ? "1.0 (spherical)" : `${x}x`}</option>)}</select></label>
            <label className={lbl}><span className="muted">Tampilan hasil / Output</span>
              <select className={fld} value={spec.desq ? "desqueezed" : "squeezed"} onChange={(e) => set({ out: e.target.value })}>
                <option value="desqueezed">Desqueezed</option><option value="squeezed">Squeezed</option></select>
              <span className="muted block text-xs">{spec.desq ? "Desqueezed: rasio akhir untuk editorial, VFX dan delivery." : "Squeezed: piksel sensor, apa yang direkam kamera."}{spec.squeeze === 1 ? " Tidak berpengaruh pada lens spherical." : ""}</span></label>
            <label className={lbl}><span className="muted">Safety crop: {s.crop}%</span>
              <input type="range" min={0} max={30} step={1} className={fld} value={s.crop} onChange={(e) => set({ crop: e.target.value })} />
              <span className="muted block text-xs">Area konten mengecil ke dalam bingkai; 0% = konten memenuhi framing decision.</span></label>
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
        <Section id="tampilan" title="Tampilan" digest={Object.values(PRESETS).find((p) => p.style === s.style && p.layers === s.layers)?.label ?? "Kustom"}>
          <div className="grid grid-cols-2 gap-2 p-3">
            <div role="group" aria-label="Preset" className="col-span-2 flex gap-2">
              {Object.entries(PRESETS).map(([k, v]) => <button key={k} type="button" className={s.style === v.style ? "btn" : "btn-secondary"} aria-pressed={s.style === v.style} onClick={() => set({ layers: v.layers, style: v.style })}>{v.label}</button>)}
            </div>
            {Object.entries(LAYERS).map(([k, v]) => <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={s.layers.includes(k)} onChange={() => toggle(k)} />{v}</label>)}
            <p className="muted col-span-2 text-xs">Font chart: Barlow dan JetBrains Mono.</p>
          </div>
        </Section>
        <Section id="color" title="Color chart" digest={COLOR_CHARTS.find((x) => x.id === s.cc)?.label}>
          <div className="space-y-3 p-3">
            <label className="block space-y-1 text-sm"><span className="muted">Color chart</span>
              <select className={fld} value={s.cc} onChange={(e) => set({ cc: e.target.value })}>{COLOR_CHARTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          </div>
        </Section>
        <Section id="delivery" title="Delivery" digest={spec.delivery.length ? spec.delivery.map((d) => d.label).join(", ") : "Mati"}>
          <div className="space-y-3 p-3">
            <fieldset className="space-y-1"><legend className="muted text-sm">Delivery safe frame</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{DELIVERY.map((x) => (
                <label key={x.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={s.dsf.split(",").includes(x.id)} onChange={() => toggleD(x.id)} />{x.label} {x.w}×{x.h}</label>))}</div>
            </fieldset>
          </div>
        </Section>
      </div>
    </div>
  );
}
