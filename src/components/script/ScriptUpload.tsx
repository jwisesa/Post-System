"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveScript } from "@/app/admin/script-actions";
import { Icon } from "@/components/ui/icons";
import { tagCounts } from "@/lib/script/tags";
import { fmtBytes, fmtDuration, TAG_LABEL, type ParsedScene } from "@/lib/script/types";
import { useToast } from "../ui/toast";

type Preview = { title: string; sourceName: string; pages: number; scenes: ParsedScene[]; warnings: string[]; summary: { textBytes: number; scenes: number; characters: number; locations: number; seconds: number; topCharacters: string[] } };

export function ScriptUpload({ slug }: { slug: string }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function load(file?: File) {
    setPreview(null);
    setError("");
    setFile(file ?? null);
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/admin/p/${slug}/script/upload`, { method: "POST", body });
      const data = await res.json().catch(() => ({ error: "Naskah tidak dikenali: respons server tidak terbaca." }));
      if (!res.ok) setError(data.error ?? "Gagal membaca naskah.");
      else setPreview(data);
    } catch {
      setError("Gagal mengunggah file. Periksa koneksi lalu coba lagi.");
    }
    setBusy(false);
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    const { title, sourceName, pages, scenes } = preview; // scenes carry their text blocks
    let r;
    try {
      r = await saveScript(slug, { title, sourceName, pages, scenes });
    } catch {
      setBusy(false);
      return setError("Gagal menyimpan: server menolak atau tidak merespons. Coba lagi; jika berulang, naskah mungkin terlalu besar.");
    }
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast({ message: `Naskah disimpan: ${r.scenes} adegan.` });
    setPreview(null);
    router.push(`/admin/p/${slug}/script?script=${r.scriptId}`);
  }

  return (
    <section className="space-y-4">
      <div className="field">
        <label htmlFor="script-file" className="field-label">File naskah (PDF, maksimal 4 MB)</label>
        <label className="sa-zone" data-over={over ? "" : undefined} data-busy={busy ? "" : undefined}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f && input.current) { const dt = new DataTransfer(); dt.items.add(f); input.current.files = dt.files; load(f); }
          }}>
          <Icon name="upload" />
          <span className="sa-zone-text">
            <span className="font-semibold">{file ? file.name : "Tarik PDF ke sini atau pilih berkas"}</span>
            <span className="muted text-xs">{file ? `${(file.size / 1024 / 1024).toFixed(file.size < 1024 * 1024 ? 2 : 1)} MB. Klik untuk memilih berkas lain.` : "Format PDF, tata letak naskah standar."}</span>
          </span>
          <input ref={input} id="script-file" className="sr-only" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => load(e.target.files?.[0])} />
        </label>
        <span className="field-hint">Teks naskah disimpan dan hanya terlihat oleh anggota project; tidak tampil di link view-only atau link reviewer. File PDF-nya sendiri tidak disimpan.</span>
      </div>
      {busy && !preview && <p className="muted text-sm">Membaca naskah…</p>}
      {error && <p className="tag tag-danger">{error}</p>}
      {preview && (
        <div className="space-y-3">
          <h3 className="section-band">Pratinjau</h3>
          <label className="field"><span className="field-label">Judul naskah</span>
            <input value={preview.title} maxLength={200} onChange={(e) => setPreview({ ...preview, title: e.target.value })} /></label>
          <p className="text-sm tabular-nums">
            {preview.summary.scenes} adegan · {preview.pages} halaman · perkiraan {fmtDuration(preview.summary.seconds)} · {preview.summary.characters} tokoh · {preview.summary.locations} lokasi · teks ± {fmtBytes(preview.summary.textBytes)}
          </p>
          {preview.summary.topCharacters.length > 0 && <p className="muted text-sm">Tokoh utama: {preview.summary.topCharacters.join(", ")}</p>}
          {tagCounts(preview.scenes).length > 0 && (
            <p className="text-sm tabular-nums">{tagCounts(preview.scenes).reduce((n, [, c]) => n + c, 0)} saran tag: {tagCounts(preview.scenes).map(([k, c]) => `${TAG_LABEL[k]} ${c}`).join(", ")}. Saran ditandai ? sampai Anda konfirmasi.</p>
          )}
          {preview.warnings.map((w) => <p key={w} className="tag tag-warn">{w}</p>)}
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={busy || !preview.title.trim()} onClick={save}>{busy ? "Menyimpan…" : "Simpan"}</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setPreview(null)}>Batal</button>
          </div>
        </div>
      )}
    </section>
  );
}
