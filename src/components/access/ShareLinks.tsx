"use client";

import { useState } from "react";
import { createShareLinkAction, revokeShareLinkAction, updateShareLinkAction } from "@/app/admin/actions";
import { ConfirmButton, CopyButton, Drawer, SubmitButton } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { DEFAULT_SECTIONS, SECTIONS, sectionLabel } from "@/lib/share/sections";

export type ShareRow = { id: string; label: string; note: string; token: string; revokedAt: string | null; sections: string[]; hiddenIds: string[] };
export type HideGroup = { name: string; items: { id: string; name: string }[] };

const summary = (l: ShareRow) => [...SECTIONS.map(([k]) => k).filter((k) => l.sections.includes(k)).map(sectionLabel), ...(l.hiddenIds.length ? [`${l.hiddenIds.length} item disembunyikan`] : [])];

function LinkDrawer({ slug, link, groups, onClose }: { slug: string; link: ShareRow | null; groups: HideGroup[]; onClose: () => void }) {
  const on: string[] = link?.sections ?? DEFAULT_SECTIONS;
  return (
    <Drawer title={link ? "Ubah link" : "Buat link"} crumb="Link view-only" onClose={onClose}>
      <form action={link ? updateShareLinkAction : createShareLinkAction} className="space-y-4 text-sm">
        <input type="hidden" name="slug" value={slug} />
        {link && <input type="hidden" name="linkId" value={link.id} />}
        <label className="grid gap-1">Label (mis. Director, Producer)<input name="label" required maxLength={60} defaultValue={link?.label ?? ""} /></label>
        <label className="grid gap-1">Untuk siapa (opsional, hanya terlihat oleh admin)<input name="note" maxLength={120} defaultValue={link?.note ?? ""} /></label>
        <fieldset className="grid gap-1">
          <legend className="mb-1">Bagian yang ditampilkan</legend>
          {SECTIONS.map(([k, label]) => <label key={k} className="check"><input type="checkbox" name="sections" value={k} defaultChecked={on.includes(k)} /> {label}</label>)}
          <p className="muted text-xs">Anggaran dan Naskah tidak pernah masuk ke link.</p>
        </fieldset>
        <fieldset className="grid gap-1">
          <legend className="mb-1">Sembunyikan item</legend>
          <p className="muted text-xs">Menyembunyikan fase ikut menyembunyikan milestone di dalamnya.</p>
          <div className="max-h-56 space-y-2 overflow-auto">
            {groups.map((g) => (
              <div key={g.name} className="space-y-0.5">
                <div className="text-xs font-semibold text-ink-2">{g.name}</div>
                {g.items.map((i) => <label key={i.id} className="check ps-2"><input type="checkbox" name="hiddenIds" value={i.id} defaultChecked={link?.hiddenIds.includes(i.id)} /> {i.name}</label>)}
              </div>
            ))}
            {groups.length === 0 && <p className="muted text-sm">Belum ada item.</p>}
          </div>
        </fieldset>
        <SubmitButton pendingLabel="Menyimpan…">{link ? "Simpan perubahan" : "Buat link"}</SubmitButton>
      </form>
    </Drawer>
  );
}

export function ShareLinks({ slug, origin, links, groups }: { slug: string; origin: string; links: ShareRow[]; groups: HideGroup[] }) {
  const [open, setOpen] = useState<"new" | ShareRow | null>(null);
  return (
    <>
      {links.length === 0 && <p className="muted mt-3 text-sm">Belum ada link.</p>}
      <ul className="rows mt-3">
        {links.map((l) => (
          <li key={l.id} className="space-y-1.5 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1"><span className="font-medium">{l.label}</span>{l.note && <span className="muted"> · {l.note}</span>}</span>
              {l.revokedAt ? <span className="tag">Dicabut</span> : (
                <>
                  <CopyButton text={`${origin}/v/${l.token}`} label="Salin link" />
                  <button type="button" className="btn-ghost" onClick={() => setOpen(l)}>Ubah</button>
                  <form action={revokeShareLinkAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="linkId" value={l.id} />
                    <ConfirmButton message={`Cabut link "${l.label}"? Yang memegang link ini tidak bisa membukanya lagi.`}>Cabut</ConfirmButton>
                  </form>
                </>
              )}
            </div>
            {!l.revokedAt && <p className="muted text-xs">{summary(l).join(" · ")}</p>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn-ghost mt-3" onClick={() => setOpen("new")}><Icon name="plus" />Buat link</button>
      {open && <LinkDrawer key={open === "new" ? "new" : open.id} slug={slug} link={open === "new" ? null : open} groups={groups} onClose={() => setOpen(null)} />}
    </>
  );
}
