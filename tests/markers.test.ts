import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as f from "@/lib/feedback/service";
import { dataRows, decodeText, detectMapping, fromEdl, markDuplicates, parseDelimited, parseFeedbackText, rowsToIncoming } from "@/lib/feedback/import";
import { MARKER_FORMATS } from "@/lib/feedback/markers";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";
import { framesToTc, RATES, secondsToFrames, tcToFrames, type Rate } from "@/lib/timecode";

// Fixtures: resolve-markers.edl and apple-sample.fcpxml are real vendor samples. The CSV/txt fixtures
// (Premiere, Avid, Frame.io, Vimeo, Resolve CSV) are reconstructed from vendor docs and forum reports, not exports of the apps.
const fx = (n: string) => readFileSync(`tests/fixtures/markers/${n}`, "utf8");
const rate = (id: string): Rate => RATES.find((r) => r.id === id)!.rate;
const DF = rate("29.97df"), DF60 = rate("59.94df"), R24 = rate("24"), R25 = rate("25");

describe("timecode", () => {
  it("drop-frame 29.97", () => {
    expect(framesToTc(1800, DF)).toBe("00:01:00;02");
    expect(framesToTc(17982, DF)).toBe("00:10:00;00");
    expect(tcToFrames("00:01:00;00", DF)).toBeNull();
    expect(tcToFrames("00:01:00;02", DF)).toBe(1800);
    expect(tcToFrames("00:10:00;00", DF)).toBe(17982);
    expect(tcToFrames("00:00:00;30", DF)).toBeNull(); // frames >= base
  });
  it("drop-frame 59.94", () => {
    expect(framesToTc(3600, DF60)).toBe("00:01:00;04");
    expect(tcToFrames("00:01:00;03", DF60)).toBeNull();
  });
  it("round-trips", () => {
    for (let n = 0; n <= 108000; n++) {
      if (framesToTc(n, DF) !== framesToTc(n, DF) || tcToFrames(framesToTc(n, DF), DF) !== n) throw new Error(`DF ${n}`);
      if (tcToFrames(framesToTc(n, DF60), DF60) !== n) throw new Error(`DF60 ${n}`);
      if (n % 7 === 0 && tcToFrames(framesToTc(n, R25), R25) !== n) throw new Error(`25 ${n}`);
    }
  });
  it("23.976 real time and NDF", () => {
    expect(framesToTc(secondsToFrames(3600, rate("23.976")), rate("23.976"))).toBe("00:59:56:10");
    expect(framesToTc(90061, R25)).toBe("01:00:02:11");
  });
});

describe("parseFeedbackText", () => {
  it("handles WhatsApp, multi-line, authors, bullets and 12:30pm", () => {
    const t = [
      "[18/11/26 14.03] Budi: 00:14:32 potong adegan 3",
      "dan ganti musik",
      "18/11/26, 14:05 - Siti: warna terlalu hangat",
      "- Director: 01:02:03:12 tambah subtitle",
      "2) tanpa nama",
      "12:30pm",
    ].join("\n");
    expect(parseFeedbackText(t)).toEqual([
      { ref: "00:14:32", body: "potong adegan 3\ndan ganti musik", fromWho: "Budi" },
      { ref: "", body: "warna terlalu hangat", fromWho: "Siti" },
      { ref: "01:02:03:12", body: "tambah subtitle", fromWho: "Director" },
      { ref: "", body: "tanpa nama\n12:30pm", fromWho: "" }, // 12:30pm is not a timecode: it continues the point
    ]);
  });
});

describe("importers", () => {
  const table = (n: string) => {
    const g = parseDelimited(fx(n));
    const m = detectMapping(g[0])!;
    return { m, rows: rowsToIncoming(dataRows(g, m), m) };
  };
  it("Resolve marker EDL", () => {
    expect(fromEdl(fx("resolve-markers.edl")).map((p) => [p.ref, p.body])).toEqual([["00:00:00:00", "Intro"], ["00:02:10:15", "Stuff"], ["00:02:10:15", "Don't export this!"], ["00:04:32:13", "Outro"]]);
  });
  it("Premiere (tab), Avid (headerless), Frame.io (timecode over frame), Vimeo, Resolve CSV", () => {
    expect(table("premiere-markers.csv").rows).toEqual([{ ref: "00:00:10:00", body: "Potong adegan 3", fromWho: "" }, { ref: "00:01:05:12", body: "Ganti musik temp", fromWho: "" }]);
    expect(table("avid-markers.txt").rows).toEqual([{ ref: "01:00:10:00", body: "Potong adegan 3", fromWho: "Budi" }, { ref: "01:01:05:12", body: 'Ganti musik, "temp"', fromWho: "Siti" }]);
    expect(table("frameio-comments.csv").rows).toEqual([{ ref: "00:00:10:00", body: "Potong adegan 3", fromWho: "Budi" }, { ref: "00:01:05:12", body: "Ganti musik\ntemp", fromWho: "Siti" }]);
    expect(table("vimeo-comments.csv").rows[1]).toEqual({ ref: "01:05", body: "Ganti musik temp", fromWho: "Siti" });
    expect(table("resolve-markers.csv").m.format).toBe("Resolve CSV");
  });
  it("decodes UTF-16LE with BOM", () => {
    const u = new Uint16Array([0xfeff, ...[..."a\tb"].map((c) => c.charCodeAt(0))]);
    expect(decodeText(u.buffer)).toBe("a\tb");
  });
  it("marks duplicates against existing and within the batch", () => {
    const r = markDuplicates([{ ref: "00:01", body: "Potong  adegan" }], [{ ref: "00:01", body: "potong adegan", fromWho: "" }, { ref: "", body: "x", fromWho: "" }, { ref: "", body: "X", fromWho: "" }]);
    expect(r.map((p) => p.dup)).toEqual([true, false, true]);
  });
});

describe("exporters", () => {
  const pts = [{ ref: "00:00:10", body: "Potong", fromWho: "Budi" }, { ref: "00:01:05:12", body: "Musik", fromWho: "" }, { ref: "", body: "tanpa tc", fromWho: "" }];
  const mk = (id: string, r: Rate, extra: Partial<{ start: string; mode: "offset" | "absolute" }> = {}) =>
    MARKER_FORMATS.find((x) => x.id === id)!.make(pts, { rate: r, start: "01:00:00:00", mode: "offset", name: "Cut 1", ...extra });

  it("Resolve EDL matches the sample structure; 24 and 29.97 DF", () => {
    const sampleEv = fx("resolve-markers.edl").split("\n").slice(3, 5);
    const a = mk("resolve-edl", R24);
    expect(a.skipped).toBe(1);
    expect(a.text).toBe("TITLE: Cut 1\nFCM: NON-DROP FRAME\n\n001  001      V     C        01:00:10:00 01:00:10:01 01:00:10:00 01:00:10:01  \n |C:ResolveColorBlue |M:Potong (Budi) |D:1\n\n002  001      V     C        01:01:05:12 01:01:05:13 01:01:05:12 01:01:05:13  \n |C:ResolveColorBlue |M:Musik |D:1\n");
    expect(a.text.split("\n")[3].replace(/\d\d:\d\d:\d\d:\d\d/g, "TC")).toBe(sampleEv[0].replace(/\d\d:\d\d:\d\d:\d\d/g, "TC"));
    expect(fromEdl(a.text).map((p) => p.body)).toEqual(["Potong (Budi)", "Musik"]);
    expect(mk("resolve-edl", DF).text).toContain("FCM: DROP FRAME\n\n001  001      V     C        01:00:10;00 01:00:10;01");
  });
  it("tables and locator EDLs", () => {
    expect(mk("premiere-csv", R24).text).toBe("Marker Name\tDescription\tIn\tOut\tDuration\tMarker Type\r\nPotong (Budi)\tPotong\t01:00:10:00\t01:00:10:00\t00:00:00:00\tComment\r\nMusik\tMusik\t01:01:05:12\t01:01:05:12\t00:00:00:00\tComment\r\n");
    expect(mk("avid-txt", DF).text).toBe("Budi\t01:00:10;00\tV1\tred\tPotong\t1\r\nPost System\t01:01:05;12\tV1\tred\tMusik\t1\r\n");
    expect(mk("avid-edl", R24).text).toContain("* LOC: 01:00:10:00 RED     Potong (Budi)\r\n");
    expect(fromEdl(mk("premiere-edl", R24).text)).toHaveLength(2);
  });
  it("FCPXML: rational time, DF flag, marker shape of the Apple sample", () => {
    const a = mk("fcpxml", R24).text;
    expect(a).toContain('frameDuration="1/24s"');
    expect(a).toContain('tcFormat="NDF"');
    expect(a).toContain('<marker start="86640/24s" duration="1/24s" value="Potong (Budi)"/>');
    const d = mk("fcpxml", DF).text;
    expect(d).toContain('frameDuration="1001/30000s"');
    expect(d).toContain('tcFormat="DF"');
    expect(d).toMatch(/<marker start="\d+\/30000s" duration="1001\/30000s"/);
    expect(fx("apple-sample.fcpxml")).toMatch(/<marker start="2s" duration="1000\/30000s" value="My Marker 1"\/>/);
    expect(MARKER_FORMATS.find((x) => x.id === "fcpxml")!.make([{ ref: "00:01", body: 'a & <b> "c"', fromWho: "" }], { rate: R24, start: "00:00:00:00", mode: "offset", name: "x" }).text).toContain('value="a &amp; &lt;b&gt; &quot;c&quot;"');
  });
  it("whole-minute references snap to the first valid drop-frame label", () => {
    const one = (ref: string, r: Rate, mode: "offset" | "absolute" = "absolute") => MARKER_FORMATS.find((x) => x.id === "avid-txt")!.make([{ ref, body: "b", fromWho: "a" }], { rate: r, start: "00:00:00;00", mode, name: "n" });
    expect(one("03:00", DF)).toMatchObject({ skipped: 0 });
    expect(one("03:00", DF).text).toContain("00:03:00;02");
    expect(one("00:14:00", DF).text).toContain("00:14:00;02");
    expect(one("00:01:00:00", DF, "offset").text).toContain("00:01:00;02");
    expect(one("00:10:00:00", DF).text).toContain("00:10:00;00");
    expect(one("03:00", DF60).text).toContain("00:03:00;04");
    expect(one("00:10:00:00", DF60).text).toContain("00:10:00;00");
    expect(one("00:00:00:99", DF).skipped).toBe(1);
    expect(one("garbage", DF).skipped).toBe(1);
  });
  it("hours wrap at 24 and 24:00:00:00 is rejected", () => {
    expect(tcToFrames("24:00:00:00", R25)).toBeNull();
    const r = MARKER_FORMATS.find((x) => x.id === "avid-txt")!.make([{ ref: "00:20", body: "b", fromWho: "a" }], { rate: R25, start: "23:59:50:00", mode: "offset", name: "n" });
    expect(r.text).toContain("00:00:10:00");
  });
  it("strips XML-invalid control characters", () => {
    expect(MARKER_FORMATS.find((x) => x.id === "fcpxml")!.make([{ ref: "00:01", body: "a\x01b", fromWho: "" }], { rate: R24, start: "00:00:00:00", mode: "offset", name: "x" }).text).toContain('value="ab"');
  });
  it("offset vs absolute, frames field, skipped", () => {
    const one = (ref: string, mode: "offset" | "absolute") => MARKER_FORMATS.find((x) => x.id === "avid-txt")!.make([{ ref, body: "b", fromWho: "a" }], { rate: DF, start: "01:00:00;00", mode, name: "n" });
    expect(one("00:01:00", "offset").text).toContain("01:00:59;28"); // 60 s of real time is 1798 frames
    expect(one("01:30:00:10", "absolute").text).toContain("01:30:00;10");
    expect(one("00:00:05:10", "offset").text).toContain("01:00:05;10");
    expect(one("00:00:00:35", "offset")).toEqual({ text: "", skipped: 1 }); // frames field >= base
    expect(one("12:30pm", "offset").skipped).toBe(1);
  });
});

describe("importPoints", () => {
  let db: Db, sup: string, asst: string, projectId: string, itemId: string;
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "", template: "feature", startDate: "2026-12-01" });
    itemId = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items.find((i) => i.name === "Preview 1")!.id;
  });
  it("dedupes against existing points and within the batch; an assistant may import", async () => {
    await f.addPoints(db, sup, projectId, itemId, { text: "00:01:00 potong adegan" });
    const rows = [
      { ref: "00:01:00", body: "Potong  adegan", fromWho: "" },
      { ref: "00:02:00", body: "ganti musik", fromWho: "Budi" },
      { ref: "00:02:00", body: "GANTI musik", fromWho: "" },
      { ref: "", body: "  ", fromWho: "" },
    ];
    expect(await f.importPoints(db, asst, projectId, itemId, rows, "WhatsApp")).toEqual({ added: 1, skipped: 2 });
    expect(await f.importPoints(db, asst, projectId, itemId, rows, "WhatsApp")).toEqual({ added: 0, skipped: 3 });
    const mine = (await f.listPoints(db, projectId, { includeInternal: true })).filter((p) => p.itemId === itemId);
    expect(mine.map((p) => p.body)).toEqual(["potong adegan", "ganti musik"]);
    await expect(f.importPoints(db, sup, projectId, itemId, Array.from({ length: 2001 }, (_, i) => ({ ref: "", body: String(i), fromWho: "" })), "x")).rejects.toBeInstanceOf(s.InputError);
    await expect(f.importPoints(db, "00000000-0000-0000-0000-000000000000", projectId, itemId, rows, "x")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
