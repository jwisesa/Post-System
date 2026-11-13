"use client";

import { useState } from "react";
import { updateTechSpecAction } from "@/app/admin/actions";
import { MAX_CAMERAS, TECH_FIELDS, TECH_SECTIONS, cameraKeys, fieldApplies, type TechField, type TechSpec } from "@/lib/tech-spec/schema";
import { Icon } from "./ui/icons";
import { Combobox } from "./ui/controls";

export type FieldHistory = Record<string, { who: string; when: string; from: string; to: string }[]>;

export function TechForm({ slug, spec, history }: { slug: string; spec: TechSpec; history: FieldHistory }) {
  const [values, setValues] = useState<TechSpec>(spec);
  const set = (key: string, v: string) => setValues((cur) => ({ ...cur, [key]: v }));
  const lastWithData = Array.from({ length: MAX_CAMERAS }, (_, i) => i + 1).filter((n) => cameraKeys(n).some((k) => spec[k])).pop() ?? 1;
  const [cams, setCams] = useState(lastWithData);
  const visible = (f: TechField) => {
    const n = /^cam(\d)_/.exec(f.key)?.[1] ?? (f.key === "sourceFormat" ? "1" : "");
    if (n && Number(n) > cams) return false;
    return !n || fieldApplies(f, values[`cam${n}_media`]);
  };
  const count = (section: (typeof TECH_SECTIONS)[number]) => {
    const fields = section.fields.filter(visible);
    return `${fields.filter((f) => (values[f.key] ?? "").trim()).length}/${fields.length}`;
  };
  const changed = TECH_FIELDS.filter((f) => (values[f.key] ?? "").trim() !== (spec[f.key] ?? ""));

  return (
    <form action={updateTechSpecAction} className="space-y-4 pb-32 md:pb-24">
      <input type="hidden" name="slug" value={slug} />
      {/* hidden fields (other media, unused cameras) keep their stored values */}
      {TECH_FIELDS.filter((f) => !visible(f) && values[f.key]).map((f) => <input key={f.key} type="hidden" name={f.key} value={values[f.key]} />)}
      <div className="gap-8 lg:grid lg:grid-cols-[12rem_1fr]">
        <nav className="sticky top-4 hidden max-h-[calc(100dvh-8rem)] self-start overflow-y-auto lg:block">
          <ul className="space-y-0.5">
            {TECH_SECTIONS.map((section, i) => (
              <li key={section.key}><a href={`#sec-${section.key}`} data-ph={(i % 8) + 1} className="index-link">{section.title}<span className="num">{count(section)}</span></a></li>
            ))}
          </ul>
        </nav>
        <div className="space-y-8">
        {TECH_SECTIONS.map((section, i) => {
          const fields = section.fields.filter(visible);
          const filled = fields.filter((f) => (values[f.key] ?? "").trim()).length;
          return (
          <details key={section.key} id={`sec-${section.key}`} open className="card scroll-mt-4" data-ph={(i % 8) + 1}>
            <summary className="section-band cursor-pointer">
              <h2>{section.title}</h2>
              <span className="section-count">{filled}/{fields.length} terisi</span>
            </summary>
            <div className="mt-4 grid gap-x-6 gap-y-4 md:grid-cols-2">
            {fields.map((f) => {
              const isChanged = changed.includes(f);
              const past = history[f.key] ?? [];
              return (
                <div key={f.key} className={f.key.endsWith("notes") ? "md:col-span-2" : undefined}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor={`f-${f.key}`} className="text-xs font-semibold text-ink-2">
                      {f.label} {isChanged && <span className="tag tag-warn ml-1">diubah</span>}
                    </label>
                    {past.length > 0 && (
                      <details className="relative text-xs">
                        <summary className="list-none text-ink-2 underline hover:text-ink">Riwayat ({past.length})</summary>
                        <ul className="popover absolute right-0 z-20 mt-1 max-h-72 w-72 max-w-[calc(100vw-2rem)] space-y-2 overflow-auto overscroll-contain p-3">
                          {past.map((h, i) => (
                            <li key={i}>
                              <div>{h.from || "—"} <Icon name="chevron" className="inline" /> <span className="font-medium">{h.to || "—"}</span></div>
                              <div className="muted">{h.who} · {h.when}</div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  {f.key.endsWith("notes") ? (
                    <textarea id={`f-${f.key}`} name={f.key} rows={6} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className={isChanged ? "is-changed" : undefined} />
                  ) : (
                    <div id={`f-${f.key}`}>
                      <Combobox name={f.key} options={f.options} inputMode={f.key === "handles" || f.key === "vfx_start_frame" ? "numeric" : undefined} defaultValue={spec[f.key] ?? ""} placeholder={f.hint} changed={isChanged} onValue={(v) => set(f.key, v)} />
                    </div>
                  )}
                </div>
              );
            })}
            {section.key === "camera" && cams < MAX_CAMERAS && (
              <button type="button" className="btn-secondary self-start" onClick={() => setCams(cams + 1)}>Tambah kamera</button>
            )}
            </div>
          </details>
          );
        })}
        </div>
      </div>
      <div className="board fixed inset-x-0 bottom-0 z-20 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:left-(--sidebar-w) md:pt-3 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2 md:flex-wrap md:gap-3">
          <div className="hidden min-w-0 flex-1 text-sm md:block">
            {changed.length === 0 ? (
              <span className="muted">Belum ada perubahan.</span>
            ) : (
              <span><span className="font-medium">{changed.length} field diubah:</span> <span className="muted">{changed.map((f) => f.label).join(", ")}</span></span>
            )}
          </div>
          <label className="min-w-0 flex-1 md:w-72 md:flex-none"><span className="sr-only md:not-sr-only">Alasan perubahan (opsional)</span><input name="reason" placeholder="Alasan perubahan (opsional)" /></label>
          <button className="btn shrink-0" disabled={changed.length === 0}>Simpan Technical Page</button>
        </div>
      </div>
    </form>
  );
}
