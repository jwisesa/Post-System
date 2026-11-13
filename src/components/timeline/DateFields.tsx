"use client";

import { useState } from "react";
import { addDays } from "@/lib/schedule/dates";
import { daysForHours, endAfter, snap, workDays, type Cal } from "@/lib/schedule/workdays";
import { Icon } from "../ui/icons";

/** A date input with - / + buttons that step one working day. */
function DateStepper({ label, name, value, onChange, cal }: { label: string; name: string; value: string; onChange: (d: string) => void; cal: Cal }) {
  const step = (dir: 1 | -1) => value && onChange(snap(cal, addDays(value, dir), dir));
  return (
    <div className="tl-stepper">
      <label className="min-w-0"><span>{label}</span><input name={name} type="date" required value={value} onChange={(e) => onChange(e.target.value)} /></label>
      <button type="button" className="btn-secondary btn-icon" aria-label={`${label} mundur satu hari kerja`} onClick={() => step(-1)}><Icon name="minus" /></button>
      <button type="button" className="btn-secondary btn-icon" aria-label={`${label} maju satu hari kerja`} onClick={() => step(1)}><Icon name="plus" /></button>
    </div>
  );
}

/** A milestone is one date: the same value goes to both ends. */
export function MilestoneDate({ value, cal }: { value: string; cal: Cal }) {
  const [d, setD] = useState(value);
  return (
    <>
      <DateStepper label="Tanggal" name="startDate" value={d} onChange={setD} cal={cal} />
      <input type="hidden" name="dueDate" value={d} />
    </>
  );
}

/**
 * Start, end and duration of a phase. Duration is typed in working days (clears the planned hours) or in
 * working hours (kept as planned effort; the end date follows). Editing dates keeps the hours as typed.
 */
export function PhaseDates({ cal, start: s0, due: d0, workHours }: { cal: Cal; start: string; due: string; workHours: number | null }) {
  const [start, setStart] = useState(s0);
  const [due, setDue] = useState(d0);
  const [hours, setHours] = useState<number | null>(workHours);
  const [unit, setUnit] = useState<"days" | "hours">(workHours ? "hours" : "days");
  const days = start && due && start <= due ? workDays(cal, start, due) : 0;
  const hpd = cal.hoursPerDay;
  const num = (v: string) => { const n = Math.floor(Number(v)); return n >= 1 ? n : null; };
  const setUnitTo = (u: "days" | "hours") => { setUnit(u); setHours(u === "days" ? null : Math.max(1, days) * hpd); };
  const type = (v: string) => {
    const n = num(v);
    if (n === null || !start) return unit === "hours" ? setHours(null) : undefined;
    if (unit === "hours") { setHours(n); setDue(endAfter(cal, start, daysForHours(cal, n))); }
    else { setHours(null); setDue(endAfter(cal, start, n)); }
  };
  const over = hours !== null && hours > days * hpd;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateStepper label="Mulai" name="startDate" value={start} onChange={setStart} cal={cal} />
        <DateStepper label="Selesai" name="dueDate" value={due} onChange={setDue} cal={cal} />
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-28"><span>Durasi</span><input type="number" min={1} step={1} value={(unit === "hours" ? hours : days) ?? ""} onChange={(e) => type(e.target.value)} /></label>
          <div role="group" aria-label="Satuan durasi" className="seg">
            <button type="button" aria-pressed={unit === "days"} onClick={() => setUnitTo("days")}>Hari kerja</button>
            <button type="button" aria-pressed={unit === "hours"} onClick={() => setUnitTo("hours")}>Jam kerja</button>
          </div>
        </div>
        <input type="hidden" name="workHours" value={hours ?? ""} />
        <p className={`text-xs ${over ? "text-warn" : "text-ink-2"}`} data-testid="capacity">
          {hours !== null
            ? `${hours} jam direncanakan · kapasitas ${days} hari × ${hpd} jam = ${days * hpd} jam${over ? ". Melebihi kapasitas." : ""}`
            : `${days} hari kerja · ${hpd} jam per hari`}
        </p>
      </div>
    </>
  );
}
