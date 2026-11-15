// CMX3600 EDL -> shot list -> pull list / VFX breakdown rows. Pure functions; runs in the browser.

export type EdlEvent = {
  num: string;
  reel: string;
  track: string;
  transition: string;
  srcIn: string;
  srcOut: string;
  recIn: string;
  recOut: string;
  clipName: string;
  sourceFile: string;
  /** Marker name from `* LOC:` or a Resolve `|M:` line; empty when the event has none. */
  locator: string;
  locatorColor: string;
  retime: string;
  comments: string[];
};

/** `fps` is set when the file states its own rate (XML/FCPXML); an EDL does not. */
export type Edl = { title: string; dropFrame: boolean; maxFrame: number; fps?: string; events: EdlEvent[] };

const TC = /\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2}/g;
const after = (line: string, key: RegExp) => line.replace(key, "").trim();

export function parseEdl(text: string): Edl {
  const edl: Edl = { title: "", dropFrame: false, maxFrame: 0, events: [] };
  let cur: EdlEvent | null = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const t = raw.trim();
    if (!t) continue;
    if (/^TITLE\s*:/i.test(t)) { edl.title = after(t, /^TITLE\s*:/i); continue; }
    if (/^FCM\s*:/i.test(t)) { edl.dropFrame = /^FCM\s*:\s*DROP/i.test(t); continue; }

    const tcs = t.match(TC);
    if (/^\d{1,6}\s/.test(t) && tcs && tcs.length >= 4) {
      const [num, reel = "", track = "V", t3 = "C", t4] = t.slice(0, t.indexOf(tcs[0])).trim().split(/\s+/);
      if (!/^V/i.test(track)) { cur = null; continue; } // audio events are not shots
      const [srcIn, srcOut, recIn, recOut] = tcs.slice(-4);
      for (const tc of [srcIn, srcOut, recIn, recOut]) edl.maxFrame = Math.max(edl.maxFrame, Number(tc.slice(-2)));
      cur = {
        num, reel, track, transition: /^[DW]/i.test(t3) && t4 ? `${t3}${t4}` : t3,
        srcIn, srcOut, recIn, recOut, clipName: reel, sourceFile: "", locator: "", locatorColor: "", retime: "", comments: [],
      };
      edl.events.push(cur);
      continue;
    }
    if (!cur) continue;

    if (/^M2\s/i.test(t)) { cur.retime = `${t.split(/\s+/)[2] ?? ""} fps`; continue; }
    const resolve = t.match(/\|M:([^|]*)/); // Resolve marker line: |C:ResolveColorBlue |M:VFX_010 |D:1
    if (resolve) {
      cur.locator = resolve[1].trim();
      cur.locatorColor = (t.match(/\|C:(?:ResolveColor)?([^|\s]*)/)?.[1] ?? "").toUpperCase();
      continue;
    }
    const c = t.replace(/^\*\s*/, "");
    if (/^LOC\s*:/i.test(c)) {
      const m = after(c, /^LOC\s*:/i).match(/^(\S+)\s+(\S+)\s*(.*)$/); // tc, colour, name
      cur.locatorColor = m?.[2] ?? "";
      cur.locator = (m?.[3] || m?.[2] || "").trim();
    } else if (/^FROM CLIP NAME\s*:/i.test(c)) cur.clipName = after(c, /^FROM CLIP NAME\s*:/i) || cur.clipName;
    else if (/^(SOURCE FILE|SRC FILE|SOURCE)\s*:/i.test(c)) cur.sourceFile = after(c, /^(SOURCE FILE|SRC FILE|SOURCE)\s*:/i).split(/[/\\]/).pop() ?? "";
    else if (/^SPEED\s*:/i.test(c)) cur.retime = after(c, /^SPEED\s*:/i);
    else if (t.startsWith("*")) cur.comments.push(c);
  }
  return edl;
}

// ponytail: non-drop-frame maths only (24/25/30 and their 1000/1001 variants counted as NDF).
// Drop-frame EDLs get a warning in the UI; add DF conversion if 29.97 DF delivery ever matters.
const base = (fps: number) => Math.round(fps);

export function tcToFrames(tc: string, fps: number) {
  const [h, m, s, f] = tc.split(/[:;]/).map(Number);
  return ((h * 60 + m) * 60 + s) * base(fps) + f;
}

export function framesToTc(frames: number, fps: number) {
  const b = base(fps);
  const n = Math.max(0, frames);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(Math.floor(n / (b * 3600)))}:${p(Math.floor(n / (b * 60)) % 60)}:${p(Math.floor(n / b) % 60)}:${p(n % b)}`;
}

/** `PRJ_SC012_SH####` with start 10, step 10 -> PRJ_SC012_SH0010, PRJ_SC012_SH0020, ... */
export const shotName = (pattern: string, index: number, start = 10, step = 10) =>
  pattern.replace(/#+/, (h) => String(start + index * step).padStart(h.length, "0"));

export type ShotOptions = { fps: number; handles: number; pattern?: string; start?: number; step?: number };

/** Shot name per event: the pattern when given, else the event's locator. */
const names = (events: EdlEvent[], o: ShotOptions) =>
  events.map((e, i) => (o.pattern?.includes("#") ? shotName(o.pattern, i, o.start, o.step) : e.locator));

export function pullListRows(events: EdlEvent[], o: ShotOptions): string[][] {
  const shots = names(events, o);
  return [
    ["Event", "Shot", "Reel", "Clip Name", "Source File", "Track", "Src In", "Src Out", "Pull In", "Pull Out", "Duration (fr)", "Pull Duration (fr)", "Handles (fr)", "Rec In", "Rec Out", "Retime", "Locator", "Comments"],
    ...events.map((e, i) => {
      const a = tcToFrames(e.srcIn, o.fps);
      const b = tcToFrames(e.srcOut, o.fps);
      const pullIn = Math.max(0, a - o.handles);
      return [
        e.num, shots[i], e.reel, e.clipName, e.sourceFile, e.track, e.srcIn, e.srcOut,
        framesToTc(pullIn, o.fps), framesToTc(b + o.handles, o.fps),
        String(b - a), String(b + o.handles - pullIn), String(o.handles), e.recIn, e.recOut, e.retime, e.locator, e.comments.join(" | "),
      ];
    }),
  ];
}

export function vfxBreakdownRows(events: EdlEvent[], o: ShotOptions): string[][] {
  const shots = names(events, o);
  return [
    ["Shot", "Reel", "Clip Name", "Rec In", "Rec Out", "Duration (fr)", "Scope of Work", "Retime", "Status", "Vendor", "Event"],
    ...events.map((e, i) => [
      shots[i], e.reel, e.clipName, e.recIn, e.recOut,
      String(tcToFrames(e.recOut, o.fps) - tcToFrames(e.recIn, o.fps)), e.locator, e.retime ? "Y" : "", "", "", e.num,
    ]),
  ];
}

/**
 * CMX3600 EDL of the given events, cuts only. Source in/out are widened by the handles.
 * Without handles the record timecodes are kept, so the EDL conforms at the original positions;
 * with handles the events no longer fit there and are laid back to back from 01:00:00:00.
 */
export function toEdl(title: string, events: EdlEvent[], o: ShotOptions & { dropFrame?: boolean }): string {
  const shots = names(events, o);
  let cursor = tcToFrames("01:00:00:00", o.fps);
  const lines = [`TITLE: ${title}`, `FCM: ${o.dropFrame ? "DROP FRAME" : "NON-DROP FRAME"}`, ""];
  events.forEach((e, i) => {
    const srcIn = Math.max(0, tcToFrames(e.srcIn, o.fps) - o.handles);
    const srcOut = tcToFrames(e.srcOut, o.fps) + o.handles;
    const recIn = o.handles ? framesToTc(cursor, o.fps) : e.recIn;
    const recOut = o.handles ? framesToTc((cursor += srcOut - srcIn), o.fps) : e.recOut;
    const reel = (e.reel || "AX").replace(/\s+/g, "_").padEnd(8);
    lines.push(`${String(i + 1).padStart(3, "0")}  ${reel} V     C        ${framesToTc(srcIn, o.fps)} ${framesToTc(srcOut, o.fps)} ${recIn} ${recOut}`);
    if (e.clipName) lines.push(`* FROM CLIP NAME: ${e.clipName}`);
    if (e.sourceFile) lines.push(`* SOURCE FILE: ${e.sourceFile}`);
    if (e.retime) lines.push(`* SPEED: ${e.retime}`);
    if (shots[i]) lines.push(`* LOC: ${recIn} ${(e.locatorColor || "RED").padEnd(7)} ${shots[i]}`);
  });
  return lines.join("\r\n") + "\r\n";
}

export type ShotInput = {
  name: string; reel: string; clipName: string; sourceFile: string;
  srcIn: string; srcOut: string; recIn: string; recOut: string;
  durationFrames: number; fps: string; handles: number; scope: string; retime: string;
};

/** The events as shot-tracker rows, named the same way as the exports. */
export const shotInputs = (events: EdlEvent[], o: ShotOptions): ShotInput[] => {
  const shots = names(events, o);
  return events.map((e, i) => ({
    name: shots[i], reel: e.reel, clipName: e.clipName, sourceFile: e.sourceFile,
    srcIn: e.srcIn, srcOut: e.srcOut, recIn: e.recIn, recOut: e.recOut,
    durationFrames: tcToFrames(e.srcOut, o.fps) - tcToFrames(e.srcIn, o.fps), fps: String(o.fps), handles: o.handles, scope: e.locator, retime: e.retime,
  }));
};

export const SHOT_STATUSES = [
  { value: "not_started", label: "Belum mulai" },
  { value: "pulled", label: "Sudah di-pull" },
  { value: "in_progress", label: "Dikerjakan" },
  { value: "review", label: "Review" },
  { value: "approved", label: "Approved" },
] as const;
export const shotStatus = (v: string) => SHOT_STATUSES.find((s) => s.value === v) ?? SHOT_STATUSES[0];
