// Drive capacity calculator. Bytes are floats: this is an ESTIMATE (only money must be integer).
import { z } from "zod";
import { isFilm } from "../tech-spec/schema";
import type { DriveSummary } from "../drive-tracker/service";
import { autoRate, type RateRow } from "./datarates";

export type Stage = "ocf" | "proxy" | "grade" | "vfx" | "master" | "archive";
export const STAGES: Stage[] = ["ocf", "proxy", "grade", "vfx", "master", "archive"];
export const STAGE_LABEL: Record<Stage, string> = { ocf: "OCF (kamera)", proxy: "Proxy", grade: "Grading", vfx: "VFX", master: "Master", archive: "Arsip" };

export type CamInput = { id: string; label: string; slot?: number; rateId?: string; mbps?: number; fps: number; units: number; minutesPerDay: number; days?: number; note?: string };
export type DriveCalc = {
  shootDays: number; cameras: CamInput[]; ocfCopies: number;
  proxy: { rateId?: string; mbps?: number; copies: number };
  gradePct: number; gradeCopies: number; vfxTb: number; vfxCopies: number;
  master: { rateId?: string; mbps?: number; runtimeMin: number; versions: number; copies: number };
  archiveCopies: number; overheadPct: number; fillPct: number; driveTb: Partial<Record<Stage, number>>;
};

const n = (min: number, max: number) => z.number().min(min).max(max);
const i = (min: number, max: number) => z.number().int().min(min).max(max);
const rate = { rateId: z.string().max(80).optional(), mbps: n(0, 100000).optional() };
export const calcSchema = z.object({
  shootDays: i(0, 365),
  cameras: z.array(z.object({ id: z.string().max(40), label: z.string().max(80), slot: i(1, 4).optional(), ...rate, fps: n(1, 240), units: i(1, 20), minutesPerDay: n(0, 1440), days: i(0, 365).optional(), note: z.string().max(200).optional() })).max(12),
  ocfCopies: i(1, 10),
  proxy: z.object({ ...rate, copies: i(0, 10) }),
  gradePct: n(0, 1000), gradeCopies: i(0, 10), vfxTb: n(0, 10000), vfxCopies: i(0, 10),
  master: z.object({ ...rate, runtimeMin: n(0, 1000), versions: i(0, 50), copies: i(0, 10) }),
  archiveCopies: i(0, 10), overheadPct: n(0, 100), fillPct: n(10, 100),
  driveTb: z.object(Object.fromEntries(STAGES.map((s) => [s, n(0.1, 1000).optional()]))),
});

const num = (s: string | undefined) => { const v = Number((s ?? "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : undefined; };

export function seedCalc(tech: Record<string, string>, rates: RateRow[]): DriveCalc {
  const t = (k: string) => (tech[k] ?? "").trim();
  const projFps = num(t("frameRate")) ?? 24;
  const cameras: CamInput[] = [];
  for (let c = 1; c <= 4; c++) {
    const model = t(`cam${c}_model`);
    if (!model) continue;
    const fps = num(t(`cam${c}_fps`)) ?? projFps;
    const base = { id: `cam${c}`, label: model, slot: c, fps, units: 1, minutesPerDay: 0 };
    if (isFilm(t(`cam${c}_media`))) { cameras.push({ ...base, mbps: 0, note: "Kamera film: isi data scan manual" }); continue; }
    const r = autoRate(rates, { model, format: t(c === 1 ? "sourceFormat" : `cam${c}_format`), res: t(`cam${c}_res`) });
    cameras.push(r ? { ...base, rateId: r.id } : base);
  }
  const proxy = autoRate(rates, { format: t("proxyCodec"), res: t("offline_res") });
  const master = autoRate(rates, { format: t("onlineCodec"), res: t("masterResolution") });
  const backups = ["dit_backup1", "dit_backup2"].filter((k) => t(k)).length;
  return {
    shootDays: 0, cameras, ocfCopies: Math.max(2, 1 + backups),
    proxy: { ...(proxy ? { rateId: proxy.id } : {}), copies: 2 },
    gradePct: 0, gradeCopies: 2, vfxTb: 0, vfxCopies: 2,
    master: { ...(master ? { rateId: master.id } : {}), runtimeMin: 0, versions: 1, copies: 2 },
    archiveCopies: 2, overheadPct: 10, fillPct: 80, driveTb: {},
  };
}

export type NeedRow = { stage: Stage; raw: number; perCopy: number; copies: number; total: number; capacity: number; drives: number | null };
const TB = 1e12;

/** Bytes per second at a given fps. A manual mbps is taken as-is; a table rate scales linearly with fps ("estimasi linear"). */
function bps(x: { rateId?: string; mbps?: number }, fps: number, rates: RateRow[]): number {
  const r = x.rateId ? rates.find((q) => q.id === x.rateId) : undefined;
  if (x.mbps != null) return (x.mbps * 1e6) / 8;
  return r ? ((r.mbps * 1e6) / 8) * (fps / r.refFps) : 0;
}

export function computeNeed(c: DriveCalc, rates: RateRow[]): { rows: NeedRow[]; total: number; capacity: number } {
  let ocf = 0, seconds = 0;
  for (const cam of c.cameras) {
    const s = cam.minutesPerDay * 60 * (cam.days ?? c.shootDays) * cam.units;
    seconds += s; ocf += bps(cam, cam.fps, rates) * s;
  }
  const projFps = c.cameras[0]?.fps ?? 24;
  const proxy = bps(c.proxy, projFps, rates) * seconds;
  const master = bps(c.master, projFps, rates) * c.master.runtimeMin * 60 * c.master.versions;
  const spec: Record<Stage, [number, number]> = {
    ocf: [ocf, c.ocfCopies], proxy: [proxy, c.proxy.copies], grade: [(ocf * c.gradePct) / 100, c.gradeCopies],
    vfx: [c.vfxTb * TB, c.vfxCopies], master: [master, c.master.copies], archive: [ocf + master, c.archiveCopies],
  };
  const fill = c.fillPct / 100;
  const rows = STAGES.map((stage): NeedRow => {
    const [raw, copies] = spec[stage];
    const perCopy = raw * (1 + c.overheadPct / 100);
    const dtb = c.driveTb[stage];
    return { stage, raw, perCopy, copies, total: perCopy * copies, capacity: (perCopy * copies) / fill, drives: dtb ? copies * Math.ceil(perCopy / (dtb * TB * fill) - 1e-9) : null };
  });
  return { rows, total: rows.reduce((a, r) => a + r.total, 0), capacity: rows.reduce((a, r) => a + r.capacity, 0) };
}

export type TrackerCompare =
  | { state: "unlinked" }
  | { state: "unavailable"; reason: string }
  | { state: "ok"; plannedDrives: number; recordedDrives: number; recordedBytes: number; pct: number | null };

/** Planned OCF drives (shopping list, not cancelled) against raw + backup drives and content bytes recorded in drive-tracker. Content recorded, never free space. */
export function compareTracker(need: { rows: NeedRow[] }, lines: { purpose: string; qty: number; status: string }[], summary: DriveSummary): TrackerCompare {
  if (summary.state !== "ok") return summary;
  const o = need.rows.find((r) => r.stage === "ocf")!;
  const expected = o.raw * o.copies;
  return {
    state: "ok",
    plannedDrives: lines.filter((l) => l.purpose === "ocf" && l.status !== "cancelled").reduce((a, l) => a + l.qty, 0),
    recordedDrives: summary.rawDrives + summary.backupDrives,
    recordedBytes: summary.totalBytes,
    pct: expected > 0 ? Math.round((summary.totalBytes / expected) * 100) : null,
  };
}

export const fmtTb = (bytes: number) => (bytes / TB).toLocaleString("id-ID", { maximumFractionDigits: 2 });
export const fmtTib = (bytes: number) => (bytes / 2 ** 40).toLocaleString("id-ID", { maximumFractionDigits: 2 });
