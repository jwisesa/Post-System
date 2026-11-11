"use client";

import { useState } from "react";
import { updateTechSpecAction } from "@/app/admin/actions";
import { TECH_FIELDS, TECH_SECTIONS, type TechSpec } from "@/lib/tech-spec/schema";
import { Combobox } from "./ui/controls";

export type FieldHistory = Record<string, { who: string; when: string; from: string; to: string }[]>;

export function TechForm({ slug, spec, history }: { slug: string; spec: TechSpec; history: FieldHistory }) {
  const [values, setValues] = useState<TechSpec>(spec);
  const set = (key: string, v: string) => setValues((cur) => ({ ...cur, [key]: v }));
  const changed = TECH_FIELDS.filter((f) => (values[f.key] ?? "").trim() !== (spec[f.key] ?? ""));

  return (
    <form action={updateTechSpecAction} className="space-y-4 pb-24">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-4 lg:grid-cols-2">
        {TECH_SECTIONS.map((section) => (
          <section key={section.title} className="card space-y-3">
            <h2>{section.title}</h2>
            {section.fields.map((f) => {
              const isChanged = changed.includes(f);
              const past = history[f.key] ?? [];
              return (
                <div key={f.key}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor={`f-${f.key}`} className="text-xs font-medium text-muted">
                      {f.label} {isChanged && <span className="tag tag-warn ml-1">diubah</span>}
                    </label>
                    {past.length > 0 && (
                      <details className="relative text-xs">
                        <summary className="muted list-none hover:text-ink">Riwayat ({past.length})</summary>
                        <ul className="absolute right-0 z-20 mt-1 w-72 space-y-2 rounded-lg border border-line bg-surface p-3 shadow-lg">
                          {past.map((h, i) => (
                            <li key={i}>
                              <div>{h.from || "—"} → <span className="font-medium">{h.to || "—"}</span></div>
                              <div className="muted">{h.who} · {h.when}</div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  {f.key === "notes" ? (
                    <textarea id={`f-${f.key}`} name={f.key} rows={6} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className={isChanged ? "!border-warn" : undefined} />
                  ) : (
                    <div id={`f-${f.key}`}>
                      <Combobox name={f.key} options={f.options} defaultValue={spec[f.key] ?? ""} placeholder={f.hint} changed={isChanged} onValue={(v) => set(f.key, v)} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:left-56">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {changed.length === 0 ? (
              <span className="muted">Belum ada perubahan.</span>
            ) : (
              <span><span className="font-medium">{changed.length} field diubah:</span> <span className="muted">{changed.map((f) => f.label).join(", ")}</span></span>
            )}
          </div>
          <label className="w-full sm:w-72"><span>Alasan perubahan (opsional)</span><input name="reason" /></label>
          <button className="btn" disabled={changed.length === 0}>Simpan Technical Page</button>
        </div>
      </div>
    </form>
  );
}
