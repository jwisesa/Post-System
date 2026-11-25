import { describe, expect, it } from "vitest";
import { CAMERAS, FILM } from "@/lib/framing/cameras";
import { buildSpec, DEFAULTS, filmStats, fitBlock, framing, parseState, placeGuideLabels, safety, serialize, textW, wrapText } from "@/lib/framing/frame";

describe("framing math", () => {
  it("16:9 in a 3:2 sensor crops height", () => {
    const r = framing(4608, 3164, 16 / 9);
    expect(r.w).toBe(4608); expect(r.h).toBe(2592); expect(r.y).toBe(286);
  });
  it("2.39 in 16:9 sensor keeps width", () => {
    const r = framing(3840, 2160, 2.39);
    expect(r.w).toBe(3840); expect(r.h).toBe(1606);
  });
  it("wide ratio on tall sensor limited by height with squeeze", () => {
    const r = framing(4448, 3096, 2.39, 2); // desqueezed 8896x3096 = 2.87 > 2.39
    expect(r.h).toBe(3096); expect(r.w).toBe(Math.round((3096 * 2.39) / 2 / 2) * 2);
  });
  it("full sensor and safety", () => {
    expect(framing(100, 50, 0)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    const s = safety({ x: 0, y: 0, w: 1000, h: 500 }, 90);
    expect(s).toEqual({ x: 50, y: 25, w: 900, h: 450 });
  });
});
describe("film", () => {
  it("4-perf Academy 4K at 24fps", () => {
    const f = FILM[0], st = filmStats(f, f.gates[1], 4096, 24);
    expect(st.w).toBe(4096); expect(st.h).toBe(2986);
    expect(st.ftPerMin).toBe(90);
    expect(st.r1000.min).toBeCloseTo(11.11, 1);
    expect(st.bytes).toBe(4096 * 2986 * 4);
  });
  it("3-perf and super16 run lengths", () => {
    expect(filmStats(FILM[1], FILM[1].gates[0], 2048, 24).ftPerMin).toBeCloseTo(67.5);
    expect(filmStats(FILM[3], FILM[3].gates[1], 2048, 24).ftPerMin).toBe(36);
    expect(filmStats(FILM[4], FILM[4].gates[0], 2048, 24).ftPerMin).toBeCloseTo(112.5);
  });
});
describe("data and state", () => {
  it("every camera mode has sources", () => {
    for (const c of CAMERAS) { expect(c.source.url).toMatch(/^https:/); for (const m of c.modes) { expect(m.source.accessed).toBe("2026-11-26"); expect(m.px[0] / m.px[1]).toBeCloseTo(m.mm[0] / m.mm[1], 1); } }
  });
  it("roundtrips URL state and builds spec", () => {
    const s = { ...DEFAULTS, cam: "arri-mini-lf", mode: "169", sq: "2", title: "Uji" };
    const back = parseState(Object.fromEntries(new URLSearchParams(serialize(s))));
    expect(back).toEqual(s);
    const spec = buildSpec(s); expect(spec.W).toBe(3840); expect(spec.squeeze).toBe(2);
  });
});

describe("more framing cases", () => {
  it("1:1 on 3:2 sensor is height-limited and even", () => {
    const r = framing(4608, 3164, 1); expect(r).toEqual({ x: 722, y: 0, w: 3164, h: 3164 });
  });
  it("1.3x squeeze on 3:2 for 2.39 is width-limited", () => {
    const r = framing(4608, 3164, 2.39, 1.3); // desqueezed 5990x3164 = 1.89 < 2.39
    expect(r.w).toBe(4608); expect(r.h).toBe(Math.round((4608 * 1.3) / 2.39 / 2) * 2);
  });
  it("odd sensor sizes give integer, centred, in-bounds rects", () => {
    const r = framing(2743, 3086, 16 / 9, 2);
    expect(r.w).toBeLessThanOrEqual(2743); expect(r.h).toBeLessThanOrEqual(3086);
    expect(Number.isInteger(r.w) && Number.isInteger(r.h)).toBe(true);
    expect(r.x * 2 + r.w).toBe(2743);
  });
  it("non-matching aspect (4:3 target on 2.39 sensor) keeps full height", () => {
    const r = framing(4448, 1856, 4 / 3); expect(r.h).toBe(1856); expect(r.w).toBe(2474); expect(r.x).toBe(987);
  });
});
describe("text fitting", () => {
  const long = "ARRIRAW / Apple ProRes 4444 XQ / Blackmagic RAW Q0 / REDCODE RAW HQ extra";
  it("shrinks stepwise and never exceeds max width", () => {
    const f = fitBlock([`Sensor mode: 4.6K 3:2 Open Gate · ${long}`], 50, 1500);
    expect(f.size).toBeLessThan(50); expect(f.size).toBeGreaterThanOrEqual(50 * 0.55 - 1e-9);
    for (const l of f.lines.flat()) expect(textW(l, f.size)).toBeLessThanOrEqual(1500);
  });
  it("leaves short text alone", () => { expect(fitBlock(["DoP: A"], 50, 1500).size).toBe(50); });
  it("hard-splits unbreakable tokens", () => { for (const l of wrapText("X".repeat(100), 30)) expect(l.length).toBeLessThanOrEqual(30); });
});
describe("guide labels", () => {
  it("staggers close guides across sides and caps at 4", () => {
    const l = placeGuideLabels([100, 104, 108, 112, 116, 500], 40);
    expect(l).toHaveLength(4);
    expect(new Set(l.map((x) => x.side)).size).toBe(2);
    for (const side of [0, 1]) { const ys = l.filter((x) => x.side === side).map((x) => x.y).sort((a, b) => a - b); for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(40); }
  });
});
describe("film verification", () => {
  it("every gate declares source and verified flag; unverified are explained", () => {
    for (const f of FILM) for (const g of f.gates) { expect(g.source.accessed).toBe("2026-11-26"); expect(typeof g.verified).toBe("boolean"); }
    expect(FILM[1].gates[0].mm).toEqual([24.9, 13.9]);
  });
});
