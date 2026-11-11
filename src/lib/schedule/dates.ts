// Calendar dates as "YYYY-MM-DD" strings; arithmetic in UTC so there is no DST drift.
const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(ms(d));
export const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
/** Whole days from a to b (positive when b is later). */
export const diffDays = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);

/** Today for the production team (WIB). */
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const short = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const fmtDate = (d: string) => short.format(ms(d));
export const fmtRange = (start: string, due: string) => (start === due ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(due)}`);
