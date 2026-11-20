"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createTagKind, readSceneText, tagFromSelection } from "@/app/admin/script-actions";
import type { SceneRow } from "@/lib/script/service";
import { TAG_KINDS, type Block, type KindDef } from "@/lib/script/types";
import { useToast } from "../ui/toast";
import { NewKindForm, useKinds } from "./kinds";
import type { TextCache } from "./SceneTable";

type Range = { s: number; e: number; k: number; q?: boolean; n?: boolean };
type Fresh = { k: number; text: string };

/** Highlight ranges inside one block: each tag's excerpt (or, failing that, its keyword) and the active search query. */
function ranges(text: string, scene: SceneRow, q: string, fresh: Fresh | null, colorOf: (kind: string) => number): Range[] {
  const low = text.toLowerCase(), out: Range[] = [];
  for (const t of scene.postTags) {
    const k = colorOf(t.kind);
    // an excerpt is one or more selections joined by " … "; an ADR excerpt joins cue and dialogue as "CUE: text"
    const whole = t.excerpt?.toLowerCase() ?? "";
    const parts = whole.split(" … ").filter(Boolean);
    let hit = false;
    for (const ex of parts) {
      let at = low.indexOf(ex);
      const tries = at >= 0 ? [ex] : ex.split(/: | … /).filter((x) => x.length >= 3);
      for (const x of tries) { at = low.indexOf(x); if (at >= 0) { out.push({ s: at, e: at + x.length, k, n: !!fresh && fresh.k === k && x === fresh.text }); hit = true; if (x === ex) break; } }
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

function Marked({ text, scene, q, fresh }: { text: string; scene: SceneRow; q: string; fresh: Fresh | null }) {
  const { of } = useKinds();
  const rs = ranges(text, scene, q, fresh, (k) => of(k).color);
  if (!rs.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  rs.forEach((r, i) => {
    if (r.s > at) parts.push(text.slice(at, r.s));
    parts.push(<mark key={i} className="st-hl" data-k={r.k || undefined} data-q={r.q ? "" : undefined} data-new={r.n ? "" : undefined}>{text.slice(r.s, r.e)}</mark>);
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

export function SceneReader({ slug, scene, canEdit, hasText, q, focusBlock, texts, nextId }: { slug: string; scene: SceneRow; canEdit: boolean; hasText: boolean; q: string; focusBlock?: number; texts: TextCache; nextId?: string }) {
  const toast = useToast();
  const { kinds, of } = useKinds();
  const [naming, setNaming] = useState(false);
  const [blocks, setBlocks] = useState<Block[] | null | undefined>(hasText ? texts.get(scene.id) : null);
  const [fresh, setFresh] = useState<Fresh | null>(null); // the highlight just created: pulses once
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ text: string; top: number; left: number; width: number } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasText) return;
    let live = true;
    const warm = () => { if (nextId && !texts.has(nextId)) readSceneText(slug, nextId).then((r) => { if (r.ok && r.blocks) texts.set(nextId, r.blocks); }); };
    if (texts.has(scene.id)) { warm(); return; }
    readSceneText(slug, scene.id).then((r) => { if (!live) return; if (r.ok) { if (r.blocks) texts.set(scene.id, r.blocks); setBlocks(r.blocks); warm(); } else setError(r.error); });
    return () => { live = false; };
  }, [slug, scene.id, hasText, texts, nextId]);

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

  const tagRef = useRef(tag);
  useEffect(() => { tagRef.current = tag; });
  // keys 1-7 tag the selection while the bar is open (not while typing the note)
  const barOpen = !!sel;
  useEffect(() => {
    if (!barOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const k = TAG_KINDS[Number(e.key) - 1];
      if (!k || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.matches?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault(); tagRef.current(k);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [barOpen]);

  async function tag(kind: string, def?: KindDef) {
    if (!sel || busy) return;
    setBusy(true);
    const r = await tagFromSelection(slug, scene.id, kind, sel.text, note);
    setBusy(false);
    const d = def ?? of(kind);
    toast(r.ok ? { message: `Tag ${d.label} ditambahkan.` } : { message: r.error, tone: "error" });
    if (r.ok) { setFresh({ k: d.color, text: sel.text.toLowerCase() }); setTimeout(() => setFresh(null), 500); setSel(null); setNaming(false); setNote(""); window.getSelection()?.removeAllRanges(); }
    return r.ok;
  }

  /** "+ Jenis baru": creates the kind and tags the current selection with it in one step. */
  async function createAndTag(v: { label: string; color: number }) {
    if (!sel) return false;
    const c = await createTagKind(slug, v);
    if (!c.ok) { toast({ message: c.error, tone: "error" }); return false; }
    return !!(await tag(c.key, { key: c.key, label: v.label.trim().replace(/\s+/g, " "), color: v.color, builtin: false }));
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
          {b.t === "cue" ? <><Marked text={b.text} scene={scene} q={q.trim().toLowerCase()} fresh={fresh} />{b.ext && <span className="st-ext"> ({b.ext})</span>}</> : <Marked text={b.text} scene={scene} q={q.trim().toLowerCase()} fresh={fresh} />}
        </p>
      ))}
      {sel && (
        <div ref={bar} className="st-bar" role="group" aria-label="Tambah tag dari teks terpilih" style={{ top: sel.top, left: sel.left, width: sel.width }} onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
          <p className="st-sel text-xs">“{sel.text.slice(0, 40)}{sel.text.length > 40 ? "…" : ""}” → tandai sebagai</p>
          <div className="st-kinds">
            {kinds.map((k) => <button key={k.key} type="button" data-k={k.color} disabled={busy} title={k.builtin ? `Tombol ${TAG_KINDS.indexOf(k.key as never) + 1}` : undefined} onClick={() => tag(k.key)}>{k.label}</button>)}
            <button type="button" className="st-new" disabled={busy} aria-expanded={naming} onClick={() => setNaming(!naming)}>+ Jenis baru</button>
          </div>
          {naming && <NewKindForm inBar label="Buat & tandai" onCreate={createAndTag} onCancel={() => setNaming(false)} />}
          <input aria-label="Catatan tag (opsional)" placeholder="Catatan (opsional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </div>
  );
}
