"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { readSceneText, tagFromSelection } from "@/app/admin/script-actions";
import type { SceneRow } from "@/lib/script/service";
import { TAG_KINDS, TAG_LABEL, type Block, type TagKind } from "@/lib/script/types";
import { useToast } from "../ui/toast";

type Range = { s: number; e: number; k: number; q?: boolean };

/** Highlight ranges inside one block: each tag's excerpt (or, failing that, its keyword) and the active search query. */
function ranges(text: string, scene: SceneRow, q: string): Range[] {
  const low = text.toLowerCase(), out: Range[] = [];
  for (const t of scene.postTags) {
    const k = TAG_KINDS.indexOf(t.kind) + 1;
    // an excerpt is one or more selections joined by " … "; an ADR excerpt joins cue and dialogue as "CUE: text"
    const whole = t.excerpt?.toLowerCase() ?? "";
    const parts = whole.split(" … ").filter(Boolean);
    let hit = false;
    for (const ex of parts) {
      let at = low.indexOf(ex);
      const tries = at >= 0 ? [ex] : ex.split(/: | … /).filter((x) => x.length >= 3);
      for (const x of tries) { at = low.indexOf(x); if (at >= 0) { out.push({ s: at, e: at + x.length, k }); hit = true; if (x === ex) break; } }
    }
    if (hit) continue;
    let at: number;
    const kw = t.keyword?.toLowerCase().replace(/[:.]+$/, "");
    if (!kw || kw.length < 3) continue;
    for (at = low.indexOf(kw); at >= 0; at = low.indexOf(kw, at + kw.length)) out.push({ s: at, e: at + kw.length, k });
  }
  if (q.length >= 2) for (let at = low.indexOf(q); at >= 0; at = low.indexOf(q, at + q.length)) out.push({ s: at, e: at + q.length, k: 0, q: true });
  out.sort((a, b) => a.s - b.s);
  const keep: Range[] = [];
  for (const r of out) if (!keep.length || r.s >= keep[keep.length - 1].e) keep.push(r);
  return keep;
}

function Marked({ text, scene, q }: { text: string; scene: SceneRow; q: string }) {
  const rs = ranges(text, scene, q);
  if (!rs.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  rs.forEach((r, i) => {
    if (r.s > at) parts.push(text.slice(at, r.s));
    parts.push(<mark key={i} className="st-hl" data-k={r.k || undefined} data-q={r.q ? "" : undefined}>{text.slice(r.s, r.e)}</mark>);
    at = r.e;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Excerpt line with the tag keyword highlighted (used outside the reader too). */
export function Keyed({ text, keyword, k }: { text: string; keyword?: string; k: number }) {
  const kw = keyword?.replace(/[:.]+$/, "");
  const at = kw && kw.length >= 3 ? text.toLowerCase().indexOf(kw.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark className="st-hl" data-k={k}>{text.slice(at, at + kw!.length)}</mark>{text.slice(at + kw!.length)}</>;
}

export function SceneReader({ slug, scene, canEdit, hasText, q, focusBlock }: { slug: string; scene: SceneRow; canEdit: boolean; hasText: boolean; q: string; focusBlock?: number }) {
  const toast = useToast();
  const [blocks, setBlocks] = useState<Block[] | null | undefined>(hasText ? undefined : null);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ text: string; top: number; left: number; width: number } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasText) return;
    let live = true;
    readSceneText(slug, scene.id).then((r) => { if (!live) return; if (r.ok) setBlocks(r.blocks); else setError(r.error); });
    return () => { live = false; };
  }, [slug, scene.id, hasText]);

  useEffect(() => {
    if (!blocks) return;
    const el = (focusBlock != null && root.current?.querySelector(`[data-b="${focusBlock}"]`)) || root.current?.querySelector("mark.st-hl");
    if (el) el.scrollIntoView({ block: "center" }); else root.current?.closest(".drawer > div")?.scrollTo(0, 0);
  }, [blocks, focusBlock]);

  useEffect(() => {
    if (!canEdit) return;
    const onSel = () => {
      const s = window.getSelection();
      const inside = !!s && !s.isCollapsed && !!root.current && root.current.contains(s.anchorNode) && root.current.contains(s.focusNode);
      if (inside) {
        const r = s!.getRangeAt(0).getBoundingClientRect();
        const text = s!.toString().replace(/\s+/g, " ").trim();
        if (!text) return setSel(null);
        // clamp the bar to the drawer (it is centred on `left`)
        const d = root.current!.closest(".drawer")?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth, width: window.innerWidth };
        const width = Math.min(336, d.width - 16);
        setSel({ text, top: r.top > 120 ? r.top - 8 : r.bottom + 8, width, left: Math.min(Math.max(r.left + r.width / 2, d.left + 8 + width / 2), d.right - 8 - width / 2) });
      } else if (!bar.current?.contains(document.activeElement)) setSel(null);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [canEdit]);

  // First Esc only dismisses the tag bar; the drawer ignores defaultPrevented keys.
  useEffect(() => {
    if (!sel) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setSel(null);
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("keydown", onEsc, true);
    return () => document.removeEventListener("keydown", onEsc, true);
  }, [sel]);

  async function tag(kind: TagKind) {
    if (!sel || busy) return;
    setBusy(true);
    const r = await tagFromSelection(slug, scene.id, kind, sel.text, note);
    setBusy(false);
    toast(r.ok ? { message: `Tag ${TAG_LABEL[kind]} ditambahkan.` } : { message: r.error, tone: "error" });
    if (r.ok) { setSel(null); setNote(""); window.getSelection()?.removeAllRanges(); }
  }

  if (!hasText) {
    return (
      <div className="notice space-y-2 text-sm">
        <p>Naskah ini tersimpan tanpa teks. Unggah ulang PDF-nya untuk menambah teks.</p>
        {canEdit && <Link href={`/admin/p/${slug}/script?new`} className="btn-secondary">Buka area unggah</Link>}
      </div>
    );
  }
  if (error) return <p className="tag tag-danger">{error}</p>;
  if (blocks === undefined) return <p className="muted text-sm">Memuat teks…</p>;
  if (!blocks || !blocks.length) return <p className="muted text-sm">Adegan ini tidak punya teks.</p>;
  return (
    <div ref={root} className="st-page" >
      {blocks.map((b, i) => (
        <p key={i} data-b={i} data-t={b.t} className="st-b">
          {b.t === "cue" ? <><Marked text={b.text} scene={scene} q={q.trim().toLowerCase()} />{b.ext && <span className="st-ext"> ({b.ext})</span>}</> : <Marked text={b.text} scene={scene} q={q.trim().toLowerCase()} />}
        </p>
      ))}
      {sel && (
        <div ref={bar} className="st-bar" role="group" aria-label="Tambah tag dari teks terpilih" style={{ top: sel.top, left: sel.left, width: sel.width }} onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
          <div className="st-kinds">
            {TAG_KINDS.map((k, i) => <button key={k} type="button" data-k={i + 1} disabled={busy} onClick={() => tag(k)}>{TAG_LABEL[k]}</button>)}
          </div>
          <input aria-label="Catatan tag (opsional)" placeholder="Catatan (opsional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </div>
  );
}
