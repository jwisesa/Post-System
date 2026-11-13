"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addFeedback, checkFeedback, deleteFeedback, updateFeedback } from "@/app/admin/feedback-actions";
import { carryOver } from "@/lib/feedback/parse";
import type { FeedbackPoint } from "@/lib/feedback/service";
import { fmtDate } from "@/lib/schedule/dates";
import { Icon } from "../ui/icons";
import { useToast } from "../ui/toast";
import type { Item, Mode } from "./shared";

const WHO = ["Director", "Producer", "Executive Producer", "Client", "DOP", "Editor", "Sound", "VFX", "Colorist"];
const STATES = [["open", "Belum"], ["fixed", "Sudah"], ["dropped", "Tidak dikerjakan"]] as const;
const LABEL = { open: "Belum dicek", fixed: "Sudah", dropped: "Tidak dikerjakan" } as const;
const short = (d: string) => fmtDate(d).replace(/ \d{4}$/, "");

type Check = { id: string; status: FeedbackPoint["status"]; at: string | null; note: string };
type Named = Item & { trackName: string };

function Meta({ p }: { p: FeedbackPoint }) {
  return (
    <>
      {p.ref && <span className="shrink-0 text-xs font-semibold text-ink-2 tabular-nums">{p.ref}</span>}
      <span className="min-w-0 flex-1 whitespace-pre-wrap">{p.body}{p.fromWho && <span className="muted"> · {p.fromWho}</span>}</span>
    </>
  );
}

function CheckRow({ p, busy, onCheck }: { p: FeedbackPoint; busy: boolean; onCheck: (p: FeedbackPoint, status: FeedbackPoint["status"], note: string) => void }) {
  const [note, setNote] = useState(p.checkNote);
  return (
    <li className="space-y-1.5 py-2">
      <div className="flex items-baseline gap-2"><Meta p={p} /></div>
      <div role="group" aria-label={`Status: ${p.body}`} className="seg">
        {STATES.map(([v, label]) => (
          <button key={v} type="button" aria-pressed={p.status === v} disabled={busy} onClick={() => onCheck(p, v, v === "open" ? "" : note)}>{label}</button>
        ))}
      </div>
      {p.status !== "open" && (
        <input
          aria-label={`Catatan cek: ${p.body}`} placeholder="Catatan singkat (opsional)" maxLength={500} value={note}
          onChange={(e) => setNote(e.target.value)} onBlur={() => note !== p.checkNote && onCheck(p, p.status, note)}
        />
      )}
    </li>
  );
}

function OwnRow({ p, item, names, canEdit, onDelete, onSave }: { p: FeedbackPoint; item: Item; names: Map<string, string>; canEdit: boolean; onDelete: () => void; onSave: (v: { body: string; ref: string; fromWho: string }) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ body: p.body, ref: p.ref, fromWho: p.fromWho });
  if (editing) {
    return (
      <li className="space-y-2 py-2">
        <div className="grid grid-cols-2 gap-2">
          <label><span>Ref</span><input value={v.ref} maxLength={40} onChange={(e) => setV({ ...v, ref: e.target.value })} /></label>
          <label><span>Dari siapa</span><input list="feedback-who" value={v.fromWho} maxLength={60} onChange={(e) => setV({ ...v, fromWho: e.target.value })} /></label>
        </div>
        <label><span>Feedback</span><textarea rows={2} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></label>
        <div className="flex gap-2">
          <button type="button" className="btn" disabled={!v.body.trim()} onClick={() => { onSave(v); setEditing(false); }}>Simpan</button>
          <button type="button" className="btn-ghost" onClick={() => { setV({ body: p.body, ref: p.ref, fromWho: p.fromWho }); setEditing(false); }}>Batal</button>
        </div>
      </li>
    );
  }
  const where = p.checkedItemId && p.checkedItemId !== item.id ? names.get(p.checkedItemId) : null;
  return (
    <li className="flex items-baseline gap-2 py-2">
      <Meta p={p} />
      <span className="tag shrink-0" title={p.checkNote || undefined}>{LABEL[p.status]}{p.status !== "open" && where ? ` · dicek di ${where}` : ""}</span>
      {canEdit && (
        <span className="flex shrink-0 gap-1">
          <button type="button" className="btn-ghost !min-h-6 text-xs" onClick={() => setEditing(true)}>Ubah</button>
          <button type="button" className="btn-ghost !min-h-6 text-xs hover:text-danger" onClick={() => window.confirm("Hapus poin ini?") && onDelete()}>Hapus</button>
        </span>
      )}
    </li>
  );
}

export function FeedbackPanel({ item, allItems, points, mode, slug }: { item: Item; allItems: Named[]; points: FeedbackPoint[]; mode: Mode; slug: string }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [text, setText] = useState("");
  const [who, setWho] = useState("");
  const [shown, mark] = useOptimistic(points, (cur, c: Check) =>
    cur.map((p) => (p.id === c.id ? { ...p, status: c.status, checkedItemId: c.status === "open" ? null : c.at, checkNote: c.status === "open" ? "" : c.note } : p)),
  );
  const names = new Map(allItems.map((i) => [i.id, i.name]));
  const byId = new Map(allItems.map((i) => [i.id, i]));
  const carry = carryOver(allItems, shown, item.id);
  const own = shown.filter((p) => p.itemId === item.id);
  const checked = carry.filter((p) => p.status !== "open").length;
  const groups = [...new Set(carry.map((p) => p.itemId))];

  const report = (r: { ok: boolean; error?: string }, ok?: string) => {
    if (!r.ok) toast({ message: r.error ?? "Gagal.", tone: "error" });
    else if (ok) toast({ message: ok });
    return r.ok;
  };
  const check = (p: FeedbackPoint, status: FeedbackPoint["status"], note: string) =>
    start(async () => {
      mark({ id: p.id, status, at: item.id, note });
      report(await checkFeedback(slug, p.id, status, item.id, note));
    });
  const add = () =>
    start(async () => {
      const r = await addFeedback(slug, item.id, text, who);
      if (report(r, "Feedback ditambahkan.")) setText("");
    });
  const line = (p: FeedbackPoint) => `[${p.status === "open" ? " " : "x"}] ${p.ref ? `${p.ref} ` : ""}${p.body}${p.status === "dropped" ? " (tidak dikerjakan)" : ""}`;
  const copy = async () => {
    const out = [item.name];
    if (carry.length) out.push("", "Cek dari review sebelumnya:", ...carry.map(line));
    if (own.length) out.push("", "Feedback di review ini:", ...own.map(line));
    try { await navigator.clipboard.writeText(out.join("\n")); toast({ message: "Checklist disalin." }); } catch { toast({ message: "Tidak bisa menyalin.", tone: "error" }); }
  };

  return (
    <section className="space-y-3 hairline pt-4 text-sm" data-testid="feedback-panel">
      <div className="flex items-center justify-between">
        <h3>Feedback {own.length > 0 && `(${own.length})`}</h3>
        {(own.length > 0 || carry.length > 0) && <button type="button" className="btn-ghost !min-h-6 text-xs" onClick={copy}><Icon name="check" /> Salin sebagai teks</button>}
      </div>

      {carry.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold">Cek dari review sebelumnya</h4>
          <p className="muted tabular-nums">{checked} dari {carry.length} sudah dicek</p>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={carry.length} aria-valuenow={checked}><span style={{ width: `${(checked / carry.length) * 100}%` }} /></div>
          {groups.map((g) => (
            <div key={g}>
              <div className="list-head"><span>Dari {names.get(g)} · {byId.get(g) ? short(byId.get(g)!.startDate) : ""}</span></div>
              <ul className="rows">
                {carry.filter((p) => p.itemId === g).map((p) =>
                  mode === "view"
                    ? <li key={p.id} className="flex items-baseline gap-2 py-2"><Meta p={p} /><span className="tag shrink-0">{LABEL[p.status]}</span></li>
                    : <CheckRow key={`${p.id}:${p.status}`} p={p} busy={busy} onCheck={check} />,
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="font-semibold">Feedback di review ini</h4>
        {own.length === 0 ? <p className="muted">Belum ada poin.</p> : (
          <ul className="rows">
            {own.map((p) => (
              <OwnRow
                key={`${p.id}:${p.body}:${p.ref}:${p.fromWho}`} p={p} item={item} names={names} canEdit={mode === "edit"}
                onDelete={() => start(async () => { report(await deleteFeedback(slug, p.id), "Poin dihapus."); })}
                onSave={(v) => start(async () => { report(await updateFeedback(slug, p.id, v), "Poin disimpan."); })}
              />
            ))}
          </ul>
        )}
        {mode !== "view" && (
          <div className="space-y-2">
            <label>
              <span>Tempel atau ketik feedback, satu poin per baris</span>
              <textarea
                rows={4} value={text} placeholder={"[R2 00:14:32] Potong adegan 3\nGanti musik temp"}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !busy) { e.preventDefault(); add(); } }}
              />
            </label>
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span>Dari siapa</span>
                <input value={who} list="feedback-who" maxLength={60} autoComplete="off" onChange={(e) => setWho(e.target.value)} />
                <datalist id="feedback-who">{WHO.map((w) => <option key={w} value={w} />)}</datalist>
              </label>
              <button type="button" className="btn" disabled={busy || !text.trim()} onClick={add}>Tambah</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
