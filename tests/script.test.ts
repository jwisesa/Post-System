import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import { aggregate } from "@/lib/script/aggregate";
import { dropRepeating, extractPages, groupLines } from "@/lib/script/extract";
import { cueNames, detectLayout, normalizeCue, parseHeading, parseScreenplay } from "@/lib/script/parse";
import * as sc from "@/lib/script/service";
import { needsByPhase, postCsvRows, postNeeds } from "@/lib/script/needs";
import { defaultPhase, suggestTags } from "@/lib/script/tags";
import { placeOf, type PdfPage } from "@/lib/script/types";
import * as sched from "@/lib/schedule/service";
import * as s from "@/lib/services";

const pdf = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/script/${n}.pdf`));

describe("heading parser", () => {
  it("reads English headings", () => {
    expect(parseHeading("INT. BUDI'S HOUSE - LIVING ROOM - NIGHT")).toMatchObject({ intExt: "INT", location: "BUDI'S HOUSE - LIVING ROOM", place: "BUDI'S HOUSE", timeOfDay: "MALAM", number: "" });
    expect(parseHeading("EXT. STREET - DAY")).toMatchObject({ intExt: "EXT", location: "STREET", timeOfDay: "SIANG" });
  });
  it("reads Indonesian headings", () => {
    expect(parseHeading("DLM. RUMAH BUDI - RUANG TAMU - SIANG")).toMatchObject({ intExt: "INT", location: "RUMAH BUDI - RUANG TAMU", place: "RUMAH BUDI", timeOfDay: "SIANG" });
    expect(parseHeading("DALAM GUDANG - MALAM")).toMatchObject({ intExt: "INT", location: "GUDANG" });
    expect(parseHeading("LUAR PELABUHAN - DINI HARI")).toMatchObject({ intExt: "EXT", timeOfDay: "SUBUH" });
    expect(parseHeading("EKS. JALAN – SORE")).toMatchObject({ intExt: "EXT", location: "JALAN", timeOfDay: "SORE" });
  });
  it("reads scene numbers on either side, with SC./ADEGAN prefixes", () => {
    expect(parseHeading("12. INT. RUMAH - SIANG")).toMatchObject({ number: "12", location: "RUMAH" });
    expect(parseHeading("SC. 12 INT. RUMAH - SIANG")?.number).toBe("12");
    expect(parseHeading("ADEGAN 7 EXT. KEBUN - PAGI")?.number).toBe("7");
    expect(parseHeading("12 INT. RUMAH - SIANG 12")).toMatchObject({ number: "12", location: "RUMAH", timeOfDay: "SIANG" });
    expect(parseHeading("12 INT. RUMAH - SIANG 12")?.heading).toBe("INT. RUMAH - SIANG");
    expect(parseHeading("12A INT. RUMAH - SIANG 12A")?.number).toBe("12A");
    expect(parseHeading("INT. RUMAH - SIANG 14")?.number).toBe("14");
    expect(parseHeading("EXT. JALAN 3")).toMatchObject({ number: "", location: "JALAN 3" });
  });
  it("handles I/E and INT/EKS combinations", () => {
    expect(parseHeading("I/E. MOBIL - JALAN - DAY")?.intExt).toBe("INT/EXT");
    expect(parseHeading("INT/EKS. MOBIL - MALAM")?.intExt).toBe("INT/EXT");
    expect(parseHeading("INT./EXT. MOBIL - NIGHT")?.intExt).toBe("INT/EXT");
    expect(parseHeading("EXT/INT KEBUN - PAGI")?.intExt).toBe("INT/EXT");
  });
  it("normalises time of day words", () => {
    const t = (w: string) => parseHeading(`INT. X - ${w}`)?.timeOfDay;
    expect([t("DAY"), t("NIGHT"), t("MORNING"), t("EVENING"), t("DAWN"), t("DUSK")]).toEqual(["SIANG", "MALAM", "PAGI", "SORE", "SUBUH", "SORE"]);
    expect([t("SENJA"), t("SUBUH"), t("KEMUDIAN"), t("LATER"), t("CONTINUOUS"), t("LANJUTAN"), t("MALAM HARI"), t("SIANG LANJUTAN")]).toEqual(["SORE", "SUBUH", "LAINNYA", "LAINNYA", "LAINNYA", "LAINNYA", "MALAM", "SIANG"]);
  });
  it("accepts headings without time of day, rejects prose", () => {
    expect(parseHeading("INT. RUMAH BUDI")).toMatchObject({ location: "RUMAH BUDI", timeOfDay: "" });
    expect(parseHeading("Dalam kegelapan, Budi berlari menembus hutan.")).toBeNull();
    expect(parseHeading("Interior rumah itu gelap dan sunyi sekali.")).toBeNull();
    expect(parseHeading("BUDI")).toBeNull();
    expect(placeOf("RUMAH BUDI - RUANG TAMU")).toBe("RUMAH BUDI");
  });
});

describe("cues", () => {
  it("strips extensions and CONT'D", () => {
    for (const c of ["BUDI (V.O.)", "Budi (O.S.)", "BUDI (CONT'D)", "BUDI (OFF)", "BUDI (LANJUT)", "BUDI:", "BUDI (V.O.) (CONT'D)"]) expect(normalizeCue(c)).toBe("BUDI");
    expect(normalizeCue("PAK HADI")).toBe("PAK HADI");
    expect(normalizeCue("(pelan)")).toBe("");
  });
});

const line = (y: number, x: number, text: string) => ({ y, x, text });
const synth = (rows: [string, number][]): PdfPage[] => [{ page: 1, height: 792, lines: rows.map(([t, x], i) => line(700 - i * 12, x, t)) }];

describe("block counting and layout", () => {
  const rows: [string, number][] = [
    ["INT. RUMAH - SIANG", 108], ["Budi duduk.", 108], ["Sari masuk dengan cepat.", 108],
    ["BUDI", 266], ["Halo.", 180], ["SARI", 266], ["(pelan)", 223], ["Hai.", 180], ["BUDI (CONT'D)", 266], ["Kamu datang.", 180], ["Budi berdiri.", 108],
    ["BUDI (CONT'D)", 266], ["Ya.", 180], ["CUT TO:", 480],
    ["EXT. JALAN - MALAM", 108], ["Hujan.", 108], ["Hujan lagi.", 108], ["SARI (V.O.)", 266], ["Aku pulang.", 180],
  ];
  it("counts cue blocks per character per scene, treating CONT'D right after dialogue as the same block", () => {
    const { scenes } = parseScreenplay(synth(rows));
    expect(scenes).toHaveLength(2);
    expect(scenes[0].characters).toEqual([{ name: "BUDI", blocks: 3 }, { name: "SARI", blocks: 1 }]);
    expect(scenes[1].characters).toEqual([{ name: "SARI", blocks: 1 }]);
  });
  it("detects action, cue and dialogue indents from the document", () => {
    const l = detectLayout(synth(rows)[0].lines.map((x) => ({ page: 1, ...x, head: parseHeading(x.text) })));
    expect(l.action).toBeCloseTo(108, 0);
    expect(l.cue).toBeCloseTo(266, 0);
    expect(l.dialogue).toBeCloseTo(180, 0);
  });
  it("ignores everything before the first heading and flagged header lines", () => {
    const pages: PdfPage[] = [
      { page: 1, height: 792, lines: [line(500, 200, "JUDUL"), line(480, 200, "Oleh Seseorang"), line(460, 108, "DAFTAR PEMAIN"), line(440, 266, "BUDI")] },
      { page: 2, height: 792, lines: [{ ...line(750, 500, "2."), skip: true }, ...synth(rows)[0].lines] },
    ];
    expect(parseScreenplay(pages).scenes[0].heading).toBe("INT. RUMAH - SIANG");
  });
  it("rejects text without scene headings and near-empty PDFs", () => {
    expect(() => parseScreenplay(synth([["Rapat produksi", 108], ["Notulen", 108], ["Agenda", 108], ["Anggaran", 108], ["Jadwal", 108]]))).toThrow(/Naskah tidak dikenali/);
    expect(() => parseScreenplay(synth([["INT. A - DAY", 108]]))).toThrow(/Naskah tidak dikenali/);
  });
  it("estimates duration from lines (55 lines ~ 60 seconds)", () => {
    const body: [string, number][] = [["INT. A - DAY", 108], ...Array.from({ length: 53 }, (_, i): [string, number] => [`aksi ${i}`, 108])];
    const { scenes } = parseScreenplay([{ page: 1, height: 792, lines: body.map(([t, x], i) => line(700 - i * 12, x, t)) }]);
    expect(scenes[0].lines).toBe(55);
    expect(scenes[0].estSeconds).toBe(60);
  });
});

describe("line grouping", () => {
  it("merges items on a baseline with y jitter and keeps the leftmost x", () => {
    const out = groupLines([
      { str: "12", x: 54, y: 700, w: 14, h: 12 }, { str: "INT. RUMAH - SIANG", x: 108, y: 700.6, w: 130, h: 12 }, { str: "12", x: 520, y: 699.8, w: 14, h: 12 },
      { str: "Aksi", x: 108, y: 688, w: 30, h: 12 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ x: 108, text: "12 INT. RUMAH - SIANG 12" });
  });
});

describe("real-export patterns", () => {
  const it0 = (str: string, x: number, w: number, y = 700) => ({ str, x, y, w, h: 12 });
  it("spaces items by gap, even when a trailing item overlaps the margin number, and drops revision marks", () => {
    const [a] = groupLines([it0("INT. RUMAH - SORE", 108, 427), it0("4", 524, 7.2), it0("*", 560, 7), it0("Tepat", 108, 36, 600), it0("waktu", 144, 36, 600), it0("ini", 180.5, 21.6, 600)]);
    expect(a.text).toBe("INT. RUMAH - SORE 4");
    expect(groupLines([it0("Tepat", 108, 36), it0("waktu", 144, 36)])[0].text).toBe("Tepatwaktu");
    expect(groupLines([it0("BUDI", 252, 64.8), it0("*", 520, 7.2)])[0].text).toBe("BUDI");
  });
  it("uses the first non-margin item as x", () => {
    expect(groupLines([it0("62", 54, 14.4), it0("EXT. JALAN - MALAM", 108, 130), it0("62", 517, 14.4)])[0].x).toBe(108);
  });
  it("drops items repeating at one position on many pages (header, watermark) but keeps content, digits and sluglines", () => {
    const pages = Array.from({ length: 6 }, (_, n) => [
      it0("CONFIDENTIAL", 60, 86, 500), it0("Judul - Draft 1", 200, 90, 760), it0(String(n + 1), 520, 7, 760), it0("INT.", 108, 28, 700), it0(`Aksi ${n}`, 108, 40, 600 - n * 12), it0("BUDI", 250, 30, 650 - (n % 3) * 12),
    ]);
    const kept = dropRepeating(pages);
    expect(kept[2].map((i) => i.str)).toEqual(["3", "INT.", "Aksi 2", "BUDI"]);
    expect(dropRepeating(pages.slice(0, 3))[0]).toHaveLength(6); // too few pages to tell
  });
  it("normalises headings: trailing scene numbers, revision marks, modifiers", () => {
    expect(parseHeading("I/E. LORONG - AFTERNOON 4")).toMatchObject({ number: "4", location: "LORONG", timeOfDay: "SORE" });
    expect(parseHeading("62 EXT. KLINIK 24 JAM - MOMENTS LATER 62 *")).toMatchObject({ number: "62", location: "KLINIK 24 JAM", modifier: true, timeOfDay: "LAINNYA" });
    expect(parseHeading("INT. RUANG MAKAN - NIGHT 83 *")).toMatchObject({ number: "83", location: "RUANG MAKAN", timeOfDay: "MALAM" });
    expect(parseHeading("30-A INT. RUANG MAKAN - MALAM 30-A")).toMatchObject({ number: "30-A", location: "RUANG MAKAN" });
    expect(parseHeading("EXT. POM BENSIN - ANOTHER ANGLE")).toMatchObject({ location: "POM BENSIN", modifier: true });
    expect(parseHeading("EXT. POM BENSIN - SUDUT LAIN")).toMatchObject({ location: "POM BENSIN", modifier: true });
    expect(parseHeading("INT. KAMAR - BEBERAPA SAAT KEMUDIAN")).toMatchObject({ location: "KAMAR", modifier: true });
    expect(parseHeading("INT. KAMAR - MALAM LANJUTAN")).toMatchObject({ location: "KAMAR", timeOfDay: "MALAM" });
    expect(parseHeading("INT. KAMAR - DAY/NIGHT")?.timeOfDay).toBe("SIANG");
    expect(parseHeading("INT. KAMAR - SIANG")?.modifier).toBe(false);
  });
  it("splits group cues, strips instruction prefixes and revision marks", () => {
    expect(cueNames("BUDI, LINA")).toEqual(["BUDI", "LINA"]);
    expect(cueNames("PETUGAS KEAMANAN & ANGGOTA ORMAS")).toEqual(["PETUGAS KEAMANAN", "ANGGOTA ORMAS"]);
    expect(cueNames("BUDI DAN SARI (V.O.)")).toEqual(["BUDI", "SARI"]);
    expect(cueNames("TITLE IN : BUDI")).toEqual(["BUDI"]);
    for (const c of ["SUPER", "TITLE", "TEKS", "INSERT", "CUT TO", "INTERCUT"]) expect(cueNames(c)).toEqual([]);
    expect(cueNames("TAMU PESTA #1")).toEqual(["TAMU PESTA #1"]);
    expect(normalizeCue("BUDI *")).toBe("BUDI");
  });
  it("inherits time of day for modifier headings, reports OMITTED and unexplained number gaps", () => {
    const h = (n: string, t: string) => [`${n} ${t} ${n}`, 108] as [string, number];
    const { scenes, warnings } = parseScreenplay(synth([
      h("1", "INT. A - MALAM"), ["Aksi.", 108], h("2", "INT. A - MOMENTS LATER"), ["Aksi.", 108], h("3", "EXT. B - ANOTHER ANGLE"), ["Aksi.", 108],
      h("4", "EXT. B - SIANG"), ["Aksi.", 108], ["5 OMITTED 5", 108], ["6 OMITTED 6", 108], h("8", "EXT. C - CONTINUOUS"), ["Aksi.", 108],
    ]));
    expect(scenes.map((x) => x.number)).toEqual(["1", "2", "3", "4", "8"]);
    expect(scenes.map((x) => x.timeOfDay)).toEqual(["MALAM", "MALAM", "MALAM", "SIANG", "SIANG"]);
    expect(scenes.map((x) => x.intExt)).toEqual(["INT", "INT", "EXT", "EXT", "EXT"]);
    expect(warnings.slice(0, 2)).toEqual(["2 adegan OMITTED: 5, 6", "nomor adegan terlewat: 7"]);
  });
});

describe("fixture PDFs", () => {
  it("parses the Letter sample: scenes, 12A, montage, characters, locations", async () => {
    const pages = await extractPages(pdf("sample-letter"));
    const { scenes, pages: n, warnings } = parseScreenplay(pages);
    expect(n).toBeGreaterThanOrEqual(12);
    expect(scenes).toHaveLength(25);
    expect(warnings).toEqual([]);
    expect(scenes.map((x) => x.number).slice(10, 14)).toEqual(["11", "12", "12A", "13"]);
    const montage = scenes.find((x) => x.number === "14")!;
    expect(montage).toMatchObject({ timeOfDay: "LAINNYA", characters: [] });
    expect(scenes[0]).toMatchObject({ heading: "EXT. JALAN RAYA - SUBUH", intExt: "EXT", location: "JALAN RAYA", timeOfDay: "SUBUH" });
    expect(scenes[4].intExt).toBe("INT/EXT");
    expect(scenes.find((x) => x.number === "15")).toMatchObject({ intExt: "INT", location: "GUDANG TUA" }); // DLM. heading, Indonesian
    expect(scenes.find((x) => x.number === "18")!.timeOfDay).toBe("SUBUH"); // DAWN
    expect(scenes.find((x) => x.number === "19")!.timeOfDay).toBe("MALAM"); // NIGHT
    const agg = aggregate(scenes, n);
    expect(agg.characters.map((c) => c.name)).toEqual(expect.arrayContaining(["BUDI", "SARI", "RARA", "PAK HADI", "LINA", "SUARA", "TOKOH ASING", "PRIA BERTOPI", "IBU WARUNG"]));
    expect(agg.characters.some((c) => /\(|V\.O|CONT/.test(c.name))).toBe(false);
    expect(agg.characters[0].name).toBe("BUDI");
    expect(agg.locations.find((l) => l.place === "RUMAH BUDI")!.sceneNumbers).toEqual(["2", "10", "20", "23"]);
    expect(agg.totalSeconds).toBeGreaterThan(400);
    for (const x of scenes) expect(x.pageEnd).toBeGreaterThanOrEqual(x.pageStart);
  });
  it("parses the A4 sample with different margins and auto-numbers it", async () => {
    const { scenes } = parseScreenplay(await extractPages(pdf("sample-a4")));
    expect(scenes.map((x) => x.number)).toEqual(["1", "2", "3"]);
    expect(scenes.map((x) => x.characters.map((c) => c.name))).toEqual([["ANI", "RAHMAT"], ["ANI"], ["RAHMAT", "ANI"]]);
  });
  it("parses the real-export-like sample: watermark, header, margin numbers, revisions, modifiers, group cues, OMITTED", async () => {
    const pages = await extractPages(pdf("sample-real-like"));
    expect(pages.flatMap((p) => p.lines).some((l) => /CONFIDENTIAL|Screenplay/.test(l.text))).toBe(false);
    const { scenes, warnings } = parseScreenplay(pages);
    expect(scenes.map((x) => x.number)).toEqual(["1", "2", "3", "5", "6", "7", "8"]); // every heading found, 4 is OMITTED
    expect(scenes.map((x) => x.heading)[0]).toBe("EXT. DERMAGA TUA - SORE");
    expect(scenes.map((x) => x.timeOfDay)).toEqual(["SORE", "MALAM", "MALAM", "MALAM", "SUBUH", "SUBUH", "SUBUH"]);
    expect(scenes[3]).toMatchObject({ intExt: "EXT", location: "DERMAGA TUA" }); // ANOTHER ANGLE split off
    expect(scenes[1].characters.map((c) => c.name)).toEqual(["JOKO", "SITI", "MBOK RANI"]); // group cue, SUPER dropped, TITLE IN : name
    const names = aggregate(scenes, pages.length).characters.map((c) => c.name);
    expect(names.filter((n) => n.startsWith("JOKO"))).toEqual(["JOKO"]); // "JOKO *" merged
    expect(names.some((n) => /[*&,]|SUPER/.test(n))).toBe(false);
    expect(warnings).toEqual(["1 adegan OMITTED: 4"]);
  });
  it.skipIf(!process.env.REAL_SCRIPT_PDF || !existsSync(process.env.REAL_SCRIPT_PDF))("local-only: a real Final Draft export keeps loose invariants", async () => {
    const buf = new Uint8Array(readFileSync(process.env.REAL_SCRIPT_PDF!));
    const { scenes, warnings } = parseScreenplay(await extractPages(buf));
    expect(scenes.length).toBeGreaterThanOrEqual(112);
    const omitted = new Set((warnings.find((w) => /OMITTED/.test(w)) ?? "").replace(/^.*?:/, "").split(",").map((n) => n.trim()).filter(Boolean));
    const printed = new Set(scenes.map((x) => parseInt(x.number, 10)));
    const max = Math.max(...printed);
    for (let n = 1; n <= max; n++) expect(printed.has(n) || omitted.has(String(n))).toBe(true);
    expect(scenes.flatMap((x) => x.characters).some((c) => c.name.includes("*"))).toBe(false);
    expect(scenes.every((x) => x.location)).toBe(true);
  });
  it("rejects a non-screenplay PDF, garbage bytes and oversize files", async () => {
    expect(() => parseScreenplay([])).toThrow(/Naskah tidak dikenali/);
    await expect(extractPages(pdf("not-a-script")).then(parseScreenplay)).rejects.toThrow(/Naskah tidak dikenali/);
    await expect(extractPages(new TextEncoder().encode("bukan pdf"))).rejects.toThrow(/Naskah tidak dikenali/);
    await expect(extractPages(new Uint8Array(4 * 1024 * 1024 + 1))).rejects.toThrow(/terlalu besar/);
  });
});

describe("aggregate", () => {
  const sc2 = (number: string, location: string, tod: string, secs: number, chars: [string, number][]) => ({ number, intExt: "INT", location, timeOfDay: tod, pageStart: 1, pageEnd: 2, estSeconds: secs, characters: chars.map(([name, blocks]) => ({ name, blocks })) });
  it("groups characters and locations with their scenes", () => {
    const a = aggregate([sc2("1", "RUMAH - DAPUR", "PAGI", 30, [["BUDI", 2]]), sc2("2", "RUMAH - TAMU", "MALAM", 60, [["BUDI", 1], ["SARI", 4]]), sc2("3", "", "", 10, [])], 5);
    expect(a).toMatchObject({ totalScenes: 3, totalSeconds: 100, dialogueBlocks: 7, day: 1, night: 1 });
    expect(a.characters).toEqual([{ name: "SARI", scenes: 1, blocks: 4, sceneNumbers: ["2"] }, { name: "BUDI", scenes: 2, blocks: 3, sceneNumbers: ["1", "2"] }]);
    expect(a.locations[0]).toEqual({ place: "RUMAH", scenes: 2, seconds: 90, sceneNumbers: ["1", "2"] });
    expect(a.locations[1].place).toBe("(tanpa lokasi)");
  });
});

describe("script service", () => {
  let db: Db, sup: string, asst: string, outsider: string, projectId: string;
  const input = async () => {
    const { scenes, pages } = parseScreenplay(await extractPages(pdf("sample-letter")));
    return { title: "Draft 1", sourceName: "sample.pdf", pages, scenes };
  };
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
  });

  it("only supervisors import; one audit entry; any member can read; outsiders are not members", async () => {
    await expect(sc.importScript(db, asst, projectId, await input())).rejects.toBeInstanceOf(ForbiddenError);
    const r = await sc.importScript(db, sup, projectId, await input());
    expect(r.scenes).toBe(25);
    const log = (await s.listActivity(db, projectId)).filter((a) => a.entry.entity === "script");
    expect(log).toHaveLength(1);
    const data = await sc.getScript(db, projectId, r.scriptId);
    expect(data!.scenes).toHaveLength(25);
    expect(data!.scenes[12].number).toBe("12A");
    expect(data!.aggregate.characters[0].name).toBe("BUDI");
    expect((await sc.listScripts(db, projectId)).map((x) => x.title)).toEqual(["Draft 1"]);
    expect(await s.getRole(db, asst, projectId)).toBe("assistant");
    expect(await s.getRole(db, outsider, projectId)).toBeNull();
    expect(await sc.getScript(db, projectId, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await sc.getScript(db, projectId, "")).toBeNull();
  });

  it("validates imports and never trusts the client", async () => {
    const base = await input();
    await expect(sc.importScript(db, sup, projectId, { ...base, scenes: [] })).rejects.toBeInstanceOf(s.InputError);
    await expect(sc.importScript(db, sup, projectId, { ...base, pages: 9999 })).rejects.toBeInstanceOf(s.InputError);
    await expect(sc.importScript(db, sup, projectId, { ...base, scenes: [{ ...base.scenes[0], timeOfDay: "x" }] })).rejects.toBeInstanceOf(s.InputError);
    await expect(sc.importScript(db, sup, projectId, { ...base, scenes: Array(1501).fill(base.scenes[0]) })).rejects.toBeInstanceOf(s.InputError);
  });

  it("edits, deletes and records; assistants cannot", async () => {
    const [script] = await sc.listScripts(db, projectId);
    const scene = (await sc.getScript(db, projectId, script.id))!.scenes[0];
    await expect(sc.updateScene(db, asst, projectId, scene.id, { notes: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.deleteScene(db, asst, projectId, scene.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.deleteScript(db, asst, projectId, script.id)).rejects.toBeInstanceOf(ForbiddenError);
    await sc.updateScene(db, sup, projectId, scene.id, { location: "jalan baru", timeOfDay: "MALAM", notes: "cek izin" });
    await expect(sc.updateScene(db, sup, projectId, scene.id, { timeOfDay: "SIANGAN" })).rejects.toBeInstanceOf(s.InputError);
    const after = (await sc.getScript(db, projectId, script.id))!.scenes[0];
    expect(after).toMatchObject({ location: "JALAN BARU", timeOfDay: "MALAM", notes: "cek izin" });
    await sc.deleteScene(db, sup, projectId, scene.id);
    expect((await sc.getScript(db, projectId, script.id))!.scenes).toHaveLength(24);
    await sc.deleteScript(db, sup, projectId, script.id);
    expect(await sc.getScript(db, projectId, script.id)).toBeNull();
    const entries = await db.select().from(auditLog);
    expect(entries.filter((e) => e.entity.startsWith("script")).map((e) => `${e.entity}:${e.action}`)).toEqual(
      expect.arrayContaining(["script:create", "script_scene:update", "script_scene:delete", "script:delete"]),
    );
  });

  it("never exposes scripts to view-only links", async () => {
    await sc.importScript(db, sup, projectId, await input());
    const { token } = await s.createShareLink(db, sup, projectId, "Klien");
    const data = await s.getViewerData(db, token);
    expect(data).not.toBeNull();
    expect(Object.keys(data!).filter((k) => /script|scene|naskah/i.test(k))).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("JALAN RAYA");
  });
});

describe("suggestTags", () => {
  const kinds = (lines: string[], cues: string[] = []) => suggestTags(lines, cues).map((t) => t.kind);
  it("suggests each kind from English and Indonesian words", () => {
    expect(kinds(["Sebuah ledakan besar."])).toEqual(["vfx"]);
    expect(kinds(["CGI creature appears", "green screen"])).toEqual(["vfx"]);
    expect(kinds(["Dia menyanyi pelan."])).toEqual(["musik"]);
    expect(kinds(["MONTAGE: persiapan"])).toEqual(["musik"]);
    expect(kinds(["Suara hujan deras dan petir."])).toEqual(["sound"]);
    expect(kinds(["FLASHBACK - tahun 1998"])).toEqual(["grading"]);
    expect(kinds(["Dia bermimpi. MIMPI Budi."])).toEqual(["grading"]);
    expect(kinds(["SUPER: Jakarta, 1998"])).toEqual(["grafis"]);
    expect(kinds(["Layar HP: pesan SMS masuk."])).toEqual(["grafis"]);
    expect(kinds([], ["BUDI (V.O.)"])).toEqual(["adr"]);
    expect(kinds([], ["SARI (O.S.)"])).toEqual(["adr"]);
    expect(kinds([], ["NARATOR"])).toEqual(["adr"]);
    expect(kinds([], ["SUARA"])).toEqual(["adr"]);
  });
  it("matches whole words only and only the right cues for ADR", () => {
    expect(kinds(["Ia membaca hujanan kata.", "chatting dengan teman", "musikal dan lagunya"])).toEqual([]);
    expect(kinds(["Terdengar suara anak-anak."])).toEqual([]); // "suara" in action is not a voice cue
    expect(kinds([], ["BUDI", "SARI (CONT'D)"])).toEqual([]);
  });
  it("gives one tag per kind, keeping only the short keyword", () => {
    const tags = suggestTags(["Ledakan pertama.", "LEDAKAN kedua dan VFX lain, sebuah kalimat panjang yang tidak boleh disimpan."], ["BUDI (V.O.)", "SARI (OFF)"]);
    expect(tags.map((t) => t.kind)).toEqual(["vfx", "adr"]);
    expect(tags[0]).toMatchObject({ keyword: "LEDAKAN", auto: true, note: "" });
    const json = JSON.stringify(tags);
    expect(json).not.toContain("kalimat");
    expect(json).not.toContain("pertama");
  });
  it("is wired into the parser", () => {
    const rows: [string, number][] = [["INT. RUMAH - SIANG", 108], ["Ledakan mengguncang rumah.", 108], ["BUDI (V.O.)", 266], ["Halo.", 180]];
    const { scenes } = parseScreenplay(synth([...rows, ["INT. B - DAY", 108], ["Biasa.", 108]]));
    expect(scenes[0].postTags.map((t) => t.kind)).toEqual(["vfx", "adr"]);
    expect(scenes[1].postTags).toEqual([]);
  });
});

describe("default phase link", () => {
  const ph = (...names: string[]) => names.map((name, i) => ({ id: `p${i}`, name }));
  it("links when exactly one phase fits, otherwise none", () => {
    expect(defaultPhase("vfx", ph("Offline", "VFX", "Color Grading"))).toBe("p1");
    expect(defaultPhase("grading", ph("Offline", "VFX", "Color Grading"))).toBe("p2");
    expect(defaultPhase("musik", ph("Offline", "Music Composing"))).toBe("p1");
    expect(defaultPhase("adr", ph("Sound Design", "Offline"))).toBe("p0");
    expect(defaultPhase("vfx", ph("Offline", "Color"))).toBeNull(); // zero
    expect(defaultPhase("grafis", ph("VFX", "Online Edit"))).toBeNull(); // many
    expect(defaultPhase("lainnya", ph("VFX"))).toBeNull();
  });
});

describe("post tags service", () => {
  let db: Db, sup: string, asst: string, projectId: string, scriptId: string, vfxPhase: string, soundPhase: string, gradePhase: string;
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup2@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst2@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sched.addTrack(db, sup, projectId, { name: "Post", template: "empty", startDate: "2026-03-02" });
    const track = (await sched.getSchedule(db, projectId, { includeInternal: true })).tracks[0];
    const add = async (name: string, a: string, b: string) => { await sched.addItem(db, sup, projectId, { trackId: track.id, parentId: null, name, startDate: a, dueDate: b }); };
    await add("VFX", "2026-04-01", "2026-04-20"); await add("Sound Design", "2026-04-10", "2026-04-30"); await add("Color Grading", "2026-05-01", "2026-05-10");
    const phases = await sc.listPhases(db, projectId);
    [vfxPhase, soundPhase, gradePhase] = ["VFX", "Sound Design", "Color Grading"].map((n) => phases.find((p) => p.name === n)!.id);
    const { scenes, pages } = parseScreenplay(await extractPages(pdf("sample-letter")));
    scriptId = (await sc.importScript(db, sup, projectId, { title: "Draft", sourceName: "a.pdf", pages, scenes })).scriptId;
  });
  const scenes = async () => (await sc.getScript(db, projectId, scriptId))!.scenes;

  it("stores keyword-only suggestions linked to the single matching phase", async () => {
    const all = await scenes();
    const tagged = all.filter((x) => x.postTags.length);
    expect(tagged.length).toBeGreaterThan(0);
    for (const x of tagged) for (const t of x.postTags) {
      expect(t.auto).toBe(true);
      expect(JSON.stringify(t).length).toBeLessThan(160); // keyword, no sentences
      if (t.kind === "vfx") expect(t.itemId).toBe(vfxPhase);
      if (t.kind === "grading") expect(t.itemId).toBe(gradePhase);
      if (t.kind === "sound" || t.kind === "adr") expect(t.itemId).toBe(soundPhase);
    }
  });
  it("only supervisors edit tags; assistants can read", async () => {
    const [a] = await scenes();
    await expect(sc.setTags(db, asst, projectId, [a.id], { kind: "vfx" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.confirmTag(db, asst, projectId, a.id, "vfx")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.removeTag(db, asst, projectId, a.id, "vfx")).rejects.toBeInstanceOf(ForbiddenError);
    expect((await sc.getScript(db, projectId, scriptId))!.scenes).toHaveLength(25);
    expect((await sc.getPhaseNeeds(db, projectId))!.scriptId).toBe(scriptId);
  });
  it("confirms, relinks, clears and removes a tag, with record() entries", async () => {
    const [a] = await scenes();
    await sc.setTags(db, sup, projectId, [a.id], { kind: "musik", note: "lagu tema", itemId: null });
    expect((await scenes())[0].postTags.find((t) => t.kind === "musik")).toMatchObject({ auto: false, note: "lagu tema", itemId: null });
    await sc.setTags(db, sup, projectId, [a.id], { kind: "musik", note: "lagu tema", itemId: soundPhase });
    expect((await scenes())[0].postTags.filter((t) => t.kind === "musik")).toEqual([{ kind: "musik", note: "lagu tema", auto: false, itemId: soundPhase }]); // one per kind
    await expect(sc.setTags(db, sup, projectId, [a.id], { kind: "musik", itemId: "00000000-0000-0000-0000-000000000000" })).rejects.toBeInstanceOf(s.InputError);
    await expect(sc.setTags(db, sup, projectId, [a.id], { kind: "bogus" })).rejects.toBeInstanceOf(s.InputError);
    const sug = (await scenes()).find((x) => x.postTags.some((t) => t.auto))!;
    const kind = sug.postTags.find((t) => t.auto)!.kind;
    await sc.confirmTag(db, sup, projectId, sug.id, kind);
    expect((await scenes()).find((x) => x.id === sug.id)!.postTags.find((t) => t.kind === kind)!.auto).toBe(false);
    await sc.removeTag(db, sup, projectId, sug.id, kind);
    expect((await scenes()).find((x) => x.id === sug.id)!.postTags.some((t) => t.kind === kind)).toBe(false);
    await expect(sc.removeTag(db, sup, projectId, sug.id, kind)).rejects.toBeInstanceOf(s.InputError);
    const log = (await db.select().from(auditLog)).filter((e) => e.entity === "script_scene").map((e) => e.summary);
    expect(log.some((m) => /tag Musik diatur/.test(m))).toBe(true);
    expect(log.some((m) => /dikonfirmasi/.test(m))).toBe(true);
    expect(log.some((m) => /dihapus/.test(m))).toBe(true);
  });
  it("adds a tag to several scenes at once with one audit entry; unknown scenes are rejected", async () => {
    const ids = (await scenes()).slice(0, 3).map((x) => x.id);
    const before = (await db.select().from(auditLog)).length;
    await sc.setTags(db, sup, projectId, ids, { kind: "grafis", note: "teks layar" });
    expect((await scenes()).slice(0, 3).every((x) => x.postTags.some((t) => t.kind === "grafis" && !t.auto && t.note === "teks layar"))).toBe(true);
    expect((await db.select().from(auditLog)).length).toBe(before + 1);
    await expect(sc.setTags(db, sup, projectId, [ids[0], "00000000-0000-0000-0000-000000000000"], { kind: "vfx" })).rejects.toBeInstanceOf(s.InputError);
    await expect(sc.setTags(db, sup, projectId, [], { kind: "vfx" })).rejects.toBeInstanceOf(s.InputError);
  });
  it("computes post needs per kind and 'Adegan terkait' per phase", async () => {
    const all = await scenes();
    const phases = await sc.listPhases(db, projectId);
    const needs = postNeeds(all, phases);
    const musik = needs.find((n) => n.kind === "musik")!;
    expect(musik.scenes).toBeGreaterThan(0);
    expect(musik.numbers).toContain(all[0].number);
    expect(musik.phases.map((p) => p.name)).toContain("Sound Design");
    const grafis = needs.find((n) => n.kind === "grafis")!;
    expect(grafis.phases.map((p) => p.name)).toEqual(["VFX"]); // /vfx|graphic|grafis|online/ fits one phase only
    const by = needsByPhase(all);
    expect(by[soundPhase].find((n) => n.kind === "musik")).toEqual({ kind: "musik", scenes: 1, seconds: all[0].estSeconds, numbers: [all[0].number] }); // only the scene linked by hand; other musik tags have no phase
    expect(musik.unlinked).toBe(musik.scenes - 1);
    expect((await sc.getPhaseNeeds(db, projectId))!.byPhase[soundPhase]).toEqual(by[soundPhase]);
    expect(postNeeds([{ number: "1", estSeconds: 10, postTags: [{ kind: "vfx", note: "", auto: false, itemId: "gone" }] }], phases)[0]).toMatchObject({ unlinked: 1, phases: [] });
  });
  it("exports the post CSV (type=post columns), one row per tag", async () => {
    const all = await scenes();
    const rows = postCsvRows(all, await sc.listPhases(db, projectId));
    expect(rows[0]).toEqual(["Jenis", "Adegan", "Judul", "Perkiraan durasi", "Catatan", "Fase terkait", "Status tag"]);
    expect(rows.length - 1).toBe(all.reduce((n, x) => n + x.postTags.length, 0));
    expect(rows).toContainEqual(["Musik", all[0].number, all[0].heading, expect.stringMatching(/^\d+:\d\d$/), "lagu tema", "Sound Design (Post)", "Dikonfirmasi"]);
    expect(rows.some((r) => r[6] === "Saran" && /^Kata kunci: /.test(r[4]))).toBe(true);
  });
  it("keeps tags and scripts out of view-only data and out of an empty project", async () => {
    const { token } = await s.createShareLink(db, sup, projectId, "Klien");
    const data = await s.getViewerData(db, token);
    expect(Object.keys(data!).filter((k) => /script|scene|naskah|tag|post/i.test(k))).toEqual([]);
    const text = JSON.stringify(data);
    for (const w of ["postTags", "LEDAKAN", "teks layar", "lagu tema"]) expect(text).not.toContain(w);
    const p2 = (await s.createProject(db, sup, { name: "Kosong", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    expect(await sc.getPhaseNeeds(db, p2)).toBeNull();
  });
});
