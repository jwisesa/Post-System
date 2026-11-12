// Working-day arithmetic. A calendar says which days are off (weekends, public holidays);
// phases start and end on working days and keep their working-day length when moved.
import type { ScheduleSettings } from "@/db/schema";
import { addDays, diffDays } from "./dates";
import { nationalHolidays } from "./holidays-id";

export type Cal = { skipWeekends: boolean; holidays: Map<string, string> };

export const NO_CAL: Cal = { skipWeekends: false, holidays: new Map() };

/** Weekends and Indonesian national holidays are blocked unless the project turned that off; the project's own holidays win on the same date. */
export const calOf = (s: ScheduleSettings | null | undefined): Cal => ({
  skipWeekends: s?.skipWeekends ?? true,
  holidays: new Map([
    ...((s?.national ?? true) ? nationalHolidays({ joint: s?.jointLeave ?? true }) : []),
    ...(s?.holidays ?? []).map((h) => [h.date, h.name] as const),
  ]),
});

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const isWeekend = (d: string) => dow(d) === 0 || dow(d) === 6;
export const isOff = (cal: Cal, d: string) => (cal.skipWeekends && isWeekend(d)) || cal.holidays.has(d);

/** d itself when it is a working day, otherwise the nearest one in direction dir. */
export function snap(cal: Cal, d: string, dir: 1 | -1 = 1) {
  // ponytail: gives up after a year of consecutive days off; nobody has that calendar.
  for (let n = 0; n < 366 && isOff(cal, d); n++) d = addDays(d, dir);
  return d;
}

/** Working days in [start, due], both inclusive. */
export function workDays(cal: Cal, start: string, due: string) {
  let n = 0;
  for (let d = start; d <= due; d = addDays(d, 1)) if (!isOff(cal, d)) n++;
  return n;
}

/** The date on which a job of n working days ends when it starts on `start` (a working day). */
export function endAfter(cal: Cal, start: string, n: number) {
  let d = start;
  for (let left = n - 1; left > 0; ) { d = addDays(d, 1); if (!isOff(cal, d)) left--; }
  return d;
}

/** Moves a range so it starts on/after rawStart, keeping its working-day length. */
export function moveKeepingLength(cal: Cal, start: string, due: string, rawStart: string): [string, string] {
  const s = snap(cal, rawStart);
  return [s, endAfter(cal, s, Math.max(1, workDays(cal, start, due)))];
}

export const calendarDays = (start: string, due: string) => diffDays(start, due) + 1;
