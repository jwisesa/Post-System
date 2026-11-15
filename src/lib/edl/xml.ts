// FCP7 XML (xmeml: Premiere, Resolve) and FCPXML (Final Cut, Resolve) -> the same shot list as parseEdl.

import { type Edl, type EdlEvent, framesToTc, parseEdl, tcToFrames } from "./edl";

type Node = { tag: string; attrs: Record<string, string>; children: Node[]; text: string };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x?[\da-f]+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m);

// ponytail: a small tag/attribute/text reader instead of DOMParser so the same code runs in the browser and in
// node tests without a DOM dependency. No namespaces or DTD internal subsets; swap for DOMParser if files need them.
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[?!][^>]*>|<\/[^>]+>|<([^\s>/]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;

export function parseXml(text: string): Node {
  const root: Node = { tag: "", attrs: {}, children: [], text: "" };
  const stack = [root];
  for (const m of text.matchAll(TOKEN)) {
    const top = stack[stack.length - 1];
    if (m[2]) {
      const node: Node = { tag: m[2], attrs: {}, children: [], text: "" };
      for (const a of m[3].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) node.attrs[a[1]] = decode(a[2] ?? a[3]);
      top.children.push(node);
      if (!m[4]) stack.push(node);
    } else if (m[0].startsWith("</")) { if (stack.length > 1) stack.pop(); }
    else if (m[1] != null) top.text += m[1];
    else if (m[5]) top.text += decode(m[5]);
  }
  return root;
}

const kids = (n: Node | undefined, tag: string) => n?.children.filter((c) => c.tag === tag) ?? [];
const kid = (n: Node | undefined, tag: string) => n?.children.find((c) => c.tag === tag);
const txt = (n: Node | undefined, tag: string) => kid(n, tag)?.text.trim() ?? "";
const all = (n: Node, tag: string): Node[] => n.children.flatMap((c) => [...(c.tag === tag ? [c] : []), ...all(c, tag)]);
const fileName = (url: string) => { const b = url.split(/[/\\]/).pop() ?? ""; try { return decodeURIComponent(b); } catch { return b; } };
const stem = (name: string) => name.replace(/\.[^.]+$/, "");
const fpsLabel = (fps: number) => String(Number(fps.toFixed(3)));

function finish(title: string, fps: number, dropFrame: boolean, rows: (Omit<EdlEvent, "num" | "srcIn" | "srcOut" | "recIn" | "recOut" | "transition" | "comments" | "locatorColor"> & { src: number; rec: number; dur: number })[]): Edl {
  rows.sort((a, b) => a.rec - b.rec || a.track.localeCompare(b.track));
  return {
    title, dropFrame, maxFrame: 0, fps: fpsLabel(fps),
    events: rows.map(({ src, rec, dur, ...r }, i) => ({
      ...r, num: String(i + 1).padStart(3, "0"), transition: "C", locatorColor: "", comments: [],
      srcIn: framesToTc(src, fps), srcOut: framesToTc(src + dur, fps), recIn: framesToTc(rec, fps), recOut: framesToTc(rec + dur, fps),
    })),
  };
}

/** Start frame of a `<timecode>`: `<frame>` when present, else the `<string>` timecode. */
const tcStart = (tc: Node | undefined, fps: number) => (txt(tc, "frame") ? Number(txt(tc, "frame")) : txt(tc, "string") ? tcToFrames(txt(tc, "string"), fps) : 0);

function fromXmeml(root: Node): Edl {
  const seq = all(root, "sequence")[0];
  if (!seq) throw new Error("XML ini tidak berisi sequence.");
  const tb = Number(txt(kid(seq, "rate"), "timebase")) || 24;
  const fps = txt(kid(seq, "rate"), "ntsc").toUpperCase() === "TRUE" ? (tb * 1000) / 1001 : tb;
  const seqStart = tcStart(kid(seq, "timecode"), fps);
  const files = new Map<string, Node>(); // later clip items point at the first full <file> by id
  for (const f of all(seq, "file")) if (f.attrs.id && f.children.length) files.set(f.attrs.id, f);

  const rows: Parameters<typeof finish>[3] = [];
  kids(kid(kid(seq, "media"), "video"), "track").forEach((track, ti) => {
    for (const ci of kids(track, "clipitem")) {
      if (txt(ci, "enabled").toUpperCase() === "FALSE") continue;
      const num = (t: string) => Number(txt(ci, t) || -1);
      const dur = num("out") - num("in");
      // next to a transition, start or end is written as -1
      const start = num("start") >= 0 ? num("start") : num("end") - dur;
      const file = files.get(kid(ci, "file")?.attrs.id ?? "") ?? kid(ci, "file");
      const name = txt(file, "name") || fileName(txt(file, "pathurl"));
      const marker = kid(ci, "marker");
      const remap = all(ci, "effect").find((e) => /time\s*remap/i.test(txt(e, "name")));
      const speed = remap && kids(remap, "parameter").find((p) => txt(p, "parameterid") === "speed");
      rows.push({
        src: tcStart(kid(file, "timecode"), fps) + num("in"), rec: seqStart + start, dur,
        reel: txt(kid(kid(file, "timecode"), "reel"), "name") || stem(name) || txt(ci, "name"),
        track: `V${ti + 1}`, clipName: txt(ci, "name"), sourceFile: name,
        locator: marker ? txt(marker, "name") || txt(marker, "comment") : "",
        retime: speed && Number(txt(speed, "value")) !== 100 ? `${txt(speed, "value")}%` : "",
      });
    }
  });
  return finish(txt(seq, "name"), fps, /^DF$/i.test(txt(kid(seq, "timecode"), "displayformat")), rows);
}

/** FCPXML rational time: "3600/1s", "1001/24000s", "5s". */
const sec = (v: string | undefined) => { const [a, b] = (v ?? "0").replace(/s$/, "").split("/").map(Number); return (a || 0) / (b || 1); };
const CLIPS = new Set(["asset-clip", "clip", "video", "mc-clip", "sync-clip", "ref-clip"]);

function fromFcpxml(root: Node): Edl {
  const fcp = kid(root, "fcpxml");
  const seq = fcp && all(fcp, "sequence")[0];
  const spine = kid(seq, "spine");
  if (!seq || !spine) throw new Error("FCPXML ini tidak berisi sequence.");
  const res = kid(fcp, "resources");
  const formats = kids(res, "format");
  const fd = sec((formats.find((f) => f.attrs.id === seq.attrs.format) ?? formats[0])?.attrs.frameDuration);
  const fps = fd > 0 ? 1 / fd : 24;
  const assets = new Map(kids(res, "asset").map((a) => [a.attrs.id, a]));
  const fr = (s: number) => Math.round(s * fps);

  const rows: Parameters<typeof finish>[3] = [];
  /** `rec` is the node's record start in seconds. Connected clips (those with a lane) sit in the parent's source time. */
  const emit = (n: Node, rec: number) => {
    const ref = n.attrs.ref ?? all(n, "video").concat(all(n, "asset-clip")).find((c) => c.attrs.ref)?.attrs.ref;
    const asset = assets.get(ref ?? "");
    const start = n.attrs.start ? sec(n.attrs.start) : sec(asset?.attrs.start);
    if (CLIPS.has(n.tag) && asset?.attrs.hasVideo !== "0") {
      const name = fileName(asset?.attrs.src ?? kid(asset, "media-rep")?.attrs.src ?? "");
      rows.push({
        src: fr(start), rec: fr(rec), dur: fr(sec(n.attrs.duration ?? asset?.attrs.duration)),
        reel: stem(asset?.attrs.name || name) || n.attrs.name || "", track: `V${Math.max(0, Number(n.attrs.lane) || 0) + 1}`,
        clipName: n.attrs.name ?? "", sourceFile: name,
        locator: (kid(n, "marker") ?? kid(n, "chapter-marker"))?.attrs.value ?? "", retime: kid(n, "timeMap") ? "timeMap" : "",
      });
    }
    for (const c of n.children) {
      if (c.attrs.lane == null) continue;
      const at = rec + sec(c.attrs.offset) - start;
      if (c.tag === "spine") for (const g of c.children) emit(g, at + sec(g.attrs.offset));
      else emit(c, at);
    }
  };
  // Offsets are either zero-based (Final Cut) or already in the tcStart domain (Resolve).
  const first = Math.min(...spine.children.map((c) => sec(c.attrs.offset)));
  const origin = first < sec(seq.attrs.tcStart) ? sec(seq.attrs.tcStart) : 0;
  for (const c of spine.children) emit(c, origin + sec(c.attrs.offset));
  return finish(all(fcp, "project")[0]?.attrs.name ?? "", fps, seq.attrs.tcFormat === "DF", rows);
}

/** Reads an EDL, FCP7 XML or FCPXML file by its content. */
export function parseTimeline(text: string): Edl {
  if (!text.trimStart().startsWith("<")) return parseEdl(text);
  const root = parseXml(text);
  if (kid(root, "xmeml")) return fromXmeml(root);
  if (kid(root, "fcpxml")) return fromFcpxml(root);
  throw new Error("File XML ini bukan FCP7 XML (xmeml) atau FCPXML.");
}
