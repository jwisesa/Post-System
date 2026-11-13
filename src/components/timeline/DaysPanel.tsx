"use client";

import { useState } from "react";
import { saveSettingsAction } from "@/app/admin/schedule-actions";
import type { ScheduleSettings } from "@/db/schema";
import { fmtDate } from "@/lib/schedule/dates";
import { HOLIDAY_YEARS } from "@/lib/schedule/holidays-id";
import { blockedEntries, HOLIDAY_KIND_LABEL, hoursPerDayOf, type Cal } from "@/lib/schedule/workdays";
import { Icon } from "../ui/icons";

const WEEKDAY = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" });
const at = (d: string) => new Date(`${d}T00:00:00Z`);

function SettingsForm({ slug, settings }: { slug: string; settings: ScheduleSettings }) {
  const [holidays, setHolidays] = useState(settings.holidays ?? []);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const add = (rows: { date: string; name: string }[]) => setHolidays((h) => [...new Map([...h, ...rows].map((r) => [r.date, r])).values()].sort((a, b) => a.date.localeCompare(b.date)));
  return (
    <form action={saveSettingsAction} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="holidays" value={JSON.stringify(holidays)} />
      <h3>Aturan hari kerja</h3>
      <label className="check"><input type="checkbox" name="skipWeekends" defaultChecked={settings.skipWeekends !== false} /> Blokir Sabtu dan Minggu</label>
      <label className="check"><input type="checkbox" name="national" defaultChecked={settings.national !== false} /> Libur nasional Indonesia</label>
      <label className="check"><input type="checkbox" name="jointLeave" defaultChecked={settings.jointLeave !== false} /> Termasuk cuti bersama</label>
      <p className="muted text-xs">Tanggal libur nasional tersedia untuk {HOLIDAY_YEARS.join(", ")}. Tahun di luar daftar ini perlu diisi manual.</p>
      <label className="check"><input type="checkbox" name="cascade" defaultChecked={Boolean(settings.cascade)} /> Geser otomatis item yang bergantung</label>
      <label className="max-w-40">
        <span>Jam kerja per hari</span>
        <input name="hoursPerDay" type="number" min={1} max={24} step={1} defaultValue={hoursPerDayOf(settings)} />
      </label>
      <p className="muted text-xs">Dipakai untuk mengubah jam kerja sebuah fase menjadi hari kerja (1 sampai 24). Fase selalu mulai dan selesai di hari kerja, dan jumlah hari kerjanya tetap saat digeser. Jadwal yang sudah ada tidak diubah sampai Anda menggesernya.</p>
      <div>
        <div className="mb-1 text-xs font-semibold text-ink-2">Libur tambahan {holidays.length > 0 && `(${holidays.length})`}</div>
        {holidays.length > 0 && (
          <ul className="rows mb-2 max-h-44 overflow-y-auto text-sm">
            {holidays.map((h) => (
              <li key={h.date} className="flex items-center gap-2 py-1">
                <span className="w-24 shrink-0 text-muted tabular-nums">{fmtDate(h.date)}</span>
                <span className="min-w-0 flex-1 truncate">{h.name || "Libur"}</span>
                <button type="button" className="btn-ghost !min-h-6 !px-1" aria-label={`Hapus libur ${fmtDate(h.date)}`} onClick={() => setHolidays((x) => x.filter((r) => r.date !== h.date))}><Icon name="close" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[9.5rem_1fr_auto]">
          <input type="date" aria-label="Tanggal libur" value={date} onChange={(e) => setDate(e.target.value)} />
          <input aria-label="Nama libur" placeholder="Nama, mis. Idul Fitri" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (date) { add([{ date, name }]); setDate(""); setName(""); } } }} />
          <button type="button" className="btn-secondary col-span-2 sm:col-span-1" disabled={!date} onClick={() => { add([{ date, name }]); setDate(""); setName(""); }}>Tambah</button>
        </div>
        <p className="muted text-xs">Hari libur khusus produksi, mis. hari libur lokasi syuting atau tim.</p>
      </div>
      <button className="btn-secondary">Simpan aturan hari kerja</button>
    </form>
  );
}

/** "Hari kerja & libur": the rules, plus a read-only list of every blocked date in the project's range. */
export function DaysPanel({ slug, settings, cal, from, to, editable }: { slug: string; settings: ScheduleSettings; cal: Cal; from: string; to: string; editable: boolean }) {
  const entries = blockedEntries(cal, from, to);
  const groups = new Map<string, typeof entries>();
  for (const e of entries) groups.set(e.date.slice(0, 7), [...(groups.get(e.date.slice(0, 7)) ?? []), e]);
  const years = [...new Set([...groups.keys()].map((k) => k.slice(0, 4)))];
  return (
    <>
      {editable && <SettingsForm slug={slug} settings={settings} />}
      <section className="space-y-3 hairline pt-4">
        <h3>Hari yang diblokir {fmtDate(from).replace(/^\d+ /, "")} sampai {fmtDate(to).replace(/^\d+ /, "")}</h3>
        <p className="text-sm">{cal.skipWeekends ? "Sabtu & Minggu diblokir." : "Sabtu & Minggu tidak diblokir."} {entries.length} hari libur di rentang jadwal.</p>
        {entries.length === 0 && <p className="muted text-sm">Tidak ada hari libur di rentang ini.</p>}
        {years.map((y) => (
          <div key={y} className="space-y-2">
            <h4 className="font-display text-base font-semibold tabular-nums">{y}</h4>
            {[...groups].filter(([k]) => k.startsWith(y)).map(([k, list]) => (
              <div key={k}>
                <div className="mb-0.5 text-xs font-semibold capitalize text-ink-2">{MONTH.format(at(`${k}-01`))}</div>
                <ul className="rows text-sm">
                  {list.map((e) => (
                    <li key={e.date} className="flex items-baseline gap-2 py-1">
                      <span className="w-24 shrink-0 tabular-nums">{WEEKDAY.format(at(e.date)).slice(0, 3)}, {Number(e.date.slice(8))}</span>
                      <span className="min-w-0 flex-1">{e.name}</span>
                      <span className="shrink-0 text-xs text-ink-2">{HOLIDAY_KIND_LABEL[e.kind]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </section>
    </>
  );
}
