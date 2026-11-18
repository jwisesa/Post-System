"use client";

import { useState, useTransition } from "react";
import { importFeedback } from "@/app/admin/feedback-actions";
import { dataRows, decodeText, detectMapping, fromEdl, markDuplicates, parseDelimited, parseFeedbackText, rowsToIncoming, type Incoming, type Mapping } from "@/lib/feedback/import";
import { MARKER_FORMATS } from "@/lib/feedback/markers";
import type { FeedbackPoint } from "@/lib/feedback/service";
import { RATES, tcToFrames } from "@/lib/timecode";
import { useToast } from "../ui/toast";
import type { Item } from "./shared";

const looksEdl = (t: string, name: string) => /\.edl$/i.test(name) || (/^(TITLE|FCM)\s*:/m.test(t) && /(\|M:|\*\s*LOC\s*:)/.test(t));

/** Rows from text: EDL markers, a delimited table (with a mapping the user can change), or free text. */
function analyze(text: string, name: string, pick: Partial<Mapping> | null) {
  if (!text.trim()) return { rows: [] as Incoming[], source: "", table: null };
  if (looksEdl(text, name)) return { rows: fromEdl(text), source: name || "EDL", table: null };
  const grid = parseDelimited(text);
  const auto = grid.length ? detectMapping(grid[0]) : null;
  if (auto || /\.(csv|tsv)$/i.test(name)) {
    const m: Mapping = { ...(auto ?? { format: "CSV", ref: null, body: Math.max(0, (grid[0]?.length ?? 1) - 1), author: null }), ...pick };
    return { rows: rowsToIncoming(dataRows(grid, auto ?? m), m), source: name || m.format, table: { grid, m, headless: auto?.format === "Avid" } };
  }
  return { rows: parseFeedbackText(text), source: name || "teks", table: null };
}

function ImportTab({ slug, item, own, onDone }: { slug: string; item: Item; own: FeedbackPoint[]; onDone: () => void }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [kind, setKind] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [pick, setPick] = useState<Partial<Mapping> | null>(null);
  const [off, setOff] = useState<Record<number, boolean>>({});

  const a = analyze(text, name, pick);
  const rows = markDuplicates(own, a.rows);
  const on = (i: number) => off[i] ?? !rows[i].dup;
  const chosen = rows.filter((_, i) => on(i));
  const reset = (t: string, n: string) => { setText(t); setName(n); setPick(null); setOff({}); };
  const head = a.table?.grid[0] ?? [];
  const col = (v: number | null) => (v === null ? "" : String(v));
  const set = (k: "ref" | "body" | "author", v: string) => { setPick({ ...pick, [k]: v === "" ? null : Number(v) }); setOff({}); };

  const save = () =>
    start(async () => {
      const r = await importFeedback(slug, item.id, chosen.map(({ ref, body, fromWho }) => ({ ref, body, fromWho })), a.source);
      if (!r.ok) return toast({ message: r.error ?? "Gagal.", tone: "error" });
      toast({ message: `${r.added} poin ditambahkan${r.skipped ? `, ${r.skipped} duplikat dilewati` : ""}.` });
      onDone();
    });

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Sumber impor" className="seg">
        <button type="button" aria-pressed={kind === "paste"} onClick={() => { setKind("paste"); reset("", ""); }}>Tempel</button>
        <button type="button" aria-pressed={kind === "file"} onClick={() => { setKind("file"); reset("", ""); }}>File</button>
      </div>
      {kind === "paste" ? (
        <label><span>Tempel feedback (WhatsApp, daftar bernomor, atau tabel CSV)</span><textarea rows={5} value={text} onChange={(e) => reset(e.target.value, "")} /></label>
      ) : (
        <label>
          <span>File feedback (Frame.io, Vimeo, Resolve, Premiere, Avid)</span>
          <input type="file" accept=".csv,.txt,.edl,.tsv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) reset(decodeText(await f.arrayBuffer()), f.name); }} />
        </label>
      )}
      {a.table && (
        <div className="grid grid-cols-3 gap-2" data-testid="mapping-row">
          {([["ref", "Timecode"], ["body", "Komentar"], ["author", "Penulis"]] as const).map(([k, label]) => (
            <label key={k}>
              <span>{label}</span>
              <select value={col(a.table!.m[k])} onChange={(e) => set(k, e.target.value)}>
                {k !== "body" && <option value="">(tidak ada)</option>}
                {(head.length ? head : [""]).map((h, i) => <option key={i} value={i}>{a.table!.headless ? `Kolom ${i + 1}` : h || `Kolom ${i + 1}`}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <ul className="rows xfer-preview" aria-label="Pratinjau">
          {rows.map((p, i) => (
            <li key={i} className="flex items-baseline gap-2 py-1.5">
              <input type="checkbox" checked={on(i)} aria-label={`Impor: ${p.body}`} onChange={() => setOff({ ...off, [i]: on(i) ? false : true })} />
              {p.ref && <span className="shrink-0 text-xs font-semibold text-ink-2 tabular-nums">{p.ref}</span>}
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{p.body}{p.fromWho && <span className="muted"> · {p.fromWho}</span>}</span>
              {p.dup && <span className="tag shrink-0">Duplikat</span>}
            </li>
          ))}
        </ul>
      )}
      {text.trim() && rows.length === 0 && <p className="muted">Tidak ada poin yang terbaca.</p>}
      <div className="flex gap-2">
        <button type="button" className="btn" disabled={busy || chosen.length === 0 || chosen.length > 2000} onClick={save}>Simpan {chosen.length} poin</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Batal</button>
      </div>
    </div>
  );
}

function ExportTab({ item, slug, own, onDone }: { item: Item; slug: string; own: FeedbackPoint[]; onDone: () => void }) {
  const [format, setFormat] = useState(MARKER_FORMATS[0].id);
  const [rateId, setRateId] = useState("");
  const [startTc, setStartTc] = useState("");
  const [mode, setMode] = useState<"" | "offset" | "absolute">("");
  const [openOnly, setOpenOnly] = useState(false);

  const rate = RATES.find((r) => r.id === rateId)?.rate;
  const valid = !!rate && tcToFrames(startTc, rate) !== null && !!mode;
  const pts = openOnly ? own.filter((p) => p.status === "open") : own;
  const fmt = MARKER_FORMATS.find((f) => f.id === format)!;
  const skipped = valid ? fmt.make(pts, { rate, start: startTc, mode: mode as "offset" | "absolute", name: item.name }).skipped : 0;
  const href = valid ? `/admin/p/${slug}/timeline/markers?${new URLSearchParams({ item: item.id, format, rate: rateId, start: startTc, mode, ...(openOnly ? { open: "1" } : {}) })}` : "";

  return (
    <div className="space-y-2">
      <label><span>Format</span><select value={format} onChange={(e) => setFormat(e.target.value)}>{MARKER_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2">
        <label><span>Frame rate</span>
          <select required value={rateId} onChange={(e) => setRateId(e.target.value)}>
            <option value="" />
            {RATES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label><span>Start timecode</span><input required pattern="\d{1,2}:\d{2}:\d{2}[:;]\d{2}" placeholder="HH:MM:SS:FF" value={startTc} onChange={(e) => setStartTc(e.target.value)} /></label>
      </div>
      {rate && startTc && tcToFrames(startTc, rate) === null && <p className="text-danger">Start timecode tidak ada di frame rate ini.</p>}
      <div role="group" aria-label="Mode timecode" className="seg">
        <button type="button" aria-pressed={mode === "offset"} onClick={() => setMode("offset")}>Dari awal video</button>
        <button type="button" aria-pressed={mode === "absolute"} onClick={() => setMode("absolute")}>Timecode timeline</button>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /><span>Hanya yang belum dicek</span></label>
      {valid && skipped > 0 && <p className="muted">{skipped} poin dilewati karena tidak punya timecode.</p>}
      <div className="flex gap-2">
        {valid ? <a className="btn" href={href} download>Unduh</a> : <button type="button" className="btn" disabled>Unduh</button>}
        <button type="button" className="btn-ghost" onClick={onDone}>Tutup</button>
      </div>
    </div>
  );
}

export function FeedbackTransfer({ kind, item, slug, own, onClose }: { kind: "import" | "export"; item: Item; slug: string; own: FeedbackPoint[]; onClose: () => void }) {
  return (
    <div className="space-y-2 hairline pt-3" data-testid="feedback-transfer">
      <h4 className="font-semibold">{kind === "import" ? "Impor feedback" : "Export marker"}</h4>
      {kind === "import" ? <ImportTab slug={slug} item={item} own={own} onDone={onClose} /> : <ExportTab slug={slug} item={item} own={own} onDone={onClose} />}
    </div>
  );
}
