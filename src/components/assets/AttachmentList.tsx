"use client";

import { useState, useTransition } from "react";
import * as actions from "@/app/admin/asset-actions";
import { KINDS, kindLabel, VERSION_STATUSES, versionStatus } from "@/lib/assets/catalog";
import type { Attachment, Comment } from "@/lib/assets/service";
import { Combobox } from "../ui/controls";
import { useToast } from "../ui/toast";

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const fmt = (iso: string) => when.format(new Date(iso));

type Result = { ok: true } | { ok: false; error: string };

/** Runs a server function, toasts the outcome, and reports success to the caller. */
function useAct() {
  const toast = useToast();
  const [busy, start] = useTransition();
  const act = (run: () => Promise<Result>, message: string, after?: () => void) =>
    start(async () => {
      const r = await run();
      if (r.ok) { toast({ message }); after?.(); } else toast({ message: r.error, tone: "error" });
    });
  return { act, busy };
}

type ListProps = {
  attachments: Attachment[];
  target: { type: "schedule_item" | "project"; id: string };
  /** Empty slug = read-only (view-only link). */
  slug: string;
  canEdit: boolean;
  canApprove: boolean;
  labelOptions: string[];
  defaultKind?: string;
  empty?: string;
};

export function AttachmentList({ attachments, target, slug, canEdit, canApprove, labelOptions, defaultKind = "preview", empty = "Belum ada link." }: ListProps) {
  const { act, busy } = useAct();
  const [adding, setAdding] = useState(0); // bumping the key resets the add form

  return (
    <div className="space-y-2">
      {attachments.length === 0 && <p className="muted text-sm">{empty}</p>}
      {attachments.map((a) => {
        const [latest, ...older] = a.versions;
        if (!latest) return null;
        const st = versionStatus(latest.status);
        return (
          <article key={a.id} className="rounded-lg border border-line p-3 text-sm" data-attachment={a.label}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="tag">{kindLabel(a.kind)}</span>
              <span className="font-medium">{a.label}</span>
              <span className="tag tag-accent">v{latest.number}</span>
              <span className={`tag ${st.tone}`}>{st.label}</span>
              {a.internal && <span className="tag tag-warn">Internal</span>}
              <a href={latest.url} target="_blank" rel="noreferrer" className="btn-secondary ml-auto !min-h-7 !py-0.5">Buka ↗</a>
            </div>
            {latest.notes && <p className="mt-1.5 whitespace-pre-wrap">{latest.notes}</p>}
            <p className="muted mt-1 text-xs">{latest.author} · {fmt(latest.createdAt)}</p>

            {canApprove && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VERSION_STATUSES.filter((s) => s.value !== latest.status).map((s) => (
                  <button key={s.value} type="button" disabled={busy} className="btn-secondary !min-h-7 !py-0.5 text-xs" onClick={() => act(() => actions.setVersionStatus(slug, latest.id, s.value), `"${a.label}" v${latest.number}: ${s.label}.`)}>
                    Tandai: {s.label}
                  </button>
                ))}
              </div>
            )}

            {older.length > 0 && (
              <details className="mt-2">
                <summary className="muted text-xs hover:text-ink">Riwayat versi ({older.length})</summary>
                <ol className="mt-2 space-y-2 border-l border-line pl-3">
                  {older.map((v) => (
                    <li key={v.id}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tag">v{v.number}</span>
                        <span className={`tag ${versionStatus(v.status).tone}`}>{versionStatus(v.status).label}</span>
                        <a href={v.url} target="_blank" rel="noreferrer" className="text-accent">Buka ↗</a>
                      </div>
                      {v.notes && <p className="mt-1 whitespace-pre-wrap">{v.notes}</p>}
                      <p className="muted text-xs">{v.author} · {fmt(v.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              </details>
            )}

            {canEdit && (
              <details className="mt-2" key={`${a.id}:${latest.number}`}>
                <summary className="text-xs text-accent">+ Versi baru (v{latest.number + 1})</summary>
                <form
                  className="mt-2 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act(() => actions.addVersion(slug, a.id, String(f.get("url")), String(f.get("notes"))), `"${a.label}" v${latest.number + 1} ditambahkan.`);
                  }}
                >
                  <label><span>Link versi baru</span><input name="url" type="url" required placeholder="https://…" /></label>
                  <label><span>Apa yang berubah / direvisi</span><textarea name="notes" rows={2} required placeholder="Mis. trim adegan 12, ganti musik temp reel 3" /></label>
                  <div className="flex items-center gap-2">
                    <button className="btn" disabled={busy}>Simpan versi</button>
                    <button type="button" className="btn-danger ml-auto" disabled={busy} onClick={() => { if (window.confirm(`Hapus link "${a.label}" beserta semua versinya?`)) act(() => actions.deleteAttachment(slug, a.id), `Link "${a.label}" dihapus.`); }}>Hapus link</button>
                  </div>
                </form>
              </details>
            )}
          </article>
        );
      })}

      {canEdit && (
        <details className="rounded-lg border border-dashed border-line p-3" key={adding}>
          <summary className="text-sm font-medium text-accent">+ Tambah link</summary>
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const label = String(f.get("label"));
              act(
                () => actions.addAttachment(slug, { targetType: target.type, targetId: target.id, kind: String(f.get("kind")), label, url: String(f.get("url")), notes: String(f.get("notes")), internal: f.get("internal") === "on" }),
                `Link "${label}" ditambahkan.`,
                () => setAdding((n) => n + 1),
              );
            }}
          >
            <div className="grid grid-cols-[1fr_7.5rem] gap-2">
              <div><span className="mb-1 block text-xs font-medium text-muted">Nama</span><Combobox name="label" options={labelOptions} /></div>
              <label><span>Tipe</span><select name="kind" defaultValue={defaultKind}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
            </div>
            <label><span>Link (Drive, Frame.io, Vimeo, …)</span><input name="url" type="url" required placeholder="https://…" /></label>
            <label><span>Catatan (opsional)</span><input name="notes" /></label>
            <label className="check"><input type="checkbox" name="internal" /> Internal (tidak tampil di link view-only)</label>
            <button className="btn" disabled={busy}>Tambah link</button>
          </form>
        </details>
      )}
    </div>
  );
}

export function CommentThread({ comments, target, slug, me }: { comments: Comment[]; target: { type: "schedule_item" | "project"; id: string }; slug: string; me: { id: string; role: string } }) {
  const { act, busy } = useAct();
  const [body, setBody] = useState("");
  const send = () => { if (body.trim()) act(() => actions.addComment(slug, target.type, target.id, body), "Komentar terkirim.", () => setBody("")); };
  return (
    <div className="space-y-3 text-sm">
      {comments.length === 0 && <p className="muted">Belum ada komentar.</p>}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-[10px] font-semibold">{c.author.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{c.author}</span>
                <span className="muted text-xs">{fmt(c.createdAt)}</span>
                {(c.userId === me.id || me.role === "supervisor") && (
                  <button type="button" className="muted ml-auto cursor-pointer text-xs hover:text-danger" disabled={busy} onClick={() => { if (window.confirm("Hapus komentar ini?")) act(() => actions.deleteComment(slug, c.id), "Komentar dihapus."); }}>Hapus</button>
                )}
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-2">
        <textarea aria-label="Tulis komentar" rows={2} placeholder="Tulis komentar… (Ctrl+Enter untuk kirim)" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
        <button className="btn-secondary" disabled={busy || !body.trim()}>Kirim komentar</button>
      </form>
    </div>
  );
}
